import { readViteSupabaseAnonKey, readViteSupabaseUrl, readViteWorkspaceId } from './viteEnv';

export type DevRequestPerfKind = 'polling' | 'user' | 'tv' | 'admin' | 'referee' | 'sync' | 'unknown';

export interface DevRequestPerfMeta {
  source?: string;
  kind?: DevRequestPerfKind;
  view?: string;
  dedupeKey?: string;
  timeoutMs?: number;
}

export interface DevRequestPerfEntry {
  at: string;
  source: string;
  endpoint: string;
  method: string;
  view: string;
  kind: DevRequestPerfKind;
  status: number | null;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  duplicate: boolean;
  ok: boolean;
}

type DevRequestPerfStore = {
  entries: DevRequestPerfEntry[];
  context: { view: string; tvMode: string | null };
  recentByKey: Record<string, number>;
  reporterId: number | null;
  reset: () => void;
  reportNow: () => void;
  snapshot: () => DevRequestPerfEntry[];
};

type UsageBucket = 'public' | 'tv' | 'admin' | 'referee' | 'sync' | 'unknown';

type UsagePendingRow = {
  usageDate: string;
  bucket: UsageBucket;
  requestCount: number;
  requestBytes: number;
  responseBytes: number;
};

declare global {
  interface Window {
    __flbpRequestPerf?: DevRequestPerfStore;
  }
}

const REPORT_INTERVAL_MS = 60_000;
const DUPLICATE_WINDOW_MS = 2_000;
const MAX_ENTRIES = 1500;
const USAGE_PENDING_LS_KEY = 'flbp_supabase_usage_pending_v1';
const USAGE_FLUSH_INTERVAL_MS = 120_000;
const USAGE_FLUSH_REQUEST_THRESHOLD = 20;
const USAGE_FLUSH_BYTES_THRESHOLD = 128 * 1024;
let usageFlushTimerId: number | null = null;
let usageListenersAttached = false;

const shouldEnable = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!import.meta.env.DEV;
  } catch {
    return false;
  }
};

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

const todayUsageDate = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getUsageConfig = () => {
  try {
    const url = String(readViteSupabaseUrl() || '').trim().replace(/\/$/, '');
    const anonKey = String(readViteSupabaseAnonKey() || '').trim();
    const workspaceId = String(readViteWorkspaceId() || 'default').trim() || 'default';
    if (!url || !anonKey) return null;
    return { url, anonKey, workspaceId };
  } catch {
    return null;
  }
};

const readUsagePendingRows = (): Record<string, UsagePendingRow> => {
  try {
    const raw = localStorage.getItem(USAGE_PENDING_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, UsagePendingRow> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const usageDate = String((value as any).usageDate || '').trim();
      const bucket = String((value as any).bucket || '').trim() as UsageBucket;
      if (!usageDate || !bucket) continue;
      next[key] = {
        usageDate,
        bucket,
        requestCount: Math.max(0, Number((value as any).requestCount || 0)),
        requestBytes: Math.max(0, Number((value as any).requestBytes || 0)),
        responseBytes: Math.max(0, Number((value as any).responseBytes || 0)),
      };
    }
    return next;
  } catch {
    return {};
  }
};

