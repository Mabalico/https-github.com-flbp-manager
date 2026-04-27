-- FLBP Manager Suite - enable Supabase Realtime on workspace_state
--
-- Scope:
-- - allow admin sessions to receive INSERT/UPDATE events on the shared
--   workspace snapshot, so concurrent admin edits show up in real time
-- - keep RLS unchanged: the existing admin_all policy on workspace_state
--   already gates SELECT to flbp_is_admin(), and Realtime respects RLS
-- - non-blocking: if the publication or table is missing the migration
--   does not fail (idempotent guard)

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'workspace_state'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_state'
  ) then
    execute 'alter publication supabase_realtime add table public.workspace_state';
  end if;
end $$;
