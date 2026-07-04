import type { Match, Team } from '../types';
import { uuid } from './id';
import { syncBracketFromGroups } from './tournamentEngine';
import { getMatchParticipantIds, isByeTeamId, isPlaceholderTeamId, isTbdTeamId } from './matchUtils';
import {
  canClearBracketSlot,
  canInsertTeamIntoBracketSlot,
  canInsertTeamIntoGroup,
  canMoveBracketSlot,
  canMoveTeamBetweenGroups,
  canRemoveTeamFromGroup,
  canReplaceBracketSlot,
  canReplaceGroupTeam,
  canSwapBracketSlots,
  canSwapTeams,
} from './tournamentStructureEligibility';
import {
  buildBracketRoundsFromMatches,
  cloneSnapshot,
  deriveBracketSuccessorLinks,
  findSuccessorMatch,
  getCatalogTeam,
  getGroupById,
  getMatchById,
  getRound1Matches,
  getSlotValue,
  hasRealBracketStarted,
  isLockedBracketMatchForStructureEdit,
  parseSlotKey,
  reconcileBracketAdvancements,
  resolveWinnerTeamId,
  syncTournamentRosterFromStructure,
} from './tournamentStructureSelectors';
import type {
  StructuralOperation,
  StructuralOperationResult,
  StructuralTargetCheck,
  TournamentStructureSnapshot,
} from './tournamentStructureTypes';

const sortByOrderIndexSafe = (a: Match, b: Match) => {
  const d = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  if (d !== 0) return d;
  return String(a.code || a.id || '').localeCompare(String(b.code || b.id || ''));
};

const getGroupLetter = (groupName?: string) => String(groupName || '').slice(-1) || 'G';
const getBracketRoundName = (matchCount: number) => {
  if (matchCount <= 0) return 'Bracket';
  if (matchCount === 1) return 'Finale';
  if (matchCount === 2) return 'Semifinali';
  if (matchCount === 4) return 'Quarti';
  if (matchCount === 8) return 'Ottavi';
  return `Round of ${matchCount * 2}`;
};

const cloneMatchList = (matches: Match[]) => matches.map((match) => ({ ...match }));

const nextGroupCodeForMatches = (matches: Match[], groupName: string) => {
  const groupLetter = getGroupLetter(groupName);
  const nums = matches
    .filter((match) => match.phase === 'groups' && (match.groupName || '') === groupName && typeof match.code === 'string')
    .map((match) => String(match.code || '').trim())
    .filter((code) => code.startsWith(groupLetter))
    .map((code) => parseInt(code.slice(groupLetter.length), 10))
    .filter((value) => Number.isFinite(value));
  return (nums.length ? Math.max(...nums) : 0) + 1;
};

const nextOrderIndexForMatches = (matches: Match[]) => {
  return matches.reduce((max, match) => Math.max(max, match.orderIndex ?? 0), 0) + 1;
};

const createGroupMatchesForInsertedTeam = (
  matches: Match[],
  groupName: string,
  teamToInsert: Team,
  existingTeams: Team[]
) => {
  const next = cloneMatchList(matches);
  let orderIndex = nextOrderIndexForMatches(next);
  let codeCounter = nextGroupCodeForMatches(next, groupName);
  const groupLetter = getGroupLetter(groupName);
  const newMatches: Match[] = [];

  for (const team of existingTeams) {
    const exists = next.some(
      (match) =>
        match.phase === 'groups' &&
        (match.groupName || '') === groupName &&
        !match.hidden &&
        !match.isBye &&
        ((match.teamAId === team.id && match.teamBId === teamToInsert.id) ||
          (match.teamAId === teamToInsert.id && match.teamBId === team.id))
    );
    if (exists) continue;

    newMatches.push({
      id: uuid(),
      teamAId: team.id,
      teamBId: teamToInsert.id,
      scoreA: 0,
      scoreB: 0,
      played: false,
      status: 'scheduled',
      phase: 'groups',
      groupName,
      code: `${groupLetter}${codeCounter++}`,
      orderIndex: orderIndex++,
    });
  }

  return [...next, ...newMatches];
};