const writeUsagePendingRows = (rows: Record<string, UsagePendingRow>) => {
  try {
    const keys = Object.keys(rows);
    if (!keys.length) {
      localStorage.removeItem(USAGE_PENDING_LS_KEY);
      return;
    }
    localStorage.setItem(USAGE_PENDING_LS_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
};

const isTrackableSupabaseUrl = (url: string): boolean => {
  const cfg = getUsageConfig();
  if (!cfg) return false;
  const normalized = String(url || '').trim();
  if (!normalized.startsWith(cfg.url)) return false;
  return !normalized.includes('/rpc/flbp_track_supabase_usage_batch');
};

const toUsageBucket = (kind: DevRequestPerfKind, context: { view: string; tvMode: string | null }): UsageBucket => {
  if (kind === 'tv' || context.tvMode) return 'tv';
  if (kind === 'admin' || context.view === 'admin') return 'admin';
  if (kind === 'referee' || context.view === 'referees_area') return 'referee';
  if (kind === 'sync') return 'sync';
  if (kind === 'polling' || kind === 'user') return 'public';
  return 'unknown';
};

const totalPendingUsage = (rows: Record<string, UsagePendingRow>) => {
  return Object.values(rows).reduce(
    (acc, row) => {
      acc.requestCount += row.requestCount;
      acc.totalBytes += row.requestBytes + row.responseBytes;
      return acc;
    },
    { requestCount: 0, totalBytes: 0 }
  );
};

const clearUsageFlushTimer = () => {
  if (usageFlushTimerId != null) {
    window.clearTimeout(usageFlushTimerId);
    usageFlushTimerId = null;
  }
};

const flushSupabaseUsagePending = async (options?: { keepalive?: boolean }) => {
  if (typeof window === 'undefined') return;
  const cfg = getUsageConfig();
  if (!cfg) return;
  const pending = readUsagePendingRows();
  const rows = Object.values(pending);
  if (!rows.length) return;

  const payload = rows.map((row) => ({
    usage_date: row.usageDate,
    bucket: row.bucket,
    request_count: row.requestCount,
    request_bytes: row.requestBytes,
    response_bytes: row.responseBytes,
  }));

  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/flbp_track_supabase_usage_batch`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_workspace_id: cfg.workspaceId,
        p_items: payload,
      }),
      keepalive: !!options?.keepalive,
    });
    if (!res.ok) return;
    writeUsagePendingRows({});
    clearUsageFlushTimer();
  } catch {
    // ignore and keep pending rows for the next flush
  }
};

const attachUsageLifecycleListeners = () => {
  if (usageListenersAttached || typeof window === 'undefined') return;
  usageListenersAttached = true;
  window.addEventListener('pagehide', () => {
    void flushSupabaseUsagePending({ keepalive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushSupabaseUsagePending({ keepalive: true });
    }
  });
  window.addEventListener('online', () => {
    void flushSupabaseUsagePending();
  });
};

const scheduleUsageFlush = () => {
  if (typeof window === 'undefined') return;
  attachUsageLifecycleListeners();
  if (usageFlushTimerId != null) return;
  usageFlushTimerId = window.setTimeout(() => {
    usageFlushTimerId = null;
    void flushSupabaseUsagePending();
  }, USAGE_FLUSH_INTERVAL_MS);
};

const queueSupabaseUsage = (url: string, kind: DevRequestPerfKind, context: { view: string; tvMode: string | null }, requestBytes: number, responseBytes: number) => {
  if (typeof window === 'undefined') return;
  if (!isTrackableSupabaseUrl(url)) return;
  const bucket = toUsageBucket(kind, context);
  const usageDate = todayUsageDate();
  const key = `${usageDate}:${bucket}`;
  const rows = readUsagePendingRows();
  const current = rows[key] || {
    usageDate,
    bucket,
    requestCount: 0,
    requestBytes: 0,
    responseBytes: 0,
  };
  current.requestCount += 1;
  current.requestBytes += Math.max(0, requestBytes);
  current.responseBytes += Math.max(0, responseBytes);
  rows[key] = current;
  writeUsagePendingRows(rows);

  const totals = totalPendingUsage(rows);
  if (totals.requestCount >= USAGE_FLUSH_REQUEST_THRESHOLD || totals.totalBytes >= USAGE_FLUSH_BYTES_THRESHOLD) {
    void flushSupabaseUsagePending();
    return;
  }
  scheduleUsageFlush();
};

const shouldIgnoreUrl = (url: string): boolean => {
  const normalized = String(url || '').toLowerCase();
  return !normalized;
};

const estimateBodyBytes = (body: BodyInit | null | undefined): number => {
  if (body == null) return 0;
  try {
    if (typeof body === 'string') return textEncoder ? textEncoder.encode(body).length : body.length;
    if (body instanceof URLSearchParams) return textEncoder ? textEncoder.encode(body.toString()).length : body.toString().length;
    if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      let total = 0;
      body.forEach((value, key) => {
        total += estimateBodyBytes(key);
        if (typeof value === 'string') total += estimateBodyBytes(value);
        else if (typeof Blob !== 'undefined' && value instanceof Blob) total += value.size;
      });
      return total;
    }
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    return estimateBodyBytes(String(body));
  } catch {
    return 0;
  }
};

const estimateResponseBytes = async (response: Response): Promise<number> => {
  try {
    const header = response.headers.get('content-length');
    if (header) {
      const parsed = Number(header);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const clone = response.clone();
    const text = await clone.text();
    return textEncoder ? textEncoder.encode(text).length : text.length;
  } catch {
    return 0;
  }
};

const inferEndpoint = (url: string): string => {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const lastSegment = pathname.split('/').filter(Boolean).pop() || pathname || 'unknown';
    return lastSegment;
  } catch {
    const clean = String(url || '').split('?')[0].replace(/\/+$/, '');
    return clean.split('/').filter(Boolean).pop() || clean || 'unknown';
  }
};

const inferKind = (meta: DevRequestPerfMeta | undefined, method: string, endpoint: string, context: { view: string; tvMode: string | null }): DevRequestPerfKind => {
  if (meta?.kind) return meta.kind;
  if (context.tvMode) return 'tv';
  if (context.view === 'admin') return 'admin';
  if (context.view === 'referees_area') return 'referee';
  if (method !== 'GET') return 'user';
  if (endpoint.includes('workspace_state') || endpoint.includes('tournaments') || endpoint.includes('tournament_')) return 'polling';
  return 'user';
};

const getStore = (): DevRequestPerfStore | null => {
  if (!shouldEnable()) return null;
  if (window.__flbpRequestPerf) return window.__flbpRequestPerf;

  const store: DevRequestPerfStore = {
    entries: [],
    context: { view: 'unknown', tvMode: null },
    recentByKey: {},
    reporterId: null,
    reset: () => {
      store.entries = [];
      store.recentByKey = {};
      // eslint-disable-next-line no-console
      console.info('[FLBP PERF] reset completato');
    },
    reportNow: () => {
      const since = Date.now() - REPORT_INTERVAL_MS;
      const rows = store.entries.filter((entry) => Date.parse(entry.at) >= since);
      if (!rows.length) {
        // eslint-disable-next-line no-console
        console.info('[FLBP PERF] ultimi 60s: nessuna richiesta tracciata');
        return;
      }
      const byEndpoint = new Map<string, { requests: number; totalMs: number; totalBytes: number; duplicates: number; kind: DevRequestPerfKind }>();
      rows.forEach((entry) => {
        const current = byEndpoint.get(entry.endpoint) || { requests: 0, totalMs: 0, totalBytes: 0, duplicates: 0, kind: entry.kind };
        current.requests += 1;
        current.totalMs += entry.durationMs;
        current.totalBytes += entry.requestBytes + entry.responseBytes;
        if (entry.duplicate) current.duplicates += 1;
        byEndpoint.set(entry.endpoint, current);
      });
      const table = Array.from(byEndpoint.entries())
        .map(([endpoint, value]) => ({
          endpoint,
          kind: value.kind,
          requests: value.requests,
          avgMs: Number((value.totalMs / Math.max(1, value.requests)).toFixed(1)),
          totalKB: Number((value.totalBytes / 1024).toFixed(1)),
          duplicates: value.duplicates,
        }))
        .sort((a, b) => b.totalKB - a.totalKB || b.requests - a.requests)
        .slice(0, 12);
      const totalBytes = rows.reduce((sum, entry) => sum + entry.requestBytes + entry.responseBytes, 0);
      const totalDuration = rows.reduce((sum, entry) => sum + entry.durationMs, 0);
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[FLBP PERF] ultimi 60s • req=${rows.length} • traffico=${(totalBytes / 1024).toFixed(1)} KB • avg=${(totalDuration / Math.max(1, rows.length)).toFixed(1)} ms`);
      // eslint-disable-next-line no-console
      console.table(table);
      // eslint-disable-next-line no-console
      console.info('Usa window.__flbpRequestPerf.snapshot() per il dump completo o window.__flbpRequestPerf.reset() per pulire i log.');
      // eslint-disable-next-line no-console
      console.groupEnd();
    },
    snapshot: () => store.entries.slice(),
  };

  store.reporterId = window.setInterval(() => {
    store.reportNow();
  }, REPORT_INTERVAL_MS);

  window.__flbpRequestPerf = store;
  return store;
};

