import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Runs the real player-call-push Edge Function of both editions. Only IO is
// replaced: the Supabase client, fetch (FCM), jose and Deno.env are stubs and
// every value below is a fixture. No network, database or secret is used.
// `--source <file>` runs the same checks on another copy (negative control).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(root, 'package.json'))('typescript');
const sourceArg = process.argv.indexOf('--source');
const targets = sourceArg > 0
  ? [[process.argv[sourceArg + 1], path.resolve(process.argv[sourceArg + 1])]]
  : ['FLBP ONLINE', 'FLBP LOCALE'].map((edition) => [edition, path.resolve(root, '..', edition, 'supabase/functions/player-call-push/index.ts')]);

const env = {
  SUPABASE_URL: 'https://fixture.invalid',
  SUPABASE_ANON_KEY: 'fixture-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  FCM_PROJECT_ID: 'fixture-project',
  FCM_CLIENT_EMAIL: 'fixture@fixture.invalid',
  FCM_PRIVATE_KEY: 'fixture-key',
};
const denied = 'Referee access required for this live tournament.';

const createWorld = (scenario = {}) => {
  const log = { rpc: [], tables: [], getUser: [], fetch: [] };
  const call = {
    id: 'call-1', workspace_id: 'ws-from-row', tournament_id: 't1', team_id: 'team-a', team_name: 'Squadra A',
    target_user_id: 'user-1', target_player_id: 'player-1', target_player_name: 'Rossi Mario', status: 'cancelled',
    ...(scenario.call || {}),
  };
  const result = (table) => {
    if (table === 'player_app_calls') return { data: call, error: null };
    if (table === 'player_app_devices') return { data: scenario.devices || [], error: null };
    if (table === 'admin_users') return { data: scenario.admin ? { user_id: 'admin-1' } : null, error: null };
    // workspace_state is where the old code read the password from.
    return { data: { state: { tournament: { id: 't1', refereesPassword: 'fixture-pass' } } }, error: null };
  };
  const client = {
    from: (table) => {
      const entry = { table, ops: [] };
      log.tables.push(entry);
      const builder = {
        select: (...args) => { entry.ops.push(['select', ...args]); return builder; },
        update: (...args) => { entry.ops.push(['update', ...args]); return builder; },
        eq: (...args) => { entry.ops.push(['eq', ...args]); return builder; },
        maybeSingle: async () => result(table),
        then: (resolve, reject) => Promise.resolve(result(table)).then(resolve, reject),
      };
      return builder;
    },
    rpc: async (name, args) => {
      log.rpc.push({ name, args: { ...args } });
      return scenario.rpc || { data: null, error: { message: 'rpc not expected in this scenario' } };
    },
    auth: {
      getUser: async (token) => {
        log.getUser.push(token);
        return scenario.adminToken && token === scenario.adminToken
          ? { data: { user: { id: 'admin-1' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid' } };
      },
    },
  };
  const fetch = async (url) => {
    log.fetch.push(String(url));
    if (String(url).startsWith('https://oauth2.googleapis.com/')) {
      return new Response(JSON.stringify({ access_token: 'fixture-access' }), { status: 200 });
    }
    return new Response('{"name":"projects/fixture-project/messages/1"}', { status: 200 });
  };
  return { client, fetch, log };
};

// Loads the module once, as Deno does, and returns a runner for one request.
const loadEdgeFunction = (file) => {
  let handler = null;
  let world = null;
  class SignJWT {
    setProtectedHeader() { return this; }
    setIssuer() { return this; }
    setAudience() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    async sign() { return 'fixture-jwt'; }
  }
  const modules = {
    'https://deno.land/std@0.224.0/http/server.ts': { serve: (fn) => { handler = fn; } },
    'https://esm.sh/@supabase/supabase-js@2.57.4': { createClient: () => world.client },
    'https://esm.sh/jose@5.9.6': { SignJWT, importPKCS8: async () => ({}) },
  };
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(javascript, {
    exports: {},
    require: (specifier) => {
      assert.ok(modules[specifier], `Unexpected Edge Function dependency: ${specifier}`);
      return modules[specifier];
    },
    Deno: { env: { get: (name) => env[name] } },
    fetch: (...args) => world.fetch(...args),
    Request, Response, URLSearchParams,
  }, { filename: file });
  assert.equal(typeof handler, 'function', 'serve() handler not registered');
  return async (scenario, body, headers = {}) => {
    world = createWorld(scenario);
    const response = await handler(new Request('https://fixture.invalid/functions/v1/player-call-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json(), log: world.log };
  };
};

const refereeCancel = {
  workspaceId: 'ws-from-body', callId: 'call-1', action: 'cancelled',
  tournamentId: ' t1 ', refereePassword: ' fixture-pass ',
};
const credentialsOk = { data: { ok: true, auth_version: null, updated_at: '2026-11-19T10:00:00Z', state: { private: true } }, error: null };
const rejected = (reason) => ({ data: { ok: false, reason }, error: null });
const readsWorkspaceState = (log) => log.tables.some((entry) => entry.table === 'workspace_state');
const readsDevices = (log) => log.tables.some((entry) => entry.table === 'player_app_devices');
const assertNoDispatch = (log) => {
  assert.equal(readsDevices(log), false, 'a rejected referee must not reach the devices');
  assert.deepEqual(log.fetch, [], 'a rejected referee must not reach FCM/APNs');
};

let passed = 0;
const check = async (label, run) => { await run(); passed++; console.log(`PASS: ${label}`); };

for (const [edition, file] of targets) {
  const run = loadEdgeFunction(file);

  await check(`${edition}: referee password goes through flbp_referee_check_credentials, never compared in the function`, async () => {
    const { status, body, log } = await run({ rpc: credentialsOk }, refereeCancel);
    assert.equal(status, 200);
    assert.equal(log.rpc.length, 1);
    assert.equal(log.rpc[0].name, 'flbp_referee_check_credentials');
    assert.deepEqual(log.rpc[0].args, {
      p_workspace_id: 'ws-from-row', p_tournament_id: 't1', p_password: 'fixture-pass',
      p_action: 'player_call_push', p_auth_version: null,
    });
    assert.equal(readsWorkspaceState(log), false, 'the password must not be read from workspace_state');
    assert.deepEqual(log.getUser, [], 'the referee path must not need an Admin session');
    // Success payload unchanged: no ready device is a skipped 200.
    assert.deepEqual(body, {
      ok: true, callId: 'call-1', action: 'cancelled', skipped: true, code: 'no_device', reasonCode: 'no_device',
      reason: body.reason, deliveries: [],
    });
    assert.equal(typeof body.reason, 'string');
  });

  await check(`${edition}: accepted referee still dispatches the silent cancellation with the same success payload`, async () => {
    const devices = [{ id: 'device-1', platform: 'android', device_token: 'fixture-token', push_enabled: true }];
    const { status, body, log } = await run({ rpc: credentialsOk, devices }, refereeCancel);
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true, callId: 'call-1', action: 'cancelled', skipped: false, code: null, reasonCode: null, reason: null,
      deliveries: [{ deviceId: 'device-1', platform: 'android', provider: 'fcm', ok: true, status: 200, code: null, reason: null, tokenInvalid: false }],
    });
    assert.equal(log.fetch.length, 2, 'one OAuth exchange and one FCM send');
  });

  await check(`${edition}: rate_limited lock answers 429 and dispatches nothing`, async () => {
    const { status, body, log } = await run({ rpc: rejected('rate_limited') }, refereeCancel);
    assert.equal(status, 429);
    assert.deepEqual(body, { ok: false, reason: 'rate_limited' });
    assert.equal(log.rpc.length, 1);
    assertNoDispatch(log);
  });

  await check(`${edition}: every other rejection keeps the old 403 answer`, async () => {
    for (const reason of ['bad_password', 'tournament_mismatch', 'no_config', 'workspace_missing', 'auth_version_mismatch']) {
      const { status, body, log } = await run({ rpc: rejected(reason) }, refereeCancel);
      assert.equal(status, 403, reason);
      assert.deepEqual(body, { ok: false, reason: denied }, reason);
      assertNoDispatch(log);
    }
    for (const data of [null, {}, { ok: 'true' }, 'ok', []]) {
      const { status, log } = await run({ rpc: { data, error: null } }, refereeCancel);
      assert.equal(status, 403, `malformed result ${JSON.stringify(data)} must fail closed`);
      assertNoDispatch(log);
    }
  });

  await check(`${edition}: a failing credential RPC is a 500, never a dispatch`, async () => {
    const { status, body, log } = await run({ rpc: { data: null, error: { message: 'fixture failure' } } }, refereeCancel);
    assert.equal(status, 500);
    assert.equal(body.ok, false);
    assertNoDispatch(log);
  });

  await check(`${edition}: scope checks still run before the password is checked`, async () => {
    for (const [scenario, body, expected] of [
      [{}, { ...refereeCancel, action: 'ringing' }, 403],
      [{ call: { tournament_id: 'other' } }, refereeCancel, 403],
      [{ call: { status: 'ringing' } }, refereeCancel, 409],
    ]) {
      const result = await run({ ...scenario, rpc: credentialsOk }, body);
      assert.equal(result.status, expected);
      assert.deepEqual(result.log.rpc, [], 'no password attempt before the scope checks');
      assertNoDispatch(result.log);
    }
  });

  await check(`${edition}: Admin dispatch is unchanged and never uses the referee check`, async () => {
    const admin = await run({ admin: true, adminToken: 'fixture-admin-token' },
      { workspaceId: 'ws-from-body', callId: 'call-1', action: 'ringing' }, { Authorization: 'Bearer fixture-admin-token' });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.ok, true);
    assert.deepEqual(admin.log.getUser, ['fixture-admin-token']);
    assert.deepEqual(admin.log.rpc, []);
    const anonymous = await run({}, { workspaceId: 'ws-from-body', callId: 'call-1', action: 'cancelled', tournamentId: 't1' });
    assert.equal(anonymous.status, 401, 'no password and no session is still refused');
    assert.deepEqual(anonymous.log.rpc, []);
    const notAdmin = await run({ adminToken: 'fixture-user-token' },
      { workspaceId: 'ws-from-body', callId: 'call-1', action: 'ringing' }, { Authorization: 'Bearer fixture-user-token' });
    assert.equal(notAdmin.status, 403);
    assert.deepEqual(notAdmin.log.rpc, []);
  });
}

console.log(`player-call-push: ${passed} checks passed on the real Edge Function; only IO was replaced.`);
