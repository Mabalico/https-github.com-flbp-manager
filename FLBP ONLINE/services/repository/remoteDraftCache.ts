import { coerceAppState, type AppState } from '../storageService';
import { getRemoteBaseUpdatedAt } from '../supabaseRest';

export interface RemoteDraftCacheEntry {
  state: AppState;
  savedAt: string;
  baseUpdatedAt?: string | null;
}

export const REMOTE_DRAFT_CACHE_LS_KEY = 'flbp_remote_unsynced_draft_v1';

export const readRemoteDraftCache = (): RemoteDraftCacheEntry | null => {
  try {
    const raw = localStorage.getItem(REMOTE_DRAFT_CACHE_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    return {
      state: coerceAppState(parsed.state),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      baseUpdatedAt: typeof parsed.baseUpdatedAt === 'string' ? parsed.baseUpdatedAt : (parsed.baseUpdatedAt == null ? null : String(parsed.baseUpdatedAt)),
    };
  } catch {
    return null;
  }
};

export const hasRemoteDraftCache = (): boolean => !!readRemoteDraftCache();

export const writeRemoteDraftCache = (state: AppState, baseUpdatedAt?: string | null) => {
  const entry: RemoteDraftCacheEntry = {
    state: coerceAppState(state),
    savedAt: new Date().toISOString(),
    baseUpdatedAt: baseUpdatedAt ?? getRemoteBaseUpdatedAt() ?? null,
  };

  try {
    localStorage.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
};

export const clearRemoteDraftCache = () => {
  try {
    localStorage.removeItem(REMOTE_DRAFT_CACHE_LS_KEY);
  } catch {
    // ignore
  }
};
