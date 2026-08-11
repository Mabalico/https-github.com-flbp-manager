import { coerceAppState, type AppState } from '../storageService';
import { getRemoteBaseUpdatedAt } from '../supabaseRest';
import { appendDurableStateCheckpoint, completeDurableStateCheckpoint, readDurableStateCheckpoint } from './durableStateJournal';
import { readViteWorkspaceId } from '../viteEnv';
import { getAdminLeaseHolderForWrites } from '../adminWriteLeaseState';

export interface RemoteDraftCacheEntry {
  state: AppState;
  savedAt: string;
  baseUpdatedAt?: string | null;
  baseVersion?: number | null;
  workspaceId: string;
  ownerId: string;
  writerId: string | null;
  operationId: string;
}

export type RemoteDraftPointer = Omit<RemoteDraftCacheEntry, 'state'> & { storage: 'indexeddb' };

export const REMOTE_DRAFT_CACHE_LS_KEY = 'flbp_remote_unsynced_draft_v1';
export const REMOTE_DRAFT_CACHE_V2_PREFIX = 'flbp_remote_unsynced_draft_v2';
const REMOTE_DRAFT_OWNER_SS_KEY = 'flbp_remote_draft_owner_v2';
const REMOTE_DRAFT_OWNER_SEEN_PREFIX = 'flbp_remote_draft_owner_seen_v2';
const REMOTE_DRAFT_OWNER_ALIVE_MS = 45_000;
const REMOTE_DRAFT_OWNER_HEARTBEAT_MS = 20_000;
// Kept for diagnostics/backward compatibility. Drafts older than this are
// considered stale, but are never deleted automatically.
export const REMOTE_DRAFT_RESTORE_WINDOW_MS = 5 * 60 * 1000;
const durableWrites = new Map<string, Promise<boolean>>();
let ownerHeartbeatStarted = false;
let ownerPagehideInstalled = false;

const workspaceId = (): string => (readViteWorkspaceId() || 'default').trim() || 'default';

export const getRemoteDraftOwnerId = (): string => {
  try {
    const stored = sessionStorage.getItem(REMOTE_DRAFT_OWNER_SS_KEY);
    if (stored) return stored;
    const fresh = makeOperationId();
    sessionStorage.setItem(REMOTE_DRAFT_OWNER_SS_KEY, fresh);
    return fresh;
  } catch {
    return makeOperationId();
  }
};

const currentKey = (ownerId = getRemoteDraftOwnerId()): string =>
  `${REMOTE_DRAFT_CACHE_V2_PREFIX}:${workspaceId()}:${ownerId}`;

export const touchRemoteDraftOwner = (ownerId = getRemoteDraftOwnerId()): void => {
  try {
    localStorage.setItem(`${REMOTE_DRAFT_OWNER_SEEN_PREFIX}:${ownerId}`, String(Date.now()));
  } catch {
    // IndexedDB remains the durable source.
  }
};

export const startRemoteDraftOwnerHeartbeat = (): void => {
  if (ownerHeartbeatStarted) return;
  try {
    if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return;
    ownerHeartbeatStarted = true;
    touchRemoteDraftOwner();
    window.setInterval(() => touchRemoteDraftOwner(), REMOTE_DRAFT_OWNER_HEARTBEAT_MS);
    if (!ownerPagehideInstalled && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', () => {
        try {
          localStorage.removeItem(`${REMOTE_DRAFT_OWNER_SEEN_PREFIX}:${getRemoteDraftOwnerId()}`);
        } catch {
          // Un crash lascia il marker, che scade automaticamente.
        }
      });
      ownerPagehideInstalled = true;
    }
  } catch {
    ownerHeartbeatStarted = false;
  }
};

export const isRemoteDraftOwnerActive = (ownerId?: string | null, nowMs = Date.now()): boolean => {
  if (!ownerId || ownerId === getRemoteDraftOwnerId()) return false;
  try {
    const seen = Number(localStorage.getItem(`${REMOTE_DRAFT_OWNER_SEEN_PREFIX}:${ownerId}`) || 0);
    return Number.isFinite(seen) && seen > 0 && nowMs - seen <= REMOTE_DRAFT_OWNER_ALIVE_MS;
  } catch {
    return false;
  }
};

