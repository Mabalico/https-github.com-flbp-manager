// Logica attiva del "write lease" admin: acquisizione, heartbeat, takeover,
// rilascio. Lo stato osservabile vive in adminWriteLeaseState.ts.
//
// Funziona sia nel browser (AdminDashboard) sia headless (simulatore Node):
// usa i timer globali e guarda le API browser solo se esistono.

import { ensureFreshSupabaseSession, expireSupabaseAuthSession, getSupabaseConfig, getSupabaseSession, isRejectedSupabaseAuthSession, isSameSupabaseAuthSession, isSupabaseSessionPastExpiry } from './supabaseRest';
import { readAdminLeaseInfo, setAdminLeaseInfo, type AdminLeaseRecovery } from './adminWriteLeaseState';
import {
  acquireLocalAdminWriteLease,
  DATA_PLANE_CHANGE_LS_KEY,
  DISCOVERY_FAILED_REASON,
  heartbeatLocalAdminWriteLease,
  releaseLocalAdminWriteLease,
  resolveDataPlane,
  type DataPlaneRoute,
} from './dataPlaneClient';

const HEARTBEAT_MS = 25_000;
const TTL_SECONDS = 90;
const HOLDER_SESSION_KEY = 'flbp_admin_lease_session_v1';

let inited = false;
let timer: ReturnType<typeof setInterval> | null = null;
let holderId: string | null = null;
let sessionUuid: string | null = null;
let holderLabel = 'Finestra Admin';
let pagehideInstalled = false;
let activeBackend: 'cloud' | 'local' | null = null;
let activeLocalRoute: DataPlaneRoute | null = null;

const makeUuid = (): string => {
  try {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fallback sotto
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
};

const readNativeWindowUuid = (): string | null => {
  try {
    const value = String((globalThis as any).__FLBP_NATIVE_WRITER_WINDOW_ID || '').trim();
    return /^[a-zA-Z0-9_-]{16,128}$/.test(value) ? value : null;
  } catch {
    return null;
  }
};

const readSessionUuid = (): string => {
  // The Windows host injects a per-window id before every document loads.
  // Unlike sessionStorage it survives WebView2 Reload/Navigate, while a
  // second native window/process receives a different id.
  const nativeWindowUuid = readNativeWindowUuid();
  if (nativeWindowUuid) {
    try { sessionStorage.setItem(HOLDER_SESSION_KEY, nativeWindowUuid); } catch { /* best effort */ }
    return nativeWindowUuid;
  }
  try {
    const stored = sessionStorage.getItem(HOLDER_SESSION_KEY);
    if (stored) return stored;
    const fresh = makeUuid();
    sessionStorage.setItem(HOLDER_SESSION_KEY, fresh);
    return fresh;
  } catch {
    return makeUuid();
  }
};

const deriveDefaultLabel = (): string => {
  try {
    if (readNativeWindowUuid()) return 'FLBP Manager Locale su Windows';
    const ua = String((globalThis as any).navigator?.userAgent || '');
    const browser = /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Safari\//.test(ua) ? 'Safari'
      : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows'
      : /Android/.test(ua) ? 'Android'
      : /iPhone|iPad/.test(ua) ? 'iPhone/iPad'
      : /Mac OS/.test(ua) ? 'Mac'
      : /Linux/.test(ua) ? 'Linux'
      : '';
    return os ? `${browser} su ${os}` : browser;
  } catch {
    return 'Finestra Admin';
  }
};

const isMissingLeaseRpc = (message: string): boolean =>
  message.includes('PGRST202') || message.includes('Could not find the function');

const isAbortLike = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return (error as any)?.name === 'AbortError' || message.includes('signal is aborted') || message.includes('aborterror');
};

class AdminLeaseSessionExpiredError extends Error {}

