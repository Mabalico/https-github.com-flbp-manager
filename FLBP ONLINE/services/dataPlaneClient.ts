import { readViteSupabaseAnonKey, readViteSupabaseUrl, readViteWorkspaceId } from './viteEnv';

export type DataPlaneMode = 'cloud' | 'local' | 'recovery';

export type DataPlaneRoute = {
  mode: DataPlaneMode;
  authority?: 'cloud' | 'local' | null;
  publicReadMode?: 'cloud' | 'local' | null;
  baseUrl?: string | null;
  epoch?: number | null;
  leaseExpiresAt?: string | null;
  reason?: string | null;
  resolvedAt: number;
};

export type LocalWorkspaceRow = {
  workspace_id: string;
  state: any;
  updated_at?: string | null;
  version?: number | null;
  primary_epoch?: number | null;
};

const ROUTE_CACHE_MS = 25_000;
// A durable local write is acknowledged only after SQLite and the required
// secondary replica contain the same version. On the tournament PC that copy
// can legitimately take more than 12 seconds as history grows; aborting at the
// old threshold produced a false UI failure even though the server completed
// the idempotent commit. Keep the client window comfortably above the physical
// backup time and let retries reuse the same operation id.
const DURABLE_LOCAL_WRITE_TIMEOUT_MS = 60_000;
const LAST_ROUTE_LS_KEY = 'flbp_last_data_plane_route_v1';
export const DATA_PLANE_CHANGE_LS_KEY = 'flbp_data_plane_change_v1';
export const DATA_PLANE_CHANGE_EVENT = 'flbp-data-plane-change';
const LOCAL_ADMIN_TOKEN_SS_KEY = 'flbp_local_control_token';

let cachedRoute: DataPlaneRoute | null = null;
let resolveInFlight: Promise<DataPlaneRoute> | null = null;
const localWorkspaceCache: Record<'admin' | 'public', { etag: string | null; row: LocalWorkspaceRow | null }> = {
  admin: { etag: null, row: null },
  public: { etag: null, row: null },
};

try {
  window.addEventListener('storage', (event) => {
    if (event.key !== DATA_PLANE_CHANGE_LS_KEY) return;
    cachedRoute = null;
    resolveInFlight = null;
    window.dispatchEvent(new CustomEvent(DATA_PLANE_CHANGE_EVENT));
  });
} catch {
  // SSR/tests without a browser event target.
}

const workspaceId = () => (readViteWorkspaceId() || 'default').trim() || 'default';

const timeoutFetch = async (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 2500): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(init || {}), signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const normalizeRoute = (raw: any): DataPlaneRoute => ({
  mode: raw?.mode === 'local' ? 'local' : raw?.mode === 'recovery' ? 'recovery' : 'cloud',
  authority: raw?.authority === 'local' ? 'local' : raw?.authority === 'cloud' ? 'cloud' : null,
  publicReadMode: raw?.public_read_mode === 'local' ? 'local' : raw?.public_read_mode === 'cloud' ? 'cloud' : null,
  baseUrl: typeof raw?.base_url === 'string' ? raw.base_url.replace(/\/$/, '') : (typeof raw?.baseUrl === 'string' ? raw.baseUrl.replace(/\/$/, '') : null),
  epoch: Number.isFinite(Number(raw?.epoch)) ? Number(raw.epoch) : null,
  leaseExpiresAt: raw?.lease_expires_at || raw?.leaseExpiresAt || null,
  reason: raw?.reason || null,
  resolvedAt: Number.isFinite(Number(raw?.resolvedAt)) ? Number(raw.resolvedAt) : Date.now(),
});

const rememberRoute = (route: DataPlaneRoute) => {
  cachedRoute = route;
  try {
    localStorage.setItem(LAST_ROUTE_LS_KEY, JSON.stringify(route));
  } catch {
    // in-memory cache remains available
  }
};

const readLastRoute = (): DataPlaneRoute | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_ROUTE_LS_KEY) || 'null');
    if (!parsed?.mode || !parsed?.resolvedAt) return null;
    return normalizeRoute({ ...parsed, resolvedAt: parsed.resolvedAt });
  } catch {
    return null;
  }
};

const probeSameOriginLocalServer = async (): Promise<DataPlaneRoute | null> => {
  try {
    const response = await timeoutFetch(`${window.location.origin}/api/v1/discovery`, { headers: { Accept: 'application/json' } }, 700);
    if (!response.ok) return null;
    const out = await response.json();
    if (!out?.active || String(out?.workspaceId || '') !== workspaceId()) return null;
    return normalizeRoute({ mode: 'local', base_url: window.location.origin, epoch: out.primaryEpoch });
  } catch {
    return null;
  }
};

