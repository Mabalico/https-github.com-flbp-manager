import type { TournamentData } from '../types';

export const isResultsOnlyTournament = (tournament?: TournamentData | null): boolean =>
  !!tournament?.config?.resultsOnly;
