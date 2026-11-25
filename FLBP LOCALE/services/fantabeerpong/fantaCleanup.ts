import type { AppState } from '../storageService';
import type { FantaTournamentDataSummary } from '../supabaseRest';

const PRE_TOURNAMENT_ID = '__pre_tournament__';

/**
 * Fanta data an admin may remove: `orphans` belong to no known tournament, `archived` to a
 * tournament of the history. The live tournament and the Pretorneo rosters are never listed.
 */
export const splitFantaCleanupRows = (
    rows: FantaTournamentDataSummary[],
    state: Pick<AppState, 'tournament' | 'tournamentHistory'>,
): { orphans: FantaTournamentDataSummary[]; archived: FantaTournamentDataSummary[] } => {
    const liveId = String(state.tournament?.id || '').trim();
    const history = new Map((state.tournamentHistory || []).map(tournament => [String(tournament?.id || '').trim(), tournament]));
    const removable = rows.filter(row => row.tournamentId !== PRE_TOURNAMENT_ID && row.tournamentId !== liveId);
    return {
        orphans: removable.filter(row => !history.has(row.tournamentId)),
        // Without its edition row the Fanta data only carry an id: the history knows the name.
        archived: removable.filter(row => history.has(row.tournamentId)).map(row => row.archivedEditions ? row : {
            ...row,
            tournamentName: history.get(row.tournamentId)?.name || row.tournamentName,
            startDate: history.get(row.tournamentId)?.startDate || row.startDate,
        }),
    };
};
