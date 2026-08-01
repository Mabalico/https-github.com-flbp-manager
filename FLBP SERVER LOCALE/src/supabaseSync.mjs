import crypto from 'node:crypto';
import { applyMatchResultPatch } from './statePatch.mjs';

const nowIso = () => new Date().toISOString();

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
    this.epoch = Number(store.getMeta('primary_epoch', '0')) || null;
    this.syncInFlight = null;
    this.syncRequested = false;
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
      operationId: privateRow.last_operation_id || null,
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

  async activate(snapshot) {
    if (!this.config.publicUrl) throw new Error('FLBP_LOCAL_PUBLIC_URL non configurato: attiva prima il tunnel HTTPS.');
    if (!snapshot?.state || !snapshot?.publicState) throw new Error('Snapshot cloud verificabile mancante: attivazione locale rifiutata.');
    const out = await this.rpc('flbp_local_activate_data_plane', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_base_url: this.config.publicUrl,
      p_expected_cloud_version: Number(snapshot.cloudBaseVersion ?? snapshot.version ?? 0),
      p_expected_cloud_operation_id: snapshot.cloudBaseOperationId ?? null,
      p_expected_cloud_state: snapshot.cloudBaseState ?? snapshot.state,
      p_expected_public_state: snapshot.cloudBasePublicState ?? snapshot.publicState,
      p_expected_plane_epoch: Number(snapshot.sourcePlaneEpoch || 0),
      p_expected_recovered_version: Number(snapshot.version || 0),
      p_ttl_seconds: this.config.leaseTtlSeconds,
    });
    this.epoch = Number(out?.epoch || 0);
    if (!this.epoch) throw new Error('Supabase non ha restituito un epoch di leadership valido.');
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
    if (this.syncInFlight) await this.syncInFlight;
    const current = this.store.getCurrent();
    if (!current) throw new Error('Snapshot locale non inizializzato: disattivazione rifiutata.');
    const out = await this.rpc('flbp_local_deactivate_data_plane', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_state: current.state,
      p_public_state: current.publicState,
      p_version: current.version,
      p_operation_id: current.operationId,
    });
    if (!out?.deactivated) throw new Error('Il coordinatore non ha accettato la disattivazione: leadership cambiata.');
    const updatedAt = out?.updated_at || nowIso();
    this.store.markSnapshotSynced(current.version, updatedAt);
    this.store.markOutboxSyncedThroughVersion(current.version);
    this.store.setActive(false);
    return out;
  }

  async syncOutbox() {
    if (!this.isConfigured()) return { synced: 0 };
    const rows = this.store.listPendingOutbox(100);
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
      const result = await this.rpc('flbp_local_append_operations', {
        p_workspace_id: this.config.workspaceId,
        p_node_id: this.nodeId,
        p_epoch: this.epoch,
        p_operations: operations,
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

  async backupSnapshot() {
    if (!this.isConfigured()) return { backedUp: false, reason: 'not-configured' };
    const current = this.store.getCurrent();
    if (!current) return { backedUp: false, reason: 'empty' };
    if (!this.epoch) this.epoch = Number(this.store.getMeta('primary_epoch', '0')) || null;
    const out = await this.rpc('flbp_local_backup_data_plane', {
      p_workspace_id: this.config.workspaceId,
      p_node_id: this.nodeId,
      p_epoch: this.epoch,
      p_state: current.state,
      p_public_state: current.publicState,
      p_version: current.version,
      p_operation_id: current.operationId,
    });
    const updatedAt = out?.updated_at || nowIso();
    this.store.markSnapshotSynced(current.version, updatedAt);
    await this.syncOutbox();
    return { backedUp: true, version: current.version, updatedAt };
  }

  scheduleOutboxSync() {
    if (!this.isConfigured()) return null;
    this.syncRequested = true;
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = Promise.resolve()
      .then(async () => {
        while (this.syncRequested) {
          this.syncRequested = false;
          let result;
          do {
            result = await this.syncOutbox();
          } while (Number(result?.synced || 0) >= 100);
        }
      })
      .catch(() => null)
      .finally(() => {
        this.syncInFlight = null;
        // Una commit può arrivare tra l'ultimo controllo e il finally.
        if (this.syncRequested) queueMicrotask(() => this.scheduleOutboxSync());
      });
    return this.syncInFlight;
  }
}
