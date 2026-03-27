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