const syncGroupsSnapshot = (snapshot: TournamentStructureSnapshot): TournamentStructureSnapshot => {
  const next = cloneSnapshot(snapshot);
  if (next.tournament.type === 'groups_elimination') {
    next.matches = syncBracketFromGroups(next.tournament, next.matches);
  }
  next.tournament.matches = cloneMatchList(next.matches);
  next.tournament.rounds = buildBracketRoundsFromMatches(next.matches);
  return syncTournamentRosterFromStructure(next);
};

const isRealTeamId = (id?: string) => {
  const raw = String(id || '').trim();
  return !!raw && !isPlaceholderTeamId(raw);
};

const resetEditableBracketMatch = (match: Match): Match => {
  if (match.phase !== 'bracket') return match;
  if (isLockedBracketMatchForStructureEdit(match)) return match;

  const teamAId = String(match.teamAId || '').trim();
  const teamBId = String(match.teamBId || '').trim();
  const hasBye = isByeTeamId(teamAId) || isByeTeamId(teamBId);
  const hasPlaceholder = !teamAId || !teamBId || isPlaceholderTeamId(teamAId) || isPlaceholderTeamId(teamBId);
  const wasStructural = !!match.isBye || !!match.hidden;

  if (!hasPlaceholder && !wasStructural) return match;

  return {
    ...match,
    scoreA: 0,
    scoreB: 0,
    played: false,
    status: 'scheduled',
    hidden: hasBye,
    isBye: hasBye,
    stats: undefined,
  };
};

const clearChangedAutoWinnerFromUnlockedSuccessors = (
  matches: Match[],
  sourceMatchId: string,
  previousWinnerId?: string
): Match[] => {
  const staleWinnerId = String(previousWinnerId || '').trim();
  if (!staleWinnerId || isPlaceholderTeamId(staleWinnerId)) return matches;

  let out = deriveBracketSuccessorLinks(matches || []);
  const sourceMatch = out.find((match) => match.id === sourceMatchId);
  if (!sourceMatch || resolveWinnerTeamId(sourceMatch) === staleWinnerId) return out;

  let currentMatchId = sourceMatchId;
  const visited = new Set<string>();
  for (let guard = 0; guard < 64; guard += 1) {
    if (visited.has(currentMatchId)) break;
    visited.add(currentMatchId);

    const successor = findSuccessorMatch(out, currentMatchId);
    if (!successor) break;
    const targetIndex = out.findIndex((match) => match.id === successor.match.id);
    if (targetIndex < 0) break;
    const target = out[targetIndex];
    if (isLockedBracketMatchForStructureEdit(target)) break;

    const currentValue = String((target as any)[successor.slot] || '').trim();
    if (currentValue !== staleWinnerId) {
      if (resolveWinnerTeamId(target) === staleWinnerId) {
        currentMatchId = target.id;
        continue;
      }
      break;
    }

    const updated = resetEditableBracketMatch({
      ...target,
      [successor.slot]: undefined,
    } as Match);
    out = out.map((match) => (match.id === updated.id ? updated : match));
    currentMatchId = updated.id;
  }

  return out;
};

const normalizeFutureBracketMatch = (match: Match): Match => {
  if (match.phase !== 'bracket') return match;
  if (match.status === 'playing' || (match.status === 'finished' && !match.isBye && !match.hidden)) return match;

  const next: Match = {
    ...match,
    scoreA: match.status === 'finished' ? match.scoreA || 0 : 0,
    scoreB: match.status === 'finished' ? match.scoreB || 0 : 0,
    stats: match.status === 'finished' ? match.stats : undefined,
  };

  const a = String(next.teamAId || '').trim();
  const b = String(next.teamBId || '').trim();
  const aIsBye = isByeTeamId(a);
  const bIsBye = isByeTeamId(b);
  const aIsReal = isRealTeamId(a);
  const bIsReal = isRealTeamId(b);

  if (aIsBye || bIsBye) {
    next.hidden = true;
    next.isBye = true;
    next.scoreA = 0;
    next.scoreB = 0;
    next.stats = undefined;

    if (aIsBye && bIsReal && !isTbdTeamId(b)) {
      next.played = true;
      next.status = 'finished';
      return next;
    }
    if (bIsBye && aIsReal && !isTbdTeamId(a)) {
      next.played = true;
      next.status = 'finished';
      return next;
    }
    if (aIsBye && bIsBye) {
      next.played = true;
      next.status = 'finished';
      return next;
    }

    next.played = false;
    next.status = 'scheduled';
    return next;
  }

  next.hidden = false;
  next.isBye = false;
  if (next.status !== 'finished') {
    next.played = false;
    next.status = 'scheduled';
    next.scoreA = 0;
    next.scoreB = 0;
    next.stats = undefined;
  }
  return next;
};

