import type { AppState } from './storageService';
import type {
  HallOfFameEntry,
  IntegrationScorerEntry,
  PlayerAliasRelationRow,
  PlayerContributionSourceRow,
  PlayerProfileSnapshot,
  PlayerTitleSourceRow,
  Team,
  TournamentData,
} from '../types';
import { getPlayerKey, getPlayerKeyLabel, pickPlayerIdentityValue, pickStoredPlayerIdentityValue, resolvePlayerKey } from './playerIdentity';
import { normalizeNameLower } from './textUtils';
import { getHallOfFameEntryOrigin } from './hallOfFameAdmin';

export interface AliasRemovalImpact {
  fromKey: string;
  toKey: string;
  sourceLabel: string;
  targetLabel: string;
  separatedProfiles: number;
  affectedContributionRows: number;
  affectedTitleRows: number;
}

export type HallOfFamePlayerRef = {
  rawPlayerId: string;
  playerId: string;
  playerName: string;
  slotIndex: number | null;
};

const normalize = (value: string) => normalizeNameLower(value || '');

const tournamentYear = (tournament?: TournamentData | null): string | null => {
  const ts = Date.parse(String(tournament?.startDate || ''));
  return Number.isFinite(ts) ? String(new Date(ts).getFullYear()) : null;
};

const findTeamForWinnerEntry = (state: AppState, entry: HallOfFameEntry): Team | null => {
  const tournaments = [
    ...(state.tournamentHistory || []),
    ...(state.tournament ? [state.tournament] : []),
  ];
  const tournament = tournaments.find((item) => item.id === entry.tournamentId);
  if (!tournament || !entry.teamName) return null;
  return (tournament.teams || []).find((team) => normalize(team.name) === normalize(entry.teamName || '')) || null;
};

export const getHallOfFamePlayerRefs = (state: AppState, entry: HallOfFameEntry): HallOfFamePlayerRef[] => {
  if (entry.type === 'winner') {
    const winnerTeam = findTeamForWinnerEntry(state, entry);
    if (winnerTeam) {
      return [
        winnerTeam.player1
          ? {
              rawPlayerId: getPlayerKey(winnerTeam.player1, pickStoredPlayerIdentityValue((winnerTeam as any).player1BirthDate, (winnerTeam.player1YoB as any) ?? undefined)),
              playerId: resolvePlayerKey(state, getPlayerKey(winnerTeam.player1, pickStoredPlayerIdentityValue((winnerTeam as any).player1BirthDate, (winnerTeam.player1YoB as any) ?? undefined))),
              playerName: winnerTeam.player1,
              slotIndex: 0,
            }
          : null,
        winnerTeam.player2
          ? {
              rawPlayerId: getPlayerKey(winnerTeam.player2, pickStoredPlayerIdentityValue((winnerTeam as any).player2BirthDate, (winnerTeam.player2YoB as any) ?? undefined)),
              playerId: resolvePlayerKey(state, getPlayerKey(winnerTeam.player2, pickStoredPlayerIdentityValue((winnerTeam as any).player2BirthDate, (winnerTeam.player2YoB as any) ?? undefined))),
              playerName: winnerTeam.player2,
              slotIndex: 1,
            }
          : null,
      ].filter(Boolean) as HallOfFamePlayerRef[];
    }

    return (entry.playerNames || [])
      .map((playerName, index) => {
        const rawPlayerId = getPlayerKey(playerName, pickPlayerIdentityValue(entry.playerBirthDate));
        return {
          rawPlayerId,
          playerId: resolvePlayerKey(state, rawPlayerId),
          playerName,
          slotIndex: index,
        };
      })
      .filter((row) => !!row.playerName.trim());
  }

  if (entry.playerId) {
    const playerName = entry.playerNames?.[0] || getPlayerKeyLabel(entry.playerId).name;
    const rawPlayerId = getPlayerKey(playerName, pickPlayerIdentityValue(entry.playerBirthDate));
    return [
      {
        rawPlayerId,
        playerId: resolvePlayerKey(state, rawPlayerId),
        playerName,
        slotIndex: 0,
      },
    ];
  }

  return (entry.playerNames || [])
    .map((playerName, index) => {
      const rawPlayerId = getPlayerKey(playerName, pickPlayerIdentityValue(entry.playerBirthDate));
      return {
        rawPlayerId,
        playerId: resolvePlayerKey(state, rawPlayerId),
        playerName,
        slotIndex: index,
      };
    })
    .filter((row) => !!row.playerName.trim());
};

