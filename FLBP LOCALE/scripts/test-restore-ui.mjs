import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const online = root.endsWith('ONLINE');
const read = file => readFileSync(resolve(root, file), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const noop = () => {};
const state = id => ({ teams: [{ id, name: id }], tournament: null, tournamentMatches: [], tournamentHistory: [], hallOfFame: [] });
const oldState = state('old');
const restoredState = state('restored');
const receipt = { ok: true, workspaceId: 'main', operationId: 'restore-1', version: 23, summary: {} };
let checks = 0;
const check = async (label, test) => { await test(); checks++; console.log(`PASS: ${label}`); };
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const storage = () => { const items = new Map(); return { getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }; };
const timers = () => {
  const jobs = new Map(); let sequence = 0;
  return { jobs, setTimeout: callback => { const id = ++sequence; jobs.set(id, callback); return id; }, clearTimeout: id => jobs.delete(id), setInterval: () => ++sequence, run: () => { const queued = [...jobs.values()]; jobs.clear(); for (const callback of queued) callback(); } };
};
const loadModule = (file, imports = {}, globals = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(transpile(read(file)), {
    module, exports: module.exports, console, Date, Error, Promise, Set, Map,
    require: name => { assert(name in imports, `Unexpected import ${name} in ${file}`); return imports[name]; }, ...globals,
  }, { filename: file });
  return module.exports;
};
const coordinator = loadModule('services/databaseRestoreCoordinator.ts');
const sessionCase = (overrides = {}) => {
  const events = []; let status;
  const session = coordinator.createDatabaseRestoreSession({
    prepare: async () => events.push('prepare'), restore: async () => { events.push('restore'); return receipt; },
    hydrate: async () => { events.push('hydrate'); return restoredState; }, commit: async () => events.push('commit'),
    resume: value => events.push(`resume:${value}`), resolve: () => events.push('resolve'), reject: () => events.push('reject'),
    status: value => { status = value; }, ...overrides,
  });
  return { session, events, status: () => status };
};

await check('restore waits for both preparation and confirmed readback before discarding drafts', async () => {
  const gate = deferred(); const c = sessionCase({ prepare: () => gate.promise });
  const running = c.session.retry(); await turn(); assert.deepEqual(c.events, []);
  gate.resolve(); await running;
  assert.deepEqual(c.events, ['restore', 'hydrate', 'commit', 'resume:true', 'resolve']);
});
await check('postcommit read failure retries hydration only and cannot cancel', async () => {
  let reads = 0; const c = sessionCase({ hydrate: async () => { if (++reads === 1) throw Error('offline'); return restoredState; } });
  await c.session.retry(); assert.equal(c.status().canCancel, false); c.session.cancel();
  assert.deepEqual(c.events, ['prepare', 'restore']);
  await c.session.retry(); assert.equal(reads, 2); assert.equal(c.events.filter(x => x === 'restore').length, 1);
  assert.equal(c.status(), null);
});
await check('uncertain RPC stays paused and retries same callback; definite rejection may cancel', async () => {
  let calls = 0; const c = sessionCase({ restore: async () => { if (++calls === 1) throw Error('timeout'); return receipt; } });
  await c.session.retry(); c.session.cancel(); assert.equal(c.status().canCancel, false);
  assert(!c.events.some(x => x.startsWith('resume'))); await c.session.retry(); assert.equal(calls, 2);
  const rejected = sessionCase({ restore: async () => { throw Object.assign(Error('invalid'), { restoreNotCommitted: true }); } });
  await rejected.session.retry(); assert.equal(rejected.status().canCancel, true); rejected.session.cancel();
  assert.deepEqual(rejected.events, ['prepare', 'resume:false', 'reject']);
});
await check('rapid retry clicks never run two restores', async () => {
  const gate = deferred(); let calls = 0;
  const c = sessionCase({ restore: async () => { calls++; return gate.promise; } });
  const a = c.session.retry(); const b = c.session.retry(); await turn(); assert.equal(calls, 1);
  gate.resolve(receipt); await Promise.all([a, b]); await c.session.retry(); assert.equal(calls, 1);
});
await check('a later authentication rejection cannot prove an earlier timeout rolled back', async () => {
  let calls = 0; const c = sessionCase({ restore: async () => { if (++calls === 1) throw Error('timeout'); throw Object.assign(Error('session expired'), { restoreNotCommitted: true }); } });
  await c.session.retry(); await c.session.retry(); assert.equal(c.status().canCancel, false);
  c.session.cancel(); assert(!c.events.includes('resume:false'));
});

// Evaluate the actual App callback. The component's unrelated render/auth code
// is excluded by AST, while the real coordinator handles the entire sequence.
const app = read('App.tsx');
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const extract = name => {
  const found = []; const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found.push(node); ts.forEachChild(node, visit); }; visit(ast);
  assert.equal(found.length, 1, `Exactly one actual ${name} callback`);
  return `const ${found[0].getText(ast)}; globalThis.extracted = ${name};`;
};
const appCase = (overrides = {}) => {
  const timer = timers(); const events = []; const current = { current: oldState }; const paused = { current: false };
  const pending = { current: timer.setTimeout(() => events.push('stale-timer')) }; let installed;
  const repo = {
    source: 'remote', save: value => events.push(['save', value]),
    prepareForExternalRestore: async () => events.push('repo-prepare'),
    completeExternalRestore: async (value, meta) => events.push(['repo-complete', value, meta]),
    resumeAfterExternalRestore: () => events.push('repo-resume'), ...overrides.repo,
  };
  const context = {
    ...coordinator, databaseRestoreSessionRef: { current: null }, databaseRestorePausedRef: paused,
    persistenceGenerationRef: { current: 0 }, latestStateRef: current, saveTimeoutRef: pending,
    skipNextPersistRef: { current: false }, remoteAppliedRef: { current: false }, lastRemoteUpdatedAtRef: { current: null },
    repo, window: timer, localStorage: storage(), SELECTED_TOURNAMENT_KEY: 'selected',
    loadAutoDbSyncModule: async () => ({ prepareAutoSyncForDatabaseRestore: async () => events.push('sync-prepare'), finishAutoSyncDatabaseRestore: committed => events.push(`sync-finish:${committed}`) }),
    pullWorkspaceState: async () => ({ state: restoredState, updated_at: 'new', version: 23, workspace_id: 'main' }),
    coerceAppState: value => value, setRemoteBaseUpdatedAt: value => events.push(['base', value]), clearPublicDataCache: () => events.push('clear-public'),
    setPublicDbState: value => events.push(['public', value]), setPublicDbUpdatedAt: noop, publicDbUpdatedAtRef: { current: null },
    setSelectedTournament: value => events.push(['selected', value]), setState: value => { installed = value; },
    setAdminSnapshotRevision: updater => events.push(['revision', updater(0)]), setDatabaseRestoreStatus: noop,
    ...overrides,
  };
  context.repo = repo;
  vm.runInNewContext(transpile(extract('onDatabaseRestore')), context);
  const start = () => {
    context.extracted({ preventDefault: noop, detail: { restore: async () => { events.push('restore'); return receipt; }, resolve: () => events.push('resolve'), reject: error => events.push(['reject', error.message]) } });
  };
  return { context, start, events, timer, installed: () => installed };
};
await check('App clears debounce, installs exact confirmed state/base, retires drafts and resets editors', async () => {
  const c = appCase(); c.start(); assert.equal(c.context.databaseRestorePausedRef.current, true); c.timer.run();
  await turn(); assert.equal(c.installed(), restoredState); assert.equal(c.context.latestStateRef.current, restoredState);
  assert.equal(c.context.skipNextPersistRef.current, true); assert(!c.events.includes('stale-timer'));
  assert.deepEqual(JSON.parse(JSON.stringify(c.events.find(e => Array.isArray(e) && e[0] === 'repo-complete'))), ['repo-complete', restoredState, { updatedAt: 'new', version: 23, operationId: 'restore-1', discardPendingDraft: true }]);
  assert(c.events.includes('clear-public')); assert(c.events.some(e => Array.isArray(e) && e[0] === 'revision' && e[1] === 1));
  assert.equal(c.context.databaseRestorePausedRef.current, false);
  assert(app.includes('<AdminDashboardLazy key={adminSnapshotRevision}'));
});
await check('App refuses stale readback and retains write barrier until retry sees restored version', async () => {
  let reads = 0; const c = appCase({ pullWorkspaceState: async () => ({ state: restoredState, updated_at: 'new', version: ++reads === 1 ? 22 : 23, workspace_id: 'main' }) });
  c.start(); await turn(); assert.equal(c.installed(), undefined); assert.equal(c.context.databaseRestorePausedRef.current, true);
  await c.context.databaseRestoreSessionRef.current.retry(); assert.equal(c.installed(), restoredState);
  assert.equal(c.events.filter(x => x === 'restore').length, 1);
});
await check('App local checkpoint failure prevents restore and preserves state in memory', async () => {
  const c = appCase({ repo: { source: 'local', save: () => { throw Error('quota'); } } });
  c.start(); await turn(); assert(!c.events.includes('restore')); assert.equal(c.context.latestStateRef.current, oldState);
  c.context.databaseRestoreSessionRef.current.cancel(); assert.equal(c.context.databaseRestorePausedRef.current, false);
});
await check('lifecycle never writes while paused or without a pending edit, and handles local quota errors', async () => {
  const c = appCase(); let saves = 0; c.context.repo.save = () => { saves++; throw Error('quota'); };
  vm.runInNewContext(transpile(extract(online ? 'checkpointLocally' : 'flush')), c.context);
  c.context.databaseRestorePausedRef.current = true; c.context.extracted(); assert.equal(saves, 0);
  c.context.databaseRestorePausedRef.current = false; c.context.extracted(); assert.equal(saves, 1);
  c.context.extracted(); assert.equal(saves, 1);
});
await check('normal live commit does not export structured state after a local storage failure', async () => {
  const c = appCase({ repo: { source: 'local', save: () => { throw Error('quota'); } } });
  let loads = 0; c.context.loadAutoDbSyncModule = async () => { loads++; return {}; };
  vm.runInNewContext(transpile(extract('onLiveStateCommitted')), c.context);
  c.context.extracted({ detail: { state: oldState } }); await turn(); assert.equal(loads, 0);
});
await check('an old Admin callback cannot overwrite the restored state after the barrier resumes', async () => {
  const c = appCase(); c.context.useCallback = callback => callback;
  c.context.state = oldState; c.context.adminStateGeneration = 0;
  vm.runInNewContext(transpile(extract('applyAdminState')), c.context);
  c.context.persistenceGenerationRef.current = 1;
  c.context.extracted(oldState); assert.equal(c.installed(), undefined);
});

