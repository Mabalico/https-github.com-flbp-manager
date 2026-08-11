import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, VersionConflictError } from '../src/store.mjs';
import { replayCloudOperationJournal, SupabaseSync } from '../src/supabaseSync.mjs';
import { buildPublicWorkspaceLiveState } from '../src/publicSanitizer.mjs';

const fixture = () => {
  const match = { id: 'm1', scoreA: 0, scoreB: 0, refereeReportSavedAt: null };
  const state = {
    tournament: { id: 't1', refereesPassword: 'secret', matches: [match], rounds: [[match]] },
    tournamentMatches: [match],
  };
  return { state, publicState: structuredClone(state) };
};

const withStore = async (fn) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-store-'));
  const store = new LocalStore({ dataDir, workspaceId: 'default' });
  try {
    await fn(store, dataDir);
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
};

test('snapshot commits are durable, versioned and idempotent', () => withStore((store) => {
  const initial = fixture();
  const first = store.importCloudSnapshot({ ...initial, updatedAt: '2026-08-01T10:00:00.000Z' });
  assert.equal(first.version, 1);

  const changed = fixture();
  changed.state.tournament.name = 'Torneo locale';
  const committed = store.commitSnapshot({ ...changed, operationId: 'op-admin-1', baseVersion: 1 });
  assert.equal(committed.version, 2);
  assert.equal(store.pendingOutboxCount(), 1);
  assert.equal(store.listPendingOutbox()[0].kind, 'state-patch');

  const repeated = store.commitSnapshot({ ...changed, operationId: 'op-admin-1', baseVersion: 1 });
  assert.equal(repeated.version, 2);
  assert.equal(repeated.idempotent, true);

  const collided = fixture();
  collided.state.tournament.name = 'Payload differente';
  assert.throws(
    () => store.commitSnapshot({ ...collided, operationId: 'op-admin-1', baseVersion: 2 }),
    (error) => error?.code === 'FLBP_OPERATION_COLLISION',
  );
  assert.equal(store.pendingOutboxCount(), 1);
}));

test('public snapshots are sanitized by the server even when the client sends private fields', () => withStore((store) => {
  const state = {
    teams: [{ id: 'team-1', name: 'Team', player1: 'Mario', player1BirthDate: '1990-01-01', player1YoB: 1990 }],
    tournament: {
      id: 't1',
      refereesPassword: 'must-never-be-public',
      teams: [{ id: 'team-1', player1: 'Mario', player1BirthDate: '1990-01-01' }],
      matches: [{ id: 'm1' }],
    },
    tournamentMatches: [{ id: 'm1' }],
    tournamentHistory: [],
    integrationsScorers: [{ name: 'Mario', birthDate: '1990-01-01', yob: 1990 }],
    hallOfFame: [{ id: 'hof-1', playerName: 'Mario', playerId: 'private-id', playerBirthDate: '1990-01-01' }],
    playerAliases: { private: 'mapping' },
    playerAccountAliasIgnores: { private: true },
  };
  store.importCloudSnapshot({ state, publicState: state, version: 1, operationId: 'private-cloud-v1' });
  const publicState = store.getCurrent().publicState;
  assert.equal(publicState.tournament.refereesPassword, undefined);
  assert.equal(publicState.teams[0].player1BirthDate, undefined);
  assert.equal(publicState.tournament.teams[0].player1BirthDate, undefined);
  assert.equal(publicState.integrationsScorers[0].birthDate, undefined);
  assert.equal(publicState.hallOfFame[0].playerId, undefined);
  assert.equal(publicState.playerAliases, undefined);
  assert.equal(publicState.playerAccountAliasIgnores, undefined);
}));