const getIntegrationSource = (entry: IntegrationScorerEntry) => {
  return {
    sourceType: entry.sourceType || 'manual_integration',
    sourceTournamentId: entry.sourceTournamentId ?? null,
    sourceLabel: entry.sourceLabel || entry.source || 'Aggiunto manualmente',
  };
};

const createEmptyProfile = (playerId: string): PlayerProfileSnapshot => {
  const label = getPlayerKeyLabel(playerId);
  return {
    playerId,
    displayName: label.name || playerId,
    yobLabel: label.yob || 'ND',
    aliasCount: 0,
    totalTitles: 0,
    totalCanestri: 0,
    totalSoffi: 0,
    hasArchivedData: false,
    hasManualData: false,
    badges: [],
    titles: [],
    contributions: [],
    aliases: [],
  };
};

const finalizeProfile = (profile: PlayerProfileSnapshot): PlayerProfileSnapshot => {
  const badges = new Set<PlayerProfileSnapshot['badges'][number]>();
  if (profile.hasArchivedData) badges.add('archivio');
  if (profile.hasManualData) badges.add('manuale');
  if (profile.aliasCount > 0) badges.add('alias_attivo');

  return {
    ...profile,
    totalTitles: profile.titles.length,
    totalCanestri: profile.contributions.reduce((acc, row) => acc + (row.canestri || 0), 0),
    totalSoffi: profile.contributions.reduce((acc, row) => acc + (row.soffi || 0), 0),
    badges: Array.from(badges),
    titles: profile.titles.slice().sort((a, b) => {
      const byYear = Number(b.year || 0) - Number(a.year || 0);
      if (byYear !== 0) return byYear;
      return a.tournamentName.localeCompare(b.tournamentName, 'it', { sensitivity: 'base' });
    }),
    contributions: profile.contributions.slice().sort((a, b) => {
      const byYear = Number(b.tournamentYear || 0) - Number(a.tournamentYear || 0);
      if (byYear !== 0) return byYear;
      return String(a.matchId || '').localeCompare(String(b.matchId || ''), 'it', { sensitivity: 'base' });
    }),
    aliases: profile.aliases.slice().sort((a, b) => a.otherLabel.localeCompare(b.otherLabel, 'it', { sensitivity: 'base' })),
  };
};

