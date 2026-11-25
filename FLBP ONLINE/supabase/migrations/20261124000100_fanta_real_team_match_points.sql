-- Calculate Fanta results from full multi-team reports and identify players by real team.

create or replace view public.fanta_roster_live_rows as
with multi_team_reports as (
  select
    w.workspace_id,
    tournament.item ->> 'id' as tournament_id,
    m.item ->> 'id' as match_id,
    m.item -> 'teamIds' as team_ids,
    m.item -> 'scoresByTeam' as scores
  from public.workspace_state w
  cross join lateral (
    select w.state -> 'tournament' as item,
           case
             when jsonb_typeof(w.state -> 'tournamentMatches') = 'array'
               and w.state -> 'tournamentMatches' <> '[]'::jsonb then w.state -> 'tournamentMatches'
             else w.state #> '{tournament,matches}'
           end as matches
    union all
    select h.item, h.item -> 'matches'
    from jsonb_array_elements(case when jsonb_typeof(w.state -> 'tournamentHistory') = 'array'
      then w.state -> 'tournamentHistory' else '[]'::jsonb end) h(item)
    where h.item ->> 'id' is distinct from w.state #>> '{tournament,id}'
  ) tournament
  cross join lateral jsonb_array_elements(case when jsonb_typeof(tournament.matches) = 'array'
    then tournament.matches else '[]'::jsonb end) m(item)
  where case when jsonb_typeof(m.item -> 'teamIds') = 'array'
    then jsonb_array_length(m.item -> 'teamIds') > 2 else false end
),
multi_team_winners as (
  select distinct on (m.workspace_id, m.tournament_id, m.match_id)
    m.workspace_id, m.tournament_id, m.match_id,
    case when s.scores[1] > s.scores[2] then s.team_ids[1] end as winner_team_id
  from multi_team_reports m
  cross join lateral (
    select array_agg(team_id order by score desc, team_id) as team_ids,
           array_agg(score order by score desc, team_id) as scores
    from (
      select distinct team.value as team_id,
        case when jsonb_typeof(m.scores -> team.value) = 'number'
          then (m.scores ->> team.value)::numeric else 0 end as score
      from jsonb_array_elements_text(m.team_ids) team(value)
      where team.value <> '' and upper(team.value) <> 'BYE' and upper(team.value) !~ '^TBD($|-)'
    ) participant_scores
    having count(*) > 2
  ) s
  order by m.workspace_id, m.tournament_id, m.match_id
),
match_winners as (
  select
    m.workspace_id,
    m.tournament_id,
    m.id as match_id,
    m.phase,
    coalesce(m.round, 0) as round_index,
    coalesce(m.order_index, 0) as order_index,
    ((coalesce(m.round, 0) * 10000) + coalesce(m.order_index, 0)) as match_sort,
    case when mw.match_id is not null then mw.winner_team_id
      when m.score_a > m.score_b then m.team_a_id when m.score_b > m.score_a then m.team_b_id end as winner_team_id,
    case when mw.match_id is not null then null
      when m.score_a > m.score_b then m.team_b_id when m.score_b > m.score_a then m.team_a_id end as loser_team_id
  from public.tournament_matches m
  left join multi_team_winners mw
    on mw.workspace_id = m.workspace_id and mw.tournament_id = m.tournament_id and mw.match_id = m.id
  where (m.status = 'finished' or m.played = true)
    and m.hidden = false
    and m.is_bye = false
    and (mw.match_id is not null or (m.team_a_id is not null and m.team_b_id is not null
      and m.team_a_id <> 'BYE' and m.team_b_id <> 'BYE' and m.score_a <> m.score_b))
),
stat_totals as (
  select
    workspace_id,
    tournament_id,
    player_key,
    lower(regexp_replace(trim(coalesce(max(player_name), '')), '[[:space:]]+', ' ', 'g')) as player_name_key,
    max(player_name) as player_name,
    team_id as real_team_id,
    sum(canestri)::int as raw_goals,
    sum(soffi)::int as raw_blows
  from public.tournament_match_stats
  where player_key is not null
  group by workspace_id, tournament_id, team_id, player_key
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
team_players as (
  select distinct
    tt.workspace_id, tt.tournament_id, tt.id as real_team_id,
    lower(regexp_replace(trim(p.player_name), '[[:space:]]+', ' ', 'g')) as player_name_key
  from public.tournament_teams tt
  cross join lateral (values (tt.player1), (tt.player2)) p(player_name)
  where trim(coalesce(p.player_name, '')) <> ''
),
award_seed as (
  select
    h.workspace_id,
    coalesce(nullif(trim(coalesce(h.source_tournament_id, '')), ''), h.tournament_id) as tournament_id,
    h.type, nullif(trim(h.team_name), '') as team_hint, h.player_names
  from public.hall_of_fame_entries h
  where h.type in ('winner', 'mvp', 'top_scorer', 'defender')
),
award_refs as (
  select distinct h.workspace_id, h.tournament_id, h.type, p.real_team_id, p.player_name_key
  from award_seed h
  left join lateral (
    select coalesce(max(tt.id) filter (where tt.id = h.team_hint),
      case when count(*) = 1 then max(tt.id) end) as id
    from public.tournament_teams tt
    where tt.workspace_id = h.workspace_id and tt.tournament_id = h.tournament_id
      and (tt.id = h.team_hint
        or lower(regexp_replace(trim(tt.name), '[[:space:]]+', ' ', 'g'))
         = lower(regexp_replace(h.team_hint, '[[:space:]]+', ' ', 'g')))
  ) named_team on true
  join team_players p on p.workspace_id = h.workspace_id and p.tournament_id = h.tournament_id
    and (
      p.real_team_id = named_team.id
      or (h.team_hint is null and 1 = (
        select count(*) from team_players candidate
        where candidate.workspace_id = p.workspace_id and candidate.tournament_id = p.tournament_id
          and candidate.player_name_key = p.player_name_key
      ))
    )
  where (h.type = 'winner' and named_team.id is not null)
    or exists (
      select 1 from unnest(h.player_names) n(player_name)
      where lower(regexp_replace(trim(n.player_name), '[[:space:]]+', ' ', 'g')) = p.player_name_key
    )
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
        (nullif(r.real_team_id, '') is not null and st.real_team_id = r.real_team_id and (
          st.player_key = r.player_id
          or st.player_name_key = lower(regexp_replace(trim(coalesce(nullif(r.player_name, ''), r.player_id)), '[[:space:]]+', ' ', 'g'))
        ))
        or (nullif(r.real_team_id, '') is null and st.player_key = r.player_id and 1 = (
          select count(*) from stat_totals candidate
          where candidate.workspace_id = st.workspace_id and candidate.tournament_id = st.tournament_id
            and candidate.player_key = st.player_key
        ))
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
    and ar.real_team_id = rb.real_team_id
    and ar.player_name_key = lower(regexp_replace(trim(coalesce(rb.player_name, '')), '[[:space:]]+', ' ', 'g'))
) ap on true
left join public.tournament_teams elim
  on elim.workspace_id = rb.workspace_id
 and elim.tournament_id = rb.tournament_id
 and elim.id = tl.eliminated_by_team_id;

create or replace view public.fanta_player_standings as
with player_rows as (
  select
    workspace_id,
    tournament_id,
    player_id,
    max(player_name) as player_name,
    real_team_id,
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
  group by workspace_id, tournament_id, real_team_id, player_id
)
select
  workspace_id,
  tournament_id,
  case when count(*) over (partition by workspace_id, tournament_id, player_id) > 1
    then player_id || '::team:' || coalesce(real_team_id, '') else player_id end as player_key,
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

revoke insert, update, delete on public.fanta_roster_live_rows, public.fanta_player_standings from public, anon, authenticated;
grant select on public.fanta_roster_live_rows, public.fanta_player_standings to anon, authenticated;
