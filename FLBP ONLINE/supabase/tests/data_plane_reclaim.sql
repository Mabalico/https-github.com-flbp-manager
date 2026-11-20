-- Forgotten local mode: automatic cloud reclaim after the grace period.
-- Real roles in disposable PostgreSQL; every fixture rolls back.
begin;
create schema reclaim_test;
grant usage on schema reclaim_test to authenticated, service_role;
create table reclaim_test.checks(label text);
grant insert on reclaim_test.checks to authenticated, service_role;
create function reclaim_test.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Reclaim assertion failed: %', p_label; end if;
  insert into reclaim_test.checks values (p_label);
end;
$$;

insert into public.workspaces(id) values ('reclaim-test');
insert into public.workspace_state(workspace_id, state, updated_at, version)
  values ('reclaim-test', '{}', now(), 5);
insert into public.flbp_data_plane(workspace_id, mode, node_id, base_url, epoch, lease_expires_at)
  values ('reclaim-test', 'local', 'fixture-node', 'http://fixture.invalid', 3, now() - interval '1 hour');

select reclaim_test.check(
  not has_function_privilege('anon', 'public.flbp_admin_reclaim_cloud_data_plane(text,bigint,boolean)', 'EXECUTE'),
  'anonymous users cannot reclaim');
select reclaim_test.check(
  has_function_privilege('authenticated', 'public.flbp_admin_reclaim_cloud_data_plane(text,bigint,boolean)', 'EXECUTE'),
  'authenticated sessions reach the Admin check');

select set_config('request.jwt.claims', '{"role":"authenticated","user_metadata":{"role":"admin"}}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 3, true);
    raise exception 'Non-admin reclaim was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Accesso admin richiesto' then raise; end if;
  end;
  perform reclaim_test.check(true, 'non-admin sessions cannot reclaim');
end;
$$;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
do $$
declare v_out jsonb;
begin
  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 3, true);
  perform reclaim_test.check(v_out->>'ok' = 'false' and v_out->>'reason' = 'grace',
    'a lease expired one hour ago stays locked even when loss is accepted');
  perform reclaim_test.check((v_out->>'reclaim_at')::timestamptz = (v_out->>'lease_expired_at')::timestamptz + interval '12 hours',
    'the unlock time is twelve hours after the lease expired');

  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 2, false);
  perform reclaim_test.check(v_out->>'reason' = 'epoch_changed', 'a stale epoch is refused');
end;
$$;
reset role;

update public.flbp_data_plane set lease_expires_at = now() + interval '1 minute' where workspace_id = 'reclaim-test';
set local role authenticated;
do $$
declare v_out jsonb;
begin
  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 3, true);
  perform reclaim_test.check(v_out->>'reason' = 'local_active', 'a live local lease is never reclaimed');
end;
$$;
reset role;

-- Twelve hours of silence, but the remote journal is ahead of the snapshot.
update public.flbp_data_plane set lease_expires_at = now() - interval '13 hours' where workspace_id = 'reclaim-test';
-- The journal guard accepts only the server role, as the local node's RPC does.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.flbp_local_operation_log(workspace_id, node_id, primary_epoch, operation_id, local_version, operation_kind, payload, created_at)
  values ('reclaim-test', 'fixture-node', 3, 'reclaim-op-5', 5, 'state-patch', '{}', now() - interval '14 hours'),
         ('reclaim-test', 'fixture-node', 3, 'reclaim-op-6', 6, 'state-patch', '{}', now() - interval '13 hours');
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
do $$
declare v_out jsonb;
begin
  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 3, false);
  perform reclaim_test.check(v_out->>'ok' = 'false' and v_out->>'reason' = 'missing_operations'
    and (v_out->>'missing_operations')::bigint = 1,
    'operations newer than the cloud snapshot require an explicit choice');
  perform reclaim_test.check((select mode = 'local' and epoch = 3 from public.flbp_data_plane where workspace_id = 'reclaim-test'),
    'a refused reclaim leaves the plane untouched');

  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 3, true);
  perform reclaim_test.check(v_out->>'ok' = 'true' and v_out->>'reclaimed' = 'true'
    and (v_out->>'epoch')::bigint = 4 and (v_out->>'missing_operations')::bigint = 1,
    'accepting the loss reclaims and reports the missing operations');
  perform reclaim_test.check((select mode = 'cloud' and epoch = 4 and node_id is null and lease_expires_at is null
      from public.flbp_data_plane where workspace_id = 'reclaim-test'),
    'the plane returns to cloud with a new epoch');

  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 3, false);
  perform reclaim_test.check(v_out->>'ok' = 'true' and v_out->>'reclaimed' = 'false',
    'a second call on a cloud plane is a no-op');
end;
$$;
reset role;

-- The fenced PC cannot renew its old lease.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare v_out jsonb;
begin
  v_out := public.flbp_local_heartbeat_data_plane('reclaim-test', 'fixture-node', 3, 60);
  perform reclaim_test.check(v_out->>'accepted' = 'false', 'the old node heartbeat is refused after reclaim');
end;
$$;
reset role;

-- A journal fully covered by the snapshot reclaims without asking. The snapshot
-- is moved forward while the plane is still cloud, as a final backup would.
update public.workspace_state set version = 9 where workspace_id = 'reclaim-test';
update public.flbp_data_plane
  set mode = 'local', node_id = 'fixture-node-2', base_url = 'http://fixture.invalid',
      lease_expires_at = now() - interval '12 hours 1 minute'
  where workspace_id = 'reclaim-test';
insert into public.flbp_local_operation_log(workspace_id, node_id, primary_epoch, operation_id, local_version, operation_kind, payload, created_at)
  values ('reclaim-test', 'fixture-node-2', 4, 'reclaim-op-9', 9, 'state-patch', '{}', now() - interval '13 hours');
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
do $$
declare v_out jsonb;
begin
  v_out := public.flbp_admin_reclaim_cloud_data_plane('reclaim-test', 4, false);
  perform reclaim_test.check(v_out->>'reclaimed' = 'true' and (v_out->>'epoch')::bigint = 5
    and (v_out->>'missing_operations')::bigint = 0,
    'a fully backed-up journal reclaims automatically');
end;
$$;
reset role;

select count(*) as reclaim_checks from reclaim_test.checks;
rollback;
