-- Persist the per-team Fanta roster when a Fanta edition is archived.
-- Previous archive snapshots stored edition, standings and player rankings,
-- but team detail pages still depended on the live roster view. This additive
-- snapshot keeps archived team rosters stable after the live tournament changes.

create table if not exists public.fanta_archived_rosters (
  workspace_id text not null,
  tournament_id text not null,
  team_id uuid not null,
  user_id uuid,
  team_name text not null,
  player_id text not null,
  player_name text not null,
  real_team_id text,
  real_team_name text,
  role text not null default 'starter',
  status text,
  total_points integer not null default 0,
  live_points integer not null default 0,
  raw_goals integer not null default 0,
  raw_blows integer not null default 0,
  raw_wins integer not null default 0,
  points_from_goals integer not null default 0,
  points_from_blows integer not null default 0,
  points_from_wins integer not null default 0,
  points_from_scia integer not null default 0,
  bonus_scia integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id, team_id, player_id),
  foreign key (workspace_id, tournament_id)
    references public.fanta_archived_editions(workspace_id, tournament_id)
    on delete cascade
);

alter table public.fanta_archived_rosters enable row level security;

drop policy if exists "public_read" on public.fanta_archived_rosters;
create policy "public_read" on public.fanta_archived_rosters
  for select using (true);

drop policy if exists "admin_all" on public.fanta_archived_rosters;
create policy "admin_all" on public.fanta_archived_rosters
  for all using (public.flbp_is_admin()) with check (public.flbp_is_admin());

grant select on public.fanta_archived_rosters to anon, authenticated;

