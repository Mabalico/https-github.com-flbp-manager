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
