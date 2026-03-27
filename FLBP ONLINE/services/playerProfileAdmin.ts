import type { AppState } from './storageService';
import type { HallOfFameEntry, Match, Team, TournamentData } from '../types';
import { deriveYoBFromBirthDate, getPlayerKey, normalizeBirthDateInput, pickPlayerIdentityValue, resolvePlayerKey } from './playerIdentity';

interface UpdatePlayerProfileIdentityInput {
  currentPlayerId: string;
  nextPlayerName: string;
  nextBirthDate?: string | null;
}

const getTeamSlotIdentity = (team: Team, slot: 1 | 2) => {
  const name = slot === 1 ? team.player1 : team.player2 || '';
  const yob = slot === 1 ? team.player1YoB : team.player2YoB;
  const birthDate = slot === 1 ? (team as any).player1BirthDate : (team as any).player2BirthDate;
  return {
    name,
    yob,
    birthDate,
    rawKey: getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob)),
  };
};

const rewriteTeam = (
  state: AppState,
  team: Team,
  currentPlayerId: string,
  nextPlayerName: string,
  changeLog: Map<string, string>,
  nextBirthDate?: string,
  nextYoB?: number
): Team => {
  let nextTeam: Team = { ...team };
  ([1, 2] as const).forEach((slot) => {
    const current = getTeamSlotIdentity(nextTeam, slot);
    if (!current.name) return;
    if (resolvePlayerKey(state, current.rawKey) !== currentPlayerId) return;
    changeLog.set(`${team.id}::${current.name}`, nextPlayerName);
    if (slot === 1) {
      nextTeam.player1 = nextPlayerName;
      nextTeam.player1BirthDate = nextBirthDate;
      nextTeam.player1YoB = nextYoB;
    } else {
      nextTeam.player2 = nextPlayerName;
      nextTeam.player2BirthDate = nextBirthDate;
      nextTeam.player2YoB = nextYoB;
    }
  });
  return nextTeam;
};

const rewriteMatches = (matches: Match[] | undefined, nameChanges: Map<string, string>): Match[] | undefined => {
  if (!Array.isArray(matches)) return matches;
  return matches.map((match) => ({
    ...match,
    stats: (match.stats || []).map((row) => ({
      ...row,
      playerName: nameChanges.get(`${row.teamId}::${row.playerName}`) || row.playerName,
    })),
  }));
};

const rewriteTournament = (
  state: AppState,
  tournament: TournamentData,
  currentPlayerId: string,
  nextPlayerName: string,
  nextBirthDate?: string,
  nextYoB?: number
): TournamentData => {
  const nameChanges = new Map<string, string>();
  const teams = (tournament.teams || []).map((team) => rewriteTeam(state, team, currentPlayerId, nextPlayerName, nameChanges, nextBirthDate, nextYoB));
  const matches = rewriteMatches(tournament.matches, nameChanges);
  const rounds = Array.isArray(tournament.rounds)
    ? tournament.rounds.map((round) => rewriteMatches(round, nameChanges) || round)
    : tournament.rounds;
  return { ...tournament, teams, matches, rounds };
};

const rewriteHallOfFameEntry = (
  state: AppState,
  entry: HallOfFameEntry,
  currentPlayerId: string,
  nextPlayerName: string,
  nextBirthDate?: string,
  nextYoB?: number
): HallOfFameEntry => {
  const nextPlayerId = getPlayerKey(nextPlayerName, pickPlayerIdentityValue(nextBirthDate, nextYoB));
  const currentPlayerKey = getPlayerKey((entry.playerNames || [])[0] || '', pickPlayerIdentityValue(entry.playerBirthDate));
  if (resolvePlayerKey(state, currentPlayerKey) !== currentPlayerId) return entry;
  return {
    ...entry,
    playerId: nextPlayerId,
    playerBirthDate: nextBirthDate,
    playerNames: (entry.playerNames || []).length ? [nextPlayerName, ...(entry.playerNames || []).slice(1)] : [nextPlayerName],
    manuallyEdited: true,
  };
};

export const updatePlayerProfileIdentity = (state: AppState, input: UpdatePlayerProfileIdentityInput): AppState => {
  const currentPlayerId = String(input.currentPlayerId || '').trim();
  const nextPlayerName = String(input.nextPlayerName || '').trim();
  if (!currentPlayerId) throw new Error('Profilo giocatore non valido.');
  if (!nextPlayerName) throw new Error('Inserisci il nome corretto del giocatore.');

  const nextBirthDate = normalizeBirthDateInput(input.nextBirthDate || undefined);
  if (input.nextBirthDate && !nextBirthDate) {
    throw new Error('La data di nascita non è valida. Usa gg/mm/aaaa oppure il calendario.');
  }
  const nextYoB = deriveYoBFromBirthDate(nextBirthDate);

  const liveNameChanges = new Map<string, string>();
  const teams = (state.teams || []).map((team) => rewriteTeam(state, team, currentPlayerId, nextPlayerName, liveNameChanges, nextBirthDate, nextYoB));
  const tournamentMatches = rewriteMatches(state.tournamentMatches, liveNameChanges) || [];

  const tournament = state.tournament
    ? {
        ...rewriteTournament(state, state.tournament, currentPlayerId, nextPlayerName, nextBirthDate, nextYoB),
        matches: tournamentMatches,
      }
    : null;

  const tournamentHistory = (state.tournamentHistory || []).map((tournamentRow) =>
    rewriteTournament(state, tournamentRow, currentPlayerId, nextPlayerName, nextBirthDate, nextYoB)
  );

  const integrationsScorers = (state.integrationsScorers || []).map((entry) => {
    const rawKey = getPlayerKey(entry.name, pickPlayerIdentityValue((entry as any).birthDate, entry.yob));
    if (resolvePlayerKey(state, rawKey) !== currentPlayerId) return entry;
    return {
      ...entry,
      name: nextPlayerName,
      birthDate: nextBirthDate,
      yob: nextYoB,
      source: entry.source || 'Modifica profilo',
      sourceLabel: entry.sourceLabel || 'Modifica profilo',
    };
  });

  const hallOfFame = (state.hallOfFame || []).map((entry) =>
    rewriteHallOfFameEntry(state, entry, currentPlayerId, nextPlayerName, nextBirthDate, nextYoB)
  );

  const nextAliases: Record<string, string> = {};
  Object.entries(state.playerAliases || {}).forEach(([fromKey, toKey]) => {
    if (resolvePlayerKey(state, fromKey) === currentPlayerId) return;
    if (resolvePlayerKey(state, toKey) === currentPlayerId) return;
    nextAliases[fromKey] = toKey;
  });

  return {
    ...state,
    teams,
    tournament,
    tournamentMatches,
    tournamentHistory,
    integrationsScorers,
    hallOfFame,
    playerAliases: nextAliases,
  };
};