test('the public live projection excludes historical and private bulk data', () => {
  const state = {
    __schemaVersion: 2,
    teams: [{ id: 'team-1', player1BirthDate: '1990-01-01' }],
    tournament: { id: 't1', refereesPassword: 'private', matches: [{ id: 'm1' }] },
    tournamentMatches: [{ id: 'm1' }],
    tournamentHistory: [{ id: 'old' }],
    playerAliases: { private: true },
  };
  const live = buildPublicWorkspaceLiveState(state);
  assert.deepEqual(Object.keys(live).sort(), ['__schemaVersion', 'teams', 'tournament', 'tournamentMatches'].sort());
  assert.equal(live.teams[0].player1BirthDate, undefined);
  assert.equal(live.tournament.refereesPassword, undefined);
});

test('stale full snapshots cannot overwrite a newer version', () => withStore((store) => {
  const initial = fixture();
  store.importCloudSnapshot(initial);
  store.commitSnapshot({ ...initial, operationId: 'op-new', baseVersion: 1 });
  assert.throws(
    () => store.commitSnapshot({ ...initial, operationId: 'op-stale', baseVersion: 1 }),
    (error) => error instanceof VersionConflictError && error.currentVersion === 2,
  );
  assert.equal(store.getCurrent().operationId, 'op-new');
}));

test('an old idempotent retry returns its own version without impersonating a newer snapshot', () => withStore((store) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 1, operationId: 'cloud-v1' });
  const first = fixture();
  first.state.tournament.name = 'Prima';
  const committedFirst = store.commitSnapshot({ ...first, operationId: 'admin-v2', baseVersion: 1 });
  const second = fixture();
  second.state.tournament.name = 'Seconda';
  const committedSecond = store.commitSnapshot({ ...second, operationId: 'admin-v3', baseVersion: 2 });
  assert.equal(committedSecond.version, 3);

  const retried = store.commitSnapshot({ ...first, operationId: 'admin-v2', baseVersion: 1 });
  assert.equal(retried.idempotent, true);
  assert.equal(retried.version, committedFirst.version);
  assert.equal(retried.state.tournament.name, 'Prima');
  assert.equal(store.getCurrent().state.tournament.name, 'Seconda');
}));

test('cloud imports preserve the canonical version without creating an unjournaled gap', () => withStore((store) => {
  const initial = fixture();
  const imported = store.importCloudSnapshot({ ...initial, version: 7, operationId: 'cloud-v7', updatedAt: '2026-08-01T10:00:00.000Z' });
  assert.equal(imported.version, 7);

  const repeated = store.importCloudSnapshot({ ...initial, version: 7, operationId: 'cloud-v7', updatedAt: '2026-08-01T10:00:00.000Z' });
  assert.equal(repeated.version, 7);
  assert.equal(repeated.idempotent, true);

  const changed = fixture();
  changed.state.tournament.name = 'Prima modifica locale';
  const committed = store.commitSnapshot({ ...changed, operationId: 'local-v8', baseVersion: 7 });
  assert.equal(committed.version, 8);
  assert.equal(store.listPendingOutbox(10)[0].version, 8);

  assert.throws(
    () => store.importCloudSnapshot({ ...initial, version: 7, operationId: 'different-v7' }),
    /operazioni non ancora sincronizzate/,
  );
}));

test('match operations patch only requested matches and reject older reports', () => withStore((store) => {
  const initial = fixture();
  store.importCloudSnapshot(initial);
  const savedAt = '2026-08-01T10:05:00.000Z';
  const match = { id: 'm1', scoreA: 10, scoreB: 8, played: true, status: 'finished', refereeReportSavedAt: savedAt };
  const committed = store.commitMatchPatch({ tournamentId: 't1', matchId: 'm1', matches: [match], operationId: 'report-1' });
  assert.equal(committed.version, 2);
  assert.equal(committed.state.tournamentMatches[0].scoreA, 10);
  assert.equal(committed.publicState.tournament.matches[0].scoreB, 8);

  const newer = { ...match, scoreA: 11, refereeReportSavedAt: '2026-08-01T10:06:00.000Z' };
  store.commitMatchPatch({ tournamentId: 't1', matchId: 'm1', matches: [newer], operationId: 'report-2' });
  const lateRetry = store.commitMatchPatch({ tournamentId: 't1', matchId: 'm1', matches: [match], operationId: 'report-1' });
  assert.equal(lateRetry.idempotent, true);
  assert.equal(store.getCurrent().state.tournamentMatches[0].scoreA, 11);

  const older = { ...match, scoreA: 1, refereeReportSavedAt: '2026-08-01T10:04:00.000Z' };
  assert.throws(
    () => store.commitMatchPatch({ tournamentId: 't1', matchId: 'm1', matches: [older], operationId: 'report-old' }),
    (error) => error.code === 'FLBP_DB_CONFLICT',
  );
  assert.equal(store.getCurrent().state.tournamentMatches[0].scoreA, 11);
}));

