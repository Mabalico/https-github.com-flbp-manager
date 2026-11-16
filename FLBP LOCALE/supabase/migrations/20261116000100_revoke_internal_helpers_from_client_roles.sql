-- Internal SECURITY DEFINER helpers must not be reachable through the client API.
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon and authenticated explicitly, so the historical `revoke ... from public`
-- left these helpers callable through /rest/v1/rpc. They perform no
-- authorization of their own: the Admin, referee, local data-plane and restore
-- RPCs that call them do, and those callers are SECURITY DEFINER, so they keep
-- working with the owner's privileges.
-- Every existing overload is revoked by name: the same file is a no-op on a
-- schema that does not contain a helper (FLBP LOCALE) and is safe to reapply.

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
        'flbp_apply_match_result_patch',
        'flbp_upsert_public_workspace_live',
        'flbp_log_referee_auth_audit',
        'flbp_referee_auth_is_rate_limited'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.signature);
    execute format('grant execute on function %s to service_role', v_function.signature);
  end loop;
end;
$$;
