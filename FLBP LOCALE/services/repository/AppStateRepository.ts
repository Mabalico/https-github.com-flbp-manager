import type { AppState } from '../storageService';

export type RepositorySource = 'local' | 'remote';

export type RepositoryUpdateMeta = {
  updatedAt?: string;
  version?: number | null;
  operationId?: string | null;
  discardPendingDraft?: boolean;
};

export interface AppStateRepository {
  readonly source: RepositorySource;
  load(): AppState;
  save(state: AppState): void;

  subscribe?: (listener: (state: AppState, meta?: RepositoryUpdateMeta) => void) => () => void;
  /** Pause new writes and wait for requests already sent before a database restore. */
  prepareForExternalRestore?: () => Promise<void>;
  /** Retire stale drafts only after the restored snapshot has been read back. */
  completeExternalRestore?: (state: AppState, meta?: RepositoryUpdateMeta) => Promise<void>;
  resumeAfterExternalRestore?: () => void;
  refresh?: () => Promise<void>;
  flush?: () => Promise<void>;
}
