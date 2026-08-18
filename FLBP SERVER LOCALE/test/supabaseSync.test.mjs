import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalStore } from '../src/store.mjs';
import { buildSupabaseServerHeaders, SupabaseSync } from '../src/supabaseSync.mjs';

const stateAt = (name) => ({
  state: {
    tournament: { id: 't1', name, matches: [{ id: 'm1' }] },
    tournamentMatches: [{ id: 'm1' }],
  },
  publicState: {},
});

test('Supabase server headers support new secret keys without an invalid Bearer token', () => {
  assert.deepEqual(buildSupabaseServerHeaders('sb_secret_test-key'), {
    apikey: 'sb_secret_test-key',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });
  assert.equal(
    buildSupabaseServerHeaders('legacy-service-role').Authorization,
    'Bearer legacy-service-role',
  );
});

const withSync = async (run) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-sync-'));
  const store = new LocalStore({ dataDir, workspaceId: 'default', filename: 'sync.sqlite' });
  try {
    store.importCloudSnapshot({ ...stateAt('Cloud'), version: 1, operationId: 'cloud-v1' });
    store.setActive(true, 7);
    const sync = new SupabaseSync({
      workspaceId: 'default',
      nodeId: 'node-test',
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceRoleKey: 'service-role-test',
    }, store);
    await run({ store, sync });
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
};

test('slow heartbeat calls are coalesced and failures activate retry backoff', () => withSync(async ({ sync }) => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  sync.rpc = async () => {
    calls += 1;
    await gate;
    throw new Error('upstream request timeout');
  };

  const first = sync.heartbeat();
  const joined = Array.from({ length: 20 }, () => sync.heartbeat());
  assert.equal(calls, 1);
  release();
  await assert.rejects(() => first, /upstream request timeout/);
  await Promise.all(joined.map((pending) => assert.rejects(() => pending, /upstream request timeout/)));

  const skipped = await sync.heartbeat();
  assert.equal(skipped.skipped, true);
  assert.equal(calls, 1);
}));

test('outbox rows are cleared only after the transactional RPC confirms every operation', () => withSync(async ({ store, sync }) => {
  store.commitSnapshot({ ...stateAt('Locale'), operationId: 'local-v2', baseVersion: 1 });
  let request = null;
  sync.rpc = async (name, body) => {
    request = { name, body };
    return { ok: true, confirmed: 1, inserted: 1, idempotent: 0, covered_by_snapshot: 0 };
  };

  const result = await sync.syncOutbox();
  assert.equal(request.name, 'flbp_local_append_operations_v2');
  assert.deepEqual(request.body.p_state, store.getCurrent().state);
  assert.equal(request.body.p_epoch, 7);
  assert.equal(request.body.p_operations[0].operation_id, 'local-v2');
  assert.equal(request.body.p_operations[0].local_version, 2);
  assert.equal(result.inserted, 1);
  assert.equal(store.pendingOutboxCount(), 0);
}));

test('an incomplete or ambiguous RPC response keeps the outbox durable and retryable', () => withSync(async ({ store, sync }) => {
  store.commitSnapshot({ ...stateAt('Locale'), operationId: 'local-v2-retry', baseVersion: 1 });
  sync.rpc = async () => ({ ok: true, confirmed: 0 });

  await assert.rejects(() => sync.syncOutbox(), /non ha confermato tutte le operazioni/);
  assert.equal(store.pendingOutboxCount(), 1);
  assert.equal(store.listPendingOutbox()[0].attempts, 1);
}));

