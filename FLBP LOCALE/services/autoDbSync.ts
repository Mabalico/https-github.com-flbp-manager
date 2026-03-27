import type { AppState } from './storageService';
import { getSupabaseAccessToken, getSupabaseConfig, pushNormalizedFromState } from './supabaseRest';
import { markDbSyncConflict, markDbSyncError, markDbSyncOk } from './dbDiagnostics';
import { getAppStateRepository } from './repository/getRepository';

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

let lastRunAt = 0;
let lastFingerprint = '';

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
  opts?: { force?: boolean }
): Promise<void> => {
  if (stateOverride) pending = stateOverride;
  if (inFlight) return;
  const s = pending;
  if (!s) return;

  const cfg = getSupabaseConfig();
  if (!cfg) return;

  const now = Date.now();
  const fp = safeFingerprint(s);

  // Skip if too soon or identical fingerprint.
  // When force=true (e.g. on pagehide/beforeunload), we best-effort try once immediately.
  if (!opts?.force) {
    if ((now - lastRunAt) < MIN_INTERVAL_MS && fp === lastFingerprint) return;
    if ((now - lastRunAt) < MIN_INTERVAL_MS) return;
  }

  inFlight = true;
  pending = null;

  try {
    const summary = await pushNormalizedFromState(s);
    lastRunAt = Date.now();
    lastFingerprint = fp;
    markDbSyncOk('structured', summary);
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
      pending = s;
      markDbSyncError(e?.message || String(e));
    }
  } finally {
    inFlight = false;
  }
};
