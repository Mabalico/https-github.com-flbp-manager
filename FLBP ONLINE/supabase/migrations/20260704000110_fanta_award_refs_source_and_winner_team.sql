-- Add FantaBeerpong final award bonuses.
--
-- Scoring rule:
-- - winner, MVP, top_scorer and defender awards are worth 10 points each.
-- - final awards are flat: Captain does not double them.
-- - Captain doubles only cups and blows. Wins and Bonus Scia stay flat.

alter table if exists public.hall_of_fame_entries
  add column if not exists source_tournament_id text null;

alter table if exists public.public_hall_of_fame_entries
  add column if not exists source_tournament_id text null;

alter table if exists public.fanta_archived_standings
  add column if not exists points_from_awards integer not null default 0;

alter table if exists public.fanta_archived_players
  add column if not exists points_from_awards integer not null default 0;

alter table if exists public.fanta_archived_rosters
  add column if not exists points_from_awards integer not null default 0;

drop view if exists public.fanta_live_standings;
drop view if exists public.fanta_player_standings;
drop view if exists public.fanta_roster_live_rows;

create or replace view public.fanta_roster_live_rows as
with match_winners as (
  select
    m.workspace_id,
    m.tournament_id,
    m.id as match_id,
    m.phase,
    coalesce(m.round, 0) as round_index,
    coalesce(m.order_index, 0) as order_index,
    ((coalesce(m.round, 0) * 10000) + coalesce(m.order_index, 0)) as match_sort,
    case when m.score_a > m.score_b then m.team_a_id when m.score_b > m.score_a then m.team_b_id end as winner_team_id,
    case when m.score_a > m.score_b then m.team_b_id when m.score_b > m.score_a then m.team_a_id end as loser_team_id
  from public.tournament_matches m
  where (m.status = 'finished' or m.played = true)
    and m.hidden = false
    and m.is_bye = false
    and m.team_a_id is not null
    and m.team_b_id is not null
    and m.score_a <> m.score_b
),
stat_totals as (
  select
    workspace_id,
    tournament_id,
    player_key,
    lower(regexp_replace(trim(coalesce(max(player_name), '')), '[[:space:]]+', ' ', 'g')) as player_name_key,
    max(player_name) as player_name,
    max(team_id) as real_team_id,
    sum(canestri)::int as raw_goals,
    sum(soffi)::int as raw_blows
  from public.tournament_match_stats
  where player_key is not null
  group by workspace_id, tournament_id, player_key
),
team_wins as (
  select workspace_id, tournament_id, winner_team_id as real_team_id, count(*)::int as raw_wins
  from match_winners
  where winner_team_id is not null
  group by workspace_id, tournament_id, winner_team_id
),
team_losses as (
  select distinct on (workspace_id, tournament_id, loser_team_id)
    workspace_id,
    tournament_id,
    loser_team_id as real_team_id,
    winner_team_id as eliminated_by_team_id,
    round_index as elimination_round,
    order_index as elimination_order,
    match_sort as elimination_sort
  from match_winners
  where phase = 'bracket'
    and loser_team_id is not null
    and winner_team_id is not null
  order by workspace_id, tournament_id, loser_team_id, round_index, order_index, match_id
),
scia_points as (
  select
    l.workspace_id,
    l.tournament_id,
    l.real_team_id,
    l.eliminated_by_team_id,
    (count(w.match_id) * 5)::int as bonus_scia
  from team_losses l
  left join match_winners w
    on w.workspace_id = l.workspace_id
   and w.tournament_id = l.tournament_id
   and w.winner_team_id = l.eliminated_by_team_id
   and w.match_sort > l.elimination_sort
   and not exists (
     select 1
     from match_winners first_loss
     where first_loss.workspace_id = l.workspace_id
       and first_loss.tournament_id = l.tournament_id
       and first_loss.loser_team_id = l.eliminated_by_team_id
       and first_loss.match_sort > l.elimination_sort
       and first_loss.match_sort <= w.match_sort
   )
  group by l.workspace_id, l.tournament_id, l.real_team_id, l.eliminated_by_team_id
),
award_seed as (
  select
    h.workspace_id,
    coalesce(nullif(trim(coalesce(h.source_tournament_id, '')), ''), h.tournament_id) as tournament_id,
    h.type,
    nullif(trim(coalesce(h.team_name, '')), '') as team_name,
    h.player_names,
    nullif(trim(coalesce(h.player_id, '')), '') as player_id
  from public.hall_of_fame_entries h
  where h.type in ('winner', 'mvp', 'top_scorer', 'defender')
),
award_refs as (
  select
    h.workspace_id,
    h.tournament_id,
    h.type,
    nullif(trim(coalesce(h.player_id, '')), '') as player_id,
    lower(regexp_replace(trim(coalesce(p.player_name, '')), '[[:space:]]+', ' ', 'g')) as player_name_key
  from award_seed h
  cross join lateral unnest(
    case
      when coalesce(array_length(h.player_names, 1), 0) > 0 then h.player_names
      else array[coalesce(h.player_id, '')]
    end
  ) as p(player_name)
  union all
  -- Winner awards can be stored as a team award. Expand the winning team
  -- into its two players so Fanta +10 title points reach the roster rows.
  select
    h.workspace_id,
    h.tournament_id,
    h.type,
    null::text as player_id,
    lower(regexp_replace(trim(coalesce(p.player_name, '')), '[[:space:]]+', ' ', 'g')) as player_name_key
  from award_seed h
  join public.tournament_teams tt
    on tt.workspace_id = h.workspace_id
   and tt.tournament_id = h.tournament_id
   and (
     tt.id = h.team_name
     or lower(regexp_replace(trim(coalesce(tt.name, '')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(trim(coalesce(h.team_name, '')), '[[:space:]]+', ' ', 'g'))
   )
  cross join lateral (
    values (tt.player1), (tt.player2)
  ) as p(player_name)
  where h.type = 'winner'
    and h.team_name is not null
    and trim(coalesce(p.player_name, '')) <> ''
),
roster_base as (
  select
    t.workspace_id,
    t.tournament_id,
    t.id as team_id,
    t.name as team_name,
    t.user_id,
    r.player_id,
    coalesce(nullif(r.player_name, ''), st.player_name, r.player_id) as player_name,
    coalesce(nullif(r.real_team_id, ''), st.real_team_id) as real_team_id,
    r.real_team_name,
    r.role,
    coalesce(st.raw_goals, 0)::int as raw_goals,
    coalesce(st.raw_blows, 0)::int as raw_blows
  from public.fanta_teams t
  join public.fanta_rosters r on r.team_id = t.id
  left join lateral (
    select st.*
    from stat_totals st
    where st.workspace_id = t.workspace_id
      and st.tournament_id = t.tournament_id
      and (
        st.player_key = r.player_id
        or (
          st.real_team_id = nullif(r.real_team_id, '')
          and st.player_name_key = lower(regexp_replace(trim(coalesce(nullif(r.player_name, ''), r.player_id)), '[[:space:]]+', ' ', 'g'))
        )
      )
    order by case when st.player_key = r.player_id then 0 else 1 end
    limit 1
  ) st on true
)
select
  rb.workspace_id,
  rb.tournament_id,
  rb.team_id,
  rb.team_name,
  rb.user_id,
  rb.player_id,
  rb.player_name,
  rb.real_team_id,
  coalesce(nullif(rb.real_team_name, ''), tt.name, 'N/D') as real_team_name,
  rb.role,
  coalesce(rb.raw_goals, 0)::int as raw_goals,
  coalesce(rb.raw_blows, 0)::int as raw_blows,
  coalesce(tw.raw_wins, 0)::int as raw_wins,
  coalesce(sp.bonus_scia, 0)::int as bonus_scia,
  coalesce(ap.raw_points_from_awards, 0)::int as raw_points_from_awards,
  case when tl.real_team_id is null then 'live' else 'eliminated' end as status,
  tl.eliminated_by_team_id,
  elim.name as eliminated_by_team_name,
  case when rb.role = 'captain' then coalesce(rb.raw_goals, 0)::int * 2 else coalesce(rb.raw_goals, 0)::int end as points_from_goals,
  case when rb.role in ('captain','defender') then coalesce(rb.raw_blows, 0)::int * 4 else coalesce(rb.raw_blows, 0)::int * 2 end as points_from_blows,
  (coalesce(tw.raw_wins, 0)::int * 7) as points_from_wins,
  coalesce(sp.bonus_scia, 0)::int as points_from_scia,
  coalesce(ap.raw_points_from_awards, 0)::int as points_from_awards,
  (
    case when rb.role = 'captain' then coalesce(rb.raw_goals, 0)::int * 2 else coalesce(rb.raw_goals, 0)::int end
    + case when rb.role in ('captain','defender') then coalesce(rb.raw_blows, 0)::int * 4 else coalesce(rb.raw_blows, 0)::int * 2 end
    + (coalesce(tw.raw_wins, 0)::int * 7)
    + coalesce(sp.bonus_scia, 0)::int
    + coalesce(ap.raw_points_from_awards, 0)::int
  )::int as total_points,
  (
    case when rb.role = 'captain' then coalesce(rb.raw_goals, 0)::int * 2 else coalesce(rb.raw_goals, 0)::int end
    + case when rb.role in ('captain','defender') then coalesce(rb.raw_blows, 0)::int * 4 else coalesce(rb.raw_blows, 0)::int * 2 end
    + (coalesce(tw.raw_wins, 0)::int * 7)
  )::int as live_points
from roster_base rb
left join public.tournament_teams tt
  on tt.workspace_id = rb.workspace_id
 and tt.tournament_id = rb.tournament_id
 and tt.id = rb.real_team_id
left join team_wins tw
  on tw.workspace_id = rb.workspace_id
 and tw.tournament_id = rb.tournament_id
 and tw.real_team_id = rb.real_team_id
left join team_losses tl
  on tl.workspace_id = rb.workspace_id
 and tl.tournament_id = rb.tournament_id
 and tl.real_team_id = rb.real_team_id
left join scia_points sp
  on sp.workspace_id = rb.workspace_id
 and sp.tournament_id = rb.tournament_id
 and sp.real_team_id = rb.real_team_id
left join lateral (
  select (count(distinct ar.type) * 10)::int as raw_points_from_awards
  from award_refs ar
  where ar.workspace_id = rb.workspace_id
    and ar.tournament_id = rb.tournament_id
    and (
      (ar.player_id is not null and ar.player_id <> '' and ar.player_id = rb.player_id)
      or (
        ar.player_name_key <> ''
        and ar.player_name_key = lower(regexp_replace(trim(coalesce(rb.player_name, '')), '[[:space:]]+', ' ', 'g'))
      )
    )
) ap on true
left join public.tournament_teams elim
  on elim.workspace_id = rb.workspace_id
 and elim.tournament_id = rb.tournament_id
 and elim.id = tl.eliminated_by_team_id;

create or replace view public.fanta_live_standings as
select
  workspace_id,
  tournament_id,
  team_id,
  team_name,
  user_id,
  sum(total_points)::int as total_points,
  sum(live_points)::int as live_points,
  sum(points_from_goals)::int as points_from_goals,
  sum(points_from_blows)::int as points_from_blows,
  sum(points_from_wins)::int as points_from_wins,
  sum(points_from_awards)::int as points_from_awards,
  sum(points_from_scia)::int as bonus_scia,
  count(*) filter (where status <> 'eliminated')::int as players_in_game,
  max(player_name) filter (where role = 'captain') as captain_name,
  count(*) filter (where role = 'defender')::int as defenders_count,
  case when count(*) filter (where status <> 'eliminated') > 0 then 'Live' else 'Stabile' end as status_label
from public.fanta_roster_live_rows
group by workspace_id, tournament_id, team_id, team_name, user_id;

create or replace view public.fanta_player_standings as
with player_rows as (
  select
    workspace_id,
    tournament_id,
    player_id,
    max(player_name) as player_name,
    max(real_team_id) as real_team_id,
    max(real_team_name) as real_team_name,
    max(raw_goals)::int as raw_goals,
    max(raw_blows)::int as raw_blows,
    max(raw_wins)::int as raw_wins,
    max(bonus_scia)::int as bonus_scia,
    max(raw_points_from_awards)::int as points_from_awards,
    max(status) as status,
    max(eliminated_by_team_name) as eliminated_by_team_name,
    count(distinct team_id)::int as selected_by_teams
  from public.fanta_roster_live_rows
  group by workspace_id, tournament_id, player_id
)
select
  workspace_id,
  tournament_id,
  player_id as player_key,
  player_name,
  real_team_id,
  real_team_name,
  raw_goals as points_from_goals,
  raw_blows * 2 as points_from_blows,
  raw_wins * 7 as points_from_wins,
  points_from_awards,
  bonus_scia,
  (raw_goals + (raw_blows * 2) + (raw_wins * 7) + bonus_scia + points_from_awards)::int as total_points,
  (raw_goals + (raw_blows * 2) + (raw_wins * 7))::int as live_points,
  raw_goals,
  raw_blows,
  raw_wins,
  status,
  eliminated_by_team_name,
  selected_by_teams
from player_rows;

grant select on public.fanta_roster_live_rows to anon, authenticated;
grant select on public.fanta_live_standings to anon, authenticated;
grant select on public.fanta_player_standings to anon, authenticated;

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
    points_from_awards,
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
    coalesce(points_from_awards, 0)::integer,
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
    points_from_awards,
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
    coalesce(points_from_awards, 0)::integer,
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
    points_from_awards,
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
    coalesce(points_from_awards, 0)::integer,
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
