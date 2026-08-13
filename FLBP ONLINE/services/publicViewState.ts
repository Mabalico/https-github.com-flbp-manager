import type { AppState } from './storageService';

/**
 * Once the public Supabase mirror has answered, it is authoritative for public
 * and TV routes. Admin cursor timestamps live in browser storage and can remain
 * ahead after a local-tournament session; using them here would pin public
 * pages to an older full-workspace snapshot until that browser state is reset.
 */
export const mergePublicViewState = (
  localState: AppState,
  publicState: AppState | null,
): AppState => {
  if (!publicState) return localState;

  const publicHistory = Array.isArray(publicState.tournamentHistory) ? publicState.tournamentHistory : [];
  const localHistory = Array.isArray(localState.tournamentHistory) ? localState.tournamentHistory : [];
  const publicHall = Array.isArray(publicState.hallOfFame) ? publicState.hallOfFame : [];
  const localHall = Array.isArray(localState.hallOfFame) ? localState.hallOfFame : [];
  const publicScorers = Array.isArray(publicState.integrationsScorers) ? publicState.integrationsScorers : [];
  const localScorers = Array.isArray(localState.integrationsScorers) ? localState.integrationsScorers : [];
  const publicAliases = publicState.playerAliases && Object.keys(publicState.playerAliases).length
    ? publicState.playerAliases
    : localState.playerAliases;

  return {
    ...localState,
    ...publicState,
    tournament: publicState.tournament ?? localState.tournament,
    tournamentMatches: (publicState.tournamentMatches && publicState.tournamentMatches.length)
      ? publicState.tournamentMatches
      : localState.tournamentMatches,
    tournamentHistory: publicHistory.length ? publicHistory : localHistory,
    hallOfFame: publicHall.length ? publicHall : localHall,
    integrationsScorers: publicScorers.length ? publicScorers : localScorers,
    playerAliases: publicAliases || {},
    logo: publicState.logo || localState.logo || '',
  };
};
