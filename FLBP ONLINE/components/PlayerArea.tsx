import React from 'react';
import {
  BadgeCheck,
  BellRing,
  Facebook,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  PhoneCall,
  ShieldCheck,
  Trophy,
  UserPlus,
  UserRound,
} from 'lucide-react';
import type { AppState } from '../services/storageService';
import { useTranslation } from '../App';
import { formatBirthDateDisplay } from '../services/playerIdentity';
import type { PlayerSupabaseProfileRow, PlayerSupabaseSession } from '../services/supabaseRest';
import {
  acknowledgePlayerAppCall,
  consumePlayerSupabaseSessionFromUrl,
  ensureFreshPlayerSupabaseSession,
  getPlayerSupabaseSession,
  getSupabaseConfig,
  playerRequestPasswordReset,
  playerSignInWithPassword,
  playerSignOutSupabase,
  playerSignUpWithPassword,
  pullPlayerAppCalls,
  pullPlayerAppProfile,
  pushPlayerAppProfile,
  registerPlayerAppDevice,
} from '../services/supabaseRest';
import {
  acknowledgePlayerPreviewCall,
  buildPlayerAreaBootstrapSnapshot,
  buildPlayerCanonicalIdentity,
  buildPlayerRuntimeProfileSnapshot,
  buildPlayerRuntimeSessionFromSupabase,
  clearPlayerPreviewCall,
  derivePlayerLiveStatus,
  getPlayerPreviewIdentityLabel,
  mapSupabaseCallRowToPlayerCallRequest,
  registerPlayerPreviewAccount,
  signInPlayerPreviewAccount,
  signOutPlayerPreviewSession,
  savePlayerPreviewProfile,
  toPlayerRuntimeProfile,
  PLAYER_APP_CHANGE_EVENT,
} from '../services/playerAppService';
import { getMatchParticipantIds } from '../services/matchUtils';
import { isLocalOnlyMode } from '../services/repository/featureFlags';
import { isEmbeddedNativeShell } from '../services/nativeShell';
import {
  readNativePushRegistration,
  refreshNativePushRegistration,
  requestNativePushPermission,
  subscribeNativePushRegistration,
  type NativePushRegistrationSnapshot,
} from '../services/nativePushBridge';

interface PlayerAreaProps {
  state: AppState;
  onOpenReferees?: () => void;
}

const cardClass = 'rounded-[26px] border border-slate-200 bg-white shadow-sm shadow-slate-200/60';
const sectionTitleClass = 'text-lg font-black text-slate-950';
const metricCardClass = 'rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3';
const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition focus:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
const btnPrimary = `${btnBase} border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500`;
const btnSecondary = `${btnBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300`;
const btnDanger = `${btnBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-500`;
const PLAYER_WEB_DEVICE_ID_KEY = 'flbp_player_web_device_id_v1';
const PLAYER_NATIVE_PUSH_PROMPT_KEY = 'flbp_player_native_push_prompted_v1';

const schedulePlayerAreaTask = (task: () => void) => {
  const timerId = window.setTimeout(task, 0);
  return () => window.clearTimeout(timerId);
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className={metricCardClass}>
    <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
    <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
  </div>
);

