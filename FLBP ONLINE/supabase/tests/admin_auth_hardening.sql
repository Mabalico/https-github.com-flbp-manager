-- Run only on a disposable local database after applying the migrations.
-- Real role changes, RLS reads/writes and the application snapshot RPC are
-- exercised. Every fixture and test helper is rolled back at the end.
begin;

create schema flbp_test_auth;
grant usage on schema flbp_test_auth to anon, authenticated, service_role;

create function flbp_test_auth.assert_true(p_condition boolean, p_label text)
returns text language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception 'Admin auth assertion failed: %', p_label;
  end if;
  return 'PASS: ' || p_label;
end;
$$;

create function flbp_test_auth.assert_snapshot_denied(p_label text)
returns text language plpgsql as $$
declare
  v_denied boolean := false;
begin
  begin
    perform public.flbp_admin_push_workspace_state(
      'flbp-auth-security-test', '{"unauthorized":true}'::jsonb, '{}'::jsonb, null, true
    );
  exception
    when insufficient_privilege then v_denied := true;
    when raise_exception then
      if sqlerrm <> 'Accesso admin richiesto' then raise; end if;
      v_denied := true;
  end;
  return flbp_test_auth.assert_true(v_denied, p_label);
end;
$$;

create function flbp_test_auth.assert_rls_write_denied(p_label text)
returns text language plpgsql as $$
declare
  v_denied boolean := false;
begin
  begin
    insert into public.workspaces(id) values ('flbp-auth-unauthorized-write');
  exception when insufficient_privilege then v_denied := true;
  end;
  return flbp_test_auth.assert_true(v_denied, p_label);
end;
$$;

-- Explicit grants model the ordinary Supabase API role privileges; the
-- production policies, not missing table grants, must reject these writes.
grant select, insert, update, delete on public.workspaces, public.workspace_state
  to anon, authenticated, service_role;
insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000001', 'ordinary@security-test.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'admin@security-test.invalid');
insert into public.admin_users(user_id, email) values
  ('00000000-0000-4000-8000-000000000002', 'admin@security-test.invalid');
insert into public.workspaces(id) values ('flbp-auth-security-test');
insert into public.workspace_state(workspace_id, state)
  values ('flbp-auth-security-test', '{"private":true}');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is false, 'missing claims return false, never NULL');
select flbp_test_auth.assert_true((select count(*) = 0 from public.workspace_state where workspace_id = 'flbp-auth-security-test'), 'anonymous private read is denied by RLS');
select flbp_test_auth.assert_snapshot_denied('anonymous snapshot RPC cannot write');
select flbp_test_auth.assert_rls_write_denied('anonymous direct write is denied by RLS');
select set_config('request.jwt.claims', '{"role":"anon","user_metadata":{"role":"admin"}}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is false, 'anonymous user metadata cannot grant admin');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is false, 'ordinary player without metadata is not admin');
select flbp_test_auth.assert_snapshot_denied('ordinary player cannot use the legacy IF NOT gate');
select flbp_test_auth.assert_rls_write_denied('ordinary player direct write is denied');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","user_metadata":{"role":"admin"}}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is false, 'self-assigned user_metadata.role cannot grant admin');
select flbp_test_auth.assert_true((select count(*) = 0 from public.workspace_state where workspace_id = 'flbp-auth-security-test'), 'self-assigned role cannot read the private snapshot');
select flbp_test_auth.assert_snapshot_denied('self-assigned role cannot force a snapshot write');
select flbp_test_auth.assert_rls_write_denied('self-assigned role cannot insert through RLS');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":null,"user_metadata":{"role":"admin"}}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is false, 'NULL trusted metadata stays fail-closed');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is true, 'server-controlled app_metadata admin remains compatible');
select flbp_test_auth.assert_true((select count(*) = 1 from public.workspace_state where workspace_id = 'flbp-auth-security-test'), 'trusted admin can read through RLS');
select flbp_test_auth.assert_true((public.flbp_admin_push_workspace_state('flbp-auth-security-test', '{"writer":"trusted-claim"}', '{}', null, true)->>'ok')::boolean, 'trusted admin can write through the real RPC');
select set_config('request.jwt.claims', '{"role":"admin","sub":"00000000-0000-4000-8000-000000000001"}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is true, 'server-signed legacy role claim remains compatible');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is true, 'admin_users membership grants admin');
select flbp_test_auth.assert_true((public.flbp_admin_push_workspace_state('flbp-auth-security-test', '{"writer":"member"}', '{}', null, true)->>'ok')::boolean, 'member admin can write through the real RPC');
select flbp_test_auth.assert_true((select state->>'writer' = 'member' from public.workspace_state where workspace_id = 'flbp-auth-security-test'), 'authorized write is persisted and readable');
reset role;

delete from public.admin_users where user_id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
select flbp_test_auth.assert_true(public.flbp_is_admin() is false, 'removing membership revokes access without token refresh');
select flbp_test_auth.assert_snapshot_denied('removed admin cannot write');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select flbp_test_auth.assert_true(public.flbp_is_admin() is true, 'service role remains authorized');
select flbp_test_auth.assert_true((public.flbp_admin_push_workspace_state('flbp-auth-security-test', '{"writer":"service"}', '{}', null, true)->>'ok')::boolean, 'service role retains RPC execution and writes');
reset role;

select flbp_test_auth.assert_true(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('flbp_admin_push_workspace_state', 'flbp_admin_push_match_result', 'flbp_archive_fanta_tournament')
    and has_function_privilege('anon', p.oid, 'execute')
), 'anonymous execution is revoked on every existing Admin RPC overload');
select flbp_test_auth.assert_true(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('flbp_admin_push_workspace_state', 'flbp_admin_push_match_result', 'flbp_archive_fanta_tournament')
    and (not has_function_privilege('authenticated', p.oid, 'execute')
      or not has_function_privilege('service_role', p.oid, 'execute'))
), 'authenticated and service roles retain Admin RPC execution');

rollback;
