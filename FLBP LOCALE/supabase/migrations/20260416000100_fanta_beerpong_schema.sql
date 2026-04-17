-- FLBP Manager Suite - FantaBeerpong Schema
--
-- Fanta module tied to one live tournament per workspace.
-- Rules implemented here:
-- - one Fanta team per user per tournament
-- - exactly 4 players
-- - exactly 1 captain
-- - exactly 2 defenders
-- - captain doubles all live Fanta points for that player
-- - defender doubles only blow points
-- - goal 1pt, blow 2pt, team win 7pt, Bonus Scia 5pt

create table if not exists fanta_config (
  workspace_id text primary key references workspaces(id) on delete cascade,
  active_tournament_id text not null,
  is_lock_active boolean not null default false,
  registration_open boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists fanta_teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text,
  user_id uuid not null default auth.uid(),
  name text not null,
  status text not null default 'confirmed' check (status in ('draft','confirmed','locked','final')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fanta_teams add column if not exists tournament_id text;
alter table fanta_teams add column if not exists status text not null default 'confirmed';
alter table fanta_teams add column if not exists submitted_at timestamptz not null default now();

update fanta_teams t
set tournament_id = c.active_tournament_id
from fanta_config c
where t.workspace_id = c.workspace_id
  and t.tournament_id is null;

alter table fanta_teams drop constraint if exists fanta_teams_workspace_id_user_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fanta_teams_workspace_tournament_user_key'
  ) then
    alter table fanta_teams
      add constraint fanta_teams_workspace_tournament_user_key
      unique (workspace_id, tournament_id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fanta_teams_tournament_fk'
  ) then
    alter table fanta_teams
      add constraint fanta_teams_tournament_fk
      foreign key (workspace_id, tournament_id)
      references tournaments(workspace_id, id)
      on delete cascade;
  end if;
end $$;

create table if not exists fanta_rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  player_id text not null,
  player_name text,
  real_team_id text,
  real_team_name text,
  role text not null check (role in ('captain', 'defender', 'starter')),
  created_at timestamptz not null default now(),
  unique (team_id, player_id)
);

alter table fanta_rosters add column if not exists player_name text;
alter table fanta_rosters add column if not exists real_team_id text;
alter table fanta_rosters add column if not exists real_team_name text;

alter table fanta_config enable row level security;
alter table fanta_teams enable row level security;
alter table fanta_rosters enable row level security;

drop policy if exists "Public read fanta_config" on fanta_config;
drop policy if exists "Admin write fanta_config" on fanta_config;
drop policy if exists "Public read fanta_teams" on fanta_teams;
drop policy if exists "Owner CRUD fanta_teams" on fanta_teams;
drop policy if exists "Public read fanta_rosters" on fanta_rosters;
drop policy if exists "Owner CRUD fanta_rosters" on fanta_rosters;

create policy "Public read fanta_config" on fanta_config for select using (true);
create policy "Admin write fanta_config" on fanta_config for all
  using (public.flbp_is_admin()) with check (public.flbp_is_admin());

create policy "Public read fanta_teams" on fanta_teams for select using (true);
create policy "Owner CRUD fanta_teams" on fanta_teams for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Public read fanta_rosters" on fanta_rosters for select using (true);
create policy "Owner CRUD fanta_rosters" on fanta_rosters for all
  using (
    exists (
      select 1 from fanta_teams
      where id = fanta_rosters.team_id and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from fanta_teams
      where id = fanta_rosters.team_id and user_id = auth.uid()
    )
  );

