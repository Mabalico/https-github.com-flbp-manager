import type { AppState } from './storageService';

export const hasMeaningfulAppState = (state: AppState | null | undefined): boolean => {
  if (!state) return false;
  return !!(
    state.tournament ||
    (state.tournamentMatches || []).length ||
    (state.tournamentHistory || []).length ||
    (state.hallOfFame || []).length ||
    (state.integrationsScorers || []).length ||
    Object.keys(state.playerAliases || {}).length ||
    (state.teams || []).length ||
    (state.matches || []).length ||
    (state.logo || '').trim()
  );
};
