import type { Match } from '../../types';

export type PendingRefereeReport = {
  operationId: string;
  tournamentId: string;
  matchId: string;
  matches: Match[];
  createdAt: string;
  attempts: number;
  lastError?: string | null;
};

const LS_KEY = 'flbp_referee_report_outbox_v1';
const DB_NAME = 'flbp_referee_report_outbox_v1';
const STORE_NAME = 'reports';

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const openDb = (): Promise<IDBDatabase | null> => {
  try {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'operationId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  } catch {
    return Promise.resolve(null);
  }
};

const archive = async (entry: PendingRefereeReport & { status: 'pending' | 'synced'; completedAt?: string | null }): Promise<boolean> => {
  const db = await openDb();
  if (!db) return false;
  const stored = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  db.close();
  return stored;
};

const updateDurable = async (
  operationId: string,
  update: (entry: PendingRefereeReport & { status?: string; completedAt?: string | null }) => any,
) => {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(operationId);
      request.onsuccess = () => {
        if (request.result) store.put(update(request.result));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
};

export const readPendingRefereeReports = (): PendingRefereeReport[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry?.operationId && entry?.tournamentId && entry?.matchId && Array.isArray(entry?.matches));
  } catch {
    return [];
  }
};

const writePending = (entries: PendingRefereeReport[]): boolean => {
  try {
    // Pending reports are never pruned automatically. The IndexedDB copy is
    // the durable source if localStorage reaches its quota.
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent('flbp-referee-outbox-change'));
    return true;
  } catch {
    // IndexedDB archive is still attempted by the caller.
    return false;
  }
};

export const readDurablePendingRefereeReports = async (): Promise<PendingRefereeReport[]> => {
  const localEntries = readPendingRefereeReports();
  const db = await openDb();
  if (!db) return localEntries;
  const durableEntries = await new Promise<Array<PendingRefereeReport & { status?: string }>>((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  const merged = new Map(localEntries.map((entry) => [entry.operationId, entry]));
  for (const entry of durableEntries) {
    if (entry.status === 'pending' && entry.operationId) merged.set(entry.operationId, entry);
  }
  return [...merged.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
};

export const enqueueRefereeReport = async (input: {
  tournamentId: string;
  matchId: string;
  matches: Match[];
  operationId?: string | null;
}): Promise<PendingRefereeReport> => {
  const primary = input.matches.find((match) => String(match?.id || '') === String(input.matchId || ''));
  const operationId = String(input.operationId || primary?.refereeReportFinalId || makeId()).trim();
  const existing = readPendingRefereeReports();
  const previous = existing.find((entry) => entry.operationId === operationId);
  const entry: PendingRefereeReport = previous || {
    operationId,
    tournamentId: input.tournamentId,
    matchId: input.matchId,
    matches: input.matches,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  const localStored = previous ? true : writePending([...existing, entry]);
  // Do not start the network write until IndexedDB confirms the local commit.
  const indexedDbStored = await archive({ ...entry, status: 'pending' });
  if (!localStored && !indexedDbStored) {
    throw new Error('Impossibile salvare il referto sul dispositivo: libera spazio nel browser e riprova. Nessun invio remoto è stato eseguito.');
  }
  return entry;
};

export const markRefereeReportAttemptFailed = (operationId: string, error: unknown) => {
  const message = String((error as any)?.message || error || '').slice(0, 1000);
  const entries = readPendingRefereeReports();
  const next = entries.map((entry) => entry.operationId === operationId ? {
    ...entry,
    attempts: entry.attempts + 1,
    lastError: message,
  } : entry);
  writePending(next);
  const updated = next.find((entry) => entry.operationId === operationId);
  if (updated) void archive({ ...updated, status: 'pending' });
  else void updateDurable(operationId, (entry) => ({
    ...entry,
    attempts: Number(entry.attempts || 0) + 1,
    lastError: message,
    status: 'pending',
  }));
};

export const acknowledgeRefereeReport = (operationId: string) => {
  const entries = readPendingRefereeReports();
  const completed = entries.find((entry) => entry.operationId === operationId);
  writePending(entries.filter((entry) => entry.operationId !== operationId));
  if (completed) void archive({ ...completed, status: 'synced', completedAt: new Date().toISOString() });
  else void updateDurable(operationId, (entry) => ({ ...entry, status: 'synced', completedAt: new Date().toISOString() }));
};
