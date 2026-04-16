-- FLBP Manager Suite - FantaBeerpong Schema
-- 
-- Adds persistence for fantasy teams, rosters, and global fantasy config.
-- Integrated with Supabase Auth and RLS.

-- 1. Fantasy Configuration
create table if not exists fanta_config (
  workspace_id text primary key references workspaces(id) on delete cascade,
  active_tournament_id text not null,
  is_lock_active boolean not null default false,
  registration_open boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2. Fantasy Teams
create table if not exists fanta_teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id) -- One fanta team per workspace per user
);

-- 3. Fantasy Rosters (Mapping players to teams)
-- Roles: 'captain', 'defender', 'starter'
create table if not exists fanta_rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  player_id text not null, -- Corresponds to the real player_key
  role text not null check (role in ('captain', 'defender', 'starter')),
  created_at timestamptz not null default now(),
  unique (team_id, player_id)
);

-- RLS Enable
alter table fanta_config enable row level security;
alter table fanta_teams enable row level security;
alter table fanta_rosters enable row level security;

-- Policies: fanta_config
-- Public read, Admin write
create policy "Public read fanta_config" on fanta_config for select using (true);
create policy "Admin write fanta_config" on fanta_config for all 
  using (public.flbp_is_admin()) with check (public.flbp_is_admin());

-- Policies: fanta_teams
-- Public read (for standings), Owner write
create policy "Public read fanta_teams" on fanta_teams for select using (true);
create policy "Owner CRUD fanta_teams" on fanta_teams for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Policies: fanta_rosters
-- Public read (for team details), Owner write (inherited via team_id check)
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

-- Helper View for Standings (Join rosters with match stats)
-- This view can be used to see real-time performance.
create or replace view fanta_live_standings as
select 
  t.id as team_id,
  t.name as team_name,
  t.user_id,
  r.player_id,
  r.role,
  sum(ms.canestri) as raw_goals,
  sum(ms.soffi) as raw_blows,
  -- Multiplication logic based on roles (TBD in service, or here for speed)
  case 
    when r.role = 'captain' then sum(ms.canestri) * 2 
    else sum(ms.canestri)
  end as weighted_goals
from fanta_teams t
join fanta_rosters r on t.id = r.team_id
left join tournament_match_stats ms on r.player_id = ms.player_key
group by t.id, t.name, t.user_id, r.player_id, r.role;

-- Grants
grant select on fanta_config to anon, authenticated;
grant select on fanta_teams to anon, authenticated;
grant select on fanta_rosters to anon, authenticated;
grant select on fanta_live_standings to anon, authenticated;

grant insert, update, delete on fanta_teams to authenticated;
grant insert, update, delete on fanta_rosters to authenticated;
grant insert, update, delete on fanta_config to authenticated; -- Admin only handled by RLS
