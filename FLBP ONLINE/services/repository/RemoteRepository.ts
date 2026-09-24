import { coerceAppState, type AppState } from '../storageService';
import { markAdminSyncConflictState, markAdminSyncErrorState, markAdminSyncPending, markAdminSyncSaving, markAdminSyncSynced, resetAdminSyncState } from '../adminSyncState';
import { getSupabaseConfig, getSupabaseSession, hasSupabaseWriteSession, pullWorkspaceState, pushWorkspaceState, setRemoteBaseUpdatedAt } from '../supabaseRest';
import { isAdminWriteBlockedByLease } from '../adminWriteLeaseState';
import { clearDbSyncCurrentIssue, markDbSyncConflict, markDbSyncError, markDbSyncOk, markRemoteVersions } from '../dbDiagnostics';
import { resolveDataPlane } from '../dataPlaneClient';
import { clearLocalAppStateCaches } from './featureFlags';
import { acknowledgeRemoteDraftCache, clearRemoteDraftCache, discardRemoteDraftOperation, discardRestorableRemoteDrafts, ensureRemoteDraftCacheDurable, getRemoteDraftOwnerId, hasRemoteDraftCache, isRemoteDraftOperationClosed, isRemoteDraftOwnerActive, readRemoteDraftCache, readRemoteDraftPointer, readRestorableRemoteDraftCache, startRemoteDraftOwnerHeartbeat, touchRemoteDraftOwner, writeRemoteDraftCache } from './remoteDraftCache';
import type { AppStateRepository, RepositoryUpdateMeta, ReviewedDraftReconciliation } from './AppStateRepository';
import { tryMergeRemoteStateConflict } from '../stateConflictMerge';
import { hasMeaningfulAppState } from '../appStateMeaning';
import { subscribeWorkspaceStateRealtime } from './workspaceStateRealtime';
import { appendDurableStateCheckpoint, listDurableStateCheckpoints, readDurableStateCheckpoint } from './durableStateJournal';
import { normalizeWorkspaceVersion } from '../workspaceVersion';
import { stableStateSerialize } from '../stableStateSerialize';

/**
 * Remote repository (Supabase REST).
 *
 * In remote mode the database is the source of truth for confirmed state.
 * While a write is pending or fails, we keep a lightweight local draft cache
 * so the admin does not lose recent edits on refresh / temporary network loss.
 */
export class RemoteRepository implements AppStateRepository {
  readonly source = 'remote' as const;

  private static readonly REMOTE_POLL_INTERVAL_MS = 20000;
  private static readonly REMOTE_SAVE_DEBOUNCE_MS = 100;
  private static readonly REMOTE_SNAPSHOT_EVENT_KEY = 'flbp_remote_snapshot_event';
  private static readonly FLUSH_BACKOFF_STEPS_MS = [5000, 15000, 45000, 120000];
  private static readonly FLUSH_BACKOFF_JITTER_RATIO = 0.2;

  private readonly instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private readonly draftOwnerId = getRemoteDraftOwnerId();
  private pullKicked = false;
  private externalRestorePaused = false;
  private pendingTimer: number | null = null;
  private pendingState: AppState | null = null;
  private pendingOperationId: string | null = null;
  private pendingBaseUpdatedAt: string | null = null;
  private pendingBaseVersion: number | null = null;
  private pendingGeneration = 0;
  private activeFlushOperationId: string | null = null;
  private flushInFlight: Promise<void> | null = null;
  private pullInFlight: Promise<boolean> | null = null;
  private listeners = new Set<(state: AppState, meta?: RepositoryUpdateMeta) => void>();
  private lastRemoteUpdatedAt: string | null = null;
  private lastRemoteVersion: number | null = null;
  private lastStateFingerprint = '';
  private conflictedDraftFingerprint: string | null = null;
  private conflictMergeAttempts = 0;
  private lastRemoteState: AppState | null = null;
  private flushFailureCount = 0;
  private flushCooldownUntil = 0;
  private flushLifecycleBypassUsedForCooldownUntil = 0;
  private flushBackoffTimer: number | null = null;
  private durableRecoveryInFlight: Promise<void> | null = null;
  private restoredDraftNeedsBaseline = false;
  private restoredDraftBlocked = false;

  private isAdminViewActive(): boolean {
    try {
      return (sessionStorage.getItem('flbp_active_view_v1') || '').trim() === 'admin';
    } catch {
      return false;
    }
  }

  private shouldBackgroundRefresh(): boolean {
    if (this.pendingState || hasRemoteDraftCache()) return true;
    return this.isAdminViewActive();
  }

  private flushRetryDelayWithJitter() {
    const base = RemoteRepository.FLUSH_BACKOFF_STEPS_MS[
      Math.min(Math.max(this.flushFailureCount - 1, 0), RemoteRepository.FLUSH_BACKOFF_STEPS_MS.length - 1)
    ];
    const jitter = 1 + ((Math.random() * 2 - 1) * RemoteRepository.FLUSH_BACKOFF_JITTER_RATIO);
    return Math.max(1000, Math.round(base * jitter));
  }

  private clearFlushBackoff() {
    this.flushFailureCount = 0;
    this.flushCooldownUntil = 0;
    this.flushLifecycleBypassUsedForCooldownUntil = 0;
    if (this.flushBackoffTimer != null) {
      window.clearTimeout(this.flushBackoffTimer);
      this.flushBackoffTimer = null;
    }
  }

