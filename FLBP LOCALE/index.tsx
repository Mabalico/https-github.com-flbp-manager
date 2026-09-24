import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { readTvProjectionFromUrl } from './services/tvProjectionRoute';

import './styles.css';

// Conservative offline/cache (service worker)
// - Network-first for HTML navigations (avoid "stale app" issues)
// - Cache-first for built assets (/assets/*)
// Can be disabled quickly by setting localStorage: flbp_sw_disabled=1
// TV Mode hardening (R8.1): if TV is active (legacy storage or a dedicated
// projection URL), do NOT register the SW and best-effort clear stale caches.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  try {
    window.addEventListener('load', () => {
      const isNativeWindowsShell = Boolean((globalThis as any).__FLBP_NATIVE_WRITER_WINDOW_ID);
      const routedTvActive = readTvProjectionFromUrl(window.location.href) !== null;
      const storedTvActive = !isNativeWindowsShell && !!window.localStorage.getItem('flbp_tv_mode');
      const tvActive = routedTvActive || storedTvActive;
      const disabled = window.localStorage.getItem('flbp_sw_disabled') === '1';
      if (tvActive) {
        // TV must be as "fresh" as possible. Best-effort cleanup.
        try {
          // Ask SW (if controlling) to clear caches.
          navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' });
        } catch {
          // ignore
        }
        try {
          navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => r.unregister().catch(() => {}));
          }).catch(() => {});
        } catch {
          // ignore
        }
        try {
          // Also clear caches from the window context (same-origin only).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w: any = window;
          if (w.caches && typeof w.caches.keys === 'function') {
            w.caches.keys().then((keys: string[]) => Promise.all(keys.map((k) => w.caches.delete(k)))).catch(() => {});
          }
        } catch {
          // ignore
        }
        return;
      }

      if (disabled) return;

      const base = (import.meta as any).env?.BASE_URL ?? '/';
      const swUrl = (base.endsWith('/') ? base : `${base}/`) + 'sw.js';
      navigator.serviceWorker.register(swUrl).catch(() => {
        // Intentionally silent: SW is optional and must not block the app.
      });
    });
  } catch {
    // Intentionally ignore: localStorage access can throw in some environments.
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
