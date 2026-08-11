// Logica attiva del "write lease" admin: acquisizione, heartbeat, takeover,
// rilascio. Lo stato osservabile vive in adminWriteLeaseState.ts.
//
// Funziona sia nel browser (AdminDashboard) sia headless (simulatore Node):
// usa i timer globali e guarda le API browser solo se esistono.

import { getSupabaseAccessToken, getSupabaseConfig } from './supabaseRest';
import { readAdminLeaseInfo, setAdminLeaseInfo } from './adminWriteLeaseState';
import {
  acquireLocalAdminWriteLease,
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

const readSessionUuid = (): string => {
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

const leaseRpc = async (
  name: string,
  body: Record<string, unknown>,
  opts?: { keepalive?: boolean }
): Promise<any> => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase non configurato');
  const token = getSupabaseAccessToken();
  if (!token) throw new Error('Sessione admin assente');
  const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    ...(opts?.keepalive ? { keepalive: true } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `RPC ${name} HTTP ${res.status}`);
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

const acquireForCurrentPlane = async (takeover: boolean): Promise<{ acquired: boolean; out: any }> => {
  const route = await resolveDataPlane({ force: true });
  if (route.mode === 'recovery') {
    throw new Error('Data plane in recovery: impossibile acquisire il controllo Admin.');
  }
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
  try {
    let { acquired, out } = await acquireForCurrentPlane(takeover);
    // Il detentore e' una vita precedente di QUESTA scheda (reload: stesso
    // sessionStorage, nonce diverso): riprendi il testimone senza chiedere.
    if (!acquired && sessionUuid && String(out?.holder_id || '').startsWith(`${sessionUuid}:`)) {
      ({ acquired, out } = await acquireForCurrentPlane(true));
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
    const message = String(e?.message || e || '');
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
  await tick(!!opts?.takeover);
  if (!inited) return; // feature off (migration assente)
  stopTimer();
  timer = setInterval(() => {
    void tick(false);
  }, HEARTBEAT_MS);
  try {
    const w = (globalThis as any).window;
    if (w?.addEventListener && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && inited) void tick(false);
      });
    }
  } catch {
    // headless
  }
};

export const takeoverAdminWriteLease = async (): Promise<void> => {
  if (!inited) return;
  await tick(true);
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
      { keepalive: !!opts?.keepalive }
    );
  } catch {
    // best effort: scade comunque col TTL
  }
};