  private noteFlushFailure(markLifecycleBypassUsed = false) {
    this.flushFailureCount += 1;
    const delayMs = this.flushRetryDelayWithJitter();
    this.flushCooldownUntil = Date.now() + delayMs;
    this.flushLifecycleBypassUsedForCooldownUntil = markLifecycleBypassUsed ? this.flushCooldownUntil : 0;
    if (this.flushBackoffTimer != null) window.clearTimeout(this.flushBackoffTimer);
    this.flushBackoffTimer = window.setTimeout(() => {
      this.flushBackoffTimer = null;
      void this.flushNow();
    }, delayMs);
    return delayMs;
  }

  private isFlushCoolingDown(allowLifecycleBypass?: boolean) {
    if (!this.flushCooldownUntil) return false;
    const now = Date.now();
    if (now >= this.flushCooldownUntil) return false;
    if (allowLifecycleBypass && this.flushLifecycleBypassUsedForCooldownUntil !== this.flushCooldownUntil) {
      this.flushLifecycleBypassUsedForCooldownUntil = this.flushCooldownUntil;
      return false;
    }
    return true;
  }

  private publishRemoteSnapshotUpdate(updatedAt?: string | null) {
    if (!updatedAt) return;
    try {
      localStorage.setItem(RemoteRepository.REMOTE_SNAPSHOT_EVENT_KEY, JSON.stringify({
        sourceId: this.instanceId,
        updatedAt,
        ts: Date.now(),
      }));
    } catch {
      // Cross-tab refresh is best-effort; polling remains the fallback.
    }
  }

  private handleRemoteSnapshotStorageEvent = (event: StorageEvent) => {
    if (event.key !== RemoteRepository.REMOTE_SNAPSHOT_EVENT_KEY || !event.newValue) return;

    try {
      const payload = JSON.parse(event.newValue) as { sourceId?: string; updatedAt?: string };
      const updatedAt = String(payload.updatedAt || '').trim();
      if (!updatedAt || payload.sourceId === this.instanceId) return;
      if (updatedAt === this.lastRemoteUpdatedAt) return;
      if (this.pendingState || hasRemoteDraftCache()) return;

      void this.pullAndApply({ forceEmit: true });
    } catch {
      // Ignore malformed storage events from older bundles.
    }
  };

  private restoreCachedDraft(): boolean {
    const cachedDraft = readRestorableRemoteDraftCache();
    if (cachedDraft?.state && hasMeaningfulAppState(cachedDraft.state)) {
      this.pendingState = cachedDraft.state;
      this.pendingOperationId = cachedDraft.operationId;
      this.pendingBaseUpdatedAt = cachedDraft.baseUpdatedAt || null;
      this.pendingBaseVersion = normalizeWorkspaceVersion(cachedDraft.baseVersion);
      this.pendingGeneration += 1;
      this.restoredDraftNeedsBaseline = true;
      this.restoredDraftBlocked = false;
      markAdminSyncPending(this.source);
      return true;
    }
    // Una bozza recuperata da IndexedDB può non avere una copia in
    // localStorage (per esempio quando la quota è esaurita).
    if (!this.pendingState) {
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
      this.restoredDraftNeedsBaseline = false;
      this.restoredDraftBlocked = false;
    }
    return false;
  }

  private async restoreIndexedDbDraft(expectedGeneration: number): Promise<boolean> {
    const workspaceId = getSupabaseConfig()?.workspaceId || 'default';
    const rows = await listDurableStateCheckpoints();
    const candidates = rows
      .filter((row) => row?.status === 'pending' && row?.operationId && row?.state)
      .filter((row) => !isRemoteDraftOperationClosed(row.operationId))
      .filter((row) => !row.workspaceId || row.workspaceId === workspaceId)
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    let checkpoint = candidates.find((row) => !row.ownerId || row.ownerId === this.draftOwnerId) || null;
    if (!checkpoint) checkpoint = candidates.find((row) => !isRemoteDraftOwnerActive(row.ownerId)) || null;
    if (!checkpoint?.state || !hasMeaningfulAppState(checkpoint.state)) return false;
    if (this.pendingGeneration !== expectedGeneration || this.pendingState) return false;

    if (checkpoint.ownerId !== this.draftOwnerId || checkpoint.workspaceId !== workspaceId) {
      checkpoint = { ...checkpoint, ownerId: this.draftOwnerId, workspaceId };
      await appendDurableStateCheckpoint(checkpoint);
    }
    writeRemoteDraftCache(
      checkpoint.state,
      checkpoint.baseUpdatedAt || null,
      checkpoint.operationId,
      normalizeWorkspaceVersion(checkpoint.baseVersion),
      this.draftOwnerId,
      checkpoint.writerId ?? null,
    );

    this.pendingState = coerceAppState(checkpoint.state);
    this.pendingOperationId = checkpoint.operationId;
    this.pendingBaseUpdatedAt = checkpoint.baseUpdatedAt || null;
    this.pendingBaseVersion = normalizeWorkspaceVersion(checkpoint.baseVersion);
    this.pendingGeneration += 1;
    this.restoredDraftNeedsBaseline = true;
    this.restoredDraftBlocked = false;
    markAdminSyncPending(this.source);
    this.emit(this.pendingState, { updatedAt: checkpoint.baseUpdatedAt || undefined });
    return true;
  }

  private startIndexedDbDraftRecovery() {
    if (this.durableRecoveryInFlight) return;
    const expectedGeneration = this.pendingGeneration;
    const recovery = this.restoreIndexedDbDraft(expectedGeneration)
      .then(async (restored) => {
        if (restored) await this.flushNow();
        else if (this.shouldBackgroundRefresh()) await this.pullAndApply({ forceEmit: true });
      })
      .finally(() => {
        if (this.durableRecoveryInFlight === recovery) this.durableRecoveryInFlight = null;
      });
    this.durableRecoveryInFlight = recovery;
  }

  private shouldBlockSuspiciousEmptyAutosave(state: AppState | null | undefined): boolean {
    return !hasMeaningfulAppState(state) && hasMeaningfulAppState(this.lastRemoteState);
  }

