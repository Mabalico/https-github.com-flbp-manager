import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.mjs';

const TOKEN = 'test-token-that-is-longer-than-thirty-two-characters';

const acquireWriter = async (base, token = TOKEN, holderId = `writer-${crypto.randomUUID()}`, takeover = false) => {
  const response = await fetch(`${base}/api/v1/admin/write-lease/acquire`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-flbp-local-token': token },
    body: JSON.stringify({ holderId, holderLabel: 'Test Admin', takeover }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.acquired, true);
  return holderId;
};

const startServer = async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-http-'));
  const app = createLocalServer({
    host: '127.0.0.1',
    port: 0,
    dataDir,
    secondaryBackupDir: '',
    requireSecondaryBackup: false,
    workspaceId: 'default',
    adminToken: TOKEN,
    allowedOrigins: ['http://test.local'],
    publicUrl: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    heartbeatIntervalMs: 60_000,
    fullBackupIntervalMs: 60_000,
    databaseFilename: 'test.sqlite',
  });
  app.store.importCloudSnapshot({
    state: { tournament: { id: 't1', refereesPassword: 'ref-secret', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] },
    publicState: { tournament: { id: 't1', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] },
  });
  app.store.setActive(true, 1);
  const address = await app.listen();
  return { app, dataDir, base: `http://127.0.0.1:${address.port}` };
};

const cleanup = async ({ app, dataDir }) => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
};

test('public snapshot is readable while private snapshot requires token', async () => {
  const ctx = await startServer();
  try {
    const publicResponse = await fetch(`${ctx.base}/api/v1/public/workspace/default`, { headers: { Origin: 'http://test.local' } });
    assert.equal(publicResponse.status, 200);
    const etag = publicResponse.headers.get('etag');
    assert.ok(etag);
    const publicBody = await publicResponse.json();
    assert.equal(publicBody.state.tournament.id, 't1');
    assert.equal(publicBody.state.tournament.refereesPassword, undefined);
    const unchanged = await fetch(`${ctx.base}/api/v1/public/workspace/default`, { headers: { Origin: 'http://test.local', 'If-None-Match': etag } });
    assert.equal(unchanged.status, 304);

    const unauthorized = await fetch(`${ctx.base}/api/v1/admin/workspace/default`, { headers: { Origin: 'http://test.local' } });
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${ctx.base}/api/v1/admin/workspace/default`, { headers: { Origin: 'http://test.local', 'x-flbp-local-token': TOKEN } });
    assert.equal(authorized.status, 200);
  } finally {
    await cleanup(ctx);
  }
});

test('public discovery does not expose the Windows database path', async () => {
  const ctx = await startServer();
  try {
    const response = await fetch(`${ctx.base}/api/v1/discovery`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.active, true);
    assert.equal('databaseFile' in body, false);
  } finally {
    await cleanup(ctx);
  }
});

test('the server PC receives a temporary local admin session without exposing the master token', async () => {
  const ctx = await startServer();
  try {
    const issued = await fetch(`${ctx.base}/control/local-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(issued.status, 200);
    const session = await issued.json();
    assert.match(session.token, /^local-/);
    assert.notEqual(session.token, TOKEN);

    const admin = await fetch(`${ctx.base}/api/v1/admin/workspace/default`, {
      headers: { 'x-flbp-local-token': session.token },
    });
    assert.equal(admin.status, 200);

    const tunnelSpoof = await fetch(`${ctx.base}/control/local-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: '{}',
    });
    assert.equal(tunnelSpoof.status, 403);
  } finally {
    await cleanup(ctx);
  }
});

test('POST endpoints require JSON and local sessions are rate limited per origin', async () => {
  const ctx = await startServer();
  try {
    const missingType = await fetch(`${ctx.base}/control/local-session`, { method: 'POST' });
    assert.equal(missingType.status, 415);
    assert.equal((await missingType.json()).code, 'FLBP_JSON_REQUIRED');

    let limited = null;
    for (let index = 0; index < 11; index += 1) {
      limited = await fetch(`${ctx.base}/control/local-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: 'http://test.local' },
        body: '{}',
      });
    }
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) >= 1);
    assert.equal((await limited.json()).code, 'FLBP_RATE_LIMITED');
  } finally {
    await cleanup(ctx);
  }
});

