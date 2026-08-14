import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { backup as backupDatabase, DatabaseSync } from 'node:sqlite';
import { applyMatchResultPatch } from './statePatch.mjs';
import { sanitizeAppStateForPublic } from './publicSanitizer.mjs';
import { buildStatePatch } from './stateDelta.mjs';

export class VersionConflictError extends Error {
  constructor(currentVersion) {
    super(`Versione locale cambiata: attesa ${currentVersion}`);
    this.name = 'VersionConflictError';
    this.code = 'FLBP_DB_CONFLICT';
    this.currentVersion = currentVersion;
  }
}

const json = (value) => JSON.stringify(value ?? {});
const parseJson = (value) => JSON.parse(String(value || '{}'));
const nowIso = () => new Date().toISOString();
const checksum = (stateJson, publicStateJson) => crypto.createHash('sha256').update(stateJson).update('\n').update(publicStateJson).digest('hex');
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
};
const semanticChecksum = (state, publicState) => crypto.createHash('sha256')
  .update(json(canonicalize(state)))
  .update('\n')
  .update(json(canonicalize(publicState)))
  .digest('hex');
const operationChecksum = (kind, payload) => crypto.createHash('sha256').update(String(kind || '')).update('\n').update(json(payload)).digest('hex');
const MAX_PATCH_BYTES = 256 * 1024;
const MAX_PATCH_OPERATIONS = 5_000;