const leaseRpc = async (
  name: string,
  body: Record<string, unknown>,
  opts?: { release?: boolean; keepalive?: boolean }
): Promise<any> => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase non configurato');
  const current = opts?.release ? getSupabaseSession() : await ensureFreshSupabaseSession();
  if (!current || getSupabaseSession()?.accessToken !== current.accessToken || isSupabaseSessionPastExpiry(current)) {
    throw new AdminLeaseSessionExpiredError();
  }

  const send = async (token: string) => {
    const response = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(opts?.keepalive ? { keepalive: true } : {}),
    });
    return { response, text: await response.text() };
  };

  let { response, text } = await send(current.accessToken);
  if (!opts?.release && isRejectedSupabaseAuthSession(response.status, text)) {
    const stored = getSupabaseSession();
    const refreshed = !isSameSupabaseAuthSession(stored, current)
      ? null
      : stored?.accessToken !== current.accessToken ? stored : await ensureFreshSupabaseSession({ force: true });
    if (!refreshed || refreshed.accessToken === current.accessToken
      || getSupabaseSession()?.accessToken !== refreshed.accessToken || isSupabaseSessionPastExpiry(refreshed)) {
      throw new AdminLeaseSessionExpiredError();
    }
    ({ response, text } = await send(refreshed.accessToken));
    if (isRejectedSupabaseAuthSession(response.status, text)) {
      expireSupabaseAuthSession(refreshed);
      throw new AdminLeaseSessionExpiredError();
    }
  }
  if (!response.ok) throw new Error(text || `RPC ${name} HTTP ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const acquireOnce = async (takeover: boolean): Promise<{ acquired: boolean; out: any }> => {
  const cfg = getSupabaseConfig();
  const out = await leaseRpc('flbp_admin_acquire_write_lease', {
    p_workspace_id: cfg?.workspaceId || 'default',
    p_holder_id: holderId,
    p_holder_label: holderLabel,
    p_takeover: takeover,
    p_ttl_seconds: TTL_SECONDS,
  });
  return { acquired: !!out?.acquired, out };
};

const RECOVERY_MESSAGE = 'Data plane in recovery: impossibile acquisire il controllo Admin.';

const toRecovery = (out: any, fallbackEpoch: number | null): AdminLeaseRecovery => {
  const reason = String(out?.reason || '');
  const known = ['grace', 'missing_operations', 'local_active', 'epoch_changed', 'manual_recovery_required'];
  const epoch = Number(out?.epoch);
  return {
    reason: (known.includes(reason) ? reason : 'unavailable') as AdminLeaseRecovery['reason'],
    epoch: Number.isFinite(epoch) ? epoch : fallbackEpoch,
    leaseExpiredAt: out?.lease_expired_at || out?.lease_expires_at || null,
    reclaimAt: out?.reclaim_at || null,
    missingOperations: Math.max(0, Number(out?.missing_operations) || 0),
    lastMissingOperationAt: out?.last_missing_operation_at || null,
    lastBackupAt: out?.last_backup_at || null,
  };
};

const notifyDataPlaneReclaimed = () => {
  try {
    // Same signals as the manual failover: other tabs drop their cached route
    // and the next sync rebuilds the normalized projection from cloud state.
    localStorage.setItem('flbp_normalized_sync_required_v1', '1');
    localStorage.setItem(DATA_PLANE_CHANGE_LS_KEY, String(Date.now()));
  } catch {
    // This tab re-resolves the route right after the switch anyway.
  }
};

// A local tournament PC that stopped answering without closing local mode keeps
// the coordinator in recovery. Ask the database whether cloud authority can come
// back: it agrees only after the grace period, and only with the operations
// already in the cloud snapshot unless the Admin explicitly accepts the loss.
const tryReclaimCloud = async (route: DataPlaneRoute, acceptMissing: boolean): Promise<boolean> => {
  if (route.reason === DISCOVERY_FAILED_REASON) {
    // No answer at all: the PC is not involved, the check is retried on the next tick.
    setAdminLeaseInfo({ recovery: { reason: 'unreachable', epoch: route.epoch ?? null } });
    return false;
  }
  if (route.reason !== 'local_lease_expired' || route.epoch == null) {
    setAdminLeaseInfo({ recovery: { reason: 'unavailable', epoch: route.epoch ?? null } });
    return false;
  }
  const cfg = getSupabaseConfig();
  let out: any;
  try {
    out = await leaseRpc('flbp_admin_reclaim_cloud_data_plane', {
      p_workspace_id: cfg?.workspaceId || 'default',
      p_expected_epoch: route.epoch,
      p_accept_missing: acceptMissing,
    });
  } catch (error) {
    if (isMissingLeaseRpc(String((error as any)?.message || error || ''))) {
      setAdminLeaseInfo({ recovery: { reason: 'unavailable', epoch: route.epoch } });
      return false;
    }
    throw error;
  }
  if (out?.ok && out?.mode === 'cloud') {
    notifyDataPlaneReclaimed();
    setAdminLeaseInfo({ recovery: null });
    return true;
  }
  setAdminLeaseInfo({ recovery: toRecovery(out, route.epoch) });
  return false;
};

const acquireForCurrentPlane = async (takeover: boolean): Promise<{ acquired: boolean; out: any }> => {
  let route = await resolveDataPlane({ force: true });
  if (route.mode === 'recovery') {
    if (!(await tryReclaimCloud(route, false))) throw new Error(RECOVERY_MESSAGE);
    route = await resolveDataPlane({ force: true });
    if (route.mode === 'recovery') throw new Error(RECOVERY_MESSAGE);
  }
  if (readAdminLeaseInfo().recovery) setAdminLeaseInfo({ recovery: null });
  if (route.mode === 'local') {
    if (!holderId) throw new Error('Identità finestra Admin mancante.');
    const canHeartbeat = !takeover
      && activeBackend === 'local'
      && activeLocalRoute?.baseUrl === route.baseUrl
      && readAdminLeaseInfo().status === 'active';
    const out = canHeartbeat
      ? await heartbeatLocalAdminWriteLease(route, holderId)
      : await acquireLocalAdminWriteLease(route, {
        holderId,
        holderLabel,
        takeover,
      });
    activeBackend = 'local';
    activeLocalRoute = route;
    return { acquired: !!out?.acquired, out };
  }
  activeBackend = 'cloud';
  activeLocalRoute = null;
  return acquireOnce(takeover);
};

const tick = async (takeover = false): Promise<void> => {
  if (!inited || !holderId) return;
  const tickingHolder = holderId;
  const isCurrent = () => inited && holderId === tickingHolder;
  try {
    let { acquired, out } = await acquireForCurrentPlane(takeover);
    if (!isCurrent()) return;
    // Il detentore e' una vita precedente di QUESTA scheda (reload: stesso
    // sessionStorage, nonce diverso): riprendi il testimone senza chiedere.
    if (!acquired && sessionUuid && String(out?.holder_id || '').startsWith(`${sessionUuid}:`)) {
      ({ acquired, out } = await acquireForCurrentPlane(true));
      if (!isCurrent()) return;
    }
    if (acquired) {
      setAdminLeaseInfo({ status: 'active', holderId, otherLabel: null, otherSince: null, lastError: null });
    } else {
      setAdminLeaseInfo({
        status: 'passive',
        holderId,
        otherLabel: out?.holder_label || null,
        otherSince: out?.acquired_at || null,
        lastError: null,
      });
    }
  } catch (e: any) {
    if (!isCurrent()) return;
    if (e instanceof AdminLeaseSessionExpiredError) {
      setAdminLeaseInfo({ status: 'session-expired', lastError: null, recovery: null, otherLabel: null, otherSince: null });
      return;
    }
    const message = String(e?.message || e || '');
    if (isAbortLike(e)) {
      // Reload/pagehide can abort the obsolete request after the new page has
      // already started. Keep the UI fail-closed while immediately asking the
      // current page to verify its own lease again instead of surfacing a
      // permanent, misleading write-authority error.
      // Se questa pagina era gia' il writer attivo, un singolo heartbeat
      // abortito non revoca la lease server (TTL 90 s). Mantieni l'interfaccia
      // operativa durante il retry breve: qualunque commit resta comunque
      // protetto e rifiutabile dal server tramite x-flbp-writer-id.
      const previous = readAdminLeaseInfo();
      if (previous.status === 'active') {
        setAdminLeaseInfo({ holderId, lastError: null });
      } else {
        setAdminLeaseInfo({ status: 'acquiring', holderId, lastError: null });
      }
      setTimeout(() => {
        if (isCurrent()) void tick(false);
      }, 300);
      return;
    }
    if (isMissingLeaseRpc(message)) {
      // DB senza la migration del lease: feature disattivata, nessun gating.
      stopTimer();
      inited = false;
      setAdminLeaseInfo({ status: 'off', holderId: null, otherLabel: null, otherSince: null, lastError: null });
      return;
    }
    // Errore transitorio (rete/auth): blocco fail-closed finché un server non
    // conferma nuovamente il testimone di questa finestra.
    setAdminLeaseInfo({ lastError: message, status: readAdminLeaseInfo().status === 'passive' ? 'passive' : 'error' });
  }
};

const stopTimer = () => {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
};

const installPagehideRelease = () => {
  if (pagehideInstalled) return;
  try {
    const w = (globalThis as any).window;
    if (!w?.addEventListener || typeof document === 'undefined') return;
    w.addEventListener('pagehide', () => {
      void releaseAdminWriteLease({ keepalive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && inited) void tick(false);
    });
    pagehideInstalled = true;
  } catch {
    // headless: nessun pagehide
  }
};

export const initAdminWriteLease = async (opts?: {
  label?: string;
  takeover?: boolean;
}): Promise<void> => {
  if (inited) return;
  sessionUuid = readSessionUuid();
  holderId = `${sessionUuid}:${makeUuid().slice(0, 8)}`;
  holderLabel = opts?.label || deriveDefaultLabel();
  inited = true;
  setAdminLeaseInfo({ status: 'acquiring', holderId, lastError: null });
  installPagehideRelease();
  const startingHolder = holderId;
  await tick(!!opts?.takeover);
  if (!inited || holderId !== startingHolder) return;
  stopTimer();
  timer = setInterval(() => {
    void tick(false);
  }, HEARTBEAT_MS);
};

export const takeoverAdminWriteLease = async (): Promise<void> => {
  if (!inited) return;
  await tick(true);
};

// Explicit Admin choice after the grace period when the cloud snapshot lacks
// the last operations journaled by the silent tournament PC.
export const reclaimCloudAcceptingMissingOperations = async (): Promise<void> => {
  if (!inited) return;
  const route = await resolveDataPlane({ force: true });
  try {
    if (route.mode === 'recovery') await tryReclaimCloud(route, true);
  } catch (error) {
    if (!(error instanceof AdminLeaseSessionExpiredError)) throw error;
    setAdminLeaseInfo({ status: 'session-expired', lastError: null, recovery: null });
    return;
  }
  await tick(false);
};

export const releaseAdminWriteLease = async (opts?: { keepalive?: boolean }): Promise<void> => {
  if (!inited) return;
  const wasActive = readAdminLeaseInfo().status === 'active';
  const cfg = getSupabaseConfig();
  const releasingHolder = holderId;
  const releasingBackend = activeBackend;
  const releasingLocalRoute = activeLocalRoute;
  stopTimer();
  inited = false;
  activeBackend = null;
  activeLocalRoute = null;
  setAdminLeaseInfo({ status: 'off', holderId: null, otherLabel: null, otherSince: null, lastError: null });
  if (!wasActive || !releasingHolder) return;
  try {
    if (releasingBackend === 'local' && releasingLocalRoute) {
      await releaseLocalAdminWriteLease(releasingLocalRoute, releasingHolder);
      return;
    }
    if (!cfg) return;
    await leaseRpc(
      'flbp_admin_release_write_lease',
      { p_workspace_id: cfg.workspaceId, p_holder_id: releasingHolder },
      { release: true, keepalive: !!opts?.keepalive }
    );
  } catch {
    // best effort: scade comunque col TTL
  }
};