create or replace function public.fanta_save_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_name text,
  p_roster jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_tournament_id text;
  v_registration_open boolean := true;
  v_lock_active boolean := false;
  v_started boolean := false;
  v_count int := 0;
  v_distinct_players int := 0;
  v_captains int := 0;
  v_defenders int := 0;
  v_starters int := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if jsonb_typeof(p_roster) <> 'array' then
    raise exception 'Invalid Fanta roster.';
  end if;

  select
    coalesce(nullif(p_tournament_id, ''), c.active_tournament_id),
    coalesce(c.registration_open, true),
    coalesce(c.is_lock_active, false)
  into v_tournament_id, v_registration_open, v_lock_active
  from fanta_config c
  where c.workspace_id = p_workspace_id;

  if v_tournament_id is null then
    select id into v_tournament_id
    from tournaments
    where workspace_id = p_workspace_id and status = 'live'
    order by updated_at desc
    limit 1;
  end if;

  if v_tournament_id is null then
    raise exception 'No live tournament available for FantaBeerpong.';
  end if;

  if not exists (
    select 1 from tournaments
    where workspace_id = p_workspace_id and id = v_tournament_id
  ) then
    raise exception 'FantaBeerpong tournament not found.';
  end if;

  select exists (
    select 1 from tournament_matches
    where workspace_id = p_workspace_id
      and tournament_id = v_tournament_id
      and hidden = false
      and is_bye = false
      and (played = true or status in ('playing','finished'))
    limit 1
  ) into v_started;

  if v_lock_active or not v_registration_open or v_started then
    raise exception 'FantaBeerpong roster is locked.';
  end if;

  select
    count(*),
    count(distinct elem->>'player_id'),
    count(*) filter (where elem->>'role' = 'captain'),
    count(*) filter (where elem->>'role' = 'defender'),
    count(*) filter (where elem->>'role' = 'starter')
  into v_count, v_distinct_players, v_captains, v_defenders, v_starters
  from jsonb_array_elements(p_roster) elem;

  if v_count <> 4 or v_distinct_players <> 4 or v_captains <> 1 or v_defenders <> 2 or v_starters <> 1 then
    raise exception 'Fanta roster must contain 4 players, 1 captain, 2 defenders and 1 starter.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_roster) elem
    where coalesce(nullif(elem->>'player_id', ''), '') = ''
       or coalesce(nullif(elem->>'player_name', ''), '') = ''
       or elem->>'role' not in ('captain','defender','starter')
  ) then
    raise exception 'Fanta roster contains invalid players or roles.';
  end if;

  insert into fanta_teams (workspace_id, tournament_id, user_id, name, status, submitted_at, updated_at)
  values (p_workspace_id, v_tournament_id, v_user_id, trim(p_team_name), 'confirmed', now(), now())
  on conflict on constraint fanta_teams_workspace_tournament_user_key
  do update set
    name = excluded.name,
    status = 'confirmed',
    submitted_at = now(),
    updated_at = now()
  returning id into v_team_id;

  delete from fanta_rosters where team_id = v_team_id;

  insert into fanta_rosters (team_id, player_id, player_name, real_team_id, real_team_name, role)
  select
    v_team_id,
    player_id,
    player_name,
    nullif(real_team_id, ''),
    nullif(real_team_name, ''),
    role
  from jsonb_to_recordset(p_roster) as roster(
    player_id text,
    player_name text,
    real_team_id text,
    real_team_name text,
    role text
  );

  return v_team_id;
end;
$$;

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
    order_index as elimination_order
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
   and ((w.round_index * 10000) + w.order_index) > ((l.elimination_round * 10000) + l.elimination_order)
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
    r.role
  from fanta_teams t
  join fanta_rosters r on r.team_id = t.id
  left join stat_totals st
    on st.workspace_id = t.workspace_id
   and st.tournament_id = t.tournament_id
   and st.player_key = r.player_id
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
  coalesce(st.raw_goals, 0)::int as raw_goals,
  coalesce(st.raw_blows, 0)::int as raw_blows,
  coalesce(tw.raw_wins, 0)::int as raw_wins,
  coalesce(sp.bonus_scia, 0)::int as bonus_scia,
  case when tl.real_team_id is null then 'live' else 'eliminated' end as status,
  tl.eliminated_by_team_id,
  elim.name as eliminated_by_team_name,
  case when rb.role = 'captain' then coalesce(st.raw_goals, 0)::int * 2 else coalesce(st.raw_goals, 0)::int end as points_from_goals,
  case when rb.role in ('captain','defender') then coalesce(st.raw_blows, 0)::int * 4 else coalesce(st.raw_blows, 0)::int * 2 end as points_from_blows,
  case when rb.role = 'captain' then coalesce(tw.raw_wins, 0)::int * 14 else coalesce(tw.raw_wins, 0)::int * 7 end as points_from_wins,
  case when rb.role = 'captain' then coalesce(sp.bonus_scia, 0)::int * 2 else coalesce(sp.bonus_scia, 0)::int end as points_from_scia,
  (
    case when rb.role = 'captain' then coalesce(st.raw_goals, 0)::int * 2 else coalesce(st.raw_goals, 0)::int end
    + case when rb.role in ('captain','defender') then coalesce(st.raw_blows, 0)::int * 4 else coalesce(st.raw_blows, 0)::int * 2 end
    + case when rb.role = 'captain' then coalesce(tw.raw_wins, 0)::int * 14 else coalesce(tw.raw_wins, 0)::int * 7 end
    + case when rb.role = 'captain' then coalesce(sp.bonus_scia, 0)::int * 2 else coalesce(sp.bonus_scia, 0)::int end
  )::int as total_points,
  (
    case when rb.role = 'captain' then coalesce(st.raw_goals, 0)::int * 2 else coalesce(st.raw_goals, 0)::int end
    + case when rb.role in ('captain','defender') then coalesce(st.raw_blows, 0)::int * 4 else coalesce(st.raw_blows, 0)::int * 2 end
    + case when rb.role = 'captain' then coalesce(tw.raw_wins, 0)::int * 14 else coalesce(tw.raw_wins, 0)::int * 7 end
  )::int as live_points
from roster_base rb
left join stat_totals st
  on st.workspace_id = rb.workspace_id
 and st.tournament_id = rb.tournament_id
 and st.player_key = rb.player_id
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

grant select on fanta_config to anon, authenticated;
grant select on fanta_teams to anon, authenticated;
grant select on fanta_rosters to anon, authenticated;
grant select on fanta_roster_live_rows to anon, authenticated;
grant select on fanta_live_standings to anon, authenticated;
grant select on fanta_player_standings to anon, authenticated;

grant insert, update, delete on fanta_teams to authenticated;
grant insert, update, delete on fanta_rosters to authenticated;
grant insert, update, delete on fanta_config to authenticated;
grant execute on function public.fanta_save_team(text, text, text, jsonb) to authenticated;
