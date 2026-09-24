// Isolated development fixture: all service requests are intercepted, no real DB.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DbSyncPanel } from '../../components/admin/tabs/data/DbSyncPanel';
import { coerceAppState } from '../../services/storageService';
import { setSupabaseSession } from '../../services/supabaseRest';
import { markDbSyncConflict } from '../../services/dbDiagnostics';
import type { AdminCommitOptions } from '../../services/repository/AppStateRepository';
import '../../styles.css';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const database = coerceAppState({
  logo: 'database-current',
  tournamentHistory: [{ id: 'edition', name: 'Torneo 05/09/2026', startDate: '2026-09-05', type: 'round_robin',
    teams: [], matches: [{ id: 'finished-match', scoreA: 10, scoreB: 8, played: true }] }],
});
const localDraft = coerceAppState({ ...database, logo: 'stale-draft',
  tournamentHistory: [{ ...database.tournamentHistory[0], name: 'XIV Torneo Beer Pong' }],
  hallOfFame: [{ id: 'fixture-title', tournamentId: 'manual_fixture', tournamentName: 'Coppa dei Campioni',
    type: 'winner', sourceType: 'manual', year: '2026', sourceTournamentDate: '2026-09-06', teamName: 'Squadra demo', playerNames: ['Demo Uno', 'Demo Due'] }],
});
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/api/v1/discovery')) return Response.json({ active: true, workspaceId: 'default', primaryEpoch: 9 });
  if (url.endsWith('/control/local-session')) return Response.json({ token: 'fixture-local-token' });
  if (url.endsWith('/api/v1/admin/workspace/default')) return Response.json({ workspace_id: 'default', state: database, version: 40, updated_at: '2026-09-10T12:00:40.000Z' });
  if (url.includes('flbp_is_admin')) return Response.json(true);
  if (url.includes('admin_users')) return Response.json([{ user_id: 'fixture-admin' }]);
  if (url.includes('/auth/v1/user')) return Response.json({ id: 'fixture-admin', email: 'demo@example.test' });
  throw new Error(`Fixture blocked network request: ${url}`);
};
setSupabaseSession({ accessToken: 'fixture-token', refreshToken: 'fixture-refresh', userId: 'fixture-admin', email: 'demo@example.test', expiresAt: Date.now() + 3_600_000 });
markDbSyncConflict('Bozza precedente: confronto richiesto');
const Fixture = () => {
  const [state, setState] = React.useState(localDraft);
  const [commits, setCommits] = React.useState(0);
  const [fail, setFail] = React.useState(false);
  const commit = async (next: typeof state, _source: string, options?: AdminCommitOptions) => {
    if (!options?.reviewedDraft || next.logo !== database.logo || next.tournamentHistory[0].matches?.[0].scoreB !== 8) {
      throw new Error('Fixture: dati confermati non preservati');
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    if (fail) throw new Error('Errore simulato: bozza conservata, riprova.');
    setCommits(count => count + 1);
    return next;
  };
  return <main className="mx-auto max-w-5xl space-y-4 p-6">
    <p className="rounded-xl bg-amber-100 p-3 font-bold">Prova con dati inventati. Nessuna scrittura su database.</p>
    <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} /> Simula errore di salvataggio</label>
    <DbSyncPanel state={state} setState={setState} commitAdminStateDurably={commit} />
    <output aria-label="Risultato della prova">{JSON.stringify({ commits, titles: state.hallOfFame.length, name: state.tournamentHistory[0].name, logo: state.logo })}</output>
  </main>;
};
createRoot(document.getElementById('root')!).render(<Fixture />);
