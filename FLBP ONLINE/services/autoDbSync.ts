import type { AppState } from './storageService';
import { getSupabaseAccessToken, getSupabaseConfig, pushLiveTournamentIncremental, pushNormalizedFromState } from './supabaseRest';
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

let pending: AppState | null = null;
let timer: number | null = null;
let inFlight = false;
let queuedFlushAfterInFlight = false;
let queuedForceAfterInFlight = false;

let lastRunAt = 0;
let lastFingerprint = '';

const MIN_INTERVAL_MS = 20_000; // throttle
const DEBOUNCE_MS = 1500;
const RETRY_BACKOFF_STEPS_MS = [5_000, 15_000, 45_000, 120_000];
const RETRY_JITTER_RATIO = 0.2;
let retryHooksInstalled = false;
let retryFailureCount = 0;
let retryCooldownUntil = 0;
let lifecycleBypassUsedForCooldownUntil = 0;
let retryTimer: number | null = null;

const retryDelayWithJitter = (failureCount: number) => {
  const base = RETRY_BACKOFF_STEPS_MS[Math.min(Math.max(failureCount - 1, 0), RETRY_BACKOFF_STEPS_MS.length - 1)];
  const jitter = 1 + ((Math.random() * 2 - 1) * RETRY_JITTER_RATIO);
  return Math.max(1_000, Math.round(base * jitter));
};

const clearRetryBackoff = () => {
  retryFailureCount = 0;
  retryCooldownUntil = 0;
  lifecycleBypassUsedForCooldownUntil = 0;
  if (retryTimer != null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
};

const noteRetryFailure = (markLifecycleBypassUsed = false) => {
  retryFailureCount += 1;
  const delayMs = retryDelayWithJitter(retryFailureCount);
  retryCooldownUntil = Date.now() + delayMs;
  lifecycleBypassUsedForCooldownUntil = markLifecycleBypassUsed ? retryCooldownUntil : 0;
  if (retryTimer != null) window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushAutoStructuredSync(undefined, { force: true });
  }, delayMs);
  return delayMs;
};

const isRetryCoolingDown = (allowLifecycleBypass?: boolean) => {
  if (!retryCooldownUntil) return false;
  const now = Date.now();
  if (now >= retryCooldownUntil) return false;
  if (allowLifecycleBypass && lifecycleBypassUsedForCooldownUntil !== retryCooldownUntil) {
    lifecycleBypassUsedForCooldownUntil = retryCooldownUntil;
    return false;
  }
  return true;
};

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

const safeFingerprint = (s: AppState): string => {
  // Stable-ish fingerprint of the portions that affect normalized/public exports.
  // It must change on real content edits, not just on count changes.
  try {
    const summarizeMatch = (m: any) => [
      m?.id || '',
      m?.status || '',
      m?.scoreA ?? '',
      m?.scoreB ?? '',
      m?.teamAId || '',
      m?.teamBId || '',
      m?.updatedAt || '',
      Array.isArray(m?.teamIds) ? m.teamIds.join(',') : '',
      m?.scoresByTeam ? JSON.stringify(m.scoresByTeam) : '',
      Array.isArray(m?.stats)
        ? m.stats
            .map((st: any) => `${st?.teamId || ''}:${st?.playerName || ''}:${st?.canestri ?? 0}:${st?.soffi ?? 0}`)
            .join(';')
        : '',
    ].join('|');

    const summarizeTournament = (t: any) => {
      if (!t) return '';
      const matches = Array.isArray(t.matches)
        ? t.matches
        : (Array.isArray(t.rounds) ? t.rounds.flat() : []);
      return [
        t.id || '',
        t.name || '',
        t.type || '',
        t.startDate || '',
        JSON.stringify(t.config || {}),
        (t.teams || []).map((tm: any) => `${tm?.id || ''}:${tm?.name || ''}:${tm?.player1 || ''}:${tm?.player2 || ''}`).join(','),
        matches.map(summarizeMatch).join('~'),
      ].join('#');
    };

    const parts = [
      `draftTeams:${(s.teams || []).map((tm: any) => `${tm?.id || ''}:${tm?.name || ''}:${tm?.player1 || ''}:${tm?.player2 || ''}`).join(',')}`,
      `live:${summarizeTournament({
        ...s.tournament,
        matches: s.tournamentMatches || s.tournament?.matches || [],
      })}`,
      `history:${(s.tournamentHistory || []).map(summarizeTournament).join('||')}`,
      `hof:${JSON.stringify(s.hallOfFame || [])}`,
      `aliases:${JSON.stringify(s.playerAliases || {})}`,
      `scorers:${JSON.stringify(s.integrationsScorers || [])}`,
      `logo:${s.logo || ''}`,
    ];
    return parts.join('|');
  } catch {
    return String(Date.now());
  }
};

export const scheduleAutoStructuredSync = (state: AppState) => {
  if (!isAutoStructuredSyncEnabled()) return;
  installRetryHooks();

  const cfg = getSupabaseConfig();
  if (!cfg) return;

  pending = state;
  if (timer != null) window.clearTimeout(timer);

  timer = window.setTimeout(() => {
    timer = null;
    void flushAutoStructuredSync();
  }, DEBOUNCE_MS);
};

export const flushAutoStructuredSync = async (
  stateOverride?: AppState,
  opts?: { force?: boolean; allowDuringBackoff?: boolean }
): Promise<void> => {
  if (stateOverride) pending = stateOverride;
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
  if (isRetryCoolingDown(opts?.allowDuringBackoff)) return;

  const now = Date.now();
  const fp = safeFingerprint(s);
  const forceThisRun = !!opts?.force || queuedForceAfterInFlight;
  queuedFlushAfterInFlight = false;
  queuedForceAfterInFlight = false;

  // Skip if too soon or identical fingerprint.
  // When force=true (e.g. on pagehide/beforeunload), we best-effort try once immediately.
  if (!forceThisRun) {
    if ((now - lastRunAt) < MIN_INTERVAL_MS && fp === lastFingerprint) return;
    if ((now - lastRunAt) < MIN_INTERVAL_MS) return;
  }

  inFlight = true;
  pending = null;

  try {
    const summary = s.tournament
      ? await pushLiveTournamentIncremental(s, forceThisRun ? { force: true } : undefined)
      : await pushNormalizedFromState(s, forceThisRun ? { force: true } : undefined);
    lastRunAt = Date.now();
    lastFingerprint = fp;
    clearRetryBackoff();
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
      if (!queuedFlushAfterInFlight) pending = s;
      const delayMs = noteRetryFailure(!!opts?.allowDuringBackoff);
      markDbSyncError(`${e?.message || String(e)} Riprovo tra ${Math.ceil(delayMs / 1000)}s.`);
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
