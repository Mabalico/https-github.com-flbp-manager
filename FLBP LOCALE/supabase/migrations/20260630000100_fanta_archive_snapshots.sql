-- Persist final FantaBeerpong standings when a real tournament is archived.
-- The previous archive UI derived history from live calculation views; this
-- additive snapshot keeps concluded Fanta editions stable and backfills old
-- archived tournaments that already have Fanta teams.

create table if not exists public.fanta_archived_editions (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  tournament_id text not null,
  tournament_name text not null,
  start_date timestamptz,
  archived_at timestamptz not null default now(),
  winner_team_id uuid,
  winner_team_name text,
  winner_points integer not null default 0,
  teams_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id)
);

create table if not exists public.fanta_archived_standings (
  workspace_id text not null,
  tournament_id text not null,
  team_id uuid not null,
  user_id uuid,
  rank integer not null,
  team_name text not null,
  total_points integer not null default 0,
  live_points integer not null default 0,
  points_from_goals integer not null default 0,
  points_from_blows integer not null default 0,
  points_from_wins integer not null default 0,
  bonus_scia integer not null default 0,
  players_in_game integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id, team_id),
  foreign key (workspace_id, tournament_id)
    references public.fanta_archived_editions(workspace_id, tournament_id)
    on delete cascade
);

create table if not exists public.fanta_archived_players (
  workspace_id text not null,
  tournament_id text not null,
  player_id text not null,
  rank integer not null,
  player_name text not null,
  real_team_id text,
  real_team_name text,
  total_points integer not null default 0,
  live_points integer not null default 0,
  points_from_goals integer not null default 0,
  points_from_blows integer not null default 0,
  points_from_wins integer not null default 0,
  bonus_scia integer not null default 0,
  selected_by_teams integer not null default 0,
  status text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id, player_id),
  foreign key (workspace_id, tournament_id)
    references public.fanta_archived_editions(workspace_id, tournament_id)
    on delete cascade
);

alter table public.fanta_archived_editions enable row level security;
alter table public.fanta_archived_standings enable row level security;
alter table public.fanta_archived_players enable row level security;

drop policy if exists "public_read" on public.fanta_archived_editions;
create policy "public_read" on public.fanta_archived_editions
  for select using (true);

drop policy if exists "public_read" on public.fanta_archived_standings;
create policy "public_read" on public.fanta_archived_standings
  for select using (true);

drop policy if exists "public_read" on public.fanta_archived_players;
create policy "public_read" on public.fanta_archived_players
  for select using (true);

drop policy if exists "admin_all" on public.fanta_archived_editions;
create policy "admin_all" on public.fanta_archived_editions
  for all using (public.flbp_is_admin()) with check (public.flbp_is_admin());

drop policy if exists "admin_all" on public.fanta_archived_standings;
create policy "admin_all" on public.fanta_archived_standings
  for all using (public.flbp_is_admin()) with check (public.flbp_is_admin());

drop policy if exists "admin_all" on public.fanta_archived_players;
create policy "admin_all" on public.fanta_archived_players
  for all using (public.flbp_is_admin()) with check (public.flbp_is_admin());

grant select on public.fanta_archived_editions to anon, authenticated;
grant select on public.fanta_archived_standings to anon, authenticated;
grant select on public.fanta_archived_players to anon, authenticated;

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
    'players_count', v_player_count
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
