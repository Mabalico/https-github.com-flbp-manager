-- FLBP Manager Suite - one-shot Supabase setup
-- Generated from migration files in order.


-- ===== BEGIN supabase\migrations\20251226000100_init_flbp.sql =====

-- FLBP Manager Suite - minimal DB schema (Step 3)
-- Compatible with the current client-side AppState shape.
--
-- Compatibility notes:
-- - Match.teamAId/teamBId may be a Team.id OR special tokens like 'BYE' OR 'TBD-A-1'.
--   For this reason we do NOT enforce strict FKs on match participants.
-- - BYE must remain invisible in UI: store via tournament_matches.is_bye=true AND hidden=true.
-- - RLS policies are intentionally NOT included yet; they will be added in a dedicated step.

-- Workspace (single-tenant by default; can evolve to multi-workspace)
create table if not exists workspaces (
  id text primary key,
  created_at timestamptz not null default now()
);

insert into workspaces (id) values ('default')
on conflict (id) do nothing;

-- Snapshot of the full AppState (safety net + easiest incremental migration)
create table if not exists workspace_state (
  workspace_id text primary key references workspaces(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Global settings (currently: logo)
create table if not exists app_settings (
  workspace_id text primary key references workspaces(id) on delete cascade,
  logo text not null default '',
  updated_at timestamptz not null default now()
);

insert into app_settings (workspace_id, logo) values ('default', '')
on conflict (workspace_id) do nothing;

-- Alias (Option A merge logico): from_key -> to_key
create table if not exists player_aliases (
  workspace_id text not null references workspaces(id) on delete cascade,
  from_key text not null,
  to_key text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, from_key)
);

create index if not exists idx_player_aliases_to
  on player_aliases(workspace_id, to_key);

-- Integrations: scorers baseline (manual import)
create table if not exists integrations_scorers (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text primary key,
  name text not null,
  yob int null,
  games int not null default 0,
  points int not null default 0,
  soffi int not null default 0,
  source text null,
  created_at timestamptz not null default now()
);

alter table if exists integrations_scorers add column if not exists source_type text null;
alter table if exists integrations_scorers add column if not exists source_tournament_id text null;
alter table if exists integrations_scorers add column if not exists source_label text null;
alter table if exists integrations_scorers add column if not exists team_name text null;

create index if not exists idx_integrations_scorers_name
  on integrations_scorers(workspace_id, lower(name));

-- Hall of fame / awards log
create table if not exists hall_of_fame_entries (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text primary key,
  year text not null,
  tournament_id text not null,
  tournament_name text not null,
  type text not null check (type in (
    'winner','top_scorer','defender','mvp','top_scorer_u25','defender_u25'
  )),
  team_name text null,
  player_names text[] not null default '{}',
  value int null,
  player_id text null,
  created_at timestamptz not null default now()
);

alter table if exists hall_of_fame_entries add column if not exists source_type text null;
alter table if exists hall_of_fame_entries add column if not exists source_tournament_id text null;
alter table if exists hall_of_fame_entries add column if not exists source_tournament_name text null;
alter table if exists hall_of_fame_entries add column if not exists source_match_id text null;
alter table if exists hall_of_fame_entries add column if not exists source_auto_generated boolean null;
alter table if exists hall_of_fame_entries add column if not exists reassigned_from_player_id text null;
alter table if exists hall_of_fame_entries add column if not exists manually_edited boolean null;

create index if not exists idx_hof_by_tournament
  on hall_of_fame_entries(workspace_id, tournament_id);

create index if not exists idx_hof_by_player
  on hall_of_fame_entries(workspace_id, player_id);

-- Tournaments (live + archived)
create table if not exists tournaments (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  start_date timestamptz not null,
  type text not null check (type in ('elimination','groups_elimination')),
  config jsonb not null default '{}'::jsonb,
  is_manual boolean not null default false,
  status text not null check (status in ('live','archived')) default 'archived',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists idx_tournaments_status_date
  on tournaments(workspace_id, status, start_date desc);

-- Teams for a tournament (snapshot roster)
create table if not exists tournament_teams (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  id text not null,
  name text not null,
  player1 text not null,
  player2 text not null,
  player1_yob int null,
  player2_yob int null,
  player1_is_referee boolean not null default false,
  player2_is_referee boolean not null default false,
  is_referee boolean not null default false,
  created_at_ms bigint null,
  primary key (workspace_id, tournament_id, id),
  foreign key (workspace_id, tournament_id)
    references tournaments(workspace_id, id) on delete cascade
);

create index if not exists idx_tournament_teams_name
  on tournament_teams(workspace_id, tournament_id, lower(name));

-- Groups
create table if not exists tournament_groups (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  id text not null,
  name text not null,
  order_index int not null default 0,
  primary key (workspace_id, tournament_id, id),
  foreign key (workspace_id, tournament_id)
    references tournaments(workspace_id, id) on delete cascade
);

create table if not exists tournament_group_teams (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  group_id text not null,
  team_id text not null,
  primary key (workspace_id, tournament_id, group_id, team_id),
  foreign key (workspace_id, tournament_id, group_id)
    references tournament_groups(workspace_id, tournament_id, id) on delete cascade
);

-- Matches (supports BYE + TBD tokens)
create table if not exists tournament_matches (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  id text not null,
  code text null,
  phase text not null check (phase in ('groups','bracket')),
  status text not null check (status in ('scheduled','playing','finished')),
  played boolean not null default false,
  score_a int not null default 0,
  score_b int not null default 0,
  team_a_id text null,
  team_b_id text null,
  round int null,
  round_name text null,
  group_name text null,
  order_index int null,
  hidden boolean not null default false,
  is_bye boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, tournament_id, id),
  foreign key (workspace_id, tournament_id)
    references tournaments(workspace_id, id) on delete cascade
);

-- Match code is an operator-facing lookup aid, NOT a strict unique key.
-- The app can legitimately contain duplicate codes and disambiguates them in UI
-- (for example in Referees Area it lets the referee choose the correct match).
-- Keep a plain index for lookup speed, but do not enforce uniqueness.
drop index if exists ux_match_code;
create index if not exists idx_match_code
  on tournament_matches(workspace_id, tournament_id, code)
  where code is not null;

create index if not exists idx_matches_phase_round_order
  on tournament_matches(workspace_id, tournament_id, phase, round, order_index);

create index if not exists idx_matches_group_order
  on tournament_matches(workspace_id, tournament_id, phase, group_name, order_index);

-- Per-match stats
create table if not exists tournament_match_stats (
  workspace_id text not null references workspaces(id) on delete cascade,
  tournament_id text not null,
  match_id text not null,
  team_id text not null,
  player_name text not null,
  canestri int not null default 0,
  soffi int not null default 0,
  player_key text null,
  primary key (workspace_id, tournament_id, match_id, team_id, player_name),
  foreign key (workspace_id, tournament_id, match_id)
    references tournament_matches(workspace_id, tournament_id, id) on delete cascade
);

create index if not exists idx_match_stats_player_key
  on tournament_match_stats(workspace_id, player_key);

-- Simulation pool (catalog)
create table if not exists sim_pool_team_names (
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  order_index int not null default 0,
  primary key (workspace_id, name)
);

create table if not exists sim_pool_people (
  workspace_id text not null references workspaces(id) on delete cascade,
  id bigserial primary key,
  name text not null,
  yob int not null
);

create index if not exists idx_sim_people_name
  on sim_pool_people(workspace_id, lower(name));

-- ===== END supabase\migrations\20251226000100_init_flbp.sql =====


-- ===== BEGIN supabase\migrations\20251226000200_rls_policies.sql =====

-- FLBP Manager Suite - RLS policies (Step 4)
--
-- Goals:
-- - Protect sensitive data (YoB, player_key, full snapshot) behind authenticated admin.
-- - Keep client UX unchanged: DB is optional and gated by feature flag + token.
--
-- IMPORTANT:
-- - This migration assumes Supabase Auth is enabled.
-- - You must provide an authenticated JWT (stored client-side in localStorage key "flbp_supabase_access_token")
--   to use the Admin DB Sync features once RLS is enabled.

-- Helper: check if current request is an admin.
-- We support multiple conventions for the claim location.
create or replace function public.flbp_is_admin()
returns boolean
language sql
stable
as $$
  select
    -- service_role bypasses RLS anyway, but keep it for completeness
    (auth.role() = 'service_role')
    or (auth.jwt() ->> 'role' = 'admin')
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    or ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
$$;

-- Enable RLS on all tables
alter table if exists public.workspaces enable row level security;
alter table if exists public.workspace_state enable row level security;
alter table if exists public.app_settings enable row level security;
alter table if exists public.player_aliases enable row level security;
alter table if exists public.integrations_scorers enable row level security;
alter table if exists public.hall_of_fame_entries enable row level security;
alter table if exists public.tournaments enable row level security;
alter table if exists public.tournament_teams enable row level security;
alter table if exists public.tournament_groups enable row level security;
alter table if exists public.tournament_group_teams enable row level security;
alter table if exists public.tournament_matches enable row level security;
alter table if exists public.tournament_match_stats enable row level security;
alter table if exists public.sim_pool_team_names enable row level security;
alter table if exists public.sim_pool_people enable row level security;

-- Default: admin-only access (ALL operations)
-- NOTE: we drop existing policies defensively.

do $$
begin
  -- workspaces
  execute 'drop policy if exists admin_all on public.workspaces';
  execute 'create policy admin_all on public.workspaces for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- snapshot
  execute 'drop policy if exists admin_all on public.workspace_state';
  execute 'create policy admin_all on public.workspace_state for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- settings
  execute 'drop policy if exists admin_all on public.app_settings';
  execute 'create policy admin_all on public.app_settings for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- aliases
  execute 'drop policy if exists admin_all on public.player_aliases';
  execute 'create policy admin_all on public.player_aliases for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- integrations scorers (contains YoB)
  execute 'drop policy if exists admin_all on public.integrations_scorers';
  execute 'create policy admin_all on public.integrations_scorers for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- hall of fame (may contain player_key)
  execute 'drop policy if exists admin_all on public.hall_of_fame_entries';
  execute 'create policy admin_all on public.hall_of_fame_entries for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- tournaments
  execute 'drop policy if exists admin_all on public.tournaments';
  execute 'create policy admin_all on public.tournaments for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- tournament teams (contains YoB)
  execute 'drop policy if exists admin_all on public.tournament_teams';
  execute 'create policy admin_all on public.tournament_teams for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- groups
  execute 'drop policy if exists admin_all on public.tournament_groups';
  execute 'create policy admin_all on public.tournament_groups for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- group teams
  execute 'drop policy if exists admin_all on public.tournament_group_teams';
  execute 'create policy admin_all on public.tournament_group_teams for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- matches
  execute 'drop policy if exists admin_all on public.tournament_matches';
  execute 'create policy admin_all on public.tournament_matches for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- match stats (contains player_key)
  execute 'drop policy if exists admin_all on public.tournament_match_stats';
  execute 'create policy admin_all on public.tournament_match_stats for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  -- sim pool
  execute 'drop policy if exists admin_all on public.sim_pool_team_names';
  execute 'create policy admin_all on public.sim_pool_team_names for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';

  execute 'drop policy if exists admin_all on public.sim_pool_people';
  execute 'create policy admin_all on public.sim_pool_people for all using (public.flbp_is_admin()) with check (public.flbp_is_admin())';
end
$$;

-- ===== END supabase\migrations\20251226000200_rls_policies.sql =====


-- ===== BEGIN supabase\migrations\20251226000300_public_read_safe.sql =====

-- FLBP Manager Suite - Public read (safe) layer
--
-- Goals:
-- - Allow PUBLIC/TV read access from DB without exposing sensitive YoB.
-- - Keep existing admin-only RLS on the full snapshot and normalized tables.
-- - Public layer is a *sanitized* snapshot of AppState (YoB removed + playerKeys removed).
--
-- The sanitized snapshot is written by the admin client (with JWT) and can be read by anyone.

create table if not exists public_workspace_state (
  workspace_id text primary key references workspaces(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public_workspace_state enable row level security;

-- Public read
drop policy if exists "public_read" on public_workspace_state;
create policy "public_read" on public_workspace_state
  for select
  using (true);

-- Admin-only writes
drop policy if exists "admin_insert" on public_workspace_state;
create policy "admin_insert" on public_workspace_state
  for insert
  with check (public.flbp_is_admin());

drop policy if exists "admin_update" on public_workspace_state;
create policy "admin_update" on public_workspace_state
  for update
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists "admin_delete" on public_workspace_state;
create policy "admin_delete" on public_workspace_state
  for delete
  using (public.flbp_is_admin());

-- Grants (needed for PostgREST)
grant select on public_workspace_state to anon, authenticated;
grant insert, update, delete on public_workspace_state to authenticated;

-- ===== END supabase\migrations\20251226000300_public_read_safe.sql =====


-- ===== BEGIN supabase\migrations\20251226000400_public_career_leaderboard.sql =====

-- FLBP Manager Suite - Public career leaderboard table (safe)
--
-- This table is populated by the client during the explicit "Export strutturato" action.
-- It contains aggregated career stats WITHOUT exposing full YoB.

create table if not exists public_career_leaderboard (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text not null, -- hashed player id (derived from internal playerKey)
  name text not null,
  team_name text not null default '',
  games_played int not null default 0,
  points int not null default 0,
  soffi int not null default 0,
  avg_points numeric(10,2) not null default 0,
  avg_soffi numeric(10,2) not null default 0,
  u25 boolean not null default false,
  yob_label text null, -- optional 2-digit label for UI disambiguation
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists idx_public_career_leaderboard_workspace on public_career_leaderboard(workspace_id);

alter table public_career_leaderboard enable row level security;

-- Public can read
drop policy if exists "public read public_career_leaderboard" on public_career_leaderboard;
create policy "public read public_career_leaderboard" on public_career_leaderboard
  for select
  using (true);

-- Only admins can write
drop policy if exists "admin write public_career_leaderboard" on public_career_leaderboard;
create policy "admin write public_career_leaderboard" on public_career_leaderboard
  for all
  using (flbp_is_admin())
  with check (flbp_is_admin());

-- ===== END supabase\migrations\20251226000400_public_career_leaderboard.sql =====


-- ===== BEGIN supabase\migrations\20251226000500_public_tournaments.sql =====

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

-- ===== END supabase\migrations\20251226000500_public_tournaments.sql =====


-- ===== BEGIN supabase\migrations\20251226000600_public_hall_of_fame.sql =====

-- Public (sanitized) Hall of Fame mirror
-- Safe for public/TV: NO YoB and no internal player keys.

create table if not exists public_hall_of_fame_entries (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text not null,

  year text not null,
  tournament_id text not null,
  tournament_name text not null,
  type text not null check (
    type in ('winner','top_scorer','defender','mvp','top_scorer_u25','defender_u25')
  ),
  team_name text null,
  player_names text[] not null default '{}'::text[],
  value int null,
  created_at timestamptz not null default now(),

  primary key (workspace_id, id)
);

alter table if exists public_hall_of_fame_entries add column if not exists source_type text null;
alter table if exists public_hall_of_fame_entries add column if not exists source_tournament_id text null;
alter table if exists public_hall_of_fame_entries add column if not exists source_tournament_name text null;
alter table if exists public_hall_of_fame_entries add column if not exists source_auto_generated boolean null;
alter table if exists public_hall_of_fame_entries add column if not exists manually_edited boolean null;

create index if not exists idx_public_hof_by_tournament
  on public_hall_of_fame_entries(workspace_id, tournament_id);

create index if not exists idx_public_hof_by_type_year
  on public_hall_of_fame_entries(workspace_id, type, year desc);

alter table public_hall_of_fame_entries enable row level security;

drop policy if exists "public_hof_select" on public_hall_of_fame_entries;
create policy "public_hof_select"
  on public_hall_of_fame_entries
  for select
  using (true);

drop policy if exists "public_hof_admin_write" on public_hall_of_fame_entries;
create policy "public_hof_admin_write"
  on public_hall_of_fame_entries
  for all
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

-- ===== END supabase\migrations\20251226000600_public_hall_of_fame.sql =====


-- ===== BEGIN supabase\migrations\20251230000100_add_round_robin_type.sql =====

-- FLBP Manager Suite
-- Add support for the 'round_robin' tournament type.
--
-- Note: the original tables were created with an inline CHECK constraint on "type".
-- Postgres defaults to the name <table>_<column>_check, so we drop that and re-add
-- with the extended enum list.

alter table tournaments
  drop constraint if exists tournaments_type_check;

alter table tournaments
  add constraint tournaments_type_check
  check (type in ('elimination','groups_elimination','round_robin'));

alter table public_tournaments
  drop constraint if exists public_tournaments_type_check;

alter table public_tournaments
  add constraint public_tournaments_type_check
  check (type in ('elimination','groups_elimination','round_robin'));

-- ===== END supabase\migrations\20251230000100_add_round_robin_type.sql =====


-- ===== BEGIN supabase\migrations\20260323000100_referee_sync_rpc.sql =====

create or replace function public.flbp_referee_auth_check(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_tournament_id text;
  v_expected_password text;
  v_auth_version text;
  v_updated_at timestamptz;
begin
  select ws.state, ws.updated_at
  into v_state, v_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  limit 1;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'workspace_missing');
  end if;

  v_tournament_id := coalesce(v_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    return jsonb_build_object('ok', false, 'reason', 'tournament_mismatch');
  end if;

  v_expected_password := coalesce(v_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_config');
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;

  v_auth_version := nullif(v_state -> 'tournament' ->> 'refereesAuthVersion', '');

  return jsonb_build_object(
    'ok', true,
    'auth_version', v_auth_version,
    'updated_at', v_updated_at
  );
end;
$$;

grant execute on function public.flbp_referee_auth_check(text, text, text) to anon, authenticated;

create or replace function public.flbp_referee_push_live_state(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_state jsonb;
  v_current_updated_at timestamptz;
  v_tournament_id text;
  v_expected_password text;
  v_next_updated_at timestamptz := now();
begin
  select ws.state, ws.updated_at
  into v_current_state, v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  for update;

  if v_current_state is null then
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_tournament_id := coalesce(v_current_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    raise exception 'Torneo live non corrispondente';
  end if;

  v_expected_password := coalesce(v_current_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    raise exception 'Accesso arbitri non configurato per questo torneo';
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    raise exception 'Password arbitri non valida';
  end if;

  if p_base_updated_at is not null and v_current_updated_at is distinct from p_base_updated_at then
    raise exception 'FLBP_DB_CONFLICT: il torneo live è stato aggiornato da un altro dispositivo';
  end if;

  update public.workspace_state
  set state = coalesce(p_state, '{}'::jsonb),
      updated_at = v_next_updated_at
  where workspace_id = p_workspace_id;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (p_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_referee_push_live_state(text, text, text, jsonb, jsonb, timestamptz) to anon, authenticated;

-- ===== END supabase\migrations\20260323000100_referee_sync_rpc.sql =====


-- ===== BEGIN supabase\migrations\20260323000200_public_site_views.sql =====

create table if not exists public.public_site_views_daily (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  view_date date not null,
  views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, view_date)
);

create index if not exists idx_public_site_views_daily_workspace_date
  on public.public_site_views_daily(workspace_id, view_date desc);

alter table public.public_site_views_daily enable row level security;

drop policy if exists "public_site_views_daily_select" on public.public_site_views_daily;
create policy "public_site_views_daily_select"
  on public.public_site_views_daily
  for select
  using (true);

drop policy if exists "public_site_views_daily_admin_write" on public.public_site_views_daily;
create policy "public_site_views_daily_admin_write"
  on public.public_site_views_daily
  for all
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

grant select on public.public_site_views_daily to anon, authenticated;
grant insert, update, delete on public.public_site_views_daily to authenticated;

create or replace function public.flbp_track_site_view(
  p_workspace_id text,
  p_view_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_view_date date := coalesce(p_view_date, (now() at time zone 'utc')::date);
  v_views bigint;
begin
  insert into public.public_site_views_daily (workspace_id, view_date, views, created_at, updated_at)
  values (p_workspace_id, v_view_date, 1, now(), now())
  on conflict (workspace_id, view_date) do update
  set views = public.public_site_views_daily.views + 1,
      updated_at = now()
  returning views into v_views;

  return jsonb_build_object(
    'ok', true,
    'view_date', v_view_date,
    'views', v_views
  );
end;
$$;

grant execute on function public.flbp_track_site_view(text, date) to anon, authenticated;

-- ===== END supabase\migrations\20260323000200_public_site_views.sql =====

-- ===== BEGIN supabase\migrations\20260323000300_admin_auth_roles.sql =====

-- FLBP Manager Suite - Admin Auth roles for public deploy
--
-- Goals:
-- - Require Supabase Auth for Admin entry in the public frontend.
-- - Authorize remote admin reads/writes via Supabase Auth + RLS.
-- - Keep compatibility with old JWT metadata role checks, but prefer a real admin table.
--
-- Manual bootstrap after running this migration:
-- 1) Create the auth user in Supabase Auth (email/password).
-- 2) Insert the corresponding auth.users.id into public.admin_users.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

grant select on public.admin_users to authenticated;

drop policy if exists "admin_users_self_select" on public.admin_users;
create policy "admin_users_self_select"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.flbp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (auth.role() = 'service_role')
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    )
    or (auth.jwt() ->> 'role' = 'admin')
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    or ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
$$;

grant execute on function public.flbp_is_admin() to anon, authenticated;

-- ===== END supabase\migrations\20260323000300_admin_auth_roles.sql =====

-- ===== BEGIN supabase\migrations\20260326000100_birthdate_first_remote.sql =====

-- FLBP Manager Suite - birthDate-first normalized remote layer
--
-- Goals:
-- - add authoritative birthDate fields to normalized admin tables
-- - keep legacy YoB columns for compatibility, but non-authoritative
-- - allow the client to stop using YoB fallback for identity/U25 logic

alter table if exists public.integrations_scorers
  add column if not exists birth_date date null;

alter table if exists public.hall_of_fame_entries
  add column if not exists player_birth_date date null;

alter table if exists public.tournament_teams
  add column if not exists player1_birth_date date null,
  add column if not exists player2_birth_date date null;

comment on column public.integrations_scorers.birth_date is
  'Authoritative player birth date for birthDate-first identity resolution. Legacy yob remains compatibility-only.';

comment on column public.hall_of_fame_entries.player_birth_date is
  'Authoritative player birth date for birthDate-first player identity in awards and provenance.';

comment on column public.tournament_teams.player1_birth_date is
  'Authoritative player 1 birth date for birthDate-first identity resolution.';

comment on column public.tournament_teams.player2_birth_date is
  'Authoritative player 2 birth date for birthDate-first identity resolution.';

-- Optional one-time alignment for legacy YoB columns when a birth date is already present.
update public.integrations_scorers
set yob = extract(year from birth_date)::int
where birth_date is not null
  and (yob is null or yob <> extract(year from birth_date)::int);

update public.tournament_teams
set player1_yob = extract(year from player1_birth_date)::int
where player1_birth_date is not null
  and (player1_yob is null or player1_yob <> extract(year from player1_birth_date)::int);

update public.tournament_teams
set player2_yob = extract(year from player2_birth_date)::int
where player2_birth_date is not null
  and (player2_yob is null or player2_yob <> extract(year from player2_birth_date)::int);

-- Manual rollback if needed:
-- alter table if exists public.tournament_teams
--   drop column if exists player2_birth_date,
--   drop column if exists player1_birth_date;
-- alter table if exists public.hall_of_fame_entries
--   drop column if exists player_birth_date;
-- alter table if exists public.integrations_scorers
--   drop column if exists birth_date;

-- ===== END supabase\migrations\20260326000100_birthdate_first_remote.sql =====

-- ===== BEGIN supabase\migrations\20260326000200_admin_snapshot_write_rpc.sql =====

-- FLBP Manager Suite - atomic admin snapshot write RPC
--
-- Goals:
-- - move admin snapshot conflict checks to the database
-- - avoid client-side race windows between preflight read and write
-- - update workspace_state + public_workspace_state atomically

create or replace function public.flbp_admin_push_workspace_state(
  p_workspace_id text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_current_updated_at timestamptz;
  v_next_updated_at timestamptz := now();
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  select ws.updated_at
  into v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  for update;

  if not coalesce(p_force, false) and v_current_updated_at is not null then
    if p_base_updated_at is null then
      raise exception 'FLBP_DB_CONFLICT: il DB contiene gia'' uno snapshot admin piu'' recente'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;

    if v_current_updated_at is distinct from p_base_updated_at then
      raise exception 'FLBP_DB_CONFLICT: il DB e'' stato aggiornato da un altro admin'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;
  end if;

  insert into public.workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean) to authenticated;

-- ===== END supabase\migrations\20260326000200_admin_snapshot_write_rpc.sql =====


-- ===== BEGIN supabase\migrations\20260326000300_app_supabase_usage_daily.sql =====

create table if not exists public.app_supabase_usage_daily (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  usage_date date not null,
  bucket text not null,
  request_count bigint not null default 0,
  request_bytes bigint not null default 0,
  response_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, usage_date, bucket),
  constraint app_supabase_usage_daily_bucket_check
    check (bucket in ('public', 'tv', 'admin', 'referee', 'sync', 'unknown'))
);

create index if not exists idx_app_supabase_usage_daily_workspace_date
  on public.app_supabase_usage_daily(workspace_id, usage_date desc, bucket);

alter table public.app_supabase_usage_daily enable row level security;

drop policy if exists "app_supabase_usage_daily_admin_select" on public.app_supabase_usage_daily;
create policy "app_supabase_usage_daily_admin_select"
  on public.app_supabase_usage_daily
  for select
  to authenticated
  using (public.flbp_is_admin());

grant select on public.app_supabase_usage_daily to authenticated;

create or replace function public.flbp_track_supabase_usage_batch(
  p_workspace_id text,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if nullif(trim(coalesce(p_workspace_id, '')), '') is null then
    raise exception 'Workspace non valido';
  end if;

  insert into public.workspaces (id)
  values (p_workspace_id)
  on conflict (id) do nothing;

  with payload as (
    select
      coalesce(usage_date, (now() at time zone 'utc')::date) as usage_date,
      case
        when lower(coalesce(bucket, 'unknown')) in ('public', 'tv', 'admin', 'referee', 'sync', 'unknown')
          then lower(coalesce(bucket, 'unknown'))
        else 'unknown'
      end as bucket,
      greatest(coalesce(request_count, 0), 0)::bigint as request_count,
      greatest(coalesce(request_bytes, 0), 0)::bigint as request_bytes,
      greatest(coalesce(response_bytes, 0), 0)::bigint as response_bytes
    from jsonb_to_recordset(
      case
        when jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then coalesce(p_items, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as x(
      usage_date date,
      bucket text,
      request_count bigint,
      request_bytes bigint,
      response_bytes bigint
    )
  ), merged as (
    select
      usage_date,
      bucket,
      sum(request_count)::bigint as request_count,
      sum(request_bytes)::bigint as request_bytes,
      sum(response_bytes)::bigint as response_bytes
    from payload
    group by usage_date, bucket
  )
  insert into public.app_supabase_usage_daily (
    workspace_id,
    usage_date,
    bucket,
    request_count,
    request_bytes,
    response_bytes,
    updated_at
  )
  select
    p_workspace_id,
    usage_date,
    bucket,
    request_count,
    request_bytes,
    response_bytes,
    now()
  from merged
  where request_count > 0 or request_bytes > 0 or response_bytes > 0
  on conflict (workspace_id, usage_date, bucket) do update
  set request_count = public.app_supabase_usage_daily.request_count + excluded.request_count,
      request_bytes = public.app_supabase_usage_daily.request_bytes + excluded.request_bytes,
      response_bytes = public.app_supabase_usage_daily.response_bytes + excluded.response_bytes,
      updated_at = now();

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows
  );
end;
$$;

grant execute on function public.flbp_track_supabase_usage_batch(text, jsonb) to anon, authenticated;

-- ===== END supabase\migrations\20260326000300_app_supabase_usage_daily.sql =====


-- ===== BEGIN supabase\migrations\20260328000100_referee_pull_live_state_rpc.sql =====

-- FLBP Manager Suite - additive referee protected live-state pull RPC
--
-- Goal:
-- - let a referee-authenticated native client read the current full live snapshot
-- - keep the existing web referee auth/push RPCs unchanged
-- - prepare a future native safe-save path without touching the production web flow
--
-- Important:
-- - this migration is additive only
-- - the current web app does not depend on it
-- - apply it only when you are ready to enable the future native path

create or replace function public.flbp_referee_pull_live_state(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_tournament_id text;
  v_expected_password text;
  v_auth_version text;
  v_updated_at timestamptz;
begin
  select ws.state, ws.updated_at
  into v_state, v_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  limit 1;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'workspace_missing');
  end if;

  v_tournament_id := coalesce(v_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    return jsonb_build_object('ok', false, 'reason', 'tournament_mismatch');
  end if;

  v_expected_password := coalesce(v_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_config');
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;

  v_auth_version := nullif(v_state -> 'tournament' ->> 'refereesAuthVersion', '');

  return jsonb_build_object(
    'ok', true,
    'auth_version', v_auth_version,
    'updated_at', v_updated_at,
    'state', v_state
  );
end;
$$;

grant execute on function public.flbp_referee_pull_live_state(text, text, text) to anon, authenticated;

-- ===== END supabase\migrations\20260328000100_referee_pull_live_state_rpc.sql =====

-- ===== BEGIN supabase\migrations\20260328000200_player_app_accounts_and_calls.sql =====

create table if not exists public.player_app_profiles (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  canonical_player_id text null,
  canonical_player_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_player_app_profiles_workspace_player
  on public.player_app_profiles(workspace_id, canonical_player_id);

create table if not exists public.player_app_devices (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  platform text not null check (platform in ('web', 'android', 'ios')),
  device_token text null,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_app_devices_workspace_user
  on public.player_app_devices(workspace_id, user_id);

create table if not exists public.player_app_calls (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  tournament_id text not null,
  team_id text not null,
  team_name text null,
  target_user_id uuid not null,
  target_player_id text null,
  target_player_name text null,
  requested_by_user_id uuid null,
  status text not null check (status in ('ringing', 'acknowledged', 'cancelled', 'expired')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_player_app_calls_workspace_target
  on public.player_app_calls(workspace_id, target_user_id, requested_at desc);

create index if not exists idx_player_app_calls_workspace_team
  on public.player_app_calls(workspace_id, tournament_id, team_id, requested_at desc);

alter table public.player_app_profiles enable row level security;
alter table public.player_app_devices enable row level security;
alter table public.player_app_calls enable row level security;

drop policy if exists player_app_profiles_owner_select on public.player_app_profiles;
create policy player_app_profiles_owner_select on public.player_app_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists player_app_profiles_owner_insert on public.player_app_profiles;
create policy player_app_profiles_owner_insert on public.player_app_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists player_app_profiles_owner_update on public.player_app_profiles;
create policy player_app_profiles_owner_update on public.player_app_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists player_app_profiles_admin_all on public.player_app_profiles;
create policy player_app_profiles_admin_all on public.player_app_profiles
  for all
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists player_app_devices_owner_select on public.player_app_devices;
create policy player_app_devices_owner_select on public.player_app_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists player_app_devices_owner_insert on public.player_app_devices;
create policy player_app_devices_owner_insert on public.player_app_devices
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists player_app_devices_owner_update on public.player_app_devices;
create policy player_app_devices_owner_update on public.player_app_devices
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists player_app_devices_admin_all on public.player_app_devices;
create policy player_app_devices_admin_all on public.player_app_devices
  for all
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists player_app_calls_target_select on public.player_app_calls;
create policy player_app_calls_target_select on public.player_app_calls
  for select
  to authenticated
  using (auth.uid() = target_user_id);

drop policy if exists player_app_calls_admin_select on public.player_app_calls;
create policy player_app_calls_admin_select on public.player_app_calls
  for select
  to authenticated
  using (public.flbp_is_admin());

grant select, insert, update on public.player_app_profiles to authenticated;
grant select, insert, update on public.player_app_devices to authenticated;
grant select on public.player_app_calls to authenticated;

create or replace function public.flbp_player_call_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_id text,
  p_team_name text default null,
  p_target_user_id uuid default null,
  p_target_player_id text default null,
  p_target_player_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_tournament_id text := nullif(trim(coalesce(p_tournament_id, '')), '');
  v_team_id text := nullif(trim(coalesce(p_team_id, '')), '');
  v_call_id text := 'call_' || replace(gen_random_uuid()::text, '-', '');
  v_requested_at timestamptz := now();
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null or v_tournament_id is null or v_team_id is null or p_target_user_id is null then
    raise exception 'Parametri convocazione non validi';
  end if;

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  update public.player_app_calls
  set status = 'cancelled',
      cancelled_at = v_requested_at
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id
    and team_id = v_team_id
    and status in ('ringing', 'acknowledged');

  insert into public.player_app_calls (
    id,
    workspace_id,
    tournament_id,
    team_id,
    team_name,
    target_user_id,
    target_player_id,
    target_player_name,
    requested_by_user_id,
    status,
    requested_at,
    metadata
  )
  values (
    v_call_id,
    v_workspace_id,
    v_tournament_id,
    v_team_id,
    nullif(trim(coalesce(p_team_name, '')), ''),
    p_target_user_id,
    nullif(trim(coalesce(p_target_player_id, '')), ''),
    nullif(trim(coalesce(p_target_player_name, '')), ''),
    auth.uid(),
    'ringing',
    v_requested_at,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'ringing',
    'requested_at', v_requested_at
  );
end;
$$;

create or replace function public.flbp_player_ack_call(
  p_workspace_id text,
  p_call_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_call_id text := nullif(trim(coalesce(p_call_id, '')), '');
  v_row public.player_app_calls%rowtype;
  v_ack_at timestamptz := now();
begin
  if v_workspace_id is null or v_call_id is null then
    raise exception 'Convocazione non valida';
  end if;

  select *
  into v_row
  from public.player_app_calls
  where id = v_call_id
    and workspace_id = v_workspace_id
  for update;

  if not found then
    raise exception 'Convocazione non trovata';
  end if;

  if auth.role() <> 'service_role' and auth.uid() is distinct from v_row.target_user_id then
    raise exception 'Convocazione non assegnata a questo utente';
  end if;

  update public.player_app_calls
  set status = 'acknowledged',
      acknowledged_at = v_ack_at,
      cancelled_at = null
  where id = v_call_id
    and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'acknowledged',
    'acknowledged_at', v_ack_at
  );
end;
$$;

create or replace function public.flbp_player_cancel_call(
  p_workspace_id text,
  p_call_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_call_id text := nullif(trim(coalesce(p_call_id, '')), '');
  v_cancel_at timestamptz := now();
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null or v_call_id is null then
    raise exception 'Convocazione non valida';
  end if;

  update public.player_app_calls
  set status = 'cancelled',
      cancelled_at = v_cancel_at
  where id = v_call_id
    and workspace_id = v_workspace_id;

  if not found then
    raise exception 'Convocazione non trovata';
  end if;

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'cancelled',
    'cancelled_at', v_cancel_at
  );
end;
$$;

grant execute on function public.flbp_player_call_team(text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.flbp_player_ack_call(text, text) to authenticated;
grant execute on function public.flbp_player_cancel_call(text, text) to authenticated;

create or replace function public.flbp_admin_list_player_accounts(
  p_workspace_id text,
  p_origin text default null
)
returns table (
  user_id uuid,
  email text,
  providers text[],
  primary_provider text,
  created_at timestamptz,
  last_login_at timestamptz,
  linked_player_name text,
  birth_date date,
  canonical_player_id text,
  has_profile boolean,
  device_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_origin text := lower(nullif(trim(coalesce(p_origin, '')), ''));
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  return query
  with identity_rows as (
    select
      u.id as user_id,
      case
        when lower(coalesce(i.provider, '')) in ('email', 'password') then 'in_app'
        when lower(coalesce(i.provider, '')) in ('google', 'facebook', 'apple') then lower(i.provider)
        when nullif(trim(u.email), '') is not null then 'in_app'
        else 'other'
      end as origin
    from auth.users u
    left join auth.identities i on i.user_id = u.id
  ),
  aggregated_origins as (
    select
      ir.user_id,
      array_remove(array_agg(distinct ir.origin), null) as origins
    from identity_rows ir
    group by ir.user_id
  ),
  device_counts as (
    select
      d.workspace_id,
      d.user_id,
      count(*)::int as device_count
    from public.player_app_devices d
    where d.workspace_id = v_workspace_id
    group by d.workspace_id, d.user_id
  )
  select
    u.id,
    nullif(trim(u.email), '') as email,
    coalesce(
      ao.origins,
      case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
    ) as providers,
    coalesce(
      (
        coalesce(
          ao.origins,
          case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
        )
      )[1],
      'other'
    ) as primary_provider,
    u.created_at,
    u.last_sign_in_at,
    prof.canonical_player_name,
    prof.birth_date,
    prof.canonical_player_id,
    (prof.user_id is not null) as has_profile,
    coalesce(dc.device_count, 0) as device_count
  from auth.users u
  left join aggregated_origins ao on ao.user_id = u.id
  left join public.player_app_profiles prof
    on prof.workspace_id = v_workspace_id
   and prof.user_id = u.id
  left join device_counts dc
    on dc.workspace_id = v_workspace_id
   and dc.user_id = u.id
  where (
    prof.user_id is not null
    or dc.device_count is not null
    or ao.user_id is not null
  )
  and (
    v_origin is null
    or v_origin = 'all'
    or v_origin = any(
      coalesce(
        ao.origins,
        case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
      )
    )
  )
  order by coalesce(u.last_sign_in_at, u.created_at) desc nulls last, nullif(trim(u.email), '') asc nulls last;
end;
$$;

grant execute on function public.flbp_admin_list_player_accounts(text, text) to authenticated;

-- ===== END supabase\migrations\20260328000200_player_app_accounts_and_calls.sql =====


-- ===== BEGIN supabase\migrations\20260409000100_player_account_merge_requests.sql =====

create table if not exists public.player_account_merge_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  requester_user_id uuid null,
  requester_email text not null,
  requester_first_name text not null,
  requester_last_name text not null,
  requester_birth_date date not null,
  requester_canonical_player_id text null,
  requester_canonical_player_name text null,
  candidate_player_id text not null,
  candidate_player_name text not null,
  candidate_birth_date date null,
  comment text null,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by_user_id uuid null
);

create index if not exists idx_player_account_merge_requests_workspace_status
  on public.player_account_merge_requests(workspace_id, status, created_at desc);

create index if not exists idx_player_account_merge_requests_candidate
  on public.player_account_merge_requests(workspace_id, candidate_player_id, created_at desc);

create index if not exists idx_player_account_merge_requests_requester
  on public.player_account_merge_requests(workspace_id, requester_user_id, created_at desc);

alter table public.player_account_merge_requests enable row level security;

drop policy if exists player_account_merge_requests_admin_all on public.player_account_merge_requests;
create policy player_account_merge_requests_admin_all on public.player_account_merge_requests
  for all
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

grant select, insert, update, delete on public.player_account_merge_requests to authenticated;

-- ===== END supabase\migrations\20260409000100_player_account_merge_requests.sql =====


-- ===== BEGIN supabase\migrations\20260409220000_harden_app_supabase_usage_tracking.sql =====

create or replace function public.flbp_track_supabase_usage_batch(
  p_workspace_id text,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if nullif(trim(coalesce(p_workspace_id, '')), '') is null then
    raise exception 'Workspace non valido';
  end if;

  insert into public.workspaces (id)
  values (p_workspace_id)
  on conflict (id) do nothing;

  with payload as (
    select
      coalesce(usage_date, (now() at time zone 'utc')::date) as usage_date,
      case
        when lower(coalesce(bucket, 'unknown')) in ('public', 'tv', 'admin', 'referee', 'sync', 'unknown')
          then lower(coalesce(bucket, 'unknown'))
        else 'unknown'
      end as bucket,
      least(greatest(coalesce(request_count, 0), 0), 100000)::bigint as request_count,
      least(greatest(coalesce(request_bytes, 0), 0), 536870912)::bigint as request_bytes,
      least(greatest(coalesce(response_bytes, 0), 0), 536870912)::bigint as response_bytes
    from jsonb_to_recordset(
      case
        when jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then coalesce(p_items, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as x(
      usage_date date,
      bucket text,
      request_count bigint,
      request_bytes bigint,
      response_bytes bigint
    )
  ), merged as (
    select
      usage_date,
      bucket,
      least(sum(request_count)::bigint, 100000::bigint) as request_count,
      least(sum(request_bytes)::bigint, 536870912::bigint) as request_bytes,
      least(sum(response_bytes)::bigint, 536870912::bigint) as response_bytes
    from payload
    group by usage_date, bucket
  )
  insert into public.app_supabase_usage_daily (
    workspace_id,
    usage_date,
    bucket,
    request_count,
    request_bytes,
    response_bytes,
    updated_at
  )
  select
    p_workspace_id,
    usage_date,
    bucket,
    request_count,
    request_bytes,
    response_bytes,
    now()
  from merged
  where request_count > 0 or request_bytes > 0 or response_bytes > 0
  on conflict (workspace_id, usage_date, bucket) do update
  set request_count = least(public.app_supabase_usage_daily.request_count + excluded.request_count, 100000::bigint),
      request_bytes = least(public.app_supabase_usage_daily.request_bytes + excluded.request_bytes, 536870912::bigint),
      response_bytes = least(public.app_supabase_usage_daily.response_bytes + excluded.response_bytes, 536870912::bigint),
      updated_at = now();

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows
  );
end;
$$;

-- ===== END supabase\migrations\20260409220000_harden_app_supabase_usage_tracking.sql =====


-- ===== BEGIN supabase\migrations\20260409221000_rebaseline_supabase_usage_cycle.sql =====

do $$
declare
  v_workspace_id text := 'default';
  v_cycle_start date := date '2026-03-22';
  v_cycle_end date := date '2026-04-09';
  v_target_response_bytes bigint := 469000000;
  v_response_total numeric := 0;
  v_scale numeric := 0;
begin
  select coalesce(sum(response_bytes), 0)
  into v_response_total
  from public.app_supabase_usage_daily
  where workspace_id = v_workspace_id
    and usage_date >= v_cycle_start
    and usage_date <= v_cycle_end;

  if v_response_total <= 0 then
    return;
  end if;

  v_scale := v_target_response_bytes::numeric / v_response_total;

  with scoped as (
    select
      workspace_id,
      usage_date,
      bucket,
      request_count,
      request_bytes,
      response_bytes,
      (request_count > 100000 or request_bytes > 268435456) as is_outlier,
      round(response_bytes * v_scale)::bigint as response_bytes_new,
      round(request_bytes * v_scale)::bigint as request_bytes_scaled,
      greatest(1::bigint, round(request_count * v_scale)::bigint) as request_count_scaled
    from public.app_supabase_usage_daily
    where workspace_id = v_workspace_id
      and usage_date >= v_cycle_start
      and usage_date <= v_cycle_end
  ), normalized as (
    select
      workspace_id,
      usage_date,
      bucket,
      response_bytes_new,
      case
        when is_outlier and response_bytes_new > 0
          then least(request_bytes_scaled, greatest(round(response_bytes_new * 0.35)::bigint, 262144::bigint), 16777216::bigint)
        when is_outlier
          then least(request_bytes_scaled, 16777216::bigint)
        else request_bytes_scaled
      end as request_bytes_new,
      case
        when is_outlier and response_bytes_new > 0
          then greatest(
            1::bigint,
            ceil((
              least(request_bytes_scaled, greatest(round(response_bytes_new * 0.35)::bigint, 262144::bigint), 16777216::bigint)
              + response_bytes_new
            )::numeric / 65536.0)::bigint
          )
        when is_outlier
          then greatest(
            1::bigint,
            ceil((least(request_bytes_scaled, 16777216::bigint) + response_bytes_new)::numeric / 65536.0)::bigint
          )
        else request_count_scaled
      end as request_count_new
    from scoped
  )
  update public.app_supabase_usage_daily target
  set request_count = normalized.request_count_new,
      request_bytes = normalized.request_bytes_new,
      response_bytes = normalized.response_bytes_new,
      updated_at = now()
  from normalized
  where target.workspace_id = normalized.workspace_id
    and target.usage_date = normalized.usage_date
    and target.bucket = normalized.bucket;
end;
$$;

-- ===== END supabase\migrations\20260409221000_rebaseline_supabase_usage_cycle.sql =====

-- ===== BEGIN supabase\migrations\20260414000100_player_call_match_scope.sql =====

drop function if exists public.flbp_player_call_team(text, text, text, text, uuid, text, text);

create or replace function public.flbp_player_call_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_id text,
  p_team_name text default null,
  p_target_user_id uuid default null,
  p_target_player_id text default null,
  p_target_player_name text default null,
  p_match_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_tournament_id text := nullif(trim(coalesce(p_tournament_id, '')), '');
  v_team_id text := nullif(trim(coalesce(p_team_id, '')), '');
  v_match_id text := nullif(trim(coalesce(p_match_id, '')), '');
  v_call_id text := 'call_' || replace(gen_random_uuid()::text, '-', '');
  v_requested_at timestamptz := now();
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null or v_tournament_id is null or v_team_id is null or p_target_user_id is null then
    raise exception 'Parametri convocazione non validi';
  end if;

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  update public.player_app_calls
  set status = 'cancelled',
      cancelled_at = v_requested_at
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id
    and team_id = v_team_id
    and status in ('ringing', 'acknowledged')
    and (
      v_match_id is null
      or coalesce(metadata->>'match_id', metadata->>'matchId', '') = v_match_id
      or (not (metadata ? 'match_id') and not (metadata ? 'matchId'))
    );

  insert into public.player_app_calls (
    id, workspace_id, tournament_id, team_id, team_name,
    target_user_id, target_player_id, target_player_name,
    requested_by_user_id, status, requested_at, metadata
  )
  values (
    v_call_id, v_workspace_id, v_tournament_id, v_team_id,
    nullif(trim(coalesce(p_team_name, '')), ''),
    p_target_user_id,
    nullif(trim(coalesce(p_target_player_id, '')), ''),
    nullif(trim(coalesce(p_target_player_name, '')), ''),
    auth.uid(),
    'ringing',
    v_requested_at,
    case
      when v_match_id is null then '{}'::jsonb
      else jsonb_build_object('match_id', v_match_id)
    end
  );

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'ringing',
    'requested_at', v_requested_at,
    'match_id', v_match_id
  );
end;
$$;

grant execute on function public.flbp_player_call_team(text, text, text, text, uuid, text, text, text) to authenticated;

create or replace function public.flbp_referee_cancel_player_calls(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text,
  p_team_ids text[] default null,
  p_match_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_tournament_id text := nullif(trim(coalesce(p_tournament_id, '')), '');
  v_match_id text := nullif(trim(coalesce(p_match_id, '')), '');
  v_team_ids text[] := '{}'::text[];
  v_current_state jsonb;
  v_live_tournament_id text;
  v_expected_password text;
  v_cancelled_at timestamptz := now();
  v_rows jsonb := '[]'::jsonb;
begin
  if v_workspace_id is null or v_tournament_id is null then
    raise exception 'Parametri convocazione non validi';
  end if;

  select coalesce(array_agg(team_id), '{}'::text[])
  into v_team_ids
  from (
    select nullif(trim(value), '') as team_id
    from unnest(coalesce(p_team_ids, '{}'::text[])) as value
  ) normalized
  where team_id is not null;

  if v_match_id is null and cardinality(v_team_ids) = 0 then
    raise exception 'Parametri convocazione non validi';
  end if;

  select ws.state
  into v_current_state
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  limit 1;

  if v_current_state is null then
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_live_tournament_id := coalesce(v_current_state -> 'tournament' ->> 'id', '');
  if v_live_tournament_id = '' or v_live_tournament_id <> v_tournament_id then
    raise exception 'Torneo live non corrispondente';
  end if;

  v_expected_password := coalesce(v_current_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' or v_expected_password <> coalesce(p_referees_password, '') then
    raise exception 'Password arbitri non valida';
  end if;

  with cancelled as (
    update public.player_app_calls
    set status = 'cancelled',
        cancelled_at = v_cancelled_at
    where workspace_id = v_workspace_id
      and tournament_id = v_tournament_id
      and status in ('ringing', 'acknowledged')
      and (cardinality(v_team_ids) = 0 or team_id = any(v_team_ids))
      and (
        v_match_id is null
        or coalesce(metadata->>'match_id', metadata->>'matchId', '') = v_match_id
        or (not (metadata ? 'match_id') and not (metadata ? 'matchId'))
      )
    returning id, workspace_id, tournament_id, team_id, team_name,
      target_user_id, target_player_id, target_player_name, requested_by_user_id,
      status, requested_at, acknowledged_at, cancelled_at, metadata
  )
  select coalesce(jsonb_agg(to_jsonb(cancelled) order by requested_at desc), '[]'::jsonb)
  into v_rows
  from cancelled;

  return v_rows;
end;
$$;

grant execute on function public.flbp_referee_cancel_player_calls(text, text, text, text[], text) to anon, authenticated;

-- ===== END supabase\migrations\20260414000100_player_call_match_scope.sql =====

-- ===== BEGIN supabase\migrations\20260416000100_fanta_beerpong_schema.sql =====
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
-- ===== END supabase\migrations\20260416000100_fanta_beerpong_schema.sql =====

-- ===== BEGIN supabase\migrations\20260417000200_fanta_live_tournament_resolution.sql =====
-- Resolve FantaBeerpong against the current live tournament when fanta_config points to an archived tournament.
-- Manual lock/open flags apply only when fanta_config belongs to the resolved tournament.

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
  v_config_tournament_id text;
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
    c.active_tournament_id,
    coalesce(c.registration_open, true),
    coalesce(c.is_lock_active, false)
  into v_config_tournament_id, v_registration_open, v_lock_active
  from fanta_config c
  where c.workspace_id = p_workspace_id;

  v_tournament_id := nullif(p_tournament_id, '');

  if v_tournament_id is null and v_config_tournament_id is not null then
    select id into v_tournament_id
    from tournaments
    where workspace_id = p_workspace_id
      and id = v_config_tournament_id
      and status = 'live'
    limit 1;
  end if;

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

  if coalesce(v_config_tournament_id, '') <> v_tournament_id then
    v_registration_open := true;
    v_lock_active := false;
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

grant execute on function public.fanta_save_team(text, text, text, jsonb) to authenticated;
-- ===== END supabase\migrations\20260417000200_fanta_live_tournament_resolution.sql =====

-- ===== BEGIN supabase\migrations\20260417000300_fanta_require_live_tournament_save.sql =====
-- Fanta rosters can only be saved against a live tournament, even when a stale client sends an explicit tournament id.

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
  v_config_tournament_id text;
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
    c.active_tournament_id,
    coalesce(c.registration_open, true),
    coalesce(c.is_lock_active, false)
  into v_config_tournament_id, v_registration_open, v_lock_active
  from fanta_config c
  where c.workspace_id = p_workspace_id;

  v_tournament_id := nullif(p_tournament_id, '');

  if v_tournament_id is null and v_config_tournament_id is not null then
    select id into v_tournament_id
    from tournaments
    where workspace_id = p_workspace_id
      and id = v_config_tournament_id
      and status = 'live'
    limit 1;
  end if;

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
    where workspace_id = p_workspace_id
      and id = v_tournament_id
      and status = 'live'
  ) then
    raise exception 'FantaBeerpong rosters can only be saved while the tournament is live.';
  end if;

  if coalesce(v_config_tournament_id, '') <> v_tournament_id then
    v_registration_open := true;
    v_lock_active := false;
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

grant execute on function public.fanta_save_team(text, text, text, jsonb) to authenticated;
-- ===== END supabase\migrations\20260417000300_fanta_require_live_tournament_save.sql =====
