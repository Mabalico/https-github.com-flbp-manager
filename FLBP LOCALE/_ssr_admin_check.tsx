import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { AdminDashboard } from './components/AdminDashboard';
import type { AppState } from './services/storageService';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const ss = new MemStorage();
const ls = new MemStorage();
// Pre-auth to skip login
ss.setItem('flbp_admin_authed', '1');

// Select a tab to test (override via env)
const tab = process.env.TAB || 'teams';
const section = tab === 'data' ? 'data' : 'live';
ss.setItem('flbp_admin_section', section);
if (section === 'live') ss.setItem('flbp_admin_last_live_tab', tab);

// Minimal browser shims
(globalThis as any).sessionStorage = ss;
(globalThis as any).localStorage = ls;
(globalThis as any).window = globalThis;
try { (globalThis as any).navigator.serviceWorker = undefined; } catch {}

const mockState: AppState = {
  teams: [],
  matches: [],
  tournament: null,
  tournamentMatches: [],
  tournamentHistory: [],
  logo: '',
  hallOfFame: [],
  integrationsScorers: [],
  playerAliases: {},
};

try {
  const html = ReactDOMServer.renderToString(
    <AdminDashboard
      state={mockState}
      setState={() => {}}
      onExit={() => {}}
      onEnterTv={() => {}}
    />
  );
  console.log('SSR OK for tab:', tab, 'html length:', html.length);
} catch (e: any) {
  console.error('SSR ERROR for tab:', tab, e?.message);
  console.error(e?.stack || e);
  process.exitCode = 1;
}
