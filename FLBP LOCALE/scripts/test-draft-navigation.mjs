import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../services/draftNavigationGuard.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { registerDraftNavigationGuard: register, requestDraftNavigation: navigate, isDraftNavigationPending: pending, hasUnsavedDraft } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let calls = 0;
const load = deferred();
const unguarded = navigate(async () => { calls++; await load.promise; });
assert.equal(calls, 1, 'without guards the callback starts synchronously');
assert.equal(pending(), false, 'route preloads retain their existing latest-request ordering');
await navigate(() => { calls++; });
load.resolve(); await unguarded;
assert.equal(calls, 2);

const decision = deferred();
const unregister = register(() => decision.promise);
const first = navigate(() => { calls++; });
assert.equal(pending(), true);
assert.equal(await navigate(() => { calls += 100; }), false, 'repeated clicks cannot replace the pending destination');
decision.resolve(false);
assert.equal(await first, false);
assert.equal(calls, 2, 'cancel performs no navigation');
unregister();

const consent = deferred();
const cleanup = register(() => consent.promise);
const allowed = navigate(() => { calls++; });
consent.resolve(true); assert.equal(await allowed, true);
assert.equal(calls, 3, 'consent invokes one callback');
cleanup();

const gone = deferred();
const detach = register(() => gone.promise);
const abandoned = navigate(() => { calls += 100; });
detach(); gone.resolve(true);
assert.equal(await abandoned, false, 'unmounted owners invalidate old consent');
assert.equal(calls, 3);

const busy = register(() => false);
assert.equal(await navigate(() => { calls++; }), false);
busy();
await assert.rejects(navigate(() => { throw Error('render failure'); }), /render failure/);
assert.equal(pending(), false, 'a callback failure releases the gate');
await navigate(() => { calls++; });
assert.equal(calls, 4);
console.log('PASS draft navigation: cancel, consent, repeated clicks, owner cleanup, busy, preload and error recovery');

// Execute the actual Admin callbacks (not a copied navigation implementation).
// Browser tests cover the real editor/modal; this isolates lazy-load ordering.
const adminSource = readFileSync(fileURLToPath(new URL('../components/AdminDashboard.tsx', import.meta.url)), 'utf8');
const ast = ts.createSourceFile('AdminDashboard.tsx', adminSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map();
const visit = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['switchAdminSection', 'openLiveTab'].includes(node.name.text)) {
    assert(ts.isCallExpression(node.initializer));
    callbacks.set(node.name.text, node.initializer.arguments[0].getText(ast));
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'requestAdminLogout') callbacks.set('requestAdminLogout', node.initializer.getText(ast));
  ts.forEachChild(node, visit);
};
visit(ast);
for (const name of ['switchAdminSection', 'openLiveTab']) {
  const preload = deferred();
  const events = [];
  let saving = false;
  const detachGuard = register(() => !saving);
  const inputs = {
    adminSection: 'data', tab: 'data', adminNavigationRequestRef: { current: 0 },
    isDraftNavigationPending: pending, requestDraftNavigation: navigate,
    resolveStoredLiveTab: () => 'teams', preloadAdminContentChunk: () => preload.promise,
    safeSessionSet: (key, value) => events.push(['storage', key, value]),
    setAdminSection: value => events.push(['section', value]),
    setTab: value => events.push(['tab', value]), setLastLiveTab: value => events.push(['last', value]),
  };
  const compiled = ts.transpileModule(`const callback = ${callbacks.get(name)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const callback = new Function(...Object.keys(inputs), `${compiled}; return callback;`)(...Object.values(inputs));
  const loading = callback(name === 'openLiveTab' ? 'teams' : 'live');
  saving = true; preload.resolve(); await loading;
  assert.deepEqual(events, [], `${name} must consult current busy state after preload`);
  saving = false;
  await callback(name === 'openLiveTab' ? 'teams' : 'live');
  assert.deepEqual(events.filter(([type]) => type === 'section'), [['section', 'live']]);
  detachGuard();
  console.log(`PASS ${name}: save started during preload blocks navigation before any state/storage commit`);
}

for (const scenario of ['clean-cancel', 'clean-confirm', 'dirty-cancel', 'dirty-confirm', 'saving']) {
  const dirty = scenario.startsWith('dirty') || scenario === 'saving';
  const detach = register(() => scenario.endsWith('confirm'), () => dirty);
  const events = [];
  const remote = deferred();
  const inputs = {
    adminLogoutPending: false, isDraftNavigationPending: pending, requestDraftNavigation: navigate, hasUnsavedDraft,
    confirm: () => { events.push('native-confirm'); return scenario === 'clean-confirm'; }, t: key => key,
    setAdminLogoutPending: value => events.push(`busy:${value}`),
    performAdminLogout: () => { events.push('sign-out'); return remote.promise; },
  };
  const compiled = ts.transpileModule(`const callback = ${callbacks.get('requestAdminLogout')};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const callback = new Function(...Object.keys(inputs), `${compiled}; return callback;`)(...Object.values(inputs));
  await callback();
  const expected = scenario.endsWith('confirm') ? ['busy:true', 'sign-out'] : [];
  if (!dirty) expected.unshift('native-confirm');
  assert.deepEqual(events, expected, `logout ${scenario}: no auth mutation before consent, no duplicate modal for dirty drafts`);
  remote.resolve(); await Promise.resolve();
  if (scenario.endsWith('confirm')) assert.equal(events.at(-1), 'busy:false');
  detach();
}
assert.equal(hasUnsavedDraft(), false, 'unregistered owners leave no dirty hint');
console.log('PASS actual voluntary logout: clean confirmation, draft cancel/discard, busy blocking, editor hidden before remote sign-out');
