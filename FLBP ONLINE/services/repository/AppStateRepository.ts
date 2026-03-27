import type { AppState } from '../storageService';

export type RepositorySource = 'local' | 'remote';

export type RepositoryUpdateMeta = {
  updatedAt?: string;
};

export interface AppStateRepository {
  readonly source: RepositorySource;
  load(): AppState;
  save(state: AppState): void;

  subscribe?: (listener: (state: AppState, meta?: RepositoryUpdateMeta) => void) => () => void;
  refresh?: () => Promise<void>;
}
