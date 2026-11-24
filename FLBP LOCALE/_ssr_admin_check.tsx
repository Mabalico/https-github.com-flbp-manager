import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import React from 'react';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { dictionary as it } from './services/i18n/it';
import { coerceAppState } from './services/storageService';
import { activateFinalRoundRobinStage, generateTournamentStructure } from './services/tournamentEngine';
import { reconcileBracketAdvancements } from './services/tournamentStructureSelectors';

declare global {
  // Consumed solely by vite.ssr-admin-tests.config.ts's guarded fixture transform.
  var __FLBP_SSR_ADMIN_FIXTURE: { authenticated: boolean } | undefined;
}

class MemStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const session = new MemStorage();
const local = new MemStorage();
const networkAttempts: string[] = [];
Object.defineProperties(globalThis, {
  window: { value: globalThis, configurable: true },
  sessionStorage: { value: session, configurable: true },
  localStorage: { value: local, configurable: true },
  location: { value: new URL('https://ssr-fixture.invalid/'), configurable: true },
  navigator: { value: { language: 'it', languages: ['it'], userAgent: 'FLBP SSR fixture' }, configurable: true },
  document: { value: { visibilityState: 'visible', documentElement: { lang: 'it', classList: { contains: () => false } }, addEventListener() {}, removeEventListener() {} }, configurable: true },
  addEventListener: { value() {}, configurable: true },
  removeEventListener: { value() {}, configurable: true },
  WebSocket: { value: class {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    constructor(url: unknown) {
      networkAttempts.push('WebSocket: ' + String(url));
      throw new Error('SSR fixture forbids realtime connections.');
    }
  }, configurable: true },
  fetch: { value: async (input: unknown) => {
    networkAttempts.push(String(input));
    throw new Error('SSR fixture forbids all network requests.');
  }, configurable: true },
});