export const setDevRequestPerfContext = (ctx: { view?: string; tvMode?: string | null }) => {
  const store = getStore();
  if (!store) return;
  store.context = {
    view: String(ctx.view || store.context.view || 'unknown'),
    tvMode: ctx.tvMode == null ? null : String(ctx.tvMode),
  };
};

export const fetchWithDevRequestPerf = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  meta?: DevRequestPerfMeta,
): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (shouldIgnoreUrl(url)) {
    return await fetch(input, init);
  }
  const devEnabled = shouldEnable();
  const store = devEnabled ? getStore() : null;
  const context = store?.context || { view: 'unknown', tvMode: null };
  const endpoint = inferEndpoint(url);
  const method = String(init?.method || 'GET').toUpperCase();
  const source = String(meta?.source || endpoint || 'unknown');
  const kind = inferKind(meta, method, endpoint, context);
  const view = String(meta?.view || context.view || 'unknown');
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const requestBytes = estimateBodyBytes(init?.body);
  const dedupeKey = String(meta?.dedupeKey || `${method}:${endpoint}:${view}:${kind}`);
  const nowMs = Date.now();
  const previousAt = store?.recentByKey[dedupeKey] || 0;
  const duplicate = nowMs - previousAt <= DUPLICATE_WINDOW_MS;
  if (store) {
    store.recentByKey[dedupeKey] = nowMs;
  }

  try {
    const response = await fetch(input, init);
    const responseBytes = await estimateResponseBytes(response);
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    queueSupabaseUsage(url, kind, context, requestBytes, responseBytes);
    if (store) {
      store.entries.push({
        at: new Date().toISOString(),
        source,
        endpoint,
        method,
        view,
        kind,
        status: response.status,
        durationMs: endedAt - startedAt,
        requestBytes,
        responseBytes,
        duplicate,
        ok: response.ok,
      });
      if (store.entries.length > MAX_ENTRIES) {
        store.entries.splice(0, store.entries.length - MAX_ENTRIES);
      }
    }
    return response;
  } catch (error) {
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    queueSupabaseUsage(url, kind, context, requestBytes, 0);
    if (store) {
      store.entries.push({
        at: new Date().toISOString(),
        source,
        endpoint,
        method,
        view,
        kind,
        status: null,
        durationMs: endedAt - startedAt,
        requestBytes,
        responseBytes: 0,
        duplicate,
        ok: false,
      });
      if (store.entries.length > MAX_ENTRIES) {
        store.entries.splice(0, store.entries.length - MAX_ENTRIES);
      }
    }
    throw error;
  }
};
