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
  const result=spawnSync('psql',flags,{input:query,encoding:'utf8',windowsHide:true,timeout:20000});
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);return result.stdout.trim();
};
const openSession=(query,keepOpen=false)=>{
  const child=spawn('psql',flags,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const session={child,stdout:'',stderr:'',exited:false,done:null};
  child.stdout.on('data',data=>session.stdout+=data);child.stderr.on('data',data=>session.stderr+=data);
  session.done=new Promise(resolve=>{
    child.on('error',error=>{session.exited=true;resolve({code:-1,error});});
    child.on('close',code=>{session.exited=true;resolve({code});});
  });
  if(keepOpen)child.stdin.write(query);else child.stdin.end(query);
  return session;
};
const waitFor=async(predicate,label)=>{
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){if(await predicate())return;await delay(30);}
  throw new Error(`Timed out waiting for ${label}`);
};
const id=randomUUID().replaceAll('-','');
const workspace=`referee-concurrency-${id}`,schema=`flbp_test_referee_lock_${id}`;
const trigger=`a09_lock_probe_${id}`,barrierKey=`a09-test-barrier:${id}`;
const adminName=`a09-admin-${id}`,refereeName=`a09-referee-${id}`;
const state={teams:[{id:'a',name:'A'},{id:'b',name:'B'}],tournament:{id:'test',name:'Concurrency',type:'elimination',
  refereesPassword:'fixture-password',refereesAuthVersion:'v1'},tournamentMatches:[
  {id:'one',teamAId:'a',teamBId:'b',phase:'bracket',scoreA:0,scoreB:0,played:false,status:'scheduled'},
  {id:'two',teamAId:'a',teamBId:'b',phase:'bracket',scoreA:0,scoreB:0,played:false,status:'scheduled'},
]};
const publicState=structuredClone(state);delete publicState.tournament.refereesPassword;
const adminState=structuredClone(state);
adminState.tournamentMatches[0]={...adminState.tournamentMatches[0],scoreA:5,scoreB:2,status:'finished',played:true,refereeReportSavedAt:'2026-09-24T10:00:00Z'};
const adminPublic=structuredClone(adminState);delete adminPublic.tournament.refereesPassword;
const matchJson=quote(JSON.stringify([adminState.tournamentMatches[0]]));
const refereeMatch={...state.tournamentMatches[1],scoreA:8,scoreB:3,status:'finished',played:true,refereeReportSavedAt:'2026-09-24T10:01:00Z'};
const activity=name=>sql(`select coalesce(wait_event,'') from pg_stat_activity where application_name=${quote(name)};`);
let fixtureStarted=false,passed=0;
try{
  fixtureStarted=true;
  sql(`begin;
    create schema ${schema};
    insert into public.workspaces(id) values(${quote(workspace)});
    insert into public.workspace_state(workspace_id,state,updated_at) values(${quote(workspace)},${quote(JSON.stringify(state))}::jsonb,'2026-01-01');
    insert into public.public_workspace_state(workspace_id,state,updated_at) values(${quote(workspace)},${quote(JSON.stringify(publicState))}::jsonb,'2026-01-01');
    create function ${schema}.pause_admin() returns trigger language plpgsql security definer as $$
    begin
      if new.workspace_id=${quote(workspace)} and current_setting('application_name')=${quote(adminName)} then
        perform pg_advisory_xact_lock(hashtext(${quote(barrierKey)}));
      end if;
      return new;
    end; $$;
    create trigger ${trigger} before update on public.workspace_state for each row execute function ${schema}.pause_admin();
    commit;`);
  const overloads=JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'args',p.pronargs)),'[]')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('flbp_admin_push_match_result','flbp_admin_push_workspace_state','flbp_admin_push_workspace_state_v2');`));
  assert.ok(overloads.some(fn=>fn.name==='flbp_admin_push_match_result'),'Modern Admin match RPC must be installed');
  for(const fn of overloads){
    sql(`update public.workspace_state set state=${quote(JSON.stringify(state))}::jsonb,updated_at='2026-01-01' where workspace_id=${quote(workspace)};
      update public.public_workspace_state set state=${quote(JSON.stringify(publicState))}::jsonb,updated_at='2026-01-01' where workspace_id=${quote(workspace)};`);
    let call;
    if(fn.name==='flbp_admin_push_match_result'){
      assert.ok([4,5].includes(fn.args));
      call=`public.${fn.name}(${quote(workspace)},'test','one',${matchJson}::jsonb${fn.args===5?',null':''})`;
    }else{
      assert.ok(fn.name.endsWith('_v2')?fn.args===7:[5,6].includes(fn.args));
      call=`public.${fn.name}(${quote(workspace)},${quote(JSON.stringify(adminState))}::jsonb,${quote(JSON.stringify(adminPublic))}::jsonb,
        null,true${fn.args>=6?',null':''}${fn.args===7?','+quote(`operation-${randomUUID()}`):''})`;
    }
    let barrier,admin,referee;
    try{
      barrier=openSession(`begin; select pg_advisory_xact_lock(hashtext(${quote(barrierKey)})); select 'BARRIER_READY';\n`,true);
      await waitFor(()=>{assert.ok(!barrier.exited,barrier.stderr);return barrier.stdout.includes('BARRIER_READY');},'barrier owner');
      admin=openSession(`begin;
        set local application_name=${quote(adminName)}; set local statement_timeout='15s'; set local lock_timeout='12s';
        set local role authenticated;
        select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
        select ${call}; commit;`);
      // The injected BEFORE UPDATE trigger runs after the Admin owns the row.
      // Hold it there so the old row-before-advisory implementation produces
      // a deterministic inversion when the referee starts.
      await waitFor(()=>{assert.ok(!admin.exited,admin.stderr);return activity(adminName)==='advisory';},'Admin paused inside its update');
      referee=openSession(`begin;
        set local application_name=${quote(refereeName)}; set local statement_timeout='15s'; set local lock_timeout='12s';
        set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true);
        select public.flbp_referee_push_match_result(${quote(workspace)},'test','two','fixture-password',${quote(JSON.stringify([refereeMatch]))}::jsonb,'v1'); commit;`);
      let waitEvent;
      await waitFor(()=>{assert.ok(!referee.exited,referee.stderr);waitEvent=activity(refereeName);return ['advisory','transactionid','tuple'].includes(waitEvent);},'referee lock contention');
      assert.equal(waitEvent,'advisory',`${fn.name}/${fn.args}: referee reached a row lock while Admin held it; advisory order is inverted`);
      barrier.child.stdin.end('rollback;\n');await barrier.done;
      const [adminResult,refereeResult]=await Promise.all([admin.done,referee.done]);
      assert.equal(adminResult.code,0,admin.stderr);assert.equal(refereeResult.code,0,referee.stderr);
      const results=referee.stdout.split('\n').filter(line=>line.trim().startsWith('{')).map(line=>JSON.parse(line));
      assert.ok(results.some(result=>result.ok===true),'Referee RPC must commit successfully after Admin');
      const persisted=JSON.parse(sql(`select state->'tournamentMatches' from public.workspace_state where workspace_id=${quote(workspace)};`));
      assert.equal(persisted.find(match=>match.id==='one').scoreA,5);assert.equal(persisted.find(match=>match.id==='two').scoreA,8);
      passed++;console.log(`PASS: ${fn.name}/${fn.args}: contended Admin/referee sessions commit both reports without deadlock`);
    }finally{
      if(barrier&&!barrier.exited){barrier.child.stdin.end('rollback;\n');await barrier.done;}
      if((admin&&!admin.exited)||(referee&&!referee.exited)){
        sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name in (${quote(adminName)},${quote(refereeName)});`);
      }
      await Promise.all([admin?.done,referee?.done].filter(Boolean));
    }
  }
}finally{
  if(fixtureStarted){
    sql(`begin; drop trigger if exists ${trigger} on public.workspace_state;
      drop schema if exists ${schema} cascade;
      delete from public.referee_auth_audit where workspace_id=${quote(workspace)};
      delete from public.workspaces where id=${quote(workspace)}; commit;`);
  }
}
console.log(`${passed} native two-writer concurrency scenarios passed; barriers and committed fixtures were removed.`);