export class LocalStore {
  constructor({ dataDir, workspaceId, filename = 'flbp-local.sqlite' }) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.workspaceId = workspaceId;
    this.filename = path.join(dataDir, filename);
    this.db = new DatabaseSync(this.filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS current_workspace (
        workspace_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        operation_id TEXT NOT NULL,
        state_json TEXT NOT NULL,
        public_state_json TEXT NOT NULL,
        checksum TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cloud_updated_at TEXT,
        primary_epoch INTEGER
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        operation_id TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        state_json TEXT NOT NULL,
        public_state_json TEXT NOT NULL,
        checksum TEXT NOT NULL,
        created_at TEXT NOT NULL,
        synced_at TEXT,
        UNIQUE(workspace_id, version)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        operation_id TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        synced_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(workspace_id, synced_at, id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_version ON snapshots(workspace_id, version DESC);
    `);
    const snapshotColumns = this.db.prepare('PRAGMA table_info(snapshots)').all();
    if (!snapshotColumns.some((column) => column.name === 'operation_checksum')) {
      this.db.exec('ALTER TABLE snapshots ADD COLUMN operation_checksum TEXT');
    }
  }

  close() {
    this.db.close();
  }

  async createSecondaryBackup(destinationDir, retention = 24) {
    const current = this.getCurrent();
    if (!current || !destinationDir) return { backedUp: false, version: current?.version || 0 };
    const resolvedDir = path.resolve(destinationDir);
    fs.mkdirSync(resolvedDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
    const baseName = `flbp-local-v${current.version}-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
    const partialPath = path.join(resolvedDir, `${baseName}.partial`);
    const finalPath = path.join(resolvedDir, `${baseName}.sqlite`);
    try {
      await backupDatabase(this.db, partialPath);
      const replica = new DatabaseSync(partialPath, { readOnly: true });
      try {
        const integrity = replica.prepare('PRAGMA integrity_check').all().map((row) => String(Object.values(row)[0] || ''));
        if (integrity.length !== 1 || integrity[0].toLowerCase() !== 'ok') {
          throw new Error(`Replica SQLite non integra: ${integrity.join('; ') || 'nessun esito'}`);
        }
        const copied = replica.prepare(`
          SELECT version, operation_id, checksum
          FROM current_workspace
          WHERE workspace_id = ?
        `).get(this.workspaceId);
        if (!copied
          || Number(copied.version) !== Number(current.version)
          || String(copied.operation_id || '') !== String(current.operationId || '')
          || String(copied.checksum || '') !== String(current.checksum || '')) {
          throw new Error('Replica SQLite leggibile ma non corrispondente a versione, operationId e checksum correnti.');
        }
      } finally {
        replica.close();
      }
      fs.renameSync(partialPath, finalPath);
      const completed = fs.readdirSync(resolvedDir)
        .filter((name) => /^flbp-local-v\d+-.+\.sqlite$/.test(name))
        .map((name) => ({ name, path: path.join(resolvedDir, name), modified: fs.statSync(path.join(resolvedDir, name)).mtimeMs }))
        .sort((a, b) => b.modified - a.modified);
      for (const expired of completed.slice(Math.max(2, Number(retention) || 24))) {
        fs.rmSync(expired.path, { force: true });
      }
      this.setMeta('last_secondary_backup_at', nowIso());
      this.setMeta('last_secondary_backup_version', String(current.version));
      return { backedUp: true, verified: true, version: current.version, checksum: current.checksum, operationId: current.operationId, filename: finalPath };
    } catch (error) {
      try { fs.rmSync(partialPath, { force: true }); } catch { /* ignore cleanup */ }
      throw error;
    }
  }

  getMeta(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key);
    return row ? row.value : fallback;
  }

  setMeta(key, value) {
    this.db.prepare('INSERT INTO metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
  }

  isActive() {
    return this.getMeta('active', '0') === '1';
  }

  setActive(active, epoch = null) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.setMeta('active', active ? '1' : '0');
      if (epoch != null) {
        this.setMeta('primary_epoch', String(epoch));
        this.db.prepare('UPDATE current_workspace SET primary_epoch = ? WHERE workspace_id = ?').run(Number(epoch), this.workspaceId);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getTransitionState() {
    return this.getMeta('transition_state', 'idle') || 'idle';
  }

  setTransitionState(state) {
    this.setMeta('transition_state', String(state || 'idle'));
  }

  getAdminWriterLease(nowMs = Date.now()) {
    let lease = null;
    try {
      lease = parseJson(this.getMeta('admin_writer_lease', '{}'));
    } catch {
      lease = null;
    }
    if (!lease?.holderId || Number(lease.expiresAt || 0) <= nowMs) {
      if (lease?.holderId) this.setMeta('admin_writer_lease', '{}');
      return null;
    }
    return {
      holderId: String(lease.holderId),
      holderLabel: String(lease.holderLabel || 'Finestra Admin'),
      acquiredAt: String(lease.acquiredAt || nowIso()),
      expiresAt: Number(lease.expiresAt),
    };
  }

  acquireAdminWriterLease({ holderId, holderLabel, takeover = false, ttlMs = 90_000 }) {
    const safeHolderId = String(holderId || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(safeHolderId)) {
      throw Object.assign(new Error('holderId Admin locale non valido.'), { statusCode: 400, code: 'FLBP_INVALID_HOLDER' });
    }
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.getAdminWriterLease(now);
      if (current && current.holderId !== safeHolderId && !takeover) {
        this.db.exec('COMMIT');
        return { acquired: false, holder_id: current.holderId, holder_label: current.holderLabel, acquired_at: current.acquiredAt, expires_at: new Date(current.expiresAt).toISOString() };
      }
      const next = {
        holderId: safeHolderId,
        holderLabel: String(holderLabel || current?.holderLabel || 'Finestra Admin').slice(0, 160),
        acquiredAt: current?.holderId === safeHolderId ? current.acquiredAt : nowIso(),
        expiresAt: now + Math.max(30_000, Math.min(Number(ttlMs) || 90_000, 300_000)),
      };
      this.setMeta('admin_writer_lease', json(next));
      this.db.exec('COMMIT');
      return { acquired: true, holder_id: next.holderId, holder_label: next.holderLabel, acquired_at: next.acquiredAt, expires_at: new Date(next.expiresAt).toISOString() };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
      throw error;
    }
  }

  releaseAdminWriterLease(holderId) {
    const current = this.getAdminWriterLease();
    if (!current || current.holderId !== String(holderId || '').trim()) return { released: false };
    this.setMeta('admin_writer_lease', '{}');
    return { released: true };
  }

  requireAdminWriterLease(holderId) {
    const current = this.getAdminWriterLease();
    if (!current || current.holderId !== String(holderId || '').trim()) {
      throw Object.assign(new Error('Questa finestra Admin non possiede il controllo di scrittura locale.'), {
        statusCode: 423,
        code: 'FLBP_LEASE_READONLY',
      });
    }
    return current;
  }

  getCurrent() {
    const row = this.db.prepare('SELECT * FROM current_workspace WHERE workspace_id = ?').get(this.workspaceId);
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      version: Number(row.version),
      operationId: row.operation_id,
      state: parseJson(row.state_json),
      publicState: parseJson(row.public_state_json),
      checksum: row.checksum,
      updatedAt: row.updated_at,
      cloudUpdatedAt: row.cloud_updated_at || null,
      primaryEpoch: row.primary_epoch == null ? null : Number(row.primary_epoch),
    };
  }

  getSnapshotByOperationId(operationId) {
    const row = this.db.prepare(`
      SELECT workspace_id, version, operation_id, state_json, public_state_json, checksum, operation_checksum, created_at
      FROM snapshots
      WHERE workspace_id = ? AND operation_id = ?
    `).get(this.workspaceId, String(operationId || '').trim());
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      version: Number(row.version),
      operationId: row.operation_id,
      state: parseJson(row.state_json),
      publicState: parseJson(row.public_state_json),
      checksum: row.checksum,
      operationChecksum: row.operation_checksum || null,
      updatedAt: row.created_at,
      cloudUpdatedAt: null,
      primaryEpoch: Number.parseInt(this.getMeta('primary_epoch', '0'), 10) || 0,
    };
  }

