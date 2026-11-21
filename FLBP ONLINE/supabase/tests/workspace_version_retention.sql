-- Bounded cloud version history. Real schema in disposable PostgreSQL; every
-- fixture rolls back.
begin;
create schema retention_test;
grant usage on schema retention_test to service_role;
create table retention_test.checks(label text);
grant insert on retention_test.checks to service_role;
create function retention_test.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Retention assertion failed: %', p_label; end if;
  insert into retention_test.checks values (p_label);
end;
$$;

select retention_test.check(
  not has_function_privilege('anon', 'public.flbp_prune_workspace_state_versions(text,integer,integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.flbp_prune_workspace_state_versions(text,integer,integer,integer)', 'EXECUTE'),
  'client roles cannot prune the history');

insert into public.workspaces(id) values ('retention-test'), ('retention-recent');

-- Fixture: 260 versions older than 30 days plus the current version. The
-- retention trigger is paused only while the backlog is created.
alter table public.workspace_state_versions disable trigger flbp_workspace_state_versions_retention;
insert into public.workspace_state(workspace_id, state, version, last_operation_id, updated_at)
  values ('retention-test', '{"label":"current"}', 1000, 'retention-current', now());
insert into public.workspace_state_versions(workspace_id, version, state, operation_id, created_at)
  select 'retention-test', n, jsonb_build_object('n', n), 'retention-old-' || n, now() - interval '40 days'
  from generate_series(1, 260) n;
-- An old copy of the current operation must never be removed.
update public.workspace_state_versions set operation_id = 'retention-current'
  where workspace_id = 'retention-test' and version = 1;
alter table public.workspace_state_versions enable trigger flbp_workspace_state_versions_retention;

select retention_test.check(
  (select count(*) = 261 from public.workspace_state_versions where workspace_id = 'retention-test'),
  'the backlog fixture is in place');

insert into public.workspace_state_versions(workspace_id, version, state, operation_id)
  values ('retention-test', 261, '{"n":261}', 'retention-new-261');
select retention_test.check(
  (select count(*) = 212 from public.workspace_state_versions where workspace_id = 'retention-test'),
  'one new version removes at most 50 old versions');
select retention_test.check(
  (select min(version) = 52 from public.workspace_state_versions where workspace_id = 'retention-test' and version > 1),
  'the oldest eligible versions go first');
select retention_test.check(
  exists (select 1 from public.workspace_state_versions where workspace_id = 'retention-test' and version = 1),
  'the version of the current operation is protected');

insert into public.workspace_state_versions(workspace_id, version, state, operation_id)
  values ('retention-test', 262, '{"n":262}', 'retention-new-262');
select retention_test.check(
  (select count(*) = 201 from public.workspace_state_versions where workspace_id = 'retention-test'),
  'the backlog drains down to the 200 newest versions plus the protected one');
select retention_test.check(
  (select count(*) = 200 from public.workspace_state_versions where workspace_id = 'retention-test' and version >= 64),
  'the 200 newest versions are kept');

-- Recent history is never removed, however long it is.
insert into public.workspace_state_versions(workspace_id, version, state, operation_id)
  select 'retention-recent', n, jsonb_build_object('n', n), 'retention-recent-' || n
  from generate_series(1, 300) n;
select retention_test.check(
  (select count(*) = 300 from public.workspace_state_versions where workspace_id = 'retention-recent'),
  'versions younger than 30 days are kept beyond the 200 newest');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select retention_test.check(
  public.flbp_prune_workspace_state_versions('retention-test', 30, 200, 5000) = 0,
  'a manual run after the drain finds nothing left to remove');
reset role;

select count(*) as retention_checks from retention_test.checks;
rollback;
