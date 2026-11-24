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
const names = ['isRefereeRateLimited', 'refereeRejectedReportMessage', 'closeLiveCallsForMatch', 'backToMatchStep', 'finishManualReport', 'saveReport', 'doLogin',
  'PRIVATE_APP_STATE_KEYS', 'hasPrivateAppData', 'REFEREE_VIEW_MATCH_KEYS', 'mergeRefereeLiveState', 'applyRefereeState',
  'lookupMatchByCode', 'confirmOcrModal',
  ...(usesOutbox ? ['replayPendingReports'] : [])];
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
  names.map(name => declarations.get(name)).join('\n') + `\nglobalThis.callbacks = { ${names.join(', ')} };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

// The real rejection classifier from supabaseRest: pure, no network.
const restPath = resolve(root, 'services/supabaseRest.ts');
const restAst = ts.createSourceFile(restPath, readFileSync(restPath, 'utf8'), ts.ScriptTarget.Latest, true);
const restNames = new Set(['parseSupabaseErrorPayload', 'getMatchResultRejectionReason']);
const restExports = {};
vm.runInNewContext(ts.transpileModule(restAst.statements
  .filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && restNames.has(d.name.text)))
  .map(node => node.getText(restAst)).join('\n'),
{ compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: restExports });
assert.equal(typeof restExports.getMatchResultRejectionReason, 'function', 'Missing real getMatchResultRejectionReason');

const pureModules = new Map();
class ReportInput {
  constructor(index) { this.dataset = { reportFieldIndex: String(index) }; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}
const loadPureModule = (relativePath) => {
  const path = resolve(root, relativePath);
  if (pureModules.has(path)) return pureModules.get(path);
  const module = { exports: {} };
  const javascript = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(javascript, {
    module, exports: module.exports,
    HTMLInputElement: ReportInput,
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
const reportEntry = loadPureModule('services/reportEntry.ts');
const fault = code => typeof code === 'string' ? Object.assign(new Error(code), { code }) : code;
// What supabaseRest throws for an HTTP 429 referee rejection: the raw body.
const rateLimitedBody = () => new Error('{"ok":false,"reason":"rate_limited"}');
// What supabaseRest throws when Supabase refuses the report itself (HTTP 400).
const refusedBody = (message = 'Creazione partita non autorizzata: il girone non è ancora concluso') =>
  new Error(JSON.stringify({ ok: false, reason: 'invalid_report', message }));
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
    ...(options.extraState || {}),
    teams, tournamentMatches: localMatches,
    tournament: { id: 't1', type: options.tournamentType || 'round_robin', teams, matches: localMatches, refereesPassword: options.configuredSecret || '' },
  };
  // What the App holds: the component hands it updates through setState.
  let appState = options.appState || state;
  const events = [];
  const calls = { notices: [], cleanup: [], rpc: [], snapshots: [], queued: [], acknowledged: [], failed: [], alerts: [], warnings: [], busy: [], states: [], pulls: [], loginErrors: [], authed: [], verifies: [], mergeInputs: [], foundIds: [], codeChoices: [], codeErrors: [], forms: [], pages: [], ocrErrors: [] };
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
    setState: value => {
      appState = typeof value === 'function' ? value(appState) : value;
      calls.states.push(appState); events.push('state');
    },
    t: key => key === 'report_saved_summary' ? 'Saved {code} · {score}' : key,
    reportSaveFeedback: { show: message => { calls.notices.push(message); events.push('saved'); } },
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
    getMatchResultRejectionReason: restExports.getMatchResultRejectionReason,
    pushRefereeLiveState: async (nextState, input) => {
      calls.snapshots.push({ state: nextState, input }); events.push('snapshot');
      snapshotAttempts++;
      if (options.snapshotError && (snapshotAttempts === 1 || options.snapshotAlwaysFails)) throw fault(options.snapshotError);
    },
    pullRefereeLiveState: async (tournamentId, secret) => {
      calls.pulls.push({ tournamentId, secret }); events.push('pull');
      if (options.pullError) throw fault(options.pullError);
      if (options.pullResult) return options.pullResult;
      return { ok: true, state: options.pulledState || { ...state, tournament: { ...state.tournament, remoteNote: 'preserve concurrent change' } }, updated_at: 'new-base-version' };
    },
    // Login (doLogin): remote check path, the password is not configured locally.
    liveTournament: { id: 't1', name: 'Torneo test', refereesPassword: '' },
    password: ' fixture-entered ',
    setLoginBusy: () => {},
    setLoginError: value => calls.loginErrors.push(value),
    setAuthed: value => calls.authed.push(value),
    setPassword: () => {},
    sessionStorage: { setItem: () => {}, removeItem: () => {} },
    replayPendingReports: async () => 0,
    readDurablePendingRefereeReports: async () => options.pending || [],
    verifyRefereePassword: async (tournamentId, secret) => {
      calls.verifies.push({ tournamentId, secret });
      if (options.verifyError) throw options.verifyError;
      return options.verifyResult || { ok: true, auth_version: 'v1' };
    },
    tryMergeRemoteStateConflict: (input) => {
      calls.mergeInputs.push(input);
      return options.mergeBlocked
        ? { ok: false }
        : { ok: true, state: { ...input.localState, tournament: { ...input.localState.tournament, remoteNote: input.remoteState.tournament?.remoteNote } } };
    },
    // Report code lookup (lookupMatchByCode, confirmOcrModal): what the component reads and shows.
    tournamentMatchesSorted: [...localMatches].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    reportCode: options.reportCode || '',
    ocrModalCode: options.ocrModalCode || '',
    ocrModalImageUrl: '', ocrModalText: '', ocrModalData: null,
    setReportCodeError: value => calls.codeErrors.push(value),
    setCodeChoices: value => calls.codeChoices.push(value),
    setFoundMatchId: value => calls.foundIds.push(value),
    initReportFormFromMatch: value => calls.forms.push(value.id),
    setPage: value => calls.pages.push(value),
    setOcrModalError: value => calls.ocrErrors.push(value),
    setEntryMode: () => {}, clearOcrSupport: () => {}, persistReportCode: () => {}, scrollToPageTop: () => {},
    setSupportImageUrl: () => {}, setSupportOcrText: () => {}, setSupportOcrData: () => {}, closeOcrModal: () => {},
  };
  vm.runInNewContext(callbacks, context, { filename: componentPath });
  return { ...context.callbacks, calls, events, match, state };
};

let passed = 0;
const check = async (name, body) => {
  await body(); passed++;
  console.log(`PASS ${name}`);
};
await check('manual report Enter traverses fields, refuses a tied leader and submits only at the end', () => {
  const fields = Array.from({ length: 8 }, (_, index) => new ReportInput(index));
  const container = {
    querySelectorAll: () => fields,
    querySelector: selector => fields.find(field => selector.includes('"' + field.dataset.reportFieldIndex + '"')),
  };
  let saves = 0;
  const pressEnter = (index, options = {}) => {
    for (const field of fields) { field.focused = false; field.selected = false; }
    let prevented = false;
    reportEntry.handleReportFieldEnter({
      key: 'Enter', shiftKey: !!options.backwards, currentTarget: container, target: fields[index],
      nativeEvent: { isComposing: false }, preventDefault: () => { prevented = true; },
    }, { tied: !!options.tied, canSave: options.canSave !== false, save: () => { saves++; } });
    assert(prevented);
    return fields.findIndex(field => field.focused && field.selected);
  };
  assert.equal(reportEntry.nextReportFieldIndex(0, fields.length, true), undefined);
  assert.equal(reportEntry.nextReportFieldIndex(7, fields.length, false), undefined);
  assert.deepEqual(plain(reportEntry.reportTieState([0, 0])), { tied: false, leaderIndex: -1 });
  assert.deepEqual(plain(reportEntry.reportTieState([10, 7])), { tied: false, leaderIndex: 0 });
  assert.deepEqual(plain(reportEntry.reportTieState([1, 2, 2])), { tied: true, leaderIndex: -1 });
  for (let index = 0; index < 7; index++) assert.equal(pressEnter(index), index + 1);
  assert.equal(pressEnter(3, { backwards: true }), 2);
  assert.equal(pressEnter(7, { tied: true, canSave: false }), 0);
  pressEnter(7, { canSave: false });
  assert.equal(saves, 0);
  pressEnter(7);
  assert.equal(saves, 1);
});
const assertSaved = (result) => {
  assert.equal(result.calls.states.length, 1, 'apply the report once');
  assert.deepEqual(result.calls.alerts, []);
  assert.deepEqual(result.calls.notices, [`Saved ${result.match.code} · 10–7`]);
  assert.equal(result.calls.pages.at(-1), 'match');
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
    assert(result.events.indexOf('saved') < result.events.indexOf('cleanup'));
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
  assert.equal(result.calls.states[0].tournament.remoteNote, 'preserve concurrent change');
  assert.equal(result.calls.snapshots[1].input.baseUpdatedAt, 'new-base-version');
  assert.equal(result.calls.cleanup[0].refereePassword, 'ref-secret');
  if (usesOutbox) assert.deepEqual(result.calls.acknowledged, ['report-op-1']);
});
await check('unresolved snapshot conflict does not run cleanup or acknowledge', async () => {
  const result = createCase({ secret: 'ref-secret', rpcError: usesOutbox ? 'PGRST202' : undefined, snapshotError: 'FLBP_DB_CONFLICT', mergeBlocked: true });
  await result.saveReport();
  assert.equal(result.calls.cleanup.length, 0); assert.equal(result.calls.acknowledged.length, 0);
  assert(!result.calls.notices.length); assert(result.events.includes('conflict'));
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
    assert(!result.calls.notices.length); assert(result.events.includes('conflict'));
  });
}
await check('remote failure retains existing failure handling without cleanup', async () => {
  const result = createCase({ secret: 'ref-secret', rpcError: 'NETWORK_ERROR', snapshotError: 'NETWORK_ERROR' });
  await result.saveReport();
  assert.equal(result.calls.cleanup.length, 0); assert.equal(result.calls.acknowledged.length, 0);
  assert(!result.calls.notices.length); assert(result.events.includes('save-error'));
  assert.deepEqual(result.calls.busy, [true, false]);
  if (usesOutbox) assert.equal(result.calls.failed.length, 1);
});
await check('B6: a locked referee report push explains the lock instead of a connection error', async () => {
  const locked = usesOutbox
    ? createCase({ secret: 'ref-secret', rpcError: rateLimitedBody() })
    : createCase({ secret: 'ref-secret', snapshotError: rateLimitedBody() });
  await locked.saveReport();
  assert.equal(locked.calls.alerts.length, 1);
  assert(locked.calls.alerts[0].startsWith('referees_rate_limited'), locked.calls.alerts[0]);
  assert.equal(locked.calls.cleanup.length + locked.calls.acknowledged.length, 0, 'a rejected report is neither confirmed nor cleaned up');
  assert(locked.events.includes('save-error'));
  if (usesOutbox) {
    assert.equal(locked.calls.queued.length, 1, 'the report stays in the device queue');
    assert.equal(locked.calls.failed.length, 1);
    assert(locked.calls.alerts[0].includes('salvato sul dispositivo'), 'the referee is told the report is kept');
    const fallback = createCase({ secret: 'ref-secret', rpcError: 'PGRST202', snapshotError: rateLimitedBody(), snapshotAlwaysFails: true });
    await fallback.saveReport();
    assert(fallback.calls.alerts[0].startsWith('referees_rate_limited'), 'snapshot fallback explains the lock too');
    assert.equal(fallback.calls.acknowledged.length, 0);
  } else {
    assert.equal(locked.calls.states.length, 0, 'LOCALE keeps the old no-write behaviour');
  }
  const offline = usesOutbox
    ? createCase({ secret: 'ref-secret', rpcError: 'NETWORK_ERROR' })
    : createCase({ secret: 'ref-secret', snapshotError: 'NETWORK_ERROR' });
  await offline.saveReport();
  assert(!offline.calls.alerts[0].startsWith('referees_rate_limited'), 'other failures keep their message');
});
await check('P-29: a report the server refuses shows the reason instead of a connection error', async () => {
  const refused = usesOutbox
    ? createCase({ secret: 'ref-secret', rpcError: refusedBody() })
    : createCase({ secret: 'ref-secret', snapshotError: refusedBody() });
  await refused.saveReport();
  assert.equal(refused.calls.alerts.length, 1);
  assert(refused.calls.alerts[0].startsWith('Il server ha rifiutato il referto.'), refused.calls.alerts[0]);
  assert(refused.calls.alerts[0].includes('il girone non è ancora concluso'), 'the referee sees the reason');
  assert(!refused.calls.alerts[0].includes('Connessione'), 'a refusal is not a connection problem');
  assert.equal(refused.calls.states.length, 0, 'a refused result is not shown as saved');
  assert.equal(refused.calls.cleanup.length + refused.calls.acknowledged.length, 0);
  assert(refused.events.includes('save-error'));
  if (usesOutbox) {
    assert.equal(refused.calls.queued.length, 1, 'the report stays in the device queue');
    assert.equal(refused.calls.failed.length, 1);
    assert.equal(refused.calls.snapshots.length, 0, 'a refusal never falls back to the snapshot write');
    const local = createCase({ secret: 'ref-secret', rpcError: Object.assign(new Error('Creazione partita non autorizzata: codice spareggio non coerente'), { code: 'FLBP_INVALID_TIE_BREAK' }) });
    await local.saveReport();
    assert(local.calls.alerts[0].includes('codice spareggio non coerente'), 'the local server refusal is explained too');
    const fallback = createCase({ secret: 'ref-secret', rpcError: 'PGRST202', snapshotError: refusedBody(), snapshotAlwaysFails: true });
    await fallback.saveReport();
    assert(fallback.calls.alerts[0].startsWith('Il server ha rifiutato il referto.'), 'snapshot fallback explains the refusal too');
    assert.equal(fallback.calls.acknowledged.length, 0);
  }
  const moved = usesOutbox
    ? createCase({ secret: 'ref-secret', rpcError: refusedBody('FLBP_LOCAL_PRIMARY: il server locale è attivo') })
    : createCase({ secret: 'ref-secret', snapshotError: refusedBody('FLBP_LOCAL_PRIMARY: il server locale è attivo') });
  await moved.saveReport();
  assert(!moved.calls.alerts[0].startsWith('Il server ha rifiutato'), 'temporary FLBP_* states keep their message');
});
await check('B6: referee login tells a lock apart from a wrong password', async () => {
  const lockedCheck = createCase({ verifyResult: { ok: false, reason: 'rate_limited' } });
  await lockedCheck.doLogin();
  assert.deepEqual(lockedCheck.calls.loginErrors, ['referees_rate_limited']);
  assert.deepEqual(lockedCheck.calls.authed, []);
  assert.equal(lockedCheck.calls.verifies[0].secret, 'fixture-entered');

  const wrong = createCase({ verifyResult: { ok: false, reason: 'bad_password' } });
  await wrong.doLogin();
  assert.deepEqual(wrong.calls.loginErrors, ['referees_password_wrong']);

  const lockedRead = createCase({ pullResult: { ok: false, reason: 'rate_limited', state: null } });
  await lockedRead.doLogin();
  assert.deepEqual(lockedRead.calls.loginErrors, ['referees_rate_limited'], 'a locked state read stops the login');
  assert.deepEqual(lockedRead.calls.authed, []);
  assert.equal(lockedRead.calls.states.length, 0);

  const localServer = createCase({ verifyError: Object.assign(new Error('Troppe richieste: riprova tra poco.'), { code: 'FLBP_RATE_LIMITED' }) });
  await localServer.doLogin();
  assert.deepEqual(localServer.calls.loginErrors, ['referees_rate_limited']);

  const helperName = 'permission denied for function flbp_referee_auth_is_rate_limited';
  const unrelated = createCase({ verifyError: new Error(helperName) });
  await unrelated.doLogin();
  assert.deepEqual(unrelated.calls.loginErrors, [helperName], 'a database error naming the helper is not the lock');

  const accepted = createCase();
  await accepted.doLogin();
  assert.deepEqual(accepted.calls.authed, [true]);
  assert.deepEqual(accepted.calls.loginErrors, [null]);
  assert.equal(accepted.calls.states.length, 1, 'the live state read at login is applied');
});
// B6 #1: the referee RPC now returns only the live tournament (no password,
// birth dates, archives or aliases). A device holding the complete Admin copy
// keeps all of it, whatever path applies the state it reads.
const completeTeams = [
  { id: 'a', name: 'A', player1: 'Rossi Mario', player2: 'Verdi Anna', player1BirthDate: '2001-02-03', player2YoB: 1999 },
  { id: 'b', name: 'B', player1: 'Neri Luca', player2: 'Bianchi Sara', player1BirthDate: '1998-05-06' },
];
const completeExtra = {
  logo: 'admin-logo',
  tournamentHistory: [{ id: 'archived-2025', name: 'Archivio 2025', teams: [{ id: 'old', name: 'Old', player1: 'Rossi Mario', player1BirthDate: '2001-02-03' }] }],
  hallOfFame: [{ id: 'hof-1', type: 'winner', playerNames: ['Rossi Mario'], playerIds: ['rossi mario_2001-02-03'], playerBirthDates: ['2001-02-03'] }],
  integrationsScorers: [{ id: 'int-1', name: 'Rossi Mario', birthDate: '2001-02-03', games: 1, points: 1, soffi: 0 }],
  playerAliases: { 'rossi mario_2001-02-03': 'rossi mario_nd' },
};
const viewTeams = completeTeams.map(({ player1BirthDate, player2YoB, ...team }) => team);
const refereeView = (matches, tournament = {}) => ({
  __schemaVersion: 1, teams: viewTeams, tournamentMatches: matches,
  tournament: { id: 't1', type: 'round_robin', teams: viewTeams, matches, refereesRoster: ['Arbitro remoto'], ...tournament },
});
const adminMatch = (extra = {}) => ({ id: 'm1', code: 'A1', teamAId: 'a', teamBId: 'b', phase: 'groups', status: 'playing', played: false, scoreA: 0, scoreB: 0, privateMatchNote: 'admin only', ...extra });
const otherMatch = (extra = {}) => ({ id: 'm2', code: 'A2', teamAId: 'b', teamBId: 'a', phase: 'groups', status: 'scheduled', played: false, scoreA: 0, scoreB: 0, ...extra });
const viewMatch = ({ privateMatchNote, ...match }) => match;
const remoteM2 = otherMatch({ status: 'finished', played: true, scoreA: 10, scoreB: 3, refereeReportSavedAt: '2026-11-19T10:00:00.000Z' });
const completeCase = (options = {}) => createCase({
  teams: completeTeams, configuredSecret: 'admin-secret', extraState: completeExtra,
  foundMatch: adminMatch(), matches: [adminMatch(), otherMatch()],
  pulledState: refereeView([viewMatch(adminMatch()), remoteM2]),
  ...options,
});
const assertCompleteDataKept = (saved, label) => {
  assert.equal(saved.tournament.refereesPassword, 'admin-secret', `${label}: referee password kept`);
  assert.equal(saved.teams[0].player1BirthDate, '2001-02-03', `${label}: birth dates kept`);
  assert.equal(saved.tournament.teams[0].player1BirthDate, '2001-02-03', `${label}: live team birth dates kept`);
  assert.equal(saved.tournament.teams[0].player2YoB, 1999, `${label}: years of birth kept`);
  assert.equal(saved.logo, 'admin-logo', `${label}: logo kept`);
  assert.deepEqual(plain(saved.tournamentHistory), completeExtra.tournamentHistory, `${label}: archives kept`);
  assert.deepEqual(plain(saved.hallOfFame), completeExtra.hallOfFame, `${label}: Hall of Fame identities kept`);
  assert.deepEqual(plain(saved.integrationsScorers), completeExtra.integrationsScorers, `${label}: scorer integrations kept`);
  assert.deepEqual(plain(saved.playerAliases), completeExtra.playerAliases, `${label}: aliases kept`);
};

await check('B6 #1: merging a referee view never drops private data from a complete Admin copy', async () => {
  const { mergeRefereeLiveState } = createCase();
  const localMatches = [adminMatch({ stats: [{ teamId: 'a', playerName: 'Rossi Mario', canestri: 1, soffi: 0 }] }), otherMatch()];
  const complete = {
    ...completeExtra, teams: completeTeams, tournamentMatches: localMatches,
    tournament: { id: 't1', type: 'round_robin', teams: completeTeams, matches: localMatches, rounds: [localMatches], refereesPassword: 'admin-secret', refereesRoster: ['Arbitro locale'] },
  };
  // Another referee finished m1; its stats were reset remotely (key absent in the view).
  const remoteM1 = viewMatch(adminMatch({ status: 'finished', played: true, scoreA: 10, scoreB: 4 }));
  const view = refereeView([remoteM1, remoteM2], { rounds: [[remoteM1, remoteM2]] });
  const merged = mergeRefereeLiveState(complete, view);
  assertCompleteDataKept(merged, 'view merge');
  for (const list of [merged.tournamentMatches, merged.tournament.matches, merged.tournament.rounds[0]]) {
    assert.equal(list[0].scoreA, 10, 'the referee result reaches every match representation');
    assert.equal(list[0].privateMatchNote, 'admin only', 'match fields the view does not carry are kept');
    assert.equal(list[0].stats, undefined, 'a referee field removed remotely stays removed');
    assert.equal(list[1].status, 'finished');
  }
  assert.deepEqual(plain(merged.tournament.refereesRoster), ['Arbitro remoto'], 'the roster follows the live tournament');
  assert.equal(mergeRefereeLiveState(complete, refereeView([remoteM1], { id: 't2' })), complete, 'a view of another tournament changes nothing');
  assert.equal(mergeRefereeLiveState(complete, { ...view, tournament: null }), complete, 'a state without live tournament changes nothing');

  // Databases without the migration return the complete private state, password included.
  const legacyFull = { ...complete, logo: 'remote-logo', tournamentMatches: [remoteM1], tournament: { ...complete.tournament, matches: [remoteM1], rounds: undefined } };
  const fromLegacy = mergeRefereeLiveState(complete, legacyFull);
  assert.equal(fromLegacy.tournamentMatches[0].scoreA, 10, 'old RPC: the live parts are applied as before');
  assert.equal(fromLegacy.tournament.refereesPassword, 'admin-secret');
  assert.equal(fromLegacy.logo, 'admin-logo', 'old RPC: parts outside the live tournament stay local');

  // A public or referee device holds nothing private: the view replaces its live parts.
  const publicDevice = { logo: 'public-logo', tournamentHistory: [{ id: 'public-archive' }], teams: [], matches: [], tournamentMatches: [], tournament: null, hallOfFame: [], integrationsScorers: [], playerAliases: {} };
  const onPublic = mergeRefereeLiveState(publicDevice, view);
  assert.equal(onPublic.tournament.id, 't1');
  assert.equal(onPublic.tournamentMatches[1].scoreA, 10);
  assert.equal(onPublic.logo, 'public-logo');
  assert.deepEqual(plain(onPublic.tournamentHistory), [{ id: 'public-archive' }]);
});
await check('B6 #1: a report saved on a device with the complete Admin copy keeps every private field', async () => {
  const result = completeCase();
  await result.saveReport();
  assert.deepEqual(result.calls.alerts, []);
  assert.equal(result.calls.notices.length, 1);
  assert.equal(result.calls.pages.at(-1), 'match');
  if (usesOutbox) {
    assert.equal(result.calls.pulls.length, 1, 'the live view is read before building the patch');
    const sent = JSON.stringify(result.calls.rpc[0].matches);
    assert(result.calls.rpc[0].matches.some(match => match.id === 'm1' && match.status === 'finished'));
    assert(!sent.includes('2001-02-03') && !sent.includes('admin-secret'), 'the patch carries matches only');
  }
  assert.equal(result.calls.states.length, 1);
  const saved = result.calls.states[0];
  assertCompleteDataKept(saved, 'report save');
  const savedM1 = saved.tournamentMatches.find(match => match.id === 'm1');
  assert.equal(savedM1.status, 'finished'); assert.equal(savedM1.scoreA, 10);
  assert.equal(savedM1.privateMatchNote, 'admin only', 'a private match field survives the report');
  if (usesOutbox) assert.equal(saved.tournamentMatches.find(match => match.id === 'm2').scoreA, 10, 'another referee result read with the view is kept');
});
await check('B6 #1: a snapshot conflict lifts the referee view onto the local copy before the three-way merge', async () => {
  const result = completeCase({ rpcError: usesOutbox ? 'PGRST202' : undefined, snapshotError: 'FLBP_DB_CONFLICT' });
  await result.saveReport();
  assert.deepEqual(result.calls.alerts, []);
  assert.equal(result.calls.notices.length, 1);
  assert.equal(result.calls.pages.at(-1), 'match');
  assert.equal(result.calls.mergeInputs.length, 1);
  const { baseState, remoteState } = result.calls.mergeInputs[0];
  assertCompleteDataKept(baseState, 'base side of the merge');
  assertCompleteDataKept(remoteState, 'remote side of the merge (archives are not read as deleted)');
  assert.equal(remoteState.tournamentMatches.find(match => match.id === 'm2').scoreA, 10, 'the remote result still reaches the merge');
  assertCompleteDataKept(result.calls.states[0], 'merged state');
});
if (usesOutbox) {
  await check('B6 #1: replaying queued reports on an Admin device applies the referee view without losing data', async () => {
    const result = completeCase({ pending: [{ tournamentId: 't1', matchId: 'm2', operationId: 'queued-op', matches: [remoteM2] }] });
    assert.equal(await result.replayPendingReports('admin-secret'), 1);
    assert.deepEqual(result.calls.acknowledged, ['queued-op']);
    assert.equal(result.calls.pulls.length, 1, 'the live view is read after the replay');
    assert.equal(result.calls.states.length, 1);
    const saved = result.calls.states[0];
    assertCompleteDataKept(saved, 'replay');
    assert.equal(saved.tournamentMatches.find(match => match.id === 'm2').scoreA, 10);
    assert.equal(saved.tournamentMatches.find(match => match.id === 'm1').privateMatchNote, 'admin only');
  });
}
await check('B6 #1: login applies the view on a referee device and never over an Admin copy', async () => {
  const view = refereeView([viewMatch(adminMatch()), remoteM2]);
  // The App holds the Admin copy without the live tournament, so the area
  // shows the public snapshot and reads the view at login.
  const adminCopy = { ...completeExtra, teams: completeTeams, matches: [], tournamentMatches: [], tournament: null };
  const onAdmin = createCase({ appState: adminCopy, pulledState: view });
  await onAdmin.doLogin();
  assert.deepEqual(onAdmin.calls.authed, [true]);
  assert.equal(onAdmin.calls.states.length, 1);
  assert.equal(onAdmin.calls.states[0], adminCopy, 'the Admin copy is not replaced by the view');

  const onReferee = createCase({ appState: { teams: [], matches: [], tournamentMatches: [], tournament: null }, pulledState: view });
  await onReferee.doLogin();
  assert.deepEqual(onReferee.calls.authed, [true]);
  assert.equal(onReferee.calls.states[0].tournament.refereesPassword, undefined, 'the view carries no password');
  assert.equal(onReferee.calls.states[0].tournamentMatches[1].scoreA, 10, 'a referee device shows the live view');
});
await check('B6 #1: a referee session opened with the typed password survives a view without password', async () => {
  assert.match(source, /if \(!ok \|\| \(requiresTransientRefereeSecret && !syncedPasswordRef\.current\.trim\(\)\)\)/,
    'the auth guard must keep the session while the password typed at login is in memory');
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
    assert.deepEqual(result.calls.alerts, []);
    assert.equal(result.calls.notices.length, 1);
    assert.equal(result.calls.pages.at(-1), 'match');
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
  assert.deepEqual(result.calls.alerts, []);
  assert.equal(result.calls.notices.length, 1);
  assert.equal(result.calls.pages.at(-1), 'match');
  const saved = result.calls.states[0].tournamentMatches;
  assert.equal(saved.find(match => match.id === 's1').scoreB, 7);
  assert.equal(saved.find(match => match.id === 'f').teamAId, 'a1', 'the played final is untouched');
});

// B2 audit #3: a tournament saved before the fix, 4 groups of 4 and 8 qualifiers. Group codes
// A1-A6, B7-B12, C13-C18, D19-D24; bracket B11-B14, B21, B22, B31: B11 and B12 exist twice.
// Group B11 is b2-b4 (id g11); bracket B11 is A1 vs B2 (id r1m1).
const legacyLetters = ['A', 'B', 'C', 'D'];
const legacyTeams = legacyLetters.flatMap(letter => [1, 2, 3, 4].map(n => ({
  id: `${letter.toLowerCase()}${n}`, name: `${letter}${n}`, player1: `Uno ${letter}${n}`, player2: `Due ${letter}${n}`,
})));
const legacyFourByFour = ({ finishedGroups = [], resolvedBracket = {} } = {}) => {
  const matches = [];
  let counter = 0;
  for (const letter of legacyLetters) {
    const ids = [1, 2, 3, 4].map(n => `${letter.toLowerCase()}${n}`);
    const done = finishedGroups.includes(letter);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        counter++;
        matches.push({
          id: `g${counter}`, code: `${letter}${counter}`, phase: 'groups', groupName: `Girone ${letter}`, orderIndex: counter,
          teamAId: ids[i], teamBId: ids[j], status: done ? 'finished' : 'scheduled', played: done, scoreA: done ? 10 : 0, scoreB: done ? 6 : 0,
        });
      }
    }
  }
  [['TBD-A-1', 'TBD-B-2'], ['TBD-A-2', 'TBD-B-1'], ['TBD-C-1', 'TBD-D-2'], ['TBD-C-2', 'TBD-D-1']].forEach((slots, index) => {
    const id = `r1m${index + 1}`;
    const [teamAId, teamBId] = resolvedBracket[id] || slots;
    matches.push(bracketMatch(id, `B1${index + 1}`, 1, 100 + index, teamAId, teamBId));
  });
  matches.push(bracketMatch('r2m1', 'B21', 2, 104), bracketMatch('r2m2', 'B22', 2, 105), bracketMatch('r3m1', 'B31', 3, 106));
  return matches;
};
const legacyCase = (matches, options = {}) => createCase({ local: true, teams: legacyTeams, matches, tournamentType: 'groups_elimination', ...options });

await check('B2 #3: a code shared with a bracket match still on TBD asks before opening the finished group match', async () => {
  // Group B is over, group A is not: bracket B11 is still TBD-A-1 vs b2.
  const result = legacyCase(legacyFourByFour({ finishedGroups: ['B'] }), { reportCode: 'b11' });
  result.lookupMatchByCode();
  assert.deepEqual(result.calls.forms, [], 'the finished group match is not opened on its own');
  assert.deepEqual(result.calls.pages, []);
  assert.deepEqual(plain(result.calls.codeChoices.at(-1)).map(match => match.id), ['g11'], 'the referee confirms it from the list');
  assert.equal(result.calls.codeErrors.at(-1), 'referees_duplicate_code_select_match');
  assert.equal(result.calls.foundIds.at(-1), '');
});
await check('B2 #3: a shared code opens the match still to be played', async () => {
  const matches = legacyFourByFour({ finishedGroups: ['A', 'B'], resolvedBracket: { r1m1: ['a1', 'b2'], r1m2: ['a2', 'b1'] } });
  const result = legacyCase(matches, { reportCode: 'B11' });
  result.lookupMatchByCode();
  assert.deepEqual(result.calls.forms, ['r1m1'], 'bracket B11 (scheduled) wins over group B11 (finished)');
  assert.deepEqual(result.calls.pages, ['report']);
  assert.equal(result.calls.foundIds.at(-1), 'r1m1');
});
await check('B2 #3: a code used once still opens its match, finished or not', async () => {
  const matches = legacyFourByFour({ finishedGroups: ['A'] });
  for (const [code, id] of [['A1', 'g1'], ['C13', 'g13']]) {
    const result = legacyCase(matches, { reportCode: code });
    result.lookupMatchByCode();
    assert.deepEqual(result.calls.forms, [id], `${code} opens directly`);
  }
});
await check('B2 #3: OCR confirmation keeps the match the referee picked from the list', async () => {
  const matches = legacyFourByFour({ finishedGroups: ['A', 'B'], resolvedBracket: { r1m1: ['a1', 'b2'], r1m2: ['a2', 'b1'] } });
  const picked = matches.find(match => match.id === 'g11');
  const result = legacyCase(matches, { foundMatch: picked, ocrModalCode: 'B11' });
  result.confirmOcrModal();
  assert.deepEqual(result.calls.ocrErrors, []);
  assert.deepEqual(result.calls.forms, ['g11'], 'the correction of group B11 is not moved to bracket B11');
});
await check('B2 #3: OCR confirmation of a different shared code asks for the manual choice', async () => {
  const matches = legacyFourByFour({ finishedGroups: ['B'] });
  const result = legacyCase(matches, { foundMatch: matches.find(match => match.id === 'g13'), ocrModalCode: 'B11' });
  result.confirmOcrModal();
  assert.deepEqual(result.calls.forms, []);
  assert.deepEqual(result.calls.ocrErrors, ['referees_duplicate_code_use_manual']);
});

console.log(`Referee report save: ${passed} checks passed (${usesOutbox ? 'ONLINE outbox/RPC' : 'LOCALE snapshot'}).`);