create or replace function public.flbp_archive_fanta_tournament_internal(
  p_workspace_id text,
  p_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_tournament_id text := nullif(trim(p_tournament_id), '');
  v_tournament_name text;
  v_start_date timestamptz;
  v_team_count integer := 0;
  v_player_count integer := 0;
  v_roster_count integer := 0;
  v_winner record;
begin
  if v_tournament_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'missing_tournament_id');
  end if;

  select count(*)::integer
  into v_team_count
  from public.fanta_live_standings
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  if coalesce(v_team_count, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'no_fanta_teams',
      'tournament_id', v_tournament_id
    );
  end if;

  select t.name, t.start_date
  into v_tournament_name, v_start_date
  from public.tournaments t
  where t.workspace_id = v_workspace_id
    and t.id = v_tournament_id
  limit 1;

  if v_tournament_name is null then
    select t.name, t.start_date
    into v_tournament_name, v_start_date
    from public.public_tournaments t
    where t.workspace_id = v_workspace_id
      and t.id = v_tournament_id
    limit 1;
  end if;

  if v_tournament_name is null then
    select e.tournament_name, e.start_date
    into v_tournament_name, v_start_date
    from public.fanta_archived_editions e
    where e.workspace_id = v_workspace_id
      and e.tournament_id = v_tournament_id
    limit 1;
  end if;

  v_tournament_name := coalesce(nullif(v_tournament_name, ''), 'FantaBeerpong');

  insert into public.fanta_archived_editions (
    workspace_id,
    tournament_id,
    tournament_name,
    start_date,
    archived_at,
    teams_count,
    updated_at
  )
  values (
    v_workspace_id,
    v_tournament_id,
    v_tournament_name,
    v_start_date,
    now(),
    v_team_count,
    now()
  )
  on conflict (workspace_id, tournament_id) do update
  set tournament_name = excluded.tournament_name,
      start_date = excluded.start_date,
      archived_at = excluded.archived_at,
      teams_count = excluded.teams_count,
      updated_at = excluded.updated_at;

  delete from public.fanta_archived_rosters
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  delete from public.fanta_archived_players
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  delete from public.fanta_archived_standings
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  insert into public.fanta_archived_standings (
    workspace_id,
    tournament_id,
    team_id,
    user_id,
    rank,
    team_name,
    total_points,
    live_points,
    points_from_goals,
    points_from_blows,
    points_from_wins,
    bonus_scia,
    players_in_game
  )
  select
    workspace_id,
    tournament_id,
    team_id,
    user_id,
    row_number() over (
      order by total_points desc, players_in_game desc, points_from_wins desc, points_from_goals desc, team_name asc
    )::integer as rank,
    coalesce(nullif(team_name, ''), 'N/D') as team_name,
    coalesce(total_points, 0)::integer,
    coalesce(live_points, 0)::integer,
    coalesce(points_from_goals, 0)::integer,
    coalesce(points_from_blows, 0)::integer,
    coalesce(points_from_wins, 0)::integer,
    coalesce(bonus_scia, 0)::integer,
    coalesce(players_in_game, 0)::integer
  from public.fanta_live_standings
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  insert into public.fanta_archived_rosters (
    workspace_id,
    tournament_id,
    team_id,
    user_id,
    team_name,
    player_id,
    player_name,
    real_team_id,
    real_team_name,
    role,
    status,
    total_points,
    live_points,
    raw_goals,
    raw_blows,
    raw_wins,
    points_from_goals,
    points_from_blows,
    points_from_wins,
    points_from_scia,
    bonus_scia
  )
  select
    workspace_id,
    tournament_id,
    team_id,
    user_id,
    coalesce(nullif(team_name, ''), 'N/D') as team_name,
    coalesce(nullif(player_id, ''), md5(coalesce(player_name, '') || ':' || coalesce(real_team_id, ''))) as player_id,
    coalesce(nullif(player_name, ''), 'N/D') as player_name,
    real_team_id,
    real_team_name,
    coalesce(nullif(role, ''), 'starter') as role,
    status,
    coalesce(total_points, 0)::integer,
    coalesce(live_points, total_points, 0)::integer,
    coalesce(raw_goals, 0)::integer,
    coalesce(raw_blows, 0)::integer,
    coalesce(raw_wins, 0)::integer,
    coalesce(points_from_goals, 0)::integer,
    coalesce(points_from_blows, 0)::integer,
    coalesce(points_from_wins, 0)::integer,
    coalesce(points_from_scia, 0)::integer,
    coalesce(bonus_scia, points_from_scia, 0)::integer
  from public.fanta_roster_live_rows
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  get diagnostics v_roster_count = row_count;

  insert into public.fanta_archived_players (
    workspace_id,
    tournament_id,
    player_id,
    rank,
    player_name,
    real_team_id,
    real_team_name,
    total_points,
    live_points,
    points_from_goals,
    points_from_blows,
    points_from_wins,
    bonus_scia,
    selected_by_teams,
    status
  )
  select
    workspace_id,
    tournament_id,
    player_key,
    row_number() over (
      order by total_points desc, points_from_wins desc, points_from_goals desc, player_name asc
    )::integer as rank,
    coalesce(nullif(player_name, ''), 'N/D') as player_name,
    real_team_id,
    real_team_name,
    coalesce(total_points, 0)::integer,
    coalesce(live_points, 0)::integer,
    coalesce(points_from_goals, 0)::integer,
    coalesce(points_from_blows, 0)::integer,
    coalesce(points_from_wins, 0)::integer,
    coalesce(bonus_scia, 0)::integer,
    coalesce(selected_by_teams, 0)::integer,
    status
  from public.fanta_player_standings
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  get diagnostics v_player_count = row_count;

  select *
  into v_winner
  from public.fanta_archived_standings
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id
    and rank = 1
  limit 1;

  update public.fanta_archived_editions
  set winner_team_id = v_winner.team_id,
      winner_team_name = v_winner.team_name,
      winner_points = coalesce(v_winner.total_points, 0),
      teams_count = v_team_count,
      updated_at = now()
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'tournament_id', v_tournament_id,
    'teams_count', v_team_count,
    'players_count', v_player_count,
    'roster_count', v_roster_count
  );
end;
$$;

revoke all on function public.flbp_archive_fanta_tournament_internal(text, text) from public, anon, authenticated;

create or replace function public.flbp_archive_fanta_tournament(
  p_workspace_id text,
  p_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.flbp_is_admin() then
    raise exception 'Admin privileges required';
  end if;

  return public.flbp_archive_fanta_tournament_internal(p_workspace_id, p_tournament_id);
end;
$$;

grant execute on function public.flbp_archive_fanta_tournament(text, text) to authenticated;

do $$
declare
  r record;
begin
  for r in
    select distinct workspace_id, tournament_id
    from public.fanta_archived_editions
    union
    select distinct s.workspace_id, s.tournament_id
    from public.fanta_live_standings s
    join public.tournaments t
      on t.workspace_id = s.workspace_id
     and t.id = s.tournament_id
    where t.status = 'archived'
  loop
    perform public.flbp_archive_fanta_tournament_internal(r.workspace_id, r.tournament_id);
  end loop;
end $$;
