import { Team, Match, TournamentData, TvProjection, TV_PROJECTIONS, HallOfFameEntry, IntegrationScorerEntry } from '../types';
import { computeGroupStandings } from './groupStandings';
import { isFinalGroup } from './groupUtils';
import { deriveYoBFromBirthDate, getPlayerKey, getPlayerKeyLabel, isU25, resolvePlayerKey } from './playerIdentity';
import { buildMetricAwardEntries } from './awardRules';
import { normalizeNameLower } from './textUtils';

const STORAGE_KEY = 'beer_pong_app_state';

export interface AppState {
    /**
     * Best-effort schema version for snapshot compatibility.
     * Optional and backward-compatible: if missing, treated as 0.
     */
    __schemaVersion?: number;
    teams: Team[];
    matches: Match[];
    tournament: TournamentData | null;
    tournamentMatches: Match[];
    tournamentHistory: TournamentData[];
    logo: string;
    hallOfFame: HallOfFameEntry[];
    integrationsScorers: IntegrationScorerEntry[];
    playerAliases: Record<string, string>;
}

// Increment only when the persisted snapshot shape requires a migration.
export const APP_STATE_SCHEMA_VERSION = 1;

const initialState: AppState = {
    teams: [],
    matches: [],
    tournament: null,
    tournamentMatches: [],
    tournamentHistory: [],
    logo: '',
    hallOfFame: [],
    integrationsScorers: [],
    playerAliases: {}
};

/**
 * Best-effort runtime hardening for persisted/imported state.
 * - Preserves unknown keys (backward/forward compatible)
 * - Coerces known keys to expected shapes to avoid runtime crashes
 */
export const coerceAppState = (raw: any): AppState => {
    const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
    const asArr = <T,>(v: any, fallback: T[] = []) => (Array.isArray(v) ? (v as T[]) : fallback);
    const asObj = <T extends Record<string, any>>(v: any, fallback: T = {} as T) => (isObj(v) ? (v as T) : fallback);
    const asStr = (v: any, fallback = '') => (typeof v === 'string' ? v : fallback);

    if (!isObj(raw)) return { ...initialState };

    // Preserve unknown keys
    const merged: any = { ...initialState, ...raw };

    merged.teams = asArr<Team>(merged.teams);
    merged.matches = asArr<Match>(merged.matches);
    merged.tournamentMatches = asArr<Match>(merged.tournamentMatches);
    merged.tournamentHistory = asArr<TournamentData>(merged.tournamentHistory);
    merged.hallOfFame = asArr<HallOfFameEntry>(merged.hallOfFame);
    merged.integrationsScorers = asArr<IntegrationScorerEntry>(merged.integrationsScorers);
    merged.playerAliases = asObj<Record<string, string>>(merged.playerAliases, {});
    merged.logo = asStr(merged.logo, '');

    // tournament can be null or object
    merged.tournament = merged.tournament && isObj(merged.tournament) ? merged.tournament : null;

    // Keep live matches mirrored in both state branches to avoid stale reads across views/sync layers.
    if (merged.tournament) {
        const tournamentMatches = asArr<Match>(merged.tournamentMatches);
        const embeddedMatches = asArr<Match>((merged.tournament as any).matches);
        const nextLiveMatches = tournamentMatches.length ? tournamentMatches : embeddedMatches;
        merged.tournamentMatches = nextLiveMatches;
        merged.tournament = { ...merged.tournament, matches: nextLiveMatches };
    } else {
        merged.tournamentMatches = asArr<Match>(merged.tournamentMatches);
    }

    try {
        merged.hallOfFame = syncArchivedHistoryToHallOfFame(merged as AppState);
    } catch {
        merged.hallOfFame = asArr<HallOfFameEntry>(merged.hallOfFame);
    }

    return merged as AppState;
};

export const loadState = (): AppState => {
    try {
        const serialized = localStorage.getItem(STORAGE_KEY);
        if (!serialized) return initialState;
        const next = coerceAppState(JSON.parse(serialized)) as any;
        if (typeof next.__schemaVersion !== 'number') next.__schemaVersion = 0;
        return next as AppState;
    } catch (e) {
        console.error('Failed to load state', e);
        return initialState;
    }
};