export const buildPlayerProfileSnapshots = (state: AppState): PlayerProfileSnapshot[] => {
  const profiles = new Map<string, PlayerProfileSnapshot>();
  const ensure = (playerId: string, displayName?: string, identityLabel?: string | 'ND') => {
    if (!profiles.has(playerId)) {
      const profile = createEmptyProfile(playerId);
      if (displayName) profile.displayName = displayName;
      if (identityLabel !== undefined) profile.yobLabel = identityLabel === 'ND' ? 'ND' : String(identityLabel);
      profiles.set(playerId, profile);
    }
    const current = profiles.get(playerId)!;
    if (displayName && (!current.displayName || current.displayName === playerId)) {
      current.displayName = displayName;
    }
    return current;
  };

  (state.tournamentHistory || []).forEach((tournament) => {
    const year = tournamentYear(tournament);
    const matches = (tournament.matches || []).length ? (tournament.matches || []) : (tournament.rounds || []).flat();
    (tournament.teams || []).forEach((team) => {
      if (team.player1) ensure(resolvePlayerKey(state, getPlayerKey(team.player1, pickStoredPlayerIdentityValue((team as any).player1BirthDate, (team.player1YoB as any) ?? undefined))), team.player1, getPlayerKeyLabel(getPlayerKey(team.player1, pickStoredPlayerIdentityValue((team as any).player1BirthDate, (team.player1YoB as any) ?? undefined))).yob || 'ND');
      if (team.player2) ensure(resolvePlayerKey(state, getPlayerKey(team.player2, pickStoredPlayerIdentityValue((team as any).player2BirthDate, (team.player2YoB as any) ?? undefined))), team.player2, getPlayerKeyLabel(getPlayerKey(team.player2, pickStoredPlayerIdentityValue((team as any).player2BirthDate, (team.player2YoB as any) ?? undefined))).yob || 'ND');
    });

    const teamById = new Map<string, Team>((tournament.teams || []).map((team) => [team.id, team]));
    matches.forEach((match) => {
      (match.stats || []).forEach((row) => {
        const team = teamById.get(row.teamId);
        const birthDate = team && team.player1 === row.playerName ? (team as any).player1BirthDate : team && team.player2 === row.playerName ? (team as any).player2BirthDate : undefined;
        const legacyYoB = team && team.player1 === row.playerName ? (team.player1YoB as any) ?? undefined : team && team.player2 === row.playerName ? (team.player2YoB as any) ?? undefined : undefined;
        const rawPlayerId = getPlayerKey(row.playerName, pickStoredPlayerIdentityValue(birthDate, legacyYoB));
        const playerId = resolvePlayerKey(state, rawPlayerId);
        const profile = ensure(playerId, row.playerName, getPlayerKeyLabel(rawPlayerId).yob || 'ND');
        const contribution: PlayerContributionSourceRow = {
          id: `archived:${tournament.id}:${match.id}:${row.teamId}:${normalize(row.playerName)}`,
          playerId,
          playerName: row.playerName,
          sourceType: 'archived_tournament_match',
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          tournamentYear: year,
          matchId: match.id,
          teamId: row.teamId,
          teamName: team?.name || row.teamId,
          canestri: row.canestri || 0,
          soffi: row.soffi || 0,
          games: 1,
          sourceLabel: null,
          manuallyAdded: false,
        };
        profile.contributions.push(contribution);
        profile.hasArchivedData = true;
      });
    });
  });

  (state.integrationsScorers || []).forEach((entry) => {
    const rawPlayerId = getPlayerKey(entry.name, pickStoredPlayerIdentityValue((entry as any).birthDate, (entry as any).yob ?? undefined));
    const playerId = resolvePlayerKey(state, rawPlayerId);
    const profile = ensure(playerId, entry.name, getPlayerKeyLabel(rawPlayerId).yob || 'ND');
    const origin = getIntegrationSource(entry);
    profile.contributions.push({
      id: `manual:${entry.id}`,
      playerId,
      playerName: entry.name,
      sourceType: 'manual_integration',
      tournamentId: origin.sourceTournamentId,
      tournamentName: null,
      tournamentYear: null,
      matchId: null,
      teamId: null,
      teamName: entry.teamName || null,
      canestri: entry.points || 0,
      soffi: entry.soffi || 0,
      games: entry.games || 0,
      sourceLabel: origin.sourceLabel,
      manuallyAdded: true,
    });
    profile.hasManualData = true;
  });

  (state.hallOfFame || []).forEach((entry) => {
    const origin = getHallOfFameEntryOrigin(entry);
    getHallOfFamePlayerRefs(state, entry).forEach((ref) => {
      const profile = ensure(ref.playerId, ref.playerName);
      const titleRow: PlayerTitleSourceRow = {
        id: `${entry.id}:${ref.slotIndex ?? 0}`,
        entryId: entry.id,
        playerId: ref.playerId,
        playerName: ref.playerName,
        playerSlotIndex: ref.slotIndex,
        year: entry.year,
        tournamentId: entry.tournamentId,
        tournamentName: entry.tournamentName,
        type: entry.type,
        teamName: entry.teamName,
        playerNames: entry.playerNames || [],
        value: entry.value,
        sourceType: origin.sourceType,
        sourceTournamentId: origin.sourceTournamentId,
        sourceTournamentName: origin.sourceTournamentName,
        sourceMatchId: origin.sourceMatchId,
        sourceAutoGenerated: origin.sourceAutoGenerated,
        manuallyEdited: origin.manuallyEdited,
        editable: true,
        reassignable: origin.reassignable,
        deletable: origin.deletable,
      };
      profile.titles.push(titleRow);
      if (origin.sourceType === 'archived_tournament') profile.hasArchivedData = true;
      else profile.hasManualData = true;
    });
  });

  Object.entries(state.playerAliases || {}).forEach(([fromKey, toKey]) => {
    const resolvedTo = resolvePlayerKey(state, toKey);
    const sourceLabel = getPlayerKeyLabel(fromKey);
    const targetLabel = getPlayerKeyLabel(toKey);
    const targetProfile = ensure(resolvedTo, targetLabel.name, targetLabel.yob as any);
    targetProfile.aliases.push({
      id: `${fromKey}->${toKey}`,
      fromKey,
      toKey,
      direction: 'incoming',
      otherKey: fromKey,
      otherLabel: `${sourceLabel.name} (${sourceLabel.yob})`,
    });
    targetProfile.aliasCount += 1;
  });

  return Array.from(profiles.values())
    .map(finalizeProfile)
    .sort((a, b) => {
      const titlesDiff = b.totalTitles - a.totalTitles;
      if (titlesDiff !== 0) return titlesDiff;
      const pointsDiff = b.totalCanestri - a.totalCanestri;
      if (pointsDiff !== 0) return pointsDiff;
      return a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' });
    });
};

