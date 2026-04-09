import { coerceAppState, type AppState } from '../storageService';
import { markAdminSyncConflictState, markAdminSyncErrorState, markAdminSyncPending, markAdminSyncSaving, markAdminSyncSynced, resetAdminSyncState } from '../adminSyncState';
import { getSupabaseConfig, getSupabaseSession, hasSupabaseWriteSession, pullWorkspaceState, pullWorkspaceStateUpdatedAt, pushWorkspaceState, setRemoteBaseUpdatedAt } from '../supabaseRest';
import { clearDbSyncCurrentIssue, markDbSyncConflict, markDbSyncError, markDbSyncOk, markRemoteVersions } from '../dbDiagnostics';
import { clearLocalAppStateCaches } from './featureFlags';
import { clearRemoteDraftCache, hasRemoteDraftCache, isRemoteDraftCacheFresh, readRemoteDraftCache, readRestorableRemoteDraftCache, writeRemoteDraftCache } from './remoteDraftCache';
import type { AppStateRepository, RepositoryUpdateMeta } from './AppStateRepository';
import { tryMergeRemoteStateConflict } from '../stateConflictMerge';

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

  private pullKicked = false;
  private pendingTimer: number | null = null;
  private pendingState: AppState | null = null;
  private pullInFlight: Promise<boolean> | null = null;
  private listeners = new Set<(state: AppState, meta?: RepositoryUpdateMeta) => void>();
  private lastRemoteUpdatedAt: string | null = null;
  private lastStateFingerprint = '';
  private conflictedDraftFingerprint: string | null = null;
  private lastRemoteState: AppState | null = null;

  private isAdminViewActive(): boolean {
    try {
      return (localStorage.getItem('flbp_view') || '').trim() === 'admin';
    } catch {
      return false;
    }
  }

  private shouldBackgroundRefresh(): boolean {
    if (this.pendingState || hasRemoteDraftCache()) return true;
    return this.isAdminViewActive();
  }

  private restoreCachedDraft(): boolean {
    const cachedDraft = readRestorableRemoteDraftCache();
    if (cachedDraft?.state && this.hasMeaningfulState(cachedDraft.state)) {
      this.pendingState = cachedDraft.state;
      markAdminSyncPending(this.source);
      return true;
    }
    this.pendingState = null;
    return false;
  }

  private async reconcileStaleDraft(): Promise<boolean> {
    const cachedDraft = readRemoteDraftCache();
    if (!cachedDraft?.state) return false;
    if (isRemoteDraftCacheFresh(cachedDraft)) return false;

    try {
      const remoteUpdatedAt = await pullWorkspaceStateUpdatedAt({
        source: 'RemoteRepository.reconcileStaleDraft',
        kind: 'admin',
      });
      clearRemoteDraftCache();
      this.pendingState = null;
      if (remoteUpdatedAt) {
        markAdminSyncSynced(remoteUpdatedAt, this.source);
      } else {
        resetAdminSyncState(this.source);
      }
      await this.pullAndApply({ forceEmit: true });
      return true;
    } catch {
      return false;
    }
  }

  constructor(_localFallback: AppStateRepository) {
    clearLocalAppStateCaches();

    if (!this.restoreCachedDraft()) {
      resetAdminSyncState(this.source);
    }

    const refresh = () => {
      if (!this.shouldBackgroundRefresh()) return;
      void this.refresh();
    };

    try {
      window.addEventListener('beforeunload', () => {
        void this.flushNow();
      });
      window.addEventListener('pagehide', () => {
        void this.flushNow();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          void this.flushNow();
        } else {
          refresh();
        }
      });
      window.addEventListener('online', refresh);
      window.addEventListener('focus', refresh);
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

    void this.reconcileStaleDraft();
  }

  private fingerprint(state: AppState): string {
    try {
      return JSON.stringify(state);
    } catch {
      return `${Date.now()}`;
    }
  }

  private hasMeaningfulState(state: AppState | null | undefined): boolean {
    if (!state) return false;
    return !!(
      state.tournament ||
      (state.tournamentMatches || []).length ||
      (state.tournamentHistory || []).length ||
      (state.hallOfFame || []).length ||
      (state.integrationsScorers || []).length ||
      Object.keys(state.playerAliases || {}).length ||
      (state.teams || []).length ||
      (state.matches || []).length ||
      (state.logo || '').trim()
    );
  }

  private rememberRemoteState(state: AppState, updatedAt?: string | null) {
    const safeState = coerceAppState(state);
    this.lastStateFingerprint = this.fingerprint(safeState);
    this.lastRemoteUpdatedAt = updatedAt || null;
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

      this.pendingState = null;
      clearRemoteDraftCache();
      this.rememberRemoteState(remoteState, row.updated_at || null);
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
        this.pendingState = null;
        clearRemoteDraftCache();
        this.rememberRemoteState(remoteState, row.updated_at || null);
        clearDbSyncCurrentIssue();
        markDbSyncOk('snapshot');
        markAdminSyncSynced(row.updated_at || null, this.source);
        return true;
      }

      this.pendingState = mergeResult.state;
      writeRemoteDraftCache(mergeResult.state, this.lastRemoteUpdatedAt);
      setRemoteBaseUpdatedAt(row.updated_at || null);

      const pushed = await pushWorkspaceState(mergeResult.state, undefined, {
        source: 'RemoteRepository.resolveMergeableRemoteConflict.push',
        kind: 'admin',
      });
      this.pendingState = null;
      clearRemoteDraftCache();
      this.rememberRemoteState(mergeResult.state, pushed.updated_at || null);
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

  refresh = async (): Promise<void> => {
    if (!this.pendingState && hasRemoteDraftCache()) {
      const restored = this.restoreCachedDraft();
      if (!restored) {
        await this.reconcileStaleDraft();
      }
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

    if (this.restoreCachedDraft() && this.pendingState) {
      return this.pendingState;
    }

    if (!this.pullKicked && this.shouldBackgroundRefresh()) {
      this.pullKicked = true;
      void this.pullAndApply({ forceEmit: true });
    }

    return coerceAppState({});
  }

  save(state: AppState): void {
    const cfg = getSupabaseConfig();
    if (!cfg) return;
    if (!this.lastRemoteUpdatedAt && !this.hasMeaningfulState(state)) return;

    const fingerprint = this.fingerprint(state);
    this.clearConflictPauseIfStateChanged(fingerprint);
    if (fingerprint === this.lastStateFingerprint && !this.pendingState) {
      clearRemoteDraftCache();
      markAdminSyncSynced(this.lastRemoteUpdatedAt, this.source);
      return;
    }

    this.pendingState = state;
    writeRemoteDraftCache(state, this.lastRemoteUpdatedAt);
    markAdminSyncPending(this.source);

    if (this.pendingTimer != null) {
      window.clearTimeout(this.pendingTimer);
    }
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      void this.flushNow();
    }, 800);
  }

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
          this.rememberRemoteState(nextState, row.updated_at || null);
          return false;
        }

        this.rememberRemoteState(nextState, row.updated_at || null);
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

  private async flushNow() {
    const state = this.pendingState;
    if (!state) return;

    const fingerprint = this.fingerprint(state);

    if (!hasSupabaseWriteSession()) {
      const session = getSupabaseSession();
      writeRemoteDraftCache(state, this.lastRemoteUpdatedAt);
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
      clearRemoteDraftCache();
      this.conflictedDraftFingerprint = null;
      markAdminSyncSynced(this.lastRemoteUpdatedAt, this.source);
      return;
    }

    if (this.conflictedDraftFingerprint === fingerprint) {
      return;
    }

    markAdminSyncSaving(this.source);

    try {
      const row = await pushWorkspaceState(state);
      this.pendingState = null;
      this.rememberRemoteState(state, row.updated_at || null);
      clearRemoteDraftCache();
      clearDbSyncCurrentIssue();
      markDbSyncOk('snapshot');
      markAdminSyncSynced(row.updated_at || null, this.source);
    } catch (e: any) {
      if (e?.code === 'FLBP_DB_CONFLICT') {
        const equivalentRemote = await this.resolveEquivalentRemoteConflict(state, fingerprint);
        if (equivalentRemote) return;
        const mergedRemote = await this.resolveMergeableRemoteConflict(state);
        if (mergedRemote) return;
      }
      this.pendingState = state;
      writeRemoteDraftCache(state, this.lastRemoteUpdatedAt);

      if (e?.code === 'FLBP_DB_CONFLICT') {
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
        markDbSyncError(e?.message || 'Sync snapshot fallita (offline/non autorizzato).');
        markAdminSyncErrorState(
          'Errore di sincronizzazione. Mantengo le modifiche locali e riprovo automaticamente alla prossima riconnessione.',
          this.source
        );
      }
    }
  }
}