test('only one Admin writer lease can commit and takeover is explicit', async () => {
  const ctx = await startServer();
  try {
    const firstWriter = await acquireWriter(ctx.base, TOKEN, 'writer-first');
    const secondAttempt = await fetch(`${ctx.base}/api/v1/admin/write-lease/acquire`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN },
      body: JSON.stringify({ holderId: 'writer-second', holderLabel: 'Seconda finestra', takeover: false }),
    });
    assert.equal(secondAttempt.status, 200);
    assert.equal((await secondAttempt.json()).acquired, false);

    const state = { tournament: { id: 't1', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }], marker: 'lease-test' };
    const blocked = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': 'writer-second' },
      body: JSON.stringify({ operationId: 'writer-second-blocked', baseVersion: 1, state, publicState: state }),
    });
    assert.equal(blocked.status, 423);

    await acquireWriter(ctx.base, TOKEN, 'writer-second', true);
    const oldWriterBlocked = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': firstWriter },
      body: JSON.stringify({ operationId: 'writer-first-revoked', baseVersion: 1, state, publicState: state }),
    });
    assert.equal(oldWriterBlocked.status, 423);

    const accepted = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': 'writer-second' },
      body: JSON.stringify({ operationId: 'writer-second-accepted', baseVersion: 1, state, publicState: state }),
    });
    assert.equal(accepted.status, 200);
  } finally {
    await cleanup(ctx);
  }
});

test('server exposes the same production React build and its hashed assets', async () => {
  const ctx = await startServer();
  try {
    const appResponse = await fetch(`${ctx.base}/app/`);
    assert.equal(appResponse.status, 200);
    const html = await appResponse.text();
    assert.match(html, /<div id="root"><\/div>/);
    const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(assetPath);
    const assetResponse = await fetch(`${ctx.base}${assetPath}`);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type') || '', /javascript/);
  } finally {
    await cleanup(ctx);
  }
});

test('control panel uses a CSP-compatible external script', async () => {
  const ctx = await startServer();
  try {
    const pageResponse = await fetch(`${ctx.base}/`);
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(await pageResponse.text(), /<script src="\/control\.js" defer><\/script>/);

    const scriptResponse = await fetch(`${ctx.base}/control.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get('content-type') || '', /javascript/);
    const script = await scriptResponse.text();
    assert.match(script, /fetch\('\/health'\)/);
    assert.doesNotThrow(() => new Function(script));
    assert.doesNotMatch(script, /\?\.|\?\?/);
  } finally {
    await cleanup(ctx);
  }
});

test('HTTP commit rejects stale baseVersion and accepts idempotent retry', async () => {
  const ctx = await startServer();
  try {
    const writerId = await acquireWriter(ctx.base);
    const headers = { Origin: 'http://test.local', 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': writerId };
    const state = { tournament: { id: 't1', name: 'Aggiornato', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] };
    const body = JSON.stringify({ operationId: 'http-op-1', baseVersion: 1, state, publicState: state });
    const first = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, { method: 'POST', headers, body });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).version, 2);
    const retry = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, { method: 'POST', headers, body });
    assert.equal((await retry.json()).idempotent, true);

    const stale = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, { method: 'POST', headers, body: JSON.stringify({ operationId: 'http-stale', baseVersion: 1, state, publicState: state }) });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'FLBP_DB_CONFLICT');
  } finally {
    await cleanup(ctx);
  }
});

test('explicit local recovery rebases on the current version and preserves newer referee reports', async () => {
  const ctx = await startServer();
  try {
    const writerId = await acquireWriter(ctx.base, TOKEN, 'writer-local-recovery');
    const headers = {
      'content-type': 'application/json',
      'x-flbp-local-token': TOKEN,
      'x-flbp-writer-id': writerId,
    };
    const staleLocalState = structuredClone(ctx.app.store.getCurrent().state);
    staleLocalState.marker = 'browser-draft-to-keep';
    const reportedMatch = {
      id: 'm1', scoreA: 10, scoreB: 6, played: true, status: 'finished',
      refereeReportFinalId: 'report-authoritative',
      refereeReportSavedAt: '2026-08-17T12:00:00.000Z',
    };
    const referee = await fetch(`${ctx.base}/api/v1/referee/workspace/default/match-result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: 'recovery-referee-first',
        tournamentId: 't1',
        matchId: 'm1',
        refereePassword: 'ref-secret',
        matches: [reportedMatch],
      }),
    });
    assert.equal(referee.status, 200);

    const missingConfirmation = await fetch(`${ctx.base}/api/v1/admin/workspace/default/recover-local`, {
      method: 'POST', headers,
      body: JSON.stringify({ operationId: 'recovery-no-confirm', baseVersion: 2, state: staleLocalState }),
    });
    assert.equal(missingConfirmation.status, 400);
    assert.equal(ctx.app.store.getCurrent().version, 2);

    const recovered = await fetch(`${ctx.base}/api/v1/admin/workspace/default/recover-local`, {
      method: 'POST', headers,
      body: JSON.stringify({
        operationId: 'recovery-confirmed',
        baseVersion: 2,
        confirmLocalRecovery: true,
        state: staleLocalState,
      }),
    });
    assert.equal(recovered.status, 200);
    const body = await recovered.json();
    assert.equal(body.previous_version, 2);
    assert.equal(body.version, 3);
    assert.deepEqual(body.preserved_referee_match_ids, ['m1']);
    assert.equal(body.state.marker, 'browser-draft-to-keep');
    assert.equal(body.state.tournamentMatches[0].refereeReportFinalId, 'report-authoritative');
    assert.equal(ctx.app.store.getCurrent().state.tournamentMatches[0].scoreA, 10);
  } finally {
    await cleanup(ctx);
  }
});