  pendingOutboxCount() {
    const row = this.db.prepare('SELECT count(*) AS count FROM outbox WHERE workspace_id = ? AND synced_at IS NULL').get(this.workspaceId);
    return Number(row?.count || 0);
  }

  pendingOutboxStats() {
    const row = this.db.prepare(`
      SELECT count(*) AS count, coalesce(sum(length(payload_json)), 0) AS bytes
      FROM outbox WHERE workspace_id = ? AND synced_at IS NULL
    `).get(this.workspaceId);
    return { count: Number(row?.count || 0), bytes: Number(row?.bytes || 0) };
  }

  validateCloudSnapshotImport({ state, publicState: _publicState, version = 0 }) {
    const current = this.getCurrent();
    const normalizedPublicState = sanitizeAppStateForPublic(state);
    const incomingVersion = Math.max(Number(version || 0), 1);
    const incomingChecksum = checksum(json(state), json(normalizedPublicState));
    if (current) {
      if (this.pendingOutboxCount() > 0) throw new Error('Import cloud bloccato: il server locale contiene operazioni non ancora sincronizzate.');
      if (incomingVersion < current.version) {
        throw Object.assign(new Error(`Import cloud bloccato: versione cloud ${incomingVersion} precedente alla versione locale ${current.version}.`), { code: 'FLBP_DB_CONFLICT' });
      }
      if (incomingVersion === current.version) {
        // Supabase stores JSON as jsonb and may return object keys in a different
        // order. Raw JSON checksums would therefore report a false conflict even
        // when both snapshots are semantically identical. Arrays intentionally
        // remain order-sensitive.
        const currentSemanticChecksum = semanticChecksum(current.state, sanitizeAppStateForPublic(current.state));
        const incomingSemanticChecksum = semanticChecksum(state, normalizedPublicState);
        if (incomingSemanticChecksum !== currentSemanticChecksum) {
          throw Object.assign(new Error(`Import cloud bloccato: la versione ${incomingVersion} contiene dati diversi dal DB locale.`), { code: 'FLBP_DB_CONFLICT' });
        }
      }
    }
    return { current, normalizedPublicState, incomingVersion, incomingChecksum };
  }

