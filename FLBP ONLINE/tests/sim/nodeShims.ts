// Minimal browser shims so the app services (built with Vite) can run in Node.
// Deliberately NO global `window`: services guard browser-only paths with
// `typeof window !== 'undefined'` / try-catch, and we want those paths off.

const makeMemoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      map.delete(String(key));
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
};

const g = globalThis as any;
if (typeof g.localStorage === 'undefined') g.localStorage = makeMemoryStorage();
if (typeof g.sessionStorage === 'undefined') g.sessionStorage = makeMemoryStorage();
if (typeof g.navigator === 'undefined') g.navigator = { onLine: true, userAgent: 'flbp-sim-node' };

// Capture the real HTTP cost of a headless simulation. Only aggregate-safe
// request metadata is retained: no headers, tokens, query values or payloads.
// The simulator prints this at the end together with its domain-level timings.
if (typeof g.fetch === 'function' && !g.__flbpSimFetchInstrumented) {
  const rawFetch = g.fetch.bind(g);
  const entries: Array<{
    service: string;
    method: string;
    status: number | null;
    durationMs: number;
    requestBytes: number;
    responseBytes: number;
    ok: boolean;
    rateLimitRemaining: string | null;
    retryAfter: string | null;
  }> = [];
  const byteLength = (value: unknown): number => {
    if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    return 0;
  };
  const classify = (rawUrl: string): string => {
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local';
      if (!host.endsWith('.supabase.co')) return 'other';
      const path = url.pathname;
      if (path.startsWith('/auth/v1/')) return 'auth';
      if (path.startsWith('/rest/v1/rpc/')) return 'rpc';
      if (path.startsWith('/rest/v1/')) return 'rest';
      if (path.startsWith('/functions/v1/')) return 'functions';
      return 'other';
    } catch {
      return 'other';
    }
  };
  g.__flbpSimNetworkMetrics = entries;
  g.__flbpSimFetchInstrumented = true;
  g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const startedAt = Date.now();
    try {
      const response = await rawFetch(input, init);
      let responseBytes = 0;
      try {
        responseBytes = (await response.clone().arrayBuffer()).byteLength;
      } catch {
        responseBytes = Number(response.headers.get('content-length') || 0) || 0;
      }
      entries.push({
        service: classify(rawUrl),
        method: String(init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase(),
        status: response.status,
        durationMs: Date.now() - startedAt,
        requestBytes: byteLength(init?.body),
        responseBytes,
        ok: response.ok,
        rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
        retryAfter: response.headers.get('retry-after'),
      });
      return response;
    } catch (error) {
      entries.push({
        service: classify(rawUrl),
        method: String(init?.method || 'GET').toUpperCase(),
        status: null,
        durationMs: Date.now() - startedAt,
        requestBytes: byteLength(init?.body),
        responseBytes: 0,
        ok: false,
        rateLimitRemaining: null,
        retryAfter: null,
      });
      throw error;
    }
  };
}

// Minimal `window` so the app services that emit auth/live events or read
// window timers work headless. Event listeners are no-ops (the simulator
// drives everything sequentially); setInterval is neutralized so no background
// polling keeps the Node process alive.
if (typeof g.window === 'undefined') {
  const noop = () => {};
  g.window = {
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    setTimeout: (fn: any, ms?: number, ...args: any[]) => {
      const timer = setTimeout(fn, ms, ...args);
      // Usage-flush/retry timers must not keep a completed CLI simulation alive.
      timer.unref?.();
      return timer;
    },
    clearTimeout: (id: any) => clearTimeout(id),
    setInterval: () => 0,
    clearInterval: noop,
    localStorage: g.localStorage,
    sessionStorage: g.sessionStorage,
    navigator: g.navigator,
    location: { href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', protocol: 'http:' },
  };
}
if (typeof g.document === 'undefined') {
  g.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
    hidden: false,
  };
}
if (typeof g.CustomEvent === 'undefined') {
  g.CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: { detail?: any }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

export {};
