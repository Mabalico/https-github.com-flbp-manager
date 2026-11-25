import type { AppState } from './storageService';
import { getRemoteBaseUpdatedAt, getSupabaseConfig, pushLiveTournamentIncremental, pushNormalizedFromState } from './supabaseRest';
import { stableStateSerialize } from './stableStateSerialize';
import { markDbSyncConflict, markDbSyncError, markDbSyncOk } from './dbDiagnostics';
import { getAppStateRepository } from './repository/getRepository';
import { hasMeaningfulAppState } from './appStateMeaning';

// LocalStorage/env flags are kept in repository/featureFlags to avoid scattering.
import { isAutoStructuredSyncEnabled } from './repository/featureFlags';

/**
 * Auto structured sync (best-effort): keeps DB normalised tables + public mirrors updated
 * when enabled by feature flag.
 *
 * Safety rules:
 * - default OFF
 * - never blocks UI
 * - debounced + throttled
 * - requires Supabase config + admin JWT
 */

let externalRestorePaused = false;
const activeSyncRequests = new Set<Promise<void>>();
let pending: AppState | null = null;
let pendingRevision = 0;
let timer: number | null = null;
let inFlight = false;
let queuedFlushAfterInFlight = false;
let queuedForceAfterInFlight = false;

let lastRunAt = 0;
let lastFingerprint = '';
let lastProjectedAt: string | null = null;

const MIN_INTERVAL_MS = 20_000; // throttle
const DEBOUNCE_MS = 1500;
let retryHooksInstalled = false;

const installRetryHooks = () => {
  if (retryHooksInstalled) return;
  retryHooksInstalled = true;

  try {
    window.addEventListener('online', () => {
      void flushAutoStructuredSync(undefined, { force: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void flushAutoStructuredSync(undefined, { force: true });
      }
    });
  } catch {
    // ignore
  }
};

const armFlushTimer = (delayMs: number) => {
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void flushAutoStructuredSync();
  }, delayMs);
};

export const scheduleAutoStructuredSync = (state: AppState) => {
  if (externalRestorePaused) return;
  if (!isAutoStructuredSyncEnabled()) return;
  installRetryHooks();

  const cfg = getSupabaseConfig();
  if (!cfg) return;

  pending = state;
  pendingRevision += 1;
  armFlushTimer(DEBOUNCE_MS);
};

/**
 * A state that reached React from outside the autosave (remote pull) supersedes
 * the queued one. The queue must never republish the older snapshot on top of
 * it: `state` replaces it, `null` drops it.
 */
export const replacePendingAutoStructuredSync = (state: AppState | null) => {
  if (!pending && !inFlight) return;
  pending = state;
  pendingRevision += 1;
  if (inFlight && state) queuedFlushAfterInFlight = true;
};

const flushAutoStructuredSyncNow = async (
  stateOverride?: AppState,
  opts?: { force?: boolean }
): Promise<void> => {
  if (stateOverride) {
    pending = stateOverride;
    pendingRevision += 1;
  }
  if (inFlight) {
    // Live/referto/simulation commits can arrive while a previous structured
    // export is still running. Keep the latest state queued and drain it right
    // after the current push, otherwise Fanta/TV can remain on the pre-simulation
    // stats until another unrelated sync happens.
    queuedFlushAfterInFlight = true;
    if (opts?.force) queuedForceAfterInFlight = true;
    return;
  }
  const s = pending;
  if (!s) return;
  if (!hasMeaningfulAppState(s)) {
    pending = null;
    return;
  }

  const cfg = getSupabaseConfig();
  if (!cfg) return;

  const revision = pendingRevision;
  const forceThisRun = !!opts?.force || queuedForceAfterInFlight;
  queuedFlushAfterInFlight = false;
  queuedForceAfterInFlight = false;
  inFlight = true;

  try {
    const fingerprint = stableStateSerialize(s);
    const base = getRemoteBaseUpdatedAt();
    if (base && base === lastProjectedAt && fingerprint === lastFingerprint) {
      pending = null;
      return;
    }
    const elapsed = Date.now() - lastRunAt;
    if (!forceThisRun && elapsed < MIN_INTERVAL_MS) {
      armFlushTimer(MIN_INTERVAL_MS - elapsed);
      return;
    }
    pending = null;

    // Never forward `force` to the snapshot RPC: p_force would skip the
    // updated_at compare-and-swap and let a queued state overwrite newer
    // referee/admin commits. A conflict is handled below with a refresh.
    const summary = s.tournament
      ? await pushLiveTournamentIncremental(s, { strictPublicMirror: true })
      : await pushNormalizedFromState(s, { strictPublicMirror: true });
    lastRunAt = Date.now();
    lastFingerprint = fingerprint;
    lastProjectedAt = summary.workspaceUpdatedAt || null;
    markDbSyncOk('structured', summary);
    try {
      window.dispatchEvent(new CustomEvent('flbp-fanta-change'));
    } catch {
      // ignore UI refresh notification failures
    }
  } catch (e: any) {
    if (e?.code === 'FLBP_DB_CONFLICT') {
      markDbSyncConflict(e?.message || 'Conflitto DB', {
        remoteUpdatedAt: e?.remoteUpdatedAt || null,
        remoteBaseUpdatedAt: e?.remoteBaseUpdatedAt || null
      });
      try {
        await getAppStateRepository().refresh?.();
      } catch {
        // ignore
      }
    } else {
      if (revision === pendingRevision) pending = s;
      markDbSyncError(e?.message || String(e), 'structured');
    }
  } finally {
    const shouldDrainQueuedState = queuedFlushAfterInFlight;
    const forceQueuedState = queuedForceAfterInFlight;
    queuedFlushAfterInFlight = false;
    queuedForceAfterInFlight = false;
    inFlight = false;
    if (shouldDrainQueuedState && pending) {
      window.setTimeout(() => {
        void flushAutoStructuredSync(undefined, { force: forceQueuedState });
      }, 0);
    }
  }
};

/** Pause before the restore RPC; queued state remains recoverable on failure. */
export const prepareAutoSyncForDatabaseRestore = async (): Promise<void> => {
  externalRestorePaused = true;
  if (timer != null) window.clearTimeout(timer);
  timer = null;
  await Promise.allSettled([...activeSyncRequests]);
  if (timer != null) window.clearTimeout(timer);
  timer = null;
};

export const finishAutoSyncDatabaseRestore = (committed: boolean): void => {
  if (committed) {
    pending = null;
    queuedFlushAfterInFlight = false;
    queuedForceAfterInFlight = false;
    lastRunAt = 0;
    lastFingerprint = '';
    lastProjectedAt = null;
  }
  externalRestorePaused = false;
  if (!committed && pending) scheduleAutoStructuredSync(pending);
};

export const flushAutoStructuredSync = async (
  stateOverride?: AppState,
  opts?: { force?: boolean }
): Promise<void> => {
  if (externalRestorePaused) return;
  const work = flushAutoStructuredSyncNow(stateOverride, opts);
  activeSyncRequests.add(work);
  try { await work; }
  finally { activeSyncRequests.delete(work); }
};
