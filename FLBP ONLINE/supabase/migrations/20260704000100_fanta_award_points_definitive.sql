--
-- FantaBeerpong final awards, definitive read-time fix.
--
-- Problems covered:
-- 1) fanta_teams must not be deleted by the structured sync when
--    tournaments is rebuilt with delete+insert.
-- 2) archived Fanta snapshots can be created before Hall of Fame rows arrive.
--    Award points are therefore recalculated at read time from Hall of Fame.
-- 3) Hall of Fame rows can reference the original tournament through
--    source_tournament_id, not only tournament_id.
-- 4) winner can be stored as a team award: in that case the winning team is
--    expanded into its players so each selected player gets the flat +10.
--
-- Scoring rule:
-- winner, MVP, top_scorer and defender are worth 10 points each.
-- Final awards are flat: Captain, wins and Bonus Scia do not multiply them.

alter table if exists public.fanta_teams
  drop constraint if exists fanta_teams_tournament_fk;

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

drop view if exists public.fanta_archived_editions_awarded;
drop view if exists public.fanta_archived_standings_awarded;
drop view if exists public.fanta_archived_players_awarded;
drop view if exists public.fanta_archived_rosters_awarded;

drop function if exists public.flbp_fanta_award_points_for_player(text, text, text, text);

create or replace function public.flbp_fanta_award_points_for_player(
  p_workspace_id text,
  p_tournament_id text,
  p_player_id text,
  p_player_name text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
with award_seed as (
  select
    h.workspace_id,
    coalesce(nullif(trim(coalesce(h.source_tournament_id, '')), ''), h.tournament_id) as tournament_id,
    h.type,
    nullif(trim(coalesce(h.team_name, '')), '') as team_name,
    h.player_names,
    nullif(trim(coalesce(h.player_id, '')), '') as player_id
  from public.hall_of_fame_entries h
  where h.workspace_id = p_workspace_id
    and coalesce(nullif(trim(coalesce(h.source_tournament_id, '')), ''), h.tournament_id) = p_tournament_id
    and h.type in ('winner', 'mvp', 'top_scorer', 'defender')
),
award_refs as (
  select
    h.type,
    h.player_id,
    lower(regexp_replace(trim(coalesce(ap.player_name, '')), '[[:space:]]+', ' ', 'g')) as player_name_key
  from award_seed h
  cross join lateral unnest(
    case
      when coalesce(array_length(h.player_names, 1), 0) > 0 then h.player_names
      else array[coalesce(h.player_id, '')]
    end
  ) as ap(player_name)
  where trim(coalesce(ap.player_name, '')) <> ''
     or h.player_id is not null

  union all

  select
    h.type,
    null::text as player_id,
    lower(regexp_replace(trim(coalesce(tp.player_name, '')), '[[:space:]]+', ' ', 'g')) as player_name_key
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
  ) as tp(player_name)
  where h.type = 'winner'
    and h.team_name is not null
    and trim(coalesce(tp.player_name, '')) <> ''
)
select coalesce((count(distinct ar.type) * 10)::int, 0)
from award_refs ar
where trim(coalesce(p_player_name, '')) <> ''
  and (
    (ar.player_id is not null and ar.player_id <> '' and ar.player_id = p_player_id)
    or (
      ar.player_name_key <> ''
      and ar.player_name_key = lower(regexp_replace(trim(coalesce(p_player_name, '')), '[[:space:]]+', ' ', 'g'))
    )
  );
$$;

grant execute on function public.flbp_fanta_award_points_for_player(text, text, text, text) to anon, authenticated;

create or replace view public.fanta_archived_rosters_awarded as
select
  r.workspace_id,
  r.tournament_id,
  r.team_id,
  r.user_id,
  r.team_name,
  r.player_id,
  r.player_name,
  r.real_team_id,
  r.real_team_name,
  r.role,
  r.status,
  (
    coalesce(r.total_points, 0)
    - coalesce(r.points_from_awards, 0)
    + public.flbp_fanta_award_points_for_player(r.workspace_id, r.tournament_id, r.player_id, r.player_name)
  )::int as total_points,
  r.live_points,
  r.raw_goals,
  r.raw_blows,
  r.raw_wins,
  r.points_from_goals,
  r.points_from_blows,
  r.points_from_wins,
  public.flbp_fanta_award_points_for_player(r.workspace_id, r.tournament_id, r.player_id, r.player_name)::int as points_from_awards,
  r.points_from_scia,
  r.bonus_scia,
  r.created_at