export const realignFutureBracketFromRound1 = (snapshot: TournamentStructureSnapshot): TournamentStructureSnapshot => {
  const next = cloneSnapshot(snapshot);
  next.matches = reconcileBracketAdvancements(next.matches, { resetFutureParticipants: true }).map((match) =>
    match.phase === 'bracket' ? normalizeFutureBracketMatch(match) : match
  );
  next.tournament.matches = cloneMatchList(next.matches);
  next.tournament.rounds = buildBracketRoundsFromMatches(next.matches);
  return syncTournamentRosterFromStructure(next);
};

const makeResult = (
  nextSnapshot: TournamentStructureSnapshot,
  type: StructuralOperation['type'],
  message: string,
  check?: StructuralTargetCheck
): StructuralOperationResult => ({
  ok: true,
  check: check || {
    allowed: true,
    severity: 'allowed',
    reasonCode: 'ok',
    humanMessage: message,
  },
  nextSnapshot,
  entry: {
    id: uuid(),
    type,
    message,
    at: new Date().toISOString(),
  },
});

const blockedLike = (reasonCode: string, humanMessage: string) => ({
  allowed: false,
  severity: 'blocking' as const,
  reasonCode,
  humanMessage,
});

const makeBlockedResult = (check: StructuralOperationResult['check']): StructuralOperationResult => ({
  ok: false,
  blocking: true,
  check,
});

const applyInsertTeamInGroup = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  groupId: string
): StructuralOperationResult => {
  const check = canInsertTeamIntoGroup(snapshot, teamId, groupId);
  if (!check.allowed) return makeBlockedResult(check);
  const group = getGroupById(snapshot, groupId);
  const team = getCatalogTeam(snapshot, teamId);
  if (!group || !team) return makeBlockedResult({ ...check, allowed: false, severity: 'blocking' });

  const next = cloneSnapshot(snapshot);
  const nextGroup = getGroupById(next, groupId);
  if (!nextGroup) return makeBlockedResult(blockedLike('unknown', 'Girone non trovato.'));
  nextGroup.teams = [...(nextGroup.teams || []), { ...team }];
  const existingTeams = (nextGroup.teams || [])
    .filter((row) => row.id !== team.id)
    .filter((row) => !row.hidden && !row.isBye)
    .filter((row) => !isPlaceholderTeamId(row.id));
  next.matches = createGroupMatchesForInsertedTeam(next.matches, nextGroup.name, team, existingTeams);
  const synced = syncGroupsSnapshot(next);
  return makeResult(synced, 'INSERT_TEAM_IN_GROUP', `Inserita ${team.name} in ${nextGroup.name}.`, check);
};

const applyMoveTeamBetweenGroups = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  fromGroupId: string,
  toGroupId: string
): StructuralOperationResult => {
  const check = canMoveTeamBetweenGroups(snapshot, teamId, fromGroupId, toGroupId);
  if (!check.allowed) return makeBlockedResult(check);
  const fromGroup = getGroupById(snapshot, fromGroupId);
  const toGroup = getGroupById(snapshot, toGroupId);
  const team = getCatalogTeam(snapshot, teamId);
  if (!fromGroup || !toGroup || !team) return makeBlockedResult(blockedLike('unknown', 'Dati gruppo non trovati.'));

  const next = cloneSnapshot(snapshot);
  const source = getGroupById(next, fromGroupId)!;
  const target = getGroupById(next, toGroupId)!;

  source.teams = (source.teams || []).filter((row) => row.id !== teamId);
  target.teams = [...(target.teams || []), { ...team }];

  const removeIds = new Set(
    next.matches
      .filter(
        (match) =>
          match.phase === 'groups' &&
          (match.groupName || '') === source.name &&
          !match.hidden &&
          !match.isBye &&
          [match.teamAId, match.teamBId].includes(teamId)
      )
      .map((match) => match.id)
  );
  next.matches = next.matches.filter((match) => !removeIds.has(match.id));

  const targetExistingTeams = (target.teams || [])
    .filter((row) => row.id !== teamId)
    .filter((row) => !row.hidden && !row.isBye)
    .filter((row) => !isPlaceholderTeamId(row.id));
  next.matches = createGroupMatchesForInsertedTeam(next.matches, target.name, team, targetExistingTeams);

  const synced = syncGroupsSnapshot(next);
  return makeResult(synced, 'MOVE_TEAM_BETWEEN_GROUPS', `Spostata ${team.name}: ${source.name} → ${target.name}.`, check);
};

