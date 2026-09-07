import type { AppState } from './storageService';

export interface TournamentRenameResult {
    state: AppState;
    tournamentId: string;
    previousName: string;
    nextName: string;
    liveUpdated: boolean;
    historyUpdated: boolean;
    hallOfFameUpdated: number;
    integrationsScorersUpdated: number;
}

const cleanTournamentName = (value: unknown): string => String(value || '').trim();

const sameText = (left: unknown, right: unknown): boolean => (
    cleanTournamentName(left).localeCompare(cleanTournamentName(right), 'it', { sensitivity: 'base' }) === 0
);

/**
 * Renames one tournament edition without changing its stable id or competition data.
 * Linked display labels are kept aligned so history, Hall of Fame and player
 * provenance do not keep showing the previous title.
 */
export const renameTournamentInState = (
    state: AppState,
    tournamentId: string,
    requestedName: string,
): TournamentRenameResult => {
    const safeTournamentId = String(tournamentId || '').trim();
    const nextName = cleanTournamentName(requestedName);

    if (!safeTournamentId) throw new Error('Seleziona un torneo da rinominare.');
    if (!nextName) throw new Error('Inserisci il nome del torneo.');

    const liveTournament = state.tournament?.id === safeTournamentId ? state.tournament : null;
    const historyTournament = (state.tournamentHistory || []).find((tournament) => tournament.id === safeTournamentId) || null;
    const titleEdition = (state.hallOfFame || []).find(entry => entry.tournamentId === safeTournamentId);
    if (!liveTournament && !historyTournament && !titleEdition) {
        throw new Error('Il torneo selezionato non esiste più. Ricarica i dati e riprova.');
    }

    const previousName = cleanTournamentName(liveTournament?.name || historyTournament?.name || titleEdition?.tournamentName);
    const previousNames = new Set(
        [liveTournament?.name, historyTournament?.name, titleEdition?.tournamentName]
            .map(cleanTournamentName)
            .filter(Boolean)
    );

    const nextTournament = liveTournament
        ? { ...state.tournament!, name: nextName }
        : state.tournament;
    const nextHistory = (state.tournamentHistory || []).map((tournament) => (
        tournament.id === safeTournamentId
            ? { ...tournament, name: nextName }
            : tournament
    ));

    let hallOfFameUpdated = 0;
    const nextHallOfFame = (state.hallOfFame || []).map((entry) => {
        const ownsTournament = String(entry.tournamentId || '').trim() === safeTournamentId;
        const referencesTournament = String(entry.sourceTournamentId || '').trim() === safeTournamentId;
        if (!ownsTournament && !referencesTournament) return entry;
        hallOfFameUpdated += 1;
        return {
            ...entry,
            ...(ownsTournament ? { tournamentName: nextName } : {}),
            ...(referencesTournament ? { sourceTournamentName: nextName } : {}),
        };
    });

    let integrationsScorersUpdated = 0;
    const nextIntegrationsScorers = (state.integrationsScorers || []).map((entry) => {
        if (String(entry.sourceTournamentId || '').trim() !== safeTournamentId) return entry;
        integrationsScorersUpdated += 1;
        const sourceWasTournamentName = [...previousNames].some((name) => sameText(entry.source, name));
        return {
            ...entry,
            sourceLabel: nextName,
            ...(sourceWasTournamentName ? { source: nextName } : {}),
        };
    });

    return {
        state: {
            ...state,
            tournament: nextTournament,
            tournamentHistory: nextHistory,
            hallOfFame: nextHallOfFame,
            integrationsScorers: nextIntegrationsScorers,
        },
        tournamentId: safeTournamentId,
        previousName,
        nextName,
        liveUpdated: !!liveTournament,
        historyUpdated: !!historyTournament,
        hallOfFameUpdated,
        integrationsScorersUpdated,
    };
};
