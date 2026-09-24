-- Integration test for an already migrated, disposable local Supabase database.
-- All fixture/data/schema changes are rolled back. No pgTAP dependency.
begin;
create schema flbp_test_restore;
create function flbp_test_restore.assert_true(p_ok boolean, p_label text)
returns text language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Restore assertion failed: %', p_label; end if;
  return 'PASS: ' || p_label;
end;
$$;
create function flbp_test_restore.fail_insert() returns trigger language plpgsql as $$
begin
  if current_setting('test.restore_failure', true) = 'on' then
    raise exception 'Injected restore failure after deletions';
  end if;
  return new;
end;
$$;
create trigger flbp_test_restore_failure before insert on public.fanta_rosters
  for each row execute function flbp_test_restore.fail_insert();

-- Verify the actual database FK graph against the insert/delete ordering.
select flbp_test_restore.assert_true(not exists (
  select 1 from pg_constraint c
  join unnest(public.flbp_database_backup_table_order()) with ordinality child(name, position)
    on to_regclass('public.' || child.name) = c.conrelid
  join unnest(public.flbp_database_backup_table_order()) with ordinality parent(name, position)
    on to_regclass('public.' || parent.name) = c.confrelid
  where c.contype = 'f' and child.position <= parent.position
), 'restore order respects every real FK between whitelisted tables');

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000091','restore-admin@test.invalid');
insert into public.admin_users(user_id,email) values ('00000000-0000-4000-8000-000000000091','restore-admin@test.invalid');
insert into public.workspaces(id) values ('restore-test-A'),('restore-test-B');
insert into public.app_settings(workspace_id,logo) values ('restore-test-A','original-a'),('restore-test-B','original-b');
insert into public.flbp_data_plane(workspace_id,mode,node_id,base_url,epoch,lease_expires_at)
  values ('restore-test-A','cloud','fixture','https://fixture.invalid',4,now()+interval '1 hour');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.workspace_state(workspace_id,state,version,last_operation_id)
  values ('restore-test-A','{"teams":[],"tournament":null,"label":"original"}',10,'restore-test-original');
insert into public.workspace_state_versions(workspace_id,version,state,operation_id)
  values ('restore-test-A',15,'{"past":true}','restore-test-history');
insert into public.public_workspace_state(workspace_id,state)
  values ('restore-test-A','{"teams":[],"tournament":null,"tournamentMatches":[]}');
insert into public.tournaments(workspace_id,id,name,start_date,type,config,status)
  values ('restore-test-A','__pre_tournament__','Pretorneo A',now(),'elimination','{"fantaPreTournament":true}','live'),
    ('restore-test-B','__pre_tournament__','Pretorneo B',now(),'elimination','{"fantaPreTournament":true}','live');
insert into public.fanta_teams(id,workspace_id,tournament_id,user_id,name)
  values ('10000000-0000-4000-8000-000000000091','restore-test-A','__pre_tournament__','00000000-0000-4000-8000-000000000091','Fanta A'),
    ('10000000-0000-4000-8000-000000000092','restore-test-B','__pre_tournament__','00000000-0000-4000-8000-000000000091','Fanta B');
insert into public.fanta_rosters(id,team_id,player_id,role)
  values ('20000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091','player-a','captain'),
    ('20000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000092','player-b','captain');

create table flbp_test_restore.backups(name text primary key, backup jsonb);
insert into flbp_test_restore.backups values ('A',public.flbp_export_application_database('restore-test-A')),
  ('B',public.flbp_export_application_database('restore-test-B'));
select flbp_test_restore.assert_true(
  (select jsonb_array_length(backup->'tables'->'fanta_rosters'->'rows')=1 from flbp_test_restore.backups where name='A'),
  'real schema export scopes Fanta rosters');

do $$
declare
  v_backup jsonb := (select backup from flbp_test_restore.backups where name='A');
  v_original jsonb := v_backup - 'exportedAt';
  v_actor uuid := '00000000-0000-4000-8000-000000000091';
  v_result jsonb;
  v_retry jsonb;
  v_mode text;
  v_failed boolean;
