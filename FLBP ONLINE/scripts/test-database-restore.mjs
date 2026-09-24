import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const moduleIndex = args.indexOf('--pglite');
const modulePath = moduleIndex >= 0 ? args[moduleIndex + 1] : null;
assert.ok(modulePath && path.isAbsolute(modulePath), 'Use --pglite <absolute local module path>; no live database is accepted.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const actor = '00000000-0000-4000-8000-000000000001';
const otherActor = '00000000-0000-4000-8000-000000000002';
const teamA = '10000000-0000-4000-8000-000000000001';
const teamB = '10000000-0000-4000-8000-000000000002';
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; console.log(`PASS: ${label}`); };
const load = (name) => fs.readFile(path.join(root, 'supabase/migrations', name), 'utf8');
const loadFunction = async (file, name) => {
  const sql = await load(file);
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `Function ${name} exists in actual migration`);
  const end = sql.indexOf('$$;', start);
  assert.ok(end >= start);
  await db.exec(sql.slice(start, end + 3));
};
const queryValue = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const serviceCall = async (sql, params = []) => {
  await db.exec(`set role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', false);`);
  try { return await queryValue(sql, params); }
  finally { await db.exec('reset role;'); }
};
const exportBackup = (workspace = 'A') => serviceCall('select public.flbp_export_application_database($1) as value', [workspace]);
const restore = (backup, operation, options = {}) => serviceCall(
  'select public.flbp_restore_application_database($1,$2::jsonb,$3::uuid,$4,$5) as value',
  [options.workspace || 'A', JSON.stringify(backup), options.actor === undefined ? actor : options.actor, operation, options.lease || null],
);
const stableDatabase = async () => {
  const tables = ['app_settings','workspace_state','public_workspace_state','workspace_state_versions','flbp_data_plane',
    'flbp_local_operation_log','public_workspace_live','fanta_teams','fanta_rosters','database_restore_checkpoints'];
  const state = {};
  for (const table of tables) state[table] = (await db.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
  state.simPoolSequence=(await db.query('select last_value,is_called from public.sim_pool_people_id_seq')).rows;
  return state;
};
const probe = () => queryValue('select last_value::text || \'/\' || is_called::text as value from public.restore_delete_probe');
const rejectedWithoutChanges = async (backup, operation, expected, options = {}) => {
  const before = await stableDatabase();
  const beforeProbe = await probe();
  await assert.rejects(restore(backup, operation, options), expected);
  assert.deepEqual(await stableDatabase(), before, `${operation}: all data survives rejection`);
  assert.equal(await probe(), beforeProbe, `${operation}: no DELETE ran`);
  check(true, `${operation}: rejected before writes`);
};

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
  `);
  for (const file of ['20251226000100_init_flbp.sql','20251226000200_rls_policies.sql','20251226000300_public_read_safe.sql',
    '20260323000300_admin_auth_roles.sql','20260924000100_admin_auth_trusted_claims.sql']) await db.exec(await load(file));
  await db.exec(await fs.readFile(path.join(root,'tests/databaseRestore.fixture.sql'),'utf8'));
  const liveFile = '20260709000200_public_workspace_live.sql';
  for (const name of ['flbp_public_live_sanitize_team','flbp_public_live_sanitize_teams','flbp_public_live_sanitize_tournament',
    'flbp_build_public_workspace_live_state','flbp_upsert_public_workspace_live']) await loadFunction(liveFile,name);
  await loadFunction('20260715000100_admin_write_lease.sql','flbp_admin_assert_write_lease');
  const versionFile = '20260801000100_local_data_plane_and_version_history.sql';
  for (const name of ['flbp_workspace_state_before_write','flbp_workspace_state_capture_version']) await loadFunction(versionFile,name);
  await db.exec(`
    create trigger flbp_workspace_state_before_write before insert or update or delete on public.workspace_state
      for each row execute function public.flbp_workspace_state_before_write();
    create trigger flbp_workspace_state_capture_version after insert or update on public.workspace_state
      for each row execute function public.flbp_workspace_state_capture_version();
  `);
  const migration = await load('20260924000200_database_backup_atomic_restore.sql');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`
    insert into auth.users values ('${actor}','admin@test.invalid'),('${otherActor}','player@test.invalid');
    insert into public.admin_users(user_id,email) values ('${actor}','admin@test.invalid');
    insert into public.workspaces(id) values ('A'),('B');
    insert into public.app_settings(workspace_id,logo) values ('A','original-a'),('B','original-b');
    insert into public.flbp_data_plane(workspace_id,mode,epoch) values ('A','cloud',7),('B','cloud',3);
    insert into public.workspace_state(workspace_id,state,version,last_operation_id) values
      ('A','{"teams":[],"tournament":null,"label":"current"}',10,'current-a'),('B','{"label":"other"}',8,'current-b');
    insert into public.public_workspace_state(workspace_id,state) values ('A','{"teams":[],"tournament":null}'),('B','{"other":true}');
    insert into public.workspace_state_versions(workspace_id,version,state,operation_id) values ('A',20,'{"label":"historic-future"}','old-future');
    insert into public.flbp_local_operation_log values ('A','saved-operation','{"proof":true}');
    insert into public.fanta_teams values ('${teamA}','A','team-a'),('${teamB}','B','team-b');
    insert into public.fanta_rosters values
      ('20000000-0000-4000-8000-000000000001','${teamA}','player-a','captain'),
      ('20000000-0000-4000-8000-000000000002','${teamB}','player-b','captain');
    insert into public.sim_pool_people(workspace_id,name,yob) values ('A','original-a',1990),('B','original-b',1991);
  `);
  const original = await exportBackup();
  check(original.tables.fanta_rosters.rows.length === 1 && original.tables.fanta_rosters.rows[0].team_id === teamA, 'export scopes Fanta rosters to workspace A');
  check(original.recovery.workspace_state_versions.rows.length === 2 && original.recovery.flbp_local_operation_log.rows.length === 1, 'export includes recovery history and journal');
  check(!original.tables.admin_users && !original.tables.workspaces, 'export does not package authorization writes');

  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}; select set_config('request.jwt.claims','{"role":"${role}","sub":"${actor}"}',false);`);
    try {
      await assert.rejects(db.query('select public.flbp_export_application_database($1)', ['A']), /permission denied/);
      await assert.rejects(db.query('select public.flbp_restore_application_database($1,$2::jsonb,$3::uuid,$4,null)', ['A',JSON.stringify(original),actor,'denied']), /permission denied/);
    } finally { await db.exec('reset role;'); }
    check(true, `${role} cannot invoke service-only export/restore even with an admin subject`);
  }
  await rejectedWithoutChanges(original,'non-admin',/Admin access required/,{actor:otherActor});
  await rejectedWithoutChanges(original,'missing-admin',/Admin access required/,{actor:null});
  await rejectedWithoutChanges({...original,schemaVersion:2},'wrong-schema',/File backup o workspace non valido/);
  await rejectedWithoutChanges({...original,workspaceId:'B'},'wrong-workspace',/File backup o workspace non valido/);
  const incomplete=structuredClone(original); delete incomplete.tables.app_settings;
  await rejectedWithoutChanges(incomplete,'incomplete',/Tabella mancante/);
  const wrongCount=structuredClone(original); wrongCount.tables.app_settings.rowCount=4;
  await rejectedWithoutChanges(wrongCount,'wrong-count',/Conteggio righe/);
  const badColumn=structuredClone(original); badColumn.tables.app_settings.rows[0].unknown='bad';
  await rejectedWithoutChanges(badColumn,'unknown-column',/Colonna sconosciuta/);
  const badTable=structuredClone(original); badTable.tables.arbitrary={rows:[],rowCount:0};
  await rejectedWithoutChanges(badTable,'unknown-table',/Tabella non prevista/);
  const foreignRow=structuredClone(original); foreignRow.tables.app_settings.rows[0].workspace_id='B';
  await rejectedWithoutChanges(foreignRow,'foreign-row',/altro workspace/);
  const foreignRoster=structuredClone(original); foreignRoster.tables.fanta_rosters.rows[0].team_id=teamB;
  await rejectedWithoutChanges(foreignRoster,'foreign-roster',/Rosa Fanta non appartenente/);

  for (const mode of ['local','recovery']) {
    await db.query('update public.flbp_data_plane set mode=$1 where workspace_id=$2',[mode,'A']);
    await rejectedWithoutChanges(original,`${mode}-primary`,/Ripristino sospeso/);
  }
  await db.exec("update public.flbp_data_plane set mode='cloud' where workspace_id='A'; insert into public.admin_write_lease(workspace_id,holder_id) values ('A','writer-1');");
  await rejectedWithoutChanges(original,'foreign-writer',/FLBP_LEASE_HELD/,{lease:'writer-2'});
  await db.exec("delete from public.admin_write_lease where workspace_id='A';");

  const wanted=structuredClone(original);
  wanted.tables.app_settings.rows[0].logo='restored-a';
  wanted.tables.workspace_state.rows[0].state.label='restored';
  wanted.tables.fanta_teams.rows[0].name='restored-team-a';
  wanted.tables.public_workspace_state.rows[0].state={teams:[],tournament:{id:'live-a',teams:[],refereesPassword:'private-test'},tournamentMatches:[],tournamentHistory:[{id:'not-live'}]};
  const beforeFailure=await stableDatabase();
  const beforeFailureProbe=await probe();
  await db.exec("select set_config('test.restore_insert_failure','on',false);");
  await assert.rejects(restore(wanted,'failure-after-delete'),/Injected failure after destructive phase/);
  await db.exec("select set_config('test.restore_insert_failure','off',false);");
  assert.deepEqual(await stableDatabase(),beforeFailure);
  check(await probe()!==beforeFailureProbe, 'injected failure occurs after actual DELETE statements');
  check(true, 'insert failure rolls back deleted rows, snapshots, history and checkpoint together');

  const otherBefore=await exportBackup('B');
  const result=await restore(wanted,'restore-success');
  check(result.ok && Number(result.version)===21 && result.checkpointId==='restore-success', 'successful restore uses version above current snapshot and all history');
  check(await queryValue("select logo='restored-a' and logo_upper='RESTORED-A' as value from public.app_settings where workspace_id='A'"), 'restored data and generated columns are reconstructed');
  check(await queryValue("select count(*)=1 as value from public.workspace_state_versions where workspace_id='A' and version=21 and operation_id='restore:restore-success'"), 'restore creates exactly one new history version');
  check(await queryValue("select previous_backup->'tables'->'app_settings'->'rows'->0->>'logo'='original-a' as value from public.database_restore_checkpoints where operation_id='restore-success'"), 'checkpoint preserves the state before restore');
  check(await queryValue("select epoch=7 and mode='cloud' as value from public.flbp_data_plane where workspace_id='A'"), 'restore does not resurrect an old leadership epoch');
  check(await queryValue("select count(*)=1 as value from public.flbp_local_operation_log where workspace_id='A'"), 'restore preserves append-only local journal');
  const otherAfter=await exportBackup('B');
  delete otherBefore.exportedAt; delete otherAfter.exportedAt;
  assert.deepEqual(otherAfter,otherBefore);
  check(true, 'workspace B including its Fanta team and roster remains byte-for-byte unchanged');
  const live=await queryValue("select state as value from public.public_workspace_live where workspace_id='A'");
  check(!live.tournament.refereesPassword && !live.tournamentHistory, 'live mirror is rebuilt through the actual compact sanitizer');
  const afterFirst=await stableDatabase();
  const firstProbe=await probe();
  assert.deepEqual(await restore(wanted,'restore-success'),result);
  assert.deepEqual(await stableDatabase(),afterFirst);
  check(await probe()===firstProbe, 'identical operation retry returns its result without rewriting tables');
  await rejectedWithoutChanges(original,'restore-success',/Identificatore ripristino già usato/);
  const sameState=await restore(wanted,'restore-identical-state');
  check(Number(sameState.version)===22 && await queryValue("select count(*)=1 as value from public.workspace_state_versions where workspace_id='A' and version=22"), 'identical state with a new operation still receives a unique history version');

  const serialBackup=structuredClone(wanted);
  serialBackup.tables.sim_pool_people.rows[0].id=3;
  await restore(serialBackup,'restore-imported-serial');
  const insertedSerial=await queryValue("insert into public.sim_pool_people(workspace_id,name,yob) values ('A','new-after-restore',1992) returning id as value");
  check(Number(insertedSerial)>3, 'new rows after an explicit serial-ID restore do not collide with imported identifiers');
  await db.exec("select setval('public.sim_pool_people_id_seq',100,true);");
  await restore(serialBackup,'restore-with-advanced-sequence');
  check(Number(await queryValue("insert into public.sim_pool_people(workspace_id,name,yob) values ('B','other-after-restore',1992) returning id as value"))===101, 'restore never rewinds a sequence already advanced by another workspace');

  await loadFunction('20260701000300_fanta_protect_pretournament_container.sql','flbp_keep_fanta_pretournament_container');
  await db.exec(`
    create trigger trg_keep_fanta_pretournament_container before delete on public.tournaments
      for each row execute function public.flbp_keep_fanta_pretournament_container();
    insert into public.tournaments(workspace_id,id,name,start_date,type,config,status)
      values ('A','__pre_tournament__','Pretorneo',now(),'elimination','{"fantaPreTournament":true}','live');
  `);
  const withPretournament=await exportBackup();
  await restore(withPretournament,'restore-pretournament');
  check(await queryValue("select count(*)=1 as value from public.tournaments where workspace_id='A' and id='__pre_tournament__'"), 'restore handles the actual protected pre-tournament container trigger');

  // A pre-modern LOCALE schema must fail before any destructive write.
  await db.exec('alter table public.flbp_data_plane rename to flbp_data_plane_unavailable;');
  const finalProbe=await probe();
  await assert.rejects(restore(wanted,'legacy-schema'),/Aggiornare lo schema ONLINE/);
  check(await probe()===finalProbe, 'missing modern schema is rejected before DELETE');
  await db.exec('alter table public.flbp_data_plane_unavailable rename to flbp_data_plane;');

  console.log(`${checks} database restore checks passed; actual SQL functions executed only in PostgreSQL WASM memory.`);
} catch(error) {
  console.error(`Database restore test failed: ${error.message}`);
  if(error.where) console.error(error.where);
  process.exitCode=1;
} finally { await db.close(); }
