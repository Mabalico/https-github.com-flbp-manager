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
    'extractSupabaseErrorUpdatedAt','makeMissingMatchResultRpcError']);
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
    console.log(`PASS: ${edition} ${kind}: durable SQL rejections/conflicts throw; only success advances the cursor`);
  }
}
console.log(`${passed} real client contract cases passed; only network IO was replaced.`);
