/*
  FLBP Manager Suite — Conservative Service Worker

  Goals:
  - Speed up repeat loads by caching hashed build assets (/assets/*).
  - Provide limited offline fallback (last known index.html) without risking "stale app" during live tournaments.

  Strategy:
  - HTML navigations: network-first, fallback to cached index.html when offline.
  - Static assets (/assets/*, icons, manifest): stale-while-revalidate.

  Notes:
  - Never caches API calls (cross-origin requests are ignored).
  - Quick disable (client-side): localStorage flbp_sw_disabled=1 prevents registration.
*/

const SW_VERSION = 'step85';
const ASSET_CACHE = `flbp-assets-${SW_VERSION}`;
const DOC_CACHE = `flbp-docs-${SW_VERSION}`;

// Vite BASE_URL deployments may live under a sub-path.
// Compute a base pathname from the SW scope to match assets correctly.
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');

self.addEventListener('install', (event) => {
  // Activate new SW as soon as it's downloaded.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(`-${SW_VERSION}`))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      })()
    );
  }
});

function isSameOrigin(url) {
  try {
    return url.origin === self.location.origin;
  } catch {
    return false;
  }
}

function isStaticAsset(url) {
  const p = url.pathname;
  return (
    p.startsWith(`${BASE_PATH}/assets/`) ||
    p.startsWith(`${BASE_PATH}/icons/`) ||
    p === `${BASE_PATH}/manifest.webmanifest` ||
    p === `${BASE_PATH}/favicon.ico` ||
    p.endsWith('.png') ||
    p.endsWith('.svg') ||
    p.endsWith('.css') ||
    p.endsWith('.js') ||
    p.endsWith('.woff2') ||
    p.endsWith('.woff')
  );
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());

      // Also store a stable SPA entry for offline fallback.
      if (isNavigationRequest(request)) {
        const stableIndexRequest = new Request(`${BASE_PATH || ''}/index.html`, { cache: 'reload' });
        cache.put(stableIndexRequest, response.clone());
      }
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Minimal offline fallback for navigations.
    if (isNavigationRequest(request)) {
      const cachedIndex = await cache.match(`${BASE_PATH || ''}/index.html`);
      if (cachedIndex) return cachedIndex;
      return new Response(
        '<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Offline</title></head><body style="font-family: sans-serif; padding: 16px;">\n<h1>Offline</h1><p>Connessione assente. Riprova quando sei online.</p></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    throw new Error('Network and cache both failed');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return; // Never cache cross-origin.

  // HTML (SPA): network-first to avoid "stale app".
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request, DOC_CACHE));
    return;
  }

  // Static assets: SWR.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // Default: direct network.
  return;
});
