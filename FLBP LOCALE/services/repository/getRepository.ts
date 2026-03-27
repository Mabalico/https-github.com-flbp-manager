import type { AppStateRepository } from './AppStateRepository';
import { LocalRepository } from './LocalRepository';
import { RemoteRepository } from './RemoteRepository';
import { isRemoteRepositoryEnabled } from './featureFlags';

let cachedRepo: AppStateRepository | null = null;

/**
 * Returns the singleton AppState repository.
 * Default is LocalRepository (localStorage).
 *
 * Remote repo is behind a feature flag.
 * It keeps localStorage as fallback and does best-effort remote sync only when Supabase is configured
 * and an authenticated JWT is available (when RLS is enabled).
 */
export const getAppStateRepository = (): AppStateRepository => {
  if (cachedRepo) return cachedRepo;

  const local = new LocalRepository();

  if (isRemoteRepositoryEnabled()) {
    cachedRepo = new RemoteRepository(local);
  } else {
    cachedRepo = local;
  }

  return cachedRepo;
};
