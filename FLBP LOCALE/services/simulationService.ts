import { Match, MatchStats, Team } from '../types';

// Helper: Split integer into N parts randomly
const splitInt = (total: number, parts: number): number[] => {
    let remaining = total;
    const distribution: number[] = [];
    for (let i = 0; i < parts - 1; i++) {
        const val = Math.floor(Math.random() * (remaining + 1));
        distribution.push(val);
        remaining -= val;
    }
    distribution.push(remaining);
    // Shuffle to avoid bias
    return distribution.sort(() => Math.random() - 0.5);
};

// Helper: Generate blows (20% recursive probability)
const generateBlows = (): number => {
    let count = 0;
    while (Math.random() < 0.2) count++;
    return count;
};

export const simulateMatchResult = (match: Match, teamA: Team, teamB: Team) => {
    // Score policy:
    // - Default target is 10.
    // - For group tie-breaks we support targetScore=1 (race-to-1), still with the same
    //   recursive overtime-tie rule (so results like 2–1, 3–2 can happen in rare ties).
    const rawTarget = (match.targetScore ?? 10);
    const target = rawTarget >= 1 ? rawTarget : 10;

    let sA = 0;
    let sB = 0;

    // In ~3% of matches we simulate an overtime tie at target-target, then apply the 3% recursive tie rule.
    const overtimeMatch = Math.random() < 0.03;
    if (!overtimeMatch) {
        const winnerA = Math.random() < 0.5;
        const loser = Math.floor(Math.random() * target); // 0..target-1
        if (winnerA) {
            sA = target;
            sB = loser;
        } else {
            sB = target;
            sA = loser;
        }
    } else {
        // Overtime: start from a tie at the max score.
        sA = target;
        sB = target;
        // Tie continuation (3% recursive). Sudden-death otherwise.
        while (sA === sB) {
            const roll = Math.random();
            if (roll < 0.03) {
                // Rare: tie continues (both score)
                sA++;
                sB++;
            } else {
                // Sudden death: one team scores
                if (Math.random() < 0.5) sA++;
                else sB++;
            }
        }
    }

    // Stats Distribution
    const [ptsA1, ptsA2] = splitInt(sA, 2);
    const [ptsB1, ptsB2] = splitInt(sB, 2);

    const totalBlows = generateBlows();
    const blowDist = splitInt(totalBlows, 4);

    const stats: MatchStats[] = [
        { playerName: teamA.player1 || 'P1', teamId: teamA.id, canestri: ptsA1, soffi: blowDist[0] },
        { playerName: teamA.player2 || 'P2', teamId: teamA.id, canestri: ptsA2, soffi: blowDist[1] },
        { playerName: teamB.player1 || 'P1', teamId: teamB.id, canestri: ptsB1, soffi: blowDist[2] },
        { playerName: teamB.player2 || 'P2', teamId: teamB.id, canestri: ptsB2, soffi: blowDist[3] }
    ];

    return { scoreA: sA, scoreB: sB, stats };
};

// Multi-team tie-break simulation (A vs B vs C ...).
// Rules:
// - targetScore defaults to 10, but group tie-break uses 1 (race-to-1).
// - If multiple teams reach the target together, only tied leaders remain and target increases (1→2→3...).
// - This mirrors the recursive tie-resolution rule requested by the user.
export const simulateMultiMatchResult = (match: Match, teams: Team[]) => {
    const rawTarget = (match.targetScore ?? 10);
    const initialTarget = rawTarget >= 1 ? rawTarget : 10;

    const teamIds = (match.teamIds || []).filter(Boolean);
    const byId = new Map(teams.map(t => [t.id, t] as const));
    const participants = teamIds.filter(id => byId.has(id));
    if (participants.length < 2) {
        return { scoresByTeam: {}, stats: [] as MatchStats[] };
    }

    // Scores live in a single object for all teams.
    // Simulation policy: match the same "overtime recursion" rule used by 1v1 matches.
    // - Rare tie at the target (~3%) -> only the tied leaders remain.
    // - While leaders are tied: 3% chance everyone scores (tie continues), otherwise one scores (sudden-death).
    // This produces results like 2–1, 3–2, etc. also for multi-team tie-breaks.
    const scores: Record<string, number> = {};
    participants.forEach(id => { scores[id] = 0; });

    let active = [...participants];
    let target = initialTarget;

    // Stage 1: reach the initial target.
    const tieAtTarget = active.length >= 2 && Math.random() < 0.03;
    if (!tieAtTarget) {
        const winner = active[Math.floor(Math.random() * active.length)];
        scores[winner] = target;
        for (const id of active) {
            if (id === winner) continue;
            scores[id] = Math.floor(Math.random() * target); // 0..target-1
        }
    } else {
        // Choose 2..N leaders that "reach the target together".
        const leaderCount = Math.min(active.length, 2 + Math.floor(Math.random() * Math.max(1, active.length - 1)));
        const shuffled = [...active].sort(() => Math.random() - 0.5);
        const leaders = shuffled.slice(0, Math.max(2, leaderCount));

        for (const id of leaders) scores[id] = target;
        for (const id of active) {
            if (leaders.includes(id)) continue;
            scores[id] = Math.floor(Math.random() * target);
        }

        active = leaders;

        // Overtime recursion among leaders.
        while (true) {
            const roll = Math.random();
            if (roll < 0.03) {
                // Tie continues (all leaders score)
                active.forEach(id => { scores[id] = (scores[id] || 0) + 1; });
                target = target + 1;
                continue;
            }
            // Sudden death: one leader scores
            const winner = active[Math.floor(Math.random() * active.length)];
            scores[winner] = (scores[winner] || 0) + 1;
            break;
        }
    }

    // Build player stats: canestri split between players within each team.
    const allPlayers: Array<{ teamId: string; playerName: string }> = [];
    for (const id of participants) {
        const t = byId.get(id)!;
        if (t.player1) allPlayers.push({ teamId: id, playerName: t.player1 });
        if (t.player2) allPlayers.push({ teamId: id, playerName: t.player2 });
        if (!t.player1 && !t.player2) allPlayers.push({ teamId: id, playerName: 'P1' });
    }

    // Total blows for the whole match, distributed across all players.
    const totalBlows = generateBlows();
    const blowDist = splitInt(totalBlows, Math.max(1, allPlayers.length));

    const stats: MatchStats[] = [];
    let blowIdx = 0;
    for (const id of participants) {
        const t = byId.get(id)!;
        const teamScore = scores[id] || 0;
        const pCount = (t.player1 ? 1 : 0) + (t.player2 ? 1 : 0) || 1;
        const parts = splitInt(teamScore, pCount);

        const players = [t.player1 || 'P1', t.player2].filter(Boolean) as string[];
        if (!players.length) players.push('P1');

        for (let i = 0; i < players.length; i++) {
            stats.push({
                teamId: id,
                playerName: players[i],
                canestri: parts[i] ?? 0,
                soffi: blowDist[blowIdx++] ?? 0,
            });
        }
    }

    return { scoresByTeam: scores, stats };
};
