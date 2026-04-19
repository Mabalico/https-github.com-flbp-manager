import { coerceAppState, type AppState } from './storageService';
import { deriveYoBFromBirthDate, getPlayerKey, normalizeBirthDateInput, pickPlayerIdentityValue, resolvePlayerKey } from './playerIdentity';
import type { TournamentData, Team, Match, Group, MatchStats, TournamentConfig, FinalRoundRobinConfig, FinalRoundRobinTopTeams } from '../types';
import { buildRealSimPoolFromState } from './simPool';
import { readViteSupabaseAdminEmail, readViteSupabaseAnonKey, readViteSupabaseUrl, readViteWorkspaceId } from './viteEnv';
import { fetchWithDevRequestPerf, type DevRequestPerfKind, type DevRequestPerfMeta } from './devRequestPerf';

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

// When RLS is enabled, most write operations require an authenticated JWT.
// We keep the app UX unchanged by making this OPTIONAL and used only when present.
export const SUPABASE_ACCESS_TOKEN_LS_KEY = 'flbp_supabase_access_token';
export const SUPABASE_REFRESH_TOKEN_LS_KEY = 'flbp_supabase_refresh_token';
export const SUPABASE_EXPIRES_AT_LS_KEY = 'flbp_supabase_expires_at';
export const SUPABASE_USER_EMAIL_LS_KEY = 'flbp_supabase_user_email';
export const SUPABASE_USER_ID_LS_KEY = 'flbp_supabase_user_id';
export const PLAYER_SUPABASE_ACCESS_TOKEN_LS_KEY = 'flbp_player_supabase_access_token';
export const PLAYER_SUPABASE_REFRESH_TOKEN_LS_KEY = 'flbp_player_supabase_refresh_token';
export const PLAYER_SUPABASE_EXPIRES_AT_LS_KEY = 'flbp_player_supabase_expires_at';
export const PLAYER_SUPABASE_USER_EMAIL_LS_KEY = 'flbp_player_supabase_user_email';
export const PLAYER_SUPABASE_USER_ID_LS_KEY = 'flbp_player_supabase_user_id';
export const PLAYER_SUPABASE_FLOW_TYPE_LS_KEY = 'flbp_player_supabase_flow_type';
export const SUPABASE_AUTH_STATE_CHANGE_EVENT = 'flbp-supabase-auth-state-change';
// Removed LEGACY_ADMIN_BOOTSTRAP_PASSWORD

// Tracks the remote snapshot version that the user is currently "based on".
// Used to prevent accidental overwrites when multiple admins are editing.
export const REMOTE_BASE_UPDATED_AT_LS_KEY = 'flbp_remote_base_updated_at';

export const setRemoteBaseUpdatedAt = (updatedAt?: string | null) => {
    try {
        const v = (updatedAt || '').trim();
        if (!v) localStorage.removeItem(REMOTE_BASE_UPDATED_AT_LS_KEY);
        else localStorage.setItem(REMOTE_BASE_UPDATED_AT_LS_KEY, v);
    } catch {
        // ignore
    }
};

export const getRemoteBaseUpdatedAt = (): string | null => {
    try {
        const v = (localStorage.getItem(REMOTE_BASE_UPDATED_AT_LS_KEY) || '').trim();
        return v ? v : null;
    } catch {
        return null;
    }
};

export interface SupabaseSession {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: string | null; // ISO
    email?: string | null;
    userId?: string | null;
}

export interface PlayerSupabaseSession extends SupabaseSession {
    provider?: 'password' | 'google' | 'facebook' | 'apple';
    flowType?: 'session' | 'recovery';
}

const normalizeSessionText = (value: unknown): string | null => {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
};

const normalizePlayerFlowType = (value: PlayerSupabaseSession['flowType']): 'session' | 'recovery' => {
    return value === 'recovery' ? 'recovery' : 'session';
};

const sameSupabaseSession = (
    left: SupabaseSession | null | undefined,
    right: SupabaseSession | null | undefined
): boolean => {
    const leftAccess = normalizeSessionText(left?.accessToken);
    const rightAccess = normalizeSessionText(right?.accessToken);
    if (!leftAccess && !rightAccess) return true;
    return leftAccess === rightAccess
        && normalizeSessionText(left?.refreshToken) === normalizeSessionText(right?.refreshToken)
        && normalizeSessionText(left?.expiresAt) === normalizeSessionText(right?.expiresAt)
        && normalizeSessionText(left?.email) === normalizeSessionText(right?.email)
        && normalizeSessionText(left?.userId) === normalizeSessionText(right?.userId);
};

const sameStoredPlayerSupabaseSession = (
    left: PlayerSupabaseSession | null | undefined,
    right: PlayerSupabaseSession | null | undefined
): boolean => {
    if (!sameSupabaseSession(left, right)) return false;
    const leftAccess = normalizeSessionText(left?.accessToken);
    const rightAccess = normalizeSessionText(right?.accessToken);
    if (!leftAccess && !rightAccess) return true;
    return normalizePlayerFlowType(left?.flowType) === normalizePlayerFlowType(right?.flowType);
};

export type PlayerSupabaseSignUpResult =
    | { status: 'signed_in'; session: PlayerSupabaseSession }
    | { status: 'confirm_email'; email: string; userId?: string | null };

export type PlayerOAuthProvider = 'google' | 'facebook' | 'apple';

export interface PlayerSupabaseProfileRow {
    workspace_id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    birth_date: string;
    canonical_player_id?: string | null;
    canonical_player_name?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface PlayerSupabaseDeviceRow {
    id: string;
    workspace_id: string;
    user_id: string;
    platform: 'web' | 'android' | 'ios';
    device_token?: string | null;
    push_enabled?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface PlayerSupabaseCallRow {
    id: string;
    workspace_id: string;
    tournament_id: string;
    match_id?: string | null;
    team_id: string;
    team_name?: string | null;
    target_user_id: string;
    target_player_id?: string | null;
    target_player_name?: string | null;
    requested_by_user_id?: string | null;
    status: 'ringing' | 'acknowledged' | 'cancelled' | 'expired';
    requested_at?: string | null;
    acknowledged_at?: string | null;
    cancelled_at?: string | null;
    metadata?: Json;
}

export interface AdminPlayerAccountCatalogRow {
    user_id: string;
    email?: string | null;
    providers?: string[] | null;
    primary_provider?: string | null;
    created_at?: string | null;
    last_login_at?: string | null;
    linked_player_name?: string | null;
    birth_date?: string | null;
    canonical_player_id?: string | null;
    has_profile: boolean;
    device_count: number;
    is_admin?: boolean;
}

export interface AdminUserRoleRow {
    user_id: string;
    email?: string | null;
}

export type PlayerAccountMergeRequestStatus = 'pending' | 'resolved' | 'ignored';

export interface PlayerAccountMergeRequestRow {
    id: string;
    workspace_id: string;
    requester_user_id?: string | null;
    requester_email: string;
    requester_first_name: string;
    requester_last_name: string;
    requester_birth_date: string;
    requester_canonical_player_id?: string | null;
    requester_canonical_player_name?: string | null;
    candidate_player_id: string;
    candidate_player_name: string;
    candidate_birth_date?: string | null;
    comment?: string | null;
    status: PlayerAccountMergeRequestStatus;
    created_at?: string | null;
    updated_at?: string | null;
    resolved_at?: string | null;
    resolved_by_user_id?: string | null;
}

export interface SupabaseWorkspaceStateRow {
    workspace_id: string;
    state: Json;
    updated_at?: string;
}

export interface SupabasePublicWorkspaceStateRow {
    workspace_id: string;
    state: Json;
    updated_at?: string;
}

export interface SupabasePublicCareerLeaderboardRow {
    workspace_id: string;
    id: string; // public (hashed) player id
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

export interface SupabaseTrafficUsageDailyRow {
    workspace_id: string;
    usage_date: string;
    bucket: 'public' | 'tv' | 'admin' | 'referee' | 'sync' | 'unknown';
    request_count: number;
    request_bytes: number;
    response_bytes: number;
    updated_at?: string | null;
}

// -----------------------------
// Public tournaments (sanitized)
// -----------------------------

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

export const emitSupabaseAuthStateChange = () => {
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(SUPABASE_AUTH_STATE_CHANGE_EVENT));
        }
    } catch {
        // ignore
    }
};

export const getSupabaseAccessToken = (): string | null => {
    try {
        const v = (localStorage.getItem(SUPABASE_ACCESS_TOKEN_LS_KEY) || '').trim();
        return v ? v : null;
    } catch {
        return null;
    }
};

export const hasSupabaseWriteSession = (): boolean => {
    return !!getSupabaseAccessToken();
};

export const getSupabaseSession = (): SupabaseSession | null => {
    try {
        const accessToken = (localStorage.getItem(SUPABASE_ACCESS_TOKEN_LS_KEY) || '').trim();
        if (!accessToken) return null;
        const refreshToken = (localStorage.getItem(SUPABASE_REFRESH_TOKEN_LS_KEY) || '').trim() || null;
        const expiresAt = (localStorage.getItem(SUPABASE_EXPIRES_AT_LS_KEY) || '').trim() || null;
        const email = (localStorage.getItem(SUPABASE_USER_EMAIL_LS_KEY) || '').trim() || null;
        const userId = (localStorage.getItem(SUPABASE_USER_ID_LS_KEY) || '').trim() || null;
        return { accessToken, refreshToken, expiresAt, email, userId };
    } catch {
        return null;
    }
};

export const setSupabaseSession = (s: SupabaseSession | null) => {
    const current = getSupabaseSession();
    if (sameSupabaseSession(current, s)) return;
    try {
        if (!s?.accessToken) {
            localStorage.removeItem(SUPABASE_ACCESS_TOKEN_LS_KEY);
            localStorage.removeItem(SUPABASE_REFRESH_TOKEN_LS_KEY);
            localStorage.removeItem(SUPABASE_EXPIRES_AT_LS_KEY);
            localStorage.removeItem(SUPABASE_USER_EMAIL_LS_KEY);
            localStorage.removeItem(SUPABASE_USER_ID_LS_KEY);
            return;
        }
        localStorage.setItem(SUPABASE_ACCESS_TOKEN_LS_KEY, s.accessToken);
        if (s.refreshToken) localStorage.setItem(SUPABASE_REFRESH_TOKEN_LS_KEY, String(s.refreshToken));
        else localStorage.removeItem(SUPABASE_REFRESH_TOKEN_LS_KEY);
        if (s.expiresAt) localStorage.setItem(SUPABASE_EXPIRES_AT_LS_KEY, String(s.expiresAt));
        else localStorage.removeItem(SUPABASE_EXPIRES_AT_LS_KEY);
        if (s.email) localStorage.setItem(SUPABASE_USER_EMAIL_LS_KEY, String(s.email));
        else localStorage.removeItem(SUPABASE_USER_EMAIL_LS_KEY);
        if (s.userId) localStorage.setItem(SUPABASE_USER_ID_LS_KEY, String(s.userId));
        else localStorage.removeItem(SUPABASE_USER_ID_LS_KEY);
    } catch {
        // ignore
    } finally {
        emitSupabaseAuthStateChange();
    }
};

export const clearSupabaseSession = () => setSupabaseSession(null);

export const getPlayerSupabaseAccessToken = (): string | null => {
    try {
        const v = (localStorage.getItem(PLAYER_SUPABASE_ACCESS_TOKEN_LS_KEY) || '').trim();
        return v ? v : null;
    } catch {
        return null;
    }
};

export const getPlayerSupabaseSession = (): PlayerSupabaseSession | null => {
    try {
        const accessToken = (localStorage.getItem(PLAYER_SUPABASE_ACCESS_TOKEN_LS_KEY) || '').trim();
        if (!accessToken) return null;
        const refreshToken = (localStorage.getItem(PLAYER_SUPABASE_REFRESH_TOKEN_LS_KEY) || '').trim() || null;
        const expiresAt = (localStorage.getItem(PLAYER_SUPABASE_EXPIRES_AT_LS_KEY) || '').trim() || null;
        const email = (localStorage.getItem(PLAYER_SUPABASE_USER_EMAIL_LS_KEY) || '').trim() || null;
        const userId = (localStorage.getItem(PLAYER_SUPABASE_USER_ID_LS_KEY) || '').trim() || null;
        const flowTypeRaw = (localStorage.getItem(PLAYER_SUPABASE_FLOW_TYPE_LS_KEY) || '').trim().toLowerCase();
        const flowType: PlayerSupabaseSession['flowType'] = flowTypeRaw === 'recovery' ? 'recovery' : 'session';
        return { accessToken, refreshToken, expiresAt, email, userId, flowType };
    } catch {
        return null;
    }
};

export const setPlayerSupabaseSession = (s: PlayerSupabaseSession | null) => {
    const current = getPlayerSupabaseSession();
    if (sameStoredPlayerSupabaseSession(current, s)) return;
    try {
        if (!s?.accessToken) {
            localStorage.removeItem(PLAYER_SUPABASE_ACCESS_TOKEN_LS_KEY);
            localStorage.removeItem(PLAYER_SUPABASE_REFRESH_TOKEN_LS_KEY);
            localStorage.removeItem(PLAYER_SUPABASE_EXPIRES_AT_LS_KEY);
            localStorage.removeItem(PLAYER_SUPABASE_USER_EMAIL_LS_KEY);
            localStorage.removeItem(PLAYER_SUPABASE_USER_ID_LS_KEY);
            localStorage.removeItem(PLAYER_SUPABASE_FLOW_TYPE_LS_KEY);
            return;
        }
        localStorage.setItem(PLAYER_SUPABASE_ACCESS_TOKEN_LS_KEY, s.accessToken);
        if (s.refreshToken) localStorage.setItem(PLAYER_SUPABASE_REFRESH_TOKEN_LS_KEY, String(s.refreshToken));
        else localStorage.removeItem(PLAYER_SUPABASE_REFRESH_TOKEN_LS_KEY);
        if (s.expiresAt) localStorage.setItem(PLAYER_SUPABASE_EXPIRES_AT_LS_KEY, String(s.expiresAt));
        else localStorage.removeItem(PLAYER_SUPABASE_EXPIRES_AT_LS_KEY);
        if (s.email) localStorage.setItem(PLAYER_SUPABASE_USER_EMAIL_LS_KEY, String(s.email));
        else localStorage.removeItem(PLAYER_SUPABASE_USER_EMAIL_LS_KEY);
        if (s.userId) localStorage.setItem(PLAYER_SUPABASE_USER_ID_LS_KEY, String(s.userId));
        else localStorage.removeItem(PLAYER_SUPABASE_USER_ID_LS_KEY);
        localStorage.setItem(PLAYER_SUPABASE_FLOW_TYPE_LS_KEY, s.flowType === 'recovery' ? 'recovery' : 'session');
    } catch {
        // ignore
    } finally {
        emitSupabaseAuthStateChange();
    }
};

export const clearPlayerSupabaseSession = () => setPlayerSupabaseSession(null);

export const getSupabaseConfig = (): SupabaseConfig | null => {
    const url = (readViteSupabaseUrl() || '').trim();
    const anonKey = (readViteSupabaseAnonKey() || '').trim();
    const workspaceId = (readViteWorkspaceId() || 'default').trim() || 'default';
    if (!url || !anonKey) return null;
    return { url, anonKey, workspaceId };
};

export const getConfiguredAdminEmail = (): string => {
    return (readViteSupabaseAdminEmail() || 'admin@flbp.local').trim() || 'admin@flbp.local';
};

const isSessionExpiredByTimestamp = (session: SupabaseSession | null | undefined): boolean => {
    const expTs = session?.expiresAt ? Date.parse(session.expiresAt) : NaN;
    return Number.isFinite(expTs) ? expTs <= Date.now() + 5_000 : false;
};

const getUsableSupabaseAccessToken = (): string | null => {
    const session = getSupabaseSession();
    if (!session?.accessToken) return null;
    if (isSessionExpiredByTimestamp(session)) return null;
    return session.accessToken;
};

const buildHeaders = (cfg: SupabaseConfig, accessToken?: string | null) => {
    const token = (accessToken || getUsableSupabaseAccessToken() || '').trim();
    // With RLS enabled, authenticated requests must send the user's JWT.
    // Otherwise we fall back to anon key (read-only for public tables / may be denied).
    const auth = token ? token : cfg.anonKey;
    return {
        'apikey': cfg.anonKey,
        'Authorization': `Bearer ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
};

// Forces anon-key auth even if a JWT is present in localStorage.
// Useful to validate that public tables are truly readable without admin auth.
const buildAnonHeaders = (cfg: SupabaseConfig) => {
    return {
        'apikey': cfg.anonKey,
        'Authorization': `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
};

const restUrl = (cfg: SupabaseConfig, path: string) => {
    const base = cfg.url.replace(/\/$/, '');
    return `${base}/rest/v1/${path}`;
};

const authUrl = (cfg: SupabaseConfig, pathAndQuery: string) => {
    const base = cfg.url.replace(/\/$/, '');
    return `${base}/auth/v1/${pathAndQuery.replace(/^\//, '')}`;
};

const functionsUrl = (cfg: SupabaseConfig, fnName: string) => {
    const base = cfg.url.replace(/\/$/, '');
    return `${base}/functions/v1/${fnName.replace(/^\//, '')}`;
};

const readErrorBody = async (res: Response) => {
    try {
        const text = await res.text();
        return text || `${res.status} ${res.statusText}`;
    } catch {
        return `${res.status} ${res.statusText}`;
    }
};

const buildPostgrestInClause = (values: Array<string | null | undefined>): string => {
    return values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .map((value) => encodeURIComponent(value))
        .join(',');
};

const AUTH_CALLBACK_PARAM_KEYS = [
    'access_token',
    'refresh_token',
    'expires_in',
    'expires_at',
    'token_type',
    'provider',
    'type',
    'error',
    'error_code',
    'error_description',
    'code',
    'scope',
    'player_recovery',
] as const;

const readAuthPayloadParams = (): URLSearchParams => {
    const merged = new URLSearchParams();
    const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, '').trim());
    const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, '').trim());
    for (const [key, value] of searchParams.entries()) merged.set(key, value);
    for (const [key, value] of hashParams.entries()) merged.set(key, value);
    return merged;
};

