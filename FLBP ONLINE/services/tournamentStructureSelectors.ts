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

export const findSuccessorMatch = (
  matches: Match[],
  matchId: string
): { match: Match; slot: 'teamAId' | 'teamBId'; slotName: 'A' | 'B'; source: 'explicit' | 'positional' } | null => {
  const sourceMatch = (matches || []).find((match) => match.id === matchId);
  const explicitTargetId = String(sourceMatch?.nextMatchId || '').trim();
  const explicitSlot = sourceMatch?.nextSlot === 'A' || sourceMatch?.nextSlot === 'B' ? sourceMatch.nextSlot : null;
  if (explicitTargetId && explicitSlot) {
    const explicitTarget = (matches || []).find((match) => match.id === explicitTargetId);
    if (explicitTarget) {
      return {
        match: explicitTarget,
        slot: explicitSlot === 'A' ? 'teamAId' : 'teamBId',
        slotName: explicitSlot,
        source: 'explicit',
      };
    }
  }

  const rounds = buildBracketRoundsFromMatches(matches || []);
  for (let rIdx = 0; rIdx < rounds.length - 1; rIdx += 1) {
    const currentRound = rounds[rIdx] || [];
    const mIdx = currentRound.findIndex((match) => match.id === matchId);
    if (mIdx < 0) continue;
    const successor = (rounds[rIdx + 1] || [])[Math.floor(mIdx / 2)];
    if (!successor) return null;
    const slotName = mIdx % 2 === 0 ? 'A' : 'B';
    return {
      match: successor,
      slot: slotName === 'A' ? 'teamAId' : 'teamBId',
      slotName,
      source: 'positional',
    };
  }
  return null;
};

export const deriveBracketSuccessorLinks = (
  matches: Match[],
  options: { overwrite?: boolean } = {}
): Match[] => {
  const next = cloneMatches(matches || []);
  const byId = new Map(next.map((match) => [match.id, match]));
  const rounds = buildBracketRoundsFromMatches(next);

  for (let rIdx = 0; rIdx < rounds.length; rIdx += 1) {
    const currentRound = rounds[rIdx] || [];
    const nextRound = rounds[rIdx + 1] || [];
    for (let mIdx = 0; mIdx < currentRound.length; mIdx += 1) {
      const current = byId.get(currentRound[mIdx].id);
      if (!current || current.phase !== 'bracket') continue;
      const successor = nextRound[Math.floor(mIdx / 2)];
      if (!successor) {
        if (options.overwrite) {
          current.nextMatchId = null;
          current.nextSlot = null;
        }
        continue;
      }
      if (!options.overwrite && current.nextMatchId && current.nextSlot) continue;
      current.nextMatchId = successor.id;
      current.nextSlot = mIdx % 2 === 0 ? 'A' : 'B';
    }
  }

  return next;
};

const getBracketRoundsShapeScore = (rounds: Match[][]) => {
  const normalized = (rounds || []).filter((round) => Array.isArray(round) && round.length > 0);
  return {
    roundCount: normalized.length,
    matchCount: normalized.reduce((total, round) => total + round.length, 0),
  };
};

