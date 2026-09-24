import React from 'react';
import { renderToString } from 'react-dom/server';
import { EditionEditor } from '../../components/admin/tabs/data/EditionEditor';
import { IntegrationsSubTab } from '../../components/admin/tabs/data/IntegrationsSubTab';
import { TournamentLeaderboard } from '../../components/TournamentLeaderboard';
import { Leaderboard } from '../../components/Leaderboard';
import { dictionary } from '../../services/i18n/it';
import type { AppState } from '../../services/storageService';
import type { DataTabProps } from '../../components/admin/tabs/DataTab';

const state: AppState = { teams: [], matches: [], tournament: null, tournamentHistory: [], tournamentMatches: [], logo: '', hallOfFame: [{ id: 'mvp', tournamentId: 'manual_test', year: '2019', sourceTournamentDate: '2019-07-12', tournamentName: 'Coppa Test', type: 'mvp', playerNames: ['Rossi Mario'], playerBirthDate: '1994-07-13' }], integrationsScorers: [{ id: 'sc', name: 'Rossi Mario', birthDate: '1994-07-13', sourceTournamentId: 'manual_test', games: 4, points: 20, soffi: 2 }], playerAliases: {} };
const t = (key: string) => dictionary[key] || key;
const commitAdminStateDurably = async (next: AppState) => next;
const props = { state, setState: () => {}, commitAdminStateDurably, t, integrationsSubTab: 'tournaments', setIntegrationsSubTab: () => {}, renameTournamentEdition: async () => {} } as unknown as DataTabProps;
const cases: Array<[string, React.ReactElement, string]> = [
    ['new edition', <EditionEditor state={state} setState={() => {}} commitAdminStateDurably={commitAdminStateDurably} t={t} onBack={() => {}} onSaved={() => {}} onDirtyChange={() => {}} onSavingChange={() => {}} />, 'Nuova edizione'],
    ['MVP-only edit', <EditionEditor state={state} setState={() => {}} commitAdminStateDurably={commitAdminStateDurably} t={t} editionId="manual_test" onBack={() => {}} onSaved={() => {}} onDirtyChange={() => {}} onSavingChange={() => {}} />, 'Coppa Test'],
    ['edition list', <IntegrationsSubTab {...props} />, 'Coppa Test'],
    ['imported tournament standings', <TournamentLeaderboard teams={[]} matches={[]} integrations={state.integrationsScorers} tournamentDate="2019-07-12" variant="page" />, 'Rossi Mario'],
    ['career standings', <Leaderboard stateOverride={state} />, 'Rossi Mario'],
];
for (const [name, component, expected] of cases) {
    const html = renderToString(component);
    if (!html.includes(expected)) throw new Error(`SSR missing content: ${name}`);
    console.log(`PASS SSR ${name}`);
}
