import type {
    TournamentData,
    Team,
    Match,
    Group,
    MatchStats,
    TournamentConfig,
    FinalRoundRobinConfig,
    FinalRoundRobinTopTeams,
    PlayerStats,
    HallOfFameEntry
} from '../types';
import { readViteSupabaseAnonKey, readViteSupabaseUrl, readViteWorkspaceId } from './viteEnv';
import { fetchWithDevRequestPerf, type DevRequestPerfKind } from './devRequestPerf';

type Json = any;

type RequestPerfHint = {
    source?: string;
    kind?: DevRequestPerfKind;
};

export interface SupabaseConfig {
    url: string;
    anonKey: string;
    workspaceId: string;
}

export interface SupabasePublicWorkspaceStateRow {
    workspace_id: string;
    state: Json;
    updated_at?: string;
}

export interface SupabasePublicCareerLeaderboardRow {
    workspace_id: string;
    id: string;
    name: string;
    team_name: string;
    games_played: number;
    points: number;
    soffi: number;
    avg_points: number;
    avg_soffi: number;
    u25: boolean;
    yob_label?: string | null;
    updated_at?: string;
}

export interface SupabasePublicSiteViewsDailyRow {
    workspace_id: string;
    view_date: string;
    views: number;
    updated_at?: string | null;
}

export interface SupabasePublicTournamentRow {
    workspace_id: string;
    id: string;
    name: string;
    start_date: string;
    type: 'elimination' | 'groups_elimination' | 'round_robin';
    config: Json;
    is_manual?: boolean | null;
    status: 'live' | 'archived';
    updated_at?: string;
}

export interface SupabasePublicTournamentTeamRow {
    workspace_id: string;
    tournament_id: string;
    id: string;
    name: string;
    player1: string;
    player2?: string | null;
    player1_is_referee?: boolean | null;
    player2_is_referee?: boolean | null;
    is_referee?: boolean | null;
    created_at?: string | null;
}

export interface SupabasePublicTournamentGroupRow {
    workspace_id: string;
    tournament_id: string;
    id: string;
    name: string;
    order_index?: number | null;
}

export interface SupabasePublicTournamentGroupTeamRow {
    workspace_id: string;
    tournament_id: string;
    group_id: string;
    team_id: string;
    seed?: number | null;
}

export interface SupabasePublicTournamentMatchRow {
    workspace_id: string;
    tournament_id: string;
    id: string;
    code?: string | null;
    phase?: 'groups' | 'bracket' | null;
    group_name?: string | null;
    round?: number | null;
    round_name?: string | null;
    order_index?: number | null;
    team_a_id?: string | null;
    team_b_id?: string | null;
    score_a?: number | null;
    score_b?: number | null;
    played?: boolean | null;
    status?: 'scheduled' | 'playing' | 'finished' | null;
    is_bye?: boolean | null;
    hidden?: boolean | null;
    updated_at?: string | null;
}

export interface SupabasePublicTournamentMatchStatRow {
    workspace_id: string;
    tournament_id: string;
    match_id: string;
    team_id: string;
    player_name: string;
    canestri: number;
    soffi: number;
}

export const getSupabaseConfig = (): SupabaseConfig | null => {
    const url = (readViteSupabaseUrl() || '').trim();
    const anonKey = (readViteSupabaseAnonKey() || '').trim();
    const workspaceId = (readViteWorkspaceId() || 'default').trim() || 'default';
    if (!url || !anonKey) return null;
    return { url, anonKey, workspaceId };
};

const buildAnonHeaders = (cfg: SupabaseConfig) => ({
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
});

const restUrl = (cfg: SupabaseConfig, path: string) => `${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`;
const rpcUrl = (cfg: SupabaseConfig, fnName: string) => restUrl(cfg, `rpc/${fnName}`);

const readErrorBody = async (res: Response): Promise<string> => {
    try {
        const text = await res.text();
        return text || `${res.status} ${res.statusText}`;
    } catch {
        return `${res.status} ${res.statusText}`;
    }
};

