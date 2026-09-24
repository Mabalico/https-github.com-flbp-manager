import type { RepositorySource } from './repository/AppStateRepository';

export type AdminSyncPhase = 'idle' | 'pending' | 'syncing' | 'synced' | 'error' | 'conflict';

export interface AdminSyncState {
  phase: AdminSyncPhase;
  message: string;
  hasPendingChanges: boolean;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  source?: RepositorySource;
}

const LS_KEY = 'flbp_admin_sync_state_v1';
const EVENT_NAME = 'flbp:admin-sync-state-changed';
// A quota/storage failure must not also hide the error indicator itself.
let memoryFallback: AdminSyncState | null = null;

const readRaw = (): AdminSyncState => {
  if (memoryFallback) return memoryFallback;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return {
        phase: 'idle',
        message: 'Autosave pronto.',
        hasPendingChanges: false,
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid sync state');
    return {
      phase: parsed.phase || 'idle',
      message: parsed.message || 'Autosave pronto.',
      hasPendingChanges: !!parsed.hasPendingChanges,
      lastSuccessAt: typeof parsed.lastSuccessAt === 'string' ? parsed.lastSuccessAt : undefined,
      lastAttemptAt: typeof parsed.lastAttemptAt === 'string' ? parsed.lastAttemptAt : undefined,
      source: parsed.source === 'local' || parsed.source === 'remote' ? parsed.source : undefined,
    };
  } catch {
    return {
      phase: 'idle',
      message: 'Autosave pronto.',
      hasPendingChanges: false,
    };
  }
};

const emit = (next: AdminSyncState) => {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  } catch {
    // ignore
  }
};

const writeRaw = (next: AdminSyncState) => {
  memoryFallback = next;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    memoryFallback = null;
  } catch {
    // Keep the authoritative status in this window until storage recovers.
  }
  emit(next);
};

export const readAdminSyncState = (): AdminSyncState => readRaw();

export const subscribeAdminSyncState = (listener: (state: AdminSyncState) => void): (() => void) => {
  const notify = () => listener(readRaw());
  const onEvent = (event: Event) => {
    const next = (event as CustomEvent<AdminSyncState>).detail;
    if (next) listener(next);
    else notify();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY) notify();
  };

  try {
    window.addEventListener(EVENT_NAME, onEvent as EventListener);
    window.addEventListener('storage', onStorage);
  } catch {
    // ignore
  }

  notify();

  return () => {
    try {
      window.removeEventListener(EVENT_NAME, onEvent as EventListener);
      window.removeEventListener('storage', onStorage);
    } catch {
      // ignore
    }
  };
};

const update = (patch: Partial<AdminSyncState>) => {
  const cur = readRaw();
  const next: AdminSyncState = {
    ...cur,
    ...patch,
  };
  writeRaw(next);
};

export const markAdminSyncPending = (source: RepositorySource = 'remote') => {
  update({
    phase: 'pending',
    source,
    hasPendingChanges: true,
    lastAttemptAt: new Date().toISOString(),
    message: 'Modifiche locali in attesa di sincronizzazione…',
  });
};

export const markAdminSyncSaving = (source: RepositorySource = 'remote') => {
  update({
    phase: 'syncing',
    source,
    hasPendingChanges: true,
    lastAttemptAt: new Date().toISOString(),
    message: 'Salvataggio in corso…',
  });
};

export const markAdminSyncSynced = (updatedAt?: string | null, source: RepositorySource = 'remote') => {
  update({
    phase: 'synced',
    source,
    hasPendingChanges: false,
    lastSuccessAt: updatedAt || new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
    message: 'Tutte le modifiche salvate.',
  });
};

export const markAdminSyncErrorState = (message?: string, source: RepositorySource = 'remote') => {
  update({
    phase: 'error',
    source,
    hasPendingChanges: true,
    lastAttemptAt: new Date().toISOString(),
    message: (message || 'Errore di sincronizzazione.'),
  });
};

export const markAdminSyncConflictState = (message?: string, source: RepositorySource = 'remote') => {
  update({
    phase: 'conflict',
    source,
    hasPendingChanges: true,
    lastAttemptAt: new Date().toISOString(),
    message: (message || 'Conflitto di sincronizzazione: le modifiche locali non sono ancora state salvate.'),
  });
};

export const resetAdminSyncState = (source: RepositorySource = 'remote') => {
  writeRaw({
    phase: 'idle',
    source,
    hasPendingChanges: false,
    message: source === 'remote' ? 'Autosave pronto.' : 'Modalità locale attiva.',
  });
};