const resolveFromSupabase = async (): Promise<DataPlaneRoute> => {
  const url = (readViteSupabaseUrl() || '').trim().replace(/\/$/, '');
  const anonKey = (readViteSupabaseAnonKey() || '').trim();
  if (!url || !anonKey) return normalizeRoute({ mode: 'cloud' });

  const response = await timeoutFetch(`${url}/rest/v1/rpc/flbp_resolve_data_plane`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_workspace_id: workspaceId() }),
  }, 2500);
  if (!response.ok) {
    const text = await response.text();
    // Backward-compatible deployment before the coordinator migration.
    if (response.status === 404 || text.includes('PGRST202') || text.includes('flbp_resolve_data_plane')) {
      return normalizeRoute({ mode: 'cloud' });
    }
    throw new Error(text || `Data plane discovery HTTP ${response.status}`);
  }
  return normalizeRoute(await response.json());
};

export const resolveDataPlane = async (opts?: { force?: boolean }): Promise<DataPlaneRoute> => {
  const now = Date.now();
  if (!opts?.force && cachedRoute && now - cachedRoute.resolvedAt < ROUTE_CACHE_MS) return cachedRoute;
  if (resolveInFlight) return resolveInFlight;

  resolveInFlight = (async () => {
    const sameOrigin = await probeSameOriginLocalServer();
    if (sameOrigin) {
      rememberRoute(sameOrigin);
      return sameOrigin;
    }
    try {
      const route = await resolveFromSupabase();
      rememberRoute(route);
      return route;
    } catch (error) {
      const last = cachedRoute || readLastRoute();
      if (last?.mode === 'local' && last.baseUrl && (!last.leaseExpiresAt || Date.parse(last.leaseExpiresAt) > now)) {
        return last;
      }
      // Discovery failure is not authority to make cloud writable. Reads may
      // continue from the last cloud snapshot, while server-side fencing and
      // the durable browser draft protect writes.
      const recovery = normalizeRoute({ mode: 'recovery', reason: (error as Error)?.message || 'discovery_failed' });
      rememberRoute(recovery);
      return recovery;
    } finally {
      resolveInFlight = null;
    }
  })();
  return resolveInFlight;
};

export const getLocalAdminToken = (): string => {
  try {
    return (sessionStorage.getItem(LOCAL_ADMIN_TOKEN_SS_KEY) || '').trim();
  } catch {
    return '';
  }
};

export const setLocalAdminToken = (token: string): void => {
  try {
    const safe = String(token || '').trim();
    if (safe) sessionStorage.setItem(LOCAL_ADMIN_TOKEN_SS_KEY, safe);
    else sessionStorage.removeItem(LOCAL_ADMIN_TOKEN_SS_KEY);
  } catch {
    // ignore unavailable session storage
  }
};

export const ensureLocalAdminToken = async (
  route: DataPlaneRoute,
  opts?: { force?: boolean },
): Promise<string> => {
  if (!opts?.force) {
    const existing = getLocalAdminToken();
    if (existing) return existing;
  }
  if (route.mode !== 'local' || !route.baseUrl || route.baseUrl !== window.location.origin) {
    return getLocalAdminToken();
  }
  try {
    const response = await timeoutFetch(`${route.baseUrl}/control/local-session`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
    }, 2500);
    if (!response.ok) return getLocalAdminToken();
    const out = await response.json();
    const token = String(out?.token || '').trim();
    if (token) setLocalAdminToken(token);
    return token;
  } catch {
    return getLocalAdminToken();
  }
};

const localUrl = (route: DataPlaneRoute, path: string) => {
  if (route.mode !== 'local' || !route.baseUrl) throw new Error('Server locale non disponibile');
  return `${route.baseUrl}${path}`;
};

const localError = async (response: Response): Promise<never> => {
  let out: any = null;
  try { out = await response.json(); } catch { /* ignore */ }
  const error: any = new Error(out?.error || `Server locale HTTP ${response.status}`);
  error.code = out?.code || (response.status === 409 ? 'FLBP_DB_CONFLICT' : null);
  error.currentVersion = out?.currentVersion ?? null;
  throw error;
};

