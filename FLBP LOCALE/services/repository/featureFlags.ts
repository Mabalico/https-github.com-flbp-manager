import { getSupabaseSession, REMOTE_BASE_UPDATED_AT_LS_KEY } from '../supabaseSession';
import { readViteAllowLocalOnly, readViteAutoStructuredSync, readViteRemoteRepo, readViteSupabaseAnonKey, readViteSupabaseUrl } from '../viteEnv';

/**
 * Feature flags for the data layer.
 *
 * Default: Remote repository DISABLED to avoid regressions.
 *
 * Enable via:
 * - Vite env: VITE_REMOTE_REPO=1
 * - or localStorage: flbp_remote_repo=1
 */

export const REMOTE_REPO_LS_KEY = 'flbp_remote_repo';
export const AUTO_STRUCTURED_SYNC_LS_KEY = 'flbp_auto_structured_sync';
export const DATA_PERSISTENCE_MODE_LS_KEY = 'flbp_data_persistence_mode';
export const APP_STATE_STORAGE_KEY = 'beer_pong_app_state';
export const LOCAL_STATE_UPDATED_AT_LS_KEY = 'flbp_local_state_updated_at';
export const REMOTE_STATE_CACHE_LS_KEY = 'flbp_remote_state_cache_v1';
export const REMOTE_UPDATE_AVAILABLE_LS_KEY = 'flbp_remote_update_available';

export type DataPersistenceMode = 'remote' | 'local_only';

const parseFlagValue = (value: string | null | undefined): boolean | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return null;
};

const hasConfiguredSupabase = (): boolean => {
  const url = (readViteSupabaseUrl() || '').trim();
  const anonKey = (readViteSupabaseAnonKey() || '').trim();
  return !!(url && anonKey);
};

const isRemoteRepoEnvEnabled = (): boolean => {
  const envOverride = parseFlagValue(readViteRemoteRepo());
  return envOverride === true;
};

const isLocalOnlyExplicitlyAllowed = (): boolean => {
  const envOverride = parseFlagValue(readViteAllowLocalOnly());
  return envOverride === true;
};

export const isRemotePersistenceLocked = (): boolean => {
  return hasConfiguredSupabase() && isRemoteRepoEnvEnabled() && !isLocalOnlyExplicitlyAllowed();
};

export const isRemoteRepositoryEnabled = (): boolean => {
  if (getDataPersistenceMode() === 'local_only') return false;

  try {
    const localOverride = parseFlagValue(localStorage.getItem(REMOTE_REPO_LS_KEY));
    if (localOverride != null) return localOverride;
  } catch {
    // ignore
  }

  const envOverride = parseFlagValue(readViteRemoteRepo());
  if (envOverride != null) return envOverride;

  return hasConfiguredSupabase();
};

export const getDataPersistenceMode = (): DataPersistenceMode => {
  if (isRemotePersistenceLocked()) return 'remote';

  try {
    const explicitMode = (localStorage.getItem(DATA_PERSISTENCE_MODE_LS_KEY) || '').trim().toLowerCase();
    if (explicitMode === 'local_only') return 'local_only';
    if (explicitMode === 'remote') return 'remote';
  } catch {
    // ignore
  }

  try {
    const localOverride = parseFlagValue(localStorage.getItem(REMOTE_REPO_LS_KEY));
    if (localOverride != null) return localOverride ? 'remote' : 'local_only';
  } catch {
    // ignore
  }

  const envOverride = parseFlagValue(readViteRemoteRepo());
  if (envOverride != null) return envOverride ? 'remote' : 'local_only';

  return hasConfiguredSupabase() ? 'remote' : 'local_only';
};

export const isLocalOnlyMode = (): boolean => getDataPersistenceMode() === 'local_only';

export const setDataPersistenceMode = (mode: DataPersistenceMode) => {
  if (mode === 'local_only' && isRemotePersistenceLocked()) {
    try {
      localStorage.setItem(DATA_PERSISTENCE_MODE_LS_KEY, 'remote');
      localStorage.setItem(REMOTE_REPO_LS_KEY, '1');
    } catch {
      // ignore
    }
    return;
  }

  try {
    localStorage.setItem(DATA_PERSISTENCE_MODE_LS_KEY, mode);
    localStorage.setItem(REMOTE_REPO_LS_KEY, mode === 'remote' ? '1' : '0');
  } catch {
    // ignore
  }
};

export const clearLocalAppStateCaches = () => {
  try {
    localStorage.removeItem(APP_STATE_STORAGE_KEY);
    localStorage.removeItem(LOCAL_STATE_UPDATED_AT_LS_KEY);
    localStorage.removeItem(REMOTE_STATE_CACHE_LS_KEY);
    localStorage.removeItem(REMOTE_UPDATE_AVAILABLE_LS_KEY);
    localStorage.removeItem(REMOTE_BASE_UPDATED_AT_LS_KEY);
  } catch {
    // ignore
  }
};

/**
 * Enables best-effort automatic structured DB export (normalised + public mirrors).
 *
 * Default:
 * - explicit localStorage/env wins
 * - otherwise ON when DB-first is enabled and a Supabase session is already saved on this device
 * - otherwise OFF
 * Enable via:
 * - VITE_AUTO_STRUCTURED_SYNC=1
 * - or localStorage flbp_auto_structured_sync=1
 */
export const isAutoStructuredSyncEnabled = (): boolean => {
  try {
    const localOverride = parseFlagValue(localStorage.getItem(AUTO_STRUCTURED_SYNC_LS_KEY));
    if (localOverride != null) return localOverride;
  } catch {
    // ignore
  }

  const envOverride = parseFlagValue(readViteAutoStructuredSync());
  if (envOverride != null) return envOverride;

  if (!isRemoteRepositoryEnabled()) return false;

  try {
    const session = getSupabaseSession();
    return !!(session?.accessToken || session?.refreshToken);
  } catch {
    return false;
  }
};

export const setAutoStructuredSyncEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(AUTO_STRUCTURED_SYNC_LS_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
};
