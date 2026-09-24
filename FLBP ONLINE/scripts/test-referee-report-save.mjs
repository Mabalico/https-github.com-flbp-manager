import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const usesOutbox = true;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = resolve(root, 'components/RefereesArea.tsx');
const source = readFileSync(componentPath, 'utf8');

// Execute the actual component callbacks, not a reimplementation of saving.
// IO is injected; unrelated tournament transitions are held stable in this
// fixture. No browser, real credentials, network or filesystem writes are used.
const ast = ts.createSourceFile(componentPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['closeLiveCallsForMatch', 'saveReport'];
const declarations = new Map();
const visit = (node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    assert(!declarations.has(node.name.text), `Ambiguous callback: ${node.name.text}`);
    declarations.set(node.name.text, `const ${node.getText(ast)};`);
  }
  ts.forEachChild(node, visit);
};
visit(ast);
for (const name of names) assert(declarations.has(name), `Missing real callback: ${name}`);
const callbacks = ts.transpileModule(
  names.map(name => declarations.get(name)).join('\n') + '\nglobalThis.callbacks = { closeLiveCallsForMatch, saveReport };',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

const pureModules = new Map();
const loadPureModule = (relativePath) => {
  const path = resolve(root, relativePath);
  if (pureModules.has(path)) return pureModules.get(path);
  const module = { exports: {} };
  const javascript = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(javascript, {
    module, exports: module.exports,
    require: specifier => {
      assert(specifier.startsWith('.'), `Unexpected dependency in pure fixture: ${specifier}`);
      return loadPureModule(resolve(dirname(path), `${specifier}.ts`));
    },
  }, { filename: path });
  pureModules.set(path, module.exports);
  return module.exports;
};
const matchUtils = loadPureModule('services/matchUtils.ts');
const reportAudit = loadPureModule('services/refereeReportAudit.ts');
const fault = code => Object.assign(new Error(code), { code });
const plain = value => JSON.parse(JSON.stringify(value));
const drainMicrotasks = () => new Promise(resolve => setImmediate(resolve));

const createCase = (options = {}) => {
  const teams = [
    { id: 'a', name: 'A', player1: 'Rossi Mario', player2: 'Verdi Anna' },
    { id: 'b', name: 'B', player1: 'Neri Luca', player2: 'Bianchi Sara' },
  ];
  const match = { id: 'm1', code: 'A1', teamAId: 'a', teamBId: 'b', phase: 'groups', status: 'playing', played: false, scoreA: 0, scoreB: 0 };
  const state = {
    teams, tournamentMatches: [match],
    tournament: { id: 't1', type: 'round_robin', teams, matches: [match], refereesPassword: options.configuredSecret || '' },
  };
  const events = [];
  const calls = { cleanup: [], rpc: [], snapshots: [], queued: [], acknowledged: [], failed: [], alerts: [], warnings: [], busy: [], states: [] };
  let snapshotAttempts = 0;
  const context = {
    ...matchUtils, ...reportAudit,
    state, foundMatch: match, activeRefereeName: 'Arbitro test',
    derivedScoresByTeam: options.tie ? { a: 10, b: 10 } : { a: 10, b: 7 },
    reportStatsForm: {
      'a||Rossi Mario': { canestri: '6', soffi: '1' },
      'a||Verdi Anna': { canestri: '4', soffi: '2' },
      'b||Neri Luca': { canestri: '4', soffi: '0' },
      'b||Bianchi Sara': { canestri: '3', soffi: '1' },
    },
    getTeamFromCatalog: id => teams.find(team => team.id === id),
    syncedPasswordRef: { current: options.secret ?? '' },
    isLocalOnlyMode: () => !!options.local,
    getSupabaseConfig: () => options.noConfig ? null : { url: 'https://example.invalid' },
    getSupabaseAccessToken: () => options.token ? 'fixture-token' : null,
    getRemoteBaseUpdatedAt: () => 'base-version',
    setSaveBusy: value => { calls.busy.push(value); events.push(`busy:${value}`); },
    setState: value => { calls.states.push(value); events.push('state'); },
    t: key => key,
    alert: message => { calls.alerts.push(message); events.push(`alert:${message}`); },
    confirm: () => true,
    console: { warn: (...args) => calls.warnings.push(args) },
    window: { dispatchEvent: () => { events.push('event'); } },
    CustomEvent: class { constructor(type) { this.type = type; } },
    FANTA_APP_CHANGE_EVENT: 'fanta-change',
    syncBracketFromGroups: (_tournament, matches) => matches,
    autoResolveBracketByes: matches => matches,
    ensureFinalTieBreakIfNeeded: (_tournament, matches) => matches,
    propagateWinnerFromMatch: (_match, matches) => matches,
    clearDbSyncCurrentIssue: () => events.push('clear-error'),
    markDbSyncOk: () => events.push('synced'),
    markDbSyncConflict: () => events.push('conflict'),
    markDbSyncError: () => events.push('save-error'),
    cancelActivePlayerAppCallsForMatch: input => {
      calls.cleanup.push(input); events.push('cleanup');
      if (options.cleanup === 'sync') throw new Error('sync cleanup failure');
      if (options.cleanup === 'reject') return Promise.reject(new Error('async cleanup failure'));
      if (options.cleanup === 'pending') return new Promise(() => {});
      return Promise.resolve([]);
    },
    enqueueRefereeReport: async input => {
      calls.queued.push(input); events.push('queue');
      return { ...input, operationId: 'report-op-1' };
    },
    acknowledgeRefereeReport: id => { calls.acknowledged.push(id); events.push('ack'); },
    markRefereeReportAttemptFailed: (id, error) => { calls.failed.push({ id, error }); events.push('failed'); },
    pushRefereeMatchResults: async input => {
      calls.rpc.push(input); events.push('rpc');
      if (options.rpcError) throw fault(options.rpcError);
    },
    isMatchResultRpcMissingError: error => error.code === 'PGRST202',
    pushRefereeLiveState: async (nextState, input) => {
      calls.snapshots.push({ state: nextState, input }); events.push('snapshot');
      snapshotAttempts++;
      if (options.snapshotError && (snapshotAttempts === 1 || options.snapshotAlwaysFails)) throw fault(options.snapshotError);
    },
    pullRefereeLiveState: async () => ({ ok: true, state: { ...state, remoteNote: 'preserve concurrent change' }, updated_at: 'new-base-version' }),
    tryMergeRemoteStateConflict: ({ localState, remoteState }) => options.mergeBlocked
      ? { ok: false }
      : { ok: true, state: { ...localState, remoteNote: remoteState.remoteNote } },
  };
  vm.runInNewContext(callbacks, context, { filename: componentPath });
  return { ...context.callbacks, calls, events, match, state };
};

let passed = 0;
const check = async (name, body) => {
  await body(); passed++;
  console.log(`PASS ${name}`);
};
const assertSaved = (result) => {
  assert.equal(result.calls.states.length, 1, 'apply the report once');
  assert.deepEqual(result.calls.alerts, ['alert_report_saved']);
  assert.deepEqual(result.calls.busy, [true, false]);
  assert.deepEqual(result.calls.failed, [], 'cleanup must never requeue a committed report');
  assert(!result.events.includes('conflict'), 'cleanup must never become a DB conflict');
  const saved = result.calls.states[0].tournamentMatches[0];
  assert.equal(saved.status, 'finished');
  assert.equal(saved.scoreA, 10); assert.equal(saved.scoreB, 7);
  assert.equal(saved.refereeReportAudit.length, 1);
  assert.equal(saved.refereeReportAudit[0].refereeName, 'Arbitro test');
  if (result.calls.cleanup.length) {
    assert(result.events.indexOf('state') < result.events.indexOf('cleanup'));
    assert(result.events.indexOf('alert:alert_report_saved') < result.events.indexOf('cleanup'));
  }
};

for (const options of [{ local: true }, { noConfig: true }]) {
  await check(`local application skips cloud cleanup (${options.local ? 'local-only' : 'no config'})`, async () => {
    const result = createCase(options); await result.saveReport(); assertSaved(result);
    assert.equal(result.calls.cleanup.length, 0); assert.equal(result.calls.rpc.length, 0); assert.equal(result.calls.snapshots.length, 0);
  });
}
for (const cleanup of ['sync', 'reject', 'pending']) {
  await check(`token save succeeds when cleanup ${cleanup}`, async () => {
    const result = createCase({ token: true, cleanup }); await result.saveReport(); assertSaved(result);
    assert.equal(result.calls.cleanup[0].refereePassword, undefined, 'token path must not invent a referee secret');
    assert.equal(result.calls.rpc.length, 0); assert.equal(result.calls.snapshots.length, 0);
    await drainMicrotasks();
    assert.equal(result.calls.warnings.length, cleanup === 'pending' ? 0 : 1);
  });
}
await check('configured credential is passed explicitly and trimmed', async () => {
  const result = createCase({ token: true, configuredSecret: ' configured-secret ', secret: 'other-secret' });
  await result.saveReport(); assertSaved(result);
  assert.equal(result.calls.cleanup[0].refereePassword, 'configured-secret');
});
for (const cleanup of ['sync', 'reject']) {
  await check(`remote referee confirmation survives ${cleanup} cleanup failure`, async () => {
    const result = createCase({ secret: ' transient-secret ', cleanup }); await result.saveReport(); assertSaved(result);
    const sent = usesOutbox ? result.calls.rpc[0] : result.calls.snapshots[0].input;
    assert.equal(sent.refereePassword, 'transient-secret');
    assert.equal(result.calls.cleanup[0].refereePassword, sent.refereePassword);
    await drainMicrotasks();
    assert.equal(result.calls.warnings.length, 1);
    if (usesOutbox) {
      assert.deepEqual(result.calls.acknowledged, ['report-op-1']);
      assert(result.events.indexOf('ack') < result.events.indexOf('cleanup'));
      assert.equal(sent.operationId, 'report-op-1');
    }
  });
}
await check('missing referee secret does not write, acknowledge or clean up', async () => {
  const result = createCase(); await result.saveReport();
  assert.deepEqual(result.calls.alerts, ['referees_session_expired_relogin']);
  assert.equal(result.calls.states.length + result.calls.cleanup.length + result.calls.rpc.length + result.calls.snapshots.length + result.calls.queued.length, 0);
  assert.deepEqual(result.calls.busy, [true, false]);
});
await check('merged snapshot is confirmed once even when cleanup fails', async () => {
  const result = createCase({ secret: 'ref-secret', rpcError: usesOutbox ? 'PGRST202' : undefined, snapshotError: 'FLBP_DB_CONFLICT', cleanup: 'sync' });
  await result.saveReport(); assertSaved(result);
  assert.equal(result.calls.snapshots.length, 2);
  assert.equal(result.calls.states[0].remoteNote, 'preserve concurrent change');
  assert.equal(result.calls.snapshots[1].input.baseUpdatedAt, 'new-base-version');
  assert.equal(result.calls.cleanup[0].refereePassword, 'ref-secret');
  if (usesOutbox) assert.deepEqual(result.calls.acknowledged, ['report-op-1']);
});
await check('unresolved snapshot conflict does not run cleanup or acknowledge', async () => {
  const result = createCase({ secret: 'ref-secret', rpcError: usesOutbox ? 'PGRST202' : undefined, snapshotError: 'FLBP_DB_CONFLICT', mergeBlocked: true });
  await result.saveReport();
  assert.equal(result.calls.cleanup.length, 0); assert.equal(result.calls.acknowledged.length, 0);
  assert(!result.calls.alerts.includes('alert_report_saved')); assert(result.events.includes('conflict'));
  if (usesOutbox) assert.equal(result.calls.failed.length, 1);
});
if (usesOutbox) {
  await check('missing result RPC falls back to snapshot and acknowledges only once', async () => {
    const result = createCase({ secret: 'ref-secret', rpcError: 'PGRST202', cleanup: 'reject' });
    await result.saveReport(); assertSaved(result);
    assert.equal(result.calls.rpc.length, 1); assert.equal(result.calls.snapshots.length, 1);
    assert.equal(result.calls.snapshots[0].input.refereePassword, 'ref-secret');
    assert.deepEqual(result.calls.acknowledged, ['report-op-1']);
    await drainMicrotasks();
    assert.equal(result.calls.warnings.length, 1);
  });
  await check('result RPC conflict remains pending without snapshot retry or cleanup', async () => {
    const result = createCase({ secret: 'ref-secret', rpcError: 'FLBP_DB_CONFLICT' });
    await result.saveReport();
    assert.equal(result.calls.snapshots.length + result.calls.cleanup.length + result.calls.acknowledged.length, 0);
    assert.equal(result.calls.failed.length, 1); assert.equal(result.calls.states.length, 1);
    assert(!result.calls.alerts.includes('alert_report_saved')); assert(result.events.includes('conflict'));
  });
}
await check('remote failure retains existing failure handling without cleanup', async () => {
  const result = createCase({ secret: 'ref-secret', rpcError: 'NETWORK_ERROR', snapshotError: 'NETWORK_ERROR' });
  await result.saveReport();
  assert.equal(result.calls.cleanup.length, 0); assert.equal(result.calls.acknowledged.length, 0);
  assert(!result.calls.alerts.includes('alert_report_saved')); assert(result.events.includes('save-error'));
  assert.deepEqual(result.calls.busy, [true, false]);
  if (usesOutbox) assert.equal(result.calls.failed.length, 1);
});
await check('cleanup ignores BYE/TBD and deduplicates real participants', async () => {
  const result = createCase({ token: true });
  await result.closeLiveCallsForMatch({ id: 'multi', teamIds: ['a', 'BYE', 'TBD-1', 'a', 'b', 'TBD'] }, 't1', 'ref-secret');
  assert.deepEqual(plain(result.calls.cleanup[0].teamIds), ['a', 'b']);
  assert.equal(result.calls.cleanup[0].matchId, 'multi');
  assert.equal(result.calls.cleanup[0].dispatchPush, true);
  await result.closeLiveCallsForMatch({ id: 'hidden', teamIds: ['BYE', 'TBD-2'] }, 't1');
  assert.equal(result.calls.cleanup.length, 1);
});
await check('tied scores still block report and cleanup', async () => {
  const result = createCase({ local: true, tie: true }); await result.saveReport();
  assert.deepEqual(result.calls.alerts, ['alert_tie_not_allowed']);
  assert.equal(result.calls.states.length + result.calls.cleanup.length, 0);
  assert.deepEqual(result.calls.busy, [true, false]);
});

console.log(`Referee report save: ${passed} checks passed (${usesOutbox ? 'ONLINE outbox/RPC' : 'LOCALE snapshot'}).`);