  importCloudSnapshot({ state, publicState, updatedAt = null, version = 0, operationId = null }) {
    const { current, normalizedPublicState, incomingVersion } = this.validateCloudSnapshotImport({ state, publicState, version });
    if (current && incomingVersion === current.version) {
      if (updatedAt) {
        this.db.prepare('UPDATE current_workspace SET cloud_updated_at = ? WHERE workspace_id = ?').run(updatedAt, this.workspaceId);
      }
      return { ...this.getCurrent(), idempotent: true, imported: false };
    }
    const opId = operationId || `cloud-import-${crypto.randomUUID()}`;
    return this.#commit({
      state,
      publicState: normalizedPublicState,
      operationId: opId,
      baseVersion: current?.version ?? null,
      source: 'cloud-import',
      kind: 'cloud-import',
      operationPayload: { updatedAt },
      force: true,
      requestedVersion: incomingVersion,
      cloudUpdatedAt: updatedAt,
      enqueue: false,
    });
  }

  commitSnapshot({ state, publicState, operationId, baseVersion, force = false, source = 'admin' }) {
    const current = this.getCurrent();
    const normalizedPublicState = sanitizeAppStateForPublic(state);
    let patchPayload = null;
    if (current) {
      try {
        patchPayload = {
          statePatch: buildStatePatch(current.state, state),
          publicStatePatch: buildStatePatch(current.publicState, normalizedPublicState),
        };
      } catch {
        // Unusual JSON key shapes fall back to the already supported full snapshot.
      }
    }
    const patchJson = patchPayload ? json(patchPayload) : '';
    const usePatch = !!patchPayload
      && patchPayload.statePatch.length + patchPayload.publicStatePatch.length <= MAX_PATCH_OPERATIONS
      && Buffer.byteLength(patchJson, 'utf8') <= MAX_PATCH_BYTES;
    return this.#commit({
      state,
      publicState: normalizedPublicState,
      operationId,
      baseVersion,
      force,
      source,
      kind: usePatch ? 'state-patch' : 'workspace-snapshot',
      operationPayload: usePatch ? patchPayload : { state, publicState: normalizedPublicState },
      idempotencyKind: 'workspace-snapshot',
      idempotencyPayload: { state, publicState: normalizedPublicState },
    });
  }

  commitMatchPatch({ tournamentId, matchId, matches, operationId, source = 'referee' }) {
    const existing = this.getSnapshotByOperationId(operationId);
    const operationPayload = { tournamentId, matchId, matches };
    if (existing) {
      const requestedChecksum = operationChecksum('match-result', operationPayload);
      if (existing.operationChecksum && existing.operationChecksum !== requestedChecksum) {
        throw Object.assign(new Error('operationId già usato con un referto diverso.'), { statusCode: 409, code: 'FLBP_OPERATION_COLLISION' });
      }
      return { ...existing, idempotent: true };
    }
    const current = this.getCurrent();
    if (!current) throw new Error('Snapshot locale non inizializzato');
    const patched = applyMatchResultPatch({
      state: current.state,
      publicState: current.publicState,
      tournamentId,
      matchId,
      matches,
    });
    patched.publicState = sanitizeAppStateForPublic(patched.state);
    return this.#commit({
      ...patched,
      operationId,
      baseVersion: current.version,
      source,
      kind: 'match-result',
      operationPayload,
    });
  }

  #commit({ state, publicState, operationId, baseVersion, source, kind, operationPayload, idempotencyKind = kind, idempotencyPayload = operationPayload, force = false, requestedVersion = null, cloudUpdatedAt = null, enqueue = true }) {
    if (!operationId || !String(operationId).trim()) throw new Error('operationId obbligatorio');
    const safeOperationId = String(operationId).trim();
    const existing = this.getSnapshotByOperationId(safeOperationId);
    const requestedOperationChecksum = operationChecksum(idempotencyKind, idempotencyPayload);
    if (existing) {
      if (existing.operationChecksum && existing.operationChecksum !== requestedOperationChecksum) {
        throw Object.assign(new Error('operationId già usato con un payload diverso.'), { statusCode: 409, code: 'FLBP_OPERATION_COLLISION' });
      }
      return { ...existing, idempotent: true };
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const currentRow = this.db.prepare('SELECT version FROM current_workspace WHERE workspace_id = ?').get(this.workspaceId);
      const currentVersion = currentRow ? Number(currentRow.version) : 0;
      if (!force && baseVersion != null && Number(baseVersion) !== currentVersion) {
        throw new VersionConflictError(currentVersion);
      }
      if (!force && baseVersion == null && currentRow) {
        throw new VersionConflictError(currentVersion);
      }

      const nextVersion = requestedVersion == null ? currentVersion + 1 : Number(requestedVersion);
      const stateJson = json(state);
      const publicStateJson = json(publicState);
      const digest = checksum(stateJson, publicStateJson);
      const createdAt = nowIso();
      const primaryEpochRaw = this.getMeta('primary_epoch', '0');
      const primaryEpoch = Number.parseInt(primaryEpochRaw, 10) || 0;

      this.db.prepare(`
        INSERT INTO snapshots(workspace_id, version, operation_id, source, state_json, public_state_json, checksum, operation_checksum, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(this.workspaceId, nextVersion, safeOperationId, source, stateJson, publicStateJson, digest, requestedOperationChecksum, createdAt);

      this.db.prepare(`
        INSERT INTO current_workspace(workspace_id, version, operation_id, state_json, public_state_json, checksum, updated_at, cloud_updated_at, primary_epoch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          version=excluded.version,
          operation_id=excluded.operation_id,
          state_json=excluded.state_json,
          public_state_json=excluded.public_state_json,
          checksum=excluded.checksum,
          updated_at=excluded.updated_at,
          cloud_updated_at=coalesce(excluded.cloud_updated_at, current_workspace.cloud_updated_at),
          primary_epoch=excluded.primary_epoch
      `).run(this.workspaceId, nextVersion, safeOperationId, stateJson, publicStateJson, digest, createdAt, cloudUpdatedAt, primaryEpoch);

      if (enqueue) {
        this.db.prepare(`
          INSERT INTO outbox(workspace_id, operation_id, version, kind, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(this.workspaceId, safeOperationId, nextVersion, kind, json(operationPayload), createdAt);
      }
      this.db.exec('COMMIT');
      return { ...this.getCurrent(), idempotent: false };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listPendingOutbox(limit = 100) {
    return this.db.prepare(`
      SELECT id, workspace_id, operation_id, version, kind, payload_json, created_at, attempts
      FROM outbox
      WHERE workspace_id = ? AND synced_at IS NULL
      ORDER BY id ASC LIMIT ?
    `).all(this.workspaceId, Math.max(1, Math.min(Number(limit) || 100, 500))).map((row) => ({
      id: Number(row.id),
      workspaceId: row.workspace_id,
      operationId: row.operation_id,
      version: Number(row.version),
      kind: row.kind,
      payload: parseJson(row.payload_json),
      createdAt: row.created_at,
      attempts: Number(row.attempts),
    }));
  }

  listPendingOutboxBatch({ maxOperations = 25, maxBytes = 512 * 1024 } = {}) {
    const candidates = this.listPendingOutbox(Math.max(1, Math.min(Number(maxOperations) || 25, 100)));
    const selected = [];
    let bytes = 0;
    for (const row of candidates) {
      const rowBytes = Buffer.byteLength(json(row.payload), 'utf8');
      if (selected.length && bytes + rowBytes > Math.max(1, Number(maxBytes) || 512 * 1024)) break;
      selected.push(row);
      bytes += rowBytes;
    }
    return selected;
  }

  markOutboxSynced(ids) {
    const statement = this.db.prepare('UPDATE outbox SET synced_at = ?, last_error = NULL WHERE id = ?');
    const syncedAt = nowIso();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of ids) statement.run(syncedAt, id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  markOutboxSyncedThroughVersion(version) {
    const syncedAt = nowIso();
    this.db.prepare(`
      UPDATE outbox SET synced_at = ?, last_error = NULL
      WHERE workspace_id = ? AND synced_at IS NULL AND version <= ?
    `).run(syncedAt, this.workspaceId, Number(version || 0));
  }

  markOutboxFailed(ids, error) {
    const statement = this.db.prepare('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?');
    for (const id of ids) statement.run(String(error || '').slice(0, 2000), id);
  }

  markSnapshotSynced(version, cloudUpdatedAt) {
    const syncedAt = nowIso();
    this.db.prepare('UPDATE snapshots SET synced_at = ? WHERE workspace_id = ? AND version = ?').run(syncedAt, this.workspaceId, version);
    this.db.prepare('UPDATE current_workspace SET cloud_updated_at = ? WHERE workspace_id = ?').run(cloudUpdatedAt || syncedAt, this.workspaceId);
    this.setMeta('last_backup_at', syncedAt);
  }

  pruneHistory({ retentionDays = 90, minVersions = 2_000 } = {}) {
    const days = Math.max(7, Math.min(Number(retentionDays) || 90, 3650));
    const minimum = Math.max(100, Math.min(Number(minVersions) || 2_000, 100_000));
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const maxRow = this.db.prepare('SELECT max(version) AS version FROM snapshots WHERE workspace_id = ?').get(this.workspaceId);
    const keepFromVersion = Math.max(0, Number(maxRow?.version || 0) - minimum + 1);
    const result = this.db.prepare(`
      DELETE FROM snapshots
      WHERE workspace_id = ?
        AND created_at < ?
        AND version < ?
        AND version <> coalesce((SELECT version FROM current_workspace WHERE workspace_id = ?), -1)
        AND version NOT IN (
          SELECT version FROM outbox WHERE workspace_id = ? AND synced_at IS NULL
        )
    `).run(this.workspaceId, cutoff, keepFromVersion, this.workspaceId, this.workspaceId);
    this.db.prepare(`
      DELETE FROM outbox
      WHERE workspace_id = ? AND synced_at IS NOT NULL AND synced_at < ? AND version < ?
    `).run(this.workspaceId, cutoff, keepFromVersion);
    this.setMeta('last_history_prune_at', nowIso());
    return { prunedSnapshots: Number(result.changes || 0), cutoff, keepFromVersion };
  }

  status() {
    const current = this.getCurrent();
    return {
      active: this.isActive(),
      workspaceId: this.workspaceId,
      version: current?.version ?? null,
      updatedAt: current?.updatedAt ?? null,
      cloudUpdatedAt: current?.cloudUpdatedAt ?? null,
      checksum: current?.checksum ?? null,
      pendingOperations: this.pendingOutboxCount(),
      primaryEpoch: Number.parseInt(this.getMeta('primary_epoch', '0'), 10) || null,
      transition: this.getTransitionState(),
      lastBackupAt: this.getMeta('last_backup_at'),
      lastPublicLiveAt: this.getMeta('last_public_live_at'),
      lastPublicLiveVersion: Number(this.getMeta('last_public_live_version', '0')) || null,
      lastNormalizedSyncAt: this.getMeta('last_normalized_sync_at'),
      lastNormalizedSyncVersion: Number(this.getMeta('last_normalized_sync_version', '0')) || null,
      lastSecondaryBackupAt: this.getMeta('last_secondary_backup_at'),
      lastSecondaryBackupVersion: Number(this.getMeta('last_secondary_backup_version', '0')) || null,
      adminWriterLease: this.getAdminWriterLease(),
      lastHistoryPruneAt: this.getMeta('last_history_prune_at'),
      databaseFile: this.filename,
    };
  }
}
