import type { Match, Team } from '../types';

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  cupsFor: number;
  cupsAgainst: number;
  cupsDiff: number;
  blowFor: number;
  blowAgainst: number;
  blowDiff: number;
}

export interface GroupStandingsResult {
  rows: Record<string, StandingRow>;
  rankedTeams: Team[];
}

/**
 * Aggregate stats once per match to avoid O(participants * stats) scans.
 */
const aggregateMatchStats = (m: Match): { canestriByTeam: Record<string, number>; soffiByTeam: Record<string, number> } => {
  const canestriByTeam: Record<string, number> = {};
  const soffiByTeam: Record<string, number> = {};
  const stats = m.stats || [];
  for (const s of stats) {
    const tid = s.teamId;
    if (!tid) continue;
    canestriByTeam[tid] = (canestriByTeam[tid] || 0) + (s.canestri || 0);
    soffiByTeam[tid] = (soffiByTeam[tid] || 0) + (s.soffi || 0);
  }
  return { canestriByTeam, soffiByTeam };
};

const scoreForTeam = (m: Match, teamId: string, canestriByTeam: Record<string, number>): number => {
  // Prefer explicit multi-team scores when present.
  if (m.scoresByTeam && typeof m.scoresByTeam[teamId] === 'number') {
    return m.scoresByTeam[teamId] || 0;
  }
  // Result-only and legacy 1v1 reports store only the match score.
  if (m.teamAId === teamId) return m.scoreA || 0;
  if (m.teamBId === teamId) return m.scoreB || 0;
  // Fallback: derive from player stats.
  return canestriByTeam[teamId] || 0;
};

const soffiForTeam = (teamId: string, soffiByTeam: Record<string, number>): number => {
  return soffiByTeam[teamId] || 0;
};

const getParticipants = (m: Match): string[] => {
  const ids = (m.teamIds && m.teamIds.length) ? m.teamIds : (m.teamAId && m.teamBId ? [m.teamAId, m.teamBId] : []);
  return ids.filter(Boolean) as string[];
};

export const computeGroupStandings = (opts: { teams: Team[]; matches: Match[] }): GroupStandingsResult => {
  const { teams, matches } = opts;

  const rows: Record<string, StandingRow> = {};
  for (const t of teams) {
    rows[t.id] = {
      teamId: t.id,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      cupsFor: 0,
      cupsAgainst: 0,
      cupsDiff: 0,
      blowFor: 0,
      blowAgainst: 0,
      blowDiff: 0,
    };
  }

  for (const m of matches) {
    if (m.status !== 'finished') continue;
    const participants = getParticipants(m);
    if (participants.length < 2) continue;
    if (m.hidden) continue;
    if (m.isBye) continue;
    if (participants.includes('BYE')) continue;

    const { canestriByTeam, soffiByTeam } = aggregateMatchStats(m);

    // Multi-team: cupsAgainst/blowAgainst are defined as the SUM of opponents' values.
    const scores: Record<string, number> = {};
    const blows: Record<string, number> = {};
    let totalScore = 0;
    let totalBlows = 0;
    for (const id of participants) {
      const sc = scoreForTeam(m, id, canestriByTeam);
      const bl = soffiForTeam(id, soffiByTeam);
      scores[id] = sc;
      blows[id] = bl;
      totalScore += sc;
      totalBlows += bl;
    }

    for (const id of participants) {
      const r = rows[id];
      if (!r) continue;
      r.played += 1;
      r.cupsFor += scores[id] || 0;
      r.cupsAgainst += (totalScore - (scores[id] || 0));
      r.blowFor += blows[id] || 0;
      r.blowAgainst += (totalBlows - (blows[id] || 0));
    }

    // Win/Loss attribution: unique max wins. If tie at max (should not happen), skip win/loss update.
    const maxScore = Math.max(...participants.map(id => scores[id] || 0));
    const leaders = participants.filter(id => (scores[id] || 0) === maxScore);
    if (leaders.length === 1) {
      const winnerId = leaders[0];
      for (const id of participants) {
        const r = rows[id];
        if (!r) continue;
        if (id === winnerId) r.wins += 1;
        else r.losses += 1;
      }
    }
  }

  for (const id of Object.keys(rows)) {
    const r = rows[id];
    r.points = r.wins; // 1 punto per vittoria
    r.cupsDiff = r.cupsFor - r.cupsAgainst;
    r.blowDiff = r.blowFor - r.blowAgainst;
  }

  const rankedTeams = [...teams].sort((a, b) => {
    const A = rows[a.id];
    const B = rows[b.id];

    const pA = A?.points ?? 0;
    const pB = B?.points ?? 0;
    if (pB !== pA) return pB - pA;

    const dCA = A?.cupsDiff ?? 0;
    const dCB = B?.cupsDiff ?? 0;
    if (dCB !== dCA) return dCB - dCA;

    const dSA = A?.blowDiff ?? 0;
    const dSB = B?.blowDiff ?? 0;
    if (dSB !== dSA) return dSB - dSA;

    const cfA = A?.cupsFor ?? 0;
    const cfB = B?.cupsFor ?? 0;
    if (cfB !== cfA) return cfB - cfA;

    return (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' });
  });

  return { rows, rankedTeams };
};