const applySwapGroupTeams = (
  snapshot: TournamentStructureSnapshot,
  teamAId: string,
  teamBId: string,
  groupAId: string,
  groupBId: string
): StructuralOperationResult => {
  const check = canSwapTeams(snapshot, teamAId, teamBId, 'groups', groupAId, groupBId);
  if (!check.allowed) return makeBlockedResult(check);
  const groupA = getGroupById(snapshot, groupAId);
  const groupB = getGroupById(snapshot, groupBId);
  const teamA = getCatalogTeam(snapshot, teamAId);
  const teamB = getCatalogTeam(snapshot, teamBId);
  if (!groupA || !groupB || !teamA || !teamB) return makeBlockedResult(blockedLike('unknown', 'Dati non trovati.'));

  const next = cloneSnapshot(snapshot);
  const nextA = getGroupById(next, groupAId)!;
  const nextB = getGroupById(next, groupBId)!;

  nextA.teams = (nextA.teams || []).map((row) => (row.id === teamAId ? { ...teamB } : row));
  nextB.teams = (nextB.teams || []).map((row) => (row.id === teamBId ? { ...teamA } : row));

  const removeIds = new Set(
    next.matches
      .filter(
        (match) =>
          match.phase === 'groups' &&
          !match.hidden &&
          !match.isBye &&
          (((match.groupName || '') === nextA.name && [match.teamAId, match.teamBId].includes(teamAId)) ||
            ((match.groupName || '') === nextB.name && [match.teamAId, match.teamBId].includes(teamBId)))
      )
      .map((match) => match.id)
  );
  next.matches = next.matches.filter((match) => !removeIds.has(match.id));

  const groupATargets = (nextA.teams || [])
    .filter((row) => row.id !== teamBId)
    .filter((row) => !row.hidden && !row.isBye)
    .filter((row) => !isPlaceholderTeamId(row.id));
  const groupBTargets = (nextB.teams || [])
    .filter((row) => row.id !== teamAId)
    .filter((row) => !row.hidden && !row.isBye)
    .filter((row) => !isPlaceholderTeamId(row.id));
  next.matches = createGroupMatchesForInsertedTeam(next.matches, nextA.name, teamB, groupATargets);
  next.matches = createGroupMatchesForInsertedTeam(next.matches, nextB.name, teamA, groupBTargets);

  const synced = syncGroupsSnapshot(next);
  return makeResult(synced, 'SWAP_GROUP_TEAMS', `Scambio completato: ${teamA.name} ↔ ${teamB.name}.`, check);
};

const applyReplaceGroupTeam = (
  snapshot: TournamentStructureSnapshot,
  oldTeamId: string,
  newTeamId: string,
  groupId: string
): StructuralOperationResult => {
  const check = canReplaceGroupTeam(snapshot, oldTeamId, newTeamId, groupId);
  if (!check.allowed) return makeBlockedResult(check);

  const next = cloneSnapshot(snapshot);
  const group = getGroupById(next, groupId);
  if (!group) return makeBlockedResult(blockedLike('unknown', 'Girone non trovato.'));
  const newTeam = getCatalogTeam(next, newTeamId);
  const oldTeam = getCatalogTeam(next, oldTeamId);
  if (!newTeam) return makeBlockedResult(blockedLike('team_not_found', 'Nuova squadra non trovata.'));

  group.teams = (group.teams || []).map((row) => (row.id === oldTeamId ? { ...newTeam } : row));
  const removeIds = new Set(
    next.matches
      .filter(
        (match) =>
          match.phase === 'groups' &&
          (match.groupName || '') === group.name &&
          !match.hidden &&
          !match.isBye &&
          [match.teamAId, match.teamBId].includes(oldTeamId)
      )
      .map((match) => match.id)
  );
  next.matches = next.matches.filter((match) => !removeIds.has(match.id));

  const targets = (group.teams || [])
    .filter((row) => row.id !== newTeamId)
    .filter((row) => !row.hidden && !row.isBye)
    .filter((row) => !isPlaceholderTeamId(row.id));
  next.matches = createGroupMatchesForInsertedTeam(next.matches, group.name, newTeam, targets);

  const synced = syncGroupsSnapshot(next);
  return makeResult(synced, 'REPLACE_GROUP_TEAM', `Sostituita ${oldTeam?.name || oldTeamId} con ${newTeam.name} in ${group.name}.`, check);
};

