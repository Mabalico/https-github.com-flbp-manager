import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ts=createRequire(path.join(root,'package.json'))('typescript');
let passed=0;
for(const edition of ['FLBP ONLINE','FLBP LOCALE']){
  const filename=path.resolve(root,'..',edition,'services/supabaseRest.ts');
  const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);
  const names=new Set(['pushRefereeMatchResults','pushRefereeLiveState','throwMatchResultRpcError',
    'normalizeRpcConflictError','makeConflictError','isMissingRpcFunctionError','parseSupabaseErrorPayload',
    'extractSupabaseErrorUpdatedAt','makeMissingMatchResultRpcError','getMatchResultRejectionReason']);
  const selected=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(
    d=>ts.isIdentifier(d.name)&&names.has(d.name.text))).map(s=>s.getText(source)).join('\n');
  const exports={}; let response; const cursors=[];
  const context={exports,
    getSupabaseConfig:()=>({workspaceId:'fixture'}),resolveDataPlane:async()=>({mode:'cloud'}),
    rpcUrl:(_cfg,name)=>`https://fixture.invalid/${name}`,buildAnonHeaders:()=>({}),
    fetchWithDevRequestPerf:async()=>response,readErrorBody:async()=>response.body,
    sanitizeAppStateForPublic:()=>({}),setRemoteBaseUpdatedAt:value=>cursors.push(value),
    getRemoteBaseUpdatedAt:()=> 'old-baseline',FLBP_DB_CONFLICT_CODE:'FLBP_DB_CONFLICT',
    FLBP_MATCH_RESULT_RPC_MISSING_CODE:'FLBP_MATCH_RESULT_RPC_MISSING',
  };
  vm.runInNewContext(ts.transpileModule(selected,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  const functions=[['snapshot',()=>exports.pushRefereeLiveState({tournament:{id:'t'}},
    {tournamentId:'t',refereePassword:'fixture-only',baseUpdatedAt:'old-baseline'})]];
  if(edition==='FLBP ONLINE') functions.push(['patch',()=>exports.pushRefereeMatchResults({
    tournamentId:'t',matchId:'m',refereePassword:'fixture-only',matches:[],authVersion:'v1',
  })]);
  for(const [kind,run] of functions){
    for(const payload of [{ok:false,reason:'bad_password'},{ok:false,reason:'rate_limited'},
      {ok:false,reason:'auth_version_mismatch'},{ok:false,reason:'invalid_report',message:'Injected failure'},null,{}]){
      cursors.length=0; response={ok:true,json:async()=>payload};
      await assert.rejects(run());
      assert.deepEqual(cursors,[],'rejected report must not acknowledge or advance the baseline');
      passed++;
    }
    cursors.length=0;
    response={ok:true,json:async()=>({ok:false,reason:'conflict',message:'FLBP_DB_CONFLICT: newer result exists'})};
    await assert.rejects(run(),error=>error.code==='FLBP_DB_CONFLICT');
    assert.deepEqual(cursors,[]); passed++;
    for(const status of [400,403,429,500]){
      response={ok:false,status,body:JSON.stringify({ok:false,reason:'rejected'})};
      await assert.rejects(run()); assert.deepEqual(cursors,[]); passed++;
    }
    response={ok:true,json:async()=>({ok:true,updated_at:'new-baseline'})};
    assert.equal((await run()).ok,true); assert.deepEqual(cursors,['new-baseline']); passed++;
    // P-29: a refused report is told apart from temporary failures.
    const refusal='Creazione partita non autorizzata: partecipanti non validi';
    for(const refused of [{ok:true,json:async()=>({ok:false,reason:'invalid_report',message:refusal})},
      {ok:false,status:400,body:JSON.stringify({ok:false,reason:'invalid_report',message:refusal})}]){
      response=refused;
      assert.equal(exports.getMatchResultRejectionReason(await run().catch(error=>error)),refusal); passed++;
    }
    for(const payload of [{ok:false,reason:'rate_limited'},{ok:false,reason:'bad_password'},
      {ok:false,reason:'conflict',message:'FLBP_DB_CONFLICT: newer result exists'},
      {ok:false,reason:'invalid_report',message:'FLBP_LOCAL_PRIMARY: local server active'}]){
      response={ok:false,status:409,body:JSON.stringify(payload)};
      assert.equal(exports.getMatchResultRejectionReason(await run().catch(error=>error)),null,JSON.stringify(payload)); passed++;
    }
    console.log(`PASS: ${edition} ${kind}: durable SQL rejections/conflicts throw; only success advances the cursor`);
  }
  // The Admin RPC raises a database error; the local server sends its own code.
  const reason=exports.getMatchResultRejectionReason;
  assert.equal(reason(new Error(JSON.stringify({code:'P0001',details:null,hint:null,message:'Creazione partita non autorizzata: girone inesistente'}))),
    'Creazione partita non autorizzata: girone inesistente');
  assert.equal(reason(Object.assign(new Error('Creazione partita non autorizzata: codice spareggio non coerente'),{code:'FLBP_INVALID_TIE_BREAK'})),
    'Creazione partita non autorizzata: codice spareggio non coerente');
  assert.equal(reason(new Error(JSON.stringify({code:'P0001',message:'Match m1 non trovato nello snapshot live'}))),null);
  assert.equal(reason(new Error('Failed to fetch')),null);
  assert.equal(reason(null),null);
  passed+=5;
  console.log(`PASS: ${edition}: refused reports are recognised, connection and temporary errors are not`);
}
console.log(`${passed} real client contract cases passed; only network IO was replaced.`);
