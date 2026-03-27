import type { Match, Team, TournamentData } from '../types';
import { computeGroupStandings } from './groupStandings';
import { isFinalGroup } from './groupUtils';
import { getMatchParticipantIds, isByeTeamId, isPlaceholderTeamId, isTbdTeamId } from './matchUtils';
import type { CurrentPlacement, StructuralPhase, TournamentStructureSnapshot } from './tournamentStructureTypes';

export const buildTournamentStructureSnapshot = (
  tournament: TournamentData,
  matches: Match[],
  globalTeams: Team[]
): TournamentStructureSnapshot => {
  const byId = new Map<string, Team>();
  for (const t of (tournament.teams || [])) byId.set(String(t.id || ''), t);
  for (const t of (globalTeams || [])) {
    const id = String(t.id || '');
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, t);
  }
  return {
    tournament: cloneTournamentData(tournament),
    matches: cloneMatches(matches),
    catalogTeams: Array.from(byId.values()).map((t) => ({ ...t })),
  };
};

export const cloneMatches = (matches: Match[]): Match[] => {
  return (matches || []).map((m) => ({
    ...m,
    stats: m.stats ? m.stats.map((s) => ({ ...s })) : undefined,
    teamIds: m.teamIds ? [...m.teamIds] : undefined,
    scoresByTeam: m.scoresByTeam ? { ...m.scoresByTeam } : undefined,
  }));
};

export const cloneTournamentData = (tournament: TournamentData): TournamentData => {
  return {
    ...tournament,
    teams: (tournament.teams || []).map((t) => ({ ...t })),
    groups: (tournament.groups || []).map((g) => ({
      ...g,
      teams: (g.teams || []).map((t) => ({ ...t })),
    })),
    rounds: (tournament.rounds || []).map((round) => cloneMatches(round)),
    matches: cloneMatches(tournament.matches || []),
    config: {
      ...tournament.config,
      finalRoundRobin: tournament.config?.finalRoundRobin
        ? { ...tournament.config.finalRoundRobin }
        : undefined,
    },
    refereesRoster: tournament.refereesRoster ? [...tournament.refereesRoster] : undefined,
  };
};

export const cloneSnapshot = (snapshot: TournamentStructureSnapshot): TournamentStructureSnapshot => ({
  tournament: cloneTournamentData(snapshot.tournament),
  matches: cloneMatches(snapshot.matches),
  catalogTeams: (snapshot.catalogTeams || []).map((t) => ({ ...t })),
});

export const buildBracketRoundsFromMatches = (matches: Match[]): Match[][] => {
  const bracketMatches = (matches || []).filter((m) => m.phase === 'bracket');
  const byRound = new Map<number, Match[]>();
  for (const match of bracketMatches) {
    const round = match.round || 1;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round)!.push({ ...match });
  }
  return Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map((round) =>
      (byRound.get(round) || [])
        .slice()
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    );
};

export const buildSlotKey = (matchId: string, side: 'A' | 'B') => `${matchId}|${side}`;

export const parseSlotKey = (
  slotKey: string
): { matchId: string; side: 'A' | 'B'; field: 'teamAId' | 'teamBId' } | null => {
  const [matchId, side] = String(slotKey || '').split('|');
  if (!matchId || (side !== 'A' && side !== 'B')) return null;
  return {
    matchId,
    side,
    field: side === 'A' ? 'teamAId' : 'teamBId',
  };
};

export const getCatalogTeamMap = (snapshot: TournamentStructureSnapshot) => {
  return new Map((snapshot.catalogTeams || []).map((team) => [team.id, team] as const));
};

export const getCatalogTeam = (snapshot: TournamentStructureSnapshot, teamId?: string): Team | undefined => {
  if (!teamId) return undefined;
  return getCatalogTeamMap(snapshot).get(teamId);
};

export const getRound1Matches = (snapshot: TournamentStructureSnapshot): Match[] => {
  return (snapshot.matches || [])
    .filter((m) => m.phase === 'bracket' && (m.round || 1) === 1)
    .slice()
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
};

export const getMatchById = (snapshot: TournamentStructureSnapshot, matchId: string): Match | undefined => {
  return (snapshot.matches || []).find((m) => m.id === matchId);
};

export const getGroupById = (snapshot: TournamentStructureSnapshot, groupId: string) => {
  return (snapshot.tournament.groups || []).find((group) => group.id === groupId);
};