// Import after IO fixtures exist. App/translation context and every lazy tab
// remain the actual modules bundled from the current checkout.
const { AdminDashboard } = await import('./components/AdminDashboard');
const { ArchiveConfirmDialog } = await import('./components/admin/modals/ArchiveConfirmDialog');
const fixtureState = coerceAppState({
  teams: [
    { id: 'ssr-a', name: 'SSR Team Amber', player1: 'Rossi Marco', player2: 'Verdi Anna' },
    { id: 'ssr-b', name: 'SSR Team Blue', player1: 'Bianchi Luca', player2: 'Neri Sara' },
  ],
  tournament: {
    id: 'ssr-tournament', name: 'SSR Fixture Tournament', type: 'round_robin',
    teams: [
      { id: 'ssr-a', name: 'SSR Team Amber', player1: 'Rossi Marco', player2: 'Verdi Anna' },
      { id: 'ssr-b', name: 'SSR Team Blue', player1: 'Bianchi Luca', player2: 'Neri Sara' },
    ],
    config: {}, groups: [], rounds: [], matches: [],
  },
  tournamentMatches: [{
    id: 'ssr-match', code: 'SSR-R1', phase: 'groups', round: 1, orderIndex: 1,
    teamAId: 'ssr-a', teamBId: 'ssr-b', scoreA: 0, scoreB: 0,
    played: false, status: 'scheduled', isTieBreak: true, targetScore: 7, stats: [],
  }],
  tournamentHistory: [], hallOfFame: [], integrationsScorers: [], playerAliases: {}, logo: '',
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[char]!);
const text = (key: keyof typeof it) => {
  assert.equal(typeof it[key], 'string', `Missing Italian fixture label ${key}`);
  assert(it[key].length > 3, `Empty/non-distinct fixture label ${key}`);
  return escapeHtml(it[key]);
};
const tabMarkers = {
  teams: [`aria-label="${text('teams_actions_aria')}"`, 'SSR Team Amber'],
  data: [text('data_section_archive_players'), text('data_section_backup'), text('data_accounts_title'), text('data_section_technical')],
  reports: [text('admin_matches_enter_report'), text('reports_select_match_step'), text('reports_select_match_option'), 'SSR-R1'],
};
type Tab = keyof typeof tabMarkers;

const assertTab = (html: string, tab: Tab) => {
  assert(!html.includes('type="password"'), `${tab}: rendered the login gate instead of the selected tab`);
  for (const marker of tabMarkers[tab]) assert(html.includes(marker), `${tab}: missing tab content ${marker}`);
  if (tab === 'reports') assert(!/\{(?:shown|total|count)\}/.test(html), 'Reports must interpolate match counts and tie-break target.');
};

const render = async (tab: Tab | 'codes' | 'monitor_bracket' | 'monitor_groups' | 'structure' | 'closing', authenticated: boolean, state = fixtureState) => {
  session.clear(); local.clear();
  globalThis.__FLBP_SSR_ADMIN_FIXTURE = { authenticated };
  session.setItem('flbp_admin_section', tab === 'data' ? 'data' : 'live');
  session.setItem('flbp_admin_last_live_tab', tab === 'data' ? 'teams' : tab);
  session.setItem('flbp_admin_mode_bootstrapped', '1');
  if (authenticated) {
    local.setItem('flbp_supabase_access_token', 'ssr-fixture-token-never-sent');
    local.setItem('flbp_supabase_user_email', 'admin@ssr-fixture.invalid');
    local.setItem('flbp_supabase_user_id', 'ssr-fixture-admin');
    local.setItem('flbp_supabase_expires_at', '2099-01-01T00:00:00.000Z');
  }
  const errors: unknown[] = [];
  return await new Promise<string>((resolve, reject) => {
    const output = new PassThrough();
    let html = '';
    output.setEncoding('utf8');
    output.on('data', chunk => { html += chunk; });
    output.on('error', reject);
    output.on('end', () => {
      clearTimeout(timeout);
      if (errors.length) reject(new Error(`SSR ${tab}: ${errors.map(String).join('; ')}`));
      else resolve(html);
    });
    // Streaming waits for React.lazy. renderToString only emits Suspense
    // fallback markup when the requested tab has not been loaded yet.
    const stream = renderToPipeableStream(
      <AdminDashboard state={state} setState={() => { throw new Error('SSR must not mutate app state.'); }} onEnterTv={() => {}} />,
      {
        onAllReady() { stream.pipe(output); },
        onShellError(error) { clearTimeout(timeout); reject(error); },
        onError(error) { errors.push(error); },
      },
    );
    const timeout = setTimeout(() => {
      stream.abort();
      reject(new Error(`SSR ${tab}: lazy render did not settle within 15 seconds.`));
    }, 15_000);
  });
};

const requestedTab = process.env.TAB;
if (requestedTab && !(requestedTab in tabMarkers)) throw new Error(`Unsupported TAB=${requestedTab}. Use teams, data or reports.`);
const tabs: Tab[] = requestedTab ? [requestedTab as Tab] : ['teams', 'data', 'reports'];
const loginHtml = await render('teams', false);
assert(loginHtml.includes('type="password"'), 'Unauthenticated fixture must render the real login gate.');
for (const tab of Object.keys(tabMarkers) as Tab[]) {
  assert.throws(() => assertTab(loginHtml, tab), /login gate/, `${tab}: regression must reject the old login-only false positive`);
}
console.log(`PASS: unauthenticated login control (${loginHtml.length} bytes); rejected as all three Admin tabs.`);
const rendered = new Map<Tab, string>();
for (const tab of tabs) {
  const html = await render(tab, true);
  assertTab(html, tab);
  rendered.set(tab, html);
  console.log(`PASS: current-source Admin ${tab} content (${html.length} bytes).`);
}
for (const [actualTab, html] of rendered) {
  for (const expectedTab of Object.keys(tabMarkers) as Tab[]) {
    if (actualTab !== expectedTab) assert.throws(() => assertTab(html, expectedTab), /missing tab content/, `${actualTab} must not satisfy ${expectedTab}`);
  }
}
const hashes = [...rendered.values()].map(html => createHash('sha256').update(html).digest('hex'));
assert.equal(new Set(hashes).size, rendered.size, 'Different tabs must produce different content.');
if (!requestedTab) {
  const teams = Array.from({ length: 8 }, (_, i) => ({ id: 'team-' + i, name: 'TST Team ' + i, player1: 'TST Player ' + i }));
  const generated = generateTournamentStructure(teams, { mode: 'elimination', finalRoundRobin: { enabled: true, topTeams: 4 } });
  const qualifiers = reconcileBracketAdvancements(generated.matches.map(m => m.round === 1
    ? { ...m, played: true, status: 'finished' as const, scoreA: 10, scoreB: 4 } : m));
  const before = coerceAppState({ teams, tournament: generated.tournament, tournamentMatches: qualifiers });
  const structure = await render('structure', true, before);
  assert(/id="structure-group-count"[^>]*value="2"/.test(structure), 'An eight-team roster should start with two groups.');
  assert(structure.includes('Gironi da 4 squadre · 6 partite per girone'), 'The form explains the proposed group size.');
  const bracket = await render('monitor_bracket', true, before);
  const disabledTitle = 'disabled="" title="' + text('monitor_bracket_unavailable_until_tbd_resolved') + '"';
  assert(bracket.includes('B31') && bracket.split(disabledTitle).length === 3, 'Both actions on the empty final must be disabled.');
  const active = activateFinalRoundRobinStage(generated.tournament, qualifiers);
  const after = coerceAppState({ teams, tournament: active.tournament, tournamentMatches: active.matches });
  for (const tab of ['codes', 'reports', 'monitor_groups'] as const) {
    const html = await render(tab, true, after);
    assert(html.includes('F1') && !/B21|B22|B31/.test(html), tab + ' must show final-group fixtures and omit superseded matches.');
    if (tab === 'codes') assert(html.includes('10/10') || /10(?:<!-- -->)?\/(?:<!-- -->)?10/.test(html), 'Codes total must exclude the three replaced fixtures.');
    if (tab === 'monitor_groups') assert(html.includes(text('codes_search_aria')) && html.includes('Girone Finale'), 'The group monitor must render the activated final group.');
  }
  const closing = await render('closing', true, after);
  for (const key of ['admin_closing_standings', 'admin_closing_unplayed', 'archive_awards_summary'] as const) {
    assert(closing.includes(text(key)), 'Closing must include ' + key);
  }
  assert(closing.includes('F1'), 'Pending final group matches must be linked from Closing.');
  console.log('PASS: final-group schedule and TBD actions across four Admin tabs.');
}
{
  const confirmMarkup = (unplayedCount: number, champion?: string) => renderToStaticMarkup(
    <ArchiveConfirmDialog
      open
      tournamentName="SSR Cup"
      champion={champion}
      mvpNames={[]}
      unplayed={Array.from({ length: unplayedCount }, (_, index) => ({ id: 'm' + index, code: 'A' + index, scoreA: 0, scoreB: 0, played: false, status: 'scheduled' as const, phase: 'groups' as const }))}
      onConfirm={() => {}}
      onClose={() => {}}
      t={key => it[key] ?? key}
    />
  );
  const confirmButton = (html: string) => html.match(new RegExp('<button[^>]*>' + it.complete_tournament + '</button>'))?.[0] ?? '';
  const complete = confirmMarkup(0, 'SSR Team Amber');
  assert(complete.includes('SSR Cup') && complete.includes('SSR Team Amber'), 'The archive confirmation names the tournament and its winner.');
  assert(confirmButton(complete) && !confirmButton(complete).includes('disabled=""'), 'A complete tournament needs one confirmation.');
  assert(!complete.includes('type="checkbox"'), 'A complete tournament needs no acknowledgement.');
  const open = confirmMarkup(12, 'SSR Team Amber');
  assert(confirmButton(open).includes('disabled=""'), 'Unplayed matches keep the archive disabled until acknowledged.');
  assert(open.includes('type="checkbox"') && open.includes(it.admin_closing_unplayed) && open.includes('A9 · +2'), 'The dialog lists the first unplayed codes.');
  const noWinner = confirmMarkup(0);
  assert(confirmButton(noWinner).includes('disabled=""') && noWinner.includes(it.archive_confirm_no_winner), 'A missing winner also needs an acknowledgement.');
}

assert.equal(networkAttempts.length, 0, `Unexpected SSR IO: ${networkAttempts.join(', ')}`);
console.log(`SSR Admin passed: ${tabs.join(', ')}; distinct content, negative controls, no network IO.`);