export const saveState = (state: AppState) => {
    try {
        const next: AppState = { ...state, __schemaVersion: APP_STATE_SCHEMA_VERSION };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
        console.error('Failed to save state', e);
    }
};

export { getPlayerKey, getPlayerKeyLabel, isU25, resolvePlayerKey } from './playerIdentity';

const normalizeName = (name: string) => normalizeNameLower(name);

// NOTE: BirthDate is authoritative; YoB survives only as a compatibility derivative.
const isUnder25Rule = (identity?: number | string) => {
    const yob = typeof identity === 'string' ? deriveYoBFromBirthDate(identity) : identity;
    if (!yob) return false;
    const currentYear = new Date().getFullYear();
    return (currentYear - yob) < 26;
};

const getWinnerTeamId = (m: Match): string | undefined => {
    if (!m) return undefined;
    if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE') return m.teamBId;
    if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE') return m.teamAId;
    if (m.status !== 'finished') return undefined;
    if (m.scoreA > m.scoreB) return m.teamAId;
    if (m.scoreB > m.scoreA) return m.teamBId;
    return undefined;
};

const isByeTeam = (t: Team) => String(t?.id || '').toUpperCase() === 'BYE' || !!t?.isBye || !!t?.hidden;
// isFinalGroup shared in services/groupUtils.ts (keep behavior identical)

const getUniqueLeaderFromGroup = (tournament: TournamentData, matches: Match[], groupName: string, teams: Team[]): string | undefined => {
    const gMatchesAll = (matches || []).filter(m => m.phase === 'groups' && (m.groupName || '') === groupName && !m.hidden && !m.isBye);
    if (!gMatchesAll.length) return undefined;

    const base = gMatchesAll.filter(m => !m.isTieBreak);
    if (!base.length) return undefined;
    if (!base.every(m => m.status === 'finished')) return undefined;

    // If there is a pending tie-break, we cannot decide a winner yet.
    if (gMatchesAll.some(m => m.isTieBreak && m.status !== 'finished')) return undefined;

    // Referee-marked teams are still real teams for standings/awards.
    // Exclude only BYE/hidden placeholders.
    const visibleTeams = (teams || []).filter(t => !isByeTeam(t));
    if (visibleTeams.length < 2) return undefined;

    const finished = gMatchesAll.filter(m => m.status === 'finished');
    const { rows, rankedTeams } = computeGroupStandings({ teams: visibleTeams, matches: finished });
    if (!rankedTeams.length) return undefined;
    if (rankedTeams.length < 2) return rankedTeams[0]?.id;

    const top = rankedTeams[0];
    const second = rankedTeams[1];
    if (!top || !second) return undefined;

    const key = (id: string) => {
        const r = rows[id] || ({} as any);
        return [r.points ?? 0, r.cupsDiff ?? 0, r.blowDiff ?? 0, r.cupsFor ?? 0];
    };

    const k1 = key(top.id);
    const k2 = key(second.id);
    const tied = k1[0] === k2[0] && k1[1] === k2[1] && k1[2] === k2[2] && k1[3] === k2[3];
    if (tied) return undefined;
    return top.id;
};

