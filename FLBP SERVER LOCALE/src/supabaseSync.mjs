import crypto from 'node:crypto';
import { applyMatchResultPatch } from './statePatch.mjs';
import { applyStatePatch } from './stateDelta.mjs';
import { buildPublicWorkspaceLiveState } from './publicSanitizer.mjs';

const nowIso = () => new Date().toISOString();

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }
  return value;
};

const canonicalSnapshotChecksum = (state, publicState) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalize(state || {})))
  .update('\n')
  .update(JSON.stringify(canonicalize(publicState || {})))
  .digest('hex');

const storedEpoch = (store) => Number(
  String(store.getMeta('pending_primary_epoch', '') || '').trim()
  || String(store.getMeta('primary_epoch', '0') || '0').trim(),
) || null;

const errorBody = async (response) => {
  try {
    return (await response.text()) || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

export const buildSupabaseServerHeaders = (key, extra = {}) => {
  const normalizedKey = String(key || '').trim();
  const headers = {
    apikey: normalizedKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Opaque sb_secret keys authenticate through apikey only. Legacy
  // service_role JWTs still require the Bearer header for PostgREST.
  if (normalizedKey && !normalizedKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${normalizedKey}`;
  }
  return { ...headers, ...extra };
};

export const replayCloudOperationJournal = (snapshot, rows) => {
  let state = structuredClone(snapshot?.state || {});
  let publicState = structuredClone(snapshot?.publicState || snapshot?.state || {});
  let version = Number(snapshot?.version || 0);
  let operationId = snapshot?.operationId || null;
  let updatedAt = snapshot?.updatedAt || null;
  let recoveredOperations = 0;

  for (const row of rows || []) {
    const rowVersion = Number(row?.local_version || 0);
    if (rowVersion <= version) continue;
    if (rowVersion !== version + 1) {
      throw new Error(`Journal remoto incompleto: attesa versione ${version + 1}, trovata ${rowVersion}.`);
    }
    const payload = row?.payload || {};
    if (row.operation_kind === 'workspace-snapshot') {
      if (!payload.state || !payload.publicState) throw new Error(`Snapshot mancante nel journal alla versione ${rowVersion}.`);
      state = structuredClone(payload.state);
      publicState = structuredClone(payload.publicState);
    } else if (row.operation_kind === 'state-patch') {
      state = applyStatePatch(state, payload.statePatch);
      publicState = applyStatePatch(publicState, payload.publicStatePatch);
    } else if (row.operation_kind === 'match-result') {
      const patched = applyMatchResultPatch({
        state,
        publicState,
        tournamentId: payload.tournamentId,
        matchId: payload.matchId,
        matches: payload.matches,
      });
      state = patched.state;
      publicState = patched.publicState;
    } else {
      throw new Error(`Operazione journal non supportata: ${String(row.operation_kind || 'sconosciuta')}.`);
    }
    version = rowVersion;
    operationId = row.operation_id || operationId;
    updatedAt = row.created_at || row.received_at || updatedAt;
    recoveredOperations += 1;
  }

  return { ...snapshot, state, publicState, version, operationId, updatedAt, recoveredOperations };
};

export class SupabaseSync {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.nodeId = config.nodeId || store.getMeta('node_id') || `windows-${crypto.randomUUID()}`;
    store.setMeta('node_id', this.nodeId);
    this.epoch = storedEpoch(store);
    this.syncInFlight = null;
    this.syncRequested = false;
    this.syncTimer = null;
    this.livePublishInFlight = null;
    this.livePublishRequested = false;
    this.livePublishForce = false;
  }

  isConfigured() {
    return !!(this.config.supabaseUrl && this.config.supabaseServiceRoleKey);
  }

  headers(extra = {}) {
    return buildSupabaseServerHeaders(this.config.supabaseServiceRoleKey, extra);
  }

  rest(path) {
    return `${this.config.supabaseUrl}/rest/v1/${path}`;
  }

  async rpc(name, body) {
    if (!this.isConfigured()) throw new Error('Supabase non configurato nel server locale');
    const response = await fetch(this.rest(`rpc/${name}`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await errorBody(response));
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async pullCloudSnapshot() {
    if (!this.isConfigured()) return null;
    const workspace = encodeURIComponent(this.config.workspaceId);
    const [privateResponse, publicResponse, planeResponse] = await Promise.all([
      fetch(this.rest(`workspace_state?workspace_id=eq.${workspace}&select=state,updated_at,version,last_operation_id,primary_epoch&limit=1`), { headers: this.headers() }),
      fetch(this.rest(`public_workspace_state?workspace_id=eq.${workspace}&select=state,updated_at&limit=1`), { headers: this.headers() }),
      fetch(this.rest(`flbp_data_plane?workspace_id=eq.${workspace}&select=mode,epoch&limit=1`), { headers: this.headers() }),
    ]);
    if (!privateResponse.ok) throw new Error(await errorBody(privateResponse));
    if (!publicResponse.ok) throw new Error(await errorBody(publicResponse));
    if (!planeResponse.ok) throw new Error(await errorBody(planeResponse));
    const privateRows = await privateResponse.json();
    const publicRows = await publicResponse.json();
    const planeRows = await planeResponse.json();
    const privateRow = privateRows?.[0];
    if (!privateRow?.state) return null;
    const basePublicState = publicRows?.[0]?.state || privateRow.state;
    const sourcePlaneEpoch = Number(planeRows?.[0]?.epoch || 0);
    const snapshot = {
      state: privateRow.state,
      publicState: basePublicState,
      updatedAt: privateRow.updated_at || publicRows?.[0]?.updated_at || null,
      version: Number(privateRow.version || 0),
      operationId: privateRow.last_operation_id || `legacy-cloud-v${Number(privateRow.version || 0)}`,
      primaryEpoch: privateRow.primary_epoch == null ? null : Number(privateRow.primary_epoch),
      cloudBaseVersion: Number(privateRow.version || 0),
      cloudBaseOperationId: privateRow.last_operation_id || null,
      cloudBaseState: privateRow.state,
      cloudBasePublicState: basePublicState,
      sourcePlaneEpoch,
    };
    const planeEpoch = sourcePlaneEpoch;
    if (!planeEpoch) return snapshot;

    const journalResponse = await fetch(this.rest(
      `flbp_local_operation_log?workspace_id=eq.${workspace}`
      + `&primary_epoch=eq.${planeEpoch}`
      + `&local_version=gt.${snapshot.version}`
      + '&select=operation_id,local_version,operation_kind,payload,created_at,received_at'
      + '&order=local_version.asc,received_at.asc',
    ), { headers: this.headers() });
    if (!journalResponse.ok) throw new Error(await errorBody(journalResponse));
    const journalRows = await journalResponse.json();
    return replayCloudOperationJournal({ ...snapshot, primaryEpoch: planeEpoch }, journalRows);
  }

  async verifyCloudSnapshot(expected = this.store.getCurrent()) {
    if (!expected) throw new Error('Snapshot locale mancante durante la verifica cloud.');
    const cloud = await this.pullCloudSnapshot();
    const localChecksum = canonicalSnapshotChecksum(expected.state, expected.publicState);
    const cloudChecksum = canonicalSnapshotChecksum(cloud?.state, cloud?.publicState);
    const verified = !!cloud
      && Number(cloud.version || 0) === Number(expected.version)
      && String(cloud.operationId || '') === String(expected.operationId || '')
      && cloudChecksum === localChecksum;
    return { verified, cloud, localChecksum, cloudChecksum };
  }

  async activate(snapshot) {
    if (!snapshot?.state || !snapshot?.publicState) throw new Error('Snapshot cloud verificabile mancante: attivazione locale rifiutata.');
    const localBaselineOperationId = snapshot.operationId || `legacy-cloud-v${Number(snapshot.version || 0)}`;
    snapshot.operationId = localBaselineOperationId;
    const predictedEpoch = Number(snapshot.sourcePlaneEpoch || 0) + 1;
    this.store.setMeta('pending_primary_epoch', String(predictedEpoch));
    const out = await this.rpc('flbp_local_activate_data_plane_v3', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_base_url: this.config.publicUrl || null,
      p_public_read_mode: this.config.publicUrl ? 'local' : 'cloud',
      p_expected_cloud_version: Number(snapshot.cloudBaseVersion ?? snapshot.version ?? 0),
      p_expected_cloud_operation_id: snapshot.cloudBaseOperationId ?? null,
      p_expected_cloud_state: snapshot.cloudBaseState ?? snapshot.state,
      p_expected_public_state: snapshot.cloudBasePublicState ?? snapshot.publicState,
      p_expected_plane_epoch: Number(snapshot.sourcePlaneEpoch || 0),
      p_expected_recovered_version: Number(snapshot.version || 0),
      p_local_baseline_operation_id: localBaselineOperationId,
      p_ttl_seconds: this.config.leaseTtlSeconds,
    });
    this.epoch = Number(out?.epoch || 0);
    if (!this.epoch) throw new Error('Supabase non ha restituito un epoch di leadership valido.');
    if (this.epoch !== predictedEpoch) throw new Error('Supabase ha restituito un epoch diverso da quello previsto: attivazione da riconciliare.');
    this.store.setMeta('pending_primary_epoch', String(this.epoch));
    this.store.setMeta('last_public_live_version', '0');
    this.store.setMeta('last_public_live_at', '');
    return out;
  }

  async heartbeat() {
    if (!this.store.isActive() || !this.epoch || !this.isConfigured()) return null;
    const out = await this.rpc('flbp_local_heartbeat_data_plane', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_ttl_seconds: this.config.leaseTtlSeconds,
    });
    if (!out?.accepted) {
      this.store.setTransitionState('leadership-revoked');
      this.store.setActive(false);
      throw new Error('Leadership locale revocata dal coordinatore Supabase. Il server è passato in standby.');
    }
    return out;
  }

  async deactivate() {
    if (!this.isConfigured()) {
      this.store.setActive(false);
      return { ok: true, cloud: false };
    }
    this.cancelScheduledOutboxSync();
    if (this.syncInFlight) await this.syncInFlight;
    const current = this.store.getCurrent();
    if (!current) throw new Error('Snapshot locale non inizializzato: disattivazione rifiutata.');
    const out = await this.rpc('flbp_local_deactivate_data_plane_v2', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_state: current.state,
      p_public_state: current.publicState,
      p_version: current.version,
      p_operation_id: current.operationId,
    });
    if (!out?.deactivated) throw new Error('Il coordinatore non ha accettato la disattivazione: leadership cambiata.');
    const reconciliation = await this.reconcileTransition();
    if (reconciliation?.action !== 'standby-cloud') {
      throw new Error('Supabase non ha confermato in modo verificabile il ritorno al cloud.');
    }
    const updatedAt = out?.updated_at || nowIso();
    this.store.markSnapshotSynced(current.version, updatedAt);
    this.store.markOutboxSyncedThroughVersion(current.version);
    this.store.setActive(false);
    return out;
  }

  async reconcileTransition() {
    if (!this.isConfigured()) throw new Error('Supabase non configurato: transizione non riconciliabile.');
    const current = this.store.getCurrent();
    if (!current) throw new Error('Snapshot locale mancante: transizione non riconciliabile.');
    if (!this.epoch) {
      this.epoch = storedEpoch(this.store);
    }
    if (!this.epoch) throw new Error('Epoch locale mancante: transizione non riconciliabile.');
    const transition = this.store.getTransitionState();
    const out = await this.rpc('flbp_local_reconcile_data_plane', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_local_version: current.version,
      p_local_operation_id: current.operationId,
      p_ttl_seconds: this.config.leaseTtlSeconds,
    });
    if (out?.action === 'resume-local' && out?.accepted) {
      if (String(out?.node_id || '') !== this.nodeId || Number(out?.epoch || 0) !== Number(this.epoch)) {
        throw new Error('Riconciliazione locale non verificabile: nodo o epoch non corrispondente. Scritture ancora bloccate.');
      }
      if (transition === 'activation-error' || transition === 'activating') {
        const cloud = await this.pullCloudSnapshot();
        if (!cloud) throw new Error('Snapshot cloud mancante durante il recupero attivazione.');
        this.store.validateCloudSnapshotImport(cloud);
        this.store.importCloudSnapshot(cloud);
      }
      this.store.setActive(true, this.epoch);
      this.store.setMeta('pending_primary_epoch', '');
      this.store.setTransitionState('idle');
      return out;
    }
    if (out?.action === 'standby-cloud' && out?.accepted) {
      const exactCloudCommit = String(out?.node_id || '') === this.nodeId
        && Number(out?.epoch || 0) === Number(this.epoch)
        && Number(out?.version || 0) === Number(current.version)
        && String(out?.operation_id || '') === String(current.operationId || '');
      if (!exactCloudCommit) {
        throw new Error('Riconciliazione cloud non verificabile: nodo, epoch, versione o operationId non corrispondente. Scritture ancora bloccate.');
      }
      const finalVerification = await this.verifyCloudSnapshot(current);
      if (!finalVerification.verified) {
        throw new Error('Riconciliazione cloud non verificata: checksum dello snapshot Supabase non corrispondente. Scritture ancora bloccate.');
      }
      this.store.markSnapshotSynced(current.version, nowIso());
      this.store.markOutboxSyncedThroughVersion(current.version);
      this.store.setActive(false, this.epoch);
      this.store.setMeta('pending_primary_epoch', '');
      this.store.setTransitionState('idle');
      return out;
    }
    this.store.setActive(false);
    this.store.setTransitionState('leadership-revoked');
    return out;
  }

  async pruneCloudHistory({ retentionDays = 90, minVersions = 2_000 } = {}) {
    if (!this.isConfigured() || !this.store.isActive()) return { ok: false, reason: 'inactive' };
    if (!this.epoch) this.epoch = Number(this.store.getMeta('primary_epoch', '0')) || null;
    return this.rpc('flbp_local_prune_workspace_history', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_retention_days: retentionDays,
      p_min_versions: minVersions,
    });
  }

  async syncOutbox() {
    if (!this.isConfigured()) return { synced: 0 };
    const rows = this.store.listPendingOutboxBatch({
      maxOperations: this.config.outboxBatchMaxOperations || 25,
      maxBytes: this.config.outboxBatchMaxBytes || 512 * 1024,
    });
    if (!rows.length) return { synced: 0 };
    const operations = rows.map((row) => ({
      operation_id: row.operationId,
      local_version: row.version,
      operation_kind: row.kind,
      payload: row.payload,
      created_at: row.createdAt,
    }));
    try {
      if (!this.epoch) this.epoch = Number(this.store.getMeta('primary_epoch', '0')) || null;
      if (!this.epoch) throw new Error('Epoch locale mancante: journal remoto non sincronizzato.');
      const current = this.store.getCurrent();
      const result = await this.rpc('flbp_local_append_operations_v2', {
        p_workspace_id: this.config.workspaceId,
        p_node_id: this.nodeId,
        p_epoch: this.epoch,
        p_operations: operations,
        p_state: current?.state || {},
      });
      if (!result?.ok || Number(result?.confirmed || 0) !== rows.length) {
        throw new Error(`Supabase non ha confermato tutte le operazioni (${Number(result?.confirmed || 0)}/${rows.length}).`);
      }
      this.store.markOutboxSynced(rows.map((row) => row.id));
      return {
        synced: rows.length,
        inserted: Number(result?.inserted || 0),
        idempotent: Number(result?.idempotent || 0),
        coveredBySnapshot: Number(result?.covered_by_snapshot || 0),
      };
    } catch (error) {
      this.store.markOutboxFailed(rows.map((row) => row.id), error?.message || error);
      throw error;
    }
  }

  async syncLiveNormalizedSnapshot() {
    if (!this.isConfigured() || !this.store.isActive()) return { ok: false, reason: 'inactive' };
    const current = this.store.getCurrent();
    const hasLiveTournament = !!current?.state?.tournament;
    const hasArchivedTournaments = Array.isArray(current?.state?.tournamentHistory)
      && current.state.tournamentHistory.length > 0;
    if (!hasLiveTournament && !hasArchivedTournaments) {
      return { ok: true, skipped: true, reason: 'no_tournaments' };
    }
    if (!this.epoch) this.epoch = Number(this.store.getMeta('primary_epoch', '0')) || null;
    if (!this.epoch) throw new Error('Epoch locale mancante: mirror normalizzato non sincronizzato.');
    const result = await this.rpc('flbp_local_sync_live_normalized', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_state: current.state,
    });
    if (!result?.ok) throw new Error('Supabase non ha confermato il mirror normalizzato dei tornei.');
    this.store.setMeta('last_normalized_sync_at', nowIso());
    this.store.setMeta('last_normalized_sync_version', String(current.version));
    return { ...result, version: current.version };
  }

  async backupSnapshot() {
    if (!this.isConfigured()) return { backedUp: false, reason: 'not-configured' };
    const current = this.store.getCurrent();
    if (!current) return { backedUp: false, reason: 'empty' };
    if (!this.epoch) this.epoch = Number(this.store.getMeta('primary_epoch', '0')) || null;
    const out = await this.rpc('flbp_local_backup_data_plane_v2', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_state: current.state,
      p_public_state: current.publicState,
      p_version: current.version,
      p_operation_id: current.operationId,
    });
    const updatedAt = out?.updated_at || nowIso();
    // The full-backup RPC also touches the live row for backward compatibility;
    // immediately rewrite it through the compact live-state sanitizer.
    await this.publishLiveSnapshot({ force: true });
    const latestLocal = this.store.getCurrent();
    const verification = await this.verifyCloudSnapshot(latestLocal);
    if (!verification.verified) {
      throw new Error('Backup Supabase non verificato: versione, operationId o checksum non corrispondono al DB locale corrente.');
    }
    await this.syncLiveNormalizedSnapshot();
    this.store.markSnapshotSynced(latestLocal.version, updatedAt);
    this.store.markOutboxSyncedThroughVersion(latestLocal.version);
    return { backedUp: true, verified: true, version: latestLocal.version, operationId: latestLocal.operationId, checksum: verification.localChecksum, updatedAt };
  }

  publishLiveSnapshot({ force = false } = {}) {
    this.livePublishRequested = true;
    this.livePublishForce ||= force;
    if (this.livePublishInFlight) return this.livePublishInFlight;
    this.livePublishInFlight = Promise.resolve().then(async () => {
      let result = { published: false, reason: 'unchanged' };
      while (this.livePublishRequested) {
        this.livePublishRequested = false;
        const requestedForce = this.livePublishForce;
        this.livePublishForce = false;
        result = await this.publishLiveSnapshotOnce({ force: requestedForce });
      }
      return result;
    }).finally(() => {
      this.livePublishInFlight = null;
      if (this.livePublishRequested) queueMicrotask(() => void this.publishLiveSnapshot({ force: this.livePublishForce }));
    });
    return this.livePublishInFlight;
  }

  async publishLiveSnapshotOnce({ force = false } = {}) {
    if (!this.isConfigured() || !this.store.isActive()) return { published: false, reason: 'inactive' };
    const current = this.store.getCurrent();
    if (!current) return { published: false, reason: 'empty' };
    const lastVersion = Number(this.store.getMeta('last_public_live_version', '0')) || 0;
    if (!force && current.version <= lastVersion) return { published: false, reason: 'unchanged', version: current.version };
    if (!this.epoch) this.epoch = Number(this.store.getMeta('primary_epoch', '0')) || null;
    const out = await this.rpc('flbp_local_publish_live_data_plane', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_public_state: buildPublicWorkspaceLiveState(current.publicState),
      p_version: current.version,
      p_operation_id: current.operationId,
    });
    this.store.setMeta('last_public_live_version', String(current.version));
    this.store.setMeta('last_public_live_at', out?.updated_at || nowIso());
    return { published: true, version: current.version, updatedAt: out?.updated_at || null };
  }

  cancelScheduledOutboxSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }

  flushOutboxNow() {
    if (!this.isConfigured()) return null;
    this.cancelScheduledOutboxSync();
    this.syncRequested = true;
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = Promise.resolve()
      .then(async () => {
        while (this.syncRequested) {
          this.syncRequested = false;
          let result;
          do {
            result = await this.syncOutbox();
          } while (Number(result?.synced || 0) > 0 && this.store.pendingOutboxCount() > 0);
        }
      })
      .catch(() => null)
      .finally(() => {
        this.syncInFlight = null;
        // Una commit può arrivare tra l'ultimo controllo e il finally.
        if (this.syncRequested) queueMicrotask(() => this.flushOutboxNow());
      });
    return this.syncInFlight;
  }

  scheduleOutboxSync({ immediate = false } = {}) {
    if (!this.isConfigured()) return null;
    const stats = this.store.pendingOutboxStats();
    if (!stats.count) return this.syncInFlight;
    const shouldFlushNow = immediate
      || stats.count >= (this.config.outboxBatchMaxOperations || 25)
      || stats.bytes >= (this.config.outboxBatchMaxBytes || 512 * 1024);
    if (shouldFlushNow || this.syncInFlight) return this.flushOutboxNow();
    if (!this.syncTimer) {
      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        void this.flushOutboxNow();
      }, this.config.outboxFlushIntervalMs || 15_000);
    }
    return null;
  }
}