export const getGroupByName = (snapshot: TournamentStructureSnapshot, groupName: string) => {
  return (snapshot.tournament.groups || []).find((group) => group.name === groupName);
};

export const getGroupMatches = (snapshot: TournamentStructureSnapshot, groupName: string): Match[] => {
  return (snapshot.matches || [])
    .filter((m) => m.phase === 'groups' && (m.groupName || '') === groupName && !m.hidden && !m.isBye)
    .slice()
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
};

export const isGroupConcluded = (snapshot: TournamentStructureSnapshot, groupId: string): boolean => {
  const group = getGroupById(snapshot, groupId);
  if (!group) return false;
  const matches = getGroupMatches(snapshot, group.name);
  if (!matches.length) return false;
  return matches.every((m) => m.status === 'finished');
};

export const hasRealBracketStarted = (snapshot: TournamentStructureSnapshot): boolean => {
  return (snapshot.matches || []).some((m) => {
    if (m.phase !== 'bracket') return false;
    if (m.hidden || m.isBye) return false;
    const ids = getMatchParticipantIds(m);
    if (!ids.length) return false;
    if (ids.some((id) => isPlaceholderTeamId(id))) return false;
    return m.status !== 'scheduled';
  });
};

export const getGroupAssignedTeamIds = (snapshot: TournamentStructureSnapshot): string[] => {
  const ids = new Set<string>();
  for (const group of snapshot.tournament.groups || []) {
    for (const team of group.teams || []) {
      const id = String(team.id || '').trim();
      if (!id || isPlaceholderTeamId(id) || team.hidden || team.isBye) continue;
      ids.add(id);
    }
  }
  return Array.from(ids);
};

export const getBracketAssignedTeamIds = (snapshot: TournamentStructureSnapshot): string[] => {
  const ids = new Set<string>();
  for (const match of getRound1Matches(snapshot)) {
    for (const id of [match.teamAId, match.teamBId]) {
      const raw = String(id || '').trim();
      if (!raw || isPlaceholderTeamId(raw)) continue;
      ids.add(raw);
    }
  }
  return Array.from(ids);
};

export const getTeamPlacement = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  phase: StructuralPhase
): CurrentPlacement | undefined => {
  const id = String(teamId || '').trim();
  if (!id) return undefined;

  if (phase === 'groups') {
    for (const group of snapshot.tournament.groups || []) {
      if ((group.teams || []).some((team) => team.id === id)) {
        return {
          phase: 'groups',
          containerId: group.id,
          containerName: group.name,
        };
      }
    }
    return undefined;
  }

  for (const match of getRound1Matches(snapshot)) {
    if ((match.teamAId || '').trim() === id) {
      return {
        phase: 'bracket',
        containerId: String(match.round || 1),
        containerName: match.roundName || `Round ${match.round || 1}`,
        slotKey: buildSlotKey(match.id, 'A'),
        matchId: match.id,
        round: match.round || 1,
      };
    }
    if ((match.teamBId || '').trim() === id) {
      return {
        phase: 'bracket',
        containerId: String(match.round || 1),
        containerName: match.roundName || `Round ${match.round || 1}`,
        slotKey: buildSlotKey(match.id, 'B'),
        matchId: match.id,
        round: match.round || 1,
      };
    }
  }

  return undefined;
};

export const findTeamStartedInPhase = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  phase: StructuralPhase
): boolean => {
  const id = String(teamId || '').trim();
  if (!id) return false;

  return (snapshot.matches || []).some((match) => {
    if (match.phase !== phase) return false;
    if (match.hidden || match.isBye) return false;
    if (!getMatchParticipantIds(match).includes(id)) return false;
    if (phase === 'groups') {
      return match.status !== 'scheduled' || !!match.played || !!match.isTieBreak;
    }
    return match.status !== 'scheduled' || !!match.played;
  });
};

export const findTeamEliminated = (snapshot: TournamentStructureSnapshot, teamId: string): boolean => {
  const id = String(teamId || '').trim();
  if (!id) return false;

  return (snapshot.matches || []).some((match) => {
    if (match.phase !== 'bracket') return false;
    if (match.hidden || match.isBye) return false;
    if (match.status !== 'finished') return false;
    const participants = getMatchParticipantIds(match);
    if (!participants.includes(id)) return false;
    if (participants.some((participantId) => isPlaceholderTeamId(participantId))) return false;
    const winnerId = resolveWinnerTeamId(match);
    return !!winnerId && winnerId !== id;
  });
};

