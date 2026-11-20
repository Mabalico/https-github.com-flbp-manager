import type { Match } from '../types';

/** Shared eligibility for player statistics, including legacy completed matches. */
export const hasCountedPlayerStats = (match?: Pick<Match, 'played' | 'status' | 'stats'> | null): boolean =>
  !!match && (match.played || match.status === 'finished') && Array.isArray(match.stats);

/** Placeholder team id helpers (pure). */
export const isByeTeamId = (id?: string) => String(id || '').trim().toUpperCase() === 'BYE';

export const isTbdTeamId = (id?: string) => {
  const up = String(id || '').trim().toUpperCase();
  return up === 'TBD' || up.startsWith('TBD-');
};

export const isPlaceholderTeamId = (id?: string) => isByeTeamId(id) || isTbdTeamId(id);

/** Match codes are compared trimmed and case-insensitive ('' when missing). */
export const normalizeMatchCode = (code?: string | null) => String(code || '').trim().toUpperCase();

/**
 * Bracket matches are created as B{round}{n} (B11, B12, B21...). Group codes are the group letter
 * plus a tournament-wide counter, so group B can already hold the same codes (B7-B12 with 4 groups
 * of 4). When any bracket code is taken, the whole bracket switches to E{round}{n}: E as
 * "Eliminazione diretta" on the paper referto, read by both the admin OCR ([GBE]\d{1,4}) and the
 * referee OCR. From five groups up group E can hold E codes too: a bracket code still taken there
 * gets the first E number above every E code in the tournament. Updates `bracketMatches` in place.
 */
export const avoidBracketCodeClashes = (bracketMatches: Match[], takenCodes: Array<string | null | undefined>) => {
  const taken = new Set(takenCodes.map(normalizeMatchCode).filter(Boolean));
  if (bracketMatches.every((match) => !taken.has(normalizeMatchCode(match.code)))) return;

  const clashes: Match[] = [];
  for (const match of bracketMatches) {
    const code = normalizeMatchCode(match.code).replace(/^B/, 'E');
    if (!code || taken.has(code)) {
      clashes.push(match);
      continue;
    }
    match.code = code;
    taken.add(code);
  }
  let nextNumber = 1;
  taken.forEach((code) => {
    const number = /^E(\d+)$/.exec(code);
    if (number) nextNumber = Math.max(nextNumber, Number(number[1]) + 1);
  });
  for (const match of clashes) match.code = `E${nextNumber++}`;
};

/**
 * Picks the match a referto code refers to. Tournaments saved before codes were unique can hold the
 * same code twice (group B and bracket B11): the match still to be played wins. Returns null when
 * the caller must ask: several matches still to be played, or only finished ones while another
 * match shares the code (e.g. a bracket match still on TBD). A code used once opens its match even
 * when finished, so a report can be corrected. `reportable` is the subset of `sameCode` that can
 * take a report.
 */
export const pickMatchForCode = (sameCode: Match[], reportable: Match[]): Match | null => {
  const toPlay = reportable.filter((match) => match.status !== 'finished' && !match.played);
  if (toPlay.length === 1) return toPlay[0];
  if (!toPlay.length && reportable.length === 1 && sameCode.length === 1) return reportable[0];
  return null;
};

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