test('WAL survives process-style close and reopen with pending outbox intact', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-reopen-'));
  try {
    const firstStore = new LocalStore({ dataDir, workspaceId: 'default' });
    const initial = fixture();
    firstStore.importCloudSnapshot(initial);
    firstStore.commitSnapshot({ ...initial, operationId: 'before-restart', baseVersion: 1 });
    firstStore.close();

    const reopened = new LocalStore({ dataDir, workspaceId: 'default' });
    assert.equal(reopened.getCurrent().version, 2);
    assert.equal(reopened.getCurrent().operationId, 'before-restart');
    assert.equal(reopened.pendingOutboxCount(), 1);
    reopened.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a secondary SQLite backup is complete, readable and versioned', () => withStore(async (store, dataDir) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 4, operationId: 'cloud-v4' });
  const secondaryDir = path.join(dataDir, 'secondary-drive');
  const result = await store.createSecondaryBackup(secondaryDir, 3);
  assert.equal(result.backedUp, true);
  assert.equal(result.verified, true);
  assert.equal(result.version, 4);
  assert.equal(result.operationId, 'cloud-v4');
  assert.equal(result.checksum, store.getCurrent().checksum);
  assert.ok(fs.existsSync(result.filename));

  const copy = new DatabaseSync(result.filename, { readOnly: true });
  try {
    const row = copy.prepare('SELECT version, operation_id FROM current_workspace WHERE workspace_id = ?').get('default');
    assert.equal(Number(row.version), 4);
    assert.equal(row.operation_id, 'cloud-v4');
  } finally {
    copy.close();
  }
}));

test('history retention keeps the newest 100 versions, current state and pending outbox dependencies', () => withStore((store) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 1, operationId: 'cloud-v1' });
  for (let version = 2; version <= 106; version += 1) {
    const next = fixture();
    next.state.sequence = version;
    next.publicState.sequence = version;
    store.commitSnapshot({ ...next, operationId: `retention-v${version}`, baseVersion: version - 1 });
  }
  store.markOutboxSyncedThroughVersion(106);
  store.db.prepare('UPDATE outbox SET synced_at = NULL WHERE workspace_id = ? AND version = 2').run('default');
  store.db.prepare("UPDATE snapshots SET created_at = '2020-01-01T00:00:00.000Z' WHERE workspace_id = ?").run('default');

  const result = store.pruneHistory({ retentionDays: 90, minVersions: 100 });
  assert.equal(result.prunedSnapshots, 5);
  assert.ok(store.db.prepare('SELECT 1 FROM snapshots WHERE workspace_id = ? AND version = 2').get('default'));
  assert.ok(store.db.prepare('SELECT 1 FROM snapshots WHERE workspace_id = ? AND version = 106').get('default'));
  assert.equal(store.getCurrent().version, 106);
}));

