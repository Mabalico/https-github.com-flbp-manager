import { Team, Match, TournamentData, Group, FinalRoundRobinConfig } from '../types';
import { computeGroupStandings } from './groupStandings';
import { isFinalGroup } from './groupUtils';

const uuid = () => Math.random().toString(36).substr(2, 9);

const isByeId = (id?: string) => String(id || '').toUpperCase() === 'BYE';
const isTbdId = (id?: string) => {
    const up = String(id || '').trim().toUpperCase();
    return up === 'TBD' || up.startsWith('TBD-');
};


interface GenerateOptions {
    mode: 'elimination' | 'groups_elimination' | 'round_robin';
    numGroups?: number;
    advancingPerGroup?: number;
    tournamentName?: string;
    startDate?: string;
    /** Optional: winner/loss only tournament, without scorer/referee stat features. */
    resultsOnly?: boolean;
    /** Optional: enable a final round-robin stage that can be activated at runtime. */
    finalRoundRobin?: FinalRoundRobinConfig;
}

const normalizeStartDate = (raw?: string) => {
    const value = String(raw || '').trim();
    if (!value) return new Date().toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value}T00:00:00.000Z`;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
};

const shuffle = <T>(array: T[]): T[] => {
    let currentIndex = array.length,  randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
    return array;
};

const nextPowerOf2 = (n: number) => {
    if (n <= 0) return 0;
    return Math.pow(2, Math.ceil(Math.log2(n)));
};

const getRoundName = (size: number) => {
    if (size === 1) return 'Finale';
    if (size === 2) return 'Semifinali';
    if (size === 4) return 'Quarti';
    if (size === 8) return 'Ottavi';
    return `Round of ${size * 2}`;
};

const getGroupLetter = (groupName?: string) => {
    if (!groupName) return '';
    const m = groupName.match(/([A-Z])$/);
    return m ? m[1] : groupName.slice(-1);
};

const getGroupMatches = (group: Group, allMatches: Match[]) => {
    const gName = group.name;
    return (allMatches || []).filter(m => m.phase === 'groups' && m.groupName === gName);
};

const isGroupComplete = (group: Group, allMatches: Match[]) => {
    const ms = getGroupMatches(group, allMatches);
    if (!ms.length) return false;
    return ms.every(m => m.status === 'finished');
};

const computeGroupRanking = (group: Group, allMatches: Match[]) => {
    const teams = group.teams || [];
    const ms = getGroupMatches(group, allMatches);

    const { rows, rankedTeams } = computeGroupStandings({ teams, matches: ms });

    // Keep a lightweight stats object for compatibility with previous structure.
    const stats: Record<string, { wins: number; scored: number; conceded: number; diff: number; points: number; blowFor: number; blowAgainst: number; blowDiff: number }> = {};
    for (const t of teams) {
        const r = rows[t.id];
        stats[t.id] = {
            wins: r?.wins ?? 0,
            scored: r?.cupsFor ?? 0,
            conceded: r?.cupsAgainst ?? 0,
            diff: r?.cupsDiff ?? 0,
            points: r?.points ?? 0,
            blowFor: r?.blowFor ?? 0,
            blowAgainst: r?.blowAgainst ?? 0,
            blowDiff: r?.blowDiff ?? 0,
        };
    }

    return { ranked: rankedTeams, stats };
};


const buildGroupPlaceholders = (groups: Group[], advancing: number) => {
    const out: Record<string, string[]> = {};
    groups.forEach(g => {
        const letter = getGroupLetter(g.name);
        out[g.id] = [];
        for (let r = 1; r <= advancing; r++) out[g.id].push(`TBD-${letter}-${r}`);
    });
    return out;
};

const distributeReferees = (participants: string[], teams: Team[]) => {
    // Ensure referees are spread and avoid referee-vs-referee in the first round where possible.
    const isRef = (id: string) => !!teams.find(t => t.id === id)?.isReferee;
    const refs = participants.filter(id => id !== 'BYE' && isRef(id));
    const non = participants.filter(id => !refs.includes(id));
    const out = [...participants];

    // First pass: try to place refs on even indices as much as possible
    let rIdx = 0;
    for (let i = 0; i < out.length && rIdx < refs.length; i += 2) {
        const cur = out[i];
        if (cur === 'BYE') continue;
        if (isRef(cur)) continue;
        // replace with next ref if that ref currently elsewhere
        const refId = refs[rIdx++];
        const j = out.indexOf(refId);
        if (j >= 0) {
            out[j] = cur;
            out[i] = refId;
        }
    }

    // Second pass: fix any referee-vs-referee pairing
    for (let i = 0; i < out.length; i += 2) {
        const a = out[i];
        const b = out[i + 1];
        if (!a || !b) continue;
        if (a === 'BYE' || b === 'BYE') continue;
        if (isRef(a) && isRef(b)) {
            // swap b with the next available non-ref in another pair
            let swapIdx = -1;
            for (let j = i + 2; j < out.length; j++) {
                const cand = out[j];
                if (cand === 'BYE') continue;
                if (!isRef(cand)) { swapIdx = j; break; }
            }
            if (swapIdx >= 0) {
                const tmp = out[i + 1];
                out[i + 1] = out[swapIdx];
                out[swapIdx] = tmp;
            }
        }
    }

    return out;
};

const buildSeededParticipantsFromGroups = (groups: Group[], advancing: number) => {
    // Seed placeholders deterministically: (A1 vs B2), (A2 vs B1), then (C1 vs D2)...
    const orderedGroups = [...groups].sort((a, b) => getGroupLetter(a.name).localeCompare(getGroupLetter(b.name)));
    const out: string[] = [];
    for (let g = 0; g < orderedGroups.length; g += 2) {
        const g1 = orderedGroups[g];
        const g2 = orderedGroups[g + 1];
        if (!g1) continue;
        const l1 = getGroupLetter(g1.name);
        const l2 = g2 ? getGroupLetter(g2.name) : '';
        for (let r = 1; r <= advancing; r++) {
            const a = `TBD-${l1}-${r}`;
            const b = g2 ? `TBD-${l2}-${(advancing - r + 1)}` : 'BYE';
            out.push(a);
            out.push(b);
        }
    }
    return out;
};

// Build Round 1 pairs such that:
// - if participants count is not a power of 2, some participants get a BYE
// - BYE matches are placed at the TOP of the bracket
// - preliminary matches (real vs real) are placed at the BOTTOM and filled "from below" (reverse order)
//
// Note: we intentionally remove any BYE placeholders from the seeded list before applying this logic,
// so that BYEs are assigned deterministically to the highest seeds.
const buildRound1PairsWithPrelimsBottom = (seededParticipants: string[], targetSize: number, currentRoundSize: number): Array<[string, string]> => {
    const base = (seededParticipants || []).filter(id => !isByeId(id));
    const byeCount = Math.max(0, targetSize - base.length);
    const pairs: Array<[string, string]> = new Array(currentRoundSize);

    if (byeCount <= 0) {
        for (let i = 0; i < currentRoundSize; i++) {
            pairs[i] = [base[i * 2] || 'BYE', base[i * 2 + 1] || 'BYE'];
        }
        return pairs;
    }

    const byeTeams = base.slice(0, byeCount);
    const prelimTeams = base.slice(byeCount);

    // Top of the bracket: BYE matches.
    for (let i = 0; i < byeTeams.length && i < currentRoundSize; i++) {
        pairs[i] = [byeTeams[i], 'BYE'];
    }

    // Bottom of the bracket: preliminary matches, filled from bottom in reverse order.
    const stack = [...prelimTeams];
    for (let mIdx = currentRoundSize - 1; mIdx >= byeTeams.length; mIdx--) {
        const b = stack.pop() || 'BYE';
        const a = stack.pop() || 'BYE';
        pairs[mIdx] = [a, b];
    }

    return pairs;
};


export const generateTournamentStructure = (teams: Team[], config: GenerateOptions): { tournament: TournamentData, matches: Match[] } => {
    const activeTeams = (teams || []).filter(team => !team.hidden && !team.isBye);
    const startDate = normalizeStartDate(config.startDate);
    const allMatches: Match[] = [];
    const groups: Group[] = [];
    const rounds: Match[][] = [];
    let matchOrderIndex = 0;

    // Handle Round Robin (single group, no bracket)
    if (config.mode === 'round_robin') {
        const group: Group = {
            id: uuid(),
            name: 'Girone Unico',
            teams: [...activeTeams],
            stage: 'groups',
        };
        groups.push(group);

        const groupTeams = group.teams || [];
        for (let i = 0; i < groupTeams.length; i++) {
            for (let j = i + 1; j < groupTeams.length; j++) {
                const m: Match = {
                    id: uuid(),
                    teamAId: groupTeams[i].id,
                    teamBId: groupTeams[j].id,
                    scoreA: 0,
                    scoreB: 0,
                    played: false,
                    status: 'scheduled',
                    phase: 'groups',
                    groupName: group.name,
                    code: `U${allMatches.length + 1}`,
                    orderIndex: matchOrderIndex++
                };
                allMatches.push(m);
            }
        }

        const tournament: TournamentData = {
            id: uuid(),
            name: config.tournamentName || `Torneo ${new Date().toLocaleDateString()}`,
            startDate,
            type: 'round_robin',
            teams: activeTeams,
            rounds: [],
            groups: groups,
            matches: allMatches,
            config: { advancingPerGroup: 0, resultsOnly: !!config.resultsOnly, finalRoundRobin: config.finalRoundRobin },
        };

        return { tournament, matches: allMatches };
    }

    // Handle Groups
    if (config.mode === 'groups_elimination') {
        const numGroups = Math.max(1, Math.min((config.numGroups || 4), Math.max(1, activeTeams.length)));
        const shuffled = shuffle([...activeTeams]);
        
        // Initialize groups
        for (let i = 0; i < numGroups; i++) {
            groups.push({
                id: uuid(),
                name: `Girone ${String.fromCharCode(65 + i)}`,
                teams: []
            });
        }

        // Distribute teams
        shuffled.forEach((team, idx) => {
            groups[idx % numGroups].teams.push(team);
        });

        // Generate group matches (Round Robin)
        groups.forEach(group => {
            const groupTeams = group.teams;
            for (let i = 0; i < groupTeams.length; i++) {
                for (let j = i + 1; j < groupTeams.length; j++) {
                    const m: Match = {
                        id: uuid(),
                        teamAId: groupTeams[i].id,
                        teamBId: groupTeams[j].id,
                        scoreA: 0,
                        scoreB: 0,
                        played: false,
                        status: 'scheduled',
                        phase: 'groups',
                        groupName: group.name,
                        code: `${group.name.slice(-1)}${allMatches.length + 1}`,
                        orderIndex: matchOrderIndex++
                    };
                    allMatches.push(m);
                }
            }
        });
    }


    // Compute effective advancing per group (supports uneven groups and small groups).
    const effectiveAdvancingMap: Record<string, number> = {};
    if (config.mode === 'groups_elimination') {
        const adv = Math.max(1, (config.advancingPerGroup || 2));
        groups.forEach(g => {
            const size = (g.teams || []).length;
            effectiveAdvancingMap[g.id] = Math.min(adv, Math.max(0, size));
        });
    }

    // Handle Bracket
    let bracketTeamsCount = 0;
    if (config.mode === 'elimination') {
        bracketTeamsCount = activeTeams.length;
    } else {
        bracketTeamsCount = groups.reduce((sum, g) => sum + (effectiveAdvancingMap[g.id] ?? (config.advancingPerGroup || 2)), 0);
    }

    let targetSize = nextPowerOf2(bracketTeamsCount);
    if (targetSize === 0) {
        // No bracket can be generated with 0 participants
        targetSize = 0;
    }
    let currentRoundSize = targetSize ? (targetSize / 2) : 0;
    let roundNum = 1;

    // Round 1
    const round1Matches: Match[] = [];
    if (currentRoundSize === 0) {
        const tournament: TournamentData = {
            id: uuid(),
            name: config.tournamentName || `Torneo ${new Date().toLocaleDateString()}`,
            startDate,
            type: config.mode,
            teams: activeTeams,
            rounds: rounds,
            groups: groups,
            matches: allMatches,
            config: { advancingPerGroup: config.advancingPerGroup || 2, resultsOnly: !!config.resultsOnly, finalRoundRobin: config.finalRoundRobin }
        };
        return { tournament, matches: allMatches };
    }

    
    if (config.mode === 'elimination') {
        // Elimination seeding with prelim branches:
        // - if teams count is not a power of 2, some teams play a preliminary match (one extra match)
        // - prelim branches are placed at the bottom of the bracket, filled in reverse order
        //   (so extra matches "grow" upwards from the bottom).
        //
        // IMPORTANT:
        // - never create BYE vs BYE pairs (wastes BYEs and changes the number of prelim matches)
        // - keep the rest randomized (we shuffle teams once, then place BYEs deterministically).
        const shuffledTeamIds = shuffle([...activeTeams]).map(t => t.id);
        const byeCount = Math.max(0, targetSize - shuffledTeamIds.length);

        const pairs: Array<[string, string]> = new Array(currentRoundSize);

        if (byeCount <= 0) {
            // Perfect bracket: just pair sequentially (still randomized by the shuffle above).
            for (let i = 0; i < currentRoundSize; i++) {
                pairs[i] = [shuffledTeamIds[i * 2], shuffledTeamIds[i * 2 + 1]];
            }
        } else {
            const byeTeams = shuffledTeamIds.slice(0, byeCount);
            const prelimTeams = shuffledTeamIds.slice(byeCount);

            // Top of the bracket: BYE matches (auto-advance), one BYE per match.
            for (let i = 0; i < byeCount; i++) {
                pairs[i] = [byeTeams[i], 'BYE'];
            }

            // Bottom of the bracket: preliminary matches, filled from bottom in reverse order.
            // This guarantees prelims are always at the bottom (and expand upwards as needed).
            const stack = [...prelimTeams];
            for (let mIdx = currentRoundSize - 1; mIdx >= byeCount; mIdx--) {
                const b = stack.pop() || 'BYE';
                const a = stack.pop() || 'BYE';
                pairs[mIdx] = [a, b];
            }
        }

        const finalParticipants = pairs.flat();

        for (let i = 0; i < currentRoundSize; i++) {
            const pA = finalParticipants[i*2];
            const pB = finalParticipants[i*2+1];
            
            const match: Match = {
                id: uuid(),
                teamAId: pA,
                teamBId: pB,
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: 'scheduled',
                phase: 'bracket',
                round: 1,
                roundName: getRoundName(currentRoundSize),
                code: `B1${i + 1}`,
                orderIndex: matchOrderIndex++
            };

            // Handle BYE automatically.
            // IMPORTANT: never auto-advance a TBD placeholder.
            if (isByeId(pA) && !isByeId(pB) && !isTbdId(pB)) {
                match.teamAId = 'BYE';
                match.teamBId = pB;
                match.status = 'finished';
                match.played = true;
                match.scoreA = 0;
                match.scoreB = 0;
                match.hidden = true;
                match.isBye = true;
            } else if (isByeId(pB) && !isByeId(pA) && !isTbdId(pA)) {
                match.teamAId = pA;
                match.teamBId = 'BYE';
                match.status = 'finished';
                match.played = true;
                match.scoreA = 0;
                match.hidden = true;
                match.scoreB = 0;
                match.hidden = true;
                match.isBye = true;
            } else if (isByeId(pA) && isByeId(pB)) {
                match.teamAId = 'BYE';
                match.teamBId = 'BYE';
                match.status = 'finished';
                match.played = true;
                match.scoreA = 0;
                match.scoreB = 0;
                match.hidden = true;
                match.isBye = true;
            } else if ((isByeId(pA) && isTbdId(pB)) || (isByeId(pB) && isTbdId(pA))) {
                // BYE vs TBD: keep it hidden, but do NOT finish it (no auto-advance).
                match.hidden = true;
                match.isBye = true;
            }

            round1Matches.push(match);
            allMatches.push(match);
        }
        rounds.push(round1Matches);
    } else {
        // Groups mode: pre-fill bracket Round 1 using deterministic placeholders (TBD-<Group>-<Rank>).
        const advancing = config.advancingPerGroup || 2;
        const seeded = buildSeededParticipantsFromGroups(groups, advancing);
        const pairs = buildRound1PairsWithPrelimsBottom(seeded, targetSize, currentRoundSize);

        for (let i = 0; i < currentRoundSize; i++) {
            const [pA, pB] = pairs[i];

            const m: Match = {
                id: uuid(),
                teamAId: pA,
                teamBId: pB,
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: 'scheduled',
                phase: 'bracket',
                round: 1,
                roundName: getRoundName(currentRoundSize),
                code: `B1${i + 1}`,
                orderIndex: matchOrderIndex++
            };

            // Handle BYE automatically.
            // IMPORTANT: never auto-advance a TBD placeholder.
            if (isByeId(pA) && !isByeId(pB) && !isTbdId(pB)) {
                m.teamAId = 'BYE';
                m.teamBId = pB;
                m.status = 'finished';
                m.played = true;
                m.scoreA = 0;
                m.scoreB = 0;
                m.hidden = true;
                m.isBye = true;
            } else if (isByeId(pB) && !isByeId(pA) && !isTbdId(pA)) {
                m.teamAId = pA;
                m.teamBId = 'BYE';
                m.status = 'finished';
                m.played = true;
                m.scoreA = 0;
                m.hidden = true;
                m.scoreB = 0;
                m.isBye = true;
            } else if (isByeId(pA) && isByeId(pB)) {
                m.teamAId = 'BYE';
                m.teamBId = 'BYE';
                m.status = 'finished';
                m.played = true;
                m.scoreA = 0;
                m.scoreB = 0;
                m.hidden = true;
                m.isBye = true;
            } else if ((isByeId(pA) && isTbdId(pB)) || (isByeId(pB) && isTbdId(pA))) {
                // BYE vs TBD: keep it hidden, but do NOT finish it (no auto-advance).
                m.hidden = true;
                m.isBye = true;
            }

            round1Matches.push(m);
            allMatches.push(m);
        }
        rounds.push(round1Matches);
    }

    // Subsequent Rounds (Empty/Skeleton)
    currentRoundSize /= 2;
    roundNum++;

    while (currentRoundSize >= 1) {
        const currentRoundMatches: Match[] = [];
        for (let i = 0; i < currentRoundSize; i++) {
            const m: Match = {
                id: uuid(),
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: 'scheduled',
                phase: 'bracket',
                round: roundNum,
                roundName: getRoundName(currentRoundSize),
                code: `B${roundNum}${i + 1}`,
                orderIndex: matchOrderIndex++
            };
            currentRoundMatches.push(m);
            allMatches.push(m);
        }
        rounds.push(currentRoundMatches);
        currentRoundSize /= 2;
        roundNum++;
    }

    // Auto-advance BYEs by pre-filling Round 2 slots.
    if (rounds.length > 1) {
        const r1 = rounds[0] || [];
        const r2 = rounds[1] || [];
        r1.forEach((m, i) => {
            if (m.status !== 'finished') return;
            // Only relevant if it was a BYE win
            if (m.teamAId !== 'BYE' && m.teamBId !== 'BYE') return;

            const winner = isByeId(m.teamAId) ? m.teamBId : (isByeId(m.teamBId) ? m.teamAId : undefined);
            if (!winner || isByeId(winner) || isTbdId(winner)) return;

            const target = r2[Math.floor(i / 2)];
            if (!target) return;

            if (i % 2 === 0) {
                if (!target.teamAId) target.teamAId = winner;
            } else {
                if (!target.teamBId) target.teamBId = winner;
            }
        });
    }

    const tournament: TournamentData = {
        id: uuid(),
        name: config.tournamentName || `Torneo ${new Date().toLocaleDateString()}`,
        startDate,
        type: config.mode,
        teams: activeTeams,
        rounds: rounds,
        groups: groups,
        matches: allMatches,
        config: {
            advancingPerGroup: config.advancingPerGroup || 2,
            resultsOnly: !!config.resultsOnly,
            finalRoundRobin: config.finalRoundRobin,
        }
    };

    return { tournament, matches: allMatches };
};

export const syncBracketFromGroups = (tournament: TournamentData, matches: Match[]): Match[] => {
    if (!tournament || tournament.type !== 'groups_elimination') return matches;
    const advancing = tournament.config?.advancingPerGroup || 2;
    const groups = (tournament.groups || []).filter(g => !isFinalGroup(g));
    const teams = tournament.teams || [];

    // Work on a cloned array (we may append tie-break matches).
    let out = matches.map(m => ({ ...m }));

    const round1From = (arr: Match[]) => arr
        .filter(m => m.phase === 'bracket' && (m.round || 1) === 1)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    const nextOrderIndex = () => {
        const max = out.reduce((acc, m) => Math.max(acc, m.orderIndex ?? -1), -1);
        return max + 1;
    };

    const ensureGroupTieBreak1v1 = () => {
        if (!groups.length) return false;
        let inserted = false;

        for (const g of groups) {
            // Evaluate only groups that are currently complete.
            if (!isGroupComplete(g, out)) continue;

            const gMatches = getGroupMatches(g, out);
            const { rows, rankedTeams } = computeGroupStandings({ teams: g.teams || [], matches: gMatches });

            const advEff = Math.min(Math.max(0, advancing), rankedTeams.length);
            if (advEff <= 0) continue;
            if (advEff >= rankedTeams.length) continue; // no cutline

            const cutoff = rankedTeams[advEff - 1];
            const next = rankedTeams[advEff];
            if (!cutoff || !next) continue;

            const keyOf = (teamId: string) => {
                const r = rows[teamId];
                const p = r?.points ?? 0;
                const dC = r?.cupsDiff ?? 0;
                const dS = r?.blowDiff ?? 0;
                return `${p}|${dC}|${dS}`;
            };

            const cutKey = keyOf(cutoff.id);
            if (cutKey !== keyOf(next.id)) continue;

            const tiedTeams = rankedTeams.filter(t => keyOf(t.id) === cutKey);
            if (tiedTeams.length < 2) continue;

            const letter = getGroupLetter(g.name);
            const tbPrefix = `${letter}TB`;

            const sameSet = (a: string[], b: string[]) => {
                if (a.length !== b.length) return false;
                const sa = new Set(a);
                for (const x of b) if (!sa.has(x)) return false;
                return true;
            };

            // Avoid duplicates: if a tie-break already exists for this group+participants, skip.
            const existing = gMatches.find(m => {
                if (m.phase !== 'groups' || m.groupName !== g.name) return false;
                if (!m.isTieBreak) return false;
                const parts = (m.teamIds && m.teamIds.length)
                    ? m.teamIds
                    : ((m.teamAId && m.teamBId) ? [m.teamAId, m.teamBId] : []);
                const wanted = tiedTeams.map(t => t.id);
                return sameSet(parts, wanted);
            });
            if (existing) continue;

            const tbNums = gMatches
                .filter(m => m.isTieBreak && (m.code || '').startsWith(tbPrefix))
                .map(m => {
                    const mm = String(m.code || '').match(/TB(\d+)$/);
                    return mm ? parseInt(mm[1], 10) : 0;
                })
                .filter(n => Number.isFinite(n));
            const nextTb = (tbNums.length ? Math.max(...tbNums) : 0) + 1;

            const participants = tiedTeams.map(t => t.id);
            const m: Match = participants.length === 2 ? {
                id: uuid(),
                teamAId: participants[0],
                teamBId: participants[1],
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: 'scheduled',
                phase: 'groups',
                groupName: g.name,
                code: `${letter}TB${nextTb}`,
                orderIndex: nextOrderIndex(),
                isTieBreak: true,
                targetScore: 1,
            } : {
                id: uuid(),
                teamIds: participants,
                scoresByTeam: participants.reduce((acc, id) => ({ ...acc, [id]: 0 }), {} as Record<string, number>),
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: 'scheduled',
                phase: 'groups',
                groupName: g.name,
                code: `${letter}TB${nextTb}`,
                orderIndex: nextOrderIndex(),
                isTieBreak: true,
                targetScore: 1,
            };

            out = [...out, m];
            inserted = true;
        }

        return inserted;
    };

    // Add tie-breaks (if needed) before syncing the bracket.
    ensureGroupTieBreak1v1();

    const round1 = round1From(out);
    if (!round1.length) return out;

    const targetSize = round1.length * 2;
    const allGroupsComplete = groups.length > 0 && groups.every(g => isGroupComplete(g, out));

    // Build desired Round1 pairs depending on completion state.
    const desiredPairs: Array<[string, string]> = (() => {
        if (allGroupsComplete) {
            const orderedGroups = [...groups].sort((a, b) => getGroupLetter(a.name).localeCompare(getGroupLetter(b.name)));
            const participants: string[] = [];

            for (let g = 0; g < orderedGroups.length; g += 2) {
                const g1 = orderedGroups[g];
                const g2 = orderedGroups[g + 1];
                if (!g1) continue;

                const r1 = computeGroupRanking(g1, out).ranked;
                const r2 = g2 ? computeGroupRanking(g2, out).ranked : [];

                for (let r = 1; r <= advancing; r++) {
                    const a = r1[r - 1]?.id;
                    const b = g2 ? r2[(advancing - r)]?.id : 'BYE';
                    participants.push(a || 'BYE');
                    participants.push(b || 'BYE');
                }
            }

            // NOTE: we remove BYE placeholders before applying the "prelims at bottom" logic.
            // This ensures BYEs are assigned to the highest seeds deterministically.
            const base = participants.filter(id => !!id && !isByeId(id));
            const seeded = distributeReferees(base, teams);
            return buildRound1PairsWithPrelimsBottom(seeded, targetSize, round1.length);
        }

        // Not all groups complete: reset Round1 to the deterministic placeholders layout.
        const seeded = buildSeededParticipantsFromGroups(groups, advancing);
        return buildRound1PairsWithPrelimsBottom(seeded, targetSize, round1.length);
    })();

    const needsRound1Reset = desiredPairs.some((pair, i) => {
        const m = round1[i];
        return (m?.teamAId !== pair[0]) || (m?.teamBId !== pair[1]);
    });

    // If Round1 participants are not in the desired state (e.g. we inserted a tie-break and need to go back to placeholders),
    // reset the whole bracket skeleton and apply the desired Round1 pairs.
    if (needsRound1Reset) {
        const round1Ids = new Set(round1.map(m => m.id));
        const reset = out.map(m => {
            if (m.phase !== 'bracket') return m;
            const base: Match = { ...m };
            base.scoreA = 0;
            base.scoreB = 0;
            base.stats = undefined;
            base.played = false;
            base.status = 'scheduled';
            if ((base.round || 1) > 1) {
                delete (base as any).teamAId;
                delete (base as any).teamBId;
            }
            return base;
        });

        let idx = 0;
        out = reset.map(m => {
            if (m.phase === 'bracket' && (m.round || 1) === 1 && round1Ids.has(m.id)) {
                const pair = desiredPairs[idx++];
                return { ...m, teamAId: pair[0], teamBId: pair[1] };
            }
            return m;
        });
    }

    const sanitizeBracketPlaceholders = (arr: Match[]) => {
        return arr.map((m) => {
            if (m.phase !== 'bracket') return m;
            const round = (m.round || 1);
            const base: Match = { ...m };

            // Never allow TBD placeholders beyond round 1.
            if (round > 1) {
                if (isTbdId(base.teamAId)) delete (base as any).teamAId;
                if (isTbdId(base.teamBId)) delete (base as any).teamBId;
            }

            // BYE vs TBD must never be auto-finished.
            const a = base.teamAId;
            const b = base.teamBId;
            const byeVsTbd = (isByeId(a) && isTbdId(b)) || (isByeId(b) && isTbdId(a));
            if (byeVsTbd) {
                base.hidden = true;
                base.isBye = true;
                if (base.status === 'finished' || base.played) {
                    base.status = 'scheduled';
                    base.played = false;
                    base.scoreA = 0;
                    base.scoreB = 0;
                    base.stats = undefined;
                }
            }

            // If something ended up "finished" with missing participants, reset it.
            if (base.status === 'finished') {
                const hasA = !!base.teamAId;
                const hasB = !!base.teamBId;
                if (!hasA || !hasB || isTbdId(base.teamAId) || isTbdId(base.teamBId)) {
                    base.status = 'scheduled';
                    base.played = false;
                    base.scoreA = 0;
                    base.scoreB = 0;
                    base.stats = undefined;
                }
            }

            return base;
        });
    };

    // If all groups are complete, we are done after applying Round1 pairs.
    if (allGroupsComplete) return sanitizeBracketPlaceholders(out);

    // Not all groups complete: resolve placeholders only for completed groups.
    const placeholderToTeamId: Record<string, string> = {};
    groups.forEach(g => {
        if (!isGroupComplete(g, out)) return;
        const letter = getGroupLetter(g.name);
        const { ranked } = computeGroupRanking(g, out);
        for (let r = 1; r <= advancing; r++) {
            const ph = `TBD-${letter}-${r}`;
            const team = ranked[r - 1];
            if (team) placeholderToTeamId[ph] = team.id;
        }
    });

    const resolveId = (id?: string) => {
        if (!id) return id;
        return placeholderToTeamId[id] || id;
    };

    const baseRound1 = round1From(out);
    const nextRound1 = baseRound1.map(m => ({
        ...m,
        teamAId: resolveId(m.teamAId),
        teamBId: resolveId(m.teamBId),
    }));

    const changed = nextRound1.some((m, i) => (m.teamAId !== baseRound1[i].teamAId) || (m.teamBId !== baseRound1[i].teamBId));
    if (!changed) return sanitizeBracketPlaceholders(out);

    return sanitizeBracketPlaceholders(out.map(m => {
        if (m.phase === 'bracket' && (m.round || 1) === 1) {
            const i = nextRound1.findIndex(x => x.id === m.id);
            if (i >= 0) return { ...m, teamAId: nextRound1[i].teamAId, teamBId: nextRound1[i].teamBId };
        }
        return m;
    }));
};



export type FinalRoundRobinActivationStatus = {
    enabled: boolean;
    activated: boolean;
    canActivate: boolean;
    reason?: string;
    topTeams?: 4 | 8;
    participants?: Team[];
};

/**
 * Computes whether a final round-robin stage can be activated, based on the bracket state.
 * - Works for elimination and groups_elimination tournaments (i.e. with a bracket).
 * - Excludes BYE and TBD placeholders.
 * - Does not mutate inputs.
 */
export const getFinalRoundRobinActivationStatus = (tournament: TournamentData, matches: Match[]): FinalRoundRobinActivationStatus => {
    const cfg = tournament?.config?.finalRoundRobin;
    const enabled = !!cfg?.enabled;
    const topTeams = cfg?.topTeams;

    const hasFinal = (tournament?.groups || []).some(g => isFinalGroup(g));
    const activated = !!cfg?.activated || hasFinal;

    if (!enabled) {
        return { enabled: false, activated, canActivate: false, reason: 'disabled' };
    }
    if (activated) {
        return { enabled: true, activated: true, canActivate: false, reason: 'already_activated', topTeams };
    }
    if (!topTeams || (topTeams !== 4 && topTeams !== 8)) {
        return { enabled: true, activated: false, canActivate: false, reason: 'missing_topTeams' };
    }
    if (!tournament || (tournament.type !== 'elimination' && tournament.type !== 'groups_elimination')) {
        return { enabled: true, activated: false, canActivate: false, reason: 'unsupported_tournament_type', topTeams };
    }

    const bracket = (matches || []).filter(m => m.phase === 'bracket');
    if (!bracket.length) {
        return { enabled: true, activated: false, canActivate: false, reason: 'no_bracket_matches', topTeams };
    }

    // Group by round number.
    const byRound: Record<number, Match[]> = {};
    for (const m of bracket) {
        const r = (m.round || 1);
        if (!byRound[r]) byRound[r] = [];
        byRound[r].push(m);
    }

    const desiredMatchCount = topTeams / 2;
    const roundCandidates = Object.keys(byRound).map(n => parseInt(n, 10)).sort((a, b) => a - b);
    const roundNum = roundCandidates.find(r => (byRound[r]?.length || 0) === desiredMatchCount);

    if (!roundNum) {
        return { enabled: true, activated: false, canActivate: false, reason: 'bracket_too_small_or_unexpected_shape', topTeams };
    }

    const roundMatches = byRound[roundNum] || [];
    const ids = new Set<string>();
    for (const m of roundMatches) {
        const a = m.teamAId;
        const b = m.teamBId;
        if (!a || !b) {
            return { enabled: true, activated: false, canActivate: false, reason: 'participants_not_determined', topTeams };
        }
        if (isByeId(a) || isByeId(b)) {
            return { enabled: true, activated: false, canActivate: false, reason: 'bye_in_participants', topTeams };
        }
        if (isTbdId(a) || isTbdId(b)) {
            return { enabled: true, activated: false, canActivate: false, reason: 'participants_not_determined', topTeams };
        }
        ids.add(a);
        ids.add(b);
    }

    const participantIds = [...ids];
    if (participantIds.length !== topTeams) {
        return { enabled: true, activated: false, canActivate: false, reason: 'participants_count_mismatch', topTeams };
    }

    const teamById = new Map((tournament.teams || []).map(t => [t.id, t]));
    const participants: Team[] = participantIds.map(id => teamById.get(id)).filter(Boolean) as Team[];
    if (participants.length !== topTeams) {
        return { enabled: true, activated: false, canActivate: false, reason: 'participants_not_found_in_roster', topTeams };
    }

    return { enabled: true, activated: false, canActivate: true, topTeams, participants };
};

/**
 * Activates the final round-robin stage by creating a dedicated final group and its matches.
 * Returns updated tournament + matches. If activation is not possible, returns inputs unchanged.
 */
export const activateFinalRoundRobinStage = (tournament: TournamentData, matches: Match[]): { tournament: TournamentData, matches: Match[] } => {
    const status = getFinalRoundRobinActivationStatus(tournament, matches);
    if (!status.canActivate || !status.participants || !status.topTeams) return { tournament, matches };

    const finalName = 'Girone Finale';
    const finalGroup: Group = {
        id: uuid(),
        name: finalName,
        teams: status.participants,
        stage: 'final',
    };

    const existingGroups = tournament.groups || [];
    const stageGroups = existingGroups.filter(g => !isFinalGroup(g));
    const nextGroups = [...stageGroups, finalGroup];

    const maxOrder = (matches || []).reduce((acc, m) => Math.max(acc, m.orderIndex ?? -1), -1);
    let orderIndex = maxOrder + 1;

    // Generate all pairings for the final group (round robin).
    const ids = status.participants.map(t => t.id);
    const rrPairs: [string, string][] = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            rrPairs.push([ids[i], ids[j]]);
        }
    }

    const finalMatches: Match[] = rrPairs.map((pair, i) => ({
        id: uuid(),
        teamAId: pair[0],
        teamBId: pair[1],
        scoreA: 0,
        scoreB: 0,
        played: false,
        status: 'scheduled',
        phase: 'groups',
        groupName: finalName,
        code: `F${i + 1}`,
        orderIndex: orderIndex++,
    }));

    const nextTournament: TournamentData = {
        ...tournament,
        groups: nextGroups,
        config: {
            ...tournament.config,
            finalRoundRobin: {
                ...(tournament.config?.finalRoundRobin || { enabled: true, topTeams: status.topTeams }),
                enabled: true,
                topTeams: status.topTeams,
                activated: true,
            },
        },
    };

    return { tournament: nextTournament, matches: [...(matches || []), ...finalMatches] };
};

const getRowKey = (rows: Record<string, any>, teamId: string): { points: number; cupsDiff: number; blowDiff: number; cupsFor: number } => {
    const r = rows[teamId] || {};
    return {
        points: r.points ?? 0,
        cupsDiff: r.cupsDiff ?? 0,
        blowDiff: r.blowDiff ?? 0,
        cupsFor: r.cupsFor ?? 0,
    };
};

const isSameKey = (a: ReturnType<typeof getRowKey>, b: ReturnType<typeof getRowKey>) => {
    return a.points === b.points && a.cupsDiff === b.cupsDiff && a.blowDiff === b.blowDiff && a.cupsFor === b.cupsFor;
};

/**
 * If the final round-robin is activated and all its non-tie-break matches are finished,
 * but the top of the table is still tied after Pt -> ΔC -> ΔS -> C+, create an extra
 * final tie-break match (FTB1/FTB2/...).
 *
 * - 2 teams tied: 1v1 match
 * - 3+ teams tied: multi-team match (teamIds)
 */
export const ensureFinalTieBreakIfNeeded = (tournament: TournamentData, matches: Match[]): Match[] => {
    const cfg = tournament?.config?.finalRoundRobin;
    if (!cfg?.enabled || !cfg.activated) return matches;

    const groups = tournament.groups || [];
    const finalGroup = groups.find(g => isFinalGroup(g));
    if (!finalGroup) return matches;

    const finalName = finalGroup.name;
    const allFinalMatches = (matches || []).filter(m => m.phase === 'groups' && (m.groupName || '') === finalName && !m.hidden && !m.isBye);
    if (!allFinalMatches.length) return matches;

    const baseMatches = allFinalMatches.filter(m => !m.isTieBreak);
    if (!baseMatches.length) return matches;

    // Only evaluate once the round-robin itself is complete.
    if (!baseMatches.every(m => m.status === 'finished')) return matches;

    // If there is already a pending final tie-break, do nothing.
    const pendingTbs = allFinalMatches.filter(m => m.isTieBreak && m.status !== 'finished');
    if (pendingTbs.length) return matches;

    const visibleTeams = (finalGroup.teams || []).filter(t => !t.hidden && !t.isBye && !isByeId(t.id));
    if (visibleTeams.length < 2) return matches;

    // Use only finished matches (including already-finished FTBs) to compute the current table.
    const finished = allFinalMatches.filter(m => m.status === 'finished');
    const { rows, rankedTeams } = computeGroupStandings({ teams: visibleTeams, matches: finished });
    if (!rankedTeams.length) return matches;

    const top = rankedTeams[0];
    if (!top) return matches;

    // If the leader is unique on the full key, nothing to do.
    if (rankedTeams.length > 1) {
        const second = rankedTeams[1];
        if (second) {
            const kTop = getRowKey(rows, top.id);
            const kSecond = getRowKey(rows, second.id);
            if (!isSameKey(kTop, kSecond)) return matches;
        } else {
            return matches;
        }
    } else {
        return matches;
    }

    // Find all teams tied with the top on the full key.
    const topKey = getRowKey(rows, top.id);
    const tied = rankedTeams.filter(tt => isSameKey(getRowKey(rows, tt.id), topKey));
    const tiedIds = tied.map(t => t.id).filter(Boolean);
    if (tiedIds.length < 2) return matches;

    // Determine next FTB index.
    let maxN = 0;
    for (const m of allFinalMatches) {
        const c = String(m.code || '').trim().toUpperCase();
        const mm = c.match(/^FTB(\d+)$/);
        if (mm) maxN = Math.max(maxN, parseInt(mm[1], 10) || 0);
    }
    const nextN = maxN + 1;

    const maxOrder = (matches || []).reduce((acc, m) => Math.max(acc, m.orderIndex ?? -1), -1);
    const orderIndex = maxOrder + 1;

    const tb: Match = {
        id: uuid(),
        scoreA: 0,
        scoreB: 0,
        played: false,
        status: 'scheduled',
        phase: 'groups',
        groupName: finalName,
        code: `FTB${nextN}`,
        orderIndex,
        isTieBreak: true,
        targetScore: 1,
    };

    if (tiedIds.length === 2) {
        tb.teamAId = tiedIds[0];
        tb.teamBId = tiedIds[1];
    } else {
        tb.teamIds = tiedIds;
        // legacy fields for UI that still expects 1v1
        tb.teamAId = tiedIds[0];
        tb.teamBId = tiedIds[1];
    }

    return [...(matches || []), tb];
};
