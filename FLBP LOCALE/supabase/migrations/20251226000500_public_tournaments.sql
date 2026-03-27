-- FLBP Manager Suite - Public tournaments bundle (safe read)
--
-- Provides public read-only access to tournament lists and details (teams, groups, matches, match stats)
-- without exposing sensitive fields (YoB, player_key, full snapshot).
--
-- Written by the admin client (with JWT) during "Esporta dati strutturati".
--
-- BYE rule:
-- - BYE matches must be stored with is_bye=true AND hidden=true.

create table if not exists public_tournaments (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  start_date timestamptz not null,
  type text not null check (type in ('elimination','groups_elimination')),
  config jsonb not null default '{}'::jsonb,
  is_manual boolean not null default false,
  status text not null check (status in ('live','archived')) default 'archived',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists idx_public_tournaments_status_date
  on public_tournaments(workspace_id, status, start_date desc);

create table if not exists public_tournament_teams (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  id text not null,
  name text not null,
  player1 text not null,
  player2 text not null,
  player1_is_referee boolean not null default false,
  player2_is_referee boolean not null default false,
  is_referee boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id, id),
  foreign key (workspace_id, tournament_id)
    references public_tournaments(workspace_id, id)
    on delete cascade
);

create index if not exists idx_public_tournament_teams_name
  on public_tournament_teams(workspace_id, tournament_id, lower(name));

create table if not exists public_tournament_groups (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  id text not null,
  name text not null,
  order_index int not null default 0,
  primary key (workspace_id, tournament_id, id),
  foreign key (workspace_id, tournament_id)
    references public_tournaments(workspace_id, id)
    on delete cascade
);

create table if not exists public_tournament_group_teams (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  group_id text not null,
  team_id text not null,
  seed int null,
  primary key (workspace_id, tournament_id, group_id, team_id),
  foreign key (workspace_id, tournament_id, group_id)
    references public_tournament_groups(workspace_id, tournament_id, id)
    on delete cascade
);

create index if not exists idx_public_group_teams_team
  on public_tournament_group_teams(workspace_id, tournament_id, team_id);

create table if not exists public_tournament_matches (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  id text not null,
  code text null,
  phase text null check (phase in ('groups','bracket')),
  group_name text null,
  round int null,
  round_name text null,
  order_index int null,
  team_a_id text null,
  team_b_id text null,
  score_a int not null default 0,
  score_b int not null default 0,
  played boolean not null default false,
  status text not null check (status in ('scheduled','playing','finished')) default 'scheduled',
  is_bye boolean not null default false,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id, id),
  foreign key (workspace_id, tournament_id)
    references public_tournaments(workspace_id, id)
    on delete cascade
);

create index if not exists idx_public_matches_tournament_order
  on public_tournament_matches(workspace_id, tournament_id, order_index);

create table if not exists public_tournament_match_stats (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  match_id text not null,
  team_id text not null,
  player_name text not null,
  canestri int not null default 0,
  soffi int not null default 0,
  primary key (workspace_id, tournament_id, match_id, team_id, player_name),
  foreign key (workspace_id, tournament_id, match_id)
    references public_tournament_matches(workspace_id, tournament_id, id)
    on delete cascade
);

create index if not exists idx_public_match_stats_player
  on public_tournament_match_stats(workspace_id, tournament_id, lower(player_name));

-- RLS
alter table public_tournaments enable row level security;
alter table public_tournament_teams enable row level security;
alter table public_tournament_groups enable row level security;
alter table public_tournament_group_teams enable row level security;
alter table public_tournament_matches enable row level security;
alter table public_tournament_match_stats enable row level security;

-- Public read (anon + authenticated)
drop policy if exists "public_read" on public_tournaments;
create policy "public_read" on public_tournaments
  for select
  using (true);

drop policy if exists "public_read" on public_tournament_teams;
create policy "public_read" on public_tournament_teams
  for select
  using (true);

drop policy if exists "public_read" on public_tournament_groups;
create policy "public_read" on public_tournament_groups
  for select
  using (true);

drop policy if exists "public_read" on public_tournament_group_teams;
create policy "public_read" on public_tournament_group_teams
  for select
  using (true);

drop policy if exists "public_read" on public_tournament_matches;
create policy "public_read" on public_tournament_matches
  for select
  using (true);

drop policy if exists "public_read" on public_tournament_match_stats;
create policy "public_read" on public_tournament_match_stats
  for select
  using (true);

-- Admin-only writes
drop policy if exists "admin_insert" on public_tournaments;
create policy "admin_insert" on public_tournaments
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_tournaments;
create policy "admin_update" on public_tournaments
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_tournaments;
create policy "admin_delete" on public_tournaments
  for delete
  using (public.flbp_is_admin());

drop policy if exists "admin_insert" on public_tournament_teams;
create policy "admin_insert" on public_tournament_teams
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_tournament_teams;
create policy "admin_update" on public_tournament_teams
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_tournament_teams;
create policy "admin_delete" on public_tournament_teams
  for delete
  using (public.flbp_is_admin());

drop policy if exists "admin_insert" on public_tournament_groups;
create policy "admin_insert" on public_tournament_groups
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_tournament_groups;
create policy "admin_update" on public_tournament_groups
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_tournament_groups;
create policy "admin_delete" on public_tournament_groups
  for delete
  using (public.flbp_is_admin());

drop policy if exists "admin_insert" on public_tournament_group_teams;
create policy "admin_insert" on public_tournament_group_teams
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_tournament_group_teams;
create policy "admin_update" on public_tournament_group_teams
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_tournament_group_teams;
create policy "admin_delete" on public_tournament_group_teams
  for delete
  using (public.flbp_is_admin());

drop policy if exists "admin_insert" on public_tournament_matches;
create policy "admin_insert" on public_tournament_matches
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_tournament_matches;
create policy "admin_update" on public_tournament_matches
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_tournament_matches;
create policy "admin_delete" on public_tournament_matches
  for delete
  using (public.flbp_is_admin());

drop policy if exists "admin_insert" on public_tournament_match_stats;
create policy "admin_insert" on public_tournament_match_stats
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_tournament_match_stats;
create policy "admin_update" on public_tournament_match_stats
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_tournament_match_stats;
create policy "admin_delete" on public_tournament_match_stats
  for delete
  using (public.flbp_is_admin());

-- Grants (needed for PostgREST)
grant select on public_tournaments to anon, authenticated;
grant select on public_tournament_teams to anon, authenticated;
grant select on public_tournament_groups to anon, authenticated;
grant select on public_tournament_group_teams to anon, authenticated;
grant select on public_tournament_matches to anon, authenticated;
grant select on public_tournament_match_stats to anon, authenticated;

grant insert, update, delete on public_tournaments to authenticated;
grant insert, update, delete on public_tournament_teams to authenticated;
grant insert, update, delete on public_tournament_groups to authenticated;
grant insert, update, delete on public_tournament_group_teams to authenticated;
grant insert, update, delete on public_tournament_matches to authenticated;
grant insert, update, delete on public_tournament_match_stats to authenticated;