test('node identity and leadership epoch survive a process restart', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-leadership-reopen-'));
  const config = { nodeId: '', supabaseUrl: '', supabaseServiceRoleKey: '' };
  try {
    const firstStore = new LocalStore({ dataDir, workspaceId: 'default' });
    firstStore.setActive(true, 12);
    const firstSync = new SupabaseSync(config, firstStore);
    const firstNodeId = firstSync.nodeId;
    assert.equal(firstSync.epoch, 12);
    firstStore.close();

    const reopened = new LocalStore({ dataDir, workspaceId: 'default' });
    const restartedSync = new SupabaseSync(config, reopened);
    assert.equal(restartedSync.nodeId, firstNodeId);
    assert.equal(restartedSync.epoch, 12);
    assert.equal(reopened.isActive(), true);
    reopened.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('activation is compare-and-switch and does not make SQLite writable before the caller imports', () => withStore(async (store) => {
  const sync = new SupabaseSync({
    nodeId: 'node-a',
    publicUrl: 'https://locale.example.test',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
    leaseTtlSeconds: 60,
  }, store);
  let called = null;
  sync.rpc = async (name, body) => {
    called = { name, body };
    return { ok: true, epoch: 4 };
  };
  const snapshot = {
    ...fixture(),
    version: 12,
    operationId: 'journal-v12',
    cloudBaseVersion: 10,
    cloudBaseOperationId: 'cloud-v10',
    cloudBaseState: { base: 'private-v10' },
    cloudBasePublicState: { base: 'public-v10' },
    sourcePlaneEpoch: 3,
  };
  const out = await sync.activate(snapshot);
  assert.equal(out.epoch, 4);
  assert.equal(store.isActive(), false);
  assert.equal(called.name, 'flbp_local_activate_data_plane_v3');
  assert.equal(called.body.p_public_read_mode, 'local');
  assert.equal(called.body.p_expected_cloud_version, 10);
  assert.equal(called.body.p_expected_cloud_operation_id, 'cloud-v10');
  assert.deepEqual(called.body.p_expected_cloud_state, { base: 'private-v10' });
  assert.deepEqual(called.body.p_expected_public_state, { base: 'public-v10' });
  assert.equal(called.body.p_expected_plane_epoch, 3);
  assert.equal(called.body.p_expected_recovered_version, 12);
}));

test('startup reconciliation resumes an activation whose response was lost', () => withStore(async (store) => {
  const baseline = { ...fixture(), version: 6, operationId: 'cloud-v6', sourcePlaneEpoch: 10 };
  store.importCloudSnapshot(baseline);
  store.setTransitionState('activating');
  store.setMeta('pending_primary_epoch', '11');
  const sync = new SupabaseSync({
    nodeId: 'node-activation-restart',
    publicUrl: '',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
  }, store);
  sync.rpc = async (name) => {
    assert.equal(name, 'flbp_local_reconcile_data_plane');
    return { ok: true, accepted: true, action: 'resume-local', node_id: 'node-activation-restart', epoch: 11 };
  };
  sync.pullCloudSnapshot = async () => baseline;

  const result = await sync.reconcileTransition();
  assert.equal(result.action, 'resume-local');
  assert.equal(store.isActive(), true);
  assert.equal(store.getTransitionState(), 'idle');
  assert.equal(store.getCurrent().version, 6);
}));

test('an ambiguous final switch is retryable and clears the covered outbox only after confirmation', () => withStore(async (store) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 3, operationId: 'cloud-v3' });
  store.setActive(true, 8);
  const changed = fixture();
  changed.state.tournament.name = 'Finale locale';
  store.commitSnapshot({ ...changed, operationId: 'local-v4', baseVersion: 3 });
  const sync = new SupabaseSync({
    nodeId: 'node-a',
    publicUrl: 'https://locale.example.test',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
  }, store);
  let attempts = 0;
  let finalBody = null;
  sync.rpc = async (name, body) => {
    if (name === 'flbp_local_reconcile_data_plane') {
      return { ok: true, action: 'standby-cloud', node_id: 'node-a', epoch: 8, version: 4, operation_id: 'local-v4' };
    }
    assert.equal(name, 'flbp_local_deactivate_data_plane_v2');
    attempts += 1;
    finalBody = body;
    if (attempts === 1) throw new Error('risposta persa');
    return { ok: true, deactivated: true, idempotent: true, updated_at: '2026-08-01T12:00:00.000Z' };
  };
  sync.verifyCloudSnapshot = async () => ({ verified: true });

  await assert.rejects(() => sync.deactivate(), /risposta persa/);
  assert.equal(store.isActive(), true);
  assert.equal(store.pendingOutboxCount(), 1);

  const retried = await sync.deactivate();
  assert.equal(retried.idempotent, true);
  assert.equal(finalBody.p_version, 4);
  assert.equal(finalBody.p_operation_id, 'local-v4');
  assert.equal(finalBody.p_state.tournament.name, 'Finale locale');
  assert.equal(store.isActive(), false);
  assert.equal(store.pendingOutboxCount(), 0);
}));