const applyRemoveTeamFromGroup = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  groupId: string
): StructuralOperationResult => {
  const check = canRemoveTeamFromGroup(snapshot, teamId, groupId);
  if (!check.allowed) return makeBlockedResult(check);
  const group = getGroupById(snapshot, groupId);
  const team = getCatalogTeam(snapshot, teamId);
  if (!group) return makeBlockedResult(blockedLike('unknown', 'Girone non trovato.'));

  const next = cloneSnapshot(snapshot);
  const nextGroup = getGroupById(next, groupId);
  if (!nextGroup) return makeBlockedResult(blockedLike('unknown', 'Girone non trovato.'));
  nextGroup.teams = (nextGroup.teams || []).filter((row) => row.id !== teamId);
  next.matches = next.matches.filter(
    (match) =>
      !(
        match.phase === 'groups' &&
        (match.groupName || '') === group.name &&
        getMatchParticipantIds(match).includes(teamId)
      )
  );

  const synced = syncGroupsSnapshot(next);
  return makeResult(synced, 'REMOVE_GROUP_TEAM', `Rimossa ${team?.name || teamId} da ${group.name}.`, check);
};

const applyInsertTeamInBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  slotKey: string
): StructuralOperationResult => {
  const check = canInsertTeamIntoBracketSlot(snapshot, teamId, slotKey);
  if (!check.allowed) return makeBlockedResult(check);
  const parsed = parseSlotKey(slotKey)!;
  const next = cloneSnapshot(snapshot);
  const match = getMatchById(next, parsed.matchId);
  const team = getCatalogTeam(next, teamId);
  if (!match || !team) return makeBlockedResult(blockedLike('unknown', 'Slot o squadra non trovati.'));
  const previousWinner = resolveWinnerTeamId(match);
  (match as any)[parsed.field] = teamId;
  const oppositeField: 'teamAId' | 'teamBId' = parsed.field === 'teamAId' ? 'teamBId' : 'teamAId';
  const oppositeSlotName: 'A' | 'B' = oppositeField === 'teamAId' ? 'A' : 'B';
  const oppositeValue = String((match as any)[oppositeField] || '').trim();
  const oppositeIsGroupPlaceholder = /^TBD-/i.test(oppositeValue);
  const oppositeHasFeeder = deriveBracketSuccessorLinks(next.matches).some(
    (candidate) =>
      candidate.phase === 'bracket' &&
      String(candidate.nextMatchId || '') === match.id &&
      candidate.nextSlot === oppositeSlotName
  );
  // Turn a lone insert into a real BYE only when nothing can ever fill the other
  // side: no advancing feeder and no group-qualification placeholder. Otherwise
  // the pairing stays open and waits for its real opponent.
  if (
    (!oppositeValue || isPlaceholderTeamId(oppositeValue)) &&
    !isByeTeamId(oppositeValue) &&
    !oppositeIsGroupPlaceholder &&
    !oppositeHasFeeder
  ) {
    (match as any)[oppositeField] = 'BYE';
  }
  Object.assign(match, resetEditableBracketMatch(match));
  next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, match.id, previousWinner);
  const synced = realignFutureBracketFromRound1(next);
  return makeResult(synced, 'INSERT_TEAM_IN_BRACKET_SLOT', `Inserita ${team.name} nel tabellone.`, check);
};

const applyReplaceBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  slotKey: string,
  newTeamId: string
): StructuralOperationResult => {
  const check = canReplaceBracketSlot(snapshot, slotKey, newTeamId);
  if (!check.allowed) return makeBlockedResult(check);
  const parsed = parseSlotKey(slotKey)!;
  const next = cloneSnapshot(snapshot);
  const match = getMatchById(next, parsed.matchId);
  const team = getCatalogTeam(next, newTeamId);
  if (!match || !team) return makeBlockedResult(blockedLike('unknown', 'Slot o squadra non trovati.'));
  const previousWinner = resolveWinnerTeamId(match);
  (match as any)[parsed.field] = newTeamId;
  Object.assign(match, resetEditableBracketMatch(match));
  next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, match.id, previousWinner);
  const synced = realignFutureBracketFromRound1(next);
  return makeResult(synced, 'REPLACE_BRACKET_SLOT', `Sostituita la squadra nel tabellone con ${team.name}.`, check);
};

const applyClearBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  slotKey: string
): StructuralOperationResult => {
  const check = canClearBracketSlot(snapshot, slotKey);
  if (!check.allowed) return makeBlockedResult(check);
  const parsed = parseSlotKey(slotKey)!;
  const next = cloneSnapshot(snapshot);
  const match = getMatchById(next, parsed.matchId);
  if (!match) return makeBlockedResult(blockedLike('unknown', 'Match bracket non trovato.'));
  const currentValue = String((match as any)[parsed.field] || '').trim();
  const teamName = getCatalogTeam(snapshot, currentValue)?.name || currentValue;
  const previousWinner = resolveWinnerTeamId(match);
  (match as any)[parsed.field] = 'BYE';
  Object.assign(match, resetEditableBracketMatch(match));
  next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, match.id, previousWinner);
  const synced = realignFutureBracketFromRound1(next);
  return makeResult(synced, 'CLEAR_BRACKET_SLOT', `Rimossa ${teamName} dal tabellone.`, check);
};

const applyMoveBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  fromSlotKey: string,
  toSlotKey: string
): StructuralOperationResult => {
  const check = canMoveBracketSlot(snapshot, fromSlotKey, toSlotKey);
  if (!check.allowed) return makeBlockedResult(check);
  const fromParsed = parseSlotKey(fromSlotKey)!;
  const toParsed = parseSlotKey(toSlotKey)!;
  const next = cloneSnapshot(snapshot);
  const fromMatch = getMatchById(next, fromParsed.matchId);
  const toMatch = getMatchById(next, toParsed.matchId);
  if (!fromMatch || !toMatch) return makeBlockedResult(blockedLike('unknown', 'Match bracket non trovato.'));
  const value = String((fromMatch as any)[fromParsed.field] || '').trim();
  const targetPlaceholder = String((toMatch as any)[toParsed.field] || '').trim();
  const previousFromWinner = resolveWinnerTeamId(fromMatch);
  const previousToWinner = fromMatch.id === toMatch.id ? previousFromWinner : resolveWinnerTeamId(toMatch);
  (fromMatch as any)[fromParsed.field] = targetPlaceholder && isPlaceholderTeamId(targetPlaceholder) ? targetPlaceholder : undefined;
  (toMatch as any)[toParsed.field] = value;
  Object.assign(fromMatch, resetEditableBracketMatch(fromMatch));
  Object.assign(toMatch, resetEditableBracketMatch(toMatch));
  next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, fromMatch.id, previousFromWinner);
  if (fromMatch.id !== toMatch.id) {
    next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, toMatch.id, previousToWinner);
  }
  const synced = realignFutureBracketFromRound1(next);
  return makeResult(synced, 'MOVE_BRACKET_SLOT', `Spostata la squadra ${getCatalogTeam(snapshot, value)?.name || value} nel tabellone.`, check);
};

