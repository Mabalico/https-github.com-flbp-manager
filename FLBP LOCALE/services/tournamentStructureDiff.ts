import type { Team } from '../types';
import type {
  BracketSlotDiff,
  CurrentPlacement,
  TeamPlacementDiff,
  TournamentStructureDiffResult,
  TournamentStructureSnapshot,
} from './tournamentStructureTypes';
import { getCatalogTeam, getRound1Matches, getSlotValue, getTeamPlacement, parseSlotKey } from './tournamentStructureSelectors';
import { isPlaceholderTeamId } from './matchUtils';

const placementKey = (placement?: CurrentPlacement) => {
  if (!placement) return '';
  return [placement.phase, placement.containerId || '', placement.slotKey || '', placement.matchId || ''].join('|');
};

const getTeamName = (snapshot: TournamentStructureSnapshot, teamId: string) => {
  const team = getCatalogTeam(snapshot, teamId);
  return team?.name || teamId;
};

const buildTeamPlacementDiff = (
  original: TournamentStructureSnapshot,
  draft: TournamentStructureSnapshot,
  teamId: string
): TeamPlacementDiff | null => {
  const before = getTeamPlacement(original, teamId, 'groups');
  const after = getTeamPlacement(draft, teamId, 'groups');
  if (placementKey(before) === placementKey(after)) return null;

  const type: TeamPlacementDiff['type'] =
    !before && after
      ? 'insert'
      : before && !after
        ? 'remove'
        : before && after && before.containerId !== after.containerId
          ? 'move'
          : 'replace';

  return {
    teamId,
    teamName: getTeamName(draft, teamId),
    type,
    from: before,
    to: after,
  };
};

const buildBracketSlotDiffs = (
  original: TournamentStructureSnapshot,
  draft: TournamentStructureSnapshot,
  onlyFuture = false
): BracketSlotDiff[] => {
  const diffs: BracketSlotDiff[] = [];
  const originalMatches = new Map((original.matches || []).map((match) => [match.id, match] as const));

  for (const match of draft.matches || []) {
    if (match.phase !== 'bracket') continue;
    if (onlyFuture && (match.round || 1) <= 1) continue;
    const originalMatch = originalMatches.get(match.id);
    if (!originalMatch) continue;
    if (onlyFuture && (originalMatch.status === 'playing' || originalMatch.status === 'finished')) continue;

    const slotKeys: Array<'A' | 'B'> = ['A', 'B'];
    for (const side of slotKeys) {
      const slotKey = `${match.id}|${side}`;
      const beforeTeamId = getSlotValue(original, slotKey) || undefined;
      const afterTeamId = getSlotValue(draft, slotKey) || undefined;
      if ((beforeTeamId || '') === (afterTeamId || '')) continue;
      diffs.push({
        slotKey,
        matchId: match.id,
        round: match.round || 1,
        beforeTeamId,
        afterTeamId,
      });
    }
  }

  return diffs;
};

export const diffTournamentStructure = (
  original: TournamentStructureSnapshot,
  draft: TournamentStructureSnapshot
): TournamentStructureDiffResult => {
  const realTeamIds = new Set<string>();
  const collect = (teams: Team[] | undefined) => {
    for (const team of teams || []) {
      const id = String(team.id || '').trim();
      if (!id || isPlaceholderTeamId(id)) continue;
      realTeamIds.add(id);
    }
  };
  for (const group of original.tournament.groups || []) collect(group.teams);
  for (const group of draft.tournament.groups || []) collect(group.teams);

  const groupChanges = Array.from(realTeamIds)
    .map((teamId) => buildTeamPlacementDiff(original, draft, teamId))
    .filter(Boolean) as TeamPlacementDiff[];

  const bracketChanges = buildBracketSlotDiffs(original, draft, false).filter((diff) => diff.round === 1);
  const futureBracketChanges = buildBracketSlotDiffs(original, draft, true);
  const changedGroupIds = Array.from(
    new Set(
      groupChanges.flatMap((change) => [change.from?.containerId, change.to?.containerId].filter(Boolean) as string[])
    )
  );
  const changedMatchIds = Array.from(
    new Set([...bracketChanges, ...futureBracketChanges].map((change) => change.matchId))
  );

  return {
    changed: groupChanges.length > 0 || bracketChanges.length > 0 || futureBracketChanges.length > 0,
    operationsCount: groupChanges.length + bracketChanges.length,
    groupChanges,
    bracketChanges,
    futureBracketChanges,
    changedGroupIds,
    changedMatchIds,
  };
};