from public.fanta_archived_rosters r;

create or replace view public.fanta_archived_standings_awarded as
with team_awards as (
  select workspace_id, tournament_id, team_id, sum(points_from_awards)::int as team_award_points
  from public.fanta_archived_rosters_awarded
  group by workspace_id, tournament_id, team_id
),
base as (
  select
    s.workspace_id,
    s.tournament_id,
    s.team_id,
    s.user_id,
    s.team_name,
    (
      coalesce(s.total_points, 0)
      - coalesce(s.points_from_awards, 0)
      + coalesce(ta.team_award_points, coalesce(s.points_from_awards, 0))
    )::int as total_points,
    s.live_points,
    s.points_from_goals,
    s.points_from_blows,
    s.points_from_wins,
    coalesce(ta.team_award_points, coalesce(s.points_from_awards, 0))::int as points_from_awards,
    s.bonus_scia,
    s.players_in_game,
    s.created_at
  from public.fanta_archived_standings s
  left join team_awards ta
    on ta.workspace_id = s.workspace_id
   and ta.tournament_id = s.tournament_id
   and ta.team_id = s.team_id
)
select
  workspace_id,
  tournament_id,
  team_id,
  user_id,
  row_number() over (
    partition by workspace_id, tournament_id
    order by total_points desc, players_in_game desc, points_from_wins desc, points_from_goals desc, team_name asc
  )::int as rank,
  team_name,
  total_points,
  live_points,
  points_from_goals,
  points_from_blows,
  points_from_wins,
  points_from_awards,
  bonus_scia,
  players_in_game,
  created_at
from base;

create or replace view public.fanta_archived_players_awarded as
with base as (
  select
    p.workspace_id,
    p.tournament_id,
    p.player_id,
    p.player_name,
    p.real_team_id,
    p.real_team_name,
    (
      coalesce(p.total_points, 0)
      - coalesce(p.points_from_awards, 0)
      + public.flbp_fanta_award_points_for_player(p.workspace_id, p.tournament_id, p.player_id, p.player_name)
    )::int as total_points,
    p.live_points,
    p.points_from_goals,
    p.points_from_blows,
    p.points_from_wins,
    public.flbp_fanta_award_points_for_player(p.workspace_id, p.tournament_id, p.player_id, p.player_name)::int as points_from_awards,
    p.bonus_scia,
    p.selected_by_teams,
    p.status,
    p.created_at
  from public.fanta_archived_players p
)
select
  workspace_id,
  tournament_id,
  player_id,
  row_number() over (
    partition by workspace_id, tournament_id
    order by total_points desc, points_from_wins desc, points_from_goals desc, player_name asc
  )::int as rank,
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
  status,
  created_at
from base;

create or replace view public.fanta_archived_editions_awarded as
select
  e.workspace_id,
  e.tournament_id,
  e.tournament_name,
  e.start_date,
  e.archived_at,
  coalesce(w.team_id, e.winner_team_id) as winner_team_id,
  coalesce(w.team_name, e.winner_team_name) as winner_team_name,
  coalesce(w.total_points, e.winner_points, 0)::int as winner_points,
  e.teams_count,
  e.updated_at
from public.fanta_archived_editions e
left join lateral (
  select s.team_id, s.team_name, s.total_points
  from public.fanta_archived_standings_awarded s
  where s.workspace_id = e.workspace_id
    and s.tournament_id = e.tournament_id
    and s.rank = 1
  limit 1
) w on true;

grant select on public.fanta_archived_rosters_awarded to anon, authenticated;
grant select on public.fanta_archived_standings_awarded to anon, authenticated;
grant select on public.fanta_archived_players_awarded to anon, authenticated;
grant select on public.fanta_archived_editions_awarded to anon, authenticated;
