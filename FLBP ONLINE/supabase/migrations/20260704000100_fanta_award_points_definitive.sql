-- FantaBeerpong: punti dei titoli (albo d'oro) definitivi.
--
-- Due difetti risolti alla radice:
--
-- 1) fanta_teams aveva una FK ON DELETE CASCADE verso tournaments, ma lo
--    structured sync rigenera tournaments con delete+reinsert ad ogni export:
--    la cascata distruggeva squadre e rose Fanta (anche a torneo in corso) e
--    rendeva impossibile ogni ri-snapshot post-archiviazione.
--
-- 2) points_from_awards veniva CONGELATO nello snapshot d'archivio prima che
--    hall_of_fame_entries arrivasse su Supabase (lo sync può impiegare minuti),
--    quindi restava 0 per sempre. Ora i punti dei titoli si calcolano AL
--    MOMENTO DELLA LETTURA con viste "awarded" che incrociano lo snapshot
--    congelato (nomi giocatori) con l'albo d'oro vivo: nessuna dipendenza dal
--    timing, e ogni correzione futura dei titoli si riflette da sola.
--
-- Regola punti: 10 punti per ogni tipo di titolo (winner, mvp, top_scorer,
-- defender), flat (il capitano non li raddoppia). Identica alla vista live.

-- 1) I dati Fanta devono sopravvivere alla rigenerazione di tournaments.
alter table if exists public.fanta_teams
  drop constraint if exists fanta_teams_tournament_fk;

-- 2) Viste di lettura con punti-titoli vivi. Espongono le stesse colonne delle
--    tabelle snapshot, con points_from_awards / total_points / rank ricalcolati.

drop view if exists public.fanta_archived_editions_awarded;
drop view if exists public.fanta_archived_standings_awarded;
drop view if exists public.fanta_archived_players_awarded;
drop view if exists public.fanta_archived_rosters_awarded;

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
  (coalesce(r.total_points, 0) - coalesce(r.points_from_awards, 0) + aw.pts)::int as total_points,
  r.live_points,
  r.raw_goals,
  r.raw_blows,
  r.raw_wins,
  r.points_from_goals,
  r.points_from_blows,
  r.points_from_wins,
  aw.pts::int as points_from_awards,
  r.points_from_scia,
  r.bonus_scia,
  r.created_at
from public.fanta_archived_rosters r
left join lateral (
  select coalesce((
    select (count(distinct h.type) * 10)::int
    from public.hall_of_fame_entries h
    cross join lateral unnest(
      case
        when coalesce(array_length(h.player_names, 1), 0) > 0 then h.player_names
        else array[coalesce(h.player_id, '')]
      end
    ) as p(award_player_name)
    where h.workspace_id = r.workspace_id
      and h.tournament_id = r.tournament_id
      and h.type in ('winner', 'mvp', 'top_scorer', 'defender')
      and trim(coalesce(r.player_name, '')) <> ''
      and lower(regexp_replace(trim(coalesce(p.award_player_name, '')), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(trim(coalesce(r.player_name, '')), '[[:space:]]+', ' ', 'g'))
  ), 0) as pts
) aw on true;

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
    -- Se mancano le rose archiviate (edizioni vecchie) si conserva il valore congelato.
    (coalesce(s.total_points, 0) - coalesce(s.points_from_awards, 0)
      + coalesce(ta.team_award_points, coalesce(s.points_from_awards, 0)))::int as total_points,
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
    (coalesce(p.total_points, 0) - coalesce(p.points_from_awards, 0) + aw.pts)::int as total_points,
    p.live_points,
    p.points_from_goals,
    p.points_from_blows,
    p.points_from_wins,
    aw.pts::int as points_from_awards,
    p.bonus_scia,
    p.selected_by_teams,
    p.status,
    p.created_at
  from public.fanta_archived_players p
  left join lateral (
    select coalesce((
      select (count(distinct h.type) * 10)::int
      from public.hall_of_fame_entries h
      cross join lateral unnest(
        case
          when coalesce(array_length(h.player_names, 1), 0) > 0 then h.player_names
          else array[coalesce(h.player_id, '')]
        end
      ) as x(award_player_name)
      where h.workspace_id = p.workspace_id
        and h.tournament_id = p.tournament_id
        and h.type in ('winner', 'mvp', 'top_scorer', 'defender')
        and trim(coalesce(p.player_name, '')) <> ''
        and lower(regexp_replace(trim(coalesce(x.award_player_name, '')), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(trim(coalesce(p.player_name, '')), '[[:space:]]+', ' ', 'g'))
    ), 0) as pts
  ) aw on true
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
