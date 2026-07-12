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

export {};
