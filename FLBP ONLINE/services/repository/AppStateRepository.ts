import type { AppState } from '../storageService';

export type RepositorySource = 'local' | 'remote';

export type RepositoryUpdateMeta = {
  updatedAt?: string;
  version?: number | null;
  operationId?: string | null;
};

export interface AppStateRepository {
  readonly source: RepositorySource;
  load(): AppState;
  save(state: AppState): void;

  subscribe?: (listener: (state: AppState, meta?: RepositoryUpdateMeta) => void) => () => void;
  acknowledgeExternalCommit?: (state: AppState, meta?: RepositoryUpdateMeta) => void;
  refresh?: () => Promise<void>;
  flush?: () => Promise<void>;
}