test('startup reconciliation confirms a lost deactivation response only for the exact node, epoch and operation', () => withStore(async (store) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 3, operationId: 'cloud-v3' });
  store.setActive(true, 8);
  const changed = fixture();
  changed.state.tournament.name = 'Finale confermata dopo riavvio';
  store.commitSnapshot({ ...changed, operationId: 'local-v4-restart', baseVersion: 3 });
  store.setTransitionState('deactivation-error');
  const sync = new SupabaseSync({
    nodeId: 'node-restarted',
    publicUrl: '',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
  }, store);
  sync.rpc = async (name) => {
    assert.equal(name, 'flbp_local_reconcile_data_plane');
    return { ok: true, accepted: true, action: 'standby-cloud', node_id: 'node-restarted', epoch: 8, version: 4, operation_id: 'local-v4-restart' };
  };
  sync.verifyCloudSnapshot = async () => ({ verified: true });

  const result = await sync.reconcileTransition();
  assert.equal(result.action, 'standby-cloud');
  assert.equal(store.isActive(), false);
  assert.equal(store.getTransitionState(), 'idle');
  assert.equal(store.pendingOutboxCount(), 0);
}));

test('an unreachable or mismatching coordinator keeps an ambiguous transition fail-closed', () => withStore(async (store) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 3, operationId: 'cloud-v3' });
  store.setActive(true, 9);
  store.setTransitionState('deactivation-error');
  const sync = new SupabaseSync({
    nodeId: 'node-fail-closed',
    publicUrl: '',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
  }, store);
  sync.rpc = async () => { throw new Error('rete assente'); };
  await assert.rejects(() => sync.reconcileTransition(), /rete assente/);
  assert.equal(store.isActive(), true);
  assert.equal(store.getTransitionState(), 'deactivation-error');

  sync.rpc = async () => ({ ok: true, accepted: true, action: 'resume-local', node_id: 'altro-nodo', epoch: 9 });
  await assert.rejects(() => sync.reconcileTransition(), /nodo o epoch non corrispondente/);
  assert.equal(store.getTransitionState(), 'deactivation-error');
}));

test('a full cloud backup clears the outbox only after checksum verification', () => withStore(async (store) => {
  const initial = fixture();
  store.importCloudSnapshot({ ...initial, version: 1, operationId: 'cloud-v1' });
  store.setActive(true, 4);
  const changed = fixture();
  changed.state.tournament.name = 'Backup verificabile';
  store.commitSnapshot({ ...changed, operationId: 'local-v2-backup', baseVersion: 1 });
  const sync = new SupabaseSync({
    nodeId: 'node-backup',
    publicUrl: '',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
  }, store);
  sync.rpc = async (name) => {
    assert.equal(name, 'flbp_local_backup_data_plane_v2');
    return { ok: true, updated_at: '2026-08-01T13:00:00.000Z' };
  };
  sync.publishLiveSnapshot = async () => ({ published: true });
  sync.verifyCloudSnapshot = async () => ({ verified: false });

  await assert.rejects(() => sync.backupSnapshot(), /non verificato/);
  assert.equal(store.pendingOutboxCount(), 1);

  sync.verifyCloudSnapshot = async () => ({ verified: true, localChecksum: 'verified-checksum' });
  const result = await sync.backupSnapshot();
  assert.equal(result.verified, true);
  assert.equal(store.pendingOutboxCount(), 0);
}));

