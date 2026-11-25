import React from 'react';
import { renderToString } from 'react-dom/server';
import { EditionEditor } from '../../components/admin/tabs/data/EditionEditor';
import { IntegrationsSubTab } from '../../components/admin/tabs/data/IntegrationsSubTab';
import { TournamentLeaderboard } from '../../components/TournamentLeaderboard';
import { Leaderboard } from '../../components/Leaderboard';
import { Home } from '../../components/Home';
import { dictionary } from '../../services/i18n/it';
import type { AppState } from '../../services/storageService';
import type { DataTabProps } from '../../components/admin/tabs/DataTab';

const state: AppState = { teams: [], matches: [], tournament: null, tournamentHistory: [], tournamentMatches: [], logo: '', hallOfFame: [{ id: 'mvp', tournamentId: 'manual_test', year: '2019', sourceTournamentDate: '2019-07-12', tournamentName: 'Coppa Test', type: 'mvp', playerNames: ['Rossi Mario'], playerBirthDate: '1994-07-13' }], integrationsScorers: [{ id: 'sc', name: 'Rossi Mario', birthDate: '1994-07-13', sourceTournamentId: 'manual_test', games: 4, points: 20, soffi: 2 }], playerAliases: {} };
const t = (key: string) => dictionary[key] || key;
const commitAdminStateDurably = async (next: AppState) => next;
const props = { state, setState: () => {}, commitAdminStateDurably, t, integrationsSubTab: 'tournaments', setIntegrationsSubTab: () => {}, renameTournamentEdition: async () => {} } as unknown as DataTabProps;
const cases: Array<[string, React.ReactElement, string]> = [
    ['new edition', <EditionEditor state={state} setState={() => {}} commitAdminStateDurably={commitAdminStateDurably} t={t} onBack={() => {}} onSaved={() => {}} onDirtyChange={() => {}} onSavingChange={() => {}} />, t('edition_new')],
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

// Titles in the standings: symbol and number, with the name only on hover.
const award = (id: string, type: 'winner' | 'top_scorer' | 'top_scorer_u25', year: string) => ({
    id, type, year, tournamentId: 'titles_' + year, tournamentName: 'Titoli ' + year, teamName: 'Squadra Test', playerNames: ['Rossi Mario'],
    playerIds: ['rossi_mario_1990-01-01'], playerBirthDates: ['1990-01-01'], playerId: 'rossi_mario_1990-01-01', playerBirthDate: '1990-01-01',
    sourceType: 'manual' as const, sourceTournamentDate: year + '-07-12', manuallyEdited: true,
});
const titledState: AppState = {
    ...state,
    hallOfFame: [award('w1', 'winner', '2021'), award('w2', 'winner', '2022'), award('s1', 'top_scorer', '2022'), award('u1', 'top_scorer_u25', '2021')],
    integrationsScorers: [{ id: 'rm', name: 'Rossi Mario', birthDate: '1990-01-01', games: 4, points: 20, soffi: 3, source: 'test', createdAt: 1, sourceTournamentId: 'titles_2022', sourceTournamentDate: '2022-07-12' }],
};
const standings = renderToString(<Leaderboard stateOverride={titledState} />);
const badges = [...standings.matchAll(new RegExp('<span role="img" title="([^"]+)" aria-label="([^"]+)"[^>]*>(.*?)</span></span>', 'g'))];
const label = (key: string) => [dictionary[key], key];
for (const [key, count] of [['edition_award_winner', 2], ['edition_award_top_scorer', 1], ['edition_award_top_scorer_u25', 1]] as const) {
    const badge = badges.find(([, title]) => label(key).includes(title));
    if (!badge) throw new Error('SSR missing title badge: ' + key);
    if (badge[2] !== badge[1] + ' ×' + count) throw new Error('SSR title badge must announce name and number: ' + badge[2]);
    const visible = badge[3].replace(new RegExp('<[^>]+>', 'g'), '');
    if (visible !== '×' + count) throw new Error('SSR title badge must show the number only: ' + visible);
}
const badgeClass = (key: string) => badges.find(([, title]) => label(key).includes(title))![0].match(/class="([^"]+)"/)![1];
if (badgeClass('edition_award_top_scorer') === badgeClass('edition_award_top_scorer_u25')) throw new Error('SSR Under 25 badge must be distinguishable without its name');
if (!standings.includes('<option value="2022">') || standings.includes('<option value="2021">')) throw new Error('SSR year filter must list only years with player statistics');
console.log('PASS SSR title badges and year filter');

// Home points to FantaBeerpong only while it is active for the live tournament.
const homeMarkup = (fanta?: { locked: boolean }, withLive = true) => renderToString(<Home onNavigate={() => {}} onOpenTournament={() => {}} recentTournaments={[]} fanta={fanta}
    liveTournament={withLive ? { id: 'live', name: 'Torneo Live', date: '2026-11-25', teamsCount: 16, formatLabel: 'Gironi' } : undefined} />);
const has = (html: string, key: string) => [dictionary[key], key].some(text => html.includes(text));
if (!has(homeMarkup({ locked: false }), 'home_fanta_open') || !has(homeMarkup({ locked: false }), 'home_fanta_action')) throw new Error('SSR Home must invite to FantaBeerpong before the first match');
if (!has(homeMarkup({ locked: true }), 'home_fanta_locked') || has(homeMarkup({ locked: true }), 'home_fanta_open')) throw new Error('SSR Home must say that Fanta teams are locked');
if (has(homeMarkup(), 'home_fanta_active') || has(homeMarkup({ locked: false }, false), 'home_fanta_active')) throw new Error('SSR Home must not mention FantaBeerpong when it is off or there is no live tournament');
console.log('PASS SSR Home FantaBeerpong notice');
