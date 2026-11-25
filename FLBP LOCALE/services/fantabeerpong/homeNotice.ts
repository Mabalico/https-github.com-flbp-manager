import type { AppState } from '../storageService';
import { isResultsOnlyTournament } from '../tournamentModes';

/** Same threshold the Fanta page uses to open pre-tournament registrations. */
const MIN_PRETOURNAMENT_PLAYERS = 4;

/**
 * FantaBeerpong notice for Home: before a tournament it appears once there are
 * players to choose from, and during a live tournament until it is archived.
 */
export const getFantaHomeNotice = (
    state: Pick<AppState, 'fantaSettings' | 'teams' | 'tournament' | 'tournamentMatches'>,
): { locked: boolean } | undefined => {
    if (state.fantaSettings?.enabled !== true) return undefined;
    if (state.tournament) {
        if (isResultsOnlyTournament(state.tournament)) return undefined;
        // The first match locks the rosters.
        return {
            locked: (state.tournamentMatches || []).some(match =>
                !match.hidden && !match.isBye && (match.played || match.status !== 'scheduled')),
        };
    }
    const players = (state.teams || [])
        .filter(team => !team.hidden && !team.isBye)
        .reduce((total, team) => total + [team.player1, team.player2].filter(name => String(name || '').trim()).length, 0);
    return players >= MIN_PRETOURNAMENT_PLAYERS ? { locked: false } : undefined;
};