const makeOperationId = (): string => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fallback below
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const pointerFor = (entry: RemoteDraftCacheEntry): RemoteDraftPointer => ({
  savedAt: entry.savedAt,
  baseUpdatedAt: entry.baseUpdatedAt ?? null,
  baseVersion: entry.baseVersion ?? null,
  workspaceId: entry.workspaceId,
  ownerId: entry.ownerId,
  writerId: entry.writerId ?? null,
  operationId: entry.operationId,
  storage: 'indexeddb',
});

const writePointer = (entry: RemoteDraftCacheEntry): void => {
  try {
    localStorage.setItem(currentKey(entry.ownerId), JSON.stringify(pointerFor(entry)));
    touchRemoteDraftOwner(entry.ownerId);
  } catch {
    // Il puntatore è solo un aiuto sincrono: IndexedDB resta autorevole.
  }
};

const removeLegacyDraftForOperation = (operationId?: string | null): void => {
  if (!operationId) return;
  try {
    const raw = localStorage.getItem(REMOTE_DRAFT_CACHE_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (String(parsed?.operationId || '').trim() === operationId) {
      localStorage.removeItem(REMOTE_DRAFT_CACHE_LS_KEY);
    }
  } catch {
    // Una chiave legacy illeggibile non viene eliminata automaticamente.
  }
};

export const readRemoteDraftPointer = (): RemoteDraftPointer | null => {
  try {
    const ownerId = getRemoteDraftOwnerId();
    const raw = localStorage.getItem(currentKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.operationId !== 'string') return null;
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      baseUpdatedAt: typeof parsed.baseUpdatedAt === 'string' ? parsed.baseUpdatedAt : null,
      baseVersion: Number.isInteger(Number(parsed.baseVersion)) ? Number(parsed.baseVersion) : null,
      workspaceId: typeof parsed.workspaceId === 'string' && parsed.workspaceId ? parsed.workspaceId : workspaceId(),
      ownerId,
      writerId: typeof parsed.writerId === 'string' && parsed.writerId ? parsed.writerId : null,
      operationId: parsed.operationId,
      storage: 'indexeddb',
    };
  } catch {
    return null;
  }
};

