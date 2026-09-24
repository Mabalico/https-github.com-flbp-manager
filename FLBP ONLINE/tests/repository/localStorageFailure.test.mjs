import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
function declaration(sourceText, name) {
  const source = ts.createSourceFile('source.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) result = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(result, `actual ${name} callback exists`);
  return `const ${result.getText(source)}; exports.${name} = ${name};`;
}
function environment() {
  const values = new Map([['beer_pong_app_state', '{"old":true}']]);
  const window = new EventTarget();
  let blocked = false, blockedKey = null;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (blocked || key === blockedKey) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      values.set(key, value);
    },
  };
  const compile = (source, stubs = {}) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, Error, window, localStorage: storage, CustomEvent, ...stubs });
    return exports;
  };
  const sync = compile(read('services/adminSyncState.ts'));
  const store = compile(declaration(read('services/storageService.ts'), 'saveState'), { STORAGE_KEY: 'beer_pong_app_state', APP_STATE_SCHEMA_VERSION: 1 });
  const { LocalRepository } = compile(read('services/repository/LocalRepository.ts'), {
    require: name => {
      if (name === '../storageService') return { ...store, loadState: () => ({}) };
      if (name === '../adminSyncState') return sync;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { values, sync, repo: new LocalRepository(), store, compile,
    block: value => { blocked = value; }, blockKey: value => { blockedKey = value; } };
}

test('quota failure preserves the old persisted snapshot and surfaces an unsaved status even when the status key also fails', () => {
  const env = environment();
  const seen = [];
  const unsubscribe = env.sync.subscribeAdminSyncState(state => seen.push(state));
  env.block(true);
  assert.throws(() => env.repo.save({ teams: ['new'] }), error => error.name === 'LocalStateStorageError');
  assert.equal(env.values.get('beer_pong_app_state'), '{"old":true}');
  assert.equal(env.values.has('flbp_local_state_updated_at'), false);
  assert.equal(env.sync.readAdminSyncState().phase, 'error');
  assert.equal(env.sync.readAdminSyncState().source, 'local');
  assert.equal(env.sync.readAdminSyncState().hasPendingChanges, true);
  assert.equal(seen.at(-1).phase, 'error');
  assert.match(seen.at(-1).message, /backup/);
  unsubscribe();
});

test('the latest in-memory state can be saved after storage recovers and the error clears only after success', () => {
  const env = environment();
  const seen = [];
  const unsubscribe = env.sync.subscribeAdminSyncState(state => seen.push(state.phase));
  env.block(true);
  const state = { teams: ['latest'] };
  assert.throws(() => env.repo.save(state));
  env.block(false);
  env.repo.save(state);
  assert.deepEqual(JSON.parse(env.values.get('beer_pong_app_state')).teams, state.teams);
  assert.equal(env.sync.readAdminSyncState().phase, 'synced');
  assert.equal(env.sync.readAdminSyncState().hasPendingChanges, false);
  assert.ok(env.values.get('flbp_local_state_updated_at'));
  assert.deepEqual(seen, ['idle', 'error', 'synced']);
  unsubscribe();
  env.repo.save(state);
  assert.equal(seen.length, 3, 'unsubscribed views receive no events');
});

test('serialization errors reject the save without replacing the previous valid snapshot', () => {
  const env = environment();
  const state = {};
  state.self = state;
  assert.throws(() => env.repo.save(state), error => error.name === 'LocalStateStorageError' && Boolean(error.cause));
  assert.equal(env.values.get('beer_pong_app_state'), '{"old":true}');
  assert.equal(env.sync.readAdminSyncState().phase, 'error');
});

test('auxiliary timestamp failure does not report loss of an already saved snapshot', () => {
  const env = environment();
  env.blockKey('flbp_local_state_updated_at');
  env.repo.save({ teams: ['saved'] });
  assert.equal(env.sync.readAdminSyncState().phase, 'synced');
  assert.deepEqual(JSON.parse(env.values.get('beer_pong_app_state')).teams, ['saved']);
});

test('switching to local-only aborts before changing flags or reloading when the initial snapshot cannot be saved', () => {
  const env = environment();
  let panel;
  env.block(true);
  const forbid = () => { throw new Error('Mode switch must not continue after failed save'); };
  const { onActivateLocalOnly } = env.compile(declaration(read('components/admin/tabs/data/DbSyncPanel.tsx'), 'onActivateLocalOnly'), {
    window: { confirm: () => true, setTimeout: forbid },
    remotePersistenceLocked: false, state: {}, saveState: env.store.saveState,
    setPanel: value => { panel = value; }, t: key => key,
    setAutoStructuredSyncEnabled: forbid, setAutoStructured: forbid,
    setDataPersistenceMode: forbid, setDataMode: forbid, clearDbSyncCurrentIssue: forbid,
  });
  onActivateLocalOnly();
  assert.equal(panel.kind, 'error');
  assert.match(panel.message, /backup/);
});
