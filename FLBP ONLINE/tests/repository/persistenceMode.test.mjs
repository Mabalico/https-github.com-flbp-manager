import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual resolver with only browser storage and env/session IO
// stubbed. No Vite env files, cloud credentials, or database are loaded.
const source = readFileSync(new URL('../../services/repository/featureFlags.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function resolver({ configured = true, remote, allowLocal, mode, legacy, blockedStorage = false } = {}) {
  const values = new Map();
  if (mode !== undefined) values.set('flbp_data_persistence_mode', mode);
  if (legacy !== undefined) values.set('flbp_remote_repo', legacy);
  const exports = {};
  const env = {
    readViteSupabaseUrl: () => configured ? 'https://example.invalid' : '',
    readViteSupabaseAnonKey: () => configured ? 'test-public-key' : '',
    readViteRemoteRepo: () => remote,
    readViteAllowLocalOnly: () => allowLocal,
    readViteAutoStructuredSync: () => undefined,
  };
  vm.runInNewContext(compiled, {
    exports,
    require: id => {
      if (id === '../viteEnv') return env;
      if (id === '../supabaseSession') return { getSupabaseSession: () => null, REMOTE_BASE_UPDATED_AT_LS_KEY: 'base' };
      throw new Error(`Unexpected dependency: ${id}`);
    },
    localStorage: {
      getItem: key => { if (blockedStorage) throw new Error('SecurityError'); return values.get(key) ?? null; },
      setItem: (key, value) => { if (blockedStorage) throw new Error('SecurityError'); values.set(key, value); },
      removeItem: key => values.delete(key),
    },
  });
  return { flags: exports, values };
}

test('a remote deployment lock overrides legacy local-only preferences', () => {
  const { flags } = resolver({ remote: '1', mode: 'local_only', legacy: '0' });
  assert.equal(flags.isRemotePersistenceLocked(), true);
  assert.equal(flags.getDataPersistenceMode(), 'remote');
  assert.equal(flags.isRemoteRepositoryEnabled(), true);
  assert.equal(flags.isLocalOnlyMode(), false);
});

test('explicit remote mode wins over a stale legacy 0 and env 0', () => {
  const { flags } = resolver({ remote: '0', mode: 'remote', legacy: '0' });
  assert.equal(flags.getDataPersistenceMode(), 'remote');
  assert.equal(flags.isRemoteRepositoryEnabled(), true);
});

test('local-only remains possible when explicitly allowed by the deployment', () => {
  const { flags } = resolver({ remote: '1', allowLocal: '1', mode: 'local_only', legacy: '1' });
  assert.equal(flags.isRemotePersistenceLocked(), false);
  assert.equal(flags.isRemoteRepositoryEnabled(), false);
});

test('defaults follow Supabase configuration and unavailable browser storage is safe', () => {
  assert.equal(resolver({ configured: false }).flags.isRemoteRepositoryEnabled(), false);
  assert.equal(resolver().flags.isRemoteRepositoryEnabled(), true);
  assert.equal(resolver({ remote: '1', blockedStorage: true }).flags.isRemoteRepositoryEnabled(), true);
});

test('setting a forbidden local mode normalizes both preferences without deleting data', () => {
  const { flags, values } = resolver({ remote: '1', mode: 'local_only', legacy: '0' });
  values.set('beer_pong_app_state', 'existing draft');
  flags.setDataPersistenceMode('local_only');
  assert.equal(values.get('flbp_data_persistence_mode'), 'remote');
  assert.equal(values.get('flbp_remote_repo'), '1');
  assert.equal(values.get('beer_pong_app_state'), 'existing draft');
});

test('repository, UI mode and local-only gate agree across the configuration matrix', () => {
  for (const configured of [true, false]) for (const remote of [undefined, '0', '1'])
    for (const allowLocal of [undefined, '1']) for (const mode of [undefined, 'remote', 'local_only', 'invalid'])
      for (const legacy of [undefined, '0', '1', 'invalid']) {
        const input = { configured, remote, allowLocal, mode, legacy };
        const { flags } = resolver(input);
        const isRemote = flags.getDataPersistenceMode() === 'remote';
        assert.equal(flags.isRemoteRepositoryEnabled(), isRemote, JSON.stringify(input));
        assert.equal(flags.isLocalOnlyMode(), !isRemote, JSON.stringify(input));
        if (configured && remote === '1' && allowLocal !== '1') assert.equal(isRemote, true, JSON.stringify(input));
      }
});
