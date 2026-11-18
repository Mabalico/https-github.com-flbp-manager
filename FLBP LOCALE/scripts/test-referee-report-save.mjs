import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const usesOutbox = false;
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
const selectors = loadPureModule('services/tournamentStructureSelectors.ts');
const fault = code => Object.assign(new Error(code), { code });
const plain = value => JSON.parse(JSON.stringify(value));
const drainMicrotasks = () => new Promise(resolve => setImmediate(resolve));

const createCase = (options = {}) => {
  const teams = options.teams || [
    { id: 'a', name: 'A', player1: 'Rossi Mario', player2: 'Verdi Anna' },
    { id: 'b', name: 'B', player1: 'Neri Luca', player2: 'Bianchi Sara' },
  ];
  const match = options.foundMatch || { id: 'm1', code: 'A1', teamAId: 'a', teamBId: 'b', phase: 'groups', status: 'playing', played: false, scoreA: 0, scoreB: 0 };
  const localMatches = options.matches || [match];
  const state = {
    teams, tournamentMatches: localMatches,
    tournament: { id: 't1', type: options.tournamentType || 'round_robin', teams, matches: localMatches, refereesPassword: options.configuredSecret || '' },
  };
  const events = [];
  const calls = { cleanup: [], rpc: [], snapshots: [], queued: [], acknowledged: [], failed: [], alerts: [], warnings: [], busy: [], states: [], pulls: [] };
  let snapshotAttempts = 0;
  const context = {
    ...matchUtils, ...reportAudit,
    findLockedSuccessorForWinnerChange: selectors.findLockedSuccessorForWinnerChange,
    state, foundMatch: match, activeRefereeName: 'Arbitro test',
    derivedScoresByTeam: options.derivedScoresByTeam || (options.tie ? { a: 10, b: 10 } : { a: 10, b: 7 }),
    reportStatsForm: options.reportStatsForm || {
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
    propagateWinnerFromMatch: options.realBracket
      ? (finished, matches) => selectors.advanceWinner(matches, finished)
      : (_match, matches) => matches,
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
    pullRefereeLiveState: async (tournamentId, secret) => {
      calls.pulls.push({ tournamentId, secret }); events.push('pull');
      if (options.pullError) throw fault(options.pullError);
      return { ok: true, state: options.pulledState || { ...state, remoteNote: 'preserve concurrent change' }, updated_at: 'new-base-version' };
    },
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

// Bracket fixture: two semifinals feeding one final.
const bracketTeams = [
  { id: 'a1', name: 'A1', player1: 'Rossi Mario', player2: 'Verdi Anna' },
  { id: 'b1', name: 'B1', player1: 'Neri Luca', player2: 'Bianchi Sara' },
  { id: 'c1', name: 'C1', player1: 'Gialli Paolo', player2: 'Blu Marta' },
  { id: 'd1', name: 'D1', player1: 'Viola Ugo', player2: 'Rosa Ida' },
];
const bracketStats = {
  'a1||Rossi Mario': { canestri: '6', soffi: '0' }, 'a1||Verdi Anna': { canestri: '4', soffi: '0' },
  'b1||Neri Luca': { canestri: '4', soffi: '0' }, 'b1||Bianchi Sara': { canestri: '3', soffi: '0' },
  'c1||Gialli Paolo': { canestri: '6', soffi: '0' }, 'c1||Blu Marta': { canestri: '4', soffi: '0' },
  'd1||Viola Ugo': { canestri: '4', soffi: '0' }, 'd1||Rosa Ida': { canestri: '3', soffi: '0' },
};
const bracketMatch = (id, code, round, orderIndex, teamAId, teamBId, extra = {}) => ({
  id, code, phase: 'bracket', round, orderIndex, teamAId, teamBId,
  status: 'scheduled', played: false, scoreA: 0, scoreB: 0, ...extra,
});
const finishedBy = (scoreA, scoreB, savedAt) => ({
  status: 'finished', played: true, scoreA, scoreB,
  refereeReportFinalId: `report-${savedAt}`, refereeReportSavedAt: savedAt,
});
const bracketState = (matches) => ({
  teams: bracketTeams, tournamentMatches: matches,
  tournament: { id: 't1', type: 'elimination', teams: bracketTeams, matches, refereesPassword: '' },
});

if (usesOutbox) {
  await check('B3 #2: a stale referee rebuilds the patch from the live state and keeps the winner advanced by another referee', async () => {
    // R2 logged in before R1 saved semifinal 1: its copy still has the final on TBD vs TBD.
    const semi2 = bracketMatch('s2', 'B12', 1, 1, 'c1', 'd1', { status: 'playing' });
    const local = [bracketMatch('s1', 'B11', 1, 0, 'a1', 'b1'), semi2, bracketMatch('f', 'B21', 2, 0, 'TBD-W-B11', 'TBD-W-B12')];
    const live = [
      bracketMatch('s1', 'B11', 1, 0, 'a1', 'b1', finishedBy(10, 6, '2026-11-17T10:00:00.000Z')),
      { ...semi2 },
      bracketMatch('f', 'B21', 2, 0, 'a1', 'TBD-W-B12'),
    ];
    const result = createCase({
      secret: 'ref-secret', teams: bracketTeams, foundMatch: semi2, matches: local, tournamentType: 'elimination',
      pulledState: bracketState(live), derivedScoresByTeam: { c1: 10, d1: 7 }, reportStatsForm: bracketStats, realBracket: true,
    });
    await result.saveReport();
    assert.deepEqual(result.calls.alerts, ['alert_report_saved']);
    const sentFinal = result.calls.rpc[0].matches.find(match => match.id === 'f');
    assert.equal(sentFinal?.teamAId, 'a1', 'the patch must keep the winner advanced by the other referee');
    assert.equal(sentFinal?.teamBId, 'c1', 'the patch must advance this referee\'s winner');
    assert.equal(result.calls.pulls.length, 1, 'the live state is read once before building the patch');
    assert(result.events.indexOf('pull') < result.events.indexOf('queue'), 'the read happens before the report is queued');
    assert.equal(result.calls.queued[0].matches.find(match => match.id === 'f')?.teamAId, 'a1', 'the durable queue holds the same rebuilt patch');
    const shownFinal = result.calls.states[0].tournamentMatches.find(match => match.id === 'f');
    assert.equal(`${shownFinal.teamAId}-${shownFinal.teamBId}`, 'a1-c1');
  });
  await check('B3 #2: if the live state cannot be read the local copy still reaches the device queue', async () => {
    const result = createCase({ secret: 'ref-secret', pullError: 'NETWORK_ERROR', rpcError: 'NETWORK_ERROR' });
    await result.saveReport();
    assert.equal(result.calls.pulls.length, 1);
    assert.equal(result.calls.queued.length, 1, 'the report is still queued');
    assert.equal(result.calls.failed.length, 1);
    assert.equal(result.calls.states[0].tournamentMatches[0].scoreA, 10, 'the local copy is kept on screen');
  });
}
await check('B3 #3: a correction that flips the winner is blocked when the next round was already played', async () => {
  const semi1 = bracketMatch('s1', 'B11', 1, 0, 'a1', 'b1', finishedBy(10, 6, '2026-11-17T10:00:00.000Z'));
  const matches = [
    semi1,
    bracketMatch('s2', 'B12', 1, 1, 'c1', 'd1', finishedBy(10, 7, '2026-11-17T10:05:00.000Z')),
    bracketMatch('f', 'B21', 2, 0, 'a1', 'c1', finishedBy(10, 8, '2026-11-17T10:30:00.000Z')),
  ];
  const result = createCase({
    local: true, teams: bracketTeams, foundMatch: semi1, matches, tournamentType: 'elimination',
    derivedScoresByTeam: { a1: 6, b1: 10 }, reportStatsForm: bracketStats, realBracket: true,
  });
  await result.saveReport();
  assert.equal(result.calls.alerts.length, 1);
  assert(result.calls.alerts[0].startsWith('editor_winner_cannot_advance'), 'the referee is told why the report was not saved');
  assert(result.calls.alerts[0].includes('B21'));
  assert.equal(result.calls.states.length + result.calls.queued.length + result.calls.rpc.length, 0, 'nothing is written');
  assert.deepEqual(result.calls.busy, [true, false]);
});
await check('B3 #3: a correction that keeps the same winner is still saved', async () => {
  const semi1 = bracketMatch('s1', 'B11', 1, 0, 'a1', 'b1', finishedBy(10, 6, '2026-11-17T10:00:00.000Z'));
  const matches = [
    semi1,
    bracketMatch('s2', 'B12', 1, 1, 'c1', 'd1', finishedBy(10, 7, '2026-11-17T10:05:00.000Z')),
    bracketMatch('f', 'B21', 2, 0, 'a1', 'c1', finishedBy(10, 8, '2026-11-17T10:30:00.000Z')),
  ];
  const result = createCase({
    local: true, teams: bracketTeams, foundMatch: semi1, matches, tournamentType: 'elimination',
    derivedScoresByTeam: { a1: 10, b1: 7 }, reportStatsForm: bracketStats, realBracket: true,
  });
  await result.saveReport();
  assert.deepEqual(result.calls.alerts, ['alert_report_saved']);
  const saved = result.calls.states[0].tournamentMatches;
  assert.equal(saved.find(match => match.id === 's1').scoreB, 7);
  assert.equal(saved.find(match => match.id === 'f').teamAId, 'a1', 'the played final is untouched');
});

console.log(`Referee report save: ${passed} checks passed (${usesOutbox ? 'ONLINE outbox/RPC' : 'LOCALE snapshot'}).`);