const cleanUrlAuthPayload = () => {
    try {
        const url = new URL(window.location.href);
        for (const key of AUTH_CALLBACK_PARAM_KEYS) {
            url.searchParams.delete(key);
        }
        url.hash = '';
        const nextSearch = url.searchParams.toString();
        const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
        window.history.replaceState({}, document.title, nextUrl);
    } catch {
        // ignore
    }
};

const normalizeFetchFailure = (error: any, fallback: string): Error => {
    const message = String(error?.message || error || '').trim();
    if (error?.name === 'AbortError' || /aborted/i.test(message)) {
        return new Error(fallback);
    }
    return error instanceof Error ? error : new Error(message || fallback);
};

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 2500, perfMeta?: DevRequestPerfMeta): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetchWithDevRequestPerf(input, { ...(init || {}), signal: ctrl.signal }, { ...(perfMeta || {}), timeoutMs });
    } finally {
        window.clearTimeout(timer);
    }
};

// -----------------------------
// Supabase Auth helpers (optional)
// -----------------------------

export const ensureFreshSupabaseSession = async (options?: { force?: boolean }): Promise<SupabaseSession | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) return null;
    const cur = getSupabaseSession();
    if (!cur?.accessToken) return null;
    const force = !!options?.force;

    // If no expiry is known, we avoid refreshing unless a caller is recovering from a rejected JWT.
    const expTs = cur.expiresAt ? Date.parse(cur.expiresAt) : NaN;
    if (!force && !Number.isFinite(expTs)) return cur;

    // Refresh if token expired or expires within 60s.
    if (!force && expTs > Date.now() + 60_000) return cur;

    if (!cur.refreshToken) {
        clearSupabaseSession();
        return null;
    }

    try {
        const res = await fetchWithDevRequestPerf(authUrl(cfg, 'token?grant_type=refresh_token'), {
            method: 'POST',
            headers: {
                'apikey': cfg.anonKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ refresh_token: cur.refreshToken })
        }, { source: 'ensureFreshSupabaseSession', kind: 'admin' });
        if (!res.ok) {
            clearSupabaseSession();
            return null;
        }
        const j = await res.json();
        const accessToken = String(j.access_token || '').trim();
        if (!accessToken) {
            clearSupabaseSession();
            return null;
        }
        const refreshToken = String(j.refresh_token || cur.refreshToken || '').trim() || null;
        const expiresIn = Number(j.expires_in || 0);
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : (cur.expiresAt || null);
        const email = (j.user?.email ? String(j.user.email) : (cur.email || null));
        const userId = (j.user?.id ? String(j.user.id) : (cur.userId || null));
        const next: SupabaseSession = { accessToken, refreshToken, expiresAt, email, userId };
        setSupabaseSession(next);
        return next;
    } catch {
        clearSupabaseSession();
        return null;
    }
};

const ensureFreshAuthForSupabaseOps = async () => {
    try {
        await ensureFreshSupabaseSession();
    } catch {
        // ignore: requests will still fall back to the stored token/anon key
    }
};

const isRejectedAdminEdgeSession = (status: number, body: string): boolean => {
    return status === 401 && /Admin session invalid or expired|JWT expired|Invalid JWT/i.test(body);
};

const recoverRejectedAdminWriteSession = async (): Promise<SupabaseSession | null> => {
    const refreshed = await ensureFreshSupabaseSession({ force: true });
    if (refreshed?.accessToken) return refreshed;
    return await bootstrapSupabaseWriteSession();
};

const tryBootstrapAdminSessionFromPlayer = async (): Promise<SupabaseSession | null> => {
    const playerSession = await ensureFreshPlayerSupabaseSession();
    if (!playerSession?.accessToken || playerSession.flowType === 'recovery') return null;
    const mirroredSession: SupabaseSession = {
        accessToken: playerSession.accessToken,
        refreshToken: playerSession.refreshToken || null,
        expiresAt: playerSession.expiresAt || null,
        email: playerSession.email || null,
        userId: playerSession.userId || null,
    };
    setSupabaseSession(mirroredSession);
    const access = await ensureSupabaseAdminAccess();
    if (!access.ok) {
        clearSupabaseSession();
        return null;
    }
    return getSupabaseSession() || mirroredSession;
};

// Removed tryBootstrapLegacyAdminSupabaseSession

let adminWriteSessionBootstrapPromise: Promise<SupabaseSession | null> | null = null;

const bootstrapSupabaseWriteSession = async (): Promise<SupabaseSession | null> => {
    if (adminWriteSessionBootstrapPromise) return adminWriteSessionBootstrapPromise;
    adminWriteSessionBootstrapPromise = (async () => {
        let session = await ensureFreshSupabaseSession();
        if (!session?.accessToken) {
            session = await tryBootstrapAdminSessionFromPlayer();
        }
        // Removed legacy auto-login session fallback
        return session;
    })();
    try {
        return await adminWriteSessionBootstrapPromise;
    } finally {
        adminWriteSessionBootstrapPromise = null;
    }
};

const requireSupabaseWriteSession = async (): Promise<SupabaseSession> => {
    const session = await bootstrapSupabaseWriteSession();
    if (!session?.accessToken) {
        throw new Error('Sessione admin assente o scaduta. Esegui il login Supabase in Admin → Dati / Persistenza prima di scrivere sul database.');
    }
    return session;
};

export const signInWithPassword = async (email: string, password: string): Promise<SupabaseSession> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const e = (email || '').trim();
    const p = password || '';
    if (!e || !p) throw new Error('Inserisci email e password.');

    let res: Response;
    try {
        res = await fetchWithTimeout(authUrl(cfg, 'token?grant_type=password'), {
            method: 'POST',
            headers: {
                'apikey': cfg.anonKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email: e, password: p })
        }, 8000, { source: 'signInWithPassword', kind: 'admin' });
    } catch (error: any) {
        throw normalizeFetchFailure(error, 'Timeout login Supabase. Controlla connessione, progetto Supabase e riprova.');
    }
    if (!res.ok) throw new Error(await readErrorBody(res));
    const j = await res.json();
    const accessToken = String(j.access_token || '').trim();
    if (!accessToken) throw new Error('Login fallito (token mancante).');
    const refreshToken = String(j.refresh_token || '').trim() || null;
    const expiresIn = Number(j.expires_in || 0);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const outEmail = (j.user?.email ? String(j.user.email) : e);
    const userId = (j.user?.id ? String(j.user.id) : null);

    const session: SupabaseSession = {
        accessToken,
        refreshToken,
        expiresAt,
        email: outEmail,
        userId
    };
    setSupabaseSession(session);
    return session;
};

