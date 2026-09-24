import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ts=createRequire(path.join(root,'package.json'))('typescript');
let passed=0;
const parse=filename=>ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);
const compile=(source,context)=>vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const check=async(label,run)=>{await run();passed++;console.log(`PASS: ${label}`);};
for(const edition of ['FLBP ONLINE','FLBP LOCALE']){
  const source=parse(path.resolve(root,'..',edition,'services/supabaseRest.ts'));
  const statement=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.text==='pushPublicWorkspaceState'));
  assert.ok(statement);
  const requests=[];
  const row={workspace_id:'fixture',updated_at:'server-time',state:{tournamentMatches:[{id:'one',scoreA:10}]}};
  let response={ok:true,json:async()=>row},route={mode:'cloud'},readOnly=false;
  const context={exports:{},
    getSupabaseConfig:()=>({workspaceId:'fixture'}),isAdminWriteBlockedByLease:()=>readOnly,
    resolveDataPlane:async()=>route,pullLocalWorkspace:async()=>row,
    requireSupabaseWriteSession:async()=>({accessToken:'fixture-only'}),getAdminLeaseHolderForWrites:()=> 'fixture-lease',
    rpcUrl:(_cfg,name)=>`https://fixture.invalid/rpc/${name}`,buildHeaders:()=>({}),
    fetchWithDevRequestPerf:async(url,options)=>{requests.push({url,...options});return response;},
    readErrorBody:async()=>response.body,
    setRemoteBaseUpdatedAt:()=>{throw Error('Public projection must not acknowledge a private commit');},
  };
  compile(statement.getText(source),context);
  const run=()=>context.exports.pushPublicWorkspaceState({tournamentMatches:[{id:'one',scoreA:0}],privateData:'never-send'});
  await check(`${edition}: one RPC publishes committed server state without uploading browser data`,async()=>{
    assert.equal(await run(),row);assert.equal(requests.length,1);
    assert.ok(requests[0].url.endsWith('/rpc/flbp_admin_republish_public_workspace'));
    assert.equal(requests[0].method,'POST');
    assert.deepEqual(Object.keys(JSON.parse(requests[0].body)).sort(),['p_lease_holder','p_workspace_id']);
    assert.ok(!requests[0].body.includes('never-send'));
  });
  for(const status of [403,404,409,500])await check(`${edition}: HTTP ${status} fails closed without a REST fallback`,async()=>{
    requests.length=0;response={ok:false,status,body:'fixture rejection'};
    await assert.rejects(run());assert.equal(requests.length,1);
  });
  for(const payload of [null,{}, {...row,workspace_id:'other'}, {...row,updated_at:null}, {...row,state:null}, {...row,state:[]}, {...row,state:'invalid'}]){
    await check(`${edition}: incomplete/mismatched publication receipt never fabricates success`,async()=>{
      requests.length=0;response={ok:true,json:async()=>payload};await assert.rejects(run());assert.equal(requests.length,1);
    });
  }
  if(edition==='FLBP ONLINE'){
    await check('ONLINE: local-primary publication reads its existing local projection without cloud writes',async()=>{
      requests.length=0;route={mode:'local'};assert.equal(await run(),row);assert.equal(requests.length,0);
    });
    await check('ONLINE: recovery and passive Admin cannot write public mirrors',async()=>{
      requests.length=0;route={mode:'recovery'};await assert.rejects(run());assert.equal(requests.length,0);
      route={mode:'cloud'};readOnly=true;await assert.rejects(run());assert.equal(requests.length,0);
    });
  }
}

