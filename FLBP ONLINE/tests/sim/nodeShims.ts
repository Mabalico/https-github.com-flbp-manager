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
    setTimeout: (fn: any, ms?: number, ...args: any[]) => setTimeout(fn, ms, ...args),
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
