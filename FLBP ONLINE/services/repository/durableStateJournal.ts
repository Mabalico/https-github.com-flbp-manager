import type { AppState } from '../storageService';

export type DurableCheckpointStatus = 'pending' | 'synced' | 'discarded';

export type DurableStateCheckpoint = {
  operationId: string;
  state: AppState;
  savedAt: string;
  baseUpdatedAt?: string | null;
  status: DurableCheckpointStatus;
  completedAt?: string | null;
  remoteUpdatedAt?: string | null;
};

const DB_NAME = 'flbp_durable_state_journal_v1';
const DB_VERSION = 1;
const STORE_NAME = 'checkpoints';
const MAX_COMPLETED_CHECKPOINTS = 200;

const canUseIndexedDb = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
};

const openJournal = (): Promise<IDBDatabase | null> => {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains(STORE_NAME)) return;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'operationId' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T | null> => new Promise((resolve) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

const transactionDone = (tx: IDBTransaction): Promise<boolean> => new Promise((resolve) => {
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => resolve(false);
  tx.onabort = () => resolve(false);
});

const pruneCompletedCheckpoints = async (db: IDBDatabase): Promise<void> => {
  try {
    const readTx = db.transaction(STORE_NAME, 'readonly');
    const rows = await requestResult(readTx.objectStore(STORE_NAME).getAll()) as DurableStateCheckpoint[] | null;
    if (!rows) return;

    const completed = rows
      .filter((row) => row.status !== 'pending')
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    const expired = completed.slice(MAX_COMPLETED_CHECKPOINTS);
    if (!expired.length) return;
    const deleteTx = db.transaction(STORE_NAME, 'readwrite');
    const store = deleteTx.objectStore(STORE_NAME);
    for (const row of expired) store.delete(row.operationId);
    await transactionDone(deleteTx);
  } catch {
    // The localStorage emergency copy remains the synchronous safety net.
  }
};

export const appendDurableStateCheckpoint = async (entry: DurableStateCheckpoint): Promise<boolean> => {
  const db = await openJournal();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    const committed = await transactionDone(tx);
    if (committed) await pruneCompletedCheckpoints(db);
    return committed;
  } catch {
    return false;
  } finally {
    db.close();
  }
};

export const completeDurableStateCheckpoint = async (
  operationId: string,
  status: Exclude<DurableCheckpointStatus, 'pending'>,
  remoteUpdatedAt?: string | null
): Promise<boolean> => {
  const db = await openJournal();
  if (!db) return false;
  try {
    const readTx = db.transaction(STORE_NAME, 'readonly');
    const existing = await requestResult(readTx.objectStore(STORE_NAME).get(operationId)) as DurableStateCheckpoint | null;
    if (!existing) return false;
    const writeTx = db.transaction(STORE_NAME, 'readwrite');
    writeTx.objectStore(STORE_NAME).put({
      ...existing,
      status,
      completedAt: new Date().toISOString(),
      remoteUpdatedAt: remoteUpdatedAt ?? existing.remoteUpdatedAt ?? null,
    });
    return await transactionDone(writeTx);
  } catch {
    return false;
  } finally {
    db.close();
  }
};

export const listDurableStateCheckpoints = async (): Promise<DurableStateCheckpoint[]> => {
  const db = await openJournal();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const rows = await requestResult(tx.objectStore(STORE_NAME).getAll()) as DurableStateCheckpoint[] | null;
    return (rows || []).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  } catch {
    return [];
  } finally {
    db.close();
  }
};

export const readDurableStateCheckpoint = async (operationId: string): Promise<DurableStateCheckpoint | null> => {
  const safeOperationId = String(operationId || '').trim();
  if (!safeOperationId) return null;
  const db = await openJournal();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    return await requestResult(tx.objectStore(STORE_NAME).get(safeOperationId)) as DurableStateCheckpoint | null;
  } catch {
    return null;
  } finally {
    db.close();
  }
};

export const readLatestPendingDurableStateCheckpoint = async (): Promise<DurableStateCheckpoint | null> => {
  const rows = await listDurableStateCheckpoints();
  return rows
    .filter((row) => row?.status === 'pending' && row?.operationId && row?.state)
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] || null;
};