export const getPreferredBracketRounds = (
  tournament: TournamentData | null | undefined,
  matches: Match[]
): Match[][] => {
  const tournamentRounds = Array.isArray(tournament?.rounds)
    ? (tournament?.rounds || []).map((round) => cloneMatches(round || []))
    : [];
  const matchRounds = buildBracketRoundsFromMatches(matches || []);
  const tournamentScore = getBracketRoundsShapeScore(tournamentRounds);
  const matchScore = getBracketRoundsShapeScore(matchRounds);

  if (!tournamentScore.roundCount) return matchRounds;
  if (!matchScore.roundCount) return tournamentRounds;
  if (matchScore.roundCount > tournamentScore.roundCount) return matchRounds;
  if (matchScore.roundCount === tournamentScore.roundCount && matchScore.matchCount > tournamentScore.matchCount) {
    return matchRounds;
  }

  return tournamentRounds;
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

export const getBracketMatches = (snapshot: TournamentStructureSnapshot): Match[] => {
  return (snapshot.matches || [])
    .filter((m) => m.phase === 'bracket')
    .slice()
    .sort((a, b) => {
      const roundDiff = (a.round || 1) - (b.round || 1);
      if (roundDiff !== 0) return roundDiff;
      return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
    });
};

export const getRound1Matches = (snapshot: TournamentStructureSnapshot): Match[] => {
  return getBracketMatches(snapshot).filter((m) => (m.round || 1) === 1);
};

export const getMatchById = (snapshot: TournamentStructureSnapshot, matchId: string): Match | undefined => {
  return (snapshot.matches || []).find((m) => m.id === matchId);
};

export const isLockedBracketMatchForStructureEdit = (match?: Match): boolean => {
  if (!match) return true;
  if (match.phase !== 'bracket') return true;
  if (match.status === 'playing') return true;
  return !!match.played && !match.isBye && !match.hidden;
};

export const autoResolveBracketByeMatch = (match: Match): Match => {
  if (!match || match.phase !== 'bracket') return match;
  if (match.status === 'finished') return match;
  const a = String(match.teamAId || '').trim();
  const b = String(match.teamBId || '').trim();

  if (isByeTeamId(a) && b && !isByeTeamId(b) && !isTbdTeamId(b)) {
    return { ...match, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
  }
  if (isByeTeamId(b) && a && !isByeTeamId(a) && !isTbdTeamId(a)) {
    return { ...match, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
  }
  if (isByeTeamId(a) && isByeTeamId(b)) {
    return { ...match, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
  }
  return match;
};

const sameMatchProgression = (a: Match, b: Match) => (
  a.teamAId === b.teamAId &&
  a.teamBId === b.teamBId &&
  a.status === b.status &&
  a.played === b.played &&
  a.scoreA === b.scoreA &&
  a.scoreB === b.scoreB &&
  a.hidden === b.hidden &&
  a.isBye === b.isBye &&
  a.nextMatchId === b.nextMatchId &&
  a.nextSlot === b.nextSlot
);

const replaceMatchInList = (matches: Match[], updated: Match) =>
  matches.map((match) => (match.id === updated.id ? updated : match));

// Reverse index of the successor links: `${targetMatchId}|${slotName}` -> feeder match ids.
const buildFeederMap = (matches: Match[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const match of matches || []) {
    if (match.phase !== 'bracket') continue;
    const targetId = String(match.nextMatchId || '').trim();
    const slotName = match.nextSlot === 'A' || match.nextSlot === 'B' ? match.nextSlot : null;
    if (!targetId || !slotName) continue;
    const key = `${targetId}|${slotName}`;
    map.set(key, [...(map.get(key) || []), match.id]);
  }
  return map;
};

// Real team ids that can reach `matchId` from below (its feeder subtree, inclusive).
// Used to tell a value DERIVED from advancement (safe to rewrite/clear) apart
// from a team seeded manually into a slot (must survive realignments).
const collectFeederSubtreeTeamIds = (
  matches: Match[],
  feederMap: Map<string, string[]>,
  matchId: string,
  cache?: Map<string, Set<string>>
): Set<string> => {
  const cached = cache?.get(matchId);
  if (cached) return cached;

  const byId = new Map((matches || []).map((match) => [match.id, match]));
  const ids = new Set<string>();
  const visited = new Set<string>();
  const stack = [matchId];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const match = byId.get(id);
    if (!match) continue;
    for (const raw of [match.teamAId, match.teamBId]) {
      const teamId = String(raw || '').trim();
      if (teamId && !isPlaceholderTeamId(teamId)) ids.add(teamId);
    }
    for (const slotName of ['A', 'B'] as const) {
      for (const feederId of feederMap.get(`${id}|${slotName}`) || []) stack.push(feederId);
    }
  }

  cache?.set(matchId, ids);
  return ids;
};

export const advanceWinner = (matches: Match[], finishedMatch: Match): Match[] => {
  let out = deriveBracketSuccessorLinks(matches || []);
  const feederMap = buildFeederMap(out);
  let current = { ...finishedMatch };
  let guard = 0;

  while (guard < 256) {
    guard += 1;
    const winner = resolveWinnerTeamId(current);
    if (!winner || isPlaceholderTeamId(winner)) break;

    const successor = findSuccessorMatch(out, current.id);
    if (!successor) break;

    const target = out.find((match) => match.id === successor.match.id) || successor.match;

    // Never rewrite a successor that was really played or is being played.
    if (isLockedBracketMatchForStructureEdit(target)) break;

    const currentValue = String((target as any)[successor.slot] || '').trim();
    if (currentValue && !isPlaceholderTeamId(currentValue) && currentValue !== winner) {
      // A stale occupant that advanced from this same branch (e.g. after a score
      // correction flipped the winner) gets replaced. A team seeded manually
      // into the slot is foreign to the branch and is never clobbered.
      const derivedFromBranch = collectFeederSubtreeTeamIds(out, feederMap, current.id).has(currentValue);
      if (!derivedFromBranch) break;
    }

    const participantsChanged = currentValue !== winner;
    let nextTarget: Match = { ...target, [successor.slot]: winner } as Match;

    if (participantsChanged) {
      // The pairing changed: reopen the (unlocked) successor so the new pairing
      // is actually playable. This also un-resolves a structural BYE auto-win
      // that would otherwise absorb the incoming winner into a finished 0-0.
      nextTarget = {
        ...nextTarget,
        played: false,
        status: 'scheduled',
        scoreA: 0,
        scoreB: 0,
        stats: undefined,
        hidden: false,
        isBye: false,
      };
    }

    nextTarget = autoResolveBracketByeMatch(nextTarget);

    if (sameMatchProgression(target, nextTarget)) break;
    out = replaceMatchInList(out, nextTarget);

    if (nextTarget.status === 'finished') {
      current = nextTarget;
      continue;
    }
    break;
  }

  return out;
};

export const reconcileBracketAdvancements = (
  matches: Match[],
  options: { resetFutureParticipants?: boolean } = {}
): Match[] => {
  let out = deriveBracketSuccessorLinks(matches || []);

  if (options.resetFutureParticipants) {
    // Feeder-aware reset: clear only slot values that advancement itself can
    // re-derive (the occupant appears in the slot's feeder subtree). Slots with
    // no feeder (Round 1 / preliminary seeds) and manually seeded teams are
    // left untouched, so a structural edit never erases an admin's insert.
    const feederMap = buildFeederMap(out);
    const subtreeCache = new Map<string, Set<string>>();
    out = out.map((match) => {
      if (match.phase !== 'bracket') return match;
      if (isLockedBracketMatchForStructureEdit(match)) return match;

      let nextMatch: Match | null = null;
      (['A', 'B'] as const).forEach((slotName) => {
        const slotField = slotName === 'A' ? 'teamAId' : 'teamBId';
        const feeders = feederMap.get(`${match.id}|${slotName}`) || [];
        if (!feeders.length) return;
        const occupant = String(((nextMatch || match) as any)[slotField] || '').trim();
        if (!occupant || isPlaceholderTeamId(occupant)) return;
        const derived = feeders.some((feederId) =>
          collectFeederSubtreeTeamIds(out, feederMap, feederId, subtreeCache).has(occupant)
        );
        if (!derived) return;
        nextMatch = nextMatch || { ...match };
        delete (nextMatch as any)[slotField];
      });

      if (!nextMatch) return match;
      const reopened: Match = nextMatch;
      reopened.scoreA = 0;
      reopened.scoreB = 0;
      reopened.played = false;
      reopened.status = 'scheduled';
      reopened.hidden = false;
      reopened.isBye = false;
      reopened.stats = undefined;
      return reopened;
    });
  }

  const orderedBracket = out
    .filter((match) => match.phase === 'bracket')
    .slice()
    .sort((a, b) => (a.round || 1) - (b.round || 1) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  for (const skeleton of orderedBracket) {
    const current = out.find((match) => match.id === skeleton.id) || skeleton;
    const autoResolved = autoResolveBracketByeMatch(current);
    if (!sameMatchProgression(current, autoResolved)) {
      out = replaceMatchInList(out, autoResolved);
    }
    out = advanceWinner(out, autoResolved);
  }

  return out;
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
  for (const match of getBracketMatches(snapshot)) {
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

  for (const match of getBracketMatches(snapshot)) {
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

  // The live roster must mirror the structure, while catalogTeams remains the
  // complete registration catalog. Keeping an unassigned team in
  // tournament.teams makes CLEAR_BRACKET_SLOT impossible to apply because the
  // validator correctly reports that roster member as excluded.
  const keep = new Map<string, Team>();
  for (const team of next.tournament.teams || []) {
    const id = String(team.id || '').trim();
    if (!id || !referencedIds.has(id)) continue;
    keep.set(id, { ...team });
  }

  for (const id of referencedIds) {
    if (keep.has(id)) continue;
    const fromCatalog = catalogById.get(id);
    if (fromCatalog) keep.set(id, { ...fromCatalog });
  }

  const originalOrder = (next.tournament.teams || [])
    .map((team) => String(team.id || '').trim())
    .filter((id) => referencedIds.has(id));
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
