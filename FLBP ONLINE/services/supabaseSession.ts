import { readViteSupabaseAdminEmail, readViteSupabaseAnonKey, readViteSupabaseUrl, readViteWorkspaceId } from './viteEnv';

export interface SupabaseConfig {
    url: string;
    anonKey: string;
    workspaceId: string;
}

export interface SupabaseSession {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
    email?: string | null;
    userId?: string | null;
}

export const SUPABASE_ACCESS_TOKEN_LS_KEY = 'flbp_supabase_access_token';
export const SUPABASE_REFRESH_TOKEN_LS_KEY = 'flbp_supabase_refresh_token';
export const SUPABASE_EXPIRES_AT_LS_KEY = 'flbp_supabase_expires_at';
export const SUPABASE_USER_EMAIL_LS_KEY = 'flbp_supabase_user_email';
export const SUPABASE_USER_ID_LS_KEY = 'flbp_supabase_user_id';
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

export const getSupabaseAccessToken = (): string | null => {
    try {
        const v = (localStorage.getItem(SUPABASE_ACCESS_TOKEN_LS_KEY) || '').trim();
        return v ? v : null;
    } catch {
        return null;
    }
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