const fetchWithTimeout = async (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    timeoutMs = 2500,
    perf?: RequestPerfHint
): Promise<Response> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchWithDevRequestPerf(
            input,
            { ...(init || {}), signal: controller.signal },
            { source: perf?.source || 'fetchWithTimeout', kind: perf?.kind || 'polling' }
        );
    } finally {
        window.clearTimeout(timer);
    }
};

export const pullPublicWorkspaceState = async (perf?: RequestPerfHint): Promise<SupabasePublicWorkspaceStateRow | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id,state,updated_at&limit=1`
    );
    const res = await fetchWithTimeout(
        url,
        { headers: buildAnonHeaders(cfg) },
        2500,
        { source: perf?.source || 'pullPublicWorkspaceState', kind: perf?.kind || 'polling' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicWorkspaceStateRow[];
    return rows?.[0] || null;
};

export const trackPublicSiteView = async (date?: string): Promise<{ ok: boolean; view_date?: string; views?: number } | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) return null;

    const res = await fetchWithDevRequestPerf(
        rpcUrl(cfg, 'flbp_track_site_view'),
        {
            method: 'POST',
            headers: buildAnonHeaders(cfg),
            body: JSON.stringify({
                p_workspace_id: cfg.workspaceId,
                p_view_date: date || null,
            })
        },
        { source: 'trackPublicSiteView', kind: 'user' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as { ok: boolean; view_date?: string; views?: number };
};

export const pullPublicCareerLeaderboard = async (perf?: RequestPerfHint): Promise<PlayerStats[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_career_leaderboard?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,name,team_name,games_played,points,soffi,avg_points,avg_soffi,u25,yob_label`
    );
    const res = await fetchWithDevRequestPerf(
        url,
        { headers: buildAnonHeaders(cfg) },
        { source: perf?.source || 'pullPublicCareerLeaderboard', kind: perf?.kind || 'user' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicCareerLeaderboardRow[];

    return (rows || []).map((r) => ({
        id: r.id,
        name: r.name || '',
        teamName: r.team_name || '',
        gamesPlayed: r.games_played || 0,
        points: r.points || 0,
        soffi: r.soffi || 0,
        avgPoints: typeof r.avg_points === 'number' ? r.avg_points : parseFloat(String(r.avg_points || 0)),
        avgSoffi: typeof r.avg_soffi === 'number' ? r.avg_soffi : parseFloat(String(r.avg_soffi || 0)),
        u25: !!r.u25,
        yobLabel: r.yob_label || undefined
    }));
};

export const pullPublicHallOfFameEntries = async (perf?: RequestPerfHint): Promise<HallOfFameEntry[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_hall_of_fame_entries?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}` +
            `&select=id,year,tournament_id,tournament_name,type,team_name,player_names,value,created_at` +
            `&order=year.desc,created_at.desc`
    );

    const res = await fetchWithDevRequestPerf(
        url,
        { headers: buildAnonHeaders(cfg) },
        { source: perf?.source || 'pullPublicHallOfFameEntries', kind: perf?.kind || 'user' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as any[];
    return (rows || []).map((r) => ({
        id: r.id,
        year: String(r.year ?? ''),
        tournamentId: r.tournament_id,
        tournamentName: r.tournament_name,
        type: r.type,
        teamName: r.team_name ?? undefined,
        playerNames: Array.isArray(r.player_names) ? r.player_names : [],
        value: r.value ?? undefined
    }));
};

const coerceFinalRoundRobin = (cfg: any): FinalRoundRobinConfig | undefined => {
    const fr = (cfg && typeof cfg === 'object') ? (cfg as any).finalRoundRobin : undefined;
    if (!fr || typeof fr !== 'object') return undefined;

    const enabled = !!(fr as any).enabled;
    const rawTop = (fr as any).topTeams;
    const nTop = typeof rawTop === 'number' && Number.isFinite(rawTop) ? rawTop : parseInt(String(rawTop || ''), 10);
    const topTeams: FinalRoundRobinTopTeams = (nTop === 8 ? 8 : 4);
    const activated = typeof (fr as any).activated === 'boolean' ? (fr as any).activated : undefined;

    return { enabled, topTeams, ...(activated === undefined ? {} : { activated }) };
};

const coerceTournamentConfig = (cfg: any): TournamentConfig => {
    const n = (cfg && typeof cfg === 'object' ? (cfg as any).advancingPerGroup : undefined);
    const v = typeof n === 'number' && Number.isFinite(n) ? n : parseInt(String(n || ''), 10);

    const rawRefTables = (cfg && typeof cfg === 'object') ? (cfg as any).refTables : undefined;
    const rt = typeof rawRefTables === 'number' && Number.isFinite(rawRefTables)
        ? rawRefTables
        : parseInt(String(rawRefTables || ''), 10);
    const refTables = Number.isFinite(rt) && rt > 0 ? Math.floor(rt) : undefined;

    const finalRoundRobin = coerceFinalRoundRobin(cfg);
    const resultsOnly = !!(cfg && typeof cfg === 'object' && (cfg as any).resultsOnly === true);

    return {
        advancingPerGroup: Number.isFinite(v) && v >= 0 ? v : 2,
        ...(resultsOnly ? { resultsOnly: true } : {}),
        ...(finalRoundRobin ? { finalRoundRobin } : {}),
        ...(refTables ? { refTables } : {})
    };
};

const mapPublicTournamentRowToData = (r: SupabasePublicTournamentRow, teams: Team[] = [], groups: Group[] = []): TournamentData => {
    return {
        id: r.id,
        name: r.name || '',
        type: r.type,
        startDate: r.start_date,
        teams,
        groups: groups.length ? groups : undefined,
        config: coerceTournamentConfig(r.config),
        isManual: !!r.is_manual
    };
};

export const pullPublicTournamentsList = async (perf?: RequestPerfHint): Promise<{ liveTournament: TournamentData | null; history: TournamentData[] }> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_tournaments?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}` +
        `&select=id,name,start_date,type,config,is_manual,status,updated_at` +
        `&order=start_date.asc`
    );
    const res = await fetchWithDevRequestPerf(
        url,
        { headers: buildAnonHeaders(cfg) },
        { source: perf?.source || 'pullPublicTournamentsList', kind: perf?.kind || 'polling' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicTournamentRow[];

    const liveRow = (rows || []).find(r => r.status === 'live') || null;
    const historyRows = (rows || []).filter(r => r.status !== 'live');

    return {
        liveTournament: liveRow ? mapPublicTournamentRowToData(liveRow, [], []) : null,
        history: historyRows.map(r => mapPublicTournamentRowToData(r, [], []))
    };
};

export const pullPublicTournamentBundle = async (
    tournamentId: string,
    perf?: RequestPerfHint
): Promise<{ data: TournamentData; teams: Team[]; matches: Match[] } | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const tid = encodeURIComponent(tournamentId);
    const anonHeaders = buildAnonHeaders(cfg);

    const requestKind = perf?.kind || 'user';
    const requestSource = perf?.source || 'pullPublicTournamentBundle';
    const [tRes, teamsRes, groupsRes, groupTeamsRes, matchesRes, statsRes] = await Promise.all([
        fetchWithDevRequestPerf(restUrl(cfg, `public_tournaments?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&id=eq.${tid}&select=id,name,start_date,type,config,is_manual,status&limit=1`), { headers: anonHeaders }, { source: `${requestSource}.tournament`, kind: requestKind }),
        fetchWithDevRequestPerf(restUrl(cfg, `public_tournament_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tid}&select=id,name,player1,player2,player1_is_referee,player2_is_referee,is_referee,created_at&order=created_at.asc`), { headers: anonHeaders }, { source: `${requestSource}.teams`, kind: requestKind }),
        fetchWithDevRequestPerf(restUrl(cfg, `public_tournament_groups?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tid}&select=id,name,order_index&order=order_index.asc`), { headers: anonHeaders }, { source: `${requestSource}.groups`, kind: requestKind }),
        fetchWithDevRequestPerf(restUrl(cfg, `public_tournament_group_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tid}&select=group_id,team_id,seed`), { headers: anonHeaders }, { source: `${requestSource}.groupTeams`, kind: requestKind }),
        fetchWithDevRequestPerf(restUrl(cfg, `public_tournament_matches?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tid}&select=id,code,phase,group_name,round,round_name,order_index,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden&order=order_index.asc`), { headers: anonHeaders }, { source: `${requestSource}.matches`, kind: requestKind }),
        fetchWithDevRequestPerf(restUrl(cfg, `public_tournament_match_stats?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tid}&select=match_id,team_id,player_name,canestri,soffi`), { headers: anonHeaders }, { source: `${requestSource}.stats`, kind: requestKind }),
    ]);

    for (const r of [tRes, teamsRes, groupsRes, groupTeamsRes, matchesRes, statsRes]) {
        if (!r.ok) throw new Error(await readErrorBody(r));
    }

    const tRows = (await tRes.json()) as SupabasePublicTournamentRow[];
    const tRow = tRows?.[0];
    if (!tRow) return null;

    const teamRows = (await teamsRes.json()) as SupabasePublicTournamentTeamRow[];
    const teams: Team[] = (teamRows || []).map(tr => ({
        id: tr.id,
        name: tr.name || '',
        player1: tr.player1 || '',
        player2: tr.player2 || undefined,
        player1IsReferee: !!tr.player1_is_referee,
        player2IsReferee: !!tr.player2_is_referee,
        isReferee: !!tr.is_referee,
        createdAt: tr.created_at ? Date.parse(tr.created_at) : undefined
    }));

    const groupsRows = (await groupsRes.json()) as SupabasePublicTournamentGroupRow[];
    const groupTeamsRows = (await groupTeamsRes.json()) as SupabasePublicTournamentGroupTeamRow[];

    const teamById = new Map<string, Team>();
    teams.forEach(tt => teamById.set(tt.id, tt));

    const groupTeamsByGroup = new Map<string, string[]>();
    (groupTeamsRows || []).forEach(gt => {
        const arr = groupTeamsByGroup.get(gt.group_id) || [];
        arr.push(gt.team_id);
        groupTeamsByGroup.set(gt.group_id, arr);
    });

    const groups: Group[] = (groupsRows || []).map(gr => ({
        id: gr.id,
        name: gr.name || '',
        teams: (groupTeamsByGroup.get(gr.id) || []).map(id => teamById.get(id)).filter(Boolean) as Team[]
    }));

    const matchRows = (await matchesRes.json()) as SupabasePublicTournamentMatchRow[];
    const statRows = (await statsRes.json()) as SupabasePublicTournamentMatchStatRow[];

    const statsByMatch = new Map<string, MatchStats[]>();
    (statRows || []).forEach(sr => {
        const arr = statsByMatch.get(sr.match_id) || [];
        arr.push({
            teamId: sr.team_id,
            playerName: sr.player_name,
            canestri: sr.canestri || 0,
            soffi: sr.soffi || 0,
        });
        statsByMatch.set(sr.match_id, arr);
    });

    const matches: Match[] = (matchRows || []).map(mr => ({
        id: mr.id,
        code: mr.code || undefined,
        phase: (mr.phase as any) || undefined,
        groupName: mr.group_name || undefined,
        round: typeof mr.round === 'number' ? mr.round : (mr.round ? parseInt(String(mr.round), 10) : undefined),
        roundName: mr.round_name || undefined,
        orderIndex: typeof mr.order_index === 'number' ? mr.order_index : (mr.order_index ? parseInt(String(mr.order_index), 10) : undefined),
        teamAId: mr.team_a_id || undefined,
        teamBId: mr.team_b_id || undefined,
        scoreA: typeof mr.score_a === 'number' ? mr.score_a : parseInt(String(mr.score_a || 0), 10) || 0,
        scoreB: typeof mr.score_b === 'number' ? mr.score_b : parseInt(String(mr.score_b || 0), 10) || 0,
        played: !!mr.played,
        status: (mr.status as any) || 'scheduled',
        isBye: !!mr.is_bye,
        hidden: !!mr.hidden,
        stats: statsByMatch.get(mr.id) || undefined,
    }));

    const data = mapPublicTournamentRowToData(tRow, teams, groups);
    data.matches = matches;

    return { data, teams, matches };
};