export const buildTournamentAwards = (tournament: TournamentData, matches: Match[], teams: Team[]): HallOfFameEntry[] => {
    const year = new Date(tournament.startDate).getFullYear().toString();
    const entries: HallOfFameEntry[] = [];

    // Winner selection priority:
    // 1) Final round-robin (if activated)
    // 2) Round-robin tournament (single group)
    // 3) Bracket final (legacy)
    let winnerTeamId: string | undefined;

    const finalRrActivated = !!tournament.config?.finalRoundRobin?.activated;
    const finalGroup = (tournament.groups || []).find(g => isFinalGroup(g));
    if (finalRrActivated && finalGroup) {
        winnerTeamId = getUniqueLeaderFromGroup(tournament, matches, finalGroup.name, finalGroup.teams || []);
    } else if (tournament.type === 'round_robin') {
        const group = (tournament.groups || [])[0];
        const groupName = group?.name || 'Girone Unico';
        const groupTeams = group?.teams || (tournament.teams || []);
        winnerTeamId = getUniqueLeaderFromGroup(tournament, matches, groupName, groupTeams);
    }

    // Fallback: bracket final
    if (!winnerTeamId) {
        const bracket = (matches || []).filter(m => m.phase === 'bracket');
        const maxRound = bracket.reduce((acc, m) => Math.max(acc, m.round || 0), 0);
        const finalMatch = bracket
            .filter(m => (m.round || 0) === maxRound)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0];
        winnerTeamId = finalMatch ? getWinnerTeamId(finalMatch) : undefined;
    }

    if (winnerTeamId && winnerTeamId !== 'BYE') {
        const team = teams.find(tt => tt.id === winnerTeamId);
        const playerNames = team ? [team.player1, team.player2].filter(Boolean) as string[] : [];
        entries.push({
            id: `${tournament.id}_winner`,
            year,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            type: 'winner',
            teamName: team?.name || winnerTeamId,
            playerNames,
            sourceType: 'archived_tournament',
            sourceTournamentId: tournament.id,
            sourceTournamentName: tournament.name,
            sourceAutoGenerated: true,
            manuallyEdited: false
        });
    }

    // Aggregate player stats from finished matches
    const agg: Record<string, { name: string; yob?: number; birthDate?: string; points: number; soffi: number; games: number }> = {};

    (matches || []).forEach(m => {
        if (m.status !== 'finished') return;
        if (!m.stats) return;
        m.stats.forEach(s => {
            const team = teams.find(tt => tt.id === s.teamId);
            const birthDate = team
                ? (team.player1 === s.playerName ? (team as any).player1BirthDate : (team as any).player2BirthDate)
                : undefined;
            const yob = birthDate ? new Date(birthDate).getFullYear() : undefined;
            const key = `${normalizeName(s.playerName)}_${birthDate || 'ND'}`;
            if (!agg[key]) {
                agg[key] = { name: s.playerName, yob, birthDate, points: 0, soffi: 0, games: 0 };
            }
            agg[key].points += (s.canestri || 0);
            agg[key].soffi += (s.soffi || 0);
            agg[key].games += 1;
        });
    });

    const players = Object.values(agg).filter(p => p.games > 0);

    entries.push(
        ...buildMetricAwardEntries({
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            year,
            type: 'top_scorer',
            players,
            metric: 'points'
        })
    );

    entries.push(
        ...buildMetricAwardEntries({
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            year,
            type: 'defender',
            players,
            metric: 'soffi'
        })
    );

    // MVP is selected manually by organizers (do not auto-assign here).
    if (tournament.includeU25Awards !== false) {
        const u25Players = players.filter(p => isUnder25Rule(p.birthDate));
        entries.push(
            ...buildMetricAwardEntries({
                tournamentId: tournament.id,
                tournamentName: tournament.name,
                year,
                type: 'top_scorer_u25',
                players: u25Players,
                metric: 'points'
            })
        );

        entries.push(
            ...buildMetricAwardEntries({
                tournamentId: tournament.id,
                tournamentName: tournament.name,
                year,
                type: 'defender_u25',
                players: u25Players,
                metric: 'soffi'
            })
        );
    }

    return entries;
};

const isManualTournamentAwardEntry = (entry: HallOfFameEntry) =>
    entry.type === 'mvp' || !!entry.manuallyEdited || entry.sourceAutoGenerated === false;

const getTournamentMatchesForAwardsSync = (tournament: TournamentData): Match[] => {
    const directMatches = Array.isArray(tournament.matches) ? tournament.matches : [];
    if (directMatches.length) return directMatches;

    const rounds = Array.isArray(tournament.rounds) ? tournament.rounds : [];
    if (!rounds.length) return [];

    return rounds.flat().filter(Boolean) as Match[];
};

export const syncTournamentAwardsToHallOfFame = (
    hallOfFame: HallOfFameEntry[],
    tournament: TournamentData,
    matches: Match[],
    teams: Team[] = tournament.teams || []
): HallOfFameEntry[] => {
    const generatedAwards = buildTournamentAwards(tournament, matches, teams);
    const existingForTournament = (hallOfFame || []).filter(entry => entry.tournamentId === tournament.id);
    const manualOverrides = existingForTournament.filter(isManualTournamentAwardEntry);
    const manualMvps = manualOverrides.filter(entry => entry.type === 'mvp');
    const manualOverridesByType = new Map<HallOfFameEntry['type'], HallOfFameEntry>();

    manualOverrides
        .filter(entry => entry.type !== 'mvp')
        .forEach(entry => {
            manualOverridesByType.set(entry.type, entry);
        });

    const mergedTournamentEntries = [
        ...generatedAwards.filter(entry => !manualOverridesByType.has(entry.type)),
        ...Array.from(manualOverridesByType.values()),
        ...manualMvps,
    ];

    const others = (hallOfFame || []).filter(entry => entry.tournamentId !== tournament.id);
    return [...others, ...mergedTournamentEntries];
};

