import React from 'react';
import { renderToString } from 'react-dom/server';
import { EditionEditor } from '../../components/admin/tabs/data/EditionEditor';
import { IntegrationsSubTab } from '../../components/admin/tabs/data/IntegrationsSubTab';
import { TournamentLeaderboard } from '../../components/TournamentLeaderboard';
import { Leaderboard } from '../../components/Leaderboard';
import { Home } from '../../components/Home';
import { getFantaHomeNotice } from '../../services/fantabeerpong/homeNotice';
import { splitFantaCleanupRows } from '../../services/fantabeerpong/fantaCleanup';
import { FantaArchivedEditions } from '../../components/admin/tabs/data/FantaArchivedEditions';
import { TournamentBracket } from '../../components/TournamentBracket';
import { IntegrationsTournaments } from '../../components/admin/tabs/data/IntegrationsTournaments';
import { LocalModeRecoveryNotice } from '../../components/admin/LocalModeRecoveryNotice';
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

// Home points to FantaBeerpong while it is active, before and during a tournament.
const homeMarkup = (fanta?: { locked: boolean }, withLive = true) => renderToString(<Home onNavigate={() => {}} onOpenTournament={() => {}} recentTournaments={[]} fanta={fanta}
    liveTournament={withLive ? { id: 'live', name: 'Torneo Live', date: '2026-11-25', teamsCount: 16, formatLabel: 'Gironi' } : undefined} />);
const has = (html: string, key: string) => [dictionary[key], key].some(text => html.includes(text));
if (!has(homeMarkup({ locked: false }), 'home_fanta_open') || !has(homeMarkup({ locked: false }), 'home_fanta_action') || !has(homeMarkup({ locked: false }), 'fanta_pool_note')) throw new Error('SSR Home must invite to FantaBeerpong before the first match');
if (!has(homeMarkup({ locked: true }), 'home_fanta_locked') || has(homeMarkup({ locked: true }), 'home_fanta_open') || has(homeMarkup({ locked: true }), 'fanta_pool_note')) throw new Error('SSR Home must say that Fanta teams are locked');
if (!has(homeMarkup({ locked: false }, false), 'home_fanta_open')) throw new Error('SSR Home must invite to FantaBeerpong before the tournament too');
if (has(homeMarkup(), 'home_fanta_active') || has(homeMarkup(undefined, false), 'home_fanta_active')) throw new Error('SSR Home must not mention FantaBeerpong when it is off');
const fantaTeams = [{ id: 'a', name: 'Alfa', player1: 'A Uno', player2: 'A Due', createdAt: 1 }, { id: 'b', name: 'Beta', player1: 'B Uno', player2: 'B Due', createdAt: 2 }];
const fantaMatch = { id: 'm1', scoreA: 0, scoreB: 0, played: false, status: 'scheduled' as const, phase: 'bracket' as const, teamAId: 'a', teamBId: 'b' };
const fantaLive = { id: 'live', name: 'Live', startDate: '2026-11-25', type: 'elimination' as const, config: { advancingPerGroup: 0 }, teams: fantaTeams };
const notice = (patch: Partial<AppState>) => JSON.stringify(getFantaHomeNotice({ ...state, teams: fantaTeams, fantaSettings: { enabled: true }, ...patch }));
for (const [label, actual, expected] of [
    ['pre-tournament with players', notice({}), '{"locked":false}'],
    ['pre-tournament without enough players', notice({ teams: fantaTeams.slice(0, 1) }), undefined],
    ['pre-tournament with hidden teams only', notice({ teams: fantaTeams.map(team => ({ ...team, hidden: true })) }), undefined],
    ['Fanta off', notice({ fantaSettings: { enabled: false } }), undefined],
    ['live before the first match', notice({ tournament: fantaLive, tournamentMatches: [fantaMatch] }), '{"locked":false}'],
    ['live after the first match', notice({ tournament: fantaLive, tournamentMatches: [{ ...fantaMatch, status: 'playing' }] }), '{"locked":true}'],
    ['live with a bye only', notice({ tournament: fantaLive, tournamentMatches: [{ ...fantaMatch, isBye: true, status: 'finished', played: true }] }), '{"locked":false}'],
    ['results-only live', notice({ tournament: { ...fantaLive, config: { advancingPerGroup: 0, resultsOnly: true } }, tournamentMatches: [fantaMatch] }), undefined],
] as const) if (actual !== expected) throw new Error('Fanta Home notice: ' + label + ' -> ' + actual);
console.log('PASS SSR Home FantaBeerpong notice');