const applySwapBracketSlots = (
  snapshot: TournamentStructureSnapshot,
  slotAKey: string,
  slotBKey: string
): StructuralOperationResult => {
  const check = canSwapBracketSlots(snapshot, slotAKey, slotBKey);
  if (!check.allowed) return makeBlockedResult(check);

  const valueA = getSlotValue(snapshot, slotAKey);
  const valueB = getSlotValue(snapshot, slotBKey);
  const aPlaceholder = isPlaceholderTeamId(valueA);
  const bPlaceholder = isPlaceholderTeamId(valueB);

  if (!aPlaceholder && bPlaceholder) {
    return applyMoveBracketSlot(snapshot, slotAKey, slotBKey);
  }
  if (aPlaceholder && !bPlaceholder) {
    return applyMoveBracketSlot(snapshot, slotBKey, slotAKey);
  }

  const parsedA = parseSlotKey(slotAKey)!;
  const parsedB = parseSlotKey(slotBKey)!;
  const next = cloneSnapshot(snapshot);
  const matchA = getMatchById(next, parsedA.matchId);
  const matchB = getMatchById(next, parsedB.matchId);
  if (!matchA || !matchB) return makeBlockedResult(blockedLike('unknown', 'Match bracket non trovato.'));
  const currentA = String((matchA as any)[parsedA.field] || '').trim();
  const currentB = String((matchB as any)[parsedB.field] || '').trim();
  const previousWinnerA = resolveWinnerTeamId(matchA);
  const previousWinnerB = matchA.id === matchB.id ? previousWinnerA : resolveWinnerTeamId(matchB);
  (matchA as any)[parsedA.field] = currentB;
  (matchB as any)[parsedB.field] = currentA;
  Object.assign(matchA, resetEditableBracketMatch(matchA));
  Object.assign(matchB, resetEditableBracketMatch(matchB));
  next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, matchA.id, previousWinnerA);
  if (matchA.id !== matchB.id) {
    next.matches = clearChangedAutoWinnerFromUnlockedSuccessors(next.matches, matchB.id, previousWinnerB);
  }
  const synced = realignFutureBracketFromRound1(next);
  return makeResult(synced, 'SWAP_BRACKET_SLOTS', 'Scambiate due posizioni nel tabellone.', check);
};


const applyAddCatalogTeam = (
  snapshot: TournamentStructureSnapshot,
  team: Team
): StructuralOperationResult => {
  const name = String(team.name || '').trim();
  const player1 = String(team.player1 || '').trim();
  const player2 = String(team.player2 || '').trim();
  if (!name || !player1 || !player2) {
    return makeBlockedResult(blockedLike('team_not_found', 'Per aggiungere una squadra servono nome squadra e due giocatori.'));
  }

  const next = cloneSnapshot(snapshot);
  const normalized: Team = {
    ...team,
    id: String(team.id || uuid()).trim(),
    name,
    player1,
    player2,
    createdAt: team.createdAt || Date.now(),
  };
  if ((next.catalogTeams || []).some((row) => row.id === normalized.id)) {
    return makeBlockedResult(blockedLike('duplicate_in_groups', 'Esiste già una squadra con questo identificativo nel pool editor.'));
  }
  next.catalogTeams = [...(next.catalogTeams || []), normalized];
  return makeResult(next, 'ADD_CATALOG_TEAM', `Aggiunta ${normalized.name} al pool editor.`);
};