test('remote operation journal rebuilds reports newer than the last full backup', () => {
  const initial = fixture();
  const report = {
    id: 'm1',
    scoreA: 9,
    scoreB: 7,
    played: true,
    status: 'finished',
    refereeReportSavedAt: '2026-08-01T12:30:00.000Z',
  };
  const recovered = replayCloudOperationJournal(
    { ...initial, version: 1, operationId: 'cloud-backup-1' },
    [{
      operation_id: 'report-after-backup',
      local_version: 2,
      operation_kind: 'match-result',
      payload: { tournamentId: 't1', matchId: 'm1', matches: [report] },
      created_at: '2026-08-01T12:30:01.000Z',
    }],
  );
  assert.equal(recovered.version, 2);
  assert.equal(recovered.operationId, 'report-after-backup');
  assert.equal(recovered.recoveredOperations, 1);
  assert.equal(recovered.state.tournamentMatches[0].scoreA, 9);
  assert.equal(recovered.publicState.tournament.matches[0].scoreB, 7);
});

test('activation without a public URL keeps Internet readers on the Supabase mirror', () => withStore(async (store) => {
  const sync = new SupabaseSync({
    nodeId: 'node-lan',
    publicUrl: '',
    supabaseUrl: 'https://project.supabase.co',
    supabaseServiceRoleKey: 'service-role-test',
    workspaceId: 'default',
    leaseTtlSeconds: 60,
  }, store);
  let called = null;
  sync.rpc = async (name, body) => {
    called = { name, body };
    return { ok: true, epoch: 1 };
  };
  await sync.activate({
    ...fixture(),
    version: 1,
    cloudBaseVersion: 1,
    cloudBaseState: fixture().state,
    cloudBasePublicState: fixture().publicState,
    sourcePlaneEpoch: 0,
  });
  assert.equal(called.name, 'flbp_local_activate_data_plane_v3');
  assert.equal(called.body.p_base_url, null);
  assert.equal(called.body.p_public_read_mode, 'cloud');
}));

test('remote recovery stops on a journal version gap', () => {
  const initial = fixture();
  assert.throws(
    () => replayCloudOperationJournal(
      { ...initial, version: 1 },
      [{ operation_id: 'gap', local_version: 3, operation_kind: 'workspace-snapshot', payload: initial }],
    ),
    /Journal remoto incompleto/,
  );
});

test('compact state patches replay to the exact private and public snapshots', () => {
  const initial = fixture();
  const storeState = structuredClone(initial.state);
  storeState.tournament.name = 'Patch remoto';
  const recovered = replayCloudOperationJournal(
    { ...initial, version: 1, operationId: 'cloud-v1' },
    [{
      operation_id: 'patch-v2',
      local_version: 2,
      operation_kind: 'state-patch',
      payload: {
        statePatch: [{ op: 'set', path: ['tournament', 'name'], value: 'Patch remoto' }],
        publicStatePatch: [{ op: 'set', path: ['tournament', 'name'], value: 'Patch remoto' }],
      },
      created_at: '2026-08-11T10:00:00.000Z',
    }],
  );
  assert.deepEqual(recovered.state, storeState);
  assert.equal(recovered.publicState.tournament.name, 'Patch remoto');
  assert.equal(recovered.version, 2);
});

test('the rollout migration keeps local write authority with cloud public reads', () => {
  const migration = fs.readFileSync(new URL('../../FLBP ONLINE/supabase/migrations/20260811000100_local_writer_cloud_public_read.sql', import.meta.url), 'utf8');
  assert.match(migration, /public_read_mode text not null default 'local'/);
  assert.match(migration, /flbp_local_activate_data_plane_v2[\s\S]*?'https:\/\/cloud-read\.invalid'/);
  assert.match(migration, /'mode', 'cloud', 'authority', 'local'/);
  assert.match(migration, /flbp_local_publish_live_data_plane[\s\S]*?flbp_upsert_public_workspace_live/);
  assert.match(migration, /'workspace-snapshot', 'state-patch', 'match-result'/);
});

