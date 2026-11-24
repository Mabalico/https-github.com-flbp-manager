import type { Match, TournamentData } from '../types';
import { isByeMatch } from './matchUtils';

/**
 * Group-related helpers shared across admin/storage/engine.
 *
 * Hard constraints:
 * - Pure helpers only (no side-effects)
 * - Safe for missing/legacy data (undefined/null)
 * - Keep behavior identical to previous inline implementations
 */

/** Detects whether a group name refers to a Final/Finale stage. */
export const isFinalGroupName = (name?: string) => /\bfinale?\b/i.test(String(name || ''));

/** Detects whether a group is a Final stage group (by stage flag or by name). */
export const isFinalGroup = (g?: any) => !!g && ((g.stage === 'final') || isFinalGroupName(g.name));

export const formatGroupName = (name: string, t: (key: string) => string): string => {
  const fullName = (name || '').trim();
  if (!fullName) return t('codes_group_single');
  if (/^girone finale$/i.test(fullName)) return t('final_group_label');
  const suffix = /^girone\s+(.+)$/i.exec(fullName)?.[1];
  if (suffix || /^[a-z]$/i.test(fullName)) return `${t('codes_group_single')} ${suffix || fullName}`;
  return fullName;
};

/** Regular groups in tournament order, then the knockout rounds, then the final group. */
export const compareTournamentMatches = (tournament?: TournamentData | null) => {
  const groups = tournament?.groups || [];
  const groupOrder = new Map(groups.map((g, index) => [g.name, index]));
  const finals = new Set(groups.filter(isFinalGroup).map(g => g.name));
  const phaseOrder = (m: Match) => {
    if (m.phase === 'bracket' || (!m.phase && !m.groupName)) return 1;
    return finals.has(m.groupName || '') ? 2 : 0;
  };
  return (a: Match, b: Match): number => {
    const aName = a.groupName || '';
    const bName = b.groupName || '';
    const phase = phaseOrder(a) - phaseOrder(b);
    if (phase) return phase;
    if (aName !== bName) {
      const group = (groupOrder.get(aName) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(bName) ?? Number.MAX_SAFE_INTEGER);
      return group || aName.localeCompare(bName, undefined, { numeric: true });
    }
    return Number(!!a.isTieBreak) - Number(!!b.isTieBreak)
      || (a.round ?? 1) - (b.round ?? 1)
      || (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER);
  };
};

/** The round with Top N real slots is the first round the final group replaces. */
export const getFinalGroupStartRound = (matches: Match[], topTeams: number): number | undefined => {
  const counts = new Map<number, number>();
  for (const match of matches) {
    if (match.phase !== 'bracket') continue;
    const round = match.round || 1;
    counts.set(round, (counts.get(round) || 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => a - b).find(round => counts.get(round) === topTeams / 2);
};

/** Apply the same replacement to new activations and snapshots saved before it was recorded. */
export const applyFinalGroupSchedule = (tournament: TournamentData, matches: Match[]) => {
  const result = { ...tournament, matches };
  const config = tournament.config?.finalRoundRobin;
  if (!config?.activated || (config.topTeams !== 4 && config.topTeams !== 8)) return result;
  const rounds = tournament.rounds || [];
  const firstRound = getFinalGroupStartRound(matches, config.topTeams)
    ?? (rounds.findIndex(round => round.length === config.topTeams / 2) + 1);
  if (!firstRound) return result;

  const markReplaced = (match: Match, round: number, live = match): Match => {
    if (round < firstRound || live.played || live.status === 'finished' || isByeMatch(live)) return match;
    if (match.replacedByFinalGroup && match.hidden) return match;
    return { ...match, replacedByFinalGroup: true, hidden: true };
  };
  result.matches = matches.map(m => m.phase === 'bracket' ? markReplaced(m, m.round || 1) : m);
  if (rounds.length) {
    const liveById = new Map(result.matches.filter(m => m.phase === 'bracket').map(m => [m.id, m]));
    // A skeleton can predate the results. Mirror visibility without copying private report fields into it.
    result.rounds = rounds.map((round, index) => round.map(m => markReplaced(m, m.round || index + 1, liveById.get(m.id))));
  }
  return result;
};