export const resolveWinnerTeamId = (match: Match): string | undefined => {
  if (isByeTeamId(match.teamAId) && match.teamBId && !isByeTeamId(match.teamBId) && !isTbdTeamId(match.teamBId)) {
    return match.teamBId;
  }
  if (isByeTeamId(match.teamBId) && match.teamAId && !isByeTeamId(match.teamAId) && !isTbdTeamId(match.teamAId)) {
    return match.teamAId;
  }
  if (match.status !== 'finished') return undefined;
  if ((match.scoreA || 0) > (match.scoreB || 0) && !isTbdTeamId(match.teamAId)) return match.teamAId;
  if ((match.scoreB || 0) > (match.scoreA || 0) && !isTbdTeamId(match.teamBId)) return match.teamBId;
  return undefined;
};

export const getSlotValue = (snapshot: TournamentStructureSnapshot, slotKey: string): string => {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return '';
  const match = getMatchById(snapshot, parsed.matchId);
  if (!match) return '';
  return String((match as any)[parsed.field] || '').trim();
};

export const getSlotPlacement = (
  snapshot: TournamentStructureSnapshot,
  slotKey: string
): CurrentPlacement | undefined => {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return undefined;
  const match = getMatchById(snapshot, parsed.matchId);
  if (!match) return undefined;
  return {
    phase: 'bracket',
    containerId: String(match.round || 1),
    containerName: match.roundName || `Round ${match.round || 1}`,
    slotKey,
    matchId: match.id,
    round: match.round || 1,
  };
};

export const getDuplicateGroupTeamIds = (snapshot: TournamentStructureSnapshot): string[] => {
  const counts = new Map<string, number>();
  for (const group of snapshot.tournament.groups || []) {
    for (const team of group.teams || []) {
      const id = String(team.id || '').trim();
      if (!id || isPlaceholderTeamId(id) || team.hidden || team.isBye) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([teamId]) => teamId);
};

export const getDuplicateBracketTeamIds = (snapshot: TournamentStructureSnapshot): string[] => {
  const counts = new Map<string, number>();
  for (const match of getRound1Matches(snapshot)) {
    for (const id of [match.teamAId, match.teamBId]) {
      const raw = String(id || '').trim();
      if (!raw || isPlaceholderTeamId(raw)) continue;
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([teamId]) => teamId);
};

export const getGroupRanking = (snapshot: TournamentStructureSnapshot, groupId: string): Team[] => {
  const group = getGroupById(snapshot, groupId);
  if (!group) return [];
  return computeGroupStandings({ teams: group.teams || [], matches: getGroupMatches(snapshot, group.name) }).rankedTeams;
};

export const syncTournamentRosterFromStructure = (
  snapshot: TournamentStructureSnapshot
): TournamentStructureSnapshot => {
  const next = cloneSnapshot(snapshot);
  const catalogById = getCatalogTeamMap(next);
  const keep = new Map<string, Team>();

  for (const team of next.tournament.teams || []) {
    const id = String(team.id || '').trim();
    if (!id) continue;
    keep.set(id, { ...team });
  }

  const referencedIds = new Set<string>();
  for (const group of next.tournament.groups || []) {
    for (const team of group.teams || []) {
      const id = String(team.id || '').trim();
      if (!id || isPlaceholderTeamId(id)) continue;
      referencedIds.add(id);
    }
  }
  for (const match of next.matches || []) {
    for (const id of getMatchParticipantIds(match)) {
      const raw = String(id || '').trim();
      if (!raw || isPlaceholderTeamId(raw)) continue;
      referencedIds.add(raw);
    }
  }

  for (const id of referencedIds) {
    if (keep.has(id)) continue;
    const fromCatalog = catalogById.get(id);
    if (fromCatalog) keep.set(id, { ...fromCatalog });
  }

  const originalOrder = (next.tournament.teams || []).map((team) => String(team.id || '').trim());
  const extraOrder = (next.catalogTeams || [])
    .map((team) => String(team.id || '').trim())
    .filter((id) => referencedIds.has(id) && !originalOrder.includes(id));
  const finalOrder = [...originalOrder, ...extraOrder].filter((id, index, arr) => !!id && arr.indexOf(id) === index);

  next.tournament.teams = finalOrder
    .map((id) => keep.get(id))
    .filter(Boolean) as Team[];
  next.tournament.matches = cloneMatches(next.matches);
  next.tournament.rounds = buildBracketRoundsFromMatches(next.matches);
  return next;
};