  constructor(_localFallback: AppStateRepository, options?: { backgroundSync?: boolean; realtime?: boolean }) {
    clearLocalAppStateCaches();
    touchRemoteDraftOwner(this.draftOwnerId);
    startRemoteDraftOwnerHeartbeat();

    const restoredCachedDraft = this.restoreCachedDraft();
    if (!restoredCachedDraft) {
      resetAdminSyncState(this.source);
    }

    if (options?.backgroundSync === false) return;

    const refresh = () => {
      if (!this.shouldBackgroundRefresh()) return;
      void this.refresh();
    };

    try {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          refresh();
        }
      });
      window.addEventListener('online', refresh);
      window.addEventListener('focus', refresh);
      window.addEventListener('storage', this.handleRemoteSnapshotStorageEvent);
      window.setInterval(() => {
        try {
          if (document.visibilityState === 'visible') refresh();
        } catch {
          refresh();
        }
      }, RemoteRepository.REMOTE_POLL_INTERVAL_MS);
    } catch {
      // ignore
    }

    if (options?.realtime !== false) {
      try {
        subscribeWorkspaceStateRealtime(({ updatedAt }) => {
          if (!this.shouldBackgroundRefresh()) return;
          if (updatedAt && updatedAt === this.lastRemoteUpdatedAt) return;
          void this.refresh();
        });
      } catch {
        // realtime is best-effort: polling continues to cover the gap
      }
    }

    if (!restoredCachedDraft) this.startIndexedDbDraftRecovery();
  }

  private fingerprint(state: AppState): string {
    try {
      return stableStateSerialize(coerceAppState(state));
    } catch {
      return `${Date.now()}`;
    }
  }

  private rememberRemoteState(state: AppState, updatedAt?: string | null, opts?: { broadcast?: boolean; version?: number | null }) {
    const incomingVersion = opts && Object.prototype.hasOwnProperty.call(opts, 'version')
      ? normalizeWorkspaceVersion(opts.version)
      : null;
    if (
      incomingVersion != null
      && this.lastRemoteVersion != null
      && incomingVersion < this.lastRemoteVersion
    ) {
      // Workspace versions are monotonic. A delayed pull/commit response must
      // never replace a newer match-patch acknowledgement already observed by
      // this repository instance.
      return;
    }
    const safeState = coerceAppState(state);
    this.lastStateFingerprint = this.fingerprint(safeState);
    this.lastRemoteUpdatedAt = updatedAt || null;
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'version')) {
      this.lastRemoteVersion = incomingVersion;
    }
    this.conflictedDraftFingerprint = null;
    this.lastRemoteState = safeState;

    try {
      setRemoteBaseUpdatedAt(updatedAt || null);
      markRemoteVersions({
        remoteUpdatedAt: updatedAt || null,
        remoteBaseUpdatedAt: updatedAt || null
      });
    } catch {
      // ignore
    }

    if (opts?.broadcast) {
      this.publishRemoteSnapshotUpdate(updatedAt || null);
    }
  }

  private clearConflictPauseIfStateChanged(nextFingerprint?: string | null) {
    if (!this.conflictedDraftFingerprint) return;
    if (!nextFingerprint || nextFingerprint !== this.conflictedDraftFingerprint) {
      this.conflictedDraftFingerprint = null;
    }
  }

  /**
   * A draft recovered after a reload belongs to a remote baseline from the
   * previous document. Verify that cursor before the first write. This avoids
   * replaying an old WebView/IndexedDB checkpoint just because the Admin page
   * mounted and echoed the recovered state through React's persistence effect.
   */
  private async validateRestoredDraftBaseline(
    state: AppState,
    generation: number,
    operationId: string | null,
    baseUpdatedAt: string | null,
    baseVersion: number | null,
  ): Promise<boolean> {
    if (!this.restoredDraftNeedsBaseline) return !this.restoredDraftBlocked;

    const fingerprint = this.fingerprint(state);
    const isStillCurrent = () => this.pendingGeneration === generation
      && this.pendingOperationId === operationId
      && !!this.pendingState
      && this.fingerprint(this.pendingState) === fingerprint;

    try {
      const row = await pullWorkspaceState({
        source: 'RemoteRepository.validateRestoredDraftBaseline',
        kind: 'admin',
      });
      if (!row?.state) {
        throw new Error('Il database autorevole non ha restituito uno snapshot verificabile.');
      }
      if (!isStillCurrent()) return false;

      const remoteState = coerceAppState(row.state);
      const remoteFingerprint = this.fingerprint(remoteState);
      const remoteVersion = normalizeWorkspaceVersion(row.version);
      const draftVersion = normalizeWorkspaceVersion(baseVersion);
      const remoteUpdatedAt = row.updated_at || null;

      if (remoteFingerprint === fingerprint) {
        this.pendingState = null;
        this.pendingOperationId = null;
        this.pendingBaseUpdatedAt = null;
        this.pendingBaseVersion = null;
        this.restoredDraftNeedsBaseline = false;
        this.restoredDraftBlocked = false;
        this.pendingGeneration += 1;
        this.clearFlushBackoff();
        acknowledgeRemoteDraftCache(remoteUpdatedAt, operationId);
        this.rememberRemoteState(remoteState, remoteUpdatedAt, { version: remoteVersion });
        clearDbSyncCurrentIssue();
        markDbSyncOk('snapshot');
        markAdminSyncSynced(remoteUpdatedAt, this.source);
        return false;
      }

      // Local SQLite always exposes a numeric version. Older cloud schemas may
      // expose only updated_at, so use the timestamp strictly as a fallback
      // when the authoritative row has no version at all.
      const cursorMatches = remoteVersion != null
        ? draftVersion != null && draftVersion === remoteVersion
        : !!baseUpdatedAt && !!remoteUpdatedAt && baseUpdatedAt === remoteUpdatedAt;

      this.rememberRemoteState(remoteState, remoteUpdatedAt, { version: remoteVersion });
      if (cursorMatches) {
        this.restoredDraftNeedsBaseline = false;
        this.restoredDraftBlocked = false;
        return true;
      }

      this.restoredDraftNeedsBaseline = false;
      this.restoredDraftBlocked = true;
      this.conflictedDraftFingerprint = fingerprint;
      this.clearFlushBackoff();
      const draftLabel = draftVersion == null ? 'senza versione valida' : `v${draftVersion}`;
      const remoteLabel = remoteVersion == null ? 'con timestamp diverso' : `v${remoteVersion}`;
      const message = `Bozza recuperata ${draftLabel}, ma il database è ${remoteLabel}. Nessun dato è stato sovrascritto: scegli esplicitamente quale versione usare.`;
      markDbSyncConflict(message, {
        remoteUpdatedAt,
        remoteBaseUpdatedAt: baseUpdatedAt,
      });
      markAdminSyncConflictState(message, this.source);
      return false;
    } catch (error: any) {
      if (!isStillCurrent()) return false;
      const delayMs = this.noteFlushFailure();
      const retrySeconds = Math.ceil(delayMs / 1000);
      const message = `${error?.message || 'Impossibile verificare la bozza recuperata.'} Nessuna scrittura eseguita; nuovo controllo tra ${retrySeconds}s.`;
      markDbSyncError(message);
      markAdminSyncErrorState(message, this.source);
      return false;
    }
  }

  private async retireSupersededDraft(operationId: string | null): Promise<void> {
    const replacementId = this.pendingOperationId;
    if (!operationId || !replacementId || replacementId === operationId) return;
    const durable = await ensureRemoteDraftCacheDurable(replacementId);
    const alreadySynced = !durable && (await readDurableStateCheckpoint(replacementId))?.status === 'synced';
    if (durable || alreadySynced) await discardRemoteDraftOperation(operationId);
  }

  private async resolveRemoteConflict(
    localState: AppState,
    baseState: AppState | null,
    operationId: string | null,
    isStillCurrent: () => boolean,
  ): Promise<boolean> {
    try {
      const row = await pullWorkspaceState({
        source: 'RemoteRepository.resolveRemoteConflict',
        kind: 'admin',
      });
      // A newer edit or an explicit recovery owns the draft now. The old
      // response must never acknowledge, replace or pause that operation.
      if (!isStillCurrent()) return false;
      if (!row?.state) return false;
      const remoteVersion = normalizeWorkspaceVersion(row.version);
      if (remoteVersion != null && this.lastRemoteVersion != null && remoteVersion < this.lastRemoteVersion) {
        return false;
      }

      const remoteState = coerceAppState(row.state);
      const remoteFingerprint = this.fingerprint(remoteState);
      const mergeResult = this.fingerprint(localState) === remoteFingerprint
        ? { ok: true as const, state: remoteState }
        : tryMergeRemoteStateConflict({ baseState, localState, remoteState });
      if (mergeResult.ok === false) return false;

      if (this.fingerprint(mergeResult.state) === remoteFingerprint) {
        this.pendingState = null;
        this.pendingOperationId = null;
        this.pendingBaseUpdatedAt = null;
        this.pendingBaseVersion = null;
        this.restoredDraftNeedsBaseline = false;
        this.restoredDraftBlocked = false;
        acknowledgeRemoteDraftCache(row.updated_at || null, operationId);
        this.rememberRemoteState(remoteState, row.updated_at || null, { version: remoteVersion });
        this.clearFlushBackoff();
        this.conflictMergeAttempts = 0;
        clearDbSyncCurrentIssue();
        markDbSyncOk('snapshot');
        markAdminSyncSynced(row.updated_at || null, this.source);
        this.emit(remoteState, { updatedAt: row.updated_at || undefined, version: remoteVersion });
        return true;
      }

      // The reconciled payload is a new operation against this exact baseline.
      // Send it through the normal durable flush, including its generation
      // guards, instead of a second unguarded write path.
      if (this.conflictMergeAttempts >= 3) return false;
      this.conflictMergeAttempts += 1;
      this.rememberRemoteState(remoteState, row.updated_at || null, { version: remoteVersion });
      this.pendingState = mergeResult.state;
      this.pendingGeneration += 1;
      const mergeDraft = writeRemoteDraftCache(mergeResult.state, row.updated_at || null, null, remoteVersion);
      this.pendingOperationId = mergeDraft.operationId;
      this.pendingBaseUpdatedAt = mergeDraft.baseUpdatedAt || null;
      this.pendingBaseVersion = normalizeWorkspaceVersion(mergeDraft.baseVersion);
      // Retire the original only once its replacement is durable.
      void this.retireSupersededDraft(operationId);
      this.clearFlushBackoff();
      clearDbSyncCurrentIssue();
      markAdminSyncPending(this.source);
      // React must continue editing the union, otherwise its next autosave
      // can undo the remote changes that the merge has just preserved.
      this.emit(mergeResult.state, { updatedAt: row.updated_at || undefined, version: remoteVersion });
      return true;
    } catch {
      return false;
    }
  }

  subscribe(listener: (state: AppState, meta?: RepositoryUpdateMeta) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(state: AppState, meta?: RepositoryUpdateMeta) {
    try {
      for (const listener of this.listeners) {
        try {
          listener(state, meta);
        } catch {
          // ignore listener errors
        }
      }
    } catch {
      // ignore
    }
  }

  acknowledgeExternalCommit = (state: AppState, meta?: RepositoryUpdateMeta): void => {
    const safeState = coerceAppState(state);
    const currentDraft = readRemoteDraftPointer() || readRemoteDraftCache();
    const explicitlyDiscardsPendingDraft = meta?.discardPendingDraft === true;
    const completedOperationId = meta?.operationId
      || (explicitlyDiscardsPendingDraft ? (this.pendingOperationId || currentDraft?.operationId || null) : null);
    const closesOwnPendingOperation = explicitlyDiscardsPendingDraft || (!!completedOperationId && (
      this.pendingOperationId === completedOperationId
      || currentDraft?.operationId === completedOperationId
    ));

    if (closesOwnPendingOperation) {
      if (this.pendingTimer != null) {
        window.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
      }
      this.pendingState = null;
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
      this.pendingGeneration += 1;
      this.clearFlushBackoff();
      this.conflictedDraftFingerprint = null;
      this.restoredDraftNeedsBaseline = false;
      this.restoredDraftBlocked = false;
    }
    acknowledgeRemoteDraftCache(meta?.updatedAt || null, completedOperationId);

    // A match-patch acknowledgement must never discard a full-state draft
    // owned by another operation in this window. Keep it durable so a 409 can
    // be reconciled explicitly instead of silently losing the unrelated edit.
    if (this.pendingState || hasRemoteDraftCache()) {
      const acknowledgedVersion = normalizeWorkspaceVersion(meta?.version);
      if (acknowledgedVersion != null) {
        this.lastRemoteVersion = Math.max(this.lastRemoteVersion ?? 0, acknowledgedVersion);
      }
      this.lastRemoteUpdatedAt = meta?.updatedAt || this.lastRemoteUpdatedAt;
      markAdminSyncPending(this.source);
      return;
    }

    this.rememberRemoteState(safeState, meta?.updatedAt || null, {
      broadcast: true,
      version: meta?.version ?? null,
    });
    clearDbSyncCurrentIssue();
    markDbSyncOk('match-result');
    markAdminSyncSynced(meta?.updatedAt || null, this.source);
  };

  prepareForExternalRestore = async (): Promise<void> => {
    this.externalRestorePaused = true;
    if (this.pendingTimer != null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.clearFlushBackoff();
    await this.durableRecoveryInFlight;
    await this.flushInFlight;
    await this.pullInFlight;
    // A drained request may have scheduled a retry in its finally block.
    if (this.pendingTimer != null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.clearFlushBackoff();
  };

  completeExternalRestore = async (state: AppState, meta?: RepositoryUpdateMeta): Promise<void> => {
    if (!this.externalRestorePaused) throw new Error('Ripristino senza pausa dei salvataggi.');
    if (!(await discardRestorableRemoteDrafts(this.pendingOperationId))) {
      throw new Error('Impossibile chiudere le bozze precedenti. Riprova il recupero dello snapshot.');
    }
    this.acknowledgeExternalCommit(state, { ...meta, discardPendingDraft: true });
  };

  resumeAfterExternalRestore = (): void => {
    this.externalRestorePaused = false;
    if (this.pendingState) {
      this.pendingTimer = window.setTimeout(() => {
        this.pendingTimer = null;
        void this.flushNow();
      }, RemoteRepository.REMOTE_SAVE_DEBOUNCE_MS);
    }
  };

  refresh = async (): Promise<void> => {
    if (this.externalRestorePaused) return;
    if (this.durableRecoveryInFlight) await this.durableRecoveryInFlight;
    if (!this.pendingState && hasRemoteDraftCache()) {
      this.restoreCachedDraft();
    }
    if (this.pendingState || hasRemoteDraftCache()) {
      const pendingFingerprint = this.pendingState ? this.fingerprint(this.pendingState) : null;
      if (pendingFingerprint && this.conflictedDraftFingerprint === pendingFingerprint) {
        return;
      }
      await this.flushNow();
      if (this.pendingState || hasRemoteDraftCache()) return;
    }
    await this.pullAndApply({ forceEmit: true });
  };

  load(): AppState {
    const cfg = getSupabaseConfig();
    if (!cfg) return coerceAppState({});

    if (!this.pendingState) this.restoreCachedDraft();
    if (this.pendingState) return this.pendingState;

    if (!this.pullKicked && !this.durableRecoveryInFlight && this.shouldBackgroundRefresh()) {
      this.pullKicked = true;
      void this.pullAndApply({ forceEmit: true });
    }

    return coerceAppState({});
  }

  save(state: AppState): void {
    if (this.externalRestorePaused) return;
    const cfg = getSupabaseConfig();
    if (!cfg) return;
    if (!this.isAdminViewActive()) {
      // Referees, player/public views and TV use their dedicated RPCs. They
      // must never create a recoverable full-workspace Admin draft from a
      // partial/stale client snapshot.
      return;
    }
    if (isAdminWriteBlockedByLease()) {
      // A passive/stale Admin window must never create a draft that could be
      // restored and pushed after the active writer closes.
      return;
    }
    if (!this.lastRemoteUpdatedAt && !hasMeaningfulAppState(state)) return;
    if (this.shouldBlockSuspiciousEmptyAutosave(state)) {
      markAdminSyncErrorState(
        'Protezione autosave: ho bloccato un salvataggio remoto di uno stato vuoto. Se vuoi davvero pubblicare un workspace vuoto, usa gli strumenti manuali nella sezione Persistenza online.',
        this.source
      );
      return;
    }

    const fingerprint = this.fingerprint(state);
    if (!this.pendingState || fingerprint !== this.fingerprint(this.pendingState)) {
      this.conflictMergeAttempts = 0;
    }
    if (!this.restoredDraftBlocked) {
      this.clearConflictPauseIfStateChanged(fingerprint);
    }
    if (fingerprint === this.lastStateFingerprint && !this.pendingState) {
      clearRemoteDraftCache();
      markAdminSyncSynced(this.lastRemoteUpdatedAt, this.source);
      return;
    }

    // A pending draft keeps its original cursor even if an independent match
    // patch has advanced the server. Only a confirmed flush/merge rebases it.
    const preservesPendingCursor = !!this.pendingState || this.restoredDraftNeedsBaseline || this.restoredDraftBlocked;
    const draftBaseUpdatedAt = preservesPendingCursor
      ? (this.pendingBaseUpdatedAt ?? this.lastRemoteUpdatedAt)
      : this.lastRemoteUpdatedAt;
    const draftBaseVersion = preservesPendingCursor
      ? (this.pendingBaseVersion ?? this.lastRemoteVersion)
      : this.lastRemoteVersion;
    this.pendingState = state;
    this.pendingGeneration += 1;
    const cachedOperationId = readRemoteDraftCache()?.operationId || null;
    const reusableOperationId = this.activeFlushOperationId
      && (this.pendingOperationId === this.activeFlushOperationId || cachedOperationId === this.activeFlushOperationId)
      ? null
      : (this.pendingOperationId || cachedOperationId);
    const draft = writeRemoteDraftCache(
      state,
      draftBaseUpdatedAt,
      reusableOperationId,
      draftBaseVersion,
    );
    this.pendingOperationId = draft.operationId;
    this.pendingBaseUpdatedAt = draft.baseUpdatedAt || null;
    this.pendingBaseVersion = draft.baseVersion ?? null;
    markAdminSyncPending(this.source);

    if (this.restoredDraftBlocked) {
      this.conflictedDraftFingerprint = fingerprint;
      markAdminSyncConflictState(
        'Questa bozza proviene da una versione precedente del database. Resta esportabile, ma non verrà inviata finché non scegli esplicitamente quale versione usare.',
        this.source,
      );
      return;
    }

    if (this.pendingTimer != null) {
      window.clearTimeout(this.pendingTimer);
    }
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      void this.flushNow();
    }, RemoteRepository.REMOTE_SAVE_DEBOUNCE_MS);
  }

  reconcileDraft = async (state: AppState, review: ReviewedDraftReconciliation): Promise<AppState | void> => {
    if (this.externalRestorePaused) throw new Error("Ripristino database in corso.");
    if (this.durableRecoveryInFlight) await this.durableRecoveryInFlight;
    if (this.flushInFlight) await this.flushInFlight;
    const route = await resolveDataPlane({ force: true });
    if (this.externalRestorePaused) throw new Error("Ripristino database in corso.");
    if (route.mode !== review.dataPlane.mode || route.epoch !== review.dataPlane.epoch
      || (route.mode === 'local' && route.baseUrl !== review.dataPlane.baseUrl)) {
      throw new Error('Il database principale è cambiato. Ripeti il confronto.');
    }
    if (!this.isAdminViewActive() || isAdminWriteBlockedByLease()) {
      throw new Error('Acquisisci il controllo Admin prima di recuperare le modifiche.');
    }
    const current = this.pendingState || this.lastRemoteState;
    if (!current || this.fingerprint(current) !== this.fingerprint(review.expectedDraftState)
      || (review.expectedDraftOperationId && this.pendingOperationId !== review.expectedDraftOperationId)) {
      throw new Error('La bozza è cambiata. Ripeti il confronto prima di recuperarla.');
    }
    const version = normalizeWorkspaceVersion(review.baseVersion);
    if ((route.mode === 'local' && version == null)
      || (version != null && this.lastRemoteVersion != null && version < this.lastRemoteVersion)
      || (route.mode === 'cloud' && !review.baseUpdatedAt)) {
      throw new Error('La versione confrontata non è più valida. Ripeti il confronto.');
    }
    const oldOperationId = this.pendingOperationId;
    const next = coerceAppState(state);
    this.rememberRemoteState(review.baseState, review.baseUpdatedAt, { version });
    this.pendingState = next;
    this.pendingGeneration += 1;
    const draft = writeRemoteDraftCache(next, review.baseUpdatedAt, null, version);
    this.pendingOperationId = draft.operationId;
    this.pendingBaseUpdatedAt = draft.baseUpdatedAt || null;
    this.pendingBaseVersion = version;
    this.restoredDraftNeedsBaseline = false;
    this.restoredDraftBlocked = false;
    this.conflictMergeAttempts = 0;
    this.clearFlushBackoff();
    // This explicit review replaces the stale draft only once the selected
    // changes have their own durable checkpoint. All writes still use CAS.
    void this.retireSupersededDraft(oldOperationId);
    markAdminSyncPending(this.source);
    this.emit(next, { updatedAt: review.baseUpdatedAt || undefined, version });
    return this.flush();
  };

  flush = async (): Promise<AppState | void> => {
    if (this.pendingTimer != null) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    // Drain edits/merges queued during an in-flight request, but stop on an
    // unchanged pending generation (offline, real conflict or write lease).
    let generation: number;
    do {
      generation = this.pendingGeneration;
      await this.flushNow();
    } while (this.pendingState && this.pendingGeneration !== generation);
    if (!this.pendingState && !hasRemoteDraftCache() && this.lastRemoteState) return this.lastRemoteState;
  };

  private async pullAndApply(opts?: { forceEmit?: boolean }): Promise<boolean> {
    if (this.externalRestorePaused) return false;
    if (this.pendingState || hasRemoteDraftCache()) return false;
    if (this.pullInFlight) return this.pullInFlight;

    const generation = this.pendingGeneration;
    this.pullInFlight = (async () => {
      try {
        const row = await pullWorkspaceState();
        if (!row?.state) return false;
        if (this.externalRestorePaused) return false;
        if (this.pendingState || hasRemoteDraftCache() || generation !== this.pendingGeneration) return false;
        const incomingVersion = normalizeWorkspaceVersion(row.version);
        if (incomingVersion != null && this.lastRemoteVersion != null && incomingVersion < this.lastRemoteVersion) return false;

        const nextState = coerceAppState(row.state);
        const nextFingerprint = this.fingerprint(nextState);
        const sameVersion = !!row.updated_at && row.updated_at === this.lastRemoteUpdatedAt;
        const sameState = nextFingerprint === this.lastStateFingerprint;

        if (!opts?.forceEmit && (sameVersion || sameState)) {
          this.rememberRemoteState(nextState, row.updated_at || null, { version: row.version ?? null });
          return false;
        }

        this.rememberRemoteState(nextState, row.updated_at || null, { version: row.version ?? null });
        clearDbSyncCurrentIssue();
        this.emit(nextState, { updatedAt: row.updated_at || undefined });
        return true;
      } catch {
        return false;
      } finally {
        this.pullInFlight = null;
      }
    })();

    return this.pullInFlight;
  }

  private async flushNow(opts?: { allowDuringBackoff?: boolean }) {
    if (this.externalRestorePaused) return;
    if (this.flushInFlight) {
      await this.flushInFlight;
      return;
    }
    const state = this.pendingState;
    if (!state) return;
    const generation = this.pendingGeneration;
    const cachedDraft = readRemoteDraftCache();
    const operationId = this.pendingOperationId || cachedDraft?.operationId || null;
    const baseUpdatedAt = this.pendingBaseUpdatedAt ?? cachedDraft?.baseUpdatedAt ?? null;
    const baseVersion = this.pendingBaseVersion ?? cachedDraft?.baseVersion ?? null;
    this.activeFlushOperationId = operationId;
    const work = this.flushPendingState(state, generation, operationId, baseUpdatedAt, baseVersion, opts);
    this.flushInFlight = work;
    try {
      await work;
    } finally {
      if (this.flushInFlight === work) this.flushInFlight = null;
      if (this.activeFlushOperationId === operationId) this.activeFlushOperationId = null;
      if (this.pendingState && this.pendingGeneration !== generation && !this.restoredDraftBlocked) {
        if (this.pendingTimer != null) window.clearTimeout(this.pendingTimer);
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = null;
          void this.flushNow();
        }, 0);
      }
    }
  }

  private async flushPendingState(
    state: AppState,
    generation: number,
    operationId: string | null,
    baseUpdatedAt: string | null,
    baseVersion: number | null,
    opts?: { allowDuringBackoff?: boolean },
  ) {
    let baseState = this.lastRemoteState;
    const isStillCurrent = () => this.pendingGeneration === generation
      && this.pendingOperationId === operationId
      && !!this.pendingState
      && this.fingerprint(this.pendingState) === this.fingerprint(state);

    if (this.shouldBlockSuspiciousEmptyAutosave(state)) {
      this.pendingState = null;
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
      acknowledgeRemoteDraftCache(this.lastRemoteUpdatedAt, operationId);
      markAdminSyncErrorState(
        'Protezione autosave: ho bloccato un salvataggio remoto di uno stato vuoto. Se vuoi davvero pubblicare un workspace vuoto, usa gli strumenti manuali nella sezione Persistenza online.',
        this.source
      );
      return;
    }

    const fingerprint = this.fingerprint(state);

    if (this.restoredDraftNeedsBaseline) {
      const baselineIsCurrent = await this.validateRestoredDraftBaseline(
        state,
        generation,
        operationId,
        baseUpdatedAt,
        baseVersion,
      );
      if (!baselineIsCurrent) return;
      baseState = this.lastRemoteState;
    }
    if (this.restoredDraftBlocked) return;

    // A local Admin session is authenticated by the local server token and its
    // SQLite write lease, so it intentionally has no Supabase access token.
    // Resolve the data plane before enforcing the cloud-session requirement;
    // otherwise every full-state Admin change (teams, tournament start/archive,
    // structure edits) remains only in the browser draft while local mode is
    // active. The local commit path still verifies both credentials below in
    // pushWorkspaceState/commitLocalWorkspace.
    let writesToLocalDataPlane = false;
    try {
      writesToLocalDataPlane = (await resolveDataPlane()).mode === 'local';
    } catch {
      // Keep the conservative cloud-session requirement when routing cannot be
      // determined. pushWorkspaceState will report recovery/fail-closed states.
      writesToLocalDataPlane = false;
    }

    if (!writesToLocalDataPlane && !hasSupabaseWriteSession()) {
      const session = getSupabaseSession();
      const draft = writeRemoteDraftCache(state, baseUpdatedAt, operationId, baseVersion);
      this.pendingOperationId = draft.operationId;
      this.pendingBaseUpdatedAt = draft.baseUpdatedAt || null;
      this.pendingBaseVersion = draft.baseVersion ?? null;
      markAdminSyncErrorState(
        session?.accessToken
          ? 'Sessione admin non valida per la scrittura. Controlla ruolo admin / RLS.'
          : 'Sessione admin assente o scaduta. Le modifiche restano locali finché non rieffettui il login.',
        this.source
      );
      return;
    }

    if (fingerprint === this.lastStateFingerprint) {
      this.pendingState = null;
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
      clearRemoteDraftCache();
      this.conflictedDraftFingerprint = null;
      markAdminSyncSynced(this.lastRemoteUpdatedAt, this.source);
      return;
    }

    if (this.conflictedDraftFingerprint === fingerprint) {
      return;
    }

    if (this.isFlushCoolingDown(opts?.allowDuringBackoff)) {
      return;
    }

    if (isAdminWriteBlockedByLease()) {
      // Finestra in sola lettura (write lease detenuto altrove): tieni la
      // bozza locale senza tentare push, il server la rifiuterebbe comunque.
      return;
    }

    markAdminSyncSaving(this.source);

    try {
      if (!operationId || !(await ensureRemoteDraftCacheDurable(operationId))) {
        throw new Error('Checkpoint locale non disponibile: libera spazio sul browser prima di continuare. La modifica resta in memoria e non è stata inviata.');
      }
      const row = await pushWorkspaceState(state, { operationId, baseUpdatedAt, baseVersion });
      const completedLatestDraft = isStillCurrent();
      const responseVersion = normalizeWorkspaceVersion(row.version);
      const responseWasSuperseded = !completedLatestDraft
        && responseVersion != null
        && this.lastRemoteVersion != null
        && responseVersion <= this.lastRemoteVersion;
      if (responseWasSuperseded) {
        // A dedicated match patch (or a newer snapshot) won the race while
        // this request was in flight. Its acknowledgement owns the base
        // cursor; leave any newer pending draft untouched and discard only
        // the obsolete operation.
        acknowledgeRemoteDraftCache(this.lastRemoteUpdatedAt, operationId);
        void discardRemoteDraftOperation(operationId);
        return;
      }
      if (completedLatestDraft) {
        this.pendingState = null;
        this.pendingOperationId = null;
        this.pendingBaseUpdatedAt = null;
        this.pendingBaseVersion = null;
      }
      this.rememberRemoteState(state, row.updated_at || null, { broadcast: true, version: row.version ?? null });
      this.clearFlushBackoff();
      this.conflictMergeAttempts = 0;
      acknowledgeRemoteDraftCache(row.updated_at || null, operationId);
      clearDbSyncCurrentIssue();
      markDbSyncOk('snapshot');
      if (completedLatestDraft) {
        markAdminSyncSynced(row.updated_at || null, this.source);
      } else {
        this.pendingBaseUpdatedAt = row.updated_at || null;
        this.pendingBaseVersion = normalizeWorkspaceVersion(row.version);
        if (this.pendingState) {
          writeRemoteDraftCache(this.pendingState, this.pendingBaseUpdatedAt, this.pendingOperationId, this.pendingBaseVersion);
        }
        markAdminSyncPending(this.source);
        if (this.pendingTimer != null) window.clearTimeout(this.pendingTimer);
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = null;
          void this.flushNow();
        }, 0);
      }
    } catch (e: any) {
      const failedLatestDraft = isStillCurrent();
      if (e?.code === 'FLBP_OPERATION_COLLISION' && failedLatestDraft) {
        // The server has already bound this idempotency key to another
        // payload (typically an interrupted older browser draft). Reusing it
        // can never succeed. Keep the exact state/base cursor, retire only
        // the collided key and retry with a fresh operation id.
        if (operationId) void discardRemoteDraftOperation(operationId);
        const draft = writeRemoteDraftCache(state, baseUpdatedAt, null, baseVersion);
        this.pendingOperationId = draft.operationId;
        this.pendingBaseUpdatedAt = draft.baseUpdatedAt || null;
        this.pendingBaseVersion = draft.baseVersion ?? null;
        this.clearFlushBackoff();
        this.conflictedDraftFingerprint = null;
        markAdminSyncPending(this.source);
        if (this.pendingTimer != null) window.clearTimeout(this.pendingTimer);
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = null;
          void this.flushNow();
        }, 25);
        return;
      }
      if (e?.code === 'FLBP_DB_CONFLICT' && failedLatestDraft) {
        const resolved = await this.resolveRemoteConflict(state, baseState, operationId, isStillCurrent);
        if (resolved) return;
      }
      // Recheck after the asynchronous conflict read as the user can edit
      // while it is in flight.
      if (!isStillCurrent()) {
        await this.retireSupersededDraft(operationId);
        return;
      }
      if (failedLatestDraft) {
        this.pendingState = state;
        const existingDraft = readRemoteDraftCache();
        const draft = writeRemoteDraftCache(state, baseUpdatedAt, operationId || existingDraft?.operationId, baseVersion);
        this.pendingOperationId = draft.operationId;
        this.pendingBaseUpdatedAt = draft.baseUpdatedAt || null;
        this.pendingBaseVersion = draft.baseVersion ?? null;
      } else if (operationId) {
        // A newer full-state draft already contains this edit. It owns a new
        // operationId and must never be overwritten by the older response.
        void discardRemoteDraftOperation(operationId);
      }

      if (e?.code === 'FLBP_DB_CONFLICT' && failedLatestDraft) {
        this.clearFlushBackoff();
        this.conflictedDraftFingerprint = fingerprint;
        markDbSyncConflict(e?.message || 'Conflitto DB', {
          remoteUpdatedAt: e?.remoteUpdatedAt || null,
          remoteBaseUpdatedAt: e?.remoteBaseUpdatedAt || null
        });
        markAdminSyncConflictState(
          'Le versioni locale e del server contengono differenze che non posso unire automaticamente. La bozza è conservata: confronta le due versioni prima di scegliere quale usare.',
          this.source
        );
      } else {
        this.conflictedDraftFingerprint = null;
        const delayMs = this.noteFlushFailure(!!opts?.allowDuringBackoff);
        const retrySeconds = Math.ceil(delayMs / 1000);
        markDbSyncError(`${e?.message || 'Sync snapshot fallita (offline/non autorizzato).'} Riprovo tra ${retrySeconds}s.`);
        markAdminSyncErrorState(
          `Errore di sincronizzazione. Mantengo le modifiche locali; in attesa di riprovare tra ${retrySeconds}s.`,
          this.source
        );
      }
    }
  }
}