// Fanta maintenance: only finished tournaments and orphans can be cleaned.
const fantaRow = (tournamentId: string) => ({ tournamentId, tournamentName: 'Torneo ' + tournamentId, startDate: null, archivedEditions: 1, archivedStandings: 2, archivedPlayers: 6, fantaTeams: 2, sampleTeamNames: ['Squadra di prova'], publicTournamentExists: true, totalRows: 11 });
const cleanup = splitFantaCleanupRows(['past', 'live', 'gone', '__pre_tournament__'].map(fantaRow), { tournament: fantaLive, tournamentHistory: [{ ...fantaLive, id: 'past' }, fantaLive] });
const ids = (rows: Array<{ tournamentId: string }>) => rows.map(row => row.tournamentId).join();
if (splitFantaCleanupRows([{ ...fantaRow('past'), archivedEditions: 0 }], { tournament: null, tournamentHistory: [{ ...fantaLive, id: 'past' }] }).archived[0]?.tournamentName !== 'Live') throw new Error('Fanta cleanup must name leftover data after its tournament');
if (ids(cleanup.archived) !== 'past' || ids(cleanup.orphans) !== 'gone') throw new Error('Fanta cleanup must never offer the live tournament or the Pretorneo: ' + ids(cleanup.archived) + ' / ' + ids(cleanup.orphans));
const cleanupMarkup = renderToString(<FantaArchivedEditions rows={cleanup.archived} busyId={null} formatDate={() => 'data'} onDelete={() => {}} t={t} />);
if (!cleanupMarkup.includes('Torneo past') || !cleanupMarkup.includes('Squadra di prova') || !has(cleanupMarkup, 'fanta_archived_delete')) throw new Error('SSR Fanta cleanup must identify the edition to delete');
if (renderToString(<FantaArchivedEditions rows={[]} busyId={null} formatDate={() => ''} onDelete={() => {}} t={t} />)) throw new Error('SSR Fanta cleanup must stay hidden without editions');
console.log('PASS SSR Fanta maintenance');

// Round labels stick to the top edge of a scrolling bracket: a top padding would show matches above them.
for (const readOnly of [true, false]) {
    const zoomed = renderToString(<TournamentBracket teams={fantaTeams} data={{ ...fantaLive, rounds: [[fantaMatch]] }} matches={[fantaMatch]} readOnly={readOnly} showConnectors boundedScroll scale={1.3} />);
    if (zoomed.includes('sticky top-0')) throw new Error('SSR zoomed bracket must not stick its round labels over the matches');
    const bracket = renderToString(<TournamentBracket teams={fantaTeams} data={{ ...fantaLive, rounds: [[fantaMatch]] }} matches={[fantaMatch]} readOnly={readOnly} showConnectors boundedScroll />);
    const container = bracket.match(new RegExp('data-bracket-scroll="true" class="([^"]+)"'))?.[1] || '';
    if (!container.includes('overflow-auto') || new RegExp('(^|[ :])p[ty]?-').test(container) || !bracket.includes('sticky top-0')) throw new Error('SSR scrolling bracket must have no top padding: ' + container);
}
console.log('PASS SSR scrolling bracket');

// Same name and day are a possible duplicate only with the same winner.
const socio = (id: string, team: string) => ({ ...fantaLive, id, name: 'Torneo Soci', startDate: '2025-11-15', teams: [] });
const winnerOf = (id: string, team: string) => ({ ...award(id + '-w', 'winner', '2025'), tournamentId: id, tournamentName: 'Torneo Soci', teamName: team, sourceTournamentDate: '2025-11-15' });
const duplicateMarkup = (teams: [string, string]) => renderToString(<IntegrationsTournaments state={{ ...state, tournamentHistory: [socio('soci-1', teams[0]), socio('soci-2', teams[1])], hallOfFame: [winnerOf('soci-1', teams[0]), winnerOf('soci-2', teams[1])] }} t={t} renameTournamentEdition={async () => {}} onOpen={() => {}} onAdd={() => {}} />);
if (has(duplicateMarkup(['Squadra Uno', 'Squadra Due']), 'edition_possible_duplicate')) throw new Error('SSR two tournaments with different winners are not duplicates');
if (!has(duplicateMarkup(['Squadra Uno', 'Squadra Uno']), 'edition_possible_duplicate')) throw new Error('SSR same name, day and winner must be flagged');
console.log('PASS SSR possible duplicates');

// A coordinator that does not answer is not blamed on the tournament PC.
const unreachable = renderToString(<LocalModeRecoveryNotice recovery={{ reason: 'unreachable', epoch: null }} busy={false} onReclaim={() => {}} />);
if (unreachable.includes('PC del torneo') || !unreachable.includes('database')) throw new Error('SSR unreachable coordinator must not mention the tournament PC');
if (!renderToString(<LocalModeRecoveryNotice recovery={{ reason: 'unavailable', epoch: 3 }} busy={false} onReclaim={() => {}} />).includes('PC del torneo')) throw new Error('SSR a PC still holding the data keeps its own message');
console.log('PASS SSR data plane notice');