export const syncArchivedHistoryToHallOfFame = (state: AppState): HallOfFameEntry[] => {
    const tournaments = Array.isArray(state.tournamentHistory) ? state.tournamentHistory : [];
    let nextHallOfFame = Array.isArray(state.hallOfFame) ? state.hallOfFame : [];

    tournaments.forEach((tournament) => {
        nextHallOfFame = syncTournamentAwardsToHallOfFame(
            nextHallOfFame,
            tournament,
            getTournamentMatchesForAwardsSync(tournament),
            tournament.teams || []
        );
    });

    return nextHallOfFame;
};

export const setTournamentMvp = (state: AppState, tournamentId: string, tournamentName: string, playerName: string, playerId?: string) => {
    return setTournamentMvps(state, tournamentId, tournamentName, [{ name: playerName, id: playerId }]);
};

/**
 * Set one or more MVPs for a tournament (supports ties).
 * This is Option A compatible: we store individual MVP entries, one per player.
 */
export const setTournamentMvps = (
    state: AppState,
    tournamentId: string,
    tournamentName: string,
    players: { name: string; id?: string }[]
): AppState => {
    const year = (state.tournament?.startDate ? new Date(state.tournament.startDate) : new Date()).getFullYear().toString();
    const cleaned = (state.hallOfFame || []).filter(e => !(e.tournamentId === tournamentId && e.type === 'mvp'));

    const uniq = new Map<string, { name: string; id?: string }>();
    (players || []).forEach(p => {
        const k = (p.id || '').trim() || (p.name || '').trim().toLowerCase();
        if (!k) return;
        if (!uniq.has(k)) uniq.set(k, p);
    });

    const entries: HallOfFameEntry[] = Array.from(uniq.values()).map(p => ({
        id: `${tournamentId}_mvp_${(p.id || (p.name || '').trim().toLowerCase().replace(/\s+/g,'_'))}`,
        year,
        tournamentId,
        tournamentName,
        type: 'mvp',
        playerNames: [p.name],
        playerId: p.id,
        sourceType: 'archived_tournament',
        sourceTournamentId: tournamentId,
        sourceTournamentName: tournamentName,
        sourceAutoGenerated: false,
        manuallyEdited: true
    }));

    return { ...state, hallOfFame: [...cleaned, ...entries] };
};

export const archiveTournamentV2 = (state: AppState, options?: { includeU25Awards?: boolean }): AppState => {
    if (!state.tournament) return state;
    
    // Archive current tournament
    const archivedTournament: TournamentData = {
        ...state.tournament,
        includeU25Awards: options?.includeU25Awards ?? state.tournament.includeU25Awards ?? true,
        refereesRoster: [],
        matches: state.tournamentMatches
    };

    const nextHistory = [...(state.tournamentHistory || []), archivedTournament];
    const nextHallOfFame = syncArchivedHistoryToHallOfFame({
        ...state,
        tournamentHistory: nextHistory,
        hallOfFame: state.hallOfFame || [],
    });

    return {
        ...state,
        tournamentHistory: nextHistory,
        hallOfFame: nextHallOfFame,
        tournament: null,
        tournamentMatches: []
    };
};

export const normalizeTvProjection = (val: string | null | undefined): TvProjection => {
    if (!val) return 'scorers';
    if (TV_PROJECTIONS.includes(val as any)) {
        return val as TvProjection;
    }
    return 'scorers';
};

export const assertTvProjection = (val: string | null | undefined): TvProjection => {
    const normalized = normalizeTvProjection(val);
    if (val && val !== normalized) {
        console.warn(`[TvProjection] Legacy or invalid mode detected: "${val}". Normalized to: "${normalized}".`);
    }
    return normalized;
};
