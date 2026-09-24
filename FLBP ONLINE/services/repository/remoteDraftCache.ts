import { coerceAppState, type AppState } from '../storageService';
import { getRemoteBaseUpdatedAt } from '../supabaseRest';
import { appendDurableStateCheckpoint, completeDurableStateCheckpoint, listDurableStateCheckpoints, readDurableStateCheckpoint } from './durableStateJournal';
import { readViteWorkspaceId } from '../viteEnv';
import { getAdminLeaseHolderForWrites } from '../adminWriteLeaseState';
import { normalizeWorkspaceVersion } from '../workspaceVersion';

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
const durableCompletions = new Map<string, Promise<boolean>>();
// Operation ids are immutable. A late migration/write must not reopen an id
// that this document has already acknowledged or explicitly retired.
const closedOperations = new Set<string>();
let ownerHeartbeatStarted = false;
let ownerPagehideInstalled = false;

export const isRemoteDraftOperationClosed = (operationId: string): boolean => closedOperations.has(operationId);

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

const enqueueDurableWrite = (
  operationId: string,
  write: () => Promise<boolean>,
): Promise<boolean> => {
  if (closedOperations.has(operationId)) return Promise.resolve(false);
  const previous = durableWrites.get(operationId);
  const queued = previous
    ? previous.catch(() => false).then(() => (
      closedOperations.has(operationId) ? false : write()
    ))
    : write();
  durableWrites.set(operationId, queued);
  void queued.finally(() => {
    if (durableWrites.get(operationId) === queued) durableWrites.delete(operationId);
  });
  return queued;
};

const completeRemoteDraftOperation = (
  operationId: string,
  status: 'synced' | 'discarded',
  remoteUpdatedAt?: string | null,
): Promise<boolean> => {
  closedOperations.add(operationId);
  const complete = async () => {
    while (durableWrites.has(operationId)) {
      await durableWrites.get(operationId);
    }
    return completeDurableStateCheckpoint(operationId, status, remoteUpdatedAt);
  };
  const previous = durableCompletions.get(operationId);
  const completion = previous ? previous.catch(() => false).then(complete) : complete();
  durableCompletions.set(operationId, completion);
  void completion.finally(() => {
    if (durableCompletions.get(operationId) === completion) durableCompletions.delete(operationId);
  });
  return completion;
};

const pointerFor = (entry: RemoteDraftCacheEntry): RemoteDraftPointer => ({
  savedAt: entry.savedAt,
  baseUpdatedAt: entry.baseUpdatedAt ?? null,
  baseVersion: normalizeWorkspaceVersion(entry.baseVersion),
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
      baseVersion: normalizeWorkspaceVersion(parsed.baseVersion),
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
      baseVersion: normalizeWorkspaceVersion(parsed.baseVersion),
      workspaceId: typeof parsed.workspaceId === 'string' && parsed.workspaceId ? parsed.workspaceId : workspaceId(),
      ownerId,
      writerId: typeof parsed.writerId === 'string' && parsed.writerId ? parsed.writerId : null,
      operationId: typeof parsed.operationId === 'string' && parsed.operationId.trim()
        ? parsed.operationId.trim()
        : makeOperationId(),
    };
    if (closedOperations.has(entry.operationId)) return null;
    // Migrazione v1/v2: la copia completa resta disponibile finché IndexedDB
    // non conferma il checkpoint; poi localStorage conserva soltanto il puntatore.
    const durableWrite = enqueueDurableWrite(entry.operationId, () => (
      appendDurableStateCheckpoint({ ...entry, status: 'pending' })
    ));
    void durableWrite.then((stored) => {
      if (!stored || closedOperations.has(entry.operationId)) return;
      try {
        const current = localStorage.getItem(key);
        // Only replace the full snapshot that this migration actually read.
        // A newer pointer or a removed legacy entry belongs to another save
        // or acknowledgement and must not be overwritten by this callback.
        const sourceIsCurrent = legacy
          ? localStorage.getItem(REMOTE_DRAFT_CACHE_LS_KEY) === raw
          : current === raw;
        if (!sourceIsCurrent) return;
        if (current && current !== raw) {
          if (JSON.parse(current)?.operationId !== entry.operationId) return;
        } else {
          writePointer(entry);
        }
        if (legacy) removeLegacyDraftForOperation(entry.operationId);
      } catch {
        // Keep the legacy snapshot when storage cannot be inspected safely.
      }
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
    baseVersion: normalizeWorkspaceVersion(baseVersion),
    workspaceId: workspaceId(),
    ownerId,
    writerId: requestedWriterId ?? getAdminLeaseHolderForWrites(),
    operationId: operationId && !closedOperations.has(operationId) ? operationId : makeOperationId(),
  };

  writePointer(entry);

  enqueueDurableWrite(entry.operationId, () => appendDurableStateCheckpoint({
    ...entry,
    status: 'pending',
  }));
  return entry;
};

export const ensureRemoteDraftCacheDurable = async (operationId: string): Promise<boolean> => {
  if (closedOperations.has(operationId)) {
    await durableCompletions.get(operationId);
    return false;
  }
  const pending = durableWrites.get(operationId);
  if (pending) return (await pending) && !closedOperations.has(operationId);
  const durable = await readDurableStateCheckpoint(operationId);
  return durable?.status === 'pending' && !closedOperations.has(operationId);
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
    void completeRemoteDraftOperation(existing.operationId, 'discarded');
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
    void completeRemoteDraftOperation(completedOperationId, 'synced', remoteUpdatedAt);
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
    baseVersion: normalizeWorkspaceVersion(durable.baseVersion),
    workspaceId: durable.workspaceId || pointer.workspaceId,
    ownerId: durable.ownerId || pointer.ownerId,
    writerId: durable.writerId || pointer.writerId || null,
    operationId: durable.operationId,
  };
};

export const discardRemoteDraftOperation = async (operationId: string): Promise<boolean> => {
  if (!operationId) return false;
  removeLegacyDraftForOperation(operationId);
  const completed = await completeRemoteDraftOperation(operationId, 'discarded');
  const verified = await readDurableStateCheckpoint(operationId);
  return completed && verified?.status === 'discarded';
};

/** Close every checkpoint this window could restore after choosing the DB. */
export const discardRestorableRemoteDrafts = async (
  primaryOperationId?: string | null,
): Promise<boolean> => {
  const ownerId = getRemoteDraftOwnerId();
  const targetWorkspaceId = workspaceId();
  const isRestorable = (row: Awaited<ReturnType<typeof listDurableStateCheckpoints>>[number]) => (
    row?.status === 'pending'
    && !!row.operationId
    && (!row.workspaceId || row.workspaceId === targetWorkspaceId)
    && (!row.ownerId || row.ownerId === ownerId || !isRemoteDraftOwnerActive(row.ownerId))
  );
  const rows = await listDurableStateCheckpoints();
  const operationIds = new Set(rows.filter(isRestorable).map((row) => row.operationId));
  if (primaryOperationId) operationIds.add(primaryOperationId);
  if (!operationIds.size) return !primaryOperationId;

  const results = await Promise.all(
    [...operationIds].map((operationId) => discardRemoteDraftOperation(operationId)),
  );
  if (results.some((result) => !result)) return false;
  if ((await listDurableStateCheckpoints()).some(isRestorable)) return false;

  try { localStorage.removeItem(currentKey(ownerId)); } catch { /* ignore */ }
  for (const operationId of operationIds) removeLegacyDraftForOperation(operationId);
  return true;
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
