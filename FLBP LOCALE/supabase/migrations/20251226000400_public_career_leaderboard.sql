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