const syncCase = () => {
  const timer = timers(); const push = deferred(); const writes = [];
  const imports = {
    './supabaseRest': { getSupabaseConfig: () => ({}), pushLiveTournamentIncremental: async value => { writes.push(value); return push.promise; }, pushNormalizedFromState: async value => { writes.push(value); return push.promise; } },
    './dbDiagnostics': { markDbSyncConflict: noop, markDbSyncError: noop, markDbSyncOk: noop },
    './repository/getRepository': { getAppStateRepository: () => ({ refresh: async () => {} }) },
    './appStateMeaning': { hasMeaningfulAppState: () => true }, './repository/featureFlags': { isAutoStructuredSyncEnabled: () => true },
    './adminWriteLeaseState': { isAdminWriteBlockedByLease: () => false }, './dataPlaneClient': { resolveDataPlane: async () => ({ mode: 'cloud' }), DATA_PLANE_CHANGE_EVENT: 'plane' },
  };
  const sync = loadModule('services/autoDbSync.ts', imports, { window: { ...timer, addEventListener: noop, dispatchEvent: noop }, document: { addEventListener: noop }, localStorage: storage(), CustomEvent: class {} });
  return { sync, timer, writes, push };
};
await check('structured sync barrier drains active network call and discards old queued exports only after commit', async () => {
  const c = syncCase(); const write = c.sync.flushAutoStructuredSync(oldState, { force: true }); await turn();
  let ready = false; const pause = c.sync.prepareAutoSyncForDatabaseRestore().then(() => { ready = true; });
  await turn(); assert.equal(ready, false);
  c.sync.scheduleAutoStructuredSync(state('stale')); await c.sync.flushAutoStructuredSync(state('also-stale'), { force: true });
  assert.equal(c.writes.length, 1); c.push.resolve({}); await Promise.all([pause, write]);
  c.sync.finishAutoSyncDatabaseRestore(true); c.timer.run(); await c.sync.flushAutoStructuredSync(undefined, { force: true });
  assert.equal(c.writes.length, 1);
});
await check('cancelled restore resumes original queued structured state', async () => {
  const c = syncCase(); c.sync.scheduleAutoStructuredSync(oldState); await c.sync.prepareAutoSyncForDatabaseRestore();
  c.timer.run(); assert.equal(c.writes.length, 0); c.sync.finishAutoSyncDatabaseRestore(false);
  c.timer.run(); await turn(); assert.equal(c.writes[0], oldState); c.push.resolve({}); await turn();
});