test('a commit arriving during an upload is drained immediately without waiting for the 30-minute backup', () => withSync(async ({ store, sync }) => {
  store.commitSnapshot({ ...stateAt('Locale v2'), operationId: 'local-drain-v2', baseVersion: 1 });
  let releaseFirst;
  let signalFirst;
  const firstEntered = new Promise((resolve) => { signalFirst = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const requests = [];
  sync.rpc = async (_name, body) => {
    requests.push(body.p_operations.map((entry) => entry.operation_id));
    if (requests.length === 1) {
      signalFirst();
      await firstGate;
    }
    return { ok: true, confirmed: body.p_operations.length, inserted: body.p_operations.length };
  };

  const firstUpload = sync.scheduleOutboxSync({ immediate: true });
  await firstEntered;
  store.commitSnapshot({ ...stateAt('Locale v3'), operationId: 'local-drain-v3', baseVersion: 2 });
  const joinedUpload = sync.scheduleOutboxSync();
  assert.equal(joinedUpload, firstUpload);
  releaseFirst();
  await firstUpload;

  assert.deepEqual(requests, [['local-drain-v2'], ['local-drain-v3']]);
  assert.equal(store.pendingOutboxCount(), 0);
}));

test('ordinary commits wait for the configured batching window', () => withSync(async ({ store, sync }) => {
  sync.config.outboxFlushIntervalMs = 60_000;
  store.commitSnapshot({ ...stateAt('Locale differita'), operationId: 'local-delayed-v2', baseVersion: 1 });
  let calls = 0;
  sync.rpc = async () => {
    calls += 1;
    return { ok: true, confirmed: 1, inserted: 1 };
  };
  const scheduled = sync.scheduleOutboxSync();
  assert.equal(scheduled, null);
  assert.equal(calls, 0);
  assert.equal(store.pendingOutboxCount(), 1);
  sync.cancelScheduledOutboxSync();
}));

test('live publication uploads only the compact public projection', () => withSync(async ({ store, sync }) => {
  const current = store.getCurrent();
  store.commitSnapshot({
    state: { ...current.state, tournamentHistory: [{ id: 'old-large-history' }] },
    publicState: {},
    operationId: 'local-live-v2',
    baseVersion: 1,
  });
  let body = null;
  sync.rpc = async (name, input) => {
    assert.equal(name, 'flbp_local_publish_live_data_plane');
    body = input;
    return { ok: true, updated_at: '2026-08-11T12:00:00.000Z' };
  };
  const result = await sync.publishLiveSnapshot();
  assert.equal(result.published, true);
  assert.equal(body.p_public_state.tournamentHistory, undefined);
  assert.ok(Array.isArray(body.p_public_state.tournamentMatches));
}));

test('live publication scheduling coalesces rapid local commits', () => withSync(async ({ sync }) => {
  let calls = 0;
  sync.publishLiveSnapshot = async () => {
    calls += 1;
    return { published: true };
  };
  const firstTimer = sync.scheduleLivePublish({ delayMs: 1 });
  for (let index = 0; index < 100; index += 1) {
    assert.equal(sync.scheduleLivePublish({ delayMs: 1 }), firstTimer);
  }
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
}));

test('the local normalized migration seals archived tournament projections', () => {
  const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'FLBP ONLINE',
    'supabase',
    'migrations',
  );
  const migration = fs.readFileSync(
    path.join(migrationsDir, '20260815000200_local_archived_normalized_sync.sql'),
    'utf8',
  );
  assert.match(migration, /flbp_local_sync_full_normalized_internal/);
  assert.match(migration, /tournamentHistory/);
  assert.match(migration, /set status = 'archived'/);
  assert.match(migration, /v_full_sync then[\s\S]*flbp_local_sync_full_normalized_internal/);

  const archiveRepair = fs.readFileSync(
    path.join(migrationsDir, '20260815000300_local_hof_fanta_archive_sync.sql'),
    'utf8',
  );
  assert.match(archiveRepair, /flbp_local_sync_hof_internal/);
  assert.match(archiveRepair, /flbp_local_refresh_archived_fanta_internal/);

  const scoringRepair = fs.readFileSync(
    path.join(migrationsDir, '20260815000400_restore_fanta_live_scoring_views.sql'),
    'utf8',
  );
  assert.match(scoringRepair, /for v_ordinal in 1\.\.15 loop/);
  assert.match(scoringRepair, /points_from_awards/);

  const ioReduction = fs.readFileSync(
    path.join(migrationsDir, '20260817000100_reduce_local_normalized_io.sql'),
    'utf8',
  );
  assert.match(ioReduction, /v_root in \('tournament', 'tournamentMatches'\)/);
  assert.match(ioReduction, /v_root = 'tournamentHistory'/);
  assert.match(ioReduction, /'unrelated_state_patch'/);
  assert.doesNotMatch(
    ioReduction,
    /where coalesce\(op\.value ->> 'operation_kind', ''\) <> 'match-result'/,
  );
});
