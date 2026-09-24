import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
const databaseUrl=arg('--database-url');
const postgrestUrl=arg('--postgrest-url');
assert.ok(databaseUrl&&postgrestUrl,'Usage: --database-url <disposable loopback PostgreSQL> --postgrest-url <loopback PostgREST>');
const dbUrl=new URL(databaseUrl),apiUrl=new URL(postgrestUrl);
const isLoopback=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
assert.ok(['postgres:','postgresql:'].includes(dbUrl.protocol)&&isLoopback(dbUrl),'Only disposable loopback PostgreSQL is permitted');
assert.ok(apiUrl.protocol==='http:'&&isLoopback(apiUrl),'Only disposable loopback HTTP PostgREST is permitted');
assert.equal(dbUrl.search,'');assert.equal(dbUrl.hash,'');
assert.equal(apiUrl.search,'');assert.equal(apiUrl.hash,'');assert.equal(apiUrl.username,'');assert.equal(apiUrl.password,'');
assert.equal(apiUrl.pathname,'/','Use the direct PostgREST root, without a gateway prefix');
const sqlLiteral=value=>`'${String(value).replaceAll("'","''")}'`;
const sql=query=>{
  const result=spawnSync('psql',['-X','-q','-t','-A','--set=ON_ERROR_STOP=1','--dbname',databaseUrl],{
    input:query,encoding:'utf8',windowsHide:true,timeout:20000,
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Disposable SQL fixture failed: ${result.stderr}`);
  return result.stdout.trim();
};
const workspace=`referee-http-${randomUUID()}`;
const tournament='synthetic-referee-http';
const password='synthetic-only-referee-password';
const scope=`workspace_id=${sqlLiteral(workspace)}`;
const match={id:'match-one',teamAId:'a',teamBId:'b',phase:'bracket',scoreA:0,scoreB:0,played:false,status:'scheduled'};
const state={teams:[{id:'a',name:'A'},{id:'b',name:'B'}],tournament:{id:tournament,name:'HTTP fixture',type:'elimination',
  refereesPassword:password,refereesAuthVersion:'v1',matches:[match]},tournamentMatches:[match]};
const publicState=structuredClone(state);delete publicState.tournament.refereesPassword;
const base={p_workspace_id:workspace,p_tournament_id:tournament,p_referees_password:password};
const request=(name,body)=>fetch(new URL(`rpc/${name}`,apiUrl),{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
});
let passed=0,acknowledged=0;
const check=(condition,label)=>{assert.ok(condition,label);passed++;console.log(`PASS: ${label}`);};
// This is the pre-hardening caller contract: it only checks the HTTP status,
// then acknowledges any returned JSON. It intentionally has NO payload.ok gate.
const legacyTabSave=async(name,body)=>{
  const response=await request(name,body);
  if(!response.ok)throw Object.assign(new Error(await response.text()),{status:response.status});
  const payload=await response.json();acknowledged++;return payload;
};
const auditCount=(action,reason)=>Number(sql(`select count(*) from public.referee_auth_audit where ${scope}
  and action=${sqlLiteral(action)} and reason=${sqlLiteral(reason)} and not ok;`));
let fixtureStarted=false;
try{
  fixtureStarted=true;
  sql(`begin;
    insert into public.workspaces(id) values(${sqlLiteral(workspace)});
    insert into public.workspace_state(workspace_id,state,updated_at)
      values(${sqlLiteral(workspace)},${sqlLiteral(JSON.stringify(state))}::jsonb,'2026-01-01T00:00:00Z');
    insert into public.public_workspace_state(workspace_id,state,updated_at)
      values(${sqlLiteral(workspace)},${sqlLiteral(JSON.stringify(publicState))}::jsonb,'2026-01-01T00:00:00Z');
    commit;`);
  const snapshotBody={...base,p_state:state,p_public_state:publicState,p_base_updated_at:'2026-01-01T00:00:00Z'};
  await assert.rejects(legacyTabSave('flbp_referee_push_live_state',{...snapshotBody,p_referees_password:'wrong'}),e=>e.status===403);
  check(acknowledged===0,'old snapshot client does not acknowledge HTTP 403');
  check(auditCount('push_live_state','bad_password')===1,'HTTP 403 commits its rejection audit, verified on a separate SQL connection');
  await assert.rejects(legacyTabSave('flbp_referee_push_match_result',{...base,p_match_id:'match-one',p_matches:[match],p_referees_password:'wrong'}),e=>e.status===403);
  check(acknowledged===0,'old patch client does not acknowledge HTTP 403');
  check(auditCount('push_match_result','bad_password')===1,'modern failed-password audit commits through PostgREST');
  await assert.rejects(legacyTabSave('flbp_referee_push_live_state',{...snapshotBody,p_base_updated_at:null}),e=>e.status===409);
  check(acknowledged===0,'old snapshot client does not acknowledge HTTP 409');
  check(auditCount('push_live_state','conflict')===1,'HTTP 409 commits its conflict audit');
  for(let i=0;i<12;i++){
    const response=await request('flbp_referee_auth_check',{...base,p_referees_password:'wrong'});
    assert.equal(response.status,200);assert.equal((await response.json()).ok,false);
  }
  await assert.rejects(legacyTabSave('flbp_referee_push_match_result',{...base,p_match_id:'match-one',p_matches:[match],p_referees_password:'wrong'}),e=>e.status===429);
  check(acknowledged===0&&auditCount('push_match_result','rate_limited')===1,'HTTP 429 preserves audit and the old client pending report');
  const authResponse=await request('flbp_referee_auth_check',base);
  check(authResponse.status===200&&(await authResponse.json()).ok===true,'valid password remains usable after shared failures over HTTP');
  const result=await legacyTabSave('flbp_referee_push_match_result',{...base,p_match_id:'match-one',p_auth_version:'v1',
    p_matches:[{...match,scoreA:10,scoreB:2,played:true,status:'finished',refereeReportSavedAt:'2026-09-24T12:00:00Z'}]});
  check(result.ok===true&&acknowledged===1,'old client acknowledges only the committed successful report');
  check(sql(`select state#>>'{tournamentMatches,0,scoreA}' from public.workspace_state where ${scope};`)==='10',
    'successful HTTP write is committed and visible on a separate SQL connection');
}finally{
  if(fixtureStarted){
    sql(`begin; delete from public.referee_auth_audit where ${scope};
      delete from public.workspaces where id=${sqlLiteral(workspace)}; commit;`);
    assert.equal(sql(`select count(*) from public.workspaces where id=${sqlLiteral(workspace)};`),'0');
  }
}
console.log(`${passed} real PostgREST/SQL checks passed; committed synthetic fixtures were removed.`);
