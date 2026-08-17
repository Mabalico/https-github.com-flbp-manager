import { readViteWorkspaceId } from './viteEnv';
import type {
  StructuralOperationLogEntry,
  TournamentStructureDraftState,
  TournamentStructureSnapshot,
} from './tournamentStructureTypes';

type StoredTournamentStructureDraft = {
  key: string;
  workspaceId: string;
  tournamentId: string;
  sourceSignature: string;
  savedAt: string;
  original: TournamentStructureSnapshot;
  present: TournamentStructureSnapshot;
  log: StructuralOperationLogEntry[];
};

const DB_NAME = 'flbp_tournament_structure_drafts_v1';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const POINTER_PREFIX = 'flbp_tournament_structure_draft_pointer_v1';

const workspaceId = () => (readViteWorkspaceId() || 'default').trim() || 'default';
const tournamentId = (snapshot: TournamentStructureSnapshot) => String(snapshot.tournament?.id || '').trim();
const draftKey = (snapshot: TournamentStructureSnapshot) => `${workspaceId()}:${tournamentId(snapshot)}`;

export const buildTournamentStructureSourceSignature = (snapshot: TournamentStructureSnapshot): string => JSON.stringify({
  tournamentId: snapshot.tournament?.id || '',
  type: snapshot.tournament?.type || '',
  groups: (snapshot.tournament?.groups || []).map((group) => ({
    id: group.id,
    teams: (group.teams || []).map((team) => team.id),
  })),
  matches: (snapshot.matches || []).map((match) => ({
    id: match.id,
    phase: match.phase || '',
    groupName: match.groupName || '',
    round: match.round || 0,
    teamAId: match.teamAId || '',
    teamBId: match.teamBId || '',
    status: match.status,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    hidden: !!match.hidden,
    isBye: !!match.isBye,
  })),
});

const openDb = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const transactionDone = (tx: IDBTransaction): Promise<boolean> => new Promise((resolve) => {
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => resolve(false);
  tx.onabort = () => resolve(false);
});

const writePointer = (entry: StoredTournamentStructureDraft): void => {
  try {
    localStorage.setItem(`${POINTER_PREFIX}:${entry.key}`, JSON.stringify({
      key: entry.key,
      workspaceId: entry.workspaceId,
      tournamentId: entry.tournamentId,
      sourceSignature: entry.sourceSignature,
      savedAt: entry.savedAt,
      storage: 'indexeddb',
    }));
  } catch {
    // IndexedDB remains authoritative; this pointer is only diagnostic.
  }
};

export const writeTournamentStructureDraft = async (
  state: TournamentStructureDraftState,
  sourceSignature: string
): Promise<boolean> => {
  const id = tournamentId(state.original);
  if (!id) return false;
  const entry: StoredTournamentStructureDraft = {
    key: draftKey(state.original),
    workspaceId: workspaceId(),
    tournamentId: id,
    sourceSignature,
    savedAt: new Date().toISOString(),
    original: state.original,
    present: state.present,
    log: state.log,
  };
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    const committed = await transactionDone(tx);
    if (committed) writePointer(entry);
    return committed;
  } catch {
    return false;
  } finally {
    db.close();
  }
};

export const readTournamentStructureDraft = async (
  source: TournamentStructureSnapshot,
  sourceSignature: string
): Promise<TournamentStructureDraftState | null> => {
  const id = tournamentId(source);
  if (!id) return null;
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(draftKey(source));
    const entry = await new Promise<StoredTournamentStructureDraft | null>((resolve) => {
      request.onsuccess = () => resolve((request.result as StoredTournamentStructureDraft | undefined) || null);
      request.onerror = () => resolve(null);
    });
    if (!entry || entry.sourceSignature !== sourceSignature) return null;
    return {
      original: entry.original,
      present: entry.present,
      past: [],
      future: [],
      log: entry.log || [],
      lastResult: null,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
};

export const clearTournamentStructureDraft = async (snapshot: TournamentStructureSnapshot): Promise<void> => {
  const id = tournamentId(snapshot);
  if (!id) return;
  const key = draftKey(snapshot);
  const db = await openDb();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      await transactionDone(tx);
    } catch {
      // The next successful save/reset retries cleanup.
    } finally {
      db.close();
    }
  }
  try { localStorage.removeItem(`${POINTER_PREFIX}:${key}`); } catch { /* ignore */ }
};