test('concurrent durable writes wait for the previous secondary replica before committing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-http-write-queue-'));
  const secondaryBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-http-write-replica-'));
  const app = createLocalServer({
    host: '127.0.0.1',
    port: 0,
    dataDir,
    secondaryBackupDir,
    requireSecondaryBackup: false,
    workspaceId: 'default',
    adminToken: TOKEN,
    allowedOrigins: ['http://test.local'],
    publicUrl: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    heartbeatIntervalMs: 60_000,
    fullBackupIntervalMs: 60_000,
    secondaryBackupIntervalMs: 60_000,
    databaseFilename: 'test.sqlite',
  });
  app.store.importCloudSnapshot({ state: { marker: 'base' }, publicState: { marker: 'base' } });
  app.store.setActive(true, 1);
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const writerId = await acquireWriter(base);
    const headers = { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': writerId };
    let releaseReplica;
    let signalReplicaStarted;
    const replicaStarted = new Promise((resolve) => { signalReplicaStarted = resolve; });
    const replicaGate = new Promise((resolve) => { releaseReplica = resolve; });
    let replicaCalls = 0;
    app.store.createSecondaryBackup = async () => {
      replicaCalls += 1;
      if (replicaCalls === 1) {
        signalReplicaStarted();
        await replicaGate;
      }
      const current = app.store.getCurrent();
      return { backedUp: true, version: current.version, checksum: current.checksum, operationId: current.operationId };
    };

    const first = fetch(`${base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST', headers,
      body: JSON.stringify({ operationId: 'queued-write-1', baseVersion: 1, state: { marker: 'first' } }),
    });
    await replicaStarted;
    const publicWhileReplicaIsPending = await Promise.race([
      fetch(`${base}/api/v1/public/workspace/default`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('public read blocked by secondary replica')), 250)),
    ]);
    assert.equal(publicWhileReplicaIsPending.status, 200);
    assert.equal((await publicWhileReplicaIsPending.json()).state.marker, 'first');
    const healthWhileReplicaIsPending = await Promise.race([
      fetch(`${base}/health`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health blocked by secondary replica')), 250)),
    ]);
    assert.equal(healthWhileReplicaIsPending.status, 200);
    const second = fetch(`${base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST', headers,
      body: JSON.stringify({ operationId: 'queued-write-2', baseVersion: 2, state: { marker: 'second' } }),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(app.store.getCurrent().version, 2, 'the second commit ran before the first replica completed');
    releaseReplica();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(app.store.getCurrent().version, 3);
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(secondaryBackupDir, { recursive: true, force: true });
  }
});

test('write endpoints reject missing or oversized operation IDs before touching SQLite', async () => {
  const ctx = await startServer();
  try {
    const writerId = await acquireWriter(ctx.base);
    const headers = { Origin: 'http://test.local', 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': writerId };
    const state = { tournament: { id: 't1', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] };
    const beforeVersion = ctx.app.store.getCurrent().version;
    for (const invalidOperationId of ['', 'x'.repeat(201), 'id non valido']) {
      const response = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ operationId: invalidOperationId, baseVersion: beforeVersion, state }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'FLBP_INVALID_OPERATION');
    }
    assert.equal(ctx.app.store.getCurrent().version, beforeVersion);
  } finally {
    await cleanup(ctx);
  }
});