const getPlayerWebDeviceId = () => {
  try {
    const current = String(localStorage.getItem(PLAYER_WEB_DEVICE_ID_KEY) || '').trim();
    if (current) return current;
    const next = `web_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(PLAYER_WEB_DEVICE_ID_KEY, next);
    return next;
  } catch {
    return `web_${Math.random().toString(36).slice(2, 12)}`;
  }
};

const isPlayerBackendPendingError = (message: string) =>
  /player_app_profiles|player_app_devices|player_app_calls|flbp_player_ack_call|flbp_player_call_team|relation .*player_app_|function .*flbp_player_/i.test(message);

const buildSafePlayerAreaSnapshot = (
  state: AppState,
  liveBackendEnabled: boolean
): ReturnType<typeof buildPlayerAreaSnapshot> => ({
  session: null,
  profile: null,
  personalProfile: null,
  liveStatus: {
    liveTournamentId: state.tournament?.id || null,
    liveTournamentName: state.tournament?.name || null,
    linkedTeam: null,
    nextMatch: null,
    nextMatchTurn: null,
    turnsUntilPlay: null,
    refereeBypassEligible: false,
    activeCall: null,
  },
  featureStatus: {
    previewEnabled: true,
    supabaseConfigured: liveBackendEnabled,
    supabaseSessionPresent: false,
    remoteAuthPrepared: liveBackendEnabled,
    socialAuthPrepared: ['google', 'facebook', 'apple'],
    playerProfilesPrepared: false,
    playerCallsPrepared: false,
    refereeBypassPrepared: true,
  },
});

export const PlayerArea: React.FC<PlayerAreaProps> = ({ state, onOpenReferees }) => {
  const { t } = useTranslation();
  const liveBackendEnabled = !isLocalOnlyMode() && !!getSupabaseConfig();
  const embeddedNativeShell = isEmbeddedNativeShell();
  const initialLiveSessionPresent = liveBackendEnabled && !!getPlayerSupabaseSession()?.accessToken;
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [authMode, setAuthMode] = React.useState<'login' | 'register'>('login');
  const [emailPanelOpen, setEmailPanelOpen] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [birthDate, setBirthDate] = React.useState('');
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [liveSession, setLiveSession] = React.useState<PlayerSupabaseSession | null>(null);
  const [liveProfileRow, setLiveProfileRow] = React.useState<PlayerSupabaseProfileRow | null>(null);
  const [liveRuntimeArmed, setLiveRuntimeArmed] = React.useState(initialLiveSessionPresent);
  const [liveCallRefreshNonce, setLiveCallRefreshNonce] = React.useState(0);
  const [liveCalls, setLiveCalls] = React.useState<ReturnType<typeof mapSupabaseCallRowToPlayerCallRequest>[]>([]);
  const [liveRuntimeStatus, setLiveRuntimeStatus] = React.useState<'disabled' | 'loading' | 'ready' | 'backend_pending' | 'error'>(
    initialLiveSessionPresent ? 'loading' : 'disabled'
  );
  const [liveRuntimeError, setLiveRuntimeError] = React.useState<string | null>(null);
  const safeSnapshot = React.useMemo(() => buildSafePlayerAreaSnapshot(state, liveBackendEnabled), [liveBackendEnabled, state]);
  const [snapshot, setSnapshot] = React.useState(() => safeSnapshot);
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null);
  const [bootstrapPending, setBootstrapPending] = React.useState(true);
  const [liveDerivedPersonalProfile, setLiveDerivedPersonalProfile] =
    React.useState<ReturnType<typeof buildPlayerRuntimeProfileSnapshot>>(null);
  const [liveDerivedStatus, setLiveDerivedStatus] =
    React.useState<ReturnType<typeof derivePlayerLiveStatus> | null>(null);
  const [liveDerivedError, setLiveDerivedError] = React.useState<string | null>(null);
  const [liveDerivedPending, setLiveDerivedPending] = React.useState(false);
  const [nativePushRegistration, setNativePushRegistration] = React.useState<NativePushRegistrationSnapshot | null>(() => readNativePushRegistration());

  React.useEffect(() => {
    const handler = () => setRefreshNonce((value) => value + 1);
    window.addEventListener('storage', handler);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    };
  }, []);

  React.useEffect(() => {
    if (!embeddedNativeShell) {
      setNativePushRegistration(null);
      return;
    }
    setNativePushRegistration(readNativePushRegistration());
    return subscribeNativePushRegistration(setNativePushRegistration);
  }, [embeddedNativeShell]);

  const syncLiveDeviceRegistration = React.useCallback(async () => {
    if (!liveBackendEnabled) return null;
    if (!embeddedNativeShell) {
      return registerPlayerAppDevice({ id: getPlayerWebDeviceId(), platform: 'web', pushEnabled: true });
    }

    let registration = await refreshNativePushRegistration();
    if (!registration) {
      return null;
    }

    if (registration.permission === 'prompt') {
      const hasPrompted = (() => {
        try {
          return localStorage.getItem(PLAYER_NATIVE_PUSH_PROMPT_KEY) === '1';
        } catch {
          return false;
        }
      })();
      if (!hasPrompted) {
        try {
          localStorage.setItem(PLAYER_NATIVE_PUSH_PROMPT_KEY, '1');
        } catch {
          // ignore
        }
        registration = await requestNativePushPermission();
      }
    }

    registration = registration || readNativePushRegistration();
    if (!registration?.deviceId) return null;

    setNativePushRegistration(registration);
    return registerPlayerAppDevice({
      id: registration.deviceId,
      platform: registration.platform,
      deviceToken: registration.deviceToken,
      pushEnabled: registration.permission === 'granted' && !!registration.deviceToken,
    });
  }, [embeddedNativeShell, liveBackendEnabled]);

  React.useEffect(() => {
    let cancelled = false;
    setBootstrapPending(true);
    const cancel = schedulePlayerAreaTask(() => {
      try {
        const bootstrap = buildPlayerAreaBootstrapSnapshot();
        const runtimeProfile = toPlayerRuntimeProfile(bootstrap.profile);
        if (cancelled) return;
        setSnapshot({
          ...bootstrap,
          personalProfile: buildPlayerRuntimeProfileSnapshot(state, runtimeProfile),
          liveStatus: derivePlayerLiveStatus(state, runtimeProfile),
        });
        setBootstrapError(null);
      } catch (error: any) {
        const message = String(error?.message || error || t('player_area_preview_error'));
        console.error('[PlayerArea] Safe bootstrap fallback', error);
        if (cancelled) return;
        setSnapshot(safeSnapshot);
        setBootstrapError(message);
      } finally {
        if (!cancelled) setBootstrapPending(false);
      }
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [refreshNonce, safeSnapshot, state, t]);

  const refreshLiveRuntime = React.useCallback(async (forcedSession?: PlayerSupabaseSession | null) => {
    if (!liveBackendEnabled) {
      setLiveRuntimeStatus('disabled');
      setLiveRuntimeError(null);
      setLiveSession(null);
      setLiveProfileRow(null);
      setLiveCalls([]);
      return;
    }

    setLiveRuntimeStatus('loading');
    setLiveRuntimeError(null);

    try {
      const nextSession = forcedSession === undefined ? await ensureFreshPlayerSupabaseSession() : forcedSession;
      if (!nextSession?.accessToken) {
        setLiveSession(null);
        setLiveProfileRow(null);
        setLiveCalls([]);
        setLiveRuntimeStatus('disabled');
        return;
      }

      setLiveSession(nextSession);
      let backendPending = false;
      let pendingMessage = '';
      let nextProfile: PlayerSupabaseProfileRow | null = null;
      let nextCalls: ReturnType<typeof mapSupabaseCallRowToPlayerCallRequest>[] = [];

      try {
        await syncLiveDeviceRegistration();
      } catch (error: any) {
        const message = String(error?.message || error || '').trim();
        if (isPlayerBackendPendingError(message)) {
          backendPending = true;
          pendingMessage = pendingMessage || message;
        } else {
          throw error;
        }
      }

      try {
        nextProfile = await pullPlayerAppProfile();
      } catch (error: any) {
        const message = String(error?.message || error || '').trim();
        if (isPlayerBackendPendingError(message)) {
          backendPending = true;
          pendingMessage = pendingMessage || message;
        } else {
          throw error;
        }
      }

      try {
        const rows = await pullPlayerAppCalls();
        nextCalls = rows
          .map(mapSupabaseCallRowToPlayerCallRequest)
          .filter((row) => row.status === 'ringing' || row.status === 'acknowledged');
      } catch (error: any) {
        const message = String(error?.message || error || '').trim();
        if (isPlayerBackendPendingError(message)) {
          backendPending = true;
          pendingMessage = pendingMessage || message;
        } else {
          throw error;
        }
      }

      setLiveProfileRow(nextProfile);
      setLiveCalls(nextCalls);
      setLiveRuntimeStatus(backendPending ? 'backend_pending' : 'ready');
      setLiveRuntimeError(backendPending ? (pendingMessage || t('player_area_password_reset_pending')) : null);
    } catch (error: any) {
      const message = String(error?.message || error || t('player_area_preview_error'));
      setLiveRuntimeStatus('error');
      setLiveRuntimeError(message);
    }
  }, [liveBackendEnabled, syncLiveDeviceRegistration, t]);

  React.useEffect(() => {
    if (!liveBackendEnabled) return;
    try {
      const consumed = consumePlayerSupabaseSessionFromUrl();
      if (consumed?.accessToken) {
        setLiveSession(consumed);
        setLiveRuntimeArmed(true);
        void refreshLiveRuntime(consumed);
        return;
      }
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
    if (!liveRuntimeArmed) {
      setLiveRuntimeStatus('disabled');
      setLiveRuntimeError(null);
      return;
    }
    void refreshLiveRuntime();
  }, [liveBackendEnabled, liveRuntimeArmed, refreshLiveRuntime, t]);

  React.useEffect(() => {
    if (!liveBackendEnabled || !liveRuntimeArmed || liveCallRefreshNonce === 0) return;
    void refreshLiveRuntime();
  }, [liveBackendEnabled, liveCallRefreshNonce, liveRuntimeArmed, refreshLiveRuntime]);

  const liveRuntimeSession = React.useMemo(
    () => (liveSession?.accessToken ? buildPlayerRuntimeSessionFromSupabase(liveSession) : null),
    [liveSession]
  );

  const liveRuntimeProfile = React.useMemo(
    () =>
      liveProfileRow
        ? toPlayerRuntimeProfile({
            accountId: liveProfileRow.user_id,
            firstName: liveProfileRow.first_name,
            lastName: liveProfileRow.last_name,
            birthDate: liveProfileRow.birth_date,
            canonicalPlayerId: liveProfileRow.canonical_player_id || '',
            canonicalPlayerName:
              String(liveProfileRow.canonical_player_name || '').trim()
              || `${liveProfileRow.last_name || ''} ${liveProfileRow.first_name || ''}`.trim(),
          })
        : null,
    [liveProfileRow]
  );

  const previewRuntimeProfile = React.useMemo(() => toPlayerRuntimeProfile(snapshot.profile), [snapshot.profile]);
  const effectiveSession = liveRuntimeSession || snapshot.session;
  const effectiveProfile = liveRuntimeSession ? liveRuntimeProfile : previewRuntimeProfile;
  const activeLiveCall = React.useMemo(
    () =>
      [...liveCalls]
        .filter((row) => row.status === 'ringing' || row.status === 'acknowledged')
        .sort((a, b) => b.requestedAt - a.requestedAt)[0] || null,
    [liveCalls]
  );

  React.useEffect(() => {
    if (!liveRuntimeSession || !liveRuntimeProfile) {
      setLiveDerivedPersonalProfile(null);
      setLiveDerivedStatus(null);
      setLiveDerivedError(null);
      setLiveDerivedPending(false);
      return;
    }
    let cancelled = false;
    setLiveDerivedPending(true);
    const cancel = schedulePlayerAreaTask(() => {
      try {
        const personalProfile = buildPlayerRuntimeProfileSnapshot(state, liveRuntimeProfile);
        const liveStatus = derivePlayerLiveStatus(state, liveRuntimeProfile, activeLiveCall);
        if (cancelled) return;
        setLiveDerivedPersonalProfile(personalProfile);
        setLiveDerivedStatus(liveStatus);
        setLiveDerivedError(null);
      } catch (error: any) {
        const message = String(error?.message || error || t('player_area_preview_error'));
        console.error('[PlayerArea] Deferred live derivation failed', error);
        if (cancelled) return;
        setLiveDerivedPersonalProfile(null);
        setLiveDerivedStatus(null);
        setLiveDerivedError(message);
      } finally {
        if (!cancelled) setLiveDerivedPending(false);
      }
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [activeLiveCall, liveRuntimeProfile, liveRuntimeSession, state, t]);

  const effectivePersonalProfile = liveRuntimeSession
    ? liveDerivedPersonalProfile
    : snapshot.personalProfile;
  const effectiveLiveStatus = liveRuntimeSession
    ? (liveDerivedStatus || safeSnapshot.liveStatus)
    : snapshot.liveStatus;
  const effectiveFeatureStatus = React.useMemo(() => ({
    ...snapshot.featureStatus,
    supabaseConfigured: liveBackendEnabled,
    supabaseSessionPresent: !!liveRuntimeSession?.accountId,
    remoteAuthPrepared: liveBackendEnabled,
    playerProfilesPrepared: liveBackendEnabled && liveRuntimeStatus === 'ready',
    playerCallsPrepared: liveBackendEnabled && liveRuntimeStatus === 'ready',
  }), [snapshot.featureStatus, liveBackendEnabled, liveRuntimeSession?.accountId, liveRuntimeStatus]);

  React.useEffect(() => {
    if (!effectiveProfile) return;
    setFirstName(effectiveProfile.firstName);
    setLastName(effectiveProfile.lastName);
    setBirthDate(formatBirthDateDisplay(effectiveProfile.birthDate));
  }, [effectiveProfile?.accountId, effectiveProfile?.birthDate, effectiveProfile?.firstName, effectiveProfile?.lastName]);

  const linkedMatchLabel = React.useMemo(() => {
    const match = effectiveLiveStatus.nextMatch;
    if (!match) return '';
    const ids = getMatchParticipantIds(match);
    const labels = ids.map((id) => {
      if (!id) return 'TBD';
      return state.tournament?.teams?.find((team) => team.id === id)?.name || id;
    });
    return `${match.code || '-'} · ${labels.join(' vs ')}`;
  }, [effectiveLiveStatus.nextMatch, state.tournament?.teams]);

  const submitAuth = async () => {
    try {
      if (liveBackendEnabled) {
        const session = authMode === 'register'
          ? await playerSignUpWithPassword(email, password, {
              first_name: firstName.trim() || null,
              last_name: lastName.trim() || null,
              birth_date: birthDate.trim() || null,
            })
          : await playerSignInWithPassword(email, password);

        setLiveRuntimeArmed(true);
        setLiveSession(session);

        if (authMode === 'register' && firstName.trim() && lastName.trim() && birthDate.trim()) {
          const identity = buildPlayerCanonicalIdentity(firstName, lastName, birthDate);
          try {
            const row = await pushPlayerAppProfile({
              firstName: identity.firstName,
              lastName: identity.lastName,
              birthDate: identity.birthDate,
              canonicalPlayerId: identity.canonicalPlayerId,
              canonicalPlayerName: identity.canonicalPlayerName,
            });
            setLiveProfileRow(row);
          } catch (error: any) {
            const message = String(error?.message || error || '').trim();
            if (isPlayerBackendPendingError(message)) {
              setLiveRuntimeStatus('backend_pending');
              setLiveRuntimeError(message || t('player_area_password_reset_pending'));
            } else {
              throw error;
            }
          }
        }

        await refreshLiveRuntime(session);
      } else {
        if (authMode === 'register') {
          const session = registerPlayerPreviewAccount(email, password);
          if (firstName.trim() && lastName.trim() && birthDate.trim()) {
            savePlayerPreviewProfile(session, { firstName, lastName, birthDate });
          }
          setFeedback({ tone: 'success', message: t('player_area_preview_registered') });
        } else {
          signInPlayerPreviewAccount(email, password);
          setFeedback({ tone: 'success', message: t('player_area_preview_logged_in') });
        }
      }
      setPassword('');
      if (liveBackendEnabled) {
        setFeedback(null);
      }
      setRefreshNonce((value) => value + 1);
      setLiveCallRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const requestPasswordReset = async () => {
    try {
      await playerRequestPasswordReset(email, window.location.origin);
      setFeedback({ tone: 'success', message: t('player_area_password_reset_sent') });
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_password_reset_pending')) });
    }
  };

  const submitProfile = async () => {
    if (!effectiveSession) return;
    try {
      if (effectiveSession.mode === 'live') {
        const identity = buildPlayerCanonicalIdentity(firstName, lastName, birthDate, liveProfileRow?.canonical_player_id || null);
        const row = await pushPlayerAppProfile({
          firstName: identity.firstName,
          lastName: identity.lastName,
          birthDate: identity.birthDate,
          canonicalPlayerId: identity.canonicalPlayerId,
          canonicalPlayerName: identity.canonicalPlayerName,
        });
        setLiveProfileRow(row);
        setLiveCallRefreshNonce((value) => value + 1);
      } else {
        savePlayerPreviewProfile(snapshot.session!, { firstName, lastName, birthDate });
      }
      setFeedback({ tone: 'success', message: t('player_area_profile_saved') });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_profile_error')) });
    }
  };

  const acknowledgeCall = async () => {
    if (!effectiveSession || !effectiveLiveStatus.activeCall) return;
    try {
      if (effectiveLiveStatus.activeCall.previewOnly) {
        acknowledgePlayerPreviewCall(snapshot.session!, effectiveLiveStatus.activeCall.id);
      } else {
        await acknowledgePlayerAppCall(effectiveLiveStatus.activeCall.id);
        setLiveCallRefreshNonce((value) => value + 1);
      }
      setFeedback({ tone: 'success', message: t('player_area_call_ack_done') });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const clearCall = () => {
    if (!snapshot.session || !effectiveLiveStatus.activeCall?.previewOnly) return;
    try {
      clearPlayerPreviewCall(snapshot.session, effectiveLiveStatus.activeCall.id);
      setFeedback({ tone: 'success', message: t('player_area_call_cancel_done') });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const signOut = async () => {
    if (effectiveSession?.mode === 'live') {
      await playerSignOutSupabase();
      setLiveRuntimeArmed(false);
      setLiveSession(null);
      setLiveProfileRow(null);
      setLiveCalls([]);
      setLiveRuntimeStatus('disabled');
      setLiveRuntimeError(null);
      setLiveCallRefreshNonce((value) => value + 1);
      return;
    }
    signOutPlayerPreviewSession();
    setRefreshNonce((value) => value + 1);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className={cardClass}>
        <div className="border-b border-slate-100 px-5 py-5 md:px-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-700">
                <UserRound className="h-3.5 w-3.5" />
                {t('player_area')}
              </div>
              <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                {effectiveSession ? t('player_area_dashboard_title') : t('player_area_login_title')}
              </div>
              <div className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                {t('player_area_desc')}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-600">
              <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('status')}</div>
              <div className="mt-1 text-sm font-black text-slate-900">
                {effectiveSession?.mode === 'live'
                  ? t('data_accounts_mode_live')
                  : effectiveSession
                    ? t('player_area_preview_active')
                    : t('player_area_preview_only')}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] md:px-6">
          <div className="space-y-5">
            {feedback ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                {feedback.message}
              </div>
            ) : null}

            {bootstrapError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Area giocatore ripristinata in modalita sicura. {bootstrapError}
              </div>
            ) : null}

            {bootstrapPending || liveDerivedPending ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                Sto preparando l'area giocatore senza bloccare l'interfaccia.
              </div>
            ) : null}

            {liveRuntimeError && effectiveSession?.mode === 'live' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {liveRuntimeError}
              </div>
            ) : null}

            {liveDerivedError && effectiveSession?.mode === 'live' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Area giocatore ripristinata in modalita sicura. {liveDerivedError}
              </div>
            ) : null}

            {!effectiveSession ? (
              <div className="mx-auto max-w-xl">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 md:p-6">
                  <div className="text-center">
                    <div className="text-2xl font-black tracking-tight text-slate-950">{t('player_area_login_title')}</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {t('player_area_preview_note')}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <button
                      type="button"
                      disabled
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-[#1877F2] bg-[#1877F2] px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_-22px_rgba(24,119,242,0.6)] disabled:cursor-not-allowed disabled:opacity-100"
                    >
                      <Facebook className="h-4 w-4" /> Accedi con Facebook
                    </button>
                    <button
                      type="button"
                      disabled
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-black text-slate-700 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.18)] disabled:cursor-not-allowed disabled:opacity-100"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-700">G</span>
                      Accedi con Google
                    </button>

                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">oppure</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setEmailPanelOpen((value) => !value)}
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-teal-500 bg-teal-500 px-4 py-3.5 text-sm font-black text-white shadow-[0_14px_30px_-22px_rgba(20,184,166,0.55)] hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    >
                      <Mail className="h-4 w-4" />
                      Accedi con la tua email
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    {t('player_area_social_pending')}
                  </div>

                  {emailPanelOpen ? (
                    <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 md:p-5 space-y-4">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setAuthMode('login')} className={authMode === 'login' ? btnPrimary : btnSecondary}>
                          <LogIn className="h-4 w-4" /> {t('player_area_sign_in')}
                        </button>
                        <button type="button" onClick={() => setAuthMode('register')} className={authMode === 'register' ? btnPrimary : btnSecondary}>
                          <UserPlus className="h-4 w-4" /> {t('player_area_register')}
                        </button>
                      </div>

                      <div className="text-xs font-semibold leading-5 text-slate-500">
                        {t('player_area_email_recovery_hint')}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_email')}</div>
                          <input value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder={t('player_area_email_placeholder')} />
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_password')}</div>
                          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder={t('player_area_password_placeholder')} />
                        </div>
                        {authMode === 'register' ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('name_label')}</div>
                                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={inputClass} placeholder={t('player_area_first_name_placeholder')} />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_last_name')}</div>
                                <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={inputClass} placeholder={t('player_area_last_name_placeholder')} />
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date')}</div>
                              <input value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={inputClass} placeholder="gg/mm/aaaa" />
                              <div className="mt-2 text-xs font-semibold text-slate-500">{t('player_area_birth_date_hint')}</div>
                            </div>
                          </>
                        ) : null}
                      </div>

                      <button type="button" onClick={submitAuth} className={`${btnPrimary} w-full`}>
                        {authMode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                        {authMode === 'login' ? t('player_area_sign_in') : t('player_area_register')}
                      </button>

                      <button type="button" onClick={() => void requestPasswordReset()} className={`${btnSecondary} w-full`}>
                        <Mail className="h-4 w-4" /> {t('player_area_forgot_password')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : !effectiveProfile ? (
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 md:p-5 space-y-4">
                <div>
                  <div className={sectionTitleClass}>{t('player_area_profile_title')}</div>
                  <div className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                    {t('player_area_profile_desc')}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('name_label')}</div>
                    <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={inputClass} placeholder={t('player_area_first_name_placeholder')} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_last_name')}</div>
                    <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={inputClass} placeholder={t('player_area_last_name_placeholder')} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date')}</div>
                  <input value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={inputClass} placeholder="gg/mm/aaaa" />
                  <div className="mt-2 text-xs font-semibold text-slate-500">{t('player_area_birth_date_hint')}</div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={submitProfile} className={btnPrimary}>
                    <BadgeCheck className="h-4 w-4" /> {t('player_area_save_profile')}
                  </button>
                  <button type="button" onClick={() => void signOut()} className={btnSecondary}>
                    <LogOut className="h-4 w-4" /> {t('player_area_sign_out')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 md:p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className={sectionTitleClass}>{effectiveProfile.canonicalPlayerName}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-600">
                        {effectiveSession.mode === 'live'
                          ? `${effectiveProfile.canonicalPlayerName} · ${formatBirthDateDisplay(effectiveProfile.birthDate)}`
                          : getPlayerPreviewIdentityLabel(snapshot.profile)}
                      </div>
                    </div>
                    <button type="button" onClick={() => void signOut()} className={btnSecondary}>
                      <LogOut className="h-4 w-4" /> {t('player_area_sign_out')}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label={t('titles')} value={effectivePersonalProfile?.totalTitles ?? 0} />
                  <MetricCard label={t('scores_label')} value={effectivePersonalProfile?.totalCanestri ?? 0} />
                  <MetricCard label={t('soffi_label')} value={effectivePersonalProfile?.totalSoffi ?? 0} />
                  <MetricCard label={t('active_aliases')} value={effectivePersonalProfile?.aliasCount ?? 0} />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4 md:p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-amber-600" />
                      <div className={sectionTitleClass}>{t('player_area_results_title')}</div>
                    </div>

                    {effectivePersonalProfile ? (
                      <div className="space-y-3">
                        {effectivePersonalProfile.titles.slice(0, 5).map((row) => (
                          <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <div className="text-sm font-black text-slate-900">{row.tournamentName}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              {row.year} · {row.teamName || t('team_label')}
                            </div>
                          </div>
                        ))}
                        {!effectivePersonalProfile.titles.length ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-600">
                            {t('player_area_no_results')}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-600">
                        {t('player_area_no_results')}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[22px] border border-slate-200 bg-white p-4 md:p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-sky-600" />
                        <div className={sectionTitleClass}>{t('player_area_live_title')}</div>
                      </div>

                      {effectiveLiveStatus.linkedTeam ? (
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('team_label')}</div>
                        <div className="mt-1 text-base font-black text-slate-950">{effectiveLiveStatus.linkedTeam.name}</div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <MetricCard label={t('turns')} value={effectiveLiveStatus.turnsUntilPlay ?? t('not_available_short')} />
                        <MetricCard label={t('match')} value={effectiveLiveStatus.nextMatch ? t('player_area_live_match_ready') : t('not_available_short')} />
                      </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-700">
                            {linkedMatchLabel || t('player_area_live_empty')}
                          </div>
                          {effectiveLiveStatus.refereeBypassEligible ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 space-y-3">
                              <div>{t('player_area_live_referee')}</div>
                              {onOpenReferees ? (
                                <button type="button" onClick={onOpenReferees} className={btnPrimary}>
                                  <ShieldCheck className="h-4 w-4" /> {t('referees_area')}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-600">
                          {t('player_area_live_empty')}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-white p-4 md:p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <BellRing className="h-5 w-5 text-amber-600" />
                        <div className={sectionTitleClass}>{t('player_area_call_title')}</div>
                      </div>

                      {effectiveLiveStatus.activeCall ? (
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <div className="text-sm font-black text-slate-900">{effectiveLiveStatus.activeCall.teamName}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              {effectiveLiveStatus.activeCall.status === 'acknowledged'
                                ? t('player_area_call_acknowledged')
                                : t('player_area_call_ringing')}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {effectiveLiveStatus.activeCall.status !== 'acknowledged' ? (
                              <button type="button" onClick={acknowledgeCall} className={btnPrimary}>
                                <BadgeCheck className="h-4 w-4" /> {t('confirm')}
                              </button>
                            ) : (
                              <button type="button" disabled className={btnSecondary}>
                                <BadgeCheck className="h-4 w-4" /> {t('player_area_call_acknowledged')}
                              </button>
                            )}
                            {effectiveLiveStatus.activeCall.previewOnly ? (
                              <button type="button" onClick={clearCall} className={btnDanger}>
                                <PhoneCall className="h-4 w-4" /> {t('cancel')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-600">
                          {t('player_area_call_none')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 md:p-5 space-y-4">
              <div>
                <div className={sectionTitleClass}>{t('player_area_activation_title')}</div>
                <div className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  {t('player_area_activation_desc')}
                </div>
              </div>

              <div className="space-y-2 text-sm font-semibold text-slate-700">
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <span>{t('player_area_feature_auth')}</span>
                  <span className="font-black">{effectiveFeatureStatus.remoteAuthPrepared ? t('prepared') : t('player_area_preview_only')}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <span>{t('player_area_feature_profile')}</span>
                  <span className="font-black">{effectiveFeatureStatus.playerProfilesPrepared ? t('prepared') : t('player_area_preview_only')}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <span>{t('player_area_feature_calls')}</span>
                  <span className="font-black">{effectiveFeatureStatus.playerCallsPrepared ? t('prepared') : t('player_area_preview_only')}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 md:p-5">
              <div className="flex items-center gap-3">
                {effectiveLiveStatus.activeCall?.status === 'ringing' ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
                ) : effectiveLiveStatus.activeCall?.status === 'acknowledged' ? (
                  <BadgeCheck className="h-5 w-5 text-emerald-600" />
                ) : (
                  <PhoneCall className="h-5 w-5 text-slate-500" />
                )}
                <div className="text-sm font-black text-slate-900">
                  {effectiveSession?.mode === 'live'
                    ? (liveRuntimeStatus === 'ready' ? t('prepared') : (liveRuntimeError || t('player_area_password_reset_pending')))
                    : t('player_area_preview_note')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
