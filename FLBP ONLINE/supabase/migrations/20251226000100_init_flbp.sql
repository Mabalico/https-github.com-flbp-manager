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
