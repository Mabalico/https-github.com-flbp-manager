-- Admin authorization must never trust user-editable Supabase metadata.
-- Keep the existing server-controlled claims for compatibility, and always
-- return a non-NULL boolean so legacy imperative `if not` gates fail closed.

create or replace function public.flbp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.role() = 'service_role')
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    )
    or (auth.jwt() ->> 'role' = 'admin')
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'),
    false
  );
$$;

revoke all on function public.flbp_is_admin() from public;
grant execute on function public.flbp_is_admin() to anon, authenticated, service_role;

-- Older installations contain different overloads of these Admin-only RPCs.
-- Revoke PostgreSQL's implicit PUBLIC execution on every existing overload,
-- without requiring later ONLINE-only migrations in the legacy schema.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'flbp_admin_push_workspace_state',
        'flbp_admin_push_match_result',
        'flbp_archive_fanta_tournament'
      )
  loop
    execute format('revoke all on function %s from public, anon', v_function.signature);
    execute format('grant execute on function %s to authenticated, service_role', v_function.signature);
  end loop;
end;
$$;
