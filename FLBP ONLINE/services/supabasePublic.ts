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
import { pullLocalWorkspace, resolveDataPlane } from './dataPlaneClient';

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

export interface SupabasePublicWorkspaceLiveRow extends SupabasePublicWorkspaceStateRow {}

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
    next_match_id?: string | null;
    next_slot?: 'A' | 'B' | null;
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

let pullPublicWorkspaceStateLastEtag: string | null = null;
let pullPublicWorkspaceStateLastRow: SupabasePublicWorkspaceStateRow | null = null;
let pullPublicWorkspaceLiveLastEtag: string | null = null;
let pullPublicWorkspaceLiveLastRow: SupabasePublicWorkspaceLiveRow | null = null;
let pullPublicWorkspaceLiveUnavailable = false;

export const PUBLIC_WORKSPACE_LIVE_UNAVAILABLE_CODE = 'PUBLIC_WORKSPACE_LIVE_UNAVAILABLE';

const makePublicWorkspaceLiveUnavailableError = (message?: string) => {
    const error: any = new Error(message || 'public_workspace_live non disponibile');
    error.code = PUBLIC_WORKSPACE_LIVE_UNAVAILABLE_CODE;
    return error;
};

export const isPublicWorkspaceLiveUnavailableError = (error: unknown): boolean =>
    (error as any)?.code === PUBLIC_WORKSPACE_LIVE_UNAVAILABLE_CODE;

const isMissingPublicWorkspaceLiveError = (status: number, body: string) => {
    const text = String(body || '').toLowerCase();
    return status === 404
        || text.includes('public_workspace_live')
        || text.includes('pgrst205')
        || text.includes('pgrst202')
        || (text.includes('relation') && text.includes('does not exist'));
};

export const shouldReadPublicWorkspaceFromLocal = (route: Awaited<ReturnType<typeof resolveDataPlane>>): boolean =>
    route.mode === 'local' && route.publicReadMode !== 'cloud' && !!route.baseUrl;

export const pullPublicWorkspaceState = async (perf?: RequestPerfHint): Promise<SupabasePublicWorkspaceStateRow | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const route = await resolveDataPlane();
    if (shouldReadPublicWorkspaceFromLocal(route)) return await pullLocalWorkspace(route, false) as SupabasePublicWorkspaceStateRow;

    const url = restUrl(
        cfg,
        `public_workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id,state,updated_at&limit=1`
    );
    const headers: Record<string, string> = { ...buildAnonHeaders(cfg) };
    if (pullPublicWorkspaceStateLastEtag) {
        headers['If-None-Match'] = pullPublicWorkspaceStateLastEtag;
    }
    const res = await fetchWithTimeout(
        url,
        { headers },
        2500,
        { source: perf?.source || 'pullPublicWorkspaceState', kind: perf?.kind || 'polling' }
    );
    if (res.status === 304) {
        return pullPublicWorkspaceStateLastRow;
    }
    if (!res.ok) throw new Error(await readErrorBody(res));
    const etag = res.headers.get('ETag') || res.headers.get('etag');
    if (etag) pullPublicWorkspaceStateLastEtag = etag;
    const rows = (await res.json()) as SupabasePublicWorkspaceStateRow[];
    pullPublicWorkspaceStateLastRow = rows?.[0] || null;
    return pullPublicWorkspaceStateLastRow;
};

