import type { AppState } from './storageService';
import type { TournamentData } from '../types';
import { getPlayerKey, resolvePlayerKey } from './playerIdentity';

export interface ArchivedTournamentDeleteSummary {
  removedTournament: number;
  removedHallOfFameEntries: number;
  removedMatchStats: number;
  affectedPlayers: number;
}

export interface ArchivedTournamentDeleteResult {
  state: AppState;
  tournament: TournamentData;
  summary: ArchivedTournamentDeleteSummary;
}

const buildAffectedPlayersSet = (state: AppState, tournament: TournamentData): Set<string> => {
  const affected = new Set<string>();
  const matches = (tournament.matches || []).length ? (tournament.matches || []) : (tournament.rounds || []).flat();
  const add = (name?: string, yob?: number) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    affected.add(resolvePlayerKey(state, getPlayerKey(trimmed, (yob as any) ?? 'ND')));
  };

  (tournament.teams || []).forEach((team) => {
    add(team.player1, team.player1YoB);
    add(team.player2, team.player2YoB);
  });

  matches.forEach((match) => {
    (match.stats || []).forEach((row) => {
      const team = (tournament.teams || []).find((candidate) => candidate.id === row.teamId);
      const yob =
        team && team.player1 === row.playerName
          ? team.player1YoB
          : team && team.player2 === row.playerName
            ? team.player2YoB
            : undefined;
      add(row.playerName, yob);
    });
  });

  (state.hallOfFame || [])
    .filter((entry) => entry.tournamentId === tournament.id)
    .forEach((entry) => {
      if (entry.playerId) {
        affected.add(resolvePlayerKey(state, entry.playerId));
      }
      (entry.playerNames || []).forEach((name) => add(name));
    });

  return affected;
};

export const getArchivedTournamentDeleteImpact = (
  state: AppState,
  tournamentId: string
): ArchivedTournamentDeleteSummary => {
  const tournament = (state.tournamentHistory || []).find((entry) => entry.id === tournamentId);
  if (!tournament) {
    throw new Error('Torneo archiviato non trovato.');
  }

  const removedHallOfFameEntries = (state.hallOfFame || []).filter((entry) => entry.tournamentId === tournament.id).length;
  const matches = (tournament.matches || []).length ? (tournament.matches || []) : (tournament.rounds || []).flat();
  const removedMatchStats = matches.reduce((acc, match) => acc + ((match.stats || []).length), 0);
  const affectedPlayers = buildAffectedPlayersSet(state, tournament).size;

  return {
    removedTournament: 1,
    removedHallOfFameEntries,
    removedMatchStats,
    affectedPlayers,
  };
};

export const removeArchivedTournamentDeep = (
  state: AppState,
  tournamentId: string
): ArchivedTournamentDeleteResult => {
  const tournament = (state.tournamentHistory || []).find((entry) => entry.id === tournamentId);
  if (!tournament) {
    throw new Error('Torneo archiviato non trovato.');
  }

  const summary = getArchivedTournamentDeleteImpact(state, tournamentId);

  return {
    tournament,
    summary,
    state: {
      ...state,
      tournamentHistory: (state.tournamentHistory || []).filter((entry) => entry.id !== tournamentId),
      hallOfFame: (state.hallOfFame || []).filter((entry) => entry.tournamentId !== tournamentId),
    },
  };
};
