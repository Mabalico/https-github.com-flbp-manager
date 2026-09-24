// Native lock contention: independent sessions, real backup RPCs, committed
// synthetic fixtures, and cleanup. No production hostname is accepted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const pos=process.argv.indexOf('--database-url');
const databaseUrl=pos<0?null:process.argv[pos+1];
assert.ok(databaseUrl,'Usage: --database-url <disposable native loopback PostgreSQL>');
const url=new URL(databaseUrl);
assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname));
assert.equal(url.search,'');assert.equal(url.hash,'');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const flags=['-X','-q','-t','-A','--set=ON_ERROR_STOP=1','--dbname',databaseUrl];
const sql=query=>{
  const result=spawnSync('psql',flags,{input:query,encoding:'utf8',windowsHide:true,timeout:15000});
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);return result.stdout.trim();
};
const service=query=>sql(`begin; set local statement_timeout='5s'; set local lock_timeout='2s';
  set local role service_role; set local request.jwt.claims='{"role":"service_role"}'; ${query}; commit;`);
const id=randomUUID().replaceAll('-','');
const actor=randomUUID(),workspace=`mirror-native-${id}`,schema=`mirror_native_${id}`;
const operation=`mirror-restore-${id}`;
let locker,lockerDone,lockerOutput='',lockerError='',fixtureStarted=false;
let assertions=0;
const check=(value,label)=>{assert.ok(value,label);assertions++;console.log(`PASS: ${label}`);};
try{
  fixtureStarted=true;
  sql(`begin;
    create schema ${schema}; grant usage on schema ${schema} to service_role;
    insert into auth.users(id,email) values(${quote(actor)},${quote(id+'@test.invalid')});
    insert into public.admin_users(user_id,email) values(${quote(actor)},${quote(id+'@test.invalid')});
    insert into public.workspaces(id) values(${quote(workspace)});
    insert into public.workspace_state(workspace_id,state,updated_at)
      values(${quote(workspace)},'{"teams":[],"tournament":null,"tournamentMatches":[],"fixture":"before"}','2026-01-01');
    insert into public.public_workspace_state(workspace_id,state,updated_at)
      values(${quote(workspace)},'{"teams":[],"tournament":null,"tournamentMatches":[]}','2026-01-01');
    create function ${schema}.attempt(p_mode text,p_backup jsonb) returns jsonb language plpgsql as $$
    begin
      if p_mode='export' then
        perform public.flbp_export_application_database(${quote(workspace)});
      else
        perform public.flbp_restore_application_database(${quote(workspace)},p_backup,${quote(actor)}::uuid,${quote(operation)},null);
      end if;
      return '{"unexpected_success":true}'::jsonb;
    exception when others then return jsonb_build_object('code',sqlstate,'message',sqlerrm);
    end; $$;
    grant execute on function ${schema}.attempt(text,jsonb) to service_role;
    commit;`);
  const backup=JSON.parse(service(`select public.flbp_export_application_database(${quote(workspace)})`));
  const backupSql=quote(JSON.stringify(backup))+'::jsonb';
  const before=sql(`select row_to_json(q) from (select state,version,updated_at from public.workspace_state where workspace_id=${quote(workspace)}) q;`);

  locker=spawn('psql',flags,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  locker.stdout.on('data',data=>lockerOutput+=data);
  locker.stderr.on('data',data=>lockerError+=data);
  lockerDone=new Promise(resolve=>{locker.on('close',code=>resolve(code));locker.on('error',error=>{lockerError+=error.message;resolve(-1);});});
  locker.stdin.write(`begin; set local application_name=${quote('mirror-lock-'+id)};
    lock table public.public_workspace_state in row exclusive mode; select 'LOCK_READY';\n`);
  const deadline=Date.now()+10000;
  while(!lockerOutput.includes('LOCK_READY')&&Date.now()<deadline){
    assert.equal(locker.exitCode,null,lockerError);await delay(30);
  }
  assert.ok(lockerOutput.includes('LOCK_READY'),'Independent writer relation lock must be held');
  for(const mode of ['export','restore']){
    const failure=JSON.parse(service(`select ${schema}.attempt(${quote(mode)},${backupSql})`));
    check(failure.code==='P0001'&&failure.message.startsWith('FLBP_DATABASE_BUSY:'),`${mode}: real contended table lock yields explicit prewrite busy, without waiting into a deadlock`);
    check(sql(`select count(*) from public.database_restore_checkpoints where workspace_id=${quote(workspace)};`)==='0',`${mode}: busy creates no restore checkpoint`);
    check(sql(`select row_to_json(q) from (select state,version,updated_at from public.workspace_state where workspace_id=${quote(workspace)}) q;`)===before,
      `${mode}: busy leaves canonical data/version unchanged`);
  }
  locker.stdin.end('rollback;\n');assert.equal(await lockerDone,0,lockerError);locker=null;
  const exported=JSON.parse(service(`select public.flbp_export_application_database(${quote(workspace)})`));
  check(exported.exportType==='flbp_application_database_backup','export succeeds in a fresh transaction after writer releases relation lock');
  sql(`update public.workspace_state set state=jsonb_set(state,'{fixture}','"after"') where workspace_id=${quote(workspace)};`);
  const advancedVersion=Number(sql(`select version from public.workspace_state where workspace_id=${quote(workspace)};`));
  const result=JSON.parse(service(`select public.flbp_restore_application_database(${quote(workspace)},${backupSql},${quote(actor)}::uuid,${quote(operation)},null)`));
  check(result.ok===true,'whole-transaction restore retry succeeds with the same operationId that returned busy');
  check(Number(result.version)>advancedVersion,'successful retry advances canonical version monotonically');
  check(sql(`select state->>'fixture' from public.workspace_state where workspace_id=${quote(workspace)};`)==='before','retry restores requested canonical state');
  const repeated=JSON.parse(service(`select public.flbp_restore_application_database(${quote(workspace)},${backupSql},${quote(actor)}::uuid,${quote(operation)},null)`));
  check(repeated.ok===true&&repeated.version===result.version,'repeated successful retry is idempotent and creates no new version');
  check(sql(`select count(*) from public.database_restore_checkpoints where workspace_id=${quote(workspace)};`)==='1','one checkpoint exists across busy and successful idempotent retries');
}finally{
  if(locker){locker.stdin.end('rollback;\n');await lockerDone;}
  if(fixtureStarted){
    sql(`begin; drop schema if exists ${schema} cascade;
      delete from public.workspaces where id=${quote(workspace)};
      delete from public.admin_users where user_id=${quote(actor)}::uuid;
      delete from auth.users where id=${quote(actor)}::uuid; commit;`);
  }
}
console.log(`${assertions} native backup-contention assertions passed; synthetic fixtures and relation locks removed.`);
