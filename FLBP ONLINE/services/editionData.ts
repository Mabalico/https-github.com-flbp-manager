import type { AppState } from './storageService';
import type { HallOfFameEntry, IntegrationScorerEntry, Match, TournamentData } from '../types';
import { hasCountedPlayerStats } from './matchUtils';
import { getPlayerKey, getPlayerKeyLabel, isU25, normalizeBirthDateInput, resolvePlayerKey } from './playerIdentity';
import { selectMetricAwardWinners, type MetricAwardPlayer } from './awardRules';

export interface EditionSummary {
    id: string;
    name: string;
    date: string;
    year: string;
    live: boolean;
    tournament?: TournamentData;
    awards: HallOfFameEntry[];
    scorers: IntegrationScorerEntry[];
}

/** A view over existing records, never a migration to empty tournament structures. */
export const listEditions = (state: AppState): EditionSummary[] => {
    const rows = new Map<string, EditionSummary>();
    const add = (id: string, name: string, date = '', year = '') => {
        date = String(date || '');
        name = String(name || '');
        date = normalizeBirthDateInput(date.slice(0, 10)) || date;
        if (!rows.has(id)) rows.set(id, { id, name, date, year: date.slice(0, 4) || year, live: false, awards: [], scorers: [] });
        return rows.get(id)!;
    };
    [state.tournament, ...(state.tournamentHistory || [])].filter(Boolean).forEach(tournament => {
        const row = add(tournament!.id, tournament!.name, tournament!.startDate);
        row.tournament = tournament!;
        row.live = state.tournament?.id === tournament!.id;
    });
    (state.hallOfFame || []).forEach(entry => {
        if (!entry.tournamentId) return;
        const row = add(entry.tournamentId, entry.tournamentName, entry.sourceTournamentDate, entry.year);
        if (!row.date && entry.sourceTournamentDate) row.date = normalizeBirthDateInput(String(entry.sourceTournamentDate).slice(0, 10)) || entry.sourceTournamentDate;
        row.awards.push(entry);
    });
    (state.integrationsScorers || []).forEach(entry => {
        if (!entry.sourceTournamentId) return;
        add(entry.sourceTournamentId, entry.sourceLabel || entry.source || entry.sourceTournamentId, entry.sourceTournamentDate).scorers.push(entry);
    });
    return [...rows.values()].sort((a, b) => Number(b.live) - Number(a.live) || (b.date || b.year).localeCompare(a.date || a.year) || a.name.localeCompare(b.name));
};

export const editionMatches = (state: AppState, id: string): Match[] => {
    if (state.tournament?.id === id) return state.tournamentMatches || [];
    const tournament = (state.tournamentHistory || []).find(row => row.id === id);
    return tournament?.matches?.length ? tournament.matches : tournament?.rounds?.flat() || [];
};

export const editionHasResults = (state: AppState, id: string) => editionMatches(state, id).some(match =>
    !match.hidden && !match.isBye && (match.played || match.status === 'finished' || !!match.stats?.length || !!match.scoreA || !!match.scoreB));

/** Linked totals are an alternative source for an edition with no recorded player statistics. */
export const countedIntegrations = (state: AppState, year?: string) => {
    const dates = new Map(listEditions(state).map(row => [row.id, row.date || row.year]));
    const recorded = new Set([...dates.keys()].filter(id => editionMatches(state, id).some(m => hasCountedPlayerStats(m) && !!m.stats?.length)));
    return (state.integrationsScorers || []).filter(entry => {
        if (entry.sourceTournamentId && recorded.has(entry.sourceTournamentId)) return false;
        const date = (entry.sourceTournamentId && dates.get(entry.sourceTournamentId)) || entry.sourceTournamentDate;
        return !year || date?.slice(0, 4) === year;
    });
};

export const replaceEditionScorers = (state: AppState, id: string, name: string, date: string, entries: IntegrationScorerEntry[]): IntegrationScorerEntry[] => {
    if (editionHasResults(state, id)) throw new Error('edition_import_has_results');
    return [
        ...(state.integrationsScorers || []).filter(entry => entry.sourceTournamentId !== id),
        ...entries.map(entry => ({ ...entry, sourceTournamentId: id, sourceTournamentDate: date, sourceLabel: name })),
    ];
};

export const rankEditionScorers = (state: AppState, entries: IntegrationScorerEntry[], date: string, metric: 'points' | 'soffi', u25 = false): MetricAwardPlayer[] => {
    const players = new Map<string, MetricAwardPlayer>();
    entries.forEach(entry => {
        const id = resolvePlayerKey(state, getPlayerKey(entry.name, entry.birthDate || 'ND'));
        const current = players.get(id);
        if (current) { current.games += entry.games; current.points += entry.points; current.soffi += entry.soffi; }
        else players.set(id, { ...entry, playerId: id, birthDate: normalizeBirthDateInput(getPlayerKeyLabel(id).yob) || entry.birthDate });
    });
    return selectMetricAwardWinners([...players.values()].filter(entry => !u25 || isU25(entry.birthDate, date)), metric);
};

export const validateEditionAwards = (name: string, date: string, awards: HallOfFameEntry[], allowLegacyYear = false) => {
    if (!name.trim()) throw new Error('edition_name_required');
    if (!normalizeBirthDateInput(date) && !allowLegacyYear) throw new Error('edition_date_required');
    if (!awards.length) throw new Error('edition_award_required');
    const assigned = new Set<string>();
    for (const award of awards) {
        award.playerNames.forEach((name, index) => {
            const playerId = award.playerIds?.[index] || (index === 0 && award.playerId) || getPlayerKey(name, award.playerBirthDates?.[index] || award.playerBirthDate || 'ND');
            const key = `${award.type}:${playerId}`;
            if (assigned.has(key)) throw new Error('edition_duplicate_player');
            assigned.add(key);
        });
        if (award.type !== 'winner' && !award.playerNames.some(name => name.trim())) throw new Error('edition_player_required');
        if (award.type === 'winner' && !award.teamName?.trim()) throw new Error('edition_team_required');
    }
};

/** Include title-only editions in public navigation without changing the stored archive. */
export const publicEditionHistory = (state: AppState): TournamentData[] => listEditions(state)
    .filter(row => !row.live)
    .map(row => row.tournament || ({
        id: row.id, name: row.name, startDate: row.date, type: 'round_robin', isManual: true,
        teams: [], matches: [], config: { advancingPerGroup: 0, resultsOnly: false },
    } as TournamentData));