test('the live guard compacts full snapshots from final and periodic backups', () => {
  const migration = fs.readFileSync(new URL('../../FLBP ONLINE/supabase/migrations/20260811000200_compact_public_live_guard.sql', import.meta.url), 'utf8');
  assert.match(migration, /new\.state := public\.flbp_build_public_workspace_live_state/);
  assert.match(migration, /before insert or update on public\.public_workspace_live/);
});

test('legacy baseline adoption requires identical version and full state', () => {
  const migration = fs.readFileSync(new URL('../../FLBP ONLINE/supabase/migrations/20260811000300_legacy_baseline_operation_compat.sql', import.meta.url), 'utf8');
  assert.match(migration, /v_cloud\.version <> p_version or v_cloud\.state is distinct from/);
  assert.match(migration, /flbp_local_activate_data_plane_v3/);
  assert.match(migration, /flbp_local_backup_data_plane_v2/);
  assert.match(migration, /flbp_local_deactivate_data_plane_v2/);
});

test('deactivation v2 preserves retry after an already successful cloud switch', () => {
  const migration = fs.readFileSync(new URL('../../FLBP ONLINE/supabase/migrations/20260811000400_idempotent_deactivation_v2.sql', import.meta.url), 'utf8');
  assert.match(migration, /v_plane\.mode = 'cloud' and v_plane\.epoch = p_epoch/);
  assert.match(migration, /return public\.flbp_local_deactivate_data_plane/);
});

test('Supabase migration serializes cloud writes, journal uploads and atomic final deactivation', () => {
  const migration = fs.readFileSync(new URL('../../FLBP ONLINE/supabase/migrations/20260801000100_local_data_plane_and_version_history.sql', import.meta.url), 'utf8');
  assert.match(migration, /flbp_workspace_state_before_write[\s\S]*?pg_advisory_xact_lock/);
  assert.match(migration, /before insert or update or delete on public\.workspace_state/);
  assert.match(migration, /flbp_public_workspace_primary_guard[\s\S]*?pg_advisory_xact_lock/);
  assert.match(migration, /before insert or update or delete on public\.public_workspace_state/);
  assert.match(migration, /flbp_local_operation_log_guard[\s\S]*?pg_advisory_xact_lock/);
  assert.match(migration, /FLBP_APPEND_ONLY/);
  assert.match(migration, /p_expected_cloud_version bigint[\s\S]*?p_expected_recovered_version bigint/);
  assert.match(migration, /FLBP_ACTIVATION_CHANGED: journal locale avanzato/);
  assert.match(migration, /flbp_local_deactivate_data_plane[\s\S]*?flbp_local_backup_data_plane/);
  assert.match(migration, /flbp\.local_backup_context[\s\S]*?node_id[\s\S]*?epoch/);
  assert.match(migration, /flbp_local_append_operations[\s\S]*?FLBP_OPERATION_COLLISION[\s\S]*?FLBP_JOURNAL_GAP/);
  assert.match(migration, /revoke insert, update, delete on public\.flbp_local_operation_log from service_role/);
  assert.match(migration, /flbp_admin_push_workspace_state_v2[\s\S]*?FLBP_OPERATION_COLLISION[\s\S]*?v_operation_id[\s\S]*?last_operation_id = excluded\.last_operation_id/);
  assert.doesNotMatch(migration, /if v_role = 'service_role' then\s+return new/);
  assert.match(migration, /flbp_admin_force_cloud_failover[\s\S]*?lease_expires_at > now\(\)[\s\S]*?FLBP_RECOVERY_JOURNAL_PENDING[\s\S]*?v_plane\.epoch \+ 1/);
});