export const buildPlayerProfileSnapshot = (state: AppState, playerId: string): PlayerProfileSnapshot | null => {
  return buildPlayerProfileSnapshots(state).find((profile) => profile.playerId === playerId) || null;
};

export const searchPlayerProfiles = (state: AppState, query: string): PlayerProfileSnapshot[] => {
  const q = normalize(query);
  if (!q) return buildPlayerProfileSnapshots(state);
  return buildPlayerProfileSnapshots(state).filter((profile) => {
    if (normalize(profile.displayName).includes(q)) return true;
    if (normalize(profile.playerId).includes(q)) return true;
    return profile.aliases.some((alias) => normalize(alias.otherLabel).includes(q) || normalize(alias.otherKey).includes(q));
  });
};

export const getAliasRemovalImpact = (state: AppState, fromKey: string): AliasRemovalImpact => {
  const toKey = String((state.playerAliases || {})[fromKey] || '').trim();
  if (!toKey) {
    throw new Error('Alias non trovato.');
  }

  let affectedContributionRows = 0;
  (state.tournamentHistory || []).forEach((tournament) => {
    const matches = (tournament.matches || []).length ? (tournament.matches || []) : (tournament.rounds || []).flat();
    const teamById = new Map<string, Team>((tournament.teams || []).map((team) => [team.id, team]));
    matches.forEach((match) => {
      (match.stats || []).forEach((row) => {
        const team = teamById.get(row.teamId);
        const yob =
          team && team.player1 === row.playerName
            ? team.player1YoB
            : team && team.player2 === row.playerName
              ? team.player2YoB
              : undefined;
        const birthDate = team && team.player1 === row.playerName ? (team as any).player1BirthDate : team && team.player2 === row.playerName ? (team as any).player2BirthDate : undefined;
        const legacyYoB = team && team.player1 === row.playerName ? (team.player1YoB as any) ?? undefined : team && team.player2 === row.playerName ? (team.player2YoB as any) ?? undefined : undefined;
        const rawPlayerId = getPlayerKey(row.playerName, pickStoredPlayerIdentityValue(birthDate, legacyYoB));
        if (rawPlayerId === fromKey) affectedContributionRows += 1;
      });
    });
  });

  (state.integrationsScorers || []).forEach((entry) => {
    const rawPlayerId = getPlayerKey(entry.name, pickStoredPlayerIdentityValue((entry as any).birthDate, (entry as any).yob ?? undefined));
    if (rawPlayerId === fromKey) affectedContributionRows += 1;
  });

  let affectedTitleRows = 0;
  (state.hallOfFame || []).forEach((entry) => {
    const refs = getHallOfFamePlayerRefs(state, entry);
    refs.forEach((ref) => {
      if (ref.rawPlayerId === fromKey) affectedTitleRows += 1;
    });
  });

  return {
    fromKey,
    toKey,
    sourceLabel: `${getPlayerKeyLabel(fromKey).name} (${getPlayerKeyLabel(fromKey).yob})`,
    targetLabel: `${getPlayerKeyLabel(toKey).name} (${getPlayerKeyLabel(toKey).yob})`,
    separatedProfiles: 1,
    affectedContributionRows,
    affectedTitleRows,
  };
};

export const removePlayerAliasMapping = (state: AppState, fromKey: string): AppState => {
  const nextAliases = { ...(state.playerAliases || {}) };
  delete nextAliases[fromKey];
  return {
    ...state,
    playerAliases: nextAliases,
  };
};
