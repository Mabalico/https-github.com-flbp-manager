import { loadState, saveState, type AppState } from '../storageService';
import type { AppStateRepository } from './AppStateRepository';

export const LOCAL_STATE_UPDATED_AT_LS_KEY = 'flbp_local_state_updated_at';

/**
 * Local repository backed by localStorage (current behavior).
 * This is the source of truth while RemoteRepository is disabled.
 */
export class LocalRepository implements AppStateRepository {
  readonly source = 'local' as const;

  load(): AppState {
    const s = loadState();
    // Track a local "last updated" timestamp to support multi-admin conflict detection.
    // Stored outside the state to avoid any behavior changes.
    try {
      const existing = (localStorage.getItem(LOCAL_STATE_UPDATED_AT_LS_KEY) || '').trim();
      if (!existing) localStorage.setItem(LOCAL_STATE_UPDATED_AT_LS_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    return s;
  }

  save(state: AppState): void {
    saveState(state);
    try {
      localStorage.setItem(LOCAL_STATE_UPDATED_AT_LS_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
  }
}