test('referee match endpoint is authenticated and idempotent', async () => {
  const ctx = await startServer();
  try {
    const headers = { Origin: 'http://test.local', 'content-type': 'application/json' };
    const body = { operationId: 'report-http-1', tournamentId: 't1', matchId: 'm1', refereePassword: 'ref-secret', matches: [{ id: 'm1', scoreA: 7, scoreB: 5, refereeReportSavedAt: '2026-08-01T12:00:00.000Z' }] };
    const first = await fetch(`${ctx.base}/api/v1/referee/workspace/default/match-result`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(first.status, 200);
    const repeated = await fetch(`${ctx.base}/api/v1/referee/workspace/default/match-result`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal((await repeated.json()).idempotent, true);
    const privateRow = ctx.app.store.getCurrent();
    assert.equal(privateRow.state.tournamentMatches[0].scoreA, 7);
  } finally {
    await cleanup(ctx);
  }
});

test('a stale Admin snapshot cannot regress a newer referee report', async () => {
  const ctx = await startServer();
  try {
    const writerId = await acquireWriter(ctx.base, TOKEN, 'writer-referee-race');
    const staleState = structuredClone(ctx.app.store.getCurrent().state);
    const reportedMatch = { id: 'm1', scoreA: 10, scoreB: 8, played: true, status: 'finished', refereeReportSavedAt: '2026-08-11T12:00:00.000Z' };
    const referee = await fetch(`${ctx.base}/api/v1/referee/workspace/default/match-result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: 'race-referee-v2', tournamentId: 't1', matchId: 'm1', refereePassword: 'ref-secret', matches: [reportedMatch] }),
    });
    assert.equal(referee.status, 200);

    staleState.marker = 'stale-admin';
    const staleAdmin = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': writerId },
      body: JSON.stringify({ operationId: 'race-admin-stale', baseVersion: 1, state: staleState, publicState: staleState }),
    });
    assert.equal(staleAdmin.status, 409);
    const current = ctx.app.store.getCurrent();
    assert.equal(current.version, 2);
    assert.equal(current.state.tournamentMatches[0].scoreA, 10);
    assert.equal(current.state.tournamentMatches[0].refereeReportSavedAt, reportedMatch.refereeReportSavedAt);
  } finally {
    await cleanup(ctx);
  }
});

test('same-origin LAN clients can submit reports while unrelated origins remain blocked', async () => {
  const ctx = await startServer();
  try {
    const sameOriginHeaders = {
      Origin: ctx.base,
      'content-type': 'application/json',
    };
    const body = {
      operationId: 'lan-report-1',
      tournamentId: 't1',
      matchId: 'm1',
      refereePassword: 'ref-secret',
      matches: [{ id: 'm1', scoreA: 9, scoreB: 7, refereeReportSavedAt: '2026-08-01T12:10:00.000Z' }],
    };
    const accepted = await fetch(`${ctx.base}/api/v1/referee/workspace/default/match-result`, {
      method: 'POST',
      headers: sameOriginHeaders,
      body: JSON.stringify(body),
    });
    assert.equal(accepted.status, 200);

    const blocked = await fetch(`${ctx.base}/api/v1/referee/workspace/default/match-result`, {
      method: 'POST',
      headers: { ...sameOriginHeaders, Origin: 'https://evil.example' },
      body: JSON.stringify({ ...body, operationId: 'evil-report' }),
    });
    assert.equal(blocked.status, 403);
  } finally {
    await cleanup(ctx);
  }
});

test('control switch activates and deactivates the local primary in offline-only mode', async () => {
  const ctx = await startServer();
  try {
    ctx.app.store.setActive(false);
    const headers = { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN };
    const activated = await fetch(`${ctx.base}/control/activate`, { method: 'POST', headers, body: '{}' });
    assert.equal(activated.status, 200);
    assert.equal((await activated.json()).active, true);

    const deactivated = await fetch(`${ctx.base}/control/deactivate`, { method: 'POST', headers, body: '{}' });
    assert.equal(deactivated.status, 200);
    assert.equal((await deactivated.json()).active, false);
    const publicAfter = await fetch(`${ctx.base}/api/v1/public/workspace/default`);
    assert.equal(publicAfter.status, 503);
  } finally {
    await cleanup(ctx);
  }
});

test('a restored active database remains read-only until Supabase reconfirms its epoch', async () => {
  const ctx = await startServer();
  try {
    ctx.app.store.setTransitionState('restore-pending');
    const headers = { 'content-type': 'application/json', 'x-flbp-local-token': TOKEN };
    const state = { tournament: { id: 't1', name: 'Non ancora', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] };
    const blocked = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ operationId: 'restore-blocked-v2', baseVersion: 1, state }),
    });
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).code, 'FLBP_LOCAL_DRAINING');

    let heartbeatCalls = 0;
    ctx.app.sync.isConfigured = () => true;
    ctx.app.sync.reconcileTransition = async () => {
      heartbeatCalls += 1;
      ctx.app.store.setTransitionState('idle');
      return { ok: true, action: 'resume-local', node_id: ctx.app.sync.nodeId, epoch: 1 };
    };
    const resumed = await fetch(`${ctx.base}/control/resume-restored`, { method: 'POST', headers, body: '{}' });
    assert.equal(resumed.status, 200);
    assert.equal((await resumed.json()).resumed, true);
    assert.equal(heartbeatCalls, 1);
    assert.equal(ctx.app.store.getTransitionState(), 'idle');

    const writerId = await acquireWriter(ctx.base);
    const accepted = await fetch(`${ctx.base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers: { ...headers, 'x-flbp-writer-id': writerId },
      body: JSON.stringify({ operationId: 'restore-accepted-v2', baseVersion: 1, state }),
    });
    assert.equal(accepted.status, 200);
  } finally {
    await cleanup(ctx);
  }
});

test('an Admin SQLite commit propagates to public readers and survives a server restart', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-admin-propagation-'));
  const config = {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    secondaryBackupDir: '',
    requireSecondaryBackup: false,
    workspaceId: 'default',
    adminToken: TOKEN,
    allowedOrigins: ['http://test.local'],
    publicUrl: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    heartbeatIntervalMs: 60_000,
    fullBackupIntervalMs: 60_000,
    databaseFilename: 'propagation.sqlite',
  };
  let first = createLocalServer(config);
  try {
    const initialState = {
      tournament: { id: 't1', name: 'Prima', refereesPassword: 'ref-secret', matches: [{ id: 'm1' }] },
      tournamentMatches: [{ id: 'm1' }],
      tournamentHistory: [],
    };
    first.store.importCloudSnapshot({ state: initialState, publicState: initialState });
    first.store.setActive(true, 7);
    let address = await first.listen();
    let base = `http://127.0.0.1:${address.port}`;
    const session = await (await fetch(`${base}/control/local-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })).json();
    const writerId = await acquireWriter(base, session.token);

    const nextState = structuredClone(initialState);
    nextState.tournament.name = 'Gestito in Admin locale';
    const committed = await fetch(`${base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flbp-local-token': session.token, 'x-flbp-writer-id': writerId },
      body: JSON.stringify({ operationId: 'admin-propagation-1', baseVersion: 1, state: nextState, publicState: nextState }),
    });
    assert.equal(committed.status, 200);
    assert.equal((await committed.json()).version, 2);

    const publicBeforeRestart = await (await fetch(`${base}/api/v1/public/workspace/default`)).json();
    assert.equal(publicBeforeRestart.state.tournament.name, 'Gestito in Admin locale');
    await first.close();

    const restarted = createLocalServer(config);
    first = restarted;
    address = await restarted.listen();
    base = `http://127.0.0.1:${address.port}`;
    const publicAfterRestart = await (await fetch(`${base}/api/v1/public/workspace/default`)).json();
    assert.equal(publicAfterRestart.version, 2);
    assert.equal(publicAfterRestart.state.tournament.name, 'Gestito in Admin locale');
  } finally {
    await first.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('deactivation drains writes and keeps them blocked across a restart until the switch is confirmed', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-draining-'));
  const config = {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    secondaryBackupDir: '',
    requireSecondaryBackup: false,
    workspaceId: 'default',
    adminToken: TOKEN,
    allowedOrigins: ['http://test.local'],
    publicUrl: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    heartbeatIntervalMs: 60_000,
    fullBackupIntervalMs: 60_000,
    databaseFilename: 'draining.sqlite',
  };
  const headers = {
    Origin: 'http://test.local',
    'content-type': 'application/json',
    'x-flbp-local-token': TOKEN,
  };
  let app = createLocalServer(config);
  try {
    const state = {
      tournament: { id: 't1', refereesPassword: 'ref-secret', matches: [{ id: 'm1' }] },
      tournamentMatches: [{ id: 'm1' }],
    };
    app.store.importCloudSnapshot({ state, publicState: state });
    app.store.setActive(true, 12);
    let address = await app.listen();
    let base = `http://127.0.0.1:${address.port}`;

    let signalEntered;
    const entered = new Promise((resolve) => { signalEntered = resolve; });
    let rejectRemoteSwitch;
    app.sync.deactivate = () => new Promise((resolve, reject) => {
      rejectRemoteSwitch = reject;
      signalEntered();
    });

    const deactivation = fetch(`${base}/control/deactivate`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    await entered;

    const writeWhileDraining = await fetch(`${base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operationId: 'blocked-during-drain',
        baseVersion: 1,
        state: { ...state, marker: 'must-not-commit' },
        publicState: state,
      }),
    });
    assert.equal(writeWhileDraining.status, 503);
    assert.equal((await writeWhileDraining.json()).code, 'FLBP_LOCAL_DRAINING');

    rejectRemoteSwitch(new Error('Risposta Supabase persa dopo la richiesta finale'));
    const ambiguousResponse = await deactivation;
    assert.equal(ambiguousResponse.status, 500);
    assert.equal(app.store.isActive(), true);
    assert.equal(app.store.getTransitionState(), 'deactivation-error');
    await app.close();

    app = createLocalServer(config);
    address = await app.listen();
    base = `http://127.0.0.1:${address.port}`;
    assert.equal(app.store.getTransitionState(), 'deactivation-error');

    const writeAfterRestart = await fetch(`${base}/api/v1/admin/workspace/default/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operationId: 'blocked-after-restart',
        baseVersion: 1,
        state: { ...state, marker: 'must-still-not-commit' },
        publicState: state,
      }),
    });
    assert.equal(writeAfterRestart.status, 503);
    assert.equal((await writeAfterRestart.json()).code, 'FLBP_LOCAL_DRAINING');

    const confirmed = await fetch(`${base}/control/deactivate`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).active, false);
    assert.equal(app.store.getTransitionState(), 'idle');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a failed secondary replica keeps the Admin draft retryable until that version is copied', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-secondary-http-'));
  const secondaryBackupDir = path.join(dataDir, 'usb-backup');
  const app = createLocalServer({
    host: '127.0.0.1',
    port: 0,
    dataDir,
    secondaryBackupDir,
    requireSecondaryBackup: false,
    secondaryBackupRetention: 4,
    workspaceId: 'default',
    adminToken: TOKEN,
    allowedOrigins: ['http://test.local'],
    publicUrl: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    heartbeatIntervalMs: 60_000,
    fullBackupIntervalMs: 60_000,
    secondaryBackupIntervalMs: 60_000,
    databaseFilename: 'secondary.sqlite',
  });
  try {
    const state = { tournament: { id: 't1', matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] };
    app.store.importCloudSnapshot({ state, publicState: state, version: 1, operationId: 'cloud-v1' });
    app.store.setActive(true, 3);
    const originalBackup = app.store.createSecondaryBackup.bind(app.store);
    let failOnce = true;
    app.store.createSecondaryBackup = async (...args) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('USB temporaneamente non disponibile');
      }
      return originalBackup(...args);
    };
    const address = await app.listen();
    const base = `http://127.0.0.1:${address.port}`;
    const writerId = await acquireWriter(base);
    const headers = { Origin: 'http://test.local', 'content-type': 'application/json', 'x-flbp-local-token': TOKEN, 'x-flbp-writer-id': writerId };
    const next = { ...state, marker: 'durable-on-two-disks' };
    const body = JSON.stringify({ operationId: 'secondary-retry-v2', baseVersion: 1, state: next, publicState: next });

    const first = await fetch(`${base}/api/v1/admin/workspace/default/commit`, { method: 'POST', headers, body });
    assert.equal(first.status, 500);
    assert.equal(app.store.getCurrent().version, 2);

    const retry = await fetch(`${base}/api/v1/admin/workspace/default/commit`, { method: 'POST', headers, body });
    assert.equal(retry.status, 200);
    const retryBody = await retry.json();
    assert.equal(retryBody.idempotent, true);
    assert.equal(retryBody.version, 2);
    assert.ok(fs.readdirSync(secondaryBackupDir).some((name) => name.endsWith('.sqlite')));
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