export const pullPublicWorkspaceLive = async (perf?: RequestPerfHint): Promise<SupabasePublicWorkspaceLiveRow | null> => {
    const route = await resolveDataPlane();
    if (shouldReadPublicWorkspaceFromLocal(route)) return await pullLocalWorkspace(route, false) as SupabasePublicWorkspaceLiveRow;
    if (pullPublicWorkspaceLiveUnavailable) {
        throw makePublicWorkspaceLiveUnavailableError();
    }

    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_workspace_live?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id,state,updated_at&limit=1`
    );
    const headers: Record<string, string> = { ...buildAnonHeaders(cfg) };
    if (pullPublicWorkspaceLiveLastEtag) {
        headers['If-None-Match'] = pullPublicWorkspaceLiveLastEtag;
    }
    const res = await fetchWithTimeout(
        url,
        { headers },
        2500,
        { source: perf?.source || 'pullPublicWorkspaceLive', kind: perf?.kind || 'polling' }
    );
    if (res.status === 304) {
        return pullPublicWorkspaceLiveLastRow;
    }
    if (!res.ok) {
        const body = await readErrorBody(res);
        if (isMissingPublicWorkspaceLiveError(res.status, body)) {
            pullPublicWorkspaceLiveUnavailable = true;
            throw makePublicWorkspaceLiveUnavailableError(body);
        }
        throw new Error(body);
    }
    const etag = res.headers.get('ETag') || res.headers.get('etag');
    if (etag) pullPublicWorkspaceLiveLastEtag = etag;
    const rows = (await res.json()) as SupabasePublicWorkspaceLiveRow[];
    pullPublicWorkspaceLiveLastRow = rows?.[0] || null;
    return pullPublicWorkspaceLiveLastRow;
};

export const pullPublicWorkspaceUpdatedAt = async (perf?: RequestPerfHint): Promise<string | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const route = await resolveDataPlane();
    if (route.mode === 'local') {
        const row = await pullLocalWorkspace(route, false);
        return row.updated_at || null;
    }

    const url = restUrl(
        cfg,
        `public_workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=updated_at&limit=1`
    );
    const res = await fetchWithTimeout(
        url,
        { headers: buildAnonHeaders(cfg) },
        2500,
        { source: perf?.source || 'pullPublicWorkspaceUpdatedAt', kind: perf?.kind || 'polling' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as Array<{ updated_at?: string | null }>;
    return rows?.[0]?.updated_at || null;
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
    // The component computes this projection from the authoritative public
    // workspace snapshot. This avoids a second table that can lag behind the
    // Admin commit during or immediately after local-primary mode.
    return [];
};

export const pullPublicHallOfFameEntries = async (perf?: RequestPerfHint): Promise<HallOfFameEntry[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const route = await resolveDataPlane();
    const row = route.mode === 'local'
        ? await pullLocalWorkspace(route, false)
        : await pullPublicWorkspaceState(perf);
    return Array.isArray(row?.state?.hallOfFame) ? row.state.hallOfFame : [];
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
    const route = await resolveDataPlane();
    const row = route.mode === 'local'
        ? await pullLocalWorkspace(route, false)
        : await pullPublicWorkspaceState(perf);
    const live = row?.state?.tournament || null;
    const liveMatches = Array.isArray(row?.state?.tournamentMatches) ? row.state.tournamentMatches : (live?.matches || []);
    return {
        liveTournament: live ? { ...live, matches: liveMatches } as TournamentData : null,
        history: Array.isArray(row?.state?.tournamentHistory) ? row.state.tournamentHistory : [],
    };
};

export const pullPublicTournamentBundle = async (
    tournamentId: string,
    perf?: RequestPerfHint
): Promise<{ data: TournamentData; teams: Team[]; matches: Match[] } | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const route = await resolveDataPlane();
    {
        const row = route.mode === 'local'
            ? await pullLocalWorkspace(route, false)
            : await pullPublicWorkspaceState(perf);
        const live = row?.state?.tournament;
        const history = Array.isArray(row?.state?.tournamentHistory) ? row.state.tournamentHistory : [];
        const tournament = String(live?.id || '') === String(tournamentId || '')
            ? { ...live, matches: Array.isArray(row?.state?.tournamentMatches) ? row.state.tournamentMatches : (live?.matches || []) }
            : history.find((item: TournamentData) => String(item?.id || '') === String(tournamentId || ''));
        if (!tournament) return null;
        const teams = Array.isArray(tournament.teams) ? tournament.teams : [];
        const matches = Array.isArray(tournament.matches)
            ? tournament.matches
            : (Array.isArray((tournament as any).rounds) ? (tournament as any).rounds.flat() : []);
        return { data: tournament as TournamentData, teams, matches };
    }
};
