import { coerceAppState, type AppState } from '../storageService';
import { markAdminSyncConflictState, markAdminSyncErrorState, markAdminSyncPending, markAdminSyncSaving, markAdminSyncSynced, resetAdminSyncState } from '../adminSyncState';
import { getSupabaseConfig, getSupabaseSession, hasSupabaseWriteSession, pullWorkspaceState, pushWorkspaceState, setRemoteBaseUpdatedAt } from '../supabaseRest';
import { isAdminWriteBlockedByLease } from '../adminWriteLeaseState';
import { clearDbSyncCurrentIssue, markDbSyncConflict, markDbSyncError, markDbSyncOk, markRemoteVersions } from '../dbDiagnostics';
import { resolveDataPlane } from '../dataPlaneClient';
import { clearLocalAppStateCaches } from './featureFlags';
import { acknowledgeRemoteDraftCache, clearRemoteDraftCache, discardRemoteDraftOperation, ensureRemoteDraftCacheDurable, getRemoteDraftOwnerId, hasRemoteDraftCache, isRemoteDraftOwnerActive, readRemoteDraftCache, readRemoteDraftPointer, readRestorableRemoteDraftCache, startRemoteDraftOwnerHeartbeat, touchRemoteDraftOwner, writeRemoteDraftCache } from './remoteDraftCache';
import type { AppStateRepository, RepositoryUpdateMeta } from './AppStateRepository';
import { tryMergeRemoteStateConflict } from '../stateConflictMerge';
import { hasMeaningfulAppState } from '../appStateMeaning';
import { subscribeWorkspaceStateRealtime } from './workspaceStateRealtime';
import { appendDurableStateCheckpoint, listDurableStateCheckpoints } from './durableStateJournal';

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
  private lastRemoteState: AppState | null = null;
  private flushFailureCount = 0;
  private flushCooldownUntil = 0;
  private flushLifecycleBypassUsedForCooldownUntil = 0;
  private flushBackoffTimer: number | null = null;
  private durableRecoveryInFlight: Promise<void> | null = null;

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
      this.pendingBaseVersion = cachedDraft.baseVersion ?? null;
      this.pendingGeneration += 1;
      markAdminSyncPending(this.source);
      return true;
    }
    // Una bozza recuperata da IndexedDB può non avere una copia in
    // localStorage (per esempio quando la quota è esaurita).
    if (!this.pendingState) {
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
    }
    return false;
  }

  private async restoreIndexedDbDraft(expectedGeneration: number): Promise<boolean> {
    const workspaceId = getSupabaseConfig()?.workspaceId || 'default';
    const rows = await listDurableStateCheckpoints();
    const candidates = rows
      .filter((row) => row?.status === 'pending' && row?.operationId && row?.state)
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
      checkpoint.baseVersion ?? null,
      this.draftOwnerId,
      checkpoint.writerId ?? null,
    );

    this.pendingState = coerceAppState(checkpoint.state);
    this.pendingOperationId = checkpoint.operationId;
    this.pendingBaseUpdatedAt = checkpoint.baseUpdatedAt || null;
    this.pendingBaseVersion = checkpoint.baseVersion ?? null;
    this.pendingGeneration += 1;
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
      return JSON.stringify(state);
    } catch {
      return `${Date.now()}`;
    }
  }

  private rememberRemoteState(state: AppState, updatedAt?: string | null, opts?: { broadcast?: boolean; version?: number | null }) {
    const incomingVersion = opts && Object.prototype.hasOwnProperty.call(opts, 'version')
      && Number.isInteger(Number(opts.version))
      ? Number(opts.version)
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

  private async resolveEquivalentRemoteConflict(localState: AppState, localFingerprint: string): Promise<boolean> {
    try {
      const row = await pullWorkspaceState({
        source: 'RemoteRepository.resolveEquivalentRemoteConflict',
        kind: 'admin',
      });
      if (!row?.state) return false;

      const remoteState = coerceAppState(row.state);
      const remoteFingerprint = this.fingerprint(remoteState);
      if (remoteFingerprint !== localFingerprint) return false;

      const completedOperationId = this.pendingOperationId;
      this.pendingState = null;
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
      acknowledgeRemoteDraftCache(row.updated_at || null, completedOperationId);
      this.rememberRemoteState(remoteState, row.updated_at || null, { version: row.version ?? null });
      clearDbSyncCurrentIssue();
      markDbSyncOk('snapshot');
      markAdminSyncSynced(row.updated_at || null, this.source);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveMergeableRemoteConflict(localState: AppState): Promise<boolean> {
    if (!this.lastRemoteState) return false;

    try {
      const row = await pullWorkspaceState({
        source: 'RemoteRepository.resolveMergeableRemoteConflict',
        kind: 'admin',
      });
      if (!row?.state) return false;

      const remoteState = coerceAppState(row.state);
      const mergeResult = tryMergeRemoteStateConflict({
        baseState: this.lastRemoteState,
        localState,
        remoteState,
      });
      if (!mergeResult.ok) return false;

      const mergedFingerprint = this.fingerprint(mergeResult.state);
      const remoteFingerprint = this.fingerprint(remoteState);
      if (mergedFingerprint === remoteFingerprint) {
        const completedOperationId = this.pendingOperationId;
        this.pendingState = null;
        this.pendingOperationId = null;
        this.pendingBaseUpdatedAt = null;
        this.pendingBaseVersion = null;
        acknowledgeRemoteDraftCache(row.updated_at || null, completedOperationId);
        this.rememberRemoteState(remoteState, row.updated_at || null, { version: row.version ?? null });
        clearDbSyncCurrentIssue();
        markDbSyncOk('snapshot');
        markAdminSyncSynced(row.updated_at || null, this.source);
        return true;
      }

      this.pendingState = mergeResult.state;
      const mergeDraft = writeRemoteDraftCache(
        mergeResult.state,
        row.updated_at || null,
        this.pendingOperationId || readRemoteDraftCache()?.operationId,
        row.version ?? null,
      );
      this.pendingOperationId = mergeDraft.operationId;
      this.pendingBaseUpdatedAt = row.updated_at || null;
      this.pendingBaseVersion = Number.isInteger(Number(row.version)) ? Number(row.version) : null;
      if (!(await ensureRemoteDraftCacheDurable(mergeDraft.operationId))) {
        throw new Error('Checkpoint del merge non disponibile: la bozza resta locale e non viene inviata.');
      }
      setRemoteBaseUpdatedAt(row.updated_at || null);

      const pushed = await pushWorkspaceState(mergeResult.state, {
        operationId: this.pendingOperationId || undefined,
        baseUpdatedAt: row.updated_at || null,
        baseVersion: this.pendingBaseVersion,
      }, {
        source: 'RemoteRepository.resolveMergeableRemoteConflict.push',
        kind: 'admin',
      });
      this.pendingState = null;
      this.pendingOperationId = null;
      this.pendingBaseUpdatedAt = null;
      this.pendingBaseVersion = null;
      acknowledgeRemoteDraftCache(pushed.updated_at || null, mergeDraft.operationId);
      this.rememberRemoteState(mergeResult.state, pushed.updated_at || null, { broadcast: true, version: pushed.version ?? null });
      clearDbSyncCurrentIssue();
      markDbSyncOk('snapshot');
      markAdminSyncSynced(pushed.updated_at || null, this.source);
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
    const completedOperationId = meta?.operationId || null;
    const closesOwnPendingOperation = !!completedOperationId && (
      this.pendingOperationId === completedOperationId
      || currentDraft?.operationId === completedOperationId
    );

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
    }
    acknowledgeRemoteDraftCache(meta?.updatedAt || null, completedOperationId);

    // A match-patch acknowledgement must never discard a full-state draft
    // owned by another operation in this window. Keep it durable so a 409 can
    // be reconciled explicitly instead of silently losing the unrelated edit.
    if (this.pendingState || hasRemoteDraftCache()) {
      if (Number.isInteger(Number(meta?.version))) {
        this.lastRemoteVersion = Math.max(this.lastRemoteVersion ?? 0, Number(meta?.version));
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

  refresh = async (): Promise<void> => {
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
    this.clearConflictPauseIfStateChanged(fingerprint);
    if (fingerprint === this.lastStateFingerprint && !this.pendingState) {
      clearRemoteDraftCache();
      markAdminSyncSynced(this.lastRemoteUpdatedAt, this.source);
      return;
    }

    this.pendingState = state;
    this.pendingGeneration += 1;
    const cachedOperationId = readRemoteDraftCache()?.operationId || null;
    const reusableOperationId = this.activeFlushOperationId
      && (this.pendingOperationId === this.activeFlushOperationId || cachedOperationId === this.activeFlushOperationId)
      ? null
      : (this.pendingOperationId || cachedOperationId);
    const draft = writeRemoteDraftCache(
      state,
      this.lastRemoteUpdatedAt,
      reusableOperationId,
      this.lastRemoteVersion,
    );
    this.pendingOperationId = draft.operationId;
    this.pendingBaseUpdatedAt = draft.baseUpdatedAt || null;
    this.pendingBaseVersion = draft.baseVersion ?? null;
    markAdminSyncPending(this.source);

    if (this.pendingTimer != null) {
      window.clearTimeout(this.pendingTimer);
    }
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      void this.flushNow();
    }, RemoteRepository.REMOTE_SAVE_DEBOUNCE_MS);
  }

  flush = async (): Promise<void> => {
    if (this.pendingTimer != null) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    await this.flushNow();
  };

  private async pullAndApply(opts?: { forceEmit?: boolean }): Promise<boolean> {
    if (this.pendingState || hasRemoteDraftCache()) return false;
    if (this.pullInFlight) return this.pullInFlight;

    this.pullInFlight = (async () => {
      try {
        const row = await pullWorkspaceState();
        if (!row?.state) return false;

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
      const responseVersion = Number.isInteger(Number(row.version)) ? Number(row.version) : null;
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
        discardRemoteDraftOperation(operationId);
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
      acknowledgeRemoteDraftCache(row.updated_at || null, operationId);
      clearDbSyncCurrentIssue();
      markDbSyncOk('snapshot');
      if (completedLatestDraft) {
        markAdminSyncSynced(row.updated_at || null, this.source);
      } else {
        this.pendingBaseUpdatedAt = row.updated_at || null;
        this.pendingBaseVersion = Number.isInteger(Number(row.version)) ? Number(row.version) : null;
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
        if (operationId) discardRemoteDraftOperation(operationId);
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
        const equivalentRemote = await this.resolveEquivalentRemoteConflict(state, fingerprint);
        if (equivalentRemote) return;
        const mergedRemote = await this.resolveMergeableRemoteConflict(state);
        if (mergedRemote) return;
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
        discardRemoteDraftOperation(operationId);
      }

      if (e?.code === 'FLBP_DB_CONFLICT' && failedLatestDraft) {
        this.clearFlushBackoff();
        this.conflictedDraftFingerprint = fingerprint;
        markDbSyncConflict(e?.message || 'Conflitto DB', {
          remoteUpdatedAt: e?.remoteUpdatedAt || null,
          remoteBaseUpdatedAt: e?.remoteBaseUpdatedAt || null
        });
        markAdminSyncConflictState(
          'Conflitto di sincronizzazione: un altro admin ha già aggiornato il DB. Ho messo in pausa i retry automatici su questo device finché non fai recovery o una nuova modifica reale.',
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