const applyAddPreliminaryBracketRound = (
  snapshot: TournamentStructureSnapshot
): StructuralOperationResult => {
  if (hasRealBracketStarted(snapshot)) {
    return makeBlockedResult(blockedLike('locked_by_bracket_match', 'Non posso aggiungere un turno preliminare dopo l’avvio del bracket reale.'));
  }

  const round1 = getRound1Matches(snapshot);
  if (!round1.length) {
    return makeBlockedResult(blockedLike('unsupported_round', 'Nessun Round 1 disponibile da espandere.'));
  }

  const hasPlaceholders = round1.some((match) => {
    const slotA = String(match.teamAId || '').trim();
    const slotB = String(match.teamBId || '').trim();
    return !slotA || !slotB || isPlaceholderTeamId(slotA) || isPlaceholderTeamId(slotB);
  });
  if (hasPlaceholders) {
    return makeBlockedResult(blockedLike('slot_not_placeholder', 'Il Round 1 ha ancora slot BYE/TBD: usa prima quelli già disponibili.'));
  }

  const next = cloneSnapshot(snapshot);
  const shiftedMatches = cloneMatchList(next.matches).map((match) => {
    if (match.phase !== 'bracket') return match;
    return {
      ...match,
      round: (match.round || 1) + 1,
      code: undefined,
    };
  });

  let orderIndex = shiftedMatches
    .filter((match) => match.phase !== 'bracket')
    .reduce((max, match) => Math.max(max, match.orderIndex ?? -1), -1) + 1;

  const newRound1: Match[] = [];
  round1.forEach((match, matchIndex) => {
    const seeds = [String(match.teamAId || '').trim(), String(match.teamBId || '').trim()];
    seeds.forEach((teamId, sideIndex) => {
      newRound1.push({
        id: uuid(),
        teamAId: teamId || 'BYE',
        teamBId: 'BYE',
        scoreA: 0,
        scoreB: 0,
        played: false,
        status: 'scheduled',
        phase: 'bracket',
        round: 1,
        roundName: getBracketRoundName(round1.length * 2),
        code: `B1${matchIndex * 2 + sideIndex + 1}`,
        orderIndex: orderIndex++,
        hidden: true,
        isBye: true,
      });
    });
  });

  const shiftedBracketByRound = new Map<number, Match[]>();
  for (const match of shiftedMatches) {
    if (match.phase !== 'bracket') continue;
    const round = match.round || 1;
    if (!shiftedBracketByRound.has(round)) shiftedBracketByRound.set(round, []);
    shiftedBracketByRound.get(round)!.push(match);
  }

  for (const roundNumber of Array.from(shiftedBracketByRound.keys()).sort((a, b) => a - b)) {
    const roundMatches = (shiftedBracketByRound.get(roundNumber) || []).slice().sort(sortByOrderIndexSafe);
    const roundName = getBracketRoundName(roundMatches.length);
    roundMatches.forEach((match, index) => {
      match.roundName = roundName;
      match.code = `B${roundNumber}${index + 1}`;
      match.orderIndex = orderIndex++;
    });
  }

  next.matches = deriveBracketSuccessorLinks(
    [...shiftedMatches.filter((match) => match.phase !== 'bracket'), ...newRound1, ...shiftedMatches.filter((match) => match.phase === 'bracket')],
    { overwrite: true }
  );
  next.tournament.matches = cloneMatchList(next.matches);
  next.tournament.rounds = buildBracketRoundsFromMatches(next.matches);
  const synced = realignFutureBracketFromRound1(next);
  return makeResult(synced, 'ADD_PRELIMINARY_BRACKET_ROUND', 'Aggiunto un turno preliminare vuoto davanti al Round 1 corrente.');
};

export const applyStructuralOperation = (
  snapshot: TournamentStructureSnapshot,
  operation: StructuralOperation
): StructuralOperationResult => {
  switch (operation.type) {
    case 'INSERT_TEAM_IN_GROUP':
      return applyInsertTeamInGroup(snapshot, operation.teamId, operation.groupId);
    case 'MOVE_TEAM_BETWEEN_GROUPS':
      return applyMoveTeamBetweenGroups(snapshot, operation.teamId, operation.fromGroupId, operation.toGroupId);
    case 'SWAP_GROUP_TEAMS':
      return applySwapGroupTeams(snapshot, operation.teamAId, operation.teamBId, operation.groupAId, operation.groupBId);
    case 'REPLACE_GROUP_TEAM':
      return applyReplaceGroupTeam(snapshot, operation.oldTeamId, operation.newTeamId, operation.groupId);
    case 'REMOVE_GROUP_TEAM':
      return applyRemoveTeamFromGroup(snapshot, operation.teamId, operation.groupId);
    case 'INSERT_TEAM_IN_BRACKET_SLOT':
      return applyInsertTeamInBracketSlot(snapshot, operation.teamId, operation.slotKey);
    case 'REPLACE_BRACKET_SLOT':
      return applyReplaceBracketSlot(snapshot, operation.slotKey, operation.newTeamId);
    case 'MOVE_BRACKET_SLOT':
      return applyMoveBracketSlot(snapshot, operation.fromSlotKey, operation.toSlotKey);
    case 'CLEAR_BRACKET_SLOT':
      return applyClearBracketSlot(snapshot, operation.slotKey);
    case 'SWAP_BRACKET_SLOTS':
      return applySwapBracketSlots(snapshot, operation.slotAKey, operation.slotBKey);
    case 'ADD_CATALOG_TEAM':
      return applyAddCatalogTeam(snapshot, operation.team);
    case 'ADD_PRELIMINARY_BRACKET_ROUND':
      return applyAddPreliminaryBracketRound(snapshot);
    default:
      return makeBlockedResult(blockedLike('unknown', 'Operazione non supportata.'));
  }
};
