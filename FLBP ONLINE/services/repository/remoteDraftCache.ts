import { coerceAppState, type AppState } from '../storageService';
import { getRemoteBaseUpdatedAt } from '../supabaseRest';

export interface RemoteDraftCacheEntry {
  state: AppState;
  savedAt: string;
  baseUpdatedAt?: string | null;
}

export const REMOTE_DRAFT_CACHE_LS_KEY = 'flbp_remote_unsynced_draft_v1';
export const REMOTE_DRAFT_RESTORE_WINDOW_MS = 5 * 60 * 1000;

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

export const isRemoteDraftCacheFresh = (
  entry: RemoteDraftCacheEntry | null | undefined,
  nowMs = Date.now()
): boolean => {
  if (!entry?.savedAt) return false;
  const savedAtMs = Date.parse(entry.savedAt);
  if (!Number.isFinite(savedAtMs)) return false;
  return (nowMs - savedAtMs) <= REMOTE_DRAFT_RESTORE_WINDOW_MS;
};

export const readRestorableRemoteDraftCache = (): RemoteDraftCacheEntry | null => {
  const entry = readRemoteDraftCache();
  if (!entry) return null;
  if (isRemoteDraftCacheFresh(entry)) return entry;
  clearRemoteDraftCache();
  return null;
};