// Execute the real two Admin handlers with only IO/repository callbacks replaced.
const adminSource=parse(path.join(root,'components/AdminDashboard.tsx'));
const names=new Set(['toggleFantaPretournament','handleStartLive']);
const declarations=[];
const visit=node=>{
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.has(node.name.text))declarations.push(node.getText(adminSource));
  ts.forEachChild(node,visit);
};
visit(adminSource);assert.equal(declarations.length,2);
const handlerSource=declarations.map(value=>'const '+value+';').join('\n')+'\nexports.toggle=toggleFantaPretournament;exports.start=handleStartLive;';
const fixture=(priorTournament=false)=>{
  const events=[];let resolve,reject;
  const pending=new Promise((ok,no)=>{resolve=ok;reject=no;});
  const context={exports:{},state:{teams:[],tournament:priorTournament?{id:'previous'}:null,tournamentMatches:[]},
    draft:{t:{id:'new-live'},m:[]},fantaPretournamentEnabled:true,
    fantaPublicationPendingRef:{current:false},liveStartPendingRef:{current:false},
    setState:value=>events.push(['state',value]),setFantaSyncFeedback:value=>events.push(['feedback',value]),
    commitAdminStateDurably:async(state,source,options)=>{events.push(['commit',state,source,options]);const confirmed=await pending;events.push(['confirmed']);return confirmed;},
    runFantaPhaseAndRosterSync:(...args)=>events.push(['phase',...args]),
    isResultsOnlyTournament:()=>false,t:key=>key,confirm:()=>true,window:{prompt:()=> 'fixture-only'},
    safeSessionRemove:()=>{},snapshotFantaBeforeArchive:async()=>events.push(['snapshot']),
    closeLiveCallsForTournament:()=>events.push(['close-calls']),archiveTournamentV2:state=>({...state,tournament:null}),
    pushFullStructuredExportBestEffort:async()=>events.push(['structured']),
    refreshFantaArchiveAfterAwards:async()=>events.push(['archive-refresh']),
    hasFantaPretournamentTeams:async()=>true,
    promoteFantaPretournamentToTournament:async()=>{events.push(['promote']);return {ok:true,promoted:1};},
    setDraft:value=>events.push(['draft',value]),setLateTeamIds:()=>{},setTab:()=>{},
    alert:value=>events.push(['alert',value]),console:{warn:()=>{}},
  };
  compile(handlerSource,context);
  return {context,events,resolve,reject};
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
await check('Fanta toggle waits for durable confirmation before success/phase sync and suppresses duplicate clicks',async()=>{
  const f=fixture();f.context.fantaPretournamentEnabled=false;const task=f.context.exports.toggle();await tick();
  await f.context.exports.toggle();
  assert.equal(f.events.filter(event=>event[0]==='commit').length,1);
  assert.ok(!f.events.some(event=>event[0]==='state'||event[0]==='phase'||event[1]?.tone==='success'));
  const state=f.events.find(event=>event[0]==='commit')[1];f.resolve(state);await task;
  assert.ok(f.events.some(event=>event[0]==='state'));
  assert.ok(f.events.some(event=>event[1]?.tone==='success'));
  assert.ok(f.events.some(event=>event[0]==='phase'));
  assert.equal(f.context.fantaPublicationPendingRef.current,false);
});
await check('Failed Fanta commit shows failure and never runs phase synchronization',async()=>{
  const f=fixture();const task=f.context.exports.toggle();f.reject(new Error('offline'));await task;
  assert.ok(!f.events.some(event=>event[0]==='state'||event[0]==='phase'||event[1]?.tone==='success'));
  assert.ok(f.events.some(event=>event[1]?.tone==='error'));
});
await check('Live start publishes/promotes only after its canonical commit succeeds',async()=>{
  const f=fixture();const task=f.context.exports.start();await tick();await f.context.exports.start();
  assert.equal(f.events.filter(event=>event[0]==='commit').length,1);
  assert.ok(!f.events.some(event=>['promote','structured','draft'].includes(event[0])));
  f.resolve(f.events.find(event=>event[0]==='commit')[1]);await task;
  assert.ok(f.events.some(event=>event[0]==='promote'));
  assert.ok(f.events.some(event=>event[0]==='alert'&&event[1]==='alert_live_started'));
  assert.ok(f.events.some(event=>event[0]==='draft'&&event[1]===null));
});
await check('Live replacement confirms, snapshots prior Fanta, then publishes structured archive and promotes',async()=>{
  const f=fixture(true);const task=f.context.exports.start();await tick();
  assert.ok(!f.events.some(event=>['snapshot','state','structured','promote'].includes(event[0])));
  const commit=f.events.find(event=>event[0]==='commit');
  assert.equal(commit[3].skipStructuredSync,true);
  f.resolve(commit[1]);await task;
  const stages=f.events.map(event=>event[0]).filter(stage=>['commit','confirmed','snapshot','state','structured','promote'].includes(stage));
  assert.deepEqual(stages,['commit','confirmed','snapshot','state','structured','promote']);
});
await check('Mismatched durable receipt never snapshots, publishes or promotes',async()=>{
  const f=fixture(true);const task=f.context.exports.start();await tick();
  f.resolve({...f.events.find(event=>event[0]==='commit')[1],tournament:{id:'different'}});await task;
  assert.ok(!f.events.some(event=>['snapshot','state','structured','promote','draft','archive-refresh','close-calls'].includes(event[0])));
  assert.ok(f.events.some(event=>event[1]?.tone==='error'));
});
await check('Failed live-start commit retains the draft and never snapshots/promotes/finalizes archive/closes calls',async()=>{
  const f=fixture(true);const task=f.context.exports.start();await tick();f.reject(new Error('conflict'));await task;
  assert.ok(!f.events.some(event=>['snapshot','state','promote','structured','draft','archive-refresh','close-calls'].includes(event[0])));
  assert.ok(!f.events.some(event=>event[0]==='alert'&&event[1]==='alert_live_started'));
  assert.ok(f.events.some(event=>event[1]?.tone==='error'));
  assert.equal(f.context.liveStartPendingRef.current,false);
});
console.log(`${passed} real publication-service/Admin-handler regression cases passed; IO only was replaced.`);