export const readRemoteDraftCache = (): RemoteDraftCacheEntry | null => {
  try {
    const ownerId = getRemoteDraftOwnerId();
    const key = currentKey(ownerId);
    let raw = localStorage.getItem(key);
    let legacy = false;
    if (!raw) {
      raw = localStorage.getItem(REMOTE_DRAFT_CACHE_LS_KEY);
      legacy = !!raw;
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    const entry: RemoteDraftCacheEntry = {
      state: coerceAppState(parsed.state),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      baseUpdatedAt: typeof parsed.baseUpdatedAt === 'string' ? parsed.baseUpdatedAt : (parsed.baseUpdatedAt == null ? null : String(parsed.baseUpdatedAt)),
      baseVersion: Number.isInteger(Number(parsed.baseVersion)) ? Number(parsed.baseVersion) : null,
      workspaceId: typeof parsed.workspaceId === 'string' && parsed.workspaceId ? parsed.workspaceId : workspaceId(),
      ownerId,
      writerId: typeof parsed.writerId === 'string' && parsed.writerId ? parsed.writerId : null,
      operationId: typeof parsed.operationId === 'string' && parsed.operationId.trim()
        ? parsed.operationId.trim()
        : makeOperationId(),
    };
    // Migrazione v1/v2: la copia completa resta disponibile finché IndexedDB
    // non conferma il checkpoint; poi localStorage conserva soltanto il puntatore.
    const durableWrite = appendDurableStateCheckpoint({ ...entry, status: 'pending' });
    durableWrites.set(entry.operationId, durableWrite);
    void durableWrite.then((stored) => {
      if (!stored) return;
      writePointer(entry);
      if (legacy) {
        try { localStorage.removeItem(REMOTE_DRAFT_CACHE_LS_KEY); } catch { /* ignore */ }
      }
    }).finally(() => {
      if (durableWrites.get(entry.operationId) === durableWrite) durableWrites.delete(entry.operationId);
    });
    touchRemoteDraftOwner(ownerId);
    return entry;
  } catch {
    return null;
  }
};

export const hasRemoteDraftCache = (): boolean => !!(readRemoteDraftPointer() || readRemoteDraftCache());

export const writeRemoteDraftCache = (
  state: AppState,
  baseUpdatedAt?: string | null,
  operationId?: string | null,
  baseVersion?: number | null,
  requestedOwnerId?: string | null,
  requestedWriterId?: string | null,
): RemoteDraftCacheEntry => {
  const ownerId = requestedOwnerId || getRemoteDraftOwnerId();
  const entry: RemoteDraftCacheEntry = {
    state: coerceAppState(state),
    savedAt: new Date().toISOString(),
    baseUpdatedAt: baseUpdatedAt ?? getRemoteBaseUpdatedAt() ?? null,
    baseVersion: Number.isInteger(Number(baseVersion)) ? Number(baseVersion) : null,
    workspaceId: workspaceId(),
    ownerId,
    writerId: requestedWriterId ?? getAdminLeaseHolderForWrites(),
    operationId: operationId || makeOperationId(),
  };

  writePointer(entry);

  const durableWrite = appendDurableStateCheckpoint({
    ...entry,
    status: 'pending',
  });
  durableWrites.set(entry.operationId, durableWrite);
  void durableWrite.finally(() => {
    if (durableWrites.get(entry.operationId) === durableWrite) durableWrites.delete(entry.operationId);
  });
  return entry;
};

export const ensureRemoteDraftCacheDurable = async (operationId: string): Promise<boolean> => {
  const pending = durableWrites.get(operationId);
  if (pending) return pending;
  const durable = await readDurableStateCheckpoint(operationId);
  return durable?.status === 'pending';
};

export const clearRemoteDraftCache = () => {
  const existing = readRemoteDraftPointer() || readRemoteDraftCache();
  try {
    localStorage.removeItem(currentKey());
  } catch {
    // ignore
  }
  removeLegacyDraftForOperation(existing?.operationId);
  if (existing?.operationId) {
    void completeDurableStateCheckpoint(existing.operationId, 'discarded');
  }
};

export const acknowledgeRemoteDraftCache = (remoteUpdatedAt?: string | null, operationId?: string | null) => {
  const existing = readRemoteDraftPointer() || readRemoteDraftCache();
  const completedOperationId = operationId || existing?.operationId || null;
  if (!operationId || existing?.operationId === operationId) {
    try {
      localStorage.removeItem(currentKey());
    } catch {
      // ignore
    }
  }
  removeLegacyDraftForOperation(completedOperationId);
  if (completedOperationId) {
    void completeDurableStateCheckpoint(completedOperationId, 'synced', remoteUpdatedAt);
  }
};

export const readCurrentRemoteDraftCache = async (): Promise<RemoteDraftCacheEntry | null> => {
  const legacy = readRemoteDraftCache();
  if (legacy) return legacy;
  const pointer = readRemoteDraftPointer();
  if (!pointer?.operationId) return null;
  const durable = await readDurableStateCheckpoint(pointer.operationId);
  if (!durable?.state || durable.status !== 'pending') return null;
  return {
    state: coerceAppState(durable.state),
    savedAt: durable.savedAt,
    baseUpdatedAt: durable.baseUpdatedAt ?? null,
    baseVersion: durable.baseVersion ?? null,
    workspaceId: durable.workspaceId || pointer.workspaceId,
    ownerId: durable.ownerId || pointer.ownerId,
    writerId: durable.writerId || pointer.writerId || null,
    operationId: durable.operationId,
  };
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
