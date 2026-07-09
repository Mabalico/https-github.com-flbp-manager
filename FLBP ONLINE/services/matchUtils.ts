import type { Match } from '../types';

/** Placeholder team id helpers (pure). */
export const isByeTeamId = (id?: string) => String(id || '').trim().toUpperCase() === 'BYE';

export const isTbdTeamId = (id?: string) => {
  const up = String(id || '').trim().toUpperCase();
  return up === 'TBD' || up.startsWith('TBD-');
};

export const isPlaceholderTeamId = (id?: string) => isByeTeamId(id) || isTbdTeamId(id);

/** Returns true when the match is a structural BYE slot and should not count as a real playable match. */
export const isByeMatch = (m: Match): boolean => {
  if (!m) return false;
  if (m.isBye) return true;
  return getMatchParticipantIds(m).some(isByeTeamId);
};


/**
 * Returns the participant teamIds for a match.
 * - Multi-team matches: `teamIds`
 * - Standard matches: `[teamAId, teamBId]`
 */
export const getMatchParticipantIds = (m: Match): string[] => {
  const ids = (m.teamIds && m.teamIds.length)
    ? m.teamIds
    : ([m.teamAId, m.teamBId].filter(Boolean) as string[]);
  return (ids || []).filter(Boolean) as string[];
};

/**
 * Returns the score for a team in a match.
 * Prefers explicit `scoresByTeam` (multi-team), then 1v1 `scoreA/scoreB`,
 * finally derives from `stats` as a fallback.
 */
export const getMatchScoreForTeam = (m: Match, teamId: string): number => {
  if (!teamId) return 0;

  if (m.scoresByTeam && typeof m.scoresByTeam[teamId] === 'number') {
    return m.scoresByTeam[teamId] || 0;
  }

  if (m.teamAId === teamId) return (m.scoreA ?? 0) as number;
  if (m.teamBId === teamId) return (m.scoreB ?? 0) as number;

  let tot = 0;
  for (const s of (m.stats || [])) {
    if (s.teamId === teamId) tot += (s.canestri || 0);
  }
  return tot;
};

/**
 * Convenience: builds a `{[teamId]: score}` map for all participants.
 */
export const getMatchScoresByTeam = (m: Match): Record<string, number> => {
  const ids = getMatchParticipantIds(m);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = getMatchScoreForTeam(m, id);
  return out;
};

/**
 * Formats a compact score label.
 * - Multi-team: "1-2-1"
 * - 1v1: "10-7"
 */
export const formatMatchScoreLabel = (m: Match): string => {
  const ids = getMatchParticipantIds(m);
  if (ids.length >= 3) {
    return ids.map(id => String(getMatchScoreForTeam(m, id))).join('-');
  }
  return `${m.scoreA ?? 0}-${m.scoreB ?? 0}`;
};

const normalizeMatchStatsForSync = (m?: Match | null) =>
  (m?.stats || [])
    .map((s) => ({
      teamId: String(s.teamId || ''),
      playerName: String(s.playerName || ''),
      canestri: Number(s.canestri || 0),
      soffi: Number(s.soffi || 0),
    }))
    .sort((a, b) => `${a.teamId}|${a.playerName}`.localeCompare(`${b.teamId}|${b.playerName}`));

export const buildMatchResultSyncSignature = (match?: Match | null) => {
  if (!match) return '';
  return JSON.stringify({
    id: match.id,
    teamAId: match.teamAId || null,
    teamBId: match.teamBId || null,
    teamIds: match.teamIds || null,
    scoresByTeam: match.scoresByTeam || null,
    scoreA: Number(match.scoreA || 0),
    scoreB: Number(match.scoreB || 0),
    played: !!match.played,
    status: match.status || 'scheduled',
    stats: normalizeMatchStatsForSync(match),
    round: match.round ?? null,
    code: match.code || null,
    phase: match.phase || null,
    groupName: match.groupName || null,
    roundName: match.roundName || null,
    orderIndex: match.orderIndex ?? null,
    nextMatchId: match.nextMatchId || null,
    nextSlot: match.nextSlot || null,
    hidden: !!match.hidden,
    isBye: !!match.isBye,
    isTieBreak: !!match.isTieBreak,
    targetScore: match.targetScore ?? null,
    refereeReportAudit: match.refereeReportAudit || null,
    refereeReportFinalId: match.refereeReportFinalId || null,
    refereeReportSource: match.refereeReportSource || null,
    refereeReportAuthorName: match.refereeReportAuthorName || null,
    refereeReportSavedAt: match.refereeReportSavedAt || null,
  });
};

export const collectChangedMatchResults = (before: Match[], after: Match[], primaryMatchId: string): Match[] => {
  const primaryId = String(primaryMatchId || '').trim();
  const beforeById = new Map((before || []).map((match) => [String(match.id || ''), match]));
  const out: Match[] = [];
  const seen = new Set<string>();
  const push = (match?: Match | null) => {
    const id = String(match?.id || '').trim();
    if (!id || seen.has(id) || !match) return;
    seen.add(id);
    out.push(match);
  };

  push((after || []).find((match) => String(match.id || '') === primaryId) || null);
  (after || []).forEach((match) => {
    const id = String(match.id || '').trim();
    if (!id) return;
    if (id === primaryId || buildMatchResultSyncSignature(match) !== buildMatchResultSyncSignature(beforeById.get(id))) {
      push(match);
    }
  });
  return out;
};

export const cloneMatchesForResultSync = (matches: Match[]): Match[] =>
  (matches || []).map((match) => ({
    ...match,
    teamIds: match.teamIds ? [...match.teamIds] : undefined,
    scoresByTeam: match.scoresByTeam ? { ...match.scoresByTeam } : undefined,
    stats: match.stats?.map((stat) => ({ ...stat })),
    refereeReportAudit: match.refereeReportAudit?.map((entry) => ({
      ...entry,
      scoresByTeam: entry.scoresByTeam ? { ...entry.scoresByTeam } : undefined,
      stats: entry.stats?.map((stat) => ({ ...stat })),
    })),
  }));

/**
 * Formats a compact match label with code + participant names.
 *
 * Output (default): "CODE • Team A vs Team B" (or multi: "A vs B vs C")
 *
 * NOTE: This helper is intentionally pure and requires a `getTeamName` resolver
 * to preserve existing behavior (e.g., fallbacks, BYE/TBD handling) in each caller.
 */
export const formatMatchTeamsLabel = (
  m: Match,
  getTeamName: (teamId: string) => string,
  opts?: {
    /** Whether to prefix with match code (default: true). */
    includeCode?: boolean;
    /** Separator between code and names (default: ' • '). */
    codeSep?: string;
    /** Join between team names (default: ' vs '). */
    vsSep?: string;
  }
): string => {
  const includeCode = opts?.includeCode ?? true;
  const codeSep = opts?.codeSep ?? ' • ';
  const vsSep = opts?.vsSep ?? ' vs ';

  const code = m.code || '-';
  const ids = getMatchParticipantIds(m);
  const names = ids.map(id => getTeamName(id));
  const teams = names.join(vsSep);
  return includeCode ? `${code}${codeSep}${teams}` : teams;
};
