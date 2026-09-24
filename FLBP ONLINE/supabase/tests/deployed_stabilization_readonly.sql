-- Safe on production: metadata assertions and forged-claim rejection only.
-- No application records are exported or changed.
begin read only;
set local statement_timeout = '15s';
do $$
declare
  v_signature regprocedure;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'database_restore_checkpoints' and c.relrowsecurity
  ) then raise exception 'Restore checkpoint RLS missing'; end if;
  if has_table_privilege('anon', 'public.database_restore_checkpoints', 'SELECT, INSERT, UPDATE, DELETE')
    or has_table_privilege('authenticated', 'public.database_restore_checkpoints', 'SELECT, INSERT, UPDATE, DELETE')
  then raise exception 'Restore checkpoint accessible to a client role'; end if;
  foreach v_signature in array array[
    'public.flbp_export_application_database(text)'::regprocedure,
    'public.flbp_restore_application_database(text,jsonb,uuid,text,text)'::regprocedure
  ] loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
      or has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or not has_function_privilege('service_role', v_signature, 'EXECUTE')
    then raise exception 'Incorrect restore RPC privileges: %', v_signature; end if;
  end loop;
  for v_signature in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'flbp_admin_push_workspace_state', 'flbp_admin_push_match_result', 'flbp_archive_fanta_tournament'
    )
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
    then raise exception 'Admin RPC accessible to anonymous users: %', v_signature; end if;
  end loop;
  if to_regprocedure('public.flbp_referee_apply_match_updates(text,text,jsonb)') is not null then
    for v_signature in
      select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'flbp_referee_check_credentials', 'flbp_referee_collect_matches',
        'flbp_referee_merge_match_array', 'flbp_referee_merge_match_state', 'flbp_referee_apply_match_updates',
        'flbp_referee_public_projection'
      )
    loop
      if has_function_privilege('anon', v_signature, 'EXECUTE')
        or has_function_privilege('authenticated', v_signature, 'EXECUTE')
      then raise exception 'Internal referee helper accessible to client roles: %', v_signature; end if;
    end loop;
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'flbp_admin_push_workspace_state', 'flbp_admin_push_match_result', 'flbp_apply_match_result_patch'
      ) and strpos(pg_get_functiondef(p.oid), 'A09_ADVISORY_BEFORE_WORKSPACE_ROW') = 0
    ) then raise exception 'An Admin write path lacks the common lock order'; end if;
  end if;
end;
$$;
set local role anon;
do $$
begin
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.flbp_is_admin() is distinct from false then raise exception 'Anonymous admin gate failed'; end if;
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000","user_metadata":{"role":"admin","admin":true}}', true);
  if public.flbp_is_admin() is distinct from false then raise exception 'User-controlled metadata granted admin'; end if;
end;
$$;
rollback;
select 'Deployed authorization and atomic restore contract: PASS (read only)' as verification;
