import { getMatchParticipantIds, isPlaceholderTeamId } from './matchUtils';
import { getGroupMatches, getRound1Matches, hasRealBracketStarted } from './tournamentStructureSelectors';
import type { TournamentStructureSnapshot } from './tournamentStructureTypes';

export interface TournamentStructureIntegritySummary {
  excluded: string[];
  rosterDuplicates: string[];
  duplicatesInGroups: string[];
  duplicatesInBracket: string[];
  groupDupCount: Record<string, number>;
  groupDupGroups: Record<string, string[]>;
  bracketDupCount: Record<string, number>;
  unknown: string[];
  concludedGroups: string[];
  bracketLocked: boolean;
  groupsConcludedCount: number;
  groupsTotal: number;
}

export const buildTournamentStructureIntegritySummary = (
  snapshot: TournamentStructureSnapshot
): TournamentStructureIntegritySummary => {
  const rosterAllIds = (snapshot.catalogTeams || [])
    .filter((team) => !team.hidden && !team.isBye)
    .map((team) => String(team.id || '').trim())
    .filter((id) => !!id && !isPlaceholderTeamId(id));

  const rosterCount = new Map<string, number>();
  for (const id of rosterAllIds) rosterCount.set(id, (rosterCount.get(id) || 0) + 1);

  const rosterIds = Array.from(rosterCount.keys());
  const rosterDuplicates = rosterIds.filter((id) => (rosterCount.get(id) || 0) > 1);
  const included = new Set<string>();
  const unknown = new Set<string>();
  const groupOcc = new Map<string, { count: number; groups: Set<string> }>();

  for (const group of snapshot.tournament.groups || []) {
    for (const team of group.teams || []) {
      const id = String(team.id || '').trim();
      if (!id || isPlaceholderTeamId(id) || team.hidden || team.isBye) continue;
      included.add(id);
      const occ = groupOcc.get(id) || { count: 0, groups: new Set<string>() };
      occ.count += 1;
      occ.groups.add(group.name);
      groupOcc.set(id, occ);
      if (!rosterCount.has(id)) unknown.add(id);
    }
  }

  const bracketOcc = new Map<string, number>();
  for (const match of getRound1Matches(snapshot)) {
    if (match.hidden || match.isBye) continue;
    for (const idRaw of getMatchParticipantIds(match)) {
      const id = String(idRaw || '').trim();
      if (!id || isPlaceholderTeamId(id)) continue;
      included.add(id);
      bracketOcc.set(id, (bracketOcc.get(id) || 0) + 1);
      if (!rosterCount.has(id)) unknown.add(id);
    }
  }

  for (const match of snapshot.matches || []) {
    if (match.hidden || match.isBye) continue;
    for (const idRaw of getMatchParticipantIds(match)) {
      const id = String(idRaw || '').trim();
      if (!id || isPlaceholderTeamId(id)) continue;
      included.add(id);
      if (!rosterCount.has(id)) unknown.add(id);
    }
  }

  const excluded = rosterIds.filter((id) => !included.has(id));
  const duplicatesInGroups = Array.from(groupOcc.entries())
    .filter(([, value]) => value.count > 1)
    .map(([id]) => id);
  const duplicatesInBracket = Array.from(bracketOcc.entries())
    .filter(([, value]) => value > 1)
    .map(([id]) => id);

  const groupDupCount: Record<string, number> = {};
  const groupDupGroups: Record<string, string[]> = {};
  for (const id of duplicatesInGroups) {
    const info = groupOcc.get(id);
    groupDupCount[id] = info?.count || 2;
    groupDupGroups[id] = info ? Array.from(info.groups) : [];
  }

  const bracketDupCount: Record<string, number> = {};
  for (const id of duplicatesInBracket) bracketDupCount[id] = bracketOcc.get(id) || 2;

  const concludedGroups = (snapshot.tournament.groups || [])
    .filter((group) => {
      const matches = getGroupMatches(snapshot, group.name);
      if (!matches.length) return false;
      return matches.every((match) => match.status === 'finished');
    })
    .map((group) => group.name);

  return {
    excluded,
    rosterDuplicates,
    duplicatesInGroups,
    duplicatesInBracket,
    groupDupCount,
    groupDupGroups,
    bracketDupCount,
    unknown: Array.from(unknown),
    concludedGroups,
    bracketLocked: hasRealBracketStarted(snapshot),
    groupsConcludedCount: concludedGroups.length,
    groupsTotal: (snapshot.tournament.groups || []).length,
  };
};