export const signOutSupabase = async (): Promise<void> => {
    const cfg = getSupabaseConfig();
    const cur = getSupabaseSession();
    try {
        if (cfg && cur?.accessToken) {
            await fetchWithDevRequestPerf(authUrl(cfg, 'logout'), {
                method: 'POST',
                headers: {
                    'apikey': cfg.anonKey,
                    'Authorization': `Bearer ${cur.accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }, { source: 'signOutSupabase', kind: 'admin' });
        }
    } catch {
        // ignore
    } finally {
        clearSupabaseSession();
    }
};

export const ensureFreshPlayerSupabaseSession = async (): Promise<PlayerSupabaseSession | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) return null;
    const cur = getPlayerSupabaseSession();
    if (!cur?.accessToken) return null;

    const expTs = cur.expiresAt ? Date.parse(cur.expiresAt) : NaN;
    if (!Number.isFinite(expTs)) return cur;
    if (expTs > Date.now() + 60_000) return cur;
    if (!cur.refreshToken) {
        clearPlayerSupabaseSession();
        return null;
    }

    try {
        const res = await fetchWithDevRequestPerf(authUrl(cfg, 'token?grant_type=refresh_token'), {
            method: 'POST',
            headers: {
                'apikey': cfg.anonKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ refresh_token: cur.refreshToken })
        }, { source: 'ensureFreshPlayerSupabaseSession', kind: 'sync' });
        if (!res.ok) {
            clearPlayerSupabaseSession();
            return null;
        }
        const j = await res.json();
        const accessToken = String(j.access_token || '').trim();
        if (!accessToken) {
            clearPlayerSupabaseSession();
            return null;
        }
        const refreshToken = String(j.refresh_token || cur.refreshToken || '').trim() || null;
        const expiresIn = Number(j.expires_in || 0);
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : (cur.expiresAt || null);
        const email = (j.user?.email ? String(j.user.email) : (cur.email || null));
        const userId = (j.user?.id ? String(j.user.id) : (cur.userId || null));
        const next: PlayerSupabaseSession = {
            accessToken,
            refreshToken,
            expiresAt,
            email,
            userId,
            provider: cur.provider,
            flowType: cur.flowType === 'recovery' ? 'recovery' : 'session',
        };
        setPlayerSupabaseSession(next);
        return next;
    } catch {
        clearPlayerSupabaseSession();
        return null;
    }
};

const requirePlayerSupabaseSession = async (): Promise<PlayerSupabaseSession> => {
    const session = await ensureFreshPlayerSupabaseSession();
    if (!session?.accessToken) {
        throw new Error('Sessione player assente o scaduta. Accedi di nuovo dall’Area Giocatore.');
    }
    return session;
};

const parsePlayerSession = (j: any, fallbackEmail?: string | null, provider?: PlayerSupabaseSession['provider']): PlayerSupabaseSession => {
    const accessToken = String(j.access_token || '').trim();
    if (!accessToken) throw new Error('Login player fallito (token mancante).');
    const refreshToken = String(j.refresh_token || '').trim() || null;
    const expiresIn = Number(j.expires_in || 0);
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    return {
        accessToken,
        refreshToken,
        expiresAt,
        email: j.user?.email ? String(j.user.email) : (fallbackEmail || null),
        userId: j.user?.id ? String(j.user.id) : null,
        provider,
        flowType: 'session',
    };
};

const decodeJwtPayload = (token: string | null | undefined): Record<string, any> | null => {
    try {
        const raw = String(token || '').trim();
        if (!raw) return null;
        const parts = raw.split('.');
        if (parts.length < 2) return null;
        const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '==='.slice((normalized.length + 3) % 4);
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
};

export const consumePlayerSupabaseSessionFromUrl = (): PlayerSupabaseSession | null => {
    try {
        const params = readAuthPayloadParams();
        const accessToken = String(params.get('access_token') || '').trim();
        const refreshToken = String(params.get('refresh_token') || '').trim();
        const errorDescription = String(params.get('error_description') || params.get('error') || '').trim();
        if (errorDescription) {
            cleanUrlAuthPayload();
            throw new Error(errorDescription);
        }
        if (!accessToken) return null;

        const expiresIn = Number(params.get('expires_in') || 0);
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
        const providerRaw = String(params.get('provider') || '').trim().toLowerCase();
        const provider: PlayerSupabaseSession['provider'] =
            providerRaw === 'google' || providerRaw === 'facebook' || providerRaw === 'apple'
                ? providerRaw
                : 'password';
        const flowType: PlayerSupabaseSession['flowType'] =
            String(params.get('type') || '').trim().toLowerCase() === 'recovery' ? 'recovery' : 'session';
        const claims = decodeJwtPayload(accessToken);

        const next: PlayerSupabaseSession = {
            accessToken,
            refreshToken: refreshToken || null,
            expiresAt,
            provider,
            flowType,
            userId: String(claims?.sub || '').trim() || null,
            email: String(claims?.email || '').trim() || null,
        };
        setPlayerSupabaseSession(next);
        cleanUrlAuthPayload();
        return next;
    } catch (error) {
        cleanUrlAuthPayload();
        throw error;
    }
};

export const playerSignInWithPassword = async (email: string, password: string): Promise<PlayerSupabaseSession> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const e = (email || '').trim();
    const p = password || '';
    if (!e || !p) throw new Error('Inserisci email e password.');
    const res = await fetchWithTimeout(authUrl(cfg, 'token?grant_type=password'), {
        method: 'POST',
        headers: {
            'apikey': cfg.anonKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ email: e, password: p })
    }, 8000, { source: 'playerSignInWithPassword', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const next = parsePlayerSession(await res.json(), e, 'password');
    setPlayerSupabaseSession(next);
    return next;
};

export const playerSignUpWithPassword = async (
    email: string,
    password: string,
    metadata?: Record<string, Json>
): Promise<PlayerSupabaseSignUpResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const e = (email || '').trim();
    const p = password || '';
    if (!e || !p) throw new Error('Inserisci email e password.');
    const res = await fetchWithTimeout(authUrl(cfg, 'signup'), {
        method: 'POST',
        headers: {
            'apikey': cfg.anonKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            email: e,
            password: p,
            data: metadata || {}
        })
    }, 8000, { source: 'playerSignUpWithPassword', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const payload = await res.json();
    const accessToken = String(payload?.access_token || '').trim();
    if (accessToken) {
        const next = parsePlayerSession(payload, e, 'password');
        setPlayerSupabaseSession(next);
        return { status: 'signed_in', session: next };
    }
    const pendingEmail = String(payload?.user?.email || e || '').trim();
    const pendingUserId = String(payload?.user?.id || '').trim() || null;
    if (pendingEmail) {
        return {
            status: 'confirm_email',
            email: pendingEmail,
            userId: pendingUserId
        };
    }
    throw new Error('Registrazione player fallita (sessione o conferma mail mancanti).');
};

export const hasPlayerSupabaseAuthPayloadInUrl = (): boolean => {
    try {
        const params = readAuthPayloadParams();
        return [
            'access_token',
            'refresh_token',
            'provider',
            'type',
            'error',
            'error_description'
        ].some((key) => String(params.get(key) || '').trim().length > 0);
    } catch {
        return false;
    }
};

export const playerRequestPasswordReset = async (email: string, redirectTo?: string | null): Promise<void> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const e = (email || '').trim();
    if (!e) throw new Error('Inserisci una email valida.');
    const payload: Record<string, Json> = { email: e };
    const safeRedirect = String(redirectTo || '').trim();
    if (safeRedirect) {
        payload.redirect_to = safeRedirect;
    }
    const res = await fetchWithTimeout(authUrl(cfg, 'recover'), {
        method: 'POST',
        headers: {
            'apikey': cfg.anonKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    }, 8000, { source: 'playerRequestPasswordReset', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
};

export const playerUpdatePassword = async (nextPassword: string): Promise<PlayerSupabaseSession> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const session = await ensureFreshPlayerSupabaseSession();
    if (!session?.accessToken) {
        throw new Error('Sessione di recupero non valida o scaduta. Richiedi un nuovo link.');
    }
    const safePassword = String(nextPassword || '');
    if (!safePassword.trim()) {
        throw new Error('Inserisci una nuova password valida.');
    }

    const res = await fetchWithTimeout(authUrl(cfg, 'user'), {
        method: 'PUT',
        headers: {
            'apikey': cfg.anonKey,
            'Authorization': `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ password: safePassword })
    }, 8000, { source: 'playerUpdatePassword', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));

    const payload = await res.json();
    const next: PlayerSupabaseSession = {
        ...session,
        email: String(payload?.user?.email || session.email || '').trim() || null,
        userId: String(payload?.user?.id || session.userId || '').trim() || null,
        flowType: 'session',
    };
    setPlayerSupabaseSession(next);
    return next;
};

export const playerSignOutSupabase = async (): Promise<void> => {
    const cfg = getSupabaseConfig();
    const cur = getPlayerSupabaseSession();
    try {
        if (cfg && cur?.accessToken) {
            await fetchWithDevRequestPerf(authUrl(cfg, 'logout'), {
                method: 'POST',
                headers: {
                    'apikey': cfg.anonKey,
                    'Authorization': `Bearer ${cur.accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }, { source: 'playerSignOutSupabase', kind: 'sync' });
        }
    } catch {
        // ignore
    } finally {
        clearPlayerSupabaseSession();
    }
};

export const getPlayerOAuthAuthorizeUrl = (
    provider: PlayerOAuthProvider,
    redirectTo?: string | null
): string => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const params = new URLSearchParams({ provider });
    const safeRedirect = String(redirectTo || '').trim();
    if (safeRedirect) params.set('redirect_to', safeRedirect);
    return authUrl(cfg, `authorize?${params.toString()}`);
};

export const pullPlayerAppProfile = async (): Promise<PlayerSupabaseProfileRow | null> => {
    const cfg = getSupabaseConfig();
    const session = await requirePlayerSupabaseSession();
    const userId = String(session.userId || '').trim();
    if (!cfg || !userId) return null;
    const url = restUrl(
        cfg,
        `player_app_profiles?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&user_id=eq.${encodeURIComponent(userId)}&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at&limit=1`
    );
    const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg, session.accessToken) }, 4000, { source: 'pullPlayerAppProfile', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] as PlayerSupabaseProfileRow : null;
};

export const pushPlayerAppProfile = async (input: {
    firstName: string;
    lastName: string;
    birthDate: string;
    canonicalPlayerId?: string | null;
    canonicalPlayerName?: string | null;
}): Promise<PlayerSupabaseProfileRow> => {
    const cfg = getSupabaseConfig();
    const session = await requirePlayerSupabaseSession();
    const userId = String(session.userId || '').trim();
    if (!cfg || !userId) throw new Error('Sessione player non valida.');
    const payload = {
        workspace_id: cfg.workspaceId,
        user_id: userId,
        first_name: String(input.firstName || '').trim(),
        last_name: String(input.lastName || '').trim(),
        birth_date: String(input.birthDate || '').trim(),
        canonical_player_id: input.canonicalPlayerId ? String(input.canonicalPlayerId) : null,
        canonical_player_name: input.canonicalPlayerName ? String(input.canonicalPlayerName) : null,
    };
    const res = await fetchWithTimeout(
        restUrl(cfg, 'player_app_profiles?on_conflict=workspace_id,user_id&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at'),
        {
            method: 'POST',
            headers: {
                ...buildHeaders(cfg, session.accessToken),
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(payload)
        },
        4000,
        { source: 'pushPlayerAppProfile', kind: 'sync' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) throw new Error('Profilo player non restituito.');
    return rows[0] as PlayerSupabaseProfileRow;
};

export const registerPlayerAppDevice = async (input: {
    id: string;
    platform: PlayerSupabaseDeviceRow['platform'];
    deviceToken?: string | null;
    pushEnabled?: boolean;
}): Promise<PlayerSupabaseDeviceRow> => {
    const cfg = getSupabaseConfig();
    const session = await requirePlayerSupabaseSession();
    const userId = String(session.userId || '').trim();
    if (!cfg || !userId) throw new Error('Sessione player non valida.');
    const payload = {
        id: String(input.id || '').trim(),
        workspace_id: cfg.workspaceId,
        user_id: userId,
        platform: input.platform,
        device_token: input.deviceToken ? String(input.deviceToken) : null,
        push_enabled: input.pushEnabled !== false
    };
    if (!payload.id) throw new Error('Device id mancante.');
    const res = await fetchWithTimeout(
        restUrl(cfg, 'player_app_devices?on_conflict=id&select=id,workspace_id,user_id,platform,device_token,push_enabled,created_at,updated_at'),
        {
            method: 'POST',
            headers: {
                ...buildHeaders(cfg, session.accessToken),
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(payload)
        },
        4000,
        { source: 'registerPlayerAppDevice', kind: 'sync' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) throw new Error('Device player non restituito.');
    return rows[0] as PlayerSupabaseDeviceRow;
};

const PLAYER_APP_CALL_STALE_MS = 10 * 60 * 1000;
const EXPIRE_STALE_PLAYER_CALLS_RPC = 'flbp_player_expire_stale_calls';

const expireStalePlayerAppCallsForCurrentUser = async (cutoff: string): Promise<void> => {
    const cfg = getSupabaseConfig();
    const session = await requirePlayerSupabaseSession();
    if (!cfg) return;
    const res = await fetchWithTimeout(rpcUrl(cfg, EXPIRE_STALE_PLAYER_CALLS_RPC), {
        method: 'POST',
        headers: buildHeaders(cfg, session.accessToken),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_cutoff: cutoff
        })
    }, 3000, { source: 'expireStalePlayerAppCallsForCurrentUser', kind: 'sync' });
    if (!res.ok) {
        const body = await readErrorBody(res);
        if (isMissingRpcFunctionError(body, EXPIRE_STALE_PLAYER_CALLS_RPC)) return;
        // Keep the existing cutoff read as fallback if lazy normalization fails.
        console.warn('FLBP stale player call normalization skipped', body);
    }
};

export const pullPlayerAppCalls = async (): Promise<PlayerSupabaseCallRow[]> => {
    const cfg = getSupabaseConfig();
    const session = await requirePlayerSupabaseSession();
    const userId = String(session.userId || '').trim();
    if (!cfg || !userId) return [];
    // Keep the read cutoff, but first let the backend mark old ringing calls as terminal when available.
    const cutoff = new Date(Date.now() - PLAYER_APP_CALL_STALE_MS).toISOString();
    await expireStalePlayerAppCallsForCurrentUser(cutoff).catch((error) => {
        console.warn('FLBP stale player call normalization failed', error);
    });
    const url = restUrl(
        cfg,
        `player_app_calls?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&target_user_id=eq.${encodeURIComponent(userId)}&requested_at=gte.${encodeURIComponent(cutoff)}&select=id,workspace_id,tournament_id,team_id,team_name,target_user_id,target_player_id,target_player_name,requested_by_user_id,status,requested_at,acknowledged_at,cancelled_at,metadata&order=requested_at.desc`
    );
    const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg, session.accessToken) }, 4000, { source: 'pullPlayerAppCalls', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return (await res.json()) as PlayerSupabaseCallRow[];
};

export const acknowledgePlayerAppCall = async (callId: string): Promise<Json> => {
    const cfg = getSupabaseConfig();
    const session = await requirePlayerSupabaseSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const res = await fetchWithTimeout(rpcUrl(cfg, 'flbp_player_ack_call'), {
        method: 'POST',
        headers: buildHeaders(cfg, session.accessToken),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_call_id: String(callId || '').trim()
        })
    }, 4000, { source: 'acknowledgePlayerAppCall', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json();
};

export const cancelPlayerAppCall = async (callId: string): Promise<Json> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const res = await fetchWithTimeout(rpcUrl(cfg, 'flbp_player_cancel_call'), {
        method: 'POST',
        headers: buildHeaders(cfg, session.accessToken),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_call_id: String(callId || '').trim()
        })
    }, 4000, { source: 'cancelPlayerAppCall', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json();
};

export const callPlayerAppTeam = async (input: {
    tournamentId: string;
    teamId: string;
    teamName?: string | null;
    matchId?: string | null;
    targetUserId: string;
    targetPlayerId?: string | null;
    targetPlayerName?: string | null;
}): Promise<Json> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const payload = {
        p_workspace_id: cfg.workspaceId,
        p_tournament_id: String(input.tournamentId || '').trim(),
        p_team_id: String(input.teamId || '').trim(),
        p_team_name: input.teamName ? String(input.teamName) : null,
        p_target_user_id: String(input.targetUserId || '').trim(),
        p_target_player_id: input.targetPlayerId ? String(input.targetPlayerId) : null,
        p_target_player_name: input.targetPlayerName ? String(input.targetPlayerName) : null,
    };
    const matchId = String(input.matchId || '').trim();
    const postCall = (body: Json) => fetchWithTimeout(rpcUrl(cfg, 'flbp_player_call_team'), {
        method: 'POST',
        headers: buildHeaders(cfg, session.accessToken),
        body: JSON.stringify(body)
    }, 4000, { source: 'callPlayerAppTeam', kind: 'sync' });

    let res = await postCall(matchId ? { ...payload, p_match_id: matchId } : payload);
    if (!res.ok && matchId) {
        const body = await readErrorBody(res);
        const canRetryLegacy = /PGRST202|p_match_id|flbp_player_call_team|function/i.test(body);
        if (!canRetryLegacy) throw new Error(body);
        res = await postCall(payload);
    }
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json();
};

export type PlayerCallPushDispatchAction = 'ringing' | 'cancelled' | 'acknowledged';

export interface PlayerCallPushDispatchResult {
    ok: boolean;
    callId: string;
    action: PlayerCallPushDispatchAction;
    skipped?: boolean;
    code?: string | null;
    reasonCode?: string | null;
    reason?: string | null;
    deliveries?: Array<{
        deviceId: string;
        platform: string;
        provider: string;
        ok: boolean;
        status?: number | null;
        code?: string | null;
        reason?: string | null;
    }>;
}

export const dispatchPlayerCallPush = async (input: {
    callId: string;
    action: PlayerCallPushDispatchAction;
    refereeTournamentId?: string | null;
    refereePassword?: string | null;
}): Promise<PlayerCallPushDispatchResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const callId = String(input.callId || '').trim();
    if (!callId) throw new Error('Convocazione non valida.');
    const action = String(input.action || '').trim().toLowerCase() as PlayerCallPushDispatchAction;
    if (action !== 'ringing' && action !== 'cancelled' && action !== 'acknowledged') {
        throw new Error('Azione push non valida.');
    }
    const refereePassword = String(input.refereePassword || '').trim();
    const refereeTournamentId = String(input.refereeTournamentId || '').trim();
    const useRefereeAuth = Boolean(refereePassword && refereeTournamentId);

    const postDispatch = (headers: HeadersInit) => fetchWithTimeout(
        functionsUrl(cfg, 'player-call-push'),
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                workspaceId: cfg.workspaceId,
                callId,
                action,
                tournamentId: useRefereeAuth ? refereeTournamentId : undefined,
                refereePassword: useRefereeAuth ? refereePassword : undefined,
            }),
        },
        8000,
        { source: 'dispatchPlayerCallPush', kind: 'sync' }
    );

    if (useRefereeAuth) {
        const res = await postDispatch(buildAnonHeaders(cfg));
        if (!res.ok) throw new Error(await readErrorBody(res));
        return await res.json() as PlayerCallPushDispatchResult;
    }

    let session = await requireSupabaseWriteSession();
    let res = await postDispatch(buildHeaders(cfg, session.accessToken));
    if (!res.ok) {
        const body = await readErrorBody(res);
        if (isRejectedAdminEdgeSession(res.status, body)) {
            const retrySession = await recoverRejectedAdminWriteSession();
            if (retrySession?.accessToken) {
                session = retrySession;
                res = await postDispatch(buildHeaders(cfg, session.accessToken));
            } else {
                throw new Error(body);
            }
        } else {
            throw new Error(body);
        }
    }
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as PlayerCallPushDispatchResult;
};

export const pullAdminPlayerAccounts = async (origin?: string | null): Promise<AdminPlayerAccountCatalogRow[]> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const res = await fetchWithTimeout(rpcUrl(cfg, 'flbp_admin_list_player_accounts'), {
        method: 'POST',
        headers: buildHeaders(cfg, session.accessToken),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_origin: origin ? String(origin).trim().toLowerCase() : null,
        })
    }, 5000, { source: 'pullAdminPlayerAccounts', kind: 'admin' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as AdminPlayerAccountCatalogRow[];
};

export const pullAdminUserRoles = async (): Promise<AdminUserRoleRow[]> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const res = await fetchWithTimeout(
        functionsUrl(cfg, 'player-account-admin'),
        {
            method: 'POST',
            headers: buildHeaders(cfg, session.accessToken),
            body: JSON.stringify({
                action: 'list_admins',
                workspaceId: cfg.workspaceId,
            }),
        },
        8000,
        { source: 'pullAdminUserRoles', kind: 'admin' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const payload = await res.json() as { ok?: boolean; rows?: AdminUserRoleRow[] };
    return Array.isArray(payload?.rows) ? payload.rows : [];
};

export const submitPlayerAccountMergeRequest = async (input: {
    requesterEmail: string;
    requesterFirstName: string;
    requesterLastName: string;
    requesterBirthDate: string;
    requesterUserId?: string | null;
    requesterCanonicalPlayerId?: string | null;
    requesterCanonicalPlayerName?: string | null;
    candidatePlayerId: string;
    candidatePlayerName: string;
    candidateBirthDate?: string | null;
    comment?: string | null;
    accessToken?: string | null;
    workspaceId?: string | null;
}): Promise<PlayerAccountMergeRequestRow> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const safeAccessToken = String(input.accessToken || '').trim();
    const headers: Record<string, string> = {
        'apikey': cfg.anonKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (safeAccessToken) {
        headers.Authorization = `Bearer ${safeAccessToken}`;
    }
    const res = await fetchWithTimeout(
        functionsUrl(cfg, 'player-account-admin'),
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                action: 'submit_merge_request',
                workspaceId: String(input.workspaceId || cfg.workspaceId || '').trim() || cfg.workspaceId,
                requesterUserId: String(input.requesterUserId || '').trim() || null,
                requesterEmail: String(input.requesterEmail || '').trim(),
                requesterFirstName: String(input.requesterFirstName || '').trim(),
                requesterLastName: String(input.requesterLastName || '').trim(),
                requesterBirthDate: normalizeBirthDateInput(input.requesterBirthDate) || String(input.requesterBirthDate || '').trim(),
                requesterCanonicalPlayerId: String(input.requesterCanonicalPlayerId || '').trim() || null,
                requesterCanonicalPlayerName: String(input.requesterCanonicalPlayerName || '').trim() || null,
                candidatePlayerId: String(input.candidatePlayerId || '').trim(),
                candidatePlayerName: String(input.candidatePlayerName || '').trim(),
                candidateBirthDate: normalizeBirthDateInput(input.candidateBirthDate) || String(input.candidateBirthDate || '').trim() || null,
                comment: String(input.comment || '').trim() || null,
            }),
        },
        8000,
        { source: 'submitPlayerAccountMergeRequest', kind: 'sync' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const payload = await res.json() as { ok?: boolean; row?: PlayerAccountMergeRequestRow };
    if (!payload?.row) throw new Error('Richiesta merge non restituita dal backend.');
    return payload.row;
};

export const pullAdminPlayerAccountMergeRequests = async (
    status: PlayerAccountMergeRequestStatus | null = 'pending'
): Promise<PlayerAccountMergeRequestRow[]> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const res = await fetchWithTimeout(
        functionsUrl(cfg, 'player-account-admin'),
        {
            method: 'POST',
            headers: buildHeaders(cfg, session.accessToken),
            body: JSON.stringify({
                action: 'list_merge_requests',
                workspaceId: cfg.workspaceId,
                status: status ? String(status).trim() : null,
            }),
        },
        8000,
        { source: 'pullAdminPlayerAccountMergeRequests', kind: 'admin' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const payload = await res.json() as { ok?: boolean; rows?: PlayerAccountMergeRequestRow[] };
    return Array.isArray(payload?.rows) ? payload.rows : [];
};

export const setAdminPlayerAccountMergeRequestStatus = async (input: {
    requestId: string;
    status: Exclude<PlayerAccountMergeRequestStatus, 'pending'>;
    workspaceId?: string | null;
}): Promise<PlayerAccountMergeRequestRow> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const requestId = String(input.requestId || '').trim();
    const status = String(input.status || '').trim().toLowerCase();
    if (!requestId) throw new Error('Richiesta merge non valida.');
    if (status !== 'resolved' && status !== 'ignored') {
        throw new Error('Stato richiesta merge non valido.');
    }
    const res = await fetchWithTimeout(
        functionsUrl(cfg, 'player-account-admin'),
        {
            method: 'POST',
            headers: buildHeaders(cfg, session.accessToken),
            body: JSON.stringify({
                action: 'set_merge_request_status',
                workspaceId: String(input.workspaceId || cfg.workspaceId || '').trim() || cfg.workspaceId,
                requestId,
                status,
            }),
        },
        8000,
        { source: 'setAdminPlayerAccountMergeRequestStatus', kind: 'admin' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const payload = await res.json() as { ok?: boolean; row?: PlayerAccountMergeRequestRow };
    if (!payload?.row) throw new Error('Aggiornamento richiesta merge non restituito dal backend.');
    return payload.row;
};

export const pushAdminPlayerAppProfile = async (input: {
    userId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    canonicalPlayerId?: string | null;
    canonicalPlayerName?: string | null;
}): Promise<PlayerSupabaseProfileRow> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const payload = {
        workspace_id: cfg.workspaceId,
        user_id: String(input.userId || '').trim(),
        first_name: String(input.firstName || '').trim(),
        last_name: String(input.lastName || '').trim(),
        birth_date: String(input.birthDate || '').trim(),
        canonical_player_id: input.canonicalPlayerId ? String(input.canonicalPlayerId).trim() : null,
        canonical_player_name: input.canonicalPlayerName ? String(input.canonicalPlayerName).trim() : null,
    };
    if (!payload.user_id) throw new Error('Utente player non valido.');
    if (!payload.first_name || !payload.last_name || !payload.birth_date) {
        throw new Error('Profilo player non valido.');
    }
    const res = await fetchWithTimeout(
        restUrl(cfg, 'player_app_profiles?on_conflict=workspace_id,user_id&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at'),
        {
            method: 'POST',
            headers: {
                ...buildHeaders(cfg, session.accessToken),
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(payload)
        },
        5000,
        { source: 'pushAdminPlayerAppProfile', kind: 'admin' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows[0]) throw new Error('Profilo player live non restituito.');
    return rows[0] as PlayerSupabaseProfileRow;
};

export const deleteAdminPlayerAccount = async (input: {
    userId: string;
    workspaceId?: string | null;
}): Promise<{ ok: boolean; deletedUserId: string }> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const safeUserId = String(input.userId || '').trim();
    if (!safeUserId) throw new Error('Utente player non valido.');
    const res = await fetchWithTimeout(
        functionsUrl(cfg, 'player-account-admin'),
        {
            method: 'POST',
            headers: buildHeaders(cfg, session.accessToken),
            body: JSON.stringify({
                action: 'delete',
                userId: safeUserId,
                workspaceId: String(input.workspaceId || cfg.workspaceId || '').trim() || cfg.workspaceId,
            }),
        },
        8000,
        { source: 'deleteAdminPlayerAccount', kind: 'admin' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as { ok: boolean; deletedUserId: string };
};

const mutateAdminPlayerAccountRole = async (
    action: 'grant_admin' | 'revoke_admin',
    input: { userId: string; email?: string | null; workspaceId?: string | null }
): Promise<{ ok: boolean; userId: string; email?: string | null }> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const safeUserId = String(input.userId || '').trim();
    if (!safeUserId) throw new Error('Utente player non valido.');
    const res = await fetchWithTimeout(
        functionsUrl(cfg, 'player-account-admin'),
        {
            method: 'POST',
            headers: buildHeaders(cfg, session.accessToken),
            body: JSON.stringify({
                action,
                userId: safeUserId,
                email: String(input.email || '').trim() || null,
                workspaceId: String(input.workspaceId || cfg.workspaceId || '').trim() || cfg.workspaceId,
            }),
        },
        8000,
        { source: action === 'grant_admin' ? 'grantAdminPlayerAccount' : 'revokeAdminPlayerAccount', kind: 'admin' }
    );
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as { ok: boolean; userId: string; email?: string | null };
};

export const grantAdminPlayerAccount = async (input: {
    userId: string;
    email?: string | null;
    workspaceId?: string | null;
}) => mutateAdminPlayerAccountRole('grant_admin', input);

export const revokeAdminPlayerAccount = async (input: {
    userId: string;
    email?: string | null;
    workspaceId?: string | null;
}) => mutateAdminPlayerAccountRole('revoke_admin', input);

export const pullAdminPlayerCallTargets = async (canonicalPlayerIds: string[]): Promise<PlayerSupabaseProfileRow[]> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const safeIds = canonicalPlayerIds.map((value) => String(value || '').trim()).filter(Boolean);
    if (!safeIds.length) return [];
    const inClause = buildPostgrestInClause(safeIds);
    const url = restUrl(
        cfg,
        `player_app_profiles?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&canonical_player_id=in.(${inClause})&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at`
    );
    const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg, session.accessToken) }, 5000, {
        source: 'pullAdminPlayerCallTargets',
        kind: 'admin'
    });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as PlayerSupabaseProfileRow[];
};

export const pullAdminPlayerCalls = async (input: {
    tournamentId: string;
    teamId?: string | null;
    statuses?: Array<PlayerSupabaseCallRow['status']>;
}): Promise<PlayerSupabaseCallRow[]> => {
    const cfg = getSupabaseConfig();
    const session = await requireSupabaseWriteSession();
    if (!cfg) throw new Error('Supabase non configurato');
    const tournamentId = String(input.tournamentId || '').trim();
    if (!tournamentId) throw new Error('Torneo non valido.');
    let path =
        `player_app_calls?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}` +
        `&tournament_id=eq.${encodeURIComponent(tournamentId)}` +
        `&select=id,workspace_id,tournament_id,team_id,team_name,target_user_id,target_player_id,target_player_name,requested_by_user_id,status,requested_at,acknowledged_at,cancelled_at,metadata` +
        `&order=requested_at.desc`;
    const teamId = String(input.teamId || '').trim();
    if (teamId) {
        path += `&team_id=eq.${encodeURIComponent(teamId)}`;
    }
    const statuses = (input.statuses || []).map((value) => String(value || '').trim()).filter(Boolean);
    if (statuses.length) {
        path += `&status=in.(${buildPostgrestInClause(statuses)})`;
    }
    const res = await fetchWithTimeout(restUrl(cfg, path), { headers: buildHeaders(cfg, session.accessToken) }, 5000, {
        source: 'pullAdminPlayerCalls',
        kind: 'admin'
    });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as PlayerSupabaseCallRow[];
};

const getPlayerCallMetadataMatchId = (row: PlayerSupabaseCallRow): string => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
    return String(metadata.match_id || metadata.matchId || '').trim();
};

const cancelRefereePlayerAppCallsForMatch = async (input: {
    tournamentId: string;
    refereePassword: string;
    teamIds?: string[];
    matchId?: string | null;
}): Promise<PlayerSupabaseCallRow[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const tournamentId = String(input.tournamentId || '').trim();
    const refereePassword = String(input.refereePassword || '').trim();
    if (!tournamentId || !refereePassword) return [];
    const teamIds = (input.teamIds || []).map((value) => String(value || '').trim()).filter(Boolean);
    const matchId = String(input.matchId || '').trim();
    const res = await fetchWithTimeout(rpcUrl(cfg, 'flbp_referee_cancel_player_calls'), {
        method: 'POST',
        headers: buildAnonHeaders(cfg),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_tournament_id: tournamentId,
            p_referees_password: refereePassword,
            p_team_ids: teamIds.length ? teamIds : null,
            p_match_id: matchId || null,
        }),
    }, 4000, { source: 'cancelRefereePlayerAppCallsForMatch', kind: 'referee' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = await res.json();
    return Array.isArray(rows) ? rows as PlayerSupabaseCallRow[] : [];
};

export const cancelActivePlayerAppCallsForMatch = async (input: {
    tournamentId: string;
    teamIds?: string[];
    matchId?: string | null;
    dispatchPush?: boolean;
    refereePassword?: string | null;
}): Promise<PlayerSupabaseCallRow[]> => {
    const tournamentId = String(input.tournamentId || '').trim();
    if (!tournamentId) return [];
    const teamSet = new Set((input.teamIds || []).map((value) => String(value || '').trim()).filter(Boolean));
    const matchId = String(input.matchId || '').trim();
    const refereePassword = String(input.refereePassword || '').trim();
    if (refereePassword) {
        const cancelled = await cancelRefereePlayerAppCallsForMatch({
            tournamentId,
            refereePassword,
            teamIds: Array.from(teamSet),
            matchId,
        });
        if (input.dispatchPush !== false) {
            cancelled.forEach((row) => {
                void dispatchPlayerCallPush({
                    callId: row.id,
                    action: 'cancelled',
                    refereeTournamentId: tournamentId,
                    refereePassword,
                }).catch((pushError) => {
                    console.warn('FLBP referee silent call cancellation dispatch failed', pushError);
                });
            });
        }
        return cancelled;
    }
    const rows = await pullAdminPlayerCalls({ tournamentId, statuses: ['ringing', 'acknowledged'] });
    const targets = rows.filter((row) => {
        const teamId = String(row.team_id || '').trim();
        if (teamSet.size && !teamSet.has(teamId)) return false;
        if (!matchId) return true;
        const rowMatchId = getPlayerCallMetadataMatchId(row);
        return !rowMatchId || rowMatchId === matchId;
    });
    const cancelled: PlayerSupabaseCallRow[] = [];
    for (const row of targets) {
        try {
            await cancelPlayerAppCall(row.id);
            cancelled.push({ ...row, status: 'cancelled', cancelled_at: new Date().toISOString() });
            if (input.dispatchPush !== false) {
                void dispatchPlayerCallPush({ callId: row.id, action: 'cancelled' }).catch((pushError) => {
                    console.warn('FLBP silent call cancellation dispatch failed', pushError);
                });
            }
        } catch (error) {
            console.warn('FLBP active player call cancellation failed', error);
        }
    }
    return cancelled;
};

export interface SupabaseAdminAccessResult {
    ok: boolean;
    email?: string | null;
    userId?: string | null;
    reason?: string;
}

const resolveSessionUserId = (session: SupabaseSession | null): string | null => {
    const direct = String(session?.userId || '').trim();
    if (direct) return direct;
    const payload = decodeJwtPayload(session?.accessToken);
    const sub = String(payload?.sub || '').trim();
    return sub || null;
};

export const ensureSupabaseAdminAccess = async (): Promise<SupabaseAdminAccessResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) return { ok: false, reason: 'Supabase non configurato.' };

    const session = await ensureFreshSupabaseSession();
    if (!session?.accessToken) {
        return { ok: false, reason: 'Sessione admin assente o scaduta.' };
    }

    const userId = resolveSessionUserId(session);
    if (!userId) {
        return { ok: false, reason: 'Impossibile determinare l’utente autenticato.' };
    }

    let res: Response;
    try {
        res = await fetchWithTimeout(
            restUrl(cfg, `admin_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email&limit=1`),
            { headers: buildHeaders(cfg, session.accessToken) },
            5000,
            { source: 'ensureSupabaseAdminAccess', kind: 'admin' }
        );
    } catch (error: any) {
        return {
            ok: false,
            reason: normalizeFetchFailure(error, 'Timeout verifica admin_users. Controlla RLS/progetto Supabase e riprova.').message,
            userId,
            email: session.email || null
        };
    }

    if (!res.ok) {
        return { ok: false, reason: await readErrorBody(res), userId, email: session.email || null };
    }

    const rows = (await res.json()) as Array<{ user_id?: string; email?: string | null }>;
    const hit = rows?.[0];
    if (!hit?.user_id) {
        return {
            ok: false,
            userId,
            email: session.email || null,
            reason: 'Questo account autenticato non ha ruolo admin in Supabase.'
        };
    }

    const nextSession: SupabaseSession = {
        ...session,
        userId,
        email: hit.email || session.email || null
    };
    if (!sameSupabaseSession(session, nextSession)) {
        setSupabaseSession(nextSession);
    }

    return {
        ok: true,
        userId,
        email: hit.email || session.email || null
    };
};

export const testSupabaseConnection = async (): Promise<{ ok: boolean; message: string }> => {
    const cfg = getSupabaseConfig();
    if (!cfg) return { ok: false, message: 'Supabase non configurato (mancano VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' };
    await ensureFreshAuthForSupabaseOps();

    // Lightweight check: query workspace_state (created by our migration)
    const url = restUrl(cfg, `workspace_state?select=workspace_id&limit=1`);
    try {
        const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg) }, 3000, { source: 'testSupabaseConnection', kind: 'admin' });
        if (!res.ok) {
            const body = await readErrorBody(res);
            return { ok: false, message: `Errore Supabase: ${body}` };
        }
        return { ok: true, message: 'Connessione OK (workspace_state raggiungibile).' };
    } catch (e: any) {
        return { ok: false, message: `Errore rete: ${e?.message || String(e)}` };
    }
};

// -----------------------------
// DB health checks (Admin tool)
// -----------------------------

export type DbHealthSeverity = 'info' | 'warn' | 'error';

export interface DbHealthCheckItem {
    name: string;
    ok: boolean;
    severity: DbHealthSeverity;
    message: string;
}

export interface DbHealthCheckResult {
    ok: boolean;
    checks: DbHealthCheckItem[];
}

type DbHealthWorkspaceProbe = {
    ok: boolean;
    state?: any | null;
    updatedAt?: string | null;
    message: string;
};

type DbHealthCountProbe = {
    ok: boolean;
    count?: number | null;
    message: string;
};

type DbHealthStateSummary = {
    tournaments: number;
    hallOfFame: number;
    integrationsScorers: number;
    liveTournamentId: string | null;
};

const compactHealthMessage = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const parsePostgrestExactCount = (contentRange: string | null): number | null => {
    const raw = String(contentRange || '').trim();
    const slash = raw.lastIndexOf('/');
    if (slash < 0) return null;
    const tail = raw.slice(slash + 1).trim();
    if (!tail || tail === '*') return null;
    const n = Number(tail);
    return Number.isFinite(n) ? n : null;
};

const summarizeHealthState = (state: any): DbHealthStateSummary => {
    const tournamentHistory = Array.isArray(state?.tournamentHistory) ? state.tournamentHistory : [];
    const liveTournament = state?.tournament && typeof state.tournament === 'object' ? state.tournament : null;
    return {
        tournaments: tournamentHistory.length + (liveTournament ? 1 : 0),
        hallOfFame: Array.isArray(state?.hallOfFame) ? state.hallOfFame.length : 0,
        integrationsScorers: Array.isArray(state?.integrationsScorers) ? state.integrationsScorers.length : 0,
        liveTournamentId: liveTournament?.id ? String(liveTournament.id) : null,
    };
};

const readDbHealthWorkspaceProbe = async (
    cfg: SupabaseConfig,
    table: 'workspace_state' | 'public_workspace_state',
    headers: Record<string, string>,
    source: string
): Promise<DbHealthWorkspaceProbe> => {
    try {
        const res = await fetchWithDevRequestPerf(
            restUrl(cfg, `${table}?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=state,updated_at&limit=1`),
            { headers },
            { source, kind: 'admin' }
        );
        if (!res.ok) return { ok: false, message: compactHealthMessage(await readErrorBody(res)) };
        const rows = (await res.json()) as Array<{ state?: any; updated_at?: string | null }>;
        const row = rows?.[0] || null;
        if (!row) return { ok: true, state: null, updatedAt: null, message: 'Tabella leggibile, nessuno snapshot per questo workspace.' };
        return { ok: true, state: row.state || null, updatedAt: row.updated_at || null, message: `Snapshot leggibile, updated_at=${row.updated_at || 'N/D'}.` };
    } catch (e: any) {
        return { ok: false, message: compactHealthMessage(e?.message || String(e)) };
    }
};

const readDbHealthTableCount = async (
    cfg: SupabaseConfig,
    table: string,
    headers: Record<string, string>,
    source: string
): Promise<DbHealthCountProbe> => {
    try {
        const res = await fetchWithDevRequestPerf(
            restUrl(cfg, `${table}?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id&limit=1`),
            {
                headers: {
                    ...headers,
                    Prefer: 'count=exact',
                    Range: '0-0',
                },
            },
            { source, kind: 'admin' }
        );
        if (!res.ok) return { ok: false, count: null, message: compactHealthMessage(await readErrorBody(res)) };
        const count = parsePostgrestExactCount(res.headers.get('content-range'));
        return {
            ok: true,
            count,
            message: count === null ? 'Tabella leggibile; conteggio exact non disponibile.' : `${count} righe.`,
        };
    } catch (e: any) {
        return { ok: false, count: null, message: compactHealthMessage(e?.message || String(e)) };
    }
};

const addDbHealthComparison = (
    checks: DbHealthCheckItem[],
    name: string,
    leftLabel: string,
    leftValue: number | string | null | undefined,
    rightLabel: string,
    rightValue: number | string | null | undefined
) => {
    if (leftValue === undefined || rightValue === undefined) {
        checks.push({
            name,
            ok: true,
            severity: 'info',
            message: `Confronto non disponibile: ${leftLabel}=${leftValue ?? 'N/D'}, ${rightLabel}=${rightValue ?? 'N/D'}.`,
        });
        return;
    }
    const ok = String(leftValue ?? '') === String(rightValue ?? '');
    checks.push({
        name,
        ok,
        severity: ok ? 'info' : 'warn',
        message: ok
            ? `Allineato: ${leftLabel}=${leftValue ?? 'N/D'} e ${rightLabel}=${rightValue ?? 'N/D'}.`
            : `Possibile disallineamento: ${leftLabel}=${leftValue ?? 'N/D'}, ${rightLabel}=${rightValue ?? 'N/D'}.`,
    });
};

const addDbHealthCountComparison = (
    checks: DbHealthCheckItem[],
    name: string,
    leftLabel: string,
    leftCount: number | null | undefined,
    rightLabel: string,
    rightCount: number | null | undefined
) => {
    if (leftCount === null || rightCount === null || leftCount === undefined || rightCount === undefined) {
        checks.push({
            name,
            ok: true,
            severity: 'info',
            message: `Conteggio non confrontabile: ${leftLabel}=${leftCount ?? 'N/D'}, ${rightLabel}=${rightCount ?? 'N/D'}.`,
        });
        return;
    }
    addDbHealthComparison(checks, name, leftLabel, leftCount, rightLabel, rightCount);
};

const probeAdminSnapshotRpc = async (cfg: SupabaseConfig): Promise<DbHealthCheckItem> => {
    const rpcName = 'flbp_admin_push_workspace_state';
    try {
        const res = await fetchWithDevRequestPerf(rpcUrl(cfg, rpcName), {
            method: 'POST',
            headers: buildHeaders(cfg),
            // No-op probe: the RPC validates workspace_id before any write.
            body: JSON.stringify({
                p_workspace_id: '',
                p_state: {},
                p_public_state: {},
                p_base_updated_at: null,
                p_force: false,
            }),
        }, { source: 'runDbHealthChecks.adminSnapshotRpc', kind: 'admin' });
        if (res.ok) {
            return { name: `RPC: ${rpcName}`, ok: true, severity: 'info', message: 'RPC raggiungibile; probe no-op completato senza scritture attese.' };
        }
        const body = await readErrorBody(res);
        if (isMissingRpcFunctionError(body, rpcName)) {
            return { name: `RPC: ${rpcName}`, ok: false, severity: 'warn', message: compactHealthMessage(body) };
        }
        return {
            name: `RPC: ${rpcName}`,
            ok: true,
            severity: 'info',
            message: `RPC presente; probe no-op fermato dalla validazione: ${compactHealthMessage(body).slice(0, 220)}`,
        };
    } catch (e: any) {
        return { name: `RPC: ${rpcName}`, ok: false, severity: 'warn', message: compactHealthMessage(e?.message || String(e)) };
    }
};

type DbHealthAccessMode = 'anon' | 'admin';

type DbHealthTableRequirement = {
    flow: string;
    table: string;
    columns: string[];
    access: DbHealthAccessMode;
    severity?: DbHealthSeverity;
};

type DbHealthRpcRequirement = {
    flow: string;
    name: string;
    access: DbHealthAccessMode;
    body: Record<string, Json>;
    severity?: DbHealthSeverity;
};

const DB_SCHEMA_TABLE_REQUIREMENTS: DbHealthTableRequirement[] = [
    { flow: 'Admin snapshot', table: 'workspace_state', access: 'admin', columns: ['workspace_id', 'state', 'updated_at'] },
    { flow: 'Admin snapshot', table: 'public_workspace_state', access: 'anon', columns: ['workspace_id', 'state', 'updated_at'] },
    { flow: 'Admin snapshot', table: 'admin_users', access: 'admin', columns: ['user_id', 'email'] },

    { flow: 'Public read', table: 'public_tournaments', access: 'anon', columns: ['workspace_id', 'id', 'name', 'start_date', 'type', 'config', 'is_manual', 'status', 'updated_at'] },
    { flow: 'Public read', table: 'public_tournament_teams', access: 'anon', columns: ['workspace_id', 'tournament_id', 'id', 'name', 'player1', 'player2', 'player1_is_referee', 'player2_is_referee', 'is_referee', 'created_at'] },
    { flow: 'Public read', table: 'public_tournament_groups', access: 'anon', columns: ['workspace_id', 'tournament_id', 'id', 'name', 'order_index'] },
    { flow: 'Public read', table: 'public_tournament_group_teams', access: 'anon', columns: ['workspace_id', 'tournament_id', 'group_id', 'team_id', 'seed'] },
    { flow: 'Public read', table: 'public_tournament_matches', access: 'anon', columns: ['workspace_id', 'tournament_id', 'id', 'code', 'phase', 'group_name', 'round', 'round_name', 'order_index', 'team_a_id', 'team_b_id', 'score_a', 'score_b', 'played', 'status', 'is_bye', 'hidden'] },
    { flow: 'Public read', table: 'public_tournament_match_stats', access: 'anon', columns: ['workspace_id', 'tournament_id', 'match_id', 'team_id', 'player_name', 'canestri', 'soffi'] },
    { flow: 'Public read', table: 'public_hall_of_fame_entries', access: 'anon', columns: ['workspace_id', 'id', 'year', 'tournament_id', 'tournament_name', 'type', 'team_name', 'player_names', 'value', 'created_at'] },
    { flow: 'Public read', table: 'public_career_leaderboard', access: 'anon', columns: ['workspace_id', 'id', 'name', 'team_name', 'games_played', 'points', 'soffi', 'avg_points', 'avg_soffi', 'u25', 'yob_label'] },

    { flow: 'Referee pull/push', table: 'referee_auth_audit', access: 'admin', columns: ['id', 'workspace_id', 'tournament_id', 'action', 'ok', 'reason', 'auth_version', 'created_at'] },

    { flow: 'Player accounts/calls', table: 'player_app_profiles', access: 'admin', columns: ['workspace_id', 'user_id', 'first_name', 'last_name', 'birth_date', 'canonical_player_id', 'canonical_player_name', 'created_at', 'updated_at'] },
    { flow: 'Player accounts/calls', table: 'player_app_devices', access: 'admin', columns: ['id', 'workspace_id', 'user_id', 'platform', 'device_token', 'push_enabled', 'created_at', 'updated_at'] },
    { flow: 'Player accounts/calls', table: 'player_app_calls', access: 'admin', columns: ['id', 'workspace_id', 'tournament_id', 'team_id', 'team_name', 'target_user_id', 'target_player_id', 'target_player_name', 'requested_by_user_id', 'status', 'requested_at', 'acknowledged_at', 'cancelled_at', 'metadata'] },
    { flow: 'Player accounts/calls', table: 'player_account_merge_requests', access: 'admin', columns: ['id', 'workspace_id', 'requester_user_id', 'requester_email', 'requester_first_name', 'requester_last_name', 'requester_birth_date', 'candidate_player_id', 'candidate_player_name', 'status', 'created_at', 'updated_at'] },
];

const DB_SCHEMA_RPC_REQUIREMENTS: DbHealthRpcRequirement[] = [
    {
        flow: 'Referee pull/push',
        name: 'flbp_referee_auth_check',
        access: 'anon',
        body: { p_workspace_id: '', p_tournament_id: '', p_referees_password: '' },
    },
    {
        flow: 'Referee pull/push',
        name: 'flbp_referee_pull_live_state',
        access: 'anon',
        body: { p_workspace_id: '', p_tournament_id: '', p_referees_password: '' },
    },
    {
        flow: 'Referee pull/push',
        name: 'flbp_referee_push_live_state',
        access: 'anon',
        body: { p_workspace_id: '', p_tournament_id: '', p_referees_password: '', p_state: {}, p_public_state: {}, p_base_updated_at: null },
    },
    {
        flow: 'Referee pull/push',
        name: 'flbp_referee_cancel_player_calls',
        access: 'anon',
        body: { p_workspace_id: '', p_tournament_id: '', p_referees_password: '', p_team_ids: [], p_match_id: null },
    },
    {
        flow: 'Player accounts/calls',
        name: 'flbp_player_call_team',
        access: 'admin',
        body: { p_workspace_id: '', p_tournament_id: '', p_team_id: '', p_team_name: null, p_target_user_id: null, p_target_player_id: null, p_target_player_name: null, p_match_id: null },
    },
    {
        flow: 'Player accounts/calls',
        name: 'flbp_player_ack_call',
        access: 'admin',
        body: { p_workspace_id: '', p_call_id: '' },
    },
    {
        flow: 'Player accounts/calls',
        name: 'flbp_player_cancel_call',
        access: 'admin',
        body: { p_workspace_id: '', p_call_id: '' },
    },
    {
        flow: 'Player accounts/calls',
        name: 'flbp_player_expire_stale_calls',
        access: 'admin',
        body: { p_workspace_id: '', p_cutoff: null },
    },
    {
        flow: 'Player accounts/calls',
        name: 'flbp_admin_list_player_accounts',
        access: 'admin',
        body: { p_workspace_id: '', p_origin: null },
    },
];

const DB_EXPECTED_EDGE_FUNCTIONS = [
    { flow: 'Player accounts/calls', name: 'player-call-push', purpose: 'dispatch push FCM/APNs per convocazioni squadra' },
    { flow: 'Player accounts/calls', name: 'player-account-admin', purpose: 'eliminazione protetta account giocatore da Admin' },
];

const dbHealthHeadersForAccess = (
    cfg: SupabaseConfig,
    access: DbHealthAccessMode,
    hasJwt: boolean
): Record<string, string> | null => {
    if (access === 'anon') return buildAnonHeaders(cfg);
    return hasJwt ? buildHeaders(cfg) : null;
};

const probeDbHealthTableRequirement = async (
    cfg: SupabaseConfig,
    requirement: DbHealthTableRequirement,
    hasJwt: boolean
): Promise<DbHealthCheckItem> => {
    const name = `Schema ${requirement.flow}: ${requirement.table}`;
    const headers = dbHealthHeadersForAccess(cfg, requirement.access, hasJwt);
    if (!headers) {
        return {
            name,
            ok: true,
            severity: 'info',
            message: 'Non verificabile dal frontend senza sessione admin: tabella protetta da RLS.',
        };
    }

    try {
        const select = requirement.columns.join(',');
        const res = await fetchWithDevRequestPerf(
            restUrl(cfg, `${requirement.table}?select=${select}&limit=1`),
            { headers },
            { source: `runDbHealthChecks.schema.${requirement.table}`, kind: 'admin' }
        );
        if (!res.ok) {
            const body = compactHealthMessage(await readErrorBody(res));
            return {
                name,
                ok: false,
                severity: requirement.severity || 'warn',
                message: `Tabella o colonna minima mancante/non leggibile: ${body}`,
            };
        }
        return {
            name,
            ok: true,
            severity: 'info',
            message: `OK: tabella leggibile e colonne minime presenti (${requirement.columns.join(', ')}).`,
        };
    } catch (e: any) {
        return {
            name,
            ok: false,
            severity: requirement.severity || 'warn',
            message: compactHealthMessage(e?.message || String(e)),
        };
    }
};

const probeDbHealthRpcRequirement = async (
    cfg: SupabaseConfig,
    requirement: DbHealthRpcRequirement,
    hasJwt: boolean
): Promise<DbHealthCheckItem> => {
    const name = `RPC ${requirement.flow}: ${requirement.name}`;
    const headers = dbHealthHeadersForAccess(cfg, requirement.access, hasJwt);
    if (!headers) {
        return {
            name,
            ok: true,
            severity: 'info',
            message: 'Non verificabile dal frontend senza sessione admin: RPC protetta o riservata ad utenti autenticati.',
        };
    }

    try {
        const res = await fetchWithDevRequestPerf(rpcUrl(cfg, requirement.name), {
            method: 'POST',
            headers,
            // Safe probe: invalid/empty identifiers should stop inside validation before writes.
            body: JSON.stringify(requirement.body),
        }, { source: `runDbHealthChecks.rpc.${requirement.name}`, kind: 'admin' });

        if (res.ok) {
            return { name, ok: true, severity: 'info', message: 'RPC raggiungibile; probe no-op completato.' };
        }

        const body = compactHealthMessage(await readErrorBody(res));
        if (isMissingRpcFunctionError(body, requirement.name)) {
            return {
                name,
                ok: false,
                severity: requirement.severity || 'warn',
                message: `RPC mancante o firma non allineata al repo: ${body}`,
            };
        }

        return {
            name,
            ok: true,
            severity: 'info',
            message: `RPC presente; probe no-op fermato da validazione/autorizzazione: ${body.slice(0, 240)}`,
        };
    } catch (e: any) {
        return {
            name,
            ok: false,
            severity: requirement.severity || 'warn',
            message: compactHealthMessage(e?.message || String(e)),
        };
    }
};

const appendDbHealthEdgeFunctionNotes = (checks: DbHealthCheckItem[]) => {
    for (const fn of DB_EXPECTED_EDGE_FUNCTIONS) {
        checks.push({
            name: `Edge Function ${fn.flow}: ${fn.name}`,
            ok: true,
            severity: 'info',
            message: `Attesa dal repo per ${fn.purpose}; non verificabile in modo affidabile dal frontend senza invocare la funzione e senza conoscere secret/runtime Supabase.`,
        });
    }
};

const appendDbHealthSchemaRequirementChecks = async (
    checks: DbHealthCheckItem[],
    cfg: SupabaseConfig,
    hasJwt: boolean
) => {
    checks.push({
        name: 'Prerequisiti repo/Supabase',
        ok: true,
        severity: 'info',
        message: 'Controllo additivo: verifica best-effort di tabelle, colonne e RPC richieste dai flussi admin snapshot, public read, referee e player accounts/calls. Non blocca alcuna operazione.',
    });

    for (const requirement of DB_SCHEMA_TABLE_REQUIREMENTS) {
        checks.push(await probeDbHealthTableRequirement(cfg, requirement, hasJwt));
    }

    for (const requirement of DB_SCHEMA_RPC_REQUIREMENTS) {
        checks.push(await probeDbHealthRpcRequirement(cfg, requirement, hasJwt));
    }

    appendDbHealthEdgeFunctionNotes(checks);
};

export const runDbHealthChecks = async (): Promise<DbHealthCheckResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) {
        return {
            ok: false,
            checks: [{ name: 'Config', ok: false, severity: 'error', message: 'Supabase non configurato (mancano VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' }]
        };
    }

    const checks: DbHealthCheckItem[] = [];

    const workspaceEnc = encodeURIComponent(cfg.workspaceId);
    const hasJwt = !!getSupabaseAccessToken();
    if (hasJwt) await ensureFreshAuthForSupabaseOps();

    const publicWorkspaceProbe = await readDbHealthWorkspaceProbe(cfg, 'public_workspace_state', buildAnonHeaders(cfg), 'runDbHealthChecks.publicWorkspaceSnapshot');
    let adminWorkspaceProbe: DbHealthWorkspaceProbe | null = null;

    // 1) REST reachable (anon)
    try {
        const res = await fetchWithDevRequestPerf(restUrl(cfg, `public_workspace_state?workspace_id=eq.${workspaceEnc}&select=workspace_id&limit=1`), {
            headers: buildAnonHeaders(cfg)
        }, { source: 'runDbHealthChecks.publicWorkspace', kind: 'admin' });
        if (res.ok) checks.push({ name: 'REST / public', ok: true, severity: 'info', message: 'Endpoint REST raggiungibile e public_workspace_state leggibile (anon).' });
        else checks.push({ name: 'REST / public', ok: false, severity: 'error', message: await readErrorBody(res) });
    } catch (e: any) {
        checks.push({ name: 'REST / public', ok: false, severity: 'error', message: e?.message || String(e) });
    }

    // 2) Public tables existence (anon)
    const publicTables = [
        'public_tournaments',
        'public_tournament_teams',
        'public_tournament_groups',
        'public_tournament_group_teams',
        'public_tournament_matches',
        'public_tournament_match_stats',
        'public_hall_of_fame_entries',
        'public_career_leaderboard'
    ];
    for (const t of publicTables) {
        try {
            const res = await fetchWithDevRequestPerf(restUrl(cfg, `${t}?workspace_id=eq.${workspaceEnc}&select=workspace_id&limit=1`), {
                headers: buildAnonHeaders(cfg)
            }, { source: 'runDbHealthChecks.publicTable', kind: 'admin' });
            if (res.ok) checks.push({ name: `Public table: ${t}`, ok: true, severity: 'info', message: 'OK' });
            else checks.push({ name: `Public table: ${t}`, ok: false, severity: 'warn', message: await readErrorBody(res) });
        } catch (e: any) {
            checks.push({ name: `Public table: ${t}`, ok: false, severity: 'warn', message: e?.message || String(e) });
        }
    }

    checks.push({
        name: 'Snapshot pubblico',
        ok: publicWorkspaceProbe.ok,
        severity: publicWorkspaceProbe.ok ? 'info' : 'warn',
        message: publicWorkspaceProbe.message,
    });

    // 3) Admin/RLS check
    if (!hasJwt) {
        checks.push({
            name: 'Admin/RLS',
            ok: false,
            severity: 'warn',
            message: 'Nessun JWT admin presente: non posso verificare tabelle protette da RLS (workspace_state, tournaments, ...).'
        });
    } else {
        checks.push(await probeAdminSnapshotRpc(cfg));

        try {
            const res = await fetchWithDevRequestPerf(restUrl(cfg, `workspace_state?workspace_id=eq.${workspaceEnc}&select=updated_at&limit=1`), {
                headers: buildHeaders(cfg)
            }, { source: 'runDbHealthChecks.adminRls', kind: 'admin' });
            if (res.ok) checks.push({ name: 'Admin/RLS', ok: true, severity: 'info', message: 'OK: accesso admin a workspace_state.' });
            else checks.push({ name: 'Admin/RLS', ok: false, severity: 'error', message: await readErrorBody(res) });
        } catch (e: any) {
            checks.push({ name: 'Admin/RLS', ok: false, severity: 'error', message: e?.message || String(e) });
        }

        // 4) BYE invariants (admin)
        try {
            const res = await fetchWithDevRequestPerf(
                restUrl(cfg, `tournament_matches?workspace_id=eq.${workspaceEnc}&is_bye=eq.true&hidden=eq.false&select=id,code&limit=5`),
                { headers: buildHeaders(cfg) },
                { source: 'runDbHealthChecks.byeVisibility', kind: 'admin' }
            );
            if (!res.ok) {
                checks.push({ name: 'BYE invisibili', ok: false, severity: 'warn', message: await readErrorBody(res) });
            } else {
                const rows = (await res.json()) as any[];
                if (!rows.length) {
                    checks.push({ name: 'BYE invisibili', ok: true, severity: 'info', message: 'OK: nessun match BYE visibile (is_bye=true e hidden=false).' });
                } else {
                    const sample = rows.map(r => r.code || r.id).slice(0, 3).join(', ');
                    checks.push({ name: 'BYE invisibili', ok: false, severity: 'warn', message: `Trovati match BYE non nascosti (esempi: ${sample}).` });
                }
            }
        } catch (e: any) {
            checks.push({ name: 'BYE invisibili', ok: false, severity: 'warn', message: e?.message || String(e) });
        }

        adminWorkspaceProbe = await readDbHealthWorkspaceProbe(cfg, 'workspace_state', buildHeaders(cfg), 'runDbHealthChecks.adminWorkspaceSnapshot');
        checks.push({
            name: 'Snapshot admin',
            ok: adminWorkspaceProbe.ok,
            severity: adminWorkspaceProbe.ok ? 'info' : 'warn',
            message: adminWorkspaceProbe.message,
        });

        if (adminWorkspaceProbe.ok && publicWorkspaceProbe.ok) {
            addDbHealthComparison(
                checks,
                'Snapshot admin/public: updated_at',
                'workspace_state',
                adminWorkspaceProbe.updatedAt || null,
                'public_workspace_state',
                publicWorkspaceProbe.updatedAt || null
            );

            if (adminWorkspaceProbe.state && publicWorkspaceProbe.state) {
                const adminSummary = summarizeHealthState(adminWorkspaceProbe.state);
                const publicSummary = summarizeHealthState(publicWorkspaceProbe.state);
                addDbHealthCountComparison(checks, 'Snapshot admin/public: tornei', 'admin', adminSummary.tournaments, 'public', publicSummary.tournaments);
                addDbHealthCountComparison(checks, 'Snapshot admin/public: albo d\'oro', 'admin', adminSummary.hallOfFame, 'public', publicSummary.hallOfFame);
                addDbHealthCountComparison(checks, 'Snapshot admin/public: marcatori integrati', 'admin', adminSummary.integrationsScorers, 'public', publicSummary.integrationsScorers);
                addDbHealthComparison(checks, 'Snapshot admin/public: torneo live', 'admin', adminSummary.liveTournamentId, 'public', publicSummary.liveTournamentId);
            }
        }

        const mirrorPairs: Array<[string, string, string]> = [
            ['tournaments', 'public_tournaments', 'tornei structured/public'],
            ['tournament_teams', 'public_tournament_teams', 'squadre structured/public'],
            ['tournament_groups', 'public_tournament_groups', 'gironi structured/public'],
            ['tournament_group_teams', 'public_tournament_group_teams', 'squadre nei gironi structured/public'],
            ['tournament_matches', 'public_tournament_matches', 'partite structured/public'],
            ['tournament_match_stats', 'public_tournament_match_stats', 'statistiche match structured/public'],
            ['hall_of_fame_entries', 'public_hall_of_fame_entries', 'albo d\'oro structured/public'],
        ];
        for (const [adminTable, publicTable, label] of mirrorPairs) {
            const adminCount = await readDbHealthTableCount(cfg, adminTable, buildHeaders(cfg), `runDbHealthChecks.count.${adminTable}`);
            const publicCount = await readDbHealthTableCount(cfg, publicTable, buildAnonHeaders(cfg), `runDbHealthChecks.count.${publicTable}`);
            checks.push({
                name: `Tabella admin: ${adminTable}`,
                ok: adminCount.ok,
                severity: adminCount.ok ? 'info' : 'warn',
                message: adminCount.message,
            });
            checks.push({
                name: `Tabella public: ${publicTable}`,
                ok: publicCount.ok,
                severity: publicCount.ok ? 'info' : 'warn',
                message: publicCount.message,
            });
            addDbHealthCountComparison(checks, `Mirror ${label}`, adminTable, adminCount.count, publicTable, publicCount.count);
        }
    }

    // Keep schema/rollout probes observational and isolated from the historical
    // health checks above. They must never change sync, auth or public read flow.
    await appendDbHealthSchemaRequirementChecks(checks, cfg, hasJwt);

    const ok = !checks.some(c => c.severity === 'error' && !c.ok);
    return { ok, checks };
};

export const pullWorkspaceState = async (perf?: RequestPerfHint): Promise<SupabaseWorkspaceStateRow | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const session = await requireSupabaseWriteSession();

    const url = restUrl(cfg, `workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id,state,updated_at&limit=1`);
    const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg, session.accessToken) }, 2500, { source: perf?.source || 'pullWorkspaceState', kind: perf?.kind || 'admin' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabaseWorkspaceStateRow[];
    return rows?.[0] || null;
};

export const pullWorkspaceStateUpdatedAt = async (perf?: RequestPerfHint): Promise<string | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const session = await requireSupabaseWriteSession();
    const url = restUrl(cfg, `workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=updated_at&limit=1`);
    const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg, session.accessToken) }, 2500, { source: perf?.source || 'pullWorkspaceStateUpdatedAt', kind: perf?.kind || 'admin' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as Array<{ updated_at?: string }>;
    return rows?.[0]?.updated_at || null;
};

export const pullPublicWorkspaceState = async (perf?: RequestPerfHint): Promise<SupabasePublicWorkspaceStateRow | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(cfg, `public_workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id,state,updated_at&limit=1`);
    const res = await fetchWithTimeout(url, { headers: buildAnonHeaders(cfg) }, 2500, { source: perf?.source || 'pullPublicWorkspaceState', kind: perf?.kind || 'polling' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicWorkspaceStateRow[];
    return rows?.[0] || null;
};

export const trackPublicSiteView = async (date?: string): Promise<{ ok: boolean; view_date?: string; views?: number } | null> => {
    const cfg = getSupabaseConfig();
    if (!cfg) return null;

    const res = await fetchWithDevRequestPerf(rpcUrl(cfg, 'flbp_track_site_view'), {
        method: 'POST',
        headers: buildAnonHeaders(cfg),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_view_date: date || null,
        })
    }, { source: 'trackPublicSiteView', kind: 'user' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as { ok: boolean; view_date?: string; views?: number };
};

export const pullPublicSiteViewsDailyRange = async (from: string, to: string): Promise<SupabasePublicSiteViewsDailyRow[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_site_views_daily?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}` +
            `&view_date=gte.${encodeURIComponent(from)}` +
            `&view_date=lte.${encodeURIComponent(to)}` +
            `&select=workspace_id,view_date,views,updated_at` +
            `&order=view_date.asc`
    );
    const res = await fetchWithTimeout(url, { headers: buildAnonHeaders(cfg) }, 3000);
    if (!res.ok) throw new Error(await readErrorBody(res));
    return (await res.json()) as SupabasePublicSiteViewsDailyRow[];
};

export const pullSupabaseUsageDailyRange = async (from: string, to: string): Promise<SupabaseTrafficUsageDailyRow[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    await ensureFreshAuthForSupabaseOps();

    const url = restUrl(
        cfg,
        `app_supabase_usage_daily?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}` +
            `&usage_date=gte.${encodeURIComponent(from)}` +
            `&usage_date=lte.${encodeURIComponent(to)}` +
            `&select=workspace_id,usage_date,bucket,request_count,request_bytes,response_bytes,updated_at` +
            `&order=usage_date.asc,bucket.asc`
    );
    const res = await fetchWithTimeout(url, { headers: buildHeaders(cfg) }, 4000, { source: 'pullSupabaseUsageDailyRange', kind: 'admin' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return (await res.json()) as SupabaseTrafficUsageDailyRow[];
};

export const pullPublicCareerLeaderboard = async (perf?: RequestPerfHint): Promise<import('../types').PlayerStats[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_career_leaderboard?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,name,team_name,games_played,points,soffi,avg_points,avg_soffi,u25,yob_label`
    );
    const res = await fetchWithDevRequestPerf(url, { headers: buildAnonHeaders(cfg) }, { source: perf?.source || 'pullPublicCareerLeaderboard', kind: perf?.kind || 'user' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicCareerLeaderboardRow[];
    // Map to PlayerStats without exposing full YoB.
    return (rows || []).map(r => ({
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

export const pullPublicHallOfFameEntries = async (perf?: RequestPerfHint): Promise<import('../types').HallOfFameEntry[]> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const url = restUrl(
        cfg,
        `public_hall_of_fame_entries?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}` +
            `&select=id,year,tournament_id,tournament_name,type,team_name,player_names,value,created_at` +
            `&order=year.desc,created_at.desc`
    );

    const res = await fetchWithDevRequestPerf(url, { headers: buildAnonHeaders(cfg) }, { source: perf?.source || 'pullPublicHallOfFameEntries', kind: perf?.kind || 'user' });
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

// -----------------------------
// Public tournaments (safe read)
// -----------------------------

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
        // NOTE: "round_robin" can legitimately store 0 (no qualifiers).
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
    const res = await fetchWithDevRequestPerf(url, { headers: buildAnonHeaders(cfg) }, { source: perf?.source || 'pullPublicTournamentsList', kind: perf?.kind || 'polling' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicTournamentRow[];

    const liveRow = (rows || []).find(r => r.status === 'live') || null;
    const historyRows = (rows || []).filter(r => r.status !== 'live');

    return {
        liveTournament: liveRow ? mapPublicTournamentRowToData(liveRow, [], []) : null,
        history: historyRows.map(r => mapPublicTournamentRowToData(r, [], []))
    };
};

export const pullPublicTournamentBundle = async (tournamentId: string, perf?: RequestPerfHint): Promise<{ data: TournamentData; teams: Team[]; matches: Match[] } | null> => {
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

const sanitizeTeamForPublic = (t: any) => {
    if (!t || typeof t !== 'object') return t;
    const out = { ...t };
    delete (out as any).player1YoB;
    delete (out as any).player2YoB;
    delete (out as any).player1BirthDate;
    delete (out as any).player2BirthDate;
    return out;
};

const sanitizeTournamentForPublic = (t: any) => {
    if (!t || typeof t !== 'object') return t;
    const out: any = { ...t };
    delete out.refereesPassword;
    out.teams = (Array.isArray(out.teams) ? out.teams : []).map(sanitizeTeamForPublic);
    out.groups = (Array.isArray(out.groups) ? out.groups : []).map((g: any) => {
        const gg: any = { ...g };
        gg.teams = (Array.isArray(gg.teams) ? gg.teams : []).map(sanitizeTeamForPublic);
        return gg;
    });
    return out;
};

export const sanitizeAppStateForPublic = (state: AppState): Json => {
    const safe: any = { ...state };

    // Remove identity metadata from all team shapes (draft roster + tournaments)
    safe.teams = (Array.isArray(state.teams) ? state.teams : []).map(sanitizeTeamForPublic);
    safe.tournament = state.tournament ? sanitizeTournamentForPublic(state.tournament as any) : null;
    safe.tournamentHistory = (Array.isArray(state.tournamentHistory) ? state.tournamentHistory : []).map(sanitizeTournamentForPublic);

    // Remove sensitive fields from integrations scorers
    safe.integrationsScorers = (Array.isArray(state.integrationsScorers) ? state.integrationsScorers : []).map((s: any) => {
        const { yob, birthDate, ...rest } = s || {};
        return rest;
    });

    // Remove playerKey-based identifiers from Hall of Fame entries
    safe.hallOfFame = (Array.isArray(state.hallOfFame) ? state.hallOfFame : []).map((h: any) => {
        const { playerId, playerBirthDate, ...rest } = h || {};
        return rest;
    });

    // Alias mapping can embed YoB in keys; omit it entirely from public snapshots.
    delete safe.playerAliases;
    delete safe.playerAccountAliasIgnores;

    return safe;
};

const pushPublicWorkspaceStateInternal = async (cfg: SupabaseConfig, state: AppState): Promise<SupabasePublicWorkspaceStateRow> => {
    await ensureFreshAuthForSupabaseOps();
    const payload: SupabasePublicWorkspaceStateRow = {
        workspace_id: cfg.workspaceId,
        state: sanitizeAppStateForPublic(state),
        updated_at: new Date().toISOString()
    };

    const url = restUrl(cfg, 'public_workspace_state');
    const res = await fetchWithDevRequestPerf(url, {
        method: 'POST',
        headers: {
            ...buildHeaders(cfg),
            'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
    }, { source: 'pushPublicWorkspaceStateInternal', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    const rows = (await res.json()) as SupabasePublicWorkspaceStateRow[];
    return rows?.[0] || payload;
};

export const pushPublicWorkspaceState = async (state: AppState): Promise<SupabasePublicWorkspaceStateRow> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    await requireSupabaseWriteSession();
    return pushPublicWorkspaceStateInternal(cfg, state);
};

const rpcUrl = (cfg: SupabaseConfig, fnName: string) => restUrl(cfg, `rpc/${fnName}`);

type RefereeAuthCheckResult = {
    ok: boolean;
    reason?: string | null;
    auth_version?: string | null;
    updated_at?: string | null;
};

export type RefereePullLiveStateResult = {
    ok: boolean;
    reason?: string | null;
    auth_version?: string | null;
    updated_at?: string | null;
    state?: AppState | null;
};

type RefereePushStateResult = {
    ok: boolean;
    updated_at?: string | null;
    auth_version?: string | null;
};

type AdminPushWorkspaceStateResult = {
    ok: boolean;
    updated_at?: string | null;
};

const normalizeRpcConflictError = (message: string, updatedAt?: string | null) => {
    const msg = String(message || '');
    if (!msg.includes(FLBP_DB_CONFLICT_CODE)) return null;
    return makeConflictError(
        msg.replace(`${FLBP_DB_CONFLICT_CODE}:`, '').trim() || 'Conflitto DB rilevato durante il salvataggio arbitro.',
        { remoteUpdatedAt: updatedAt || null, remoteBaseUpdatedAt: getRemoteBaseUpdatedAt() }
    );
};

const parseSupabaseErrorPayload = (message: string): Record<string, any> | null => {
    try {
        const parsed = JSON.parse(String(message || ''));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const extractSupabaseErrorUpdatedAt = (message: string): string | null => {
    const payload = parseSupabaseErrorPayload(message);
    const fromDetailsObject = payload?.details?.updated_at;
    if (fromDetailsObject != null) return String(fromDetailsObject);
    if (typeof payload?.details === 'string') {
        try {
            const parsed = JSON.parse(payload.details);
            const fromDetailsString = parsed?.updated_at;
            if (fromDetailsString != null) return String(fromDetailsString);
        } catch {
            // ignore
        }
    }
    const raw = payload?.updated_at;
    return raw == null ? null : String(raw);
};

const isMissingRpcFunctionError = (message: string, fnName: string): boolean => {
    const payload = parseSupabaseErrorPayload(message);
    if (payload?.code === 'PGRST202') return true;
    const haystack = JSON.stringify(payload || message || '').toLowerCase();
    return haystack.includes(fnName.toLowerCase()) && haystack.includes('function');
};

export const verifyRefereePassword = async (tournamentId: string, refereePassword: string): Promise<RefereeAuthCheckResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const res = await fetchWithDevRequestPerf(rpcUrl(cfg, 'flbp_referee_auth_check'), {
        method: 'POST',
        headers: buildAnonHeaders(cfg),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_tournament_id: String(tournamentId || '').trim(),
            p_referees_password: String(refereePassword || '')
        })
    }, { source: 'verifyRefereePassword', kind: 'referee' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return await res.json() as RefereeAuthCheckResult;
};

export const pullRefereeLiveState = async (
    tournamentId: string,
    refereePassword: string
): Promise<RefereePullLiveStateResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    const rpcName = 'flbp_referee_pull_live_state';
    const res = await fetchWithDevRequestPerf(rpcUrl(cfg, rpcName), {
        method: 'POST',
        headers: buildAnonHeaders(cfg),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_tournament_id: String(tournamentId || '').trim(),
            p_referees_password: String(refereePassword || '')
        })
    }, { source: 'pullRefereeLiveState', kind: 'referee' });
    if (!res.ok) {
        const body = await readErrorBody(res);
        if (isMissingRpcFunctionError(body, rpcName)) {
            throw new Error('RPC flbp_referee_pull_live_state non disponibile su questo progetto Supabase.');
        }
        throw new Error(body);
    }
    const out = await res.json() as {
        ok?: boolean;
        reason?: string | null;
        auth_version?: string | null;
        updated_at?: string | null;
        state?: any;
    };
    const normalizedState = out?.ok && out?.state ? coerceAppState(out.state) : null;
    if (out?.ok && out?.updated_at) setRemoteBaseUpdatedAt(out.updated_at);
    return {
        ok: !!out?.ok,
        reason: out?.reason ?? null,
        auth_version: out?.auth_version ?? null,
        updated_at: out?.updated_at ?? null,
        state: normalizedState
    };
};

export const pushRefereeLiveState = async (
    state: AppState,
    opts: { tournamentId: string; refereePassword: string; baseUpdatedAt?: string | null }
): Promise<RefereePushStateResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    const res = await fetchWithDevRequestPerf(rpcUrl(cfg, 'flbp_referee_push_live_state'), {
        method: 'POST',
        headers: buildAnonHeaders(cfg),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_tournament_id: String(opts.tournamentId || '').trim(),
            p_referees_password: String(opts.refereePassword || ''),
            p_state: state,
            p_public_state: sanitizeAppStateForPublic(state),
            p_base_updated_at: opts.baseUpdatedAt || null
        })
    }, { source: 'pushRefereeLiveState', kind: 'referee' });
    if (!res.ok) {
        const body = await readErrorBody(res);
        const conflict = normalizeRpcConflictError(body);
        if (conflict) throw conflict;
        throw new Error(body);
    }
    const out = await res.json() as RefereePushStateResult;
    setRemoteBaseUpdatedAt(out.updated_at || null);
    return out;
};

// -----------------------------
// Multi-admin safety (conflict detection)
// -----------------------------

export const FLBP_DB_CONFLICT_CODE = 'FLBP_DB_CONFLICT';

const readLocalUpdatedAt = (): string | null => {
    try {
        const v = (localStorage.getItem('flbp_local_state_updated_at') || '').trim();
        return v ? v : null;
    } catch {
        return null;
    }
};

const makeConflictError = (message: string, meta?: { remoteUpdatedAt?: string | null; remoteBaseUpdatedAt?: string | null }) => {
    const e: any = new Error(message);
    e.code = FLBP_DB_CONFLICT_CODE;
    if (meta?.remoteUpdatedAt) e.remoteUpdatedAt = meta.remoteUpdatedAt;
    if (meta?.remoteBaseUpdatedAt) e.remoteBaseUpdatedAt = meta.remoteBaseUpdatedAt;
    return e;
};

export const pushWorkspaceState = async (state: AppState, opts?: { force?: boolean }, perf?: RequestPerfHint): Promise<SupabaseWorkspaceStateRow> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    await requireSupabaseWriteSession();
    const payload: SupabaseWorkspaceStateRow = {
        workspace_id: cfg.workspaceId,
        state,
        updated_at: new Date().toISOString()
    };

    const baseUpdatedAt = getRemoteBaseUpdatedAt();
    const publicState = sanitizeAppStateForPublic(state);
    const rpcName = 'flbp_admin_push_workspace_state';

    const res = await fetchWithDevRequestPerf(rpcUrl(cfg, rpcName), {
        method: 'POST',
        headers: buildHeaders(cfg),
        body: JSON.stringify({
            p_workspace_id: cfg.workspaceId,
            p_state: state,
            p_public_state: publicState,
            p_base_updated_at: baseUpdatedAt || null,
            p_force: !!opts?.force
        })
    }, { source: perf?.source || 'pushWorkspaceState', kind: perf?.kind || 'admin' });

    if (!res.ok) {
        const body = await readErrorBody(res);
        if (isMissingRpcFunctionError(body, rpcName)) {
            throw new Error(
                'Il progetto Supabase non espone ancora la RPC admin atomica per lo snapshot. ' +
                'Esegui `supabase/setup_all.sql` oppure la migration `20260326000200_admin_snapshot_write_rpc.sql`.'
            );
        }
        const conflictUpdatedAt = extractSupabaseErrorUpdatedAt(body);
        const conflict = normalizeRpcConflictError(body, conflictUpdatedAt || null);
        if (conflict) {
            let remoteUpdatedAt = conflictUpdatedAt || null;
            if (!remoteUpdatedAt) {
                try {
                    remoteUpdatedAt = await pullWorkspaceStateUpdatedAt({ source: 'pushWorkspaceState.conflictUpdatedAt', kind: 'admin' });
                } catch {
                    remoteUpdatedAt = null;
                }
            }
            const local = readLocalUpdatedAt();
            throw makeConflictError(
                'Conflitto: il DB è stato aggiornato da un altro admin dopo il tuo ultimo base snapshot.\n' +
                (remoteUpdatedAt ? `DB updated_at: ${remoteUpdatedAt}\n` : '') +
                (baseUpdatedAt ? `Base locale: ${baseUpdatedAt}\n` : '') +
                (local ? `Local updated_at: ${local}\n` : '') +
                'Scarica lo stato dal DB e applicalo, oppure abilita "Forza sovrascrittura" per sovrascrivere.',
                { remoteUpdatedAt, remoteBaseUpdatedAt: baseUpdatedAt || null }
            );
        }
        throw new Error(body);
    }

    const rpcOut = await res.json() as AdminPushWorkspaceStateResult;
    const out: SupabaseWorkspaceStateRow = {
        workspace_id: cfg.workspaceId,
        state,
        updated_at: rpcOut.updated_at || payload.updated_at
    };
    setRemoteBaseUpdatedAt(out.updated_at || payload.updated_at);
    return out;
};

// -----------------------------
// Normalized export (tables)
// -----------------------------

type RestRow = Record<string, any>;

const sha256Hex = async (input: string): Promise<string> => {
    try {
        const c = (globalThis as any)?.crypto;
        if (c?.subtle?.digest) {
            const enc = new TextEncoder();
            const buf = await c.subtle.digest('SHA-256', enc.encode(input));
            const bytes = Array.from(new Uint8Array(buf));
            return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch {
        // ignore
    }
    // Fallback: FNV-1a 32-bit (not cryptographic, but avoids exposing the raw key)
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
};

const buildPublicCareerLeaderboardRows = async (cfg: SupabaseConfig, state: AppState): Promise<RestRow[]> => {
    const playerMap: Record<string, { key: string; name: string; teamName: string; games: number; points: number; soffi: number }> = {};

    const identityInfoFromKey = (key: string): { label?: string; u25: boolean } => {
        const m = (key || '').match(/_(ND|\d{4}-\d{2}-\d{2})$/i);
        if (!m) return { label: undefined, u25: false };
        const raw = String(m[1]).toUpperCase();
        if (raw === 'ND') return { label: undefined, u25: false };
        const yob = deriveYoBFromBirthDate(raw);
        if (!yob) return { label: undefined, u25: false };
        const currentYear = new Date().getFullYear();
        return { label: String(yob).slice(-2), u25: (currentYear - yob) < 26 };
    };

    const initPlayer = (rawKey: string, name: string, teamName: string) => {
        const key = resolvePlayerKey(state, rawKey);
        const cur = playerMap[key];
        if (cur) {
            // Keep latest observed naming (useful if team changes between tournaments)
            cur.name = name || cur.name;
            cur.teamName = teamName || cur.teamName;
            return cur;
        }
        playerMap[key] = { key, name, teamName, games: 0, points: 0, soffi: 0 };
        return playerMap[key];
    };

    const processMatch = (m: any, teamsSource: any[]) => {
        if (!m?.played || !Array.isArray(m.stats)) return;
        for (const s of m.stats) {
            const team = teamsSource.find((tm: any) => tm.id === s.teamId);
            let birthDate: string | undefined;
            if (team) {
                if (team.player1 === s.playerName) birthDate = normalizeBirthDateInput(team.player1BirthDate);
                if (team.player2 === s.playerName) birthDate = normalizeBirthDateInput(team.player2BirthDate);
            }
            const rawKey = getPlayerKey(s.playerName, pickPlayerIdentityValue(birthDate));
            const p = initPlayer(rawKey, s.playerName, team?.name || s.teamId || '?');
            p.games += 1;
            p.points += (s.canestri || 0);
            p.soffi += (s.soffi || 0);
        }
    };

    // Legacy (if present)
    if (Array.isArray((state as any).matches) && Array.isArray((state as any).teams)) {
        (state as any).matches.forEach((m: any) => processMatch(m, (state as any).teams));
    }

    // Archived tournaments
    (state.tournamentHistory || []).forEach((t: any) => {
        if (t?.config?.resultsOnly) return;
        const teams = Array.isArray(t.teams) ? t.teams : [];
        const matches = (Array.isArray(t.matches) && t.matches.length)
            ? t.matches
            : (Array.isArray(t.rounds) ? (t.rounds || []).flat() : []);
        matches.forEach((m: any) => processMatch(m, teams));
    });

    // Live tournament
    if (state.tournament) {
        if (!state.tournament.config?.resultsOnly) {
            const liveTeams = Array.isArray(state.tournament.teams) && state.tournament.teams.length
                ? state.tournament.teams
                : (state.teams || []);
            (state.tournamentMatches || []).forEach((m: any) => processMatch(m, liveTeams));
        }
    }

    // External scorers (integrations)
    (state.integrationsScorers || []).forEach((e: any) => {
        const rawKey = getPlayerKey(e.name, pickPlayerIdentityValue(normalizeBirthDateInput(e.birthDate)));
        const p = initPlayer(rawKey, e.name, 'Integrazioni');
        p.games += (e.games || 0);
        p.points += (e.points || 0);
        p.soffi += (e.soffi || 0);
    });

    const players = Object.values(playerMap)
        .filter(p => p.games > 0 || p.points > 0 || p.soffi > 0)
        .map(p => {
            const info = identityInfoFromKey(p.key);
            return {
                key: p.key,
                name: p.name,
                teamName: p.teamName,
                games: p.games,
                points: p.points,
                soffi: p.soffi,
                avgPoints: p.games > 0 ? parseFloat((p.points / p.games).toFixed(2)) : 0,
                avgSoffi: p.games > 0 ? parseFloat((p.soffi / p.games).toFixed(2)) : 0,
                u25: info.u25,
                yobLabel: info.label || null
            };
        });

    const keyToHash = new Map<string, string>();
    await Promise.all(players.map(async (p) => {
        if (keyToHash.has(p.key)) return;
        const h = await sha256Hex(p.key);
        keyToHash.set(p.key, h);
    }));

    const now = new Date().toISOString();
    return players.map(p => ({
        workspace_id: cfg.workspaceId,
        id: keyToHash.get(p.key) || p.key,
        name: p.name,
        team_name: p.teamName,
        games_played: p.games,
        points: p.points,
        soffi: p.soffi,
        avg_points: p.avgPoints,
        avg_soffi: p.avgSoffi,
        u25: !!p.u25,
        yob_label: p.yobLabel,
        updated_at: now
    }));
};

const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

const ensureWorkspace = async (cfg: SupabaseConfig) => {
    await ensureFreshAuthForSupabaseOps();
    // Ensure workspaces row exists (id primary key)
    const url = restUrl(cfg, 'workspaces');
    const res = await fetchWithDevRequestPerf(url, {
        method: 'POST',
        headers: {
            ...buildHeaders(cfg),
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ id: cfg.workspaceId })
    }, { source: 'ensureWorkspace', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
};

const restDeleteWhere = async (cfg: SupabaseConfig, table: string, whereQuery: string) => {
    await ensureFreshAuthForSupabaseOps();
    const url = restUrl(cfg, `${table}?${whereQuery}`);
    const res = await fetchWithDevRequestPerf(url, { method: 'DELETE', headers: buildHeaders(cfg) }, { source: `restDeleteWhere:${table}`, kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
};

const dedupeRowsForConflict = (rows: RestRow[], onConflict?: string): RestRow[] => {
    if (!rows.length || !onConflict) return rows;
    const keys = String(onConflict)
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    if (!keys.length) return rows;

    const map = new Map<string, RestRow>();
    for (const row of rows) {
        const sig = JSON.stringify(keys.map((k) => row?.[k] ?? null));
        // Last row wins: safer for generated exports where later entries should override stale duplicates.
        map.set(sig, row);
    }
    return Array.from(map.values());
};

const restUpsertRows = async (cfg: SupabaseConfig, table: string, rows: RestRow[], onConflict?: string, chunkSize = 500) => {
    await ensureFreshAuthForSupabaseOps();
    const normalizedRows = dedupeRowsForConflict(rows, onConflict);
    if (!normalizedRows.length) return;
    const qp = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const url = restUrl(cfg, `${table}${qp}`);
    for (const part of chunk(normalizedRows, chunkSize)) {
        const res = await fetchWithDevRequestPerf(url, {
            method: 'POST',
            headers: {
                ...buildHeaders(cfg),
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(part)
        }, { source: `restUpsertRows:${table}`, kind: 'sync' });
        if (!res.ok) throw new Error(await readErrorBody(res));
    }
};

export interface NormalizedExportSummary {
    tournaments: number;
    teams: number;
    groups: number;
    groupTeams: number;
    matches: number;
    matchStats: number;
    hallOfFame: number;
    integrationsScorers: number;
    aliases: number;
    publicCareerPlayers: number;
}

export interface SimPoolSeedSummary {
    teamNames: number;
    people: number;
}

export interface NormalizedPullSummary {
    tournaments: number;
    teams: number;
    groups: number;
    groupTeams: number;
    matches: number;
    matchStats: number;
    hallOfFame: number;
    integrationsScorers: number;
    aliases: number;
}

export interface NormalizedPullResult {
    /** Reconstructed state from normalized tables (partial; does not include draft teams list). */
    state: AppState;
    summary: NormalizedPullSummary;
    /** Best-effort remote marker (e.g. max updated_at found). */
    remoteUpdatedAt?: string | null;
}

// NOTE: This is an explicit admin action. It overwrites normalized tables for the workspace.
export const pushNormalizedFromState = async (state: AppState, opts?: { force?: boolean }): Promise<NormalizedExportSummary> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    // Safety: keep snapshot updated too.
    await pushWorkspaceState(state, opts);
    await ensureWorkspace(cfg);

    // 1) Clear normalized workspace data (tournaments cascade to children).
    await restDeleteWhere(cfg, 'hall_of_fame_entries', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
    await restDeleteWhere(cfg, 'player_aliases', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
    await restDeleteWhere(cfg, 'integrations_scorers', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
    await restDeleteWhere(cfg, 'tournaments', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);

    // Public tables (safe read)
    try {
        await restDeleteWhere(cfg, 'public_career_leaderboard', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
        // Public tournaments bundle (safe read)
        await restDeleteWhere(cfg, 'public_tournaments', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
        // Public Hall of Fame (safe read)
        await restDeleteWhere(cfg, 'public_hall_of_fame_entries', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
    } catch {
        // ignore: table might not exist yet
    }

    // 2) Globals
    await restUpsertRows(cfg, 'app_settings', [{ workspace_id: cfg.workspaceId, logo: state.logo || '', updated_at: new Date().toISOString() }], 'workspace_id');

    const aliasesRows = Object.entries(state.playerAliases || {}).map(([from_key, to_key]) => ({
        workspace_id: cfg.workspaceId,
        from_key,
        to_key,
        created_at: new Date().toISOString()
    }));
    await restUpsertRows(cfg, 'player_aliases', aliasesRows, 'workspace_id,from_key');

    const scorersRows = (state.integrationsScorers || []).map(s => {
        const birthDate = normalizeBirthDateInput((s as any).birthDate);
        return {
            workspace_id: cfg.workspaceId,
            id: s.id,
            name: s.name,
            yob: deriveYoBFromBirthDate(birthDate) ?? s.yob ?? null,
            birth_date: birthDate ?? null,
            games: s.games ?? 0,
            points: s.points ?? 0,
            soffi: s.soffi ?? 0,
            source: (s as any).source ?? null,
            source_type: (s as any).sourceType ?? null,
            source_tournament_id: (s as any).sourceTournamentId ?? null,
            source_label: (s as any).sourceLabel ?? null,
            team_name: (s as any).teamName ?? null,
            created_at: new Date(((s as any).createdAt ?? Date.now())).toISOString()
        };
    });
    await restUpsertRows(cfg, 'integrations_scorers', scorersRows, 'id');

    const hofRows = (state.hallOfFame || []).map(h => {
        const playerBirthDate = normalizeBirthDateInput((h as any).playerBirthDate);
        const primaryPlayerName = Array.isArray(h.playerNames) ? String(h.playerNames[0] || '').trim() : '';
        const singlePlayerAward = Array.isArray(h.playerNames) && h.playerNames.length === 1;
        return {
            workspace_id: cfg.workspaceId,
            id: h.id,
            year: h.year,
            tournament_id: h.tournamentId,
            tournament_name: h.tournamentName,
            type: h.type,
            team_name: h.teamName ?? null,
            player_names: h.playerNames ?? [],
            value: h.value ?? null,
            player_id: singlePlayerAward && primaryPlayerName ? getPlayerKey(primaryPlayerName, pickPlayerIdentityValue(playerBirthDate)) : ((h as any).playerId ?? null),
            player_birth_date: playerBirthDate ?? null,
            source_type: (h as any).sourceType ?? null,
            source_tournament_id: (h as any).sourceTournamentId ?? null,
            source_tournament_name: (h as any).sourceTournamentName ?? null,
            source_match_id: (h as any).sourceMatchId ?? null,
            source_auto_generated: (h as any).sourceAutoGenerated ?? null,
            reassigned_from_player_id: (h as any).reassignedFromPlayerId ?? null,
            manually_edited: (h as any).manuallyEdited ?? null,
            created_at: new Date().toISOString()
        };
    });
    await restUpsertRows(cfg, 'hall_of_fame_entries', hofRows, 'id');

    // Public HoF mirror (sanitized: no playerId/internal keys)
    const publicHofRows = (state.hallOfFame || []).map(h => ({
        workspace_id: cfg.workspaceId,
        id: h.id,
        year: h.year,
        tournament_id: h.tournamentId,
        tournament_name: h.tournamentName,
        type: h.type,
        team_name: h.teamName ?? null,
        player_names: h.playerNames ?? [],
        value: h.value ?? null,
        source_type: (h as any).sourceType ?? null,
        source_tournament_id: (h as any).sourceTournamentId ?? null,
        source_tournament_name: (h as any).sourceTournamentName ?? null,
        source_auto_generated: (h as any).sourceAutoGenerated ?? null,
        manually_edited: (h as any).manuallyEdited ?? null,
        created_at: new Date().toISOString()
    }));

    // 3) Tournaments (archived + live)
    const tournaments: Array<{ t: any; status: 'live' | 'archived'; matches: any[] }> = [];
    (state.tournamentHistory || []).forEach((t) => tournaments.push({ t, status: 'archived', matches: (t.matches || []).length ? (t.matches || []) : (t.rounds || []).flat() }));
    if (state.tournament) {
        tournaments.push({ t: state.tournament, status: 'live', matches: state.tournamentMatches || [] });
    }

    const tournamentRows: RestRow[] = [];
    const teamRows: RestRow[] = [];
    const groupRows: RestRow[] = [];
    const groupTeamRows: RestRow[] = [];
    const matchRows: RestRow[] = [];
    const statRows: RestRow[] = [];

    // Public (sanitized) tournament bundles
    const publicTournamentRows: RestRow[] = [];
    const publicTeamRows: RestRow[] = [];
    const publicGroupRows: RestRow[] = [];
    const publicGroupTeamRows: RestRow[] = [];
    const publicMatchRows: RestRow[] = [];
    const publicStatRows: RestRow[] = [];

    for (const entry of tournaments) {
        const t = entry.t;
        const tid = t.id;
        const tournamentResultsOnly = !!t?.config?.resultsOnly;
        tournamentRows.push({
            workspace_id: cfg.workspaceId,
            id: tid,
            name: t.name,
            start_date: t.startDate,
            type: t.type,
            config: t.config || {},
            is_manual: !!t.isManual,
            status: entry.status,
            updated_at: new Date().toISOString()
        });

        // Public tournaments (sanitized: no YoB, no birthDate, no player keys)
        publicTournamentRows.push({
            workspace_id: cfg.workspaceId,
            id: tid,
            name: t.name,
            start_date: t.startDate,
            type: t.type,
            config: t.config || {},
            is_manual: !!t.isManual,
            status: entry.status,
            updated_at: new Date().toISOString()
        });

        const teams = (t.teams || []) as any[];
        teams.forEach((tm: any) => {
            const player1BirthDate = normalizeBirthDateInput(tm.player1BirthDate);
            const player2BirthDate = normalizeBirthDateInput(tm.player2BirthDate);
            teamRows.push({
                workspace_id: cfg.workspaceId,
                tournament_id: tid,
                id: tm.id,
                name: tm.name,
                player1: tm.player1,
                player2: tm.player2 ?? '',
                player1_yob: deriveYoBFromBirthDate(player1BirthDate) ?? tm.player1YoB ?? null,
                player1_birth_date: player1BirthDate ?? null,
                player2_yob: deriveYoBFromBirthDate(player2BirthDate) ?? tm.player2YoB ?? null,
                player2_birth_date: player2BirthDate ?? null,
                player1_is_referee: !!tm.player1IsReferee,
                player2_is_referee: !!tm.player2IsReferee,
                is_referee: !!tm.isReferee,
                created_at_ms: tm.createdAt ?? null
            });

            publicTeamRows.push({
                workspace_id: cfg.workspaceId,
                tournament_id: tid,
                id: tm.id,
                name: tm.name,
                player1: tm.player1,
                player2: tm.player2 ?? '',
                player1_is_referee: !!tm.player1IsReferee,
                player2_is_referee: !!tm.player2IsReferee,
                is_referee: !!tm.isReferee,
                created_at: tm.createdAt ? new Date(tm.createdAt).toISOString() : null
            });
        });

        const groups = (t.groups || []) as any[];
        groups
            .slice()
            .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'it', { sensitivity: 'base' }))
            .forEach((g: any, idx: number) => {
                groupRows.push({
                    workspace_id: cfg.workspaceId,
                    tournament_id: tid,
                    id: g.id,
                    name: g.name,
                    order_index: idx
                });

                publicGroupRows.push({
                    workspace_id: cfg.workspaceId,
                    tournament_id: tid,
                    id: g.id,
                    name: g.name,
                    order_index: idx
                });
                (g.teams || []).forEach((gt: any) => {
                    groupTeamRows.push({
                        workspace_id: cfg.workspaceId,
                        tournament_id: tid,
                        group_id: g.id,
                        team_id: gt.id
                    });

                    publicGroupTeamRows.push({
                        workspace_id: cfg.workspaceId,
                        tournament_id: tid,
                        group_id: g.id,
                        team_id: gt.id,
                        seed: null
                    });
                });
            });

        const teamById = new Map<string, any>(teams.map((x: any) => [x.id, x]));
        const matches = (entry.matches || []) as any[];

        matches.forEach((m: any) => {
            const phase = m.phase || (m.groupName ? 'groups' : 'bracket');
            const isBye = !!m.isBye || m.teamAId === 'BYE' || m.teamBId === 'BYE';
            const hidden = isBye ? true : !!m.hidden;
            matchRows.push({
                workspace_id: cfg.workspaceId,
                tournament_id: tid,
                id: m.id,
                code: m.code ?? null,
                phase,
                status: m.status,
                played: !!m.played,
                score_a: m.scoreA ?? 0,
                score_b: m.scoreB ?? 0,
                team_a_id: m.teamAId ?? null,
                team_b_id: m.teamBId ?? null,
                round: m.round ?? null,
                round_name: m.roundName ?? null,
                group_name: m.groupName ?? null,
                order_index: m.orderIndex ?? null,
                hidden,
                is_bye: isBye,
                updated_at: new Date().toISOString()
            });

            publicMatchRows.push({
                workspace_id: cfg.workspaceId,
                tournament_id: tid,
                id: m.id,
                code: m.code ?? null,
                phase,
                status: m.status,
                played: !!m.played,
                score_a: m.scoreA ?? 0,
                score_b: m.scoreB ?? 0,
                team_a_id: m.teamAId ?? null,
                team_b_id: m.teamBId ?? null,
                round: m.round ?? null,
                round_name: m.roundName ?? null,
                group_name: m.groupName ?? null,
                order_index: m.orderIndex ?? null,
                hidden,
                is_bye: isBye,
                updated_at: new Date().toISOString()
            });

            if (tournamentResultsOnly) return;

            (m.stats || []).forEach((s: any) => {
                const team = teamById.get(s.teamId);
                const birthDate = team
                    ? normalizeBirthDateInput(team.player1 === s.playerName ? team.player1BirthDate : team.player2BirthDate)
                    : undefined;
                const rawKey = getPlayerKey(s.playerName, pickPlayerIdentityValue(birthDate));
                const resolvedKey = resolvePlayerKey(state, rawKey);
                statRows.push({
                    workspace_id: cfg.workspaceId,
                    tournament_id: tid,
                    match_id: m.id,
                    team_id: s.teamId,
                    player_name: s.playerName,
                    canestri: s.canestri ?? 0,
                    soffi: s.soffi ?? 0,
                    player_key: resolvedKey
                });

                publicStatRows.push({
                    workspace_id: cfg.workspaceId,
                    tournament_id: tid,
                    match_id: m.id,
                    team_id: s.teamId,
                    player_name: s.playerName,
                    canestri: s.canestri ?? 0,
                    soffi: s.soffi ?? 0
                });
            });
        });
    }

    // Insert order matters due to FKs.
    await restUpsertRows(cfg, 'tournaments', tournamentRows, 'workspace_id,id');
    await restUpsertRows(cfg, 'tournament_teams', teamRows, 'workspace_id,tournament_id,id');
    await restUpsertRows(cfg, 'tournament_groups', groupRows, 'workspace_id,tournament_id,id');
    await restUpsertRows(cfg, 'tournament_group_teams', groupTeamRows, 'workspace_id,tournament_id,group_id,team_id');
    await restUpsertRows(cfg, 'tournament_matches', matchRows, 'workspace_id,tournament_id,id');
    await restUpsertRows(cfg, 'tournament_match_stats', statRows, 'workspace_id,tournament_id,match_id,team_id,player_name', 800);

    // 3b) Public tournaments (sanitized) - best effort
    try {
        await restUpsertRows(cfg, 'public_tournaments', publicTournamentRows, 'workspace_id,id');
        await restUpsertRows(cfg, 'public_tournament_teams', publicTeamRows, 'workspace_id,tournament_id,id');
        await restUpsertRows(cfg, 'public_tournament_groups', publicGroupRows, 'workspace_id,tournament_id,id');
        await restUpsertRows(cfg, 'public_tournament_group_teams', publicGroupTeamRows, 'workspace_id,tournament_id,group_id,team_id');
        await restUpsertRows(cfg, 'public_tournament_matches', publicMatchRows, 'workspace_id,tournament_id,id');
        await restUpsertRows(cfg, 'public_tournament_match_stats', publicStatRows, 'workspace_id,tournament_id,match_id,team_id,player_name', 800);

        // Public Hall of Fame (sanitized)
        await restUpsertRows(cfg, 'public_hall_of_fame_entries', publicHofRows, 'workspace_id,id');
    } catch {
        // ignore: tables missing or unauthorized
    }

    // 4) Public career leaderboard (safe aggregated stats, no full YoB)
    let publicCareerPlayers = 0;
    try {
        const publicRows = await buildPublicCareerLeaderboardRows(cfg, state);
        publicCareerPlayers = publicRows.length;
        await restUpsertRows(cfg, 'public_career_leaderboard', publicRows, 'workspace_id,id', 800);
    } catch {
        // ignore: table missing or unauthorized
        publicCareerPlayers = 0;
    }

    return {
        tournaments: tournamentRows.length,
        teams: teamRows.length,
        groups: groupRows.length,
        groupTeams: groupTeamRows.length,
        matches: matchRows.length,
        matchStats: statRows.length,
        hallOfFame: hofRows.length,
        integrationsScorers: scorersRows.length,
        aliases: aliasesRows.length,
        publicCareerPlayers
    };
};

// -----------------------------
// Sim Pool seed (teams + people)
// -----------------------------

const coerceSimPoolYoB = (birthDate?: string, yob?: number) => {
    const fromBirthDate = birthDate ? deriveYoBFromBirthDate(birthDate) : undefined;
    const n = Number(fromBirthDate ?? yob);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1900;
};

// NOTE: Explicit admin action. Overwrites sim pool tables for the workspace.
export const seedSimPool = async (state: AppState): Promise<SimPoolSeedSummary> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');
    await requireSupabaseWriteSession();

    await ensureWorkspace(cfg);

    const realPool = buildRealSimPoolFromState(state);
    const teamNames = realPool.teams.map((team) => team.name).filter(Boolean);
    const people = realPool.people.filter((person) => person.name);
    if (!teamNames.length || !people.length) {
        throw new Error('Nel JSON non ci sono ancora abbastanza squadre o giocatori reali per popolare il pool simulazioni.');
    }

    // Clear previous pool
    await restDeleteWhere(cfg, 'sim_pool_team_names', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
    await restDeleteWhere(cfg, 'sim_pool_people', `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);

    const teamRows = teamNames.slice(0, 400).map((name, idx) => ({
        workspace_id: cfg.workspaceId,
        name,
        order_index: idx
    }));
    await restUpsertRows(cfg, 'sim_pool_team_names', teamRows, 'workspace_id,name');

    const peopleRows = people.slice(0, 800).map(p => ({
        workspace_id: cfg.workspaceId,
        name: p.name,
        yob: coerceSimPoolYoB(p.birthDate, p.yob)
    }));
    // No onConflict: ids are serial.
    await restUpsertRows(cfg, 'sim_pool_people', peopleRows, undefined, 800);

    return { teamNames: teamRows.length, people: peopleRows.length };
};

// -----------------------------
// Structured pull (recovery)
// -----------------------------

const restGetJson = async <T,>(cfg: SupabaseConfig, pathWithQuery: string): Promise<T> => {
    await ensureFreshAuthForSupabaseOps();
    const res = await fetchWithDevRequestPerf(restUrl(cfg, pathWithQuery), { headers: buildHeaders(cfg) }, { source: 'restGetJson', kind: 'sync' });
    if (!res.ok) throw new Error(await readErrorBody(res));
    return (await res.json()) as T;
};

const toBool = (v: any, fallback = false) => (typeof v === 'boolean' ? v : (v == null ? fallback : String(v) === 'true' || String(v) === '1'));
const toInt = (v: any, fallback = 0) => {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Pulls a reconstructed AppState from NORMALIZED tables.
 * This is intended for recovery/verification and does not include the "draft" teams list (state.teams).
 * Requires admin JWT when RLS is enabled.
 */
export const pullNormalizedState = async (): Promise<NormalizedPullResult> => {
    const cfg = getSupabaseConfig();
    if (!cfg) throw new Error('Supabase non configurato');

    // Globals
    const [settingsRows, aliasesRows, scorersRows, hofRows, tournamentRows] = await Promise.all([
        restGetJson<any[]>(cfg, `app_settings?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=logo,updated_at&limit=1`),
        restGetJson<any[]>(cfg, `player_aliases?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=from_key,to_key`),
        restGetJson<any[]>(cfg, `integrations_scorers?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,name,yob,birth_date,games,points,soffi,source,source_type,source_tournament_id,source_label,team_name,created_at&order=created_at.asc`),
        restGetJson<any[]>(cfg, `hall_of_fame_entries?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,year,tournament_id,tournament_name,type,team_name,player_names,value,player_id,player_birth_date,source_type,source_tournament_id,source_tournament_name,source_match_id,source_auto_generated,reassigned_from_player_id,manually_edited,created_at&order=year.asc,created_at.asc`),
        restGetJson<any[]>(cfg, `tournaments?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,name,start_date,type,config,is_manual,status,updated_at&order=start_date.asc`),
    ]);

    const logo = settingsRows?.[0]?.logo ? String(settingsRows[0].logo) : '';

    const playerAliases: Record<string, string> = {};
    for (const r of aliasesRows || []) {
        const from = String(r.from_key || '').trim();
        const to = String(r.to_key || '').trim();
        if (from && to) playerAliases[from] = to;
    }

    const integrationsScorers = (scorersRows || []).map((r: any) => ({
        id: String(r.id),
        name: String(r.name || ''),
        yob: r.yob == null ? undefined : toInt(r.yob, 0),
        birthDate: r.birth_date == null ? undefined : String(r.birth_date),
        games: toInt(r.games, 0),
        points: toInt(r.points, 0),
        soffi: toInt(r.soffi, 0),
        source: r.source == null ? undefined : String(r.source),
        sourceType: r.source_type == null ? undefined : 'manual_integration',
        sourceTournamentId: r.source_tournament_id == null ? null : String(r.source_tournament_id),
        sourceLabel: r.source_label == null ? undefined : String(r.source_label),
        teamName: r.team_name == null ? undefined : String(r.team_name),
        createdAt: r.created_at ? Date.parse(String(r.created_at)) : undefined
    }));

    const hallOfFame = (hofRows || []).map((r: any) => ({
        id: String(r.id),
        year: String(r.year ?? ''),
        tournamentId: String(r.tournament_id || ''),
        tournamentName: String(r.tournament_name || ''),
        type: r.type,
        teamName: r.team_name ?? undefined,
        playerNames: Array.isArray(r.player_names) ? r.player_names.map((x: any) => String(x)) : [],
        value: r.value == null ? undefined : toInt(r.value, 0),
        playerId: r.player_id ?? undefined,
        playerBirthDate: r.player_birth_date == null ? undefined : String(r.player_birth_date),
        sourceType: r.source_type == null ? undefined : String(r.source_type),
        sourceTournamentId: r.source_tournament_id == null ? undefined : String(r.source_tournament_id),
        sourceTournamentName: r.source_tournament_name == null ? undefined : String(r.source_tournament_name),
        sourceMatchId: r.source_match_id == null ? null : String(r.source_match_id),
        sourceAutoGenerated: r.source_auto_generated == null ? undefined : !!r.source_auto_generated,
        reassignedFromPlayerId: r.reassigned_from_player_id == null ? null : String(r.reassigned_from_player_id),
        manuallyEdited: r.manually_edited == null ? undefined : !!r.manually_edited,
    })) as any;

    const rows = (tournamentRows || []) as Array<any>;
    const liveRow = rows.find(r => r.status === 'live') || null;
    const archivedRows = rows.filter(r => r.status !== 'live');

    // Pull per tournament (teams/groups/matches/stats)
    const pullTournamentBundle = async (tid: string) => {
        const tidEnc = encodeURIComponent(tid);
        const [teamRows, groupRows, groupTeamRows, matchRows, statRows] = await Promise.all([
            restGetJson<any[]>(cfg, `tournament_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=id,name,player1,player2,player1_yob,player1_birth_date,player2_yob,player2_birth_date,player1_is_referee,player2_is_referee,is_referee,created_at_ms&order=created_at_ms.asc`),
            restGetJson<any[]>(cfg, `tournament_groups?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=id,name,order_index&order=order_index.asc`),
            restGetJson<any[]>(cfg, `tournament_group_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=group_id,team_id&order=group_id.asc`),
            restGetJson<any[]>(cfg, `tournament_matches?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=id,code,phase,group_name,round,round_name,order_index,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden,updated_at&order=order_index.asc`),
            restGetJson<any[]>(cfg, `tournament_match_stats?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=match_id,team_id,player_name,canestri,soffi,player_key`),
        ]);

        const teams: Team[] = (teamRows || []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name || ''),
            player1: String(r.player1 || ''),
            player2: r.player2 == null ? undefined : String(r.player2),
            player1YoB: r.player1_yob == null ? undefined : toInt(r.player1_yob, 0),
            player1BirthDate: r.player1_birth_date == null ? undefined : String(r.player1_birth_date),
            player2YoB: r.player2_yob == null ? undefined : toInt(r.player2_yob, 0),
            player2BirthDate: r.player2_birth_date == null ? undefined : String(r.player2_birth_date),
            player1IsReferee: toBool(r.player1_is_referee, false),
            player2IsReferee: toBool(r.player2_is_referee, false),
            isReferee: toBool(r.is_referee, false),
            createdAt: r.created_at_ms == null ? undefined : toInt(r.created_at_ms, 0),
        }));

        const teamById = new Map<string, Team>();
        teams.forEach(t => teamById.set(t.id, t));

        // Groups
        const groupList = (groupRows || []).map((r: any) => ({
            id: String(r.id),
            name: String(r.name || ''),
            orderIndex: r.order_index == null ? 0 : toInt(r.order_index, 0)
        }));
        const groupTeamsMap = new Map<string, string[]>();
        for (const gt of groupTeamRows || []) {
            const gid = String(gt.group_id || '');
            const teamId = String(gt.team_id || '');
            if (!gid || !teamId) continue;
            const arr = groupTeamsMap.get(gid) || [];
            arr.push(teamId);
            groupTeamsMap.set(gid, arr);
        }

        const groups: Group[] = groupList.map(g => ({
            id: g.id,
            name: g.name,
            teams: (groupTeamsMap.get(g.id) || []).map(id => teamById.get(id)).filter(Boolean) as Team[]
        }));

        // Matches
        const statsByMatchId = new Map<string, MatchStats[]>();
        for (const s of statRows || []) {
            const mid = String(s.match_id || '');
            if (!mid) continue;
            const arr = statsByMatchId.get(mid) || [];
            arr.push({
                teamId: String(s.team_id || ''),
                playerName: String(s.player_name || ''),
                canestri: toInt(s.canestri, 0),
                soffi: toInt(s.soffi, 0)
            });
            statsByMatchId.set(mid, arr);
        }

        const matches: Match[] = (matchRows || []).map((r: any) => ({
            id: String(r.id),
            code: r.code == null ? undefined : String(r.code),
            phase: (r.phase === 'groups' || r.phase === 'bracket') ? r.phase : undefined,
            groupName: r.group_name == null ? undefined : String(r.group_name),
            round: r.round == null ? undefined : toInt(r.round, 0),
            roundName: r.round_name == null ? undefined : String(r.round_name),
            orderIndex: r.order_index == null ? undefined : toInt(r.order_index, 0),
            teamAId: r.team_a_id == null ? undefined : String(r.team_a_id),
            teamBId: r.team_b_id == null ? undefined : String(r.team_b_id),
            scoreA: toInt(r.score_a, 0),
            scoreB: toInt(r.score_b, 0),
            played: toBool(r.played, false),
            status: (r.status === 'scheduled' || r.status === 'playing' || r.status === 'finished') ? r.status : 'scheduled',
            isBye: toBool(r.is_bye, false),
            hidden: toBool(r.hidden, false),
            stats: statsByMatchId.get(String(r.id))
        }));

        const maxUpdated = (matchRows || []).reduce((acc: string | null, r: any) => {
            const u = r.updated_at ? String(r.updated_at) : null;
            if (!u) return acc;
            if (!acc) return u;
            return Date.parse(u) > Date.parse(acc) ? u : acc;
        }, null as string | null);

        return { teams, groups, matches, maxUpdatedAt: maxUpdated };
    };

    const bundles = await Promise.all(rows.map(async (r) => {
        const b = await pullTournamentBundle(String(r.id));
        return { row: r, bundle: b };
    }));

    const buildTournamentData = (r: any, b: { teams: Team[]; groups: Group[]; matches: Match[] }): TournamentData => ({
        id: String(r.id),
        name: String(r.name || ''),
        type: r.type,
        startDate: String(r.start_date || ''),
        teams: b.teams,
        groups: b.groups.length ? b.groups : undefined,
        matches: b.matches,
        config: coerceTournamentConfig(r.config),
        isManual: !!r.is_manual,
    });

    const liveTournament = liveRow
        ? buildTournamentData(liveRow, bundles.find(x => String(x.row.id) === String(liveRow.id))!.bundle)
        : null;

    const tournamentHistory = archivedRows
        .map((r) => {
            const found = bundles.find(x => String(x.row.id) === String(r.id));
            return buildTournamentData(r, found!.bundle);
        });

    // Best-effort remote marker: max updated_at across bundles
    let remoteUpdatedAt: string | null = null;
    for (const b of bundles) {
        const u = b.bundle.maxUpdatedAt;
        if (!u) continue;
        if (!remoteUpdatedAt || Date.parse(u) > Date.parse(remoteUpdatedAt)) remoteUpdatedAt = u;
    }

    const reconstructed: AppState = {
        teams: [],
        matches: [],
        tournament: liveTournament,
        tournamentMatches: liveTournament ? (liveTournament.matches || []) : [],
        tournamentHistory,
        logo,
        hallOfFame: hallOfFame as any,
        integrationsScorers: integrationsScorers as any,
        playerAliases,
    };

    const summary: NormalizedPullSummary = {
        tournaments: rows.length,
        teams: bundles.reduce((a, x) => a + (x.bundle.teams.length || 0), 0),
        groups: bundles.reduce((a, x) => a + (x.bundle.groups.length || 0), 0),
        groupTeams: 0, // not strictly needed (can be derived)
        matches: bundles.reduce((a, x) => a + (x.bundle.matches.length || 0), 0),
        matchStats: bundles.reduce((a, x) => a + (x.bundle.matches.reduce((mAcc, m) => mAcc + ((m.stats || []).length), 0)), 0),
        hallOfFame: hallOfFame.length,
        integrationsScorers: integrationsScorers.length,
        aliases: Object.keys(playerAliases).length,
    };

    return { state: reconstructed, summary, remoteUpdatedAt };
};