export const pullLocalWorkspace = async (route: DataPlaneRoute, admin: boolean): Promise<LocalWorkspaceRow> => {
  let token = admin ? await ensureLocalAdminToken(route) : '';
  if (admin && !token) {
    const error: any = new Error('Inserisci il token del server locale per aprire l’Admin.');
    error.code = 'FLBP_LOCAL_ADMIN_TOKEN_REQUIRED';
    throw error;
  }
  const path = `/api/v1/${admin ? 'admin' : 'public'}/workspace/${encodeURIComponent(workspaceId())}`;
  const cache = localWorkspaceCache[admin ? 'admin' : 'public'];
  const request = () => timeoutFetch(localUrl(route, path), {
    headers: { Accept: 'application/json', ...(token ? { 'x-flbp-local-token': token } : {}), ...(cache.etag ? { 'If-None-Match': cache.etag } : {}) },
  }, 5000);
  let response = await request();
  if (admin && response.status === 401) {
    setLocalAdminToken('');
    token = await ensureLocalAdminToken(route, { force: true });
    if (token) response = await request();
  }
  if (response.status === 304 && cache.row) return cache.row;
  if (!response.ok) return localError(response);
  const row = await response.json() as LocalWorkspaceRow;
  cache.etag = response.headers.get('etag');
  cache.row = row;
  return row;
};

const localAdminJson = async (
  route: DataPlaneRoute,
  path: string,
  body: Record<string, unknown>,
): Promise<any> => {
  let token = await ensureLocalAdminToken(route);
  if (!token) throw new Error('Token Admin del server locale assente.');
  const request = () => timeoutFetch(localUrl(route, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-flbp-local-token': token },
    body: JSON.stringify(body),
  }, 5000);
  let response = await request();
  if (response.status === 401) {
    setLocalAdminToken('');
    token = await ensureLocalAdminToken(route, { force: true });
    if (token) response = await request();
  }
  if (!response.ok) return localError(response);
  return response.json();
};

export const acquireLocalAdminWriteLease = async (
  route: DataPlaneRoute,
  input: { holderId: string; holderLabel: string; takeover?: boolean },
): Promise<any> => localAdminJson(route, '/api/v1/admin/write-lease/acquire', input);

export const heartbeatLocalAdminWriteLease = async (
  route: DataPlaneRoute,
  holderId: string,
): Promise<any> => localAdminJson(route, '/api/v1/admin/write-lease/heartbeat', { holderId });

export const releaseLocalAdminWriteLease = async (
  route: DataPlaneRoute,
  holderId: string,
): Promise<any> => localAdminJson(route, '/api/v1/admin/write-lease/release', { holderId });

export const commitLocalWorkspace = async (route: DataPlaneRoute, input: {
  state: any;
  publicState: any;
  operationId: string;
  baseVersion: number;
  writerId: string;
}): Promise<LocalWorkspaceRow & { ok: boolean }> => {
  let token = await ensureLocalAdminToken(route);
  if (!token) throw new Error('Token Admin del server locale assente.');
  const request = () => timeoutFetch(localUrl(route, `/api/v1/admin/workspace/${encodeURIComponent(workspaceId())}/commit`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-flbp-local-token': token,
      'x-flbp-writer-id': input.writerId,
    },
    body: JSON.stringify(input),
  }, DURABLE_LOCAL_WRITE_TIMEOUT_MS);
  let response = await request();
  if (response.status === 401) {
    setLocalAdminToken('');
    token = await ensureLocalAdminToken(route, { force: true });
    if (token) response = await request();
  }
  if (!response.ok) return localError(response);
  const out = await response.json();
  return { ...out, workspace_id: workspaceId(), state: input.state };
};

export const verifyLocalReferee = async (route: DataPlaneRoute, tournamentId: string, refereePassword: string): Promise<any> => {
  const response = await timeoutFetch(localUrl(route, `/api/v1/referee/workspace/${encodeURIComponent(workspaceId())}/auth`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId, refereePassword }),
  }, 5000);
  if (!response.ok) return localError(response);
  return response.json();
};

export const commitLocalMatchResult = async (route: DataPlaneRoute, input: {
  tournamentId: string;
  matchId: string;
  refereePassword?: string;
  matches: any[];
  operationId?: string;
  admin?: boolean;
  writerId?: string | null;
}): Promise<any> => {
  const primary = input.matches.find((match) => String(match?.id || '') === String(input.matchId || ''));
  const stableId = input.operationId || primary?.refereeReportFinalId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let token = input.admin ? await ensureLocalAdminToken(route) : '';
  const endpoint = input.admin ? 'admin-match-result' : 'match-result';
  const request = () => timeoutFetch(localUrl(route, `/api/v1/referee/workspace/${encodeURIComponent(workspaceId())}/${endpoint}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-flbp-local-token': token } : {}),
      ...(input.admin && input.writerId ? { 'x-flbp-writer-id': input.writerId } : {}),
    },
    body: JSON.stringify({ ...input, operationId: stableId }),
  }, DURABLE_LOCAL_WRITE_TIMEOUT_MS);
  let response = await request();
  if (input.admin && response.status === 401) {
    setLocalAdminToken('');
    token = await ensureLocalAdminToken(route, { force: true });
    if (token) response = await request();
  }
  if (!response.ok) return localError(response);
  return response.json();
};

export const makeDataOperationId = (): string => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