begin
  -- A deliberate late failure must roll back every modified whitelist table,
  -- its checkpoint and recovery metadata on the full installed schema.
  perform set_config('test.restore_failure','on',true);
  v_failed := false;
  begin
    perform public.flbp_restore_application_database('restore-test-A',v_backup,v_actor,'schema-failure',null);
  exception when raise_exception then
    if sqlerrm <> 'Injected restore failure after deletions' then raise; end if;
    v_failed := true;
  end;
  perform set_config('test.restore_failure','off',true);
  perform flbp_test_restore.assert_true(v_failed, 'late failure was reached');
  perform flbp_test_restore.assert_true(public.flbp_export_application_database('restore-test-A')-'exportedAt'=v_original, 'full data and recovery snapshot survive late failure');
  perform flbp_test_restore.assert_true(not exists(select 1 from public.database_restore_checkpoints where workspace_id='restore-test-A'), 'failed restore leaves no checkpoint');

  foreach v_mode in array array['local','recovery'] loop
    update public.flbp_data_plane set mode=v_mode where workspace_id='restore-test-A';
    v_failed := false;
    begin
      perform public.flbp_restore_application_database('restore-test-A',v_backup,v_actor,'schema-'||v_mode,null);
    exception when raise_exception then
      if sqlerrm not like 'Ripristino sospeso:%' then raise; end if;
      v_failed := true;
    end;
    perform flbp_test_restore.assert_true(v_failed, 'non-cloud plane is rejected');
  end loop;
  update public.flbp_data_plane set mode='cloud' where workspace_id='restore-test-A';
  v_failed := false;
  begin
    perform public.flbp_restore_application_database('restore-test-A',v_backup#-'{tables,app_settings}',v_actor,'schema-incomplete',null);
  exception when raise_exception then
    if sqlerrm not like 'Tabella mancante%' then raise; end if;
    v_failed := true;
  end;
  perform flbp_test_restore.assert_true(v_failed, 'incomplete export is rejected');

  v_backup := jsonb_set(v_backup,'{tables,app_settings,rows,0,logo}','"restored-a"');
  v_result := public.flbp_restore_application_database('restore-test-A',v_backup,v_actor,'schema-success',null);
  perform flbp_test_restore.assert_true((v_result->>'ok')::boolean and (v_result->>'version')::bigint=16, 'restore creates monotonic version above history');
  perform flbp_test_restore.assert_true((select logo='restored-a' from public.app_settings where workspace_id='restore-test-A'), 'restored data reaches its table');
  perform flbp_test_restore.assert_true((select count(*)=1 from public.tournaments where workspace_id='restore-test-A' and id='__pre_tournament__'), 'protected pre-tournament row survives restore without duplicate');
  perform flbp_test_restore.assert_true((select count(*)=1 from public.fanta_rosters where team_id='10000000-0000-4000-8000-000000000091'), 'real tournament-team-roster FK chain is restored');
  perform flbp_test_restore.assert_true(public.flbp_export_application_database('restore-test-B')-'exportedAt'=(select backup-'exportedAt' from flbp_test_restore.backups where name='B'), 'other workspace and cascaded Fanta rows are unchanged');
  perform flbp_test_restore.assert_true((select count(*)=1 from public.workspace_state_versions where workspace_id='restore-test-A' and version=16), 'history contains exactly one restored version');
  perform flbp_test_restore.assert_true((select previous_backup->'tables'->'app_settings'->'rows'->0->>'logo'='original-a' from public.database_restore_checkpoints where workspace_id='restore-test-A' and operation_id='schema-success'), 'checkpoint contains the previous state');
  v_retry := public.flbp_restore_application_database('restore-test-A',v_backup,v_actor,'schema-success',null);
  perform flbp_test_restore.assert_true(v_retry=v_result, 'same operation returns the saved result');
  perform flbp_test_restore.assert_true((select version=16 from public.workspace_state where workspace_id='restore-test-A'), 'retry does not allocate another version');
  perform flbp_test_restore.assert_true((select count(*)=1 from public.public_workspace_live where workspace_id='restore-test-A'), 'live mirror is reconstructed');
end;
$$;
select 'PASS: full-schema rollback, local/recovery fencing, incomplete files, protected tournament, FK cascade, scope, checkpoint, history and retry';

select flbp_test_restore.assert_true(not has_function_privilege('anon','public.flbp_restore_application_database(text,jsonb,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.flbp_restore_application_database(text,jsonb,uuid,text,text)','execute'),
  'restore RPC is unavailable to client API roles');
rollback;
