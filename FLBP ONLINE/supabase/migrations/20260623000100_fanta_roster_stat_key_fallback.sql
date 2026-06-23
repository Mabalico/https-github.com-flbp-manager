-- FLBP Manager Suite - FantaBeerpong roster/stat key fallback
--
-- Problem:
-- - fanta_rosters.player_id can be saved as "name_ND" by the builder.
-- - tournament_match_stats.player_key can be saved as "name_YYYY-MM-DD" when
--   the tournament team has a birth date.
-- - The previous fanta_roster_live_rows view joined only on exact player_key,
--   so goals/blows could be silently zero for those players.
--
-- Fix:
-- - Keep exact player_key matching as the preferred path.
-- - Add a conservative fallback on normalized player name + real team id.
-- - Keep all scoring rules unchanged.

drop view if exists fanta_live_standings;
drop view if exists fanta_player_standings;
drop view if exists fanta_roster_live_rows;

create or replace view fanta_roster_live_rows as
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
  from tournament_matches m
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
  from tournament_match_stats
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
  from fanta_teams t
  join fanta_rosters r on r.team_id = t.id
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
  case when tl.real_team_id is null then 'live' else 'eliminated' end as status,
  tl.eliminated_by_team_id,
  elim.name as eliminated_by_team_name,
  case when rb.role = 'captain' then coalesce(rb.raw_goals, 0)::int * 2 else coalesce(rb.raw_goals, 0)::int end as points_from_goals,
  case when rb.role in ('captain','defender') then coalesce(rb.raw_blows, 0)::int * 4 else coalesce(rb.raw_blows, 0)::int * 2 end as points_from_blows,
  case when rb.role = 'captain' then coalesce(tw.raw_wins, 0)::int * 14 else coalesce(tw.raw_wins, 0)::int * 7 end as points_from_wins,
  case when rb.role = 'captain' then coalesce(sp.bonus_scia, 0)::int * 2 else coalesce(sp.bonus_scia, 0)::int end as points_from_scia,
  (
    case when rb.role = 'captain' then coalesce(rb.raw_goals, 0)::int * 2 else coalesce(rb.raw_goals, 0)::int end
    + case when rb.role in ('captain','defender') then coalesce(rb.raw_blows, 0)::int * 4 else coalesce(rb.raw_blows, 0)::int * 2 end
    + case when rb.role = 'captain' then coalesce(tw.raw_wins, 0)::int * 14 else coalesce(tw.raw_wins, 0)::int * 7 end
    + case when rb.role = 'captain' then coalesce(sp.bonus_scia, 0)::int * 2 else coalesce(sp.bonus_scia, 0)::int end
  )::int as total_points,
  (
    case when rb.role = 'captain' then coalesce(rb.raw_goals, 0)::int * 2 else coalesce(rb.raw_goals, 0)::int end
    + case when rb.role in ('captain','defender') then coalesce(rb.raw_blows, 0)::int * 4 else coalesce(rb.raw_blows, 0)::int * 2 end
    + case when rb.role = 'captain' then coalesce(tw.raw_wins, 0)::int * 14 else coalesce(tw.raw_wins, 0)::int * 7 end
  )::int as live_points
from roster_base rb
left join tournament_teams tt
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
left join tournament_teams elim
  on elim.workspace_id = rb.workspace_id
 and elim.tournament_id = rb.tournament_id
 and elim.id = tl.eliminated_by_team_id;

create or replace view fanta_live_standings as
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
  sum(points_from_scia)::int as bonus_scia,
  count(*) filter (where status <> 'eliminated')::int as players_in_game,
  max(player_name) filter (where role = 'captain') as captain_name,
  count(*) filter (where role = 'defender')::int as defenders_count,
  case when count(*) filter (where status <> 'eliminated') > 0 then 'Live' else 'Stabile' end as status_label
from fanta_roster_live_rows
group by workspace_id, tournament_id, team_id, team_name, user_id;

create or replace view fanta_player_standings as
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
    max(status) as status,
    max(eliminated_by_team_name) as eliminated_by_team_name,
    count(distinct team_id)::int as selected_by_teams
  from fanta_roster_live_rows
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
  bonus_scia,
  (raw_goals + (raw_blows * 2) + (raw_wins * 7) + bonus_scia)::int as total_points,
  (raw_goals + (raw_blows * 2) + (raw_wins * 7))::int as live_points,
  raw_goals,
  raw_blows,
  raw_wins,
  status,
  eliminated_by_team_name,
  selected_by_teams
from player_rows;

grant select on fanta_roster_live_rows to anon, authenticated;
grant select on fanta_live_standings to anon, authenticated;
grant select on fanta_player_standings to anon, authenticated;
