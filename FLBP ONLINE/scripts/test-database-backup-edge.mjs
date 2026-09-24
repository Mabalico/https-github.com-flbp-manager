import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(root, 'package.json'))('typescript');
let passes = 0;
const check = async (label, run) => { await run(); passes++; console.log(`PASS: ${label}`); };
const backup = { exportType: 'flbp_application_database_backup', schemaVersion: 1, workspaceId: 'test', tables: {} };
const compile = (source, stubs = {}) => {
  const exports = {};
  const context = { exports, crypto: globalThis.crypto, ...stubs };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return exports;
};

for (const edition of ['FLBP ONLINE', 'FLBP LOCALE']) {
  const editionRoot = path.resolve(root, '..', edition);
  const ops = compile(fs.readFileSync(path.join(editionRoot, 'supabase/functions/database-backup-admin/operations.ts'), 'utf8'));
  let calls;
  let response;
  const client = {
    rpc: async (name, args) => { calls.push({ name, args }); return response; },
    from: () => { throw new Error('Independent REST mutations must never run'); },
  };
  const run = async (input) => { calls = []; return ops.runDatabaseBackupOperation(client, input, 'verified-user'); };
  await check(`${edition}: capability handshake has no database side effects`, async () => {
    const result = await run({ action: 'capabilities' });
    assert.equal(result.transactionalRestore, 1);
    assert.equal(calls.length, 0);
  });
  await check(`${edition}: export uses one snapshot RPC`, async () => {
    response = { data: backup, error: null };
    const result = await run({ action: 'export', workspaceId: 'test' });
    assert.equal(result.backup, backup);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'flbp_export_application_database');
    assert.equal(calls[0].args.p_workspace_id, 'test');
  });
  await check(`${edition}: restore binds verified actor, ID, workspace and lease to one transaction`, async () => {
    response = { data: { ok: true, checkpointId: 'restore-one', version: 19 }, error: null };
    const result = await run({ action: 'restore', workspaceId: 'test', backup, actorId: 'forged', operationId: 'restore-one', leaseHolder: 'lease-one' });
    assert.equal(result, response.data);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'flbp_restore_application_database');
    assert.equal(calls[0].args.p_actor_id, 'verified-user');
    assert.equal(calls[0].args.p_operation_id, 'restore-one');
    assert.equal(calls[0].args.p_lease_holder, 'lease-one');
  });
  await check(`${edition}: legacy clients receive a deduplication ID`, async () => {
    await run({ action: 'restore', workspaceId: 'test', backup });
    assert.match(calls[0].args.p_operation_id, /^[0-9a-f-]{36}$/);
    assert.equal(calls[0].args.p_lease_holder, null);
  });
  await check(`${edition}: invalid requests stop before calling database`, async () => {
    for (const input of [null, [], {}, { action: 'delete' }, { action: 'restore', backup },
      { action: 'restore', workspaceId: 'test', backup: { ...backup, schemaVersion: 2 } },
      { action: 'restore', workspaceId: 'test', backup, operationId: 'x'.repeat(161) }]) {
      await assert.rejects(run(input), (error) => error.status === 400);
      assert.equal(calls.length, 0);
    }
  });
  await check(`${edition}: missing migration fails closed with no fallback`, async () => {
    for (const code of ['PGRST202', '42883']) {
      response = { data: null, error: { code, message: 'missing function' } };
      await assert.rejects(run({ action: 'restore', workspaceId: 'test', backup }), (error) => error.status === 503 && /20260924000200/.test(error.message));
      assert.equal(calls.length, 1);
    }
  });
  await check(`${edition}: forbidden, conflicting and failed transactions never report success`, async () => {
    for (const [code, status] of [['42501', 403], ['P0001', 409], ['23505', 500]]) {
      response = { data: null, error: { code, message: 'test rejection' } };
      await assert.rejects(run({ action: 'restore', workspaceId: 'test', backup }), (error) => error.status === status);
      assert.equal(calls.length, 1);
    }
  });
  await check(`${edition}: invalid success payload is rejected`, async () => {
    response = { data: { ok: false }, error: null };
    await assert.rejects(run({ action: 'restore', workspaceId: 'test', backup }), (error) => error.status === 500 && error.restoreNotCommitted === false);
  });
  await check(`${edition}: backup lock busy is a definite non-commit and preserves the operation ID for retry`, async () => {
    response = { data: null, error: { code: 'P0001', message: 'FLBP_DATABASE_BUSY: database in uso; riprovare l\'intera operazione' } };
    await assert.rejects(run({ action: 'restore', workspaceId: 'test', backup, operationId: 'busy-retry' }),
      error => error.status === 409 && error.restoreNotCommitted === true && error.message.includes('FLBP_DATABASE_BUSY'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.p_operation_id, 'busy-retry');
    response = { data: { ok: true, checkpointId: 'busy-retry', version: 20 }, error: null };
    await run({ action: 'restore', workspaceId: 'test', backup, operationId: 'busy-retry' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.p_operation_id, 'busy-retry');
  });
  await check(`${edition}: transport errors preserve uncertain commit outcome`, async () => {
    for (const code of ['', '08007', '08006', '40003', 'XX000']) {
      response = { data: null, error: { message: 'uncertain result', code } };
      await assert.rejects(run({ action: 'restore', workspaceId: 'test', backup }), (error) => error.restoreNotCommitted === false);
    }
  });

  // Exercise the actual frontend request/retry implementation, replacing IO only.
  const source = ts.createSourceFile('supabaseRest.ts', fs.readFileSync(path.join(editionRoot, 'services/supabaseRest.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set(['callDatabaseBackupAdmin', 'restoreFullDatabaseBackup']);
  const selected = source.statements.filter((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && names.has(declaration.name.text)))
    .map((statement) => statement.getText(source)).join('\n');
  assert.equal(source.statements.filter((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && names.has(declaration.name.text))).length, 2);
  let requests = [];
  let finalResponse = null;
  let capability = { ok: true, transactionalRestore: 1 };
  let errorBody = 'session expired';
  const service = compile(selected, {
    getSupabaseConfig: () => ({ workspaceId: 'test' }),
    functionsUrl: () => 'https://invalid.test/database-backup-admin',
    buildHeaders: (_cfg, token) => ({ Authorization: token }),
    getAdminLeaseHolderForWrites: () => 'writer-one',
    requireSupabaseWriteSession: async () => ({ accessToken: 'expired' }),
    recoverRejectedAdminWriteSession: async () => ({ accessToken: 'fresh' }),
    isRejectedAdminEdgeSession: (status) => status === 401,
    readErrorBody: async () => errorBody,
    fetchWithTimeout: async (_url, request) => {
      requests.push(request);
      const body = JSON.parse(request.body);
      if (body.action === 'capabilities') return { ok: true, json: async () => capability };
      return requests.length === 2 ? { ok: false, status: 401 }
        : finalResponse || { ok: true, json: async () => ({ ok: true, workspaceId: 'test', operationId: body.operationId, checkpointId: body.operationId, version: 9 }) };
    },
  });
  await check(`${edition}: auth retry preserves logical restore ID and backup`, async () => {
    requests = [];
    const result = await service.restoreFullDatabaseBackup(backup);
    assert.equal(result.version, 9);
    assert.equal(requests.length, 3);
    const first = JSON.parse(requests[1].body), second = JSON.parse(requests[2].body);
    assert.deepEqual(first, second);
    assert.ok(first.operationId);
    assert.deepEqual(first.backup, backup);
    assert.equal(first.workspaceId, 'test');
    if (edition === 'FLBP ONLINE') assert.equal(first.leaseHolder, 'writer-one');
    assert.equal(requests[2].headers.Authorization, 'fresh');
  });
  await check(`${edition}: explicit retry can reuse a known operation ID`, async () => {
    requests = [];
    await service.restoreFullDatabaseBackup(backup, { operationId: 'known-id' });
    assert.equal(JSON.parse(requests[1].body).operationId, 'known-id');
  });
  await check(`${edition}: frontend distinguishes rollback from uncertain gateway outcomes`, async () => {
    for (const [body, definitive] of [[JSON.stringify({ reason: 'constraint rejected', restoreNotCommitted: true }), true], ['Bad Gateway', false], ['null', false]]) {
      requests = [];
      errorBody = body;
      finalResponse = { ok: false, status: 500 };
      await assert.rejects(service.restoreFullDatabaseBackup(backup), (error) => error.restoreNotCommitted === definitive);
    }
  });
  await check(`${edition}: frontend propagates explicit busy as a safe non-commit without changing retry identity`, async () => {
    requests = [];
    errorBody = JSON.stringify({ reason: 'FLBP_DATABASE_BUSY: database in uso', restoreNotCommitted: true });
    finalResponse = { ok: false, status: 409 };
    await assert.rejects(service.restoreFullDatabaseBackup(backup, { operationId: 'busy-retry' }),
      error => error.restoreNotCommitted === true && error.message.includes('FLBP_DATABASE_BUSY'));
    assert.equal(JSON.parse(requests[1].body).operationId, 'busy-retry');
  });
  await check(`${edition}: legacy Edge capabilities block the destructive request`, async () => {
    requests = [];
    capability = { ok: false };
    await assert.rejects(service.restoreFullDatabaseBackup(backup), error => error.restoreNotCommitted === true);
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].body).action, 'capabilities');
    capability = { ok: true, transactionalRestore: 1 };
  });
  await check(`${edition}: absent or mismatched transaction receipts remain uncertain`, async () => {
    for (const receipt of [{ ok: true }, { ok: true, workspaceId: 'test', operationId: 'wrong', checkpointId: 'wrong', version: 9 }]) {
      requests = [];
      finalResponse = { ok: true, json: async () => receipt };
      await assert.rejects(service.restoreFullDatabaseBackup(backup, { operationId: 'known-id' }), error => error.restoreNotCommitted !== true);
    }
  });
}
console.log(`${passes} backup Edge/frontend regression cases passed; no network or real database used.`);