// Load the real repository with an inert constructor: all operational members
// and their state fields are unchanged. Network/durable storage are fixtures.
await check('repository barrier waits for active work, preserves rejected draft and retires it after readback', async () => {
  let source = read('services/repository/RemoteRepository.ts');
  const tree = ts.createSourceFile('RemoteRepository.ts', source, ts.ScriptTarget.Latest, true);
  const clazz = tree.statements.find(ts.isClassDeclaration); const ctor = clazz.members.find(ts.isConstructorDeclaration);
  source = source.slice(0, ctor.pos) + '\n constructor() {}\n' + source.slice(ctor.end);
  const timer = timers(); const flight = deferred(); let draft = { operationId: 'pending-1', state: oldState }; const retired = [];
  const defaults = new Proxy({ coerceAppState: value => value, stableStateSerialize: JSON.stringify, normalizeWorkspaceVersion: value => value ?? null, getRemoteDraftOwnerId: () => 'owner', readRemoteDraftCache: () => draft, readRemoteDraftPointer: () => draft, hasRemoteDraftCache: () => !!draft, clearRemoteDraftCache: () => { draft = null; }, discardRestorableRemoteDrafts: async id => { retired.push(id); draft = null; return true; }, acknowledgeRemoteDraftCache: noop }, { get: (target, name) => name in target ? target[name] : noop });
  const module = { exports: {} };
  vm.runInNewContext(transpile(source), { module, exports: module.exports, require: () => defaults, window: timer, localStorage: storage(), console, Date });
  const repo = new module.exports.RemoteRepository(); repo.pendingState = oldState; repo.pendingOperationId = 'pending-1'; repo.pendingTimer = timer.setTimeout(noop); repo.flushInFlight = flight.promise;
  let ready = false; const pause = repo.prepareForExternalRestore().then(() => { ready = true; }); await turn();
  assert.equal(ready, false); assert.equal(repo.pendingState, oldState); repo.save(restoredState); assert.equal(repo.pendingState, oldState);
  flight.resolve(); await pause; repo.flushInFlight = null; assert.equal(timer.jobs.size, 0);
  repo.resumeAfterExternalRestore(); assert.equal(repo.pendingState, oldState); assert(timer.jobs.size > 0);
  await repo.prepareForExternalRestore(); await repo.completeExternalRestore(restoredState, { updatedAt: 'new', version: 23, operationId: 'restore-1' });
  assert.equal(repo.pendingState, null); assert.equal(repo.lastRemoteState, restoredState); assert.equal(draft, null);
  if (online) assert.deepEqual(retired, ['pending-1']); repo.resumeAfterExternalRestore(); assert.equal(timer.jobs.size, 0);
});
await check('public cache invalidation prevents a pre-restore fetch from refilling the cache', async () => {
  const cache = loadModule('services/publicDataCache.ts'); const fetch = deferred();
  const pending = cache.getOrFetchCachedPublicData('test', 10000, () => fetch.promise);
  cache.clearPublicDataCache(); cache.writeCachedPublicData('test', 'restored'); fetch.resolve('stale'); await pending;
  assert.equal(cache.readCachedPublicData('test', 10000), 'restored');
});

console.log(`Restore UI regressions: ${checks} passed (${online ? 'ONLINE' : 'LOCALE'}).`);
