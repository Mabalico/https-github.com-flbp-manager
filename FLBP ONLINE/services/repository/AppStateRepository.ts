import type { AppState } from '../storageService';

export type ReviewedDraftReconciliation = {
  baseState: AppState;
  baseUpdatedAt?: string | null;
  baseVersion?: number | null;
  expectedDraftState: AppState;
  expectedDraftOperationId?: string | null;
  dataPlane: { mode: 'local' | 'cloud'; epoch?: number | null; baseUrl?: string | null };
};

export type AdminCommitOptions = { skipStructuredSync?: boolean; reviewedDraft?: ReviewedDraftReconciliation };

export type RepositorySource = 'local' | 'remote';

export type RepositoryUpdateMeta = {
  updatedAt?: string;
  version?: number | null;
  operationId?: string | null;
  /** Explicit authoritative hydration: discard this window's pending draft. */
  discardPendingDraft?: boolean;
};

export interface AppStateRepository {
  readonly source: RepositorySource;
  load(): AppState;
  save(state: AppState): void;

  subscribe?: (listener: (state: AppState, meta?: RepositoryUpdateMeta) => void) => () => void;
  acknowledgeExternalCommit?: (state: AppState, meta?: RepositoryUpdateMeta) => void;
  /** Pause new writes and wait for requests already sent before a database restore. */
  prepareForExternalRestore?: () => Promise<void>;
  /** Retire stale drafts only after the restored snapshot has been read back. */
  completeExternalRestore?: (state: AppState, meta?: RepositoryUpdateMeta) => Promise<void>;
  resumeAfterExternalRestore?: () => void;
  refresh?: () => Promise<void>;
  /** Returns the confirmed snapshot, including any automatic conflict merge. */
  flush?: () => Promise<AppState | void>;
  reconcileDraft?: (state: AppState, review: ReviewedDraftReconciliation) => Promise<AppState | void>;
}
