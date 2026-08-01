import { coerceAppState, type AppState } from '../storageService';
import { getRemoteBaseUpdatedAt } from '../supabaseRest';
import { appendDurableStateCheckpoint, completeDurableStateCheckpoint, readDurableStateCheckpoint } from './durableStateJournal';

export interface RemoteDraftCacheEntry {
  state: AppState;
  savedAt: string;
  baseUpdatedAt?: string | null;
  operationId: string;
}

export const REMOTE_DRAFT_CACHE_LS_KEY = 'flbp_remote_unsynced_draft_v1';
// Kept for diagnostics/backward compatibility. Drafts older than this are
// considered stale, but are never deleted automatically.
export const REMOTE_DRAFT_RESTORE_WINDOW_MS = 5 * 60 * 1000;
const durableWrites = new Map<string, Promise<boolean>>();

const makeOperationId = (): string => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fallback below
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

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
      operationId: typeof parsed.operationId === 'string' && parsed.operationId.trim()
        ? parsed.operationId.trim()
        : makeOperationId(),
    };
  } catch {
    return null;
  }
};

export const hasRemoteDraftCache = (): boolean => !!readRemoteDraftCache();

export const writeRemoteDraftCache = (
  state: AppState,
  baseUpdatedAt?: string | null,
  operationId?: string | null
): RemoteDraftCacheEntry => {
  const entry: RemoteDraftCacheEntry = {
    state: coerceAppState(state),
    savedAt: new Date().toISOString(),
    baseUpdatedAt: baseUpdatedAt ?? getRemoteBaseUpdatedAt() ?? null,
    operationId: operationId || makeOperationId(),
  };

  let localStored = false;
  try {
    localStorage.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify(entry));
    localStored = true;
  } catch {
    // ignore
  }

  const durableWrite = appendDurableStateCheckpoint({
    ...entry,
    status: 'pending',
  }).then((indexedDbStored) => localStored || indexedDbStored);
  durableWrites.set(entry.operationId, durableWrite);
  void durableWrite.finally(() => {
    if (durableWrites.get(entry.operationId) === durableWrite) durableWrites.delete(entry.operationId);
  });
  return entry;
};

export const ensureRemoteDraftCacheDurable = async (operationId: string): Promise<boolean> => {
  const pending = durableWrites.get(operationId);
  if (pending) return pending;
  const entry = readRemoteDraftCache();
  if (entry?.operationId === operationId) return true;
  const durable = await readDurableStateCheckpoint(operationId);
  return durable?.status === 'pending';
};

export const clearRemoteDraftCache = () => {
  const existing = readRemoteDraftCache();
  try {
    localStorage.removeItem(REMOTE_DRAFT_CACHE_LS_KEY);
  } catch {
    // ignore
  }
  if (existing?.operationId) {
    void completeDurableStateCheckpoint(existing.operationId, 'discarded');
  }
};

export const acknowledgeRemoteDraftCache = (remoteUpdatedAt?: string | null, operationId?: string | null) => {
  const existing = readRemoteDraftCache();
  const completedOperationId = operationId || existing?.operationId || null;
  if (!operationId || existing?.operationId === operationId) {
    try {
      localStorage.removeItem(REMOTE_DRAFT_CACHE_LS_KEY);
    } catch {
      // ignore
    }
  }
  if (completedOperationId) {
    void completeDurableStateCheckpoint(completedOperationId, 'synced', remoteUpdatedAt);
  }
};

export const discardRemoteDraftOperation = (operationId: string): void => {
  if (!operationId) return;
  void completeDurableStateCheckpoint(operationId, 'discarded');
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
  // A stale draft must not be silently destroyed: optimistic concurrency on
  // the server prevents it from overwriting a newer snapshot. Keeping it
  // visible is what makes refresh/crash recovery lossless.
  return entry;
};
