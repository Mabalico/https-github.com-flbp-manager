import React from 'react';
import { createPortal } from 'react-dom';
import {
  BadgeCheck,
  BellRing,
  ChevronRight,
  Eye,
  EyeOff,
  Facebook,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  PhoneCall,
  ShieldCheck,
  Star,
  Trophy,
  UserPlus,
  UserRound,
  Wind,
} from 'lucide-react';
import { coerceAppState, type AppState } from '../services/storageService';
import { useTranslation } from '../App';
import { BirthDateInput } from './admin/BirthDateInput';
import { formatBirthDateDisplay, normalizeBirthDateInput } from '../services/playerIdentity';
import type { PlayerSupabaseProfileRow, PlayerSupabaseSession, PlayerSupabaseSignUpResult } from '../services/supabaseRest';
import {
  acknowledgePlayerAppCall,
  clearPlayerSupabaseSession,
  clearSupabaseSession,
  consumePlayerSupabaseSessionFromUrl,
  ensureFreshPlayerSupabaseSession,
  getPlayerOAuthAuthorizeUrl,
  getPlayerSupabaseSession,
  getSupabaseConfig,
  playerRequestPasswordReset,
  playerSignInWithPassword,
  playerSignOutSupabase,
  playerSignUpWithPassword,
  pullPlayerOwnAccountMergeRequests,
  pullPublicWorkspaceState,
  setSupabaseSession,
  signOutSupabase,
  playerUpdatePassword,
  pullPlayerAppCalls,
  pullPlayerAppProfile,
  pushPlayerAppProfile,
  registerPlayerAppDevice,
  submitPlayerAccountMergeRequest,
  type PlayerAccountMergeRequestRow,
} from '../services/supabaseRest';
import {
  acknowledgePlayerPreviewCall,
  buildPlayerAreaBootstrapSnapshot,
  buildPlayerCanonicalIdentity,
  buildPlayerRuntimeProfileSnapshot,
  buildPlayerRuntimeSessionFromSupabase,
  clearPlayerPreviewCall,
  clearPlayerPresenceSnapshot,
  derivePlayerLiveStatus,
  getPlayerPreviewIdentityLabel,
  mapSupabaseCallRowToPlayerCallRequest,
  registerPlayerPreviewAccount,
  signInPlayerPreviewAccount,
  signOutPlayerPreviewSession,
  savePlayerPreviewProfile,
  toPlayerRuntimeProfile,
  PLAYER_APP_CHANGE_EVENT,
  writePlayerPresenceSnapshot,
} from '../services/playerAppService';
import { getMatchParticipantIds, getMatchScoreForTeam } from '../services/matchUtils';
import { isLocalOnlyMode } from '../services/repository/featureFlags';
import { getNativeShellRuntime } from '../services/nativeShell';
import {
  openNativePushSettings,
  readNativePushRegistration,
  refreshNativePushRegistration,
  requestNativePushPermission,
  subscribeNativePushRegistration,
  type NativePushRegistrationSnapshot,
} from '../services/nativePushBridge';
import { PlasticCupIcon } from './icons/PlasticCupIcon';
import {
  buildPlayerRegistrationAliasSuggestions,
  type PlayerAccountAliasReason,
  type PlayerRegistrationAliasSuggestion,
} from '../services/playerAccountAliasSuggestions';

interface PlayerAreaProps {
  state: AppState;
  onOpenReferees?: () => void;
  onOpenTournament?: (tournamentId: string) => void;
  onOpenFantabeerpong?: () => void;
}

const cardClass = 'animate-pop-in rounded-[26px] border border-slate-200/50 bg-white/95 backdrop-blur-md shadow-sm shadow-slate-200/60 hover:shadow-md transition-all duration-300';
const sectionTitleClass = 'text-lg font-black text-slate-950';
const metricCardClass = 'group relative overflow-hidden rounded-[24px] border border-white/60 bg-white/70 px-5 py-4 backdrop-blur-xl shadow-sm shadow-slate-200/50 hover:shadow-xl hover:-translate-y-1 hover:bg-white/95 transition-all duration-300 ring-1 ring-inset ring-slate-100/50';
const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition focus:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [overflow-anchor:none]';
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
const btnPrimary = `${btnBase} border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] focus-visible:ring-blue-500`;
const btnSecondary = `${btnBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-slate-300`;
const btnDanger = `${btnBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-[0.98] focus-visible:ring-rose-500`;
const ADMIN_LEGACY_AUTH_LS_KEY = 'flbp_admin_legacy_authed';
const PLAYER_ALIAS_PROMPT_ANSWER_PREFIX = 'flbp_player_alias_prompt_answer::';

type PlayerAliasPromptAnswer = 'reported' | 'not_me';

const schedulePlayerAreaTask = (task: () => void) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout?: number }) => number }).requestIdleCallback(task, { timeout: 120 });
    return () => {
      try {
        (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      } catch {
        // ignore
      }
    };
  }
  const timerId = window.setTimeout(task, 0);
  return () => window.clearTimeout(timerId);
};

type LiveCallRequest = ReturnType<typeof mapSupabaseCallRowToPlayerCallRequest>;
type RefreshLiveRuntimeOptions = { silent?: boolean };

const sameNullableText = (left?: string | null, right?: string | null) => String(left || '') === String(right || '');

const samePlayerSupabaseSession = (left: PlayerSupabaseSession | null, right: PlayerSupabaseSession | null) => {
  if (!left || !right) return left === right;
  return sameNullableText(left.accessToken, right.accessToken)
    && sameNullableText(left.refreshToken, right.refreshToken)
    && sameNullableText(left.expiresAt, right.expiresAt)
    && sameNullableText(left.email, right.email)
    && sameNullableText(left.userId, right.userId)
    && sameNullableText(left.provider, right.provider)
    && (left.flowType || 'session') === (right.flowType || 'session');
};

const sameLiveProfileRow = (left: PlayerSupabaseProfileRow | null, right: PlayerSupabaseProfileRow | null) => {
  if (!left || !right) return left === right;
  return sameNullableText(left.workspace_id, right.workspace_id)
    && sameNullableText(left.user_id, right.user_id)
    && sameNullableText(left.first_name, right.first_name)
    && sameNullableText(left.last_name, right.last_name)
    && sameNullableText(left.birth_date, right.birth_date)
    && sameNullableText(left.canonical_player_id, right.canonical_player_id)
    && sameNullableText(left.canonical_player_name, right.canonical_player_name)
    && sameNullableText(left.created_at, right.created_at)
    && sameNullableText(left.updated_at, right.updated_at);
};

const buildPlayerAliasPromptSubjectKey = (accountId?: string | null, email?: string | null) => {
  const safeAccountId = String(accountId || '').trim();
  if (safeAccountId) return `account:${safeAccountId}`;
  const safeEmail = String(email || '').trim().toLowerCase();
  return safeEmail ? `email:${safeEmail}` : '';
};

const readPlayerAliasPromptAnswer = (
  subjectKey: string,
  candidatePlayerId: string
): PlayerAliasPromptAnswer | null => {
  if (!subjectKey || typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(`${PLAYER_ALIAS_PROMPT_ANSWER_PREFIX}${subjectKey}::${candidatePlayerId}`);
    return value === 'reported' || value === 'not_me' ? value : null;
  } catch {
    return null;
  }
};

const hasReportedPlayerAliasPromptAnswer = (
  subjectKey: string,
  candidatePlayerId: string
) => readPlayerAliasPromptAnswer(subjectKey, candidatePlayerId) === 'reported';

const writePlayerAliasPromptAnswer = (
  subjectKey: string,
  candidatePlayerId: string,
  answer: PlayerAliasPromptAnswer
) => {
  if (!subjectKey || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${PLAYER_ALIAS_PROMPT_ANSWER_PREFIX}${subjectKey}::${candidatePlayerId}`, answer);
  } catch {
    // ignore local storage failures
  }
};

const sameLiveCall = (left: LiveCallRequest, right: LiveCallRequest) => (
  left.id === right.id
  && left.tournamentId === right.tournamentId
  && left.teamId === right.teamId
  && left.matchId === right.matchId
  && left.teamName === right.teamName
  && left.targetAccountId === right.targetAccountId
  && left.targetPlayerId === right.targetPlayerId
  && left.targetPlayerName === right.targetPlayerName
  && left.requestedAt === right.requestedAt
  && left.acknowledgedAt === right.acknowledgedAt
  && left.cancelledAt === right.cancelledAt
  && left.status === right.status
  && left.previewOnly === right.previewOnly
);

const sameLiveCalls = (left: LiveCallRequest[], right: LiveCallRequest[]) => (
  left.length === right.length && left.every((call, index) => sameLiveCall(call, right[index]))
);

const samePlayerAccountMergeRequest = (left: PlayerAccountMergeRequestRow, right: PlayerAccountMergeRequestRow) => (
  left.id === right.id
  && left.candidate_player_id === right.candidate_player_id
  && left.requester_email === right.requester_email
  && left.status === right.status
  && left.updated_at === right.updated_at
);

const samePlayerAccountMergeRequests = (left: PlayerAccountMergeRequestRow[], right: PlayerAccountMergeRequestRow[]) => (
  left.length === right.length && left.every((row, index) => samePlayerAccountMergeRequest(row, right[index]))
);

const samePlayerRegistrationAliasSuggestion = (
  left: PlayerRegistrationAliasSuggestion,
  right: PlayerRegistrationAliasSuggestion
) => (
  left.id === right.id
  && left.candidatePlayerId === right.candidatePlayerId
  && left.candidateDisplayName === right.candidateDisplayName
  && left.candidateBirthDate === right.candidateBirthDate
  && left.confidence === right.confidence
  && left.candidateTotalTitles === right.candidateTotalTitles
  && left.candidateTotalCanestri === right.candidateTotalCanestri
  && left.candidateTotalSoffi === right.candidateTotalSoffi
  && left.reasons.length === right.reasons.length
  && left.reasons.every((reason, index) => reason === right.reasons[index])
);

const samePlayerRegistrationAliasSuggestions = (
  left: PlayerRegistrationAliasSuggestion[],
  right: PlayerRegistrationAliasSuggestion[]
) => (
  left.length === right.length
  && left.every((row, index) => samePlayerRegistrationAliasSuggestion(row, right[index]))
);

const buildLiveAccountAliasSuggestions = (
  sourceState: AppState,
  profile: Pick<PlayerSupabaseProfileRow, 'first_name' | 'last_name' | 'birth_date' | 'canonical_player_id'>
) =>
  buildPlayerRegistrationAliasSuggestions(sourceState, {
    firstName: profile.first_name,
    lastName: profile.last_name,
    birthDate: profile.birth_date,
  })
    .filter((row) => row.candidatePlayerId !== String(profile.canonical_player_id || '').trim())
    .slice(0, 6);

const nativePushRegistrationNeedsAction = (registration: NativePushRegistrationSnapshot | null) => (
  !!registration?.deviceId &&
  registration.configReady &&
  !registration.pushEnabled &&
  (registration.permission === 'prompt' || registration.permission === 'denied' || registration.permission === 'unknown')
);

const oneDecimalFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const normalizeTournamentDisplayName = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed === 'Pecora Nera' ? 'II Torneo Soci Pecora Nera' : trimmed;
};

const cleanDisplayValue = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^[.·\-]+$/u.test(trimmed)) return null;
  return trimmed;
};

const cleanTournamentName = (value?: string | null) => {
  const normalized = cleanDisplayValue(normalizeTournamentDisplayName(value));
  if (!normalized) return null;
  if (/^torneo$/i.test(normalized)) return null;
  return normalized;
};

const cleanTeamLabel = (value?: string | null) => {
  const normalized = cleanDisplayValue(value);
  if (!normalized) return null;
  if (/^(squadra|team)$/i.test(normalized)) return null;
  return normalized;
};

const formatMetaLine = (...parts: Array<string | null | undefined>) => {
  const values = parts.map(cleanDisplayValue).filter(Boolean) as string[];
  return values.length ? values.join(' · ') : null;
};

const getTournamentMatches = (tournament: AppState['tournamentHistory'][number] | AppState['tournament'] | null | undefined) => {
  if (!tournament) return [];
  if (Array.isArray(tournament.matches) && tournament.matches.length) return tournament.matches;
  if (Array.isArray((tournament as any).rounds) && (tournament as any).rounds.length) {
    return (tournament as any).rounds.flat().filter(Boolean);
  }
  return [];
};

const getCurrentLiveMatches = (state: AppState) => {
  const liveMatches = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
  if (liveMatches.length) return liveMatches;
  return getTournamentMatches(state.tournament);
};

const isOpenPlayerCallInCurrentState = (state: AppState, call: LiveCallRequest) => {
  const liveTournamentId = String(state.tournament?.id || '').trim();
  if (!liveTournamentId || call.tournamentId !== liveTournamentId) return false;
  const matches = getCurrentLiveMatches(state);
  if (!matches.length) return false;
  const relatedMatches = matches.filter((match) => {
    if (call.matchId) return match.id === call.matchId;
    return getMatchParticipantIds(match).includes(call.teamId);
  });
  if (!relatedMatches.length) return false;
  return relatedMatches.some((match) => match.status !== 'finished');
};

const buildPlayerPerformanceSummary = (state: AppState, profile: NonNullable<ReturnType<typeof buildPlayerRuntimeProfileSnapshot>>) => {
  const totalGames = profile.contributions.reduce((sum, row) => sum + Math.max(0, row.games || 0), 0);
  const avgPoints = totalGames > 0 ? profile.totalCanestri / totalGames : 0;
  const avgSoffi = totalGames > 0 ? profile.totalSoffi / totalGames : 0;

  const tournamentMap = new Map(
    [
      ...(state.tournamentHistory || []),
      ...(state.tournament ? [state.tournament] : []),
    ].map((tournament) => [tournament.id, tournament])
  );

  let wins = 0;
  let losses = 0;
  const seenMatches = new Set<string>();

  profile.contributions.forEach((row) => {
    const tournamentId = String(row.tournamentId || '').trim();
    const matchId = String(row.matchId || '').trim();
    const teamId = String(row.teamId || '').trim();
    if (!tournamentId || !matchId || !teamId) return;

    const dedupeKey = `${tournamentId}:${matchId}:${teamId}`;
    if (seenMatches.has(dedupeKey)) return;

    const tournament = tournamentMap.get(tournamentId);
    const match = getTournamentMatches(tournament).find((item) => item.id === matchId);
    if (!match || match.status !== 'finished') return;

    const participantIds = getMatchParticipantIds(match);
    if (!participantIds.includes(teamId)) return;

    const teamScore = getMatchScoreForTeam(match, teamId);
    const opponentScores = participantIds
      .filter((id) => id !== teamId)
      .map((id) => getMatchScoreForTeam(match, id));
    if (!opponentScores.length) return;

    const bestOpponentScore = Math.max(...opponentScores);
    if (teamScore > bestOpponentScore) wins += 1;
    else if (teamScore < bestOpponentScore) losses += 1;

    seenMatches.add(dedupeKey);
  });

  const decidedGames = wins + losses;

  return {
    totalGames,
    avgPoints,
    avgSoffi,
    wins,
    losses,
    winRate: decidedGames > 0 ? (wins / decidedGames) * 100 : null,
  };
};

const getTitleVisual = (
  type: NonNullable<ReturnType<typeof buildPlayerRuntimeProfileSnapshot>>['titles'][number]['type'],
  t: (key: string) => string
) => {
  switch (type) {
    case 'winner':
      return {
        label: t('winner'),
        Icon: Trophy,
        chipClass: 'bg-amber-50 text-amber-800 ring-amber-200/80',
        iconClass: 'text-amber-500',
      };
    case 'mvp':
      return {
        label: t('mvp_plural'),
        Icon: Star,
        chipClass: 'bg-orange-50 text-orange-800 ring-orange-200/80',
        iconClass: 'text-orange-500',
      };
    case 'top_scorer':
      return {
        label: t('top_scorer_single'),
        Icon: PlasticCupIcon,
        chipClass: 'bg-yellow-50 text-yellow-900 ring-yellow-200/80',
        iconClass: 'text-yellow-600',
      };
    case 'defender':
      return {
        label: t('defender_single'),
        Icon: Wind,
        chipClass: 'bg-sky-50 text-sky-900 ring-sky-200/80',
        iconClass: 'text-sky-600',
      };
    case 'top_scorer_u25':
      return {
        label: t('top_scorer_u25_single'),
        Icon: PlasticCupIcon,
        chipClass: 'bg-yellow-50 text-yellow-900 ring-yellow-200/80',
        iconClass: 'text-yellow-600',
      };
    case 'defender_u25':
    default:
      return {
        label: t('defender_u25_single'),
        Icon: UserRound,
        chipClass: 'bg-indigo-50 text-indigo-900 ring-indigo-200/80',
        iconClass: 'text-indigo-500',
      };
  }
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className={metricCardClass}>
    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-100/50 blur-3xl transition-transform group-hover:scale-150 duration-500"></div>
    <div className="relative z-10 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
    <div className="relative z-10 mt-1 text-2xl tracking-tight font-black text-slate-900">{value}</div>
    {hint ? <div className="relative z-10 mt-1 text-xs font-bold text-slate-500">{hint}</div> : null}
  </div>
);

const registrationAliasReasonLabel = (reason: PlayerAccountAliasReason, t: (key: string) => string) => {
  switch (reason) {
    case 'same_birthdate':
      return t('data_accounts_alias_reason_same_birthdate');
    case 'exact_name':
      return t('data_accounts_alias_reason_exact_name');
    case 'close_name':
      return t('data_accounts_alias_reason_close_name');
    default:
      return t('data_accounts_alias_reason_existing_stats');
  }
};

const isPlayerBackendPendingError = (message: string) =>
  /player_app_profiles|player_app_devices|player_app_calls|flbp_player_ack_call|flbp_player_call_team|relation .*player_app_|function .*flbp_player_/i.test(message);

const getPlayerAreaFriendlyErrorMessage = (error: unknown, fallback: string, t?: (key: string) => string): string => {
  const raw = String((error as { message?: unknown } | null)?.message ?? error ?? '').trim();
  if (!raw) return fallback;

  let structured: Record<string, unknown> | null = null;
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        structured = parsed as Record<string, unknown>;
      }
    } catch {
      structured = null;
    }
  }

  const code = String(structured?.code ?? '').trim();
  const errorCode = String(structured?.error_code ?? '').trim();
  const reason = String(structured?.reason ?? '').trim();
  const message = String(structured?.message ?? (reason || raw)).trim();
  const hint = String(structured?.hint ?? '').trim();
  const haystack = `${code} ${errorCode} ${message} ${hint} ${reason}`.toLowerCase();

  if (/22008|date\/time field value out of range|datestyle/.test(haystack)) {
    return t?.('player_area_invalid_birthdate_error') || fallback;
  }
  if (/invalid_credentials|invalid login credentials/.test(haystack)) {
    return t?.('player_area_invalid_credentials_error') || fallback;
  }
  if (/user already registered|already been registered/.test(haystack)) {
    return t?.('player_area_email_exists_error') || fallback;
  }
  if (/email address .* invalid|invalid email|unable to validate email address/.test(haystack)) {
    return t?.('player_area_invalid_email_error') || fallback;
  }
  if (/password should be at least|password is too short|weak password/.test(haystack)) {
    return t?.('player_area_weak_password_error') || fallback;
  }
  if (/failed to fetch|networkerror|network request failed|signal is aborted|aborterror/.test(haystack)) {
    return t?.('player_area_network_error') || fallback;
  }
  if (/jwt expired|sessione.*scadut|session.*expired|invalid jwt|auth session missing|refresh token/.test(haystack)) {
    return t?.('player_area_session_expired_error') || fallback;
  }
  if (/row-level security|violates row-level security|permission denied/.test(haystack)) {
    return t?.('player_area_permission_session_error') || fallback;
  }
  if (/requester identity is incomplete/.test(haystack)) {
    return reason || t?.('player_area_profile_fields_required') || fallback;
  }
  if (/candidate player is required/.test(haystack)) {
    return reason || fallback;
  }
  if (structured) {
    return message || reason || fallback;
  }
  if (/postgrest|supabase|duplicate key value|constraint|foreign key/i.test(message)) {
    return fallback;
  }
  return message || fallback;
};

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

export const PlayerArea: React.FC<PlayerAreaProps> = ({ state, onOpenReferees, onOpenTournament, onOpenFantabeerpong }) => {
  const { t } = useTranslation();
  const liveBackendEnabled = !isLocalOnlyMode() && !!getSupabaseConfig();
  const nativeShellRuntime = getNativeShellRuntime();
  const embeddedNativeShell = nativeShellRuntime.isNative;
  const dedicatedAndroidShell =
    nativeShellRuntime.isDedicatedShell && nativeShellRuntime.platform === 'android';
  const initialStoredSession = liveBackendEnabled ? getPlayerSupabaseSession() : null;
  const initialLiveSessionPresent = !!initialStoredSession?.accessToken;
  const initialRecoveryFlow = initialStoredSession?.flowType === 'recovery';
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [authMode, setAuthMode] = React.useState<'login' | 'register'>('login');
  const [emailPanelOpen, setEmailPanelOpen] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [recoveryPassword, setRecoveryPassword] = React.useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = React.useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = React.useState(false);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [birthDate, setBirthDate] = React.useState('');
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [registerAliasModalOpen, setRegisterAliasModalOpen] = React.useState(false);
  const [registerAliasPromptMode, setRegisterAliasPromptMode] = React.useState<'register' | 'account' | null>(null);
  const [registerAliasPromptSuggestions, setRegisterAliasPromptSuggestions] = React.useState<PlayerRegistrationAliasSuggestion[]>([]);
  const [registerAliasSelectionIds, setRegisterAliasSelectionIds] = React.useState<string[]>([]);
  const [registerAliasComment, setRegisterAliasComment] = React.useState('');
  const [registerAliasSubmitting, setRegisterAliasSubmitting] = React.useState(false);
  const [accountAliasInterstitialDismissed, setAccountAliasInterstitialDismissed] = React.useState(false);
  const [aliasPromptAnswerNonce, setAliasPromptAnswerNonce] = React.useState(0);
  const [liveSession, setLiveSession] = React.useState<PlayerSupabaseSession | null>(initialStoredSession);
  const [liveAuthFlow, setLiveAuthFlow] = React.useState<PlayerSupabaseSession['flowType']>(initialRecoveryFlow ? 'recovery' : 'session');
  const [liveProfileRow, setLiveProfileRow] = React.useState<PlayerSupabaseProfileRow | null>(null);
  const [liveMergeRequests, setLiveMergeRequests] = React.useState<PlayerAccountMergeRequestRow[]>([]);
  const [liveAccountAliasSuggestions, setLiveAccountAliasSuggestions] = React.useState<PlayerRegistrationAliasSuggestion[]>([]);
  const [liveAccountAliasLoaded, setLiveAccountAliasLoaded] = React.useState(!(initialLiveSessionPresent && !initialRecoveryFlow));
  const [liveRuntimeArmed, setLiveRuntimeArmed] = React.useState(initialLiveSessionPresent && !initialRecoveryFlow);
  const [liveCallRefreshNonce, setLiveCallRefreshNonce] = React.useState(0);
  const [liveCalls, setLiveCalls] = React.useState<LiveCallRequest[]>([]);
  const [liveRuntimeStatus, setLiveRuntimeStatus] = React.useState<'disabled' | 'loading' | 'ready' | 'backend_pending' | 'error'>(
    initialLiveSessionPresent && !initialRecoveryFlow ? 'loading' : 'disabled'
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
  const [liveDerivedRefreshNonce, setLiveDerivedRefreshNonce] = React.useState(0);
  const [nativePushRegistration, setNativePushRegistration] = React.useState<NativePushRegistrationSnapshot | null>(() => readNativePushRegistration());
  const [nativePushPermissionPromptOpen, setNativePushPermissionPromptOpen] = React.useState(false);
  const liveRuntimeRequestRef = React.useRef(0);
  const nativePushPermissionRequestedRef = React.useRef(false);
  const nativePushPermissionRegistrationRef = React.useRef<NativePushRegistrationSnapshot | null>(null);
  const nativePushSyncKeyRef = React.useRef('');
  const accountAliasPromptDismissedRef = React.useRef(false);
  const authFeedbackRef = React.useRef<HTMLDivElement | null>(null);

  const syncUnifiedAuthFromPlayerSession = React.useCallback((session: PlayerSupabaseSession | null) => {
    setLiveSession((current) => (samePlayerSupabaseSession(current, session) ? current : session));
    try {
      sessionStorage.removeItem(ADMIN_LEGACY_AUTH_LS_KEY);
    } catch {
      // ignore
    }
    if (!session?.accessToken || session.flowType === 'recovery') {
      clearSupabaseSession();
      return;
    }
    setSupabaseSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken || null,
      expiresAt: session.expiresAt || null,
      email: session.email || null,
      userId: session.userId || null,
    });
  }, []);

  const loginEntryNote = liveBackendEnabled
    ? t('player_area_login_entry_note_live')
    : t('player_area_preview_note');
  const socialPendingNote = liveBackendEnabled
    ? t('player_area_social_pending_live')
    : t('player_area_social_pending');

  const registrationAliasSuggestions = React.useMemo(
    () =>
      authMode === 'register'
        ? buildPlayerRegistrationAliasSuggestions(state, {
            firstName,
            lastName,
            birthDate,
          }).slice(0, 4)
        : [],
    [authMode, birthDate, firstName, lastName, state]
  );

  const registrationAliasSubjectKey = React.useMemo(
    () => buildPlayerAliasPromptSubjectKey(null, email),
    [email]
  );

  const pendingRegistrationAliasSuggestions = React.useMemo(
    () =>
      registrationAliasSuggestions.filter(
        (row) => !hasReportedPlayerAliasPromptAnswer(registrationAliasSubjectKey, row.candidatePlayerId)
      ),
    [aliasPromptAnswerNonce, registrationAliasSubjectKey, registrationAliasSuggestions]
  );

  React.useEffect(() => {
    const handler = () => setRefreshNonce((value) => value + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('focus', handler);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    const onVisible = () => {
      if (document.visibilityState === 'visible') handler();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
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

  React.useEffect(() => {
    if (!embeddedNativeShell) return;
    const onResume = () => {
      setNativePushPermissionPromptOpen(false);
      const fresh = readNativePushRegistration();
      if (fresh) setNativePushRegistration(fresh);
    };
    window.addEventListener('flbp-native-resume', onResume);
    return () => window.removeEventListener('flbp-native-resume', onResume);
  }, [embeddedNativeShell]);

  const persistNativePushRegistration = React.useCallback((registration: NativePushRegistrationSnapshot | null) => {
    if (!registration?.deviceId) return Promise.resolve(null);
    return registerPlayerAppDevice({
      id: registration.deviceId,
      platform: registration.platform,
      deviceToken: registration.deviceToken,
      pushEnabled: registration.permission === 'granted' && !!registration.deviceToken,
    });
  }, []);

  const disableNativePushRegistration = React.useCallback((registration: NativePushRegistrationSnapshot | null) => {
    if (!registration?.deviceId) return Promise.resolve(null);
    return registerPlayerAppDevice({
      id: registration.deviceId,
      platform: registration.platform,
      deviceToken: registration.deviceToken,
      pushEnabled: false,
    });
  }, []);

  const syncLiveDeviceRegistration = React.useCallback(async () => {
    if (!liveBackendEnabled) return null;
    if (!embeddedNativeShell) return null;

    let registration = await refreshNativePushRegistration();
    if (!registration) {
      return null;
    }

    const shouldAskForNativePush = nativePushRegistrationNeedsAction(registration);

    if (shouldAskForNativePush && !nativePushPermissionPromptOpen && !nativePushPermissionRequestedRef.current) {
      nativePushPermissionRequestedRef.current = true;
      nativePushPermissionRegistrationRef.current = registration;
      setNativePushRegistration(registration);
      setNativePushPermissionPromptOpen(true);
      return persistNativePushRegistration(registration);
    }

    registration = registration || readNativePushRegistration();
    if (!registration?.deviceId) return null;

    setNativePushRegistration(registration);
    return persistNativePushRegistration(registration);
  }, [embeddedNativeShell, liveBackendEnabled, persistNativePushRegistration]);

  const confirmNativePushPermission = React.useCallback(async () => {
    setNativePushPermissionPromptOpen(false);
    const pendingRegistration =
      readNativePushRegistration() || nativePushPermissionRegistrationRef.current || nativePushRegistration;
    if (pendingRegistration?.permission === 'granted' && !pendingRegistration.deviceToken) {
      const refreshed = await refreshNativePushRegistration();
      const nextRegistration = refreshed || readNativePushRegistration() || pendingRegistration;
      nativePushPermissionRegistrationRef.current = null;
      if (!nextRegistration?.deviceId) return;
      setNativePushRegistration(nextRegistration);
      try {
        await persistNativePushRegistration(nextRegistration);
      } catch (error) {
        console.warn('FLBP native push token refresh sync failed', error);
      }
      return;
    }
    const shouldRequestPermission = pendingRegistration?.permission === 'prompt' && !dedicatedAndroidShell;
    let registration = await (shouldRequestPermission ? requestNativePushPermission() : openNativePushSettings());
    registration = registration || readNativePushRegistration() || pendingRegistration;
    nativePushPermissionRegistrationRef.current = null;
    if (!registration?.deviceId) return;

    setNativePushRegistration(registration);
    try {
      await persistNativePushRegistration(registration);
      } catch (error) {
        console.warn('FLBP native push permission sync failed', error);
      }
  }, [dedicatedAndroidShell, nativePushRegistration, persistNativePushRegistration]);

  const dismissNativePushPermission = React.useCallback(() => {
    nativePushPermissionRegistrationRef.current = null;
    // Keep the automatic prompt one-shot for this login session; the inline CTA remains available.
    nativePushPermissionRequestedRef.current = true;
    setNativePushPermissionPromptOpen(false);
  }, []);

  const openNativePushPermissionPrompt = React.useCallback(() => {
    const registration = readNativePushRegistration() || nativePushRegistration;
    nativePushPermissionRegistrationRef.current = registration;
    if (registration) {
      setNativePushRegistration(registration);
    }
    setNativePushPermissionPromptOpen(true);
  }, [nativePushRegistration]);

  React.useEffect(() => {
    if (!liveBackendEnabled || !embeddedNativeShell || liveAuthFlow === 'recovery' || !liveSession?.accessToken) return;
    const registration = nativePushRegistration || readNativePushRegistration();
    if (!nativePushRegistrationNeedsAction(registration)) return;
    if (nativePushPermissionPromptOpen || nativePushPermissionRequestedRef.current) return;
    nativePushPermissionRequestedRef.current = true;
    nativePushPermissionRegistrationRef.current = registration;
    setNativePushRegistration(registration);
    setNativePushPermissionPromptOpen(true);
  }, [
    embeddedNativeShell,
    liveAuthFlow,
    liveBackendEnabled,
    liveSession?.accessToken,
    nativePushPermissionPromptOpen,
    nativePushRegistration?.configReady,
    nativePushRegistration?.deviceId,
    nativePushRegistration?.permission,
    nativePushRegistration?.pushEnabled,
  ]);

  React.useEffect(() => {
    if (!liveBackendEnabled || !embeddedNativeShell || liveAuthFlow === 'recovery' || !liveSession?.accessToken || !nativePushRegistration?.deviceId) return;
    const syncKey = [
      liveSession.userId || '',
      nativePushRegistration.deviceId,
      nativePushRegistration.deviceToken || '',
      nativePushRegistration.permission,
      nativePushRegistration.pushEnabled ? '1' : '0',
      nativePushRegistration.configReady ? '1' : '0',
    ].join('|');
    if (nativePushSyncKeyRef.current === syncKey) return;
    nativePushSyncKeyRef.current = syncKey;
    let cancelled = false;
    void persistNativePushRegistration(nativePushRegistration).catch((error) => {
      if (cancelled) return;
      nativePushSyncKeyRef.current = '';
      console.warn('FLBP native push device sync failed', error);
    });
    return () => {
      cancelled = true;
    };
  }, [
    embeddedNativeShell,
    liveAuthFlow,
    liveBackendEnabled,
    liveSession?.accessToken,
    liveSession?.userId,
    nativePushRegistration?.configReady,
    nativePushRegistration?.deviceId,
    nativePushRegistration?.deviceToken,
    nativePushRegistration?.permission,
    nativePushRegistration?.platform,
    nativePushRegistration?.pushEnabled,
    persistNativePushRegistration,
  ]);

  React.useEffect(() => {
    if (liveRuntimeArmed || liveSession?.accessToken) {
      setBootstrapPending(false);
      setBootstrapError(null);
      return;
    }
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
        const message = getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_prepare_failed'),
          t
        );
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
  }, [liveRuntimeArmed, liveSession?.accessToken, refreshNonce, safeSnapshot, state, t]);

  const refreshLiveRuntime = React.useCallback(async (
    forcedSession?: PlayerSupabaseSession | null,
    options: RefreshLiveRuntimeOptions = {}
  ) => {
    const silent = options.silent === true;
    const requestId = ++liveRuntimeRequestRef.current;
    const applyIfCurrent = (fn: () => void) => {
      if (liveRuntimeRequestRef.current !== requestId) return;
      fn();
    };
    if (!liveBackendEnabled) {
      applyIfCurrent(() => {
        setLiveRuntimeStatus('disabled');
        setLiveRuntimeError(null);
        setLiveSession(null);
        setLiveProfileRow(null);
        setLiveMergeRequests([]);
        setLiveAccountAliasSuggestions([]);
        setLiveAccountAliasLoaded(false);
        setLiveCalls([]);
      });
      return;
    }

    applyIfCurrent(() => {
      if (!silent) {
        setLiveRuntimeStatus('loading');
        setLiveAccountAliasLoaded(false);
      }
      setLiveRuntimeError(null);
    });

    try {
      const nextSession = forcedSession === undefined ? await ensureFreshPlayerSupabaseSession() : forcedSession;
      if (!nextSession?.accessToken) {
        applyIfCurrent(() => {
          syncUnifiedAuthFromPlayerSession(null);
          setLiveProfileRow(null);
          setLiveMergeRequests([]);
          setLiveAccountAliasSuggestions([]);
          setLiveAccountAliasLoaded(false);
          setLiveCalls([]);
          setLiveRuntimeStatus('disabled');
        });
        return;
      }

      applyIfCurrent(() => syncUnifiedAuthFromPlayerSession(nextSession));
      let backendPending = false;
      let pendingMessage = '';
      let nextProfile: PlayerSupabaseProfileRow | null = null;
      let nextMergeRequests: PlayerAccountMergeRequestRow[] = [];
      let nextAliasSuggestions: PlayerRegistrationAliasSuggestion[] = [];
      let nextCalls: LiveCallRequest[] = [];

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
        nextMergeRequests = await pullPlayerOwnAccountMergeRequests({
          accessToken: nextSession.accessToken,
          status: null,
        });
      } catch (error: any) {
        const message = String(error?.message || error || '').trim();
        if (isPlayerBackendPendingError(message)) {
          backendPending = true;
          pendingMessage = pendingMessage || message;
        } else {
          console.warn('[PlayerArea] Merge request sync skipped', error);
        }
      }

      if (nextProfile) {
        let aliasState = state;
        try {
          const publicWorkspace = await pullPublicWorkspaceState({
            source: 'playerAreaAliasCheck',
            kind: 'polling',
          });
          if (publicWorkspace?.state && typeof publicWorkspace.state === 'object') {
            aliasState = coerceAppState(publicWorkspace.state);
          }
        } catch (error) {
          console.warn('[PlayerArea] Alias state refresh skipped', error);
        }
        nextAliasSuggestions = buildLiveAccountAliasSuggestions(aliasState, nextProfile);
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

      applyIfCurrent(() => {
        setLiveProfileRow((current) => (sameLiveProfileRow(current, nextProfile) ? current : nextProfile));
        setLiveMergeRequests((current) => (samePlayerAccountMergeRequests(current, nextMergeRequests) ? current : nextMergeRequests));
        setLiveAccountAliasSuggestions((current) => (
          samePlayerRegistrationAliasSuggestions(current, nextAliasSuggestions) ? current : nextAliasSuggestions
        ));
        setLiveAccountAliasLoaded(true);
        setLiveCalls((current) => (sameLiveCalls(current, nextCalls) ? current : nextCalls));
        setLiveRuntimeStatus(backendPending ? 'backend_pending' : 'ready');
        setLiveRuntimeError(backendPending ? (pendingMessage || t('player_area_password_reset_pending')) : null);
        if (!silent) setLiveDerivedRefreshNonce((value) => value + 1);
      });
    } catch (error: any) {
      if (silent) {
        console.warn('[PlayerArea] Silent live runtime refresh failed', error);
        return;
      }
      const message = getPlayerAreaFriendlyErrorMessage(
        error,
        t('player_area_update_failed'),
        t
      );
      applyIfCurrent(() => {
        setLiveRuntimeStatus('error');
        setLiveRuntimeError(message);
        setLiveAccountAliasLoaded(true);
      });
    }
  }, [liveBackendEnabled, syncLiveDeviceRegistration, t]);

  React.useEffect(() => {
    if (!liveBackendEnabled) return;
    try {
      const consumed = consumePlayerSupabaseSessionFromUrl();
      if (consumed?.accessToken) {
        syncUnifiedAuthFromPlayerSession(consumed);
        const flowType = consumed.flowType === 'recovery' ? 'recovery' : 'session';
        setLiveAuthFlow(flowType);
        if (flowType === 'recovery') {
          setLiveRuntimeArmed(false);
          setLiveRuntimeStatus('disabled');
          setLiveRuntimeError(null);
          return;
        }
        setLiveRuntimeArmed(true);
        void refreshLiveRuntime(consumed);
        return;
      }
    } catch (error: any) {
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_access_complete_failed'),
          t
        ),
      });
    }
    if (liveAuthFlow === 'recovery' && liveSession?.accessToken) {
      setLiveRuntimeStatus('disabled');
      setLiveRuntimeError(null);
      return;
    }
    if (!liveRuntimeArmed) {
      setLiveRuntimeStatus('disabled');
      setLiveRuntimeError(null);
      return;
    }
    void refreshLiveRuntime();
  }, [liveAuthFlow, liveBackendEnabled, liveRuntimeArmed, liveSession?.accessToken, refreshLiveRuntime, syncUnifiedAuthFromPlayerSession, t]);

  React.useEffect(() => {
    if (!liveBackendEnabled || !liveRuntimeArmed || liveCallRefreshNonce === 0) return;
    void refreshLiveRuntime(undefined, { silent: true });
  }, [liveBackendEnabled, liveCallRefreshNonce, liveRuntimeArmed, refreshLiveRuntime]);

  React.useEffect(() => {
    if (!liveBackendEnabled || !liveRuntimeArmed || !liveSession?.accessToken || liveAuthFlow === 'recovery') return;
    const timer = window.setInterval(() => {
      setLiveCallRefreshNonce((value) => value + 1);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [liveAuthFlow, liveBackendEnabled, liveRuntimeArmed, liveSession?.accessToken]);

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
  const liveProfileHydrating = !!liveRuntimeSession && liveRuntimeStatus === 'loading';
  const activeLiveCall = React.useMemo(
    () =>
      [...liveCalls]
        .filter((row) => (row.status === 'ringing' || row.status === 'acknowledged') && isOpenPlayerCallInCurrentState(state, row))
        .sort((a, b) => b.requestedAt - a.requestedAt)[0] || null,
    [liveCalls, state]
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
  }, [activeLiveCall, liveDerivedRefreshNonce, liveRuntimeProfile, liveRuntimeSession, state, t]);

  const effectivePersonalProfile = liveRuntimeSession
    ? liveDerivedPersonalProfile
    : snapshot.personalProfile;

  const accountAliasSubjectKeys = React.useMemo(
    () =>
      Array.from(
        new Set(
          [
            buildPlayerAliasPromptSubjectKey(effectiveProfile?.accountId || liveRuntimeSession?.accountId, null),
            buildPlayerAliasPromptSubjectKey(null, effectiveSession?.email),
          ].filter(Boolean)
        )
      ),
    [effectiveProfile?.accountId, effectiveSession?.email, liveRuntimeSession?.accountId]
  );

  const accountAliasSubjectKey = accountAliasSubjectKeys[0] || '';

  const accountAliasSuggestions = React.useMemo(() => {
    if (!liveBackendEnabled || !liveRuntimeSession || !effectiveProfile) return [];
    return liveAccountAliasSuggestions;
  }, [effectiveProfile, liveAccountAliasSuggestions, liveBackendEnabled, liveRuntimeSession]);

  const requestedAliasCandidateIds = React.useMemo(
    () => new Set(
      liveMergeRequests
        .filter((row) => String(row.status || '').trim().toLowerCase() !== 'ignored')
        .map((row) => String(row.candidate_player_id || '').trim())
        .filter(Boolean)
    ),
    [liveMergeRequests]
  );

  const pendingAccountAliasSuggestions = React.useMemo(
    () =>
      accountAliasSuggestions.filter(
        (row) => !requestedAliasCandidateIds.has(row.candidatePlayerId)
      ),
    [accountAliasSuggestions, requestedAliasCandidateIds]
  );

  const hasPendingAccountMergeRequest = React.useMemo(
    () =>
      liveMergeRequests.some(
        (row) => String(row.status || '').trim().toLowerCase() === 'pending'
      ),
    [liveMergeRequests]
  );

  const activeAliasPromptSuggestions = React.useMemo(() => {
    if (registerAliasModalOpen && registerAliasPromptSuggestions.length) {
      return registerAliasPromptSuggestions;
    }
    return registerAliasPromptMode === 'account' ? pendingAccountAliasSuggestions : pendingRegistrationAliasSuggestions;
  }, [
    pendingAccountAliasSuggestions,
    pendingRegistrationAliasSuggestions,
    registerAliasModalOpen,
    registerAliasPromptMode,
    registerAliasPromptSuggestions,
  ]);

  const selectedAliasSuggestions = React.useMemo(
    () => activeAliasPromptSuggestions.filter((row) => registerAliasSelectionIds.includes(row.id)),
    [activeAliasPromptSuggestions, registerAliasSelectionIds]
  );

  React.useEffect(() => {
    if (!registerAliasModalOpen) return;
    if (!activeAliasPromptSuggestions.length) {
      setRegisterAliasModalOpen(false);
      setRegisterAliasPromptMode(null);
      setRegisterAliasSelectionIds([]);
      setRegisterAliasComment('');
      setRegisterAliasSubmitting(false);
      return;
    }
    setRegisterAliasSelectionIds((current) =>
      current.filter((id) => activeAliasPromptSuggestions.some((row) => row.id === id))
    );
  }, [activeAliasPromptSuggestions, registerAliasModalOpen]);

  React.useEffect(() => {
    accountAliasPromptDismissedRef.current = false;
    setAccountAliasInterstitialDismissed(false);
  }, [accountAliasSubjectKey]);

  React.useEffect(() => {
    if (liveRuntimeSession) return;
    setAccountAliasInterstitialDismissed(false);
  }, [liveRuntimeSession]);

  const openAccountAliasPrompt = React.useCallback(() => {
    if (!pendingAccountAliasSuggestions.length) return;
    accountAliasPromptDismissedRef.current = false;
    setAccountAliasInterstitialDismissed(false);
    setRegisterAliasPromptMode('account');
    setRegisterAliasPromptSuggestions(pendingAccountAliasSuggestions);
    setRegisterAliasSelectionIds([]);
    setRegisterAliasComment('');
    setRegisterAliasSubmitting(false);
    setRegisterAliasModalOpen(true);
  }, [pendingAccountAliasSuggestions]);

  const personalPerformanceSummary = React.useMemo(
    () => effectivePersonalProfile ? buildPlayerPerformanceSummary(state, effectivePersonalProfile) : null,
    [effectivePersonalProfile, state]
  );

  const participations = React.useMemo(() => {
    if (!effectivePersonalProfile) return [];
    const map = new Map<string, { id: string; name: string; year: string; team: string }>();
    effectivePersonalProfile.contributions.forEach((row) => {
      const tournamentId = String(row.tournamentId || '').trim();
      const tournamentName = cleanTournamentName(row.tournamentName || row.sourceLabel || '');
      if (!tournamentId || !tournamentName) return;

      const existing = map.get(tournamentId);
      const year = cleanDisplayValue(row.tournamentYear) || '';
      const team = cleanTeamLabel(row.teamName) || '';
      map.set(tournamentId, {
        id: tournamentId,
        name: existing?.name || tournamentName,
        year: existing?.year || year,
        team: existing?.team || team,
      });
    });
    return Array.from(map.values()).sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  }, [effectivePersonalProfile]);
  const effectiveLiveStatus = liveRuntimeSession
    ? (liveDerivedStatus || safeSnapshot.liveStatus)
    : snapshot.liveStatus;
  const showBootstrapNotice = (bootstrapPending || liveDerivedPending) && !!effectiveSession;
  const effectiveFeatureStatus = React.useMemo(() => ({
    ...snapshot.featureStatus,
    supabaseConfigured: liveBackendEnabled,
    supabaseSessionPresent: !!liveRuntimeSession?.accountId,
    remoteAuthPrepared: liveBackendEnabled,
    playerProfilesPrepared: liveBackendEnabled && liveRuntimeStatus === 'ready',
    playerCallsPrepared: liveBackendEnabled && liveRuntimeStatus === 'ready',
  }), [snapshot.featureStatus, liveBackendEnabled, liveRuntimeSession?.accountId, liveRuntimeStatus]);
  const activationAuthLabel = liveBackendEnabled ? `${t('prepared')} · email/password` : t('player_area_preview_only');
  const activationSocialLabel = liveBackendEnabled ? t('player_area_social_waiting_provider') : t('player_area_preview_only');
  const activationProfileLabel = !liveBackendEnabled
    ? t('player_area_preview_only')
    : effectiveProfile
      ? t('prepared')
      : t('player_area_profile_to_link');
  const activationCallsLabel = !liveBackendEnabled
    ? t('player_area_preview_only')
    : effectiveLiveStatus.linkedTeam || effectiveLiveStatus.activeCall
      ? t('prepared')
      : t('player_area_waiting_live');
  const activationPushLabel = !embeddedNativeShell
    ? t('player_area_browser_web')
    : !nativePushRegistration
      ? t('player_area_waiting_device')
      : !nativePushRegistration.configReady
        ? t('player_area_missing_config')
        : nativePushRegistration.pushEnabled
          ? t('prepared')
          : nativePushRegistration.permission === 'denied'
            ? t('player_area_permission_denied')
            : nativePushRegistration.permission === 'prompt'
              ? t('player_area_permission_needed')
              : nativePushRegistration.permission === 'granted'
                ? t('player_area_missing_token')
                : t('player_area_waiting_device');
  const canManuallyOpenNativePushPrompt =
    embeddedNativeShell &&
    !!nativePushRegistration?.deviceId &&
    !nativePushRegistration.pushEnabled &&
    (nativePushRegistration.permission === 'prompt' ||
      nativePushRegistration.permission === 'denied' ||
      nativePushRegistration.permission === 'unknown');
  const nativePushStatusMessage =
    nativePushRegistration?.permission === 'granted' && !nativePushRegistration.deviceToken
      ? t('player_area_push_initializing')
      : activationPushLabel;

  React.useEffect(() => {
    if (!feedback || (effectiveSession && liveAuthFlow !== 'recovery')) {
      return;
    }
    if (!emailPanelOpen) {
      setEmailPanelOpen(true);
    }
    const timerId = window.setTimeout(() => {
      try {
        authFeedbackRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      } catch {
        // ignore
      }
    }, 80);
    return () => window.clearTimeout(timerId);
  }, [emailPanelOpen, effectiveSession, feedback, liveAuthFlow]);

  React.useEffect(() => {
    if (!effectiveProfile) return;
    setFirstName(effectiveProfile.firstName);
    setLastName(effectiveProfile.lastName);
    setBirthDate(formatBirthDateDisplay(effectiveProfile.birthDate));
  }, [effectiveProfile?.accountId, effectiveProfile?.birthDate, effectiveProfile?.firstName, effectiveProfile?.lastName]);

  React.useEffect(() => {
    if (!effectiveSession) {
      clearPlayerPresenceSnapshot();
      return;
    }
    writePlayerPresenceSnapshot({
      accountId: effectiveSession.accountId,
      mode: effectiveSession.mode,
      email: effectiveSession.username,
      firstName: effectiveProfile?.firstName || liveProfileRow?.first_name || firstName,
    });
  }, [
    effectiveProfile?.firstName,
    effectiveSession?.accountId,
    effectiveSession?.mode,
    effectiveSession?.username,
    firstName,
    liveProfileRow?.first_name,
  ]);

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

  const submitSocialAuth = (provider: 'google' | 'facebook' | 'apple') => {
    if (!liveBackendEnabled) {
      setFeedback({ tone: 'error', message: t('player_area_enable_supabase_social') });
      return;
    }
    try {
      const redirectTo = window.location.origin;
      const authorizeUrl = getPlayerOAuthAuthorizeUrl(provider, redirectTo);
      window.location.assign(authorizeUrl);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_social_login_start_failed')) });
    }
  };

  const rememberAliasPromptAnswers = React.useCallback((
    suggestions: PlayerRegistrationAliasSuggestion[],
    answer: PlayerAliasPromptAnswer,
    subjectKeyOrKeys: string | string[]
  ) => {
    const subjectKeys = Array.isArray(subjectKeyOrKeys) ? subjectKeyOrKeys : [subjectKeyOrKeys];
    const safeSubjectKeys = Array.from(new Set(subjectKeys.filter(Boolean)));
    if (!safeSubjectKeys.length || !suggestions.length) return;
    safeSubjectKeys.forEach((subjectKey) => {
      suggestions.forEach((suggestion) => {
        writePlayerAliasPromptAnswer(subjectKey, suggestion.candidatePlayerId, answer);
      });
    });
    setAliasPromptAnswerNonce((value) => value + 1);
  }, []);

  const toggleAliasSuggestionSelection = React.useCallback((suggestionId: string) => {
    setRegisterAliasSelectionIds((current) =>
      current.includes(suggestionId)
        ? current.filter((id) => id !== suggestionId)
        : [...current, suggestionId]
    );
  }, []);

  const closeRegisterAliasModal = (options?: { dismissAccountPrompt?: boolean }) => {
    if ((options?.dismissAccountPrompt ?? true) && registerAliasPromptMode === 'account') {
      accountAliasPromptDismissedRef.current = true;
    }
    setRegisterAliasModalOpen(false);
    setRegisterAliasPromptMode(null);
    setRegisterAliasPromptSuggestions([]);
    setRegisterAliasSelectionIds([]);
    setRegisterAliasComment('');
    setRegisterAliasSubmitting(false);
  };

  const completeAuth = async (options?: {
    skipAliasPrompt?: boolean;
    aliasSuggestions?: PlayerRegistrationAliasSuggestion[];
    aliasIgnoredSuggestions?: PlayerRegistrationAliasSuggestion[];
    aliasComment?: string;
    aliasAnswerSubjectKey?: string;
  }) => {
    const stopAliasSubmitting = () => {
      if (options?.skipAliasPrompt) {
        setRegisterAliasSubmitting(false);
      }
    };
    const safeEmail = email.trim();
    const safePassword = password.trim();
    if (!safeEmail || !safePassword) {
      stopAliasSubmitting();
      setFeedback({ tone: 'error', message: t('player_area_missing_email_password') });
      return;
    }
    const registerIdentity = authMode === 'register'
      ? {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate: birthDate.trim(),
        }
      : null;
    if (registerIdentity && (!registerIdentity.firstName || !registerIdentity.lastName || !registerIdentity.birthDate)) {
      stopAliasSubmitting();
      setFeedback({ tone: 'error', message: t('player_area_missing_profile_fields') });
      return;
    }
    const normalizedRegisterBirthDate = registerIdentity ? normalizeBirthDateInput(registerIdentity.birthDate) : undefined;
    if (registerIdentity && !normalizedRegisterBirthDate) {
      stopAliasSubmitting();
      setFeedback({ tone: 'error', message: t('player_area_invalid_birthdate_error') });
      return;
    }

    if (
      liveBackendEnabled
      && authMode === 'register'
      && !options?.skipAliasPrompt
      && pendingRegistrationAliasSuggestions.length
    ) {
      stopAliasSubmitting();
      setRegisterAliasPromptMode('register');
      setRegisterAliasPromptSuggestions(pendingRegistrationAliasSuggestions);
      setRegisterAliasSelectionIds([]);
      setRegisterAliasComment('');
      setRegisterAliasModalOpen(true);
      return;
    }

    const registrationIdentity = registerIdentity
      ? buildPlayerCanonicalIdentity(
          registerIdentity.firstName,
          registerIdentity.lastName,
          normalizedRegisterBirthDate || registerIdentity.birthDate
        )
      : null;

    try {
      let finalFeedback: { tone: 'success' | 'error'; message: string } | null = null;
      if (liveBackendEnabled) {
        let session: PlayerSupabaseSession | null = null;
        let signUpResult: PlayerSupabaseSignUpResult | null = null;
        if (authMode === 'register') {
          signUpResult = await playerSignUpWithPassword(safeEmail, safePassword, {
            first_name: registerIdentity?.firstName || null,
            last_name: registerIdentity?.lastName || null,
            birth_date: normalizedRegisterBirthDate || null,
          });
          if (signUpResult.status === 'confirm_email') {
            let mergeRequestMessage = '';
            if (options?.aliasSuggestions?.length && registerIdentity && registrationIdentity) {
              const deliveredSuggestions: PlayerRegistrationAliasSuggestion[] = [];
              for (const suggestion of options.aliasSuggestions) {
                try {
                  await submitPlayerAccountMergeRequest({
                    requesterUserId: signUpResult.userId || null,
                    requesterEmail: signUpResult.email || safeEmail,
                    requesterFirstName: registerIdentity.firstName,
                    requesterLastName: registerIdentity.lastName,
                    requesterBirthDate: registrationIdentity.birthDate,
                    requesterCanonicalPlayerId: registrationIdentity.canonicalPlayerId,
                    requesterCanonicalPlayerName: registrationIdentity.canonicalPlayerName,
                    candidatePlayerId: suggestion.candidatePlayerId,
                    candidatePlayerName: suggestion.candidateDisplayName,
                    candidateBirthDate: suggestion.candidateBirthDate || null,
                    comment: options.aliasComment || null,
                  });
                  deliveredSuggestions.push(suggestion);
                } catch {
                  // Best effort: failed suggestions remain visible for a future retry.
                }
              }
              if (deliveredSuggestions.length) {
                rememberAliasPromptAnswers(
                  deliveredSuggestions,
                  'reported',
                  options.aliasAnswerSubjectKey || registrationAliasSubjectKey
                );
                mergeRequestMessage = ` ${t('player_area_merge_request_sent_after_signup')}`;
              } else {
                mergeRequestMessage = ` ${t('player_area_merge_request_deferred_after_signup')}`;
              }
            } else if (options?.aliasIgnoredSuggestions?.length) {
              rememberAliasPromptAnswers(
                options.aliasIgnoredSuggestions,
                'not_me',
                options.aliasAnswerSubjectKey || registrationAliasSubjectKey
              );
            }
            setPassword('');
            setFeedback({
              tone: 'success',
              message: t('player_area_signup_created_check_email').replace('{email}', signUpResult.email) + mergeRequestMessage,
            });
            setLiveRuntimeStatus('disabled');
            setLiveRuntimeError(null);
            closeRegisterAliasModal({ dismissAccountPrompt: false });
            return;
          }
          session = signUpResult.session;
        } else {
          session = await playerSignInWithPassword(safeEmail, safePassword);
        }

        setLiveAuthFlow('session');
        setLiveRuntimeArmed(true);
        syncUnifiedAuthFromPlayerSession(session);

        if (registerIdentity && registrationIdentity) {
          try {
            const row = await pushPlayerAppProfile({
              firstName: registrationIdentity.firstName,
              lastName: registrationIdentity.lastName,
              birthDate: registrationIdentity.birthDate,
              canonicalPlayerId: registrationIdentity.canonicalPlayerId,
              canonicalPlayerName: registrationIdentity.canonicalPlayerName,
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

        if (options?.aliasSuggestions?.length && registerIdentity && registrationIdentity) {
          const deliveredSuggestions: PlayerRegistrationAliasSuggestion[] = [];
          for (const suggestion of options.aliasSuggestions) {
            try {
              await submitPlayerAccountMergeRequest({
                accessToken: session?.accessToken || null,
                requesterUserId: session?.userId || signUpResult?.userId || null,
                requesterEmail: session?.email || safeEmail,
                requesterFirstName: registerIdentity.firstName,
                requesterLastName: registerIdentity.lastName,
                requesterBirthDate: registrationIdentity.birthDate,
                requesterCanonicalPlayerId: registrationIdentity.canonicalPlayerId,
                requesterCanonicalPlayerName: registrationIdentity.canonicalPlayerName,
                candidatePlayerId: suggestion.candidatePlayerId,
                candidatePlayerName: suggestion.candidateDisplayName,
                candidateBirthDate: suggestion.candidateBirthDate || null,
                comment: options.aliasComment || null,
              });
              deliveredSuggestions.push(suggestion);
            } catch {
              // Best effort: failed suggestions remain visible for a future retry.
            }
          }
          if (deliveredSuggestions.length) {
            rememberAliasPromptAnswers(
              deliveredSuggestions,
              'reported',
              options.aliasAnswerSubjectKey || registrationAliasSubjectKey
            );
            finalFeedback = {
              tone: 'success',
              message: t('player_area_merge_request_sent'),
            };
          } else {
            finalFeedback = {
              tone: 'success',
              message: t('player_area_merge_request_deferred'),
            };
          }
        } else if (options?.aliasIgnoredSuggestions?.length) {
          rememberAliasPromptAnswers(
            options.aliasIgnoredSuggestions,
            'not_me',
            options.aliasAnswerSubjectKey || registrationAliasSubjectKey
          );
        }

        await refreshLiveRuntime(session);
      } else {
        if (authMode === 'register') {
          const session = registerPlayerPreviewAccount(safeEmail, safePassword);
          savePlayerPreviewProfile(session, {
            firstName: registerIdentity!.firstName,
            lastName: registerIdentity!.lastName,
            birthDate: registerIdentity!.birthDate,
          });
          setFeedback({ tone: 'success', message: t('player_area_preview_registered') });
        } else {
          signInPlayerPreviewAccount(safeEmail, safePassword);
          setFeedback({ tone: 'success', message: t('player_area_preview_logged_in') });
        }
      }
      setPassword('');
      if (liveBackendEnabled) {
        setFeedback(finalFeedback);
        try {
          window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
        } catch {
          // Best effort: App listens to refresh the full workspace state for alias-linked stats.
        }
      }
      setRefreshNonce((value) => value + 1);
      setLiveCallRefreshNonce((value) => value + 1);
      closeRegisterAliasModal({ dismissAccountPrompt: false });
    } catch (error: any) {
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_auth_submit_failed'),
          t
        ),
      });
    } finally {
      if (options?.skipAliasPrompt) {
        setRegisterAliasSubmitting(false);
      }
    }
  };

  const submitAuth = async () => {
    await completeAuth();
  };

  const continueRegisterWithoutAliasRequest = () => {
    if (registerAliasPromptMode === 'account') {
      rememberAliasPromptAnswers(activeAliasPromptSuggestions, 'not_me', accountAliasSubjectKeys);
      setAccountAliasInterstitialDismissed(true);
      closeRegisterAliasModal({ dismissAccountPrompt: false });
      return;
    }
    setRegisterAliasSubmitting(true);
    void completeAuth({
      skipAliasPrompt: true,
      aliasIgnoredSuggestions: activeAliasPromptSuggestions,
      aliasAnswerSubjectKey: registrationAliasSubjectKey,
    });
  };

    const continueRegisterWithAliasRequest = () => {
      if (!selectedAliasSuggestions.length) {
        setFeedback({ tone: 'error', message: t('player_area_select_alias_first') });
        return;
      }
      if (registerAliasPromptMode === 'account') {
        const openDeferredProvisionalProfile = () => {
          setAccountAliasInterstitialDismissed(true);
          closeRegisterAliasModal({ dismissAccountPrompt: false });
          setLiveRuntimeError(null);
          setFeedback({
            tone: 'success',
            message: t('player_area_merge_request_deferred'),
          });
        };
        if (!effectiveProfile || !effectiveSession?.email) {
          openDeferredProvisionalProfile();
          return;
        }
        const normalizedAccountBirthDate = normalizeBirthDateInput(effectiveProfile.birthDate);
        if (!normalizedAccountBirthDate) {
          openDeferredProvisionalProfile();
          return;
        }
        setRegisterAliasSubmitting(true);
        setFeedback(null);
        void (async () => {
          const deliveredSuggestions: PlayerRegistrationAliasSuggestion[] = [];
          let accountSession: Awaited<ReturnType<typeof ensureFreshPlayerSupabaseSession>> | null = null;
          try {
            accountSession = await ensureFreshPlayerSupabaseSession();
          } catch {
            accountSession = null;
          }
          const accountAccessToken = String(accountSession?.accessToken || liveSession?.accessToken || '').trim() || null;
          const accountUserId = String(accountSession?.userId || liveSession?.userId || effectiveSession.accountId || '').trim() || null;
          const openProvisionalProfile = () => {
            setAccountAliasInterstitialDismissed(true);
            closeRegisterAliasModal({ dismissAccountPrompt: false });
          };
          const finalizeAccountAliasRequestSuccess = (resolvedSuggestions: PlayerRegistrationAliasSuggestion[]) => {
            rememberAliasPromptAnswers(resolvedSuggestions, 'reported', accountAliasSubjectKeys);
            const optimisticCreatedAt = new Date().toISOString();
            setLiveMergeRequests((current) => {
              const optimisticRows = resolvedSuggestions.map((suggestion) => ({
                id: `optimistic-${accountUserId || effectiveSession.email}-${suggestion.candidatePlayerId}`,
                workspace_id: String(state.workspace?.id || ''),
                requester_user_id: accountUserId,
                requester_email: effectiveSession.email,
                requester_first_name: effectiveProfile.firstName,
                requester_last_name: effectiveProfile.lastName,
                requester_birth_date: normalizedAccountBirthDate,
                requester_canonical_player_id: effectiveProfile.canonicalPlayerId || null,
                requester_canonical_player_name: effectiveProfile.canonicalPlayerName || null,
                candidate_player_id: suggestion.candidatePlayerId,
                candidate_player_name: suggestion.candidateDisplayName,
                candidate_birth_date: suggestion.candidateBirthDate || null,
              comment: registerAliasComment || null,
              status: 'pending' as const,
              created_at: optimisticCreatedAt,
              updated_at: optimisticCreatedAt,
              resolved_at: null,
              resolved_by_user_id: null,
            }));
            return [
              ...current,
              ...optimisticRows.filter(
                (row) =>
                  !current.some(
                    (existing) =>
                      String(existing.candidate_player_id || '').trim() === row.candidate_player_id
                      && String(existing.status || '').trim().toLowerCase() === 'pending'
                  )
              ),
            ];
          });
            setFeedback({
              tone: 'success',
              message: t('player_area_merge_request_sent'),
            });
            setLiveRuntimeError(null);
            openProvisionalProfile();
            try {
              window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
            } catch {
              // Best effort: refresh other player-area derived state after an alias request.
            }
          void refreshLiveRuntime(undefined, { silent: true }).catch(() => {
            // Best effort: optimistic pending state already unlocks the provisional profile.
          });
          };
          const verifyPendingAliasSuggestions = async () => {
            try {
              const rows = await pullPlayerOwnAccountMergeRequests({
                accessToken: accountAccessToken,
                workspaceId: String(state.workspace?.id || ''),
                status: 'pending',
              });
              if (rows.length) {
                setLiveMergeRequests(rows);
            }
            const pendingIds = new Set(
              rows
                .filter((row) => String(row.status || '').trim().toLowerCase() === 'pending')
                .map((row) => String(row.candidate_player_id || '').trim())
                .filter(Boolean)
            );
            return selectedAliasSuggestions.filter((suggestion) => pendingIds.has(suggestion.candidatePlayerId));
          } catch {
            return [];
          }
        };
          try {
            for (const suggestion of selectedAliasSuggestions) {
              try {
                await submitPlayerAccountMergeRequest({
                  accessToken: accountAccessToken,
                  requesterUserId: accountUserId,
                  requesterEmail: effectiveSession.email,
                  requesterFirstName: effectiveProfile.firstName,
                  requesterLastName: effectiveProfile.lastName,
                  requesterBirthDate: normalizedAccountBirthDate,
                  requesterCanonicalPlayerId: effectiveProfile.canonicalPlayerId || null,
                  requesterCanonicalPlayerName: effectiveProfile.canonicalPlayerName || null,
                  candidatePlayerId: suggestion.candidatePlayerId,
                  candidatePlayerName: suggestion.candidateDisplayName,
                  candidateBirthDate: suggestion.candidateBirthDate || null,
                comment: registerAliasComment || null,
              });
              deliveredSuggestions.push(suggestion);
            } catch {
              // Best effort: failed suggestions remain visible for a future retry.
            }
          }
          if (deliveredSuggestions.length) {
            finalizeAccountAliasRequestSuccess(deliveredSuggestions);
          } else {
            const verifiedSuggestions = await verifyPendingAliasSuggestions();
              if (verifiedSuggestions.length) {
                finalizeAccountAliasRequestSuccess(verifiedSuggestions);
              } else {
                openProvisionalProfile();
                setFeedback({
                  tone: 'success',
                  message: t('player_area_merge_request_deferred'),
                });
              }
          }
        } catch (error: any) {
          const verifiedSuggestions = deliveredSuggestions.length
            ? deliveredSuggestions
            : await verifyPendingAliasSuggestions();
            if (verifiedSuggestions.length) {
              finalizeAccountAliasRequestSuccess(verifiedSuggestions);
              return;
            }
            openDeferredProvisionalProfile();
          } finally {
            setRegisterAliasSubmitting(false);
          }
        })();
        return;
    }
    setRegisterAliasSubmitting(true);
    void completeAuth({
      skipAliasPrompt: true,
      aliasSuggestions: selectedAliasSuggestions,
      aliasComment: registerAliasComment,
      aliasAnswerSubjectKey: registrationAliasSubjectKey,
    });
  };

  const requestPasswordReset = async () => {
    const safeEmail = email.trim();
    if (!safeEmail) {
      setFeedback({ tone: 'error', message: t('player_area_reset_email_required') });
      return;
    }
    if (!liveBackendEnabled) {
      setFeedback({ tone: 'error', message: t('player_area_password_reset_pending') });
      return;
    }
    try {
      const resetRedirect = `${window.location.origin}${window.location.pathname}?player_recovery=1`;
      await playerRequestPasswordReset(safeEmail, resetRedirect);
      setFeedback({ tone: 'success', message: t('player_area_password_reset_sent') });
    } catch (error: any) {
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_recovery_send_failed'),
          t
        ),
      });
    }
  };

  const submitRecoveryPassword = async () => {
    const safePassword = recoveryPassword.trim();
    const safeConfirm = recoveryPasswordConfirm.trim();
    if (!safePassword) {
      setFeedback({ tone: 'error', message: t('player_area_recovery_password_required') });
      return;
    }
    if (safePassword !== safeConfirm) {
      setFeedback({ tone: 'error', message: t('player_area_recovery_password_mismatch') });
      return;
    }
    try {
      const session = await playerUpdatePassword(safePassword);
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      setLiveAuthFlow('session');
      setLiveRuntimeArmed(true);
      syncUnifiedAuthFromPlayerSession(session);
      await refreshLiveRuntime(session);
      setFeedback({ tone: 'success', message: t('player_area_recovery_password_success') });
    } catch (error: any) {
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_password_update_failed'),
          t
        ),
      });
    }
  };

  const submitProfile = async () => {
    if (!effectiveSession) return;
    const safeFirstName = firstName.trim();
    const safeLastName = lastName.trim();
    const safeBirthDate = birthDate.trim();
    if (!safeFirstName || !safeLastName || !safeBirthDate) {
      setFeedback({ tone: 'error', message: t('player_area_profile_fields_required') });
      return;
    }
    const normalizedBirthDate = normalizeBirthDateInput(safeBirthDate);
    if (!normalizedBirthDate) {
      setFeedback({ tone: 'error', message: t('player_area_invalid_birthdate_error') });
      return;
    }
    try {
      if (effectiveSession.mode === 'live') {
        const identity = buildPlayerCanonicalIdentity(
          safeFirstName,
          safeLastName,
          normalizedBirthDate,
          liveProfileRow?.canonical_player_id || null
        );
        const row = await pushPlayerAppProfile({
          firstName: identity.firstName,
          lastName: identity.lastName,
          birthDate: identity.birthDate,
          canonicalPlayerId: identity.canonicalPlayerId,
          canonicalPlayerName: identity.canonicalPlayerName,
        });
        setLiveProfileRow(row);
        setLiveDerivedRefreshNonce((value) => value + 1);
        setLiveCallRefreshNonce((value) => value + 1);
      } else {
        savePlayerPreviewProfile(snapshot.session!, { firstName: safeFirstName, lastName: safeLastName, birthDate: safeBirthDate });
      }
      setFeedback({ tone: 'success', message: t('player_area_profile_saved') });
      try {
        window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
      } catch {
        // Best effort: keep profile-derived historical stats aligned after live profile edits.
      }
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_profile_save_failed'),
          t
        ),
      });
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
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_ack_call_failed'),
          t
        ),
      });
    }
  };

  const clearCall = () => {
    if (!snapshot.session || !effectiveLiveStatus.activeCall?.previewOnly) return;
    try {
      clearPlayerPreviewCall(snapshot.session, effectiveLiveStatus.activeCall.id);
      setFeedback({ tone: 'success', message: t('player_area_call_cancel_done') });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({
        tone: 'error',
        message: getPlayerAreaFriendlyErrorMessage(
          error,
          t('player_area_cancel_call_failed'),
          t
        ),
      });
    }
  };

  const signOut = async () => {
    if (effectiveSession?.mode === 'live') {
      const disablePushTask = disableNativePushRegistration(readNativePushRegistration() || nativePushRegistration).catch(() => {
        // Best effort: the local logout must still complete even if the network is unavailable.
      });
      const playerSignOutTask = playerSignOutSupabase().catch(() => {
        // best effort only
      });
      const adminSignOutTask = signOutSupabase().catch(() => {
        // best effort only
      });
      clearPlayerSupabaseSession();
      clearSupabaseSession();
      clearPlayerPresenceSnapshot();
      liveRuntimeRequestRef.current += 1;
      setLiveRuntimeArmed(false);
      syncUnifiedAuthFromPlayerSession(null);
      setLiveProfileRow(null);
      setLiveMergeRequests([]);
      setLiveCalls([]);
      setLiveRuntimeStatus('disabled');
      setLiveRuntimeError(null);
      setLiveCallRefreshNonce((value) => value + 1);
      setLiveAuthFlow('session');
      nativePushSyncKeyRef.current = '';
      nativePushPermissionRequestedRef.current = false;
      window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
      await Promise.allSettled([disablePushTask, playerSignOutTask, adminSignOutTask]);
      window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
      return;
    }
    clearPlayerPresenceSnapshot();
    signOutPlayerPreviewSession();
    try {
      sessionStorage.removeItem(ADMIN_LEGACY_AUTH_LS_KEY);
    } catch {
      // ignore
    }
    clearSupabaseSession();
    window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
    setRefreshNonce((value) => value + 1);
  };

  // Native push permission is intentionally handled by the inline card below.
  // Keeping a second fullscreen portal here can leave a stale scrim visible
  // inside Android WebView after login/resume, so we keep this path disabled.
  const nativePushPromptModal = null;

  const registerAliasRequestModal =
    registerAliasModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="flbp-mobile-sheet fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 py-6">
            <div className="flbp-mobile-sheet-panel w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/15 md:p-6">
              <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="text-xl font-black tracking-tight text-slate-950">{t('player_register_alias_title')}</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {t('player_register_alias_desc')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeRegisterAliasModal}
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50"
                  disabled={registerAliasSubmitting}
                >
                  {t('close')}
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {activeAliasPromptSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => toggleAliasSuggestionSelection(suggestion.id)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      registerAliasSelectionIds.includes(suggestion.id)
                        ? 'border-rose-300 bg-rose-50 shadow-sm shadow-rose-100'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                      <div className="min-w-0">
                        <div className="text-base font-black text-slate-950">{suggestion.candidateDisplayName}</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {suggestion.candidateBirthDateLabel !== 'ND' ? suggestion.candidateBirthDateLabel : t('player_register_alias_birthdate_missing')}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                            suggestion.confidence === 'high'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}>
                            {suggestion.confidence === 'high' ? t('data_accounts_alias_confidence_high') : t('data_accounts_alias_confidence_medium')}
                          </div>
                          {suggestion.reasons.map((reason) => (
                            <div key={reason} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                              {registrationAliasReasonLabel(reason, t)}
                            </div>
                          ))}
                          {registerAliasSelectionIds.includes(suggestion.id) ? (
                            <div className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-black text-rose-700">
                              {t('selected')}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid w-full grid-cols-3 gap-1 text-left text-[11px] font-black text-slate-600 sm:w-auto sm:grid-cols-1 sm:text-right">
                        <div>{t('titles')}: <span className="text-slate-950">{suggestion.candidateTotalTitles}</span></div>
                        <div>{t('canestri')}: <span className="text-slate-950">{suggestion.candidateTotalCanestri}</span></div>
                        <div>{t('soffi')}: <span className="text-slate-950">{suggestion.candidateTotalSoffi}</span></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_register_alias_comment_label')}</div>
                <textarea
                  value={registerAliasComment}
                  onChange={(event) => setRegisterAliasComment(event.target.value)}
                  rows={4}
                  className={`${inputClass} min-h-[112px] resize-y`}
                  placeholder={t('player_register_alias_comment_placeholder')}
                  disabled={registerAliasSubmitting}
                />
              </div>

              <div className="flbp-mobile-actions mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={continueRegisterWithAliasRequest}
                  disabled={registerAliasSubmitting || !selectedAliasSuggestions.length}
                  className={btnPrimary}
                >
                  <BadgeCheck className="h-4 w-4" /> {t('player_register_alias_submit')}
                </button>
                <button
                  type="button"
                  onClick={continueRegisterWithoutAliasRequest}
                  disabled={registerAliasSubmitting}
                  className={btnSecondary}
                >
                  <ChevronRight className="h-4 w-4" /> {t('player_register_alias_skip')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const showAccountAliasInterstitial = (
    !!effectiveProfile
    && !!liveRuntimeSession
    && liveAuthFlow !== 'recovery'
    && liveAccountAliasLoaded
    && !hasPendingAccountMergeRequest
    && pendingAccountAliasSuggestions.length > 0
    && !accountAliasInterstitialDismissed
  );

  return (
    <>
    {nativePushPromptModal}
    {registerAliasRequestModal}
    <div className="p-4 md:p-6 space-y-5 [overflow-anchor:none]">
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

          </div>
        </div>

        <div className="px-5 py-5 md:px-6">
          <div className="space-y-5">
            {feedback && effectiveSession && liveAuthFlow !== 'recovery' ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                {feedback.message}
              </div>
            ) : null}

            {bootstrapError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {t('player_area_safe_mode_restored')} {bootstrapError}
              </div>
            ) : null}

            {showBootstrapNotice ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                {t('player_area_bootstrap_notice')}
              </div>
            ) : null}

            {liveRuntimeError && effectiveSession?.mode === 'live' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {liveRuntimeError}
              </div>
            ) : null}

            {liveDerivedError && effectiveSession?.mode === 'live' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {t('player_area_safe_mode_restored')} {liveDerivedError}
              </div>
            ) : null}

            {!effectiveSession ? (
              <div className="mx-auto max-w-xl [overflow-anchor:none]">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 md:p-6">
                  <div className="text-center">
                    <div className="text-2xl font-black tracking-tight text-slate-950">{t('player_area_login_title')}</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {loginEntryNote}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <button
                      type="button"
                      onClick={() => submitSocialAuth('facebook')}
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-[#1877F2] bg-[#1877F2] px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_-22px_rgba(24,119,242,0.6)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2] focus-visible:ring-offset-2"
                    >
                      <Facebook className="h-4 w-4" /> {t('player_sign_in_facebook')}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitSocialAuth('google')}
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-black text-slate-700 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.18)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-700">G</span>
                      {t('player_sign_in_google')}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitSocialAuth('apple')}
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-black text-white">A</span>
                      {t('player_sign_in_apple')}
                    </button>

                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{t('or_label')}</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setEmailPanelOpen((value) => !value)}
                      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-teal-500 bg-teal-500 px-4 py-3.5 text-sm font-black text-white shadow-[0_14px_30px_-22px_rgba(20,184,166,0.55)] hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 md:hidden"
                    >
                      <Mail className="h-4 w-4" />
                      {t('player_sign_in_email')}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    {socialPendingNote}
                  </div>

                  <form
                    autoComplete="on"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className={`mt-5 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 md:block md:p-5 space-y-4 [overflow-anchor:none] ${emailPanelOpen ? 'block' : 'hidden'}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitAuth();
                    }}
                  >
                      {feedback ? (
                        <div
                          ref={authFeedbackRef}
                          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
                          role="alert"
                          aria-live="polite"
                        >
                          {feedback.message}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { closeRegisterAliasModal(); setAuthMode('login'); }} className={authMode === 'login' ? btnPrimary : btnSecondary}>
                          <LogIn className="h-4 w-4" /> {t('player_area_sign_in')}
                        </button>
                        <button type="button" onClick={() => { setFeedback(null); setAuthMode('register'); }} className={authMode === 'register' ? btnPrimary : btnSecondary}>
                          <UserPlus className="h-4 w-4" /> {t('player_area_register')}
                        </button>
                      </div>

                      <div className="text-xs font-semibold leading-5 text-slate-500">
                        {t('player_area_email_recovery_hint')}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_email')}</div>
                          <input
                            type="email"
                            name="player-email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className={inputClass}
                            placeholder={t('player_area_email_placeholder')}
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_password')}</div>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              name="player-password"
                              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                              data-lpignore="true"
                              data-1p-ignore="true"
                              value={password}
                              onChange={(event) => setPassword(event.target.value)}
                              className={`${inputClass} pr-12`}
                              placeholder={t('player_area_password_placeholder')}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((value) => !value)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                              aria-label={showPassword ? t('player_area_hide_password') : t('player_area_show_password')}
                              title={showPassword ? t('player_area_hide_password') : t('player_area_show_password')}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        {authMode === 'register' ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('name_label')}</div>
                                <input
                                  name="player-first-name"
                                  autoComplete="given-name"
                                  value={firstName}
                                  onChange={(event) => setFirstName(event.target.value)}
                                  className={inputClass}
                                  placeholder={t('player_area_first_name_placeholder')}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_last_name')}</div>
                                <input
                                  name="player-last-name"
                                  autoComplete="family-name"
                                  value={lastName}
                                  onChange={(event) => setLastName(event.target.value)}
                                  className={inputClass}
                                  placeholder={t('player_area_last_name_placeholder')}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date')}</div>
                              <BirthDateInput
                                value={birthDate}
                                onChange={setBirthDate}
                                className={inputClass}
                                placeholder="gg/mm/aaaa"
                                ariaLabel={t('birth_date')}
                                calendarTitle={t('player_area_open_calendar')}
                              />
                              <div className="mt-2 text-xs font-semibold text-slate-500">{t('player_area_birth_date_hint')}</div>
                            </div>
                            {pendingRegistrationAliasSuggestions.length ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                                {(pendingRegistrationAliasSuggestions.length === 1
                                  ? t('player_area_alias_suggestion_found_one')
                                  : t('player_area_alias_suggestions_found_many').replace('{count}', String(pendingRegistrationAliasSuggestions.length)))}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>

                      <button type="submit" className={`${btnPrimary} w-full`}>
                        {authMode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                        {authMode === 'login' ? t('player_area_sign_in') : t('player_area_register')}
                      </button>

                      <button type="button" onClick={() => void requestPasswordReset()} className={`${btnSecondary} w-full`}>
                        <Mail className="h-4 w-4" /> {t('player_area_forgot_password')}
                      </button>
                    </form>
                </div>
              </div>
            ) : liveAuthFlow === 'recovery' ? (
              <div className="mx-auto max-w-xl [overflow-anchor:none]">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 md:p-6 space-y-5">
                  <div className="text-center">
                    <div className="text-2xl font-black tracking-tight text-slate-950">{t('player_area_recovery_title')}</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {t('player_area_recovery_desc')}
                    </div>
                  </div>

                  {feedback ? (
                    <div
                      ref={authFeedbackRef}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
                      role="alert"
                      aria-live="polite"
                    >
                      {feedback.message}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_recovery_new_password')}</div>
                      <div className="relative">
                        <input
                          type={showRecoveryPassword ? 'text' : 'password'}
                          name="player-recovery-password"
                          autoComplete="new-password"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          value={recoveryPassword}
                          onChange={(event) => setRecoveryPassword(event.target.value)}
                          className={`${inputClass} pr-12`}
                          placeholder={t('player_area_recovery_new_password_placeholder')}
                        />
                        <button
                          type="button"
                          onClick={() => setShowRecoveryPassword((value) => !value)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                          aria-label={showRecoveryPassword ? t('player_area_hide_password') : t('player_area_show_password')}
                          title={showRecoveryPassword ? t('player_area_hide_password') : t('player_area_show_password')}
                        >
                          {showRecoveryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_recovery_confirm_password')}</div>
                      <input
                        type={showRecoveryPassword ? 'text' : 'password'}
                        name="player-recovery-password-confirm"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        value={recoveryPasswordConfirm}
                        onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                        className={inputClass}
                        placeholder={t('player_area_recovery_confirm_password_placeholder')}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => void submitRecoveryPassword()} className={btnPrimary}>
                      <BadgeCheck className="h-4 w-4" /> {t('player_area_recovery_apply_password')}
                    </button>
                    <button type="button" onClick={() => { if (window.confirm(t('logout_confirm') || 'Sei sicuro di voler uscire?')) { void signOut(); } }} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-100 hover:text-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50">
                      <LogOut className="h-4 w-4" /> {t('player_area_sign_out')}
                    </button>
                  </div>
                </div>
              </div>
            ) : liveProfileHydrating ? (
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 md:p-5 space-y-4">
                <div>
                  <div className={sectionTitleClass}>{t('player_area_loading_profile_title')}</div>
                  <div className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                    {t('player_area_loading_profile_desc')}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="h-14 rounded-2xl border border-slate-200 bg-white/80" />
                  <div className="h-14 rounded-2xl border border-slate-200 bg-white/80" />
                </div>
                <div className="h-14 rounded-2xl border border-slate-200 bg-white/80" />
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
                    <input
                      name="player-profile-first-name"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className={inputClass}
                      placeholder={t('player_area_first_name_placeholder')}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_last_name')}</div>
                    <input
                      name="player-profile-last-name"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      className={inputClass}
                      placeholder={t('player_area_last_name_placeholder')}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date')}</div>
                  <BirthDateInput
                    value={birthDate}
                    onChange={setBirthDate}
                    className={inputClass}
                    placeholder="gg/mm/aaaa"
                    ariaLabel={t('birth_date')}
                    calendarTitle={t('player_area_open_calendar')}
                  />
                  <div className="mt-2 text-xs font-semibold text-slate-500">{t('player_area_birth_date_hint')}</div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={submitProfile} className={btnPrimary}>
                    <BadgeCheck className="h-4 w-4" /> {t('player_area_save_profile')}
                  </button>
                  <button type="button" onClick={() => { if (window.confirm(t('logout_confirm') || 'Sei sicuro di voler uscire?')) { void signOut(); } }} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-100 hover:text-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50">
                    <LogOut className="h-4 w-4" /> {t('player_area_sign_out')}
                  </button>
                </div>
              </div>
            ) : showAccountAliasInterstitial ? (
              <div className="mx-auto max-w-4xl">
                <div className="rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100/70 p-5 shadow-sm shadow-amber-100/70 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-800">
                        <ShieldCheck className="h-4 w-4" />
                        {t('player_register_alias_title')}
                      </div>
                      <div className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                        {pendingAccountAliasSuggestions.length === 1
                          ? t('player_area_alias_suggestion_found_one')
                          : t('player_area_alias_suggestions_found_many').replace('{count}', String(pendingAccountAliasSuggestions.length))}
                      </div>
                      <div className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-700">
                        {t('player_register_alias_desc')}
                      </div>
                    </div>
                    <button type="button" onClick={() => { if (window.confirm(t('logout_confirm') || 'Sei sicuro di voler uscire?')) { void signOut(); } }} className="inline-flex items-center gap-2 rounded-xl bg-red-50/80 backdrop-blur-md px-3 py-2 text-sm font-black text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-100 hover:text-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50">
                      <LogOut className="h-4 w-4" /> {t('player_area_sign_out')}
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {pendingAccountAliasSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-[22px] border border-amber-200/80 bg-white/90 px-4 py-4 shadow-sm">
                        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                          <div className="min-w-0">
                            <div className="text-base font-black text-slate-950">{suggestion.candidateDisplayName}</div>
                            <div className="mt-1 text-xs font-bold text-slate-500">
                              {suggestion.candidateBirthDateLabel !== 'ND' ? suggestion.candidateBirthDateLabel : t('player_register_alias_birthdate_missing')}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                suggestion.confidence === 'high'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}>
                                {suggestion.confidence === 'high' ? t('data_accounts_alias_confidence_high') : t('data_accounts_alias_confidence_medium')}
                              </div>
                              {suggestion.reasons.map((reason) => (
                                <div key={reason} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                                  {registrationAliasReasonLabel(reason, t)}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="grid w-full grid-cols-3 gap-1 text-left text-[11px] font-black text-slate-600 sm:w-auto sm:grid-cols-1 sm:text-right">
                            <div>{t('titles')}: <span className="text-slate-950">{suggestion.candidateTotalTitles}</span></div>
                            <div>{t('canestri')}: <span className="text-slate-950">{suggestion.candidateTotalCanestri}</span></div>
                            <div>{t('soffi')}: <span className="text-slate-950">{suggestion.candidateTotalSoffi}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openAccountAliasPrompt}
                      className={btnPrimary}
                    >
                      <BadgeCheck className="h-4 w-4" /> {t('player_register_alias_submit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountAliasInterstitialDismissed(true)}
                      className={btnSecondary}
                    >
                      <ChevronRight className="h-4 w-4" /> {t('player_register_alias_skip')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {pendingAccountAliasSuggestions.length && !accountAliasInterstitialDismissed && !hasPendingAccountMergeRequest ? (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50/90 px-4 py-4 shadow-sm shadow-amber-100/60 md:px-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-amber-800">
                          <ShieldCheck className="h-4 w-4" />
                          {t('player_register_alias_title')}
                        </div>
                        <div className="mt-2 text-sm font-semibold leading-6 text-amber-900">
                          {pendingAccountAliasSuggestions.length === 1
                            ? t('player_area_alias_suggestion_found_one')
                            : t('player_area_alias_suggestions_found_many').replace('{count}', String(pendingAccountAliasSuggestions.length))}
                        </div>
                        <div className="mt-1 text-sm font-semibold leading-6 text-amber-800/90">
                          {t('player_register_alias_desc')}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={openAccountAliasPrompt}
                          className={btnPrimary}
                        >
                          <BadgeCheck className="h-4 w-4" /> {t('player_register_alias_submit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => closeRegisterAliasModal()}
                          className={btnSecondary}
                        >
                          <ChevronRight className="h-4 w-4" /> {t('player_register_alias_skip')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white/90 p-5 md:p-6 shadow-sm shadow-blue-100/50 ring-1 ring-inset ring-white">
                  <div className="absolute -right-4 -top-8 h-40 w-40 rounded-full bg-sky-200/40 blur-3xl" />
                  <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-2xl font-black text-blue-950 tracking-tight">{effectiveProfile.canonicalPlayerName}</div>
                        {hasPendingAccountMergeRequest ? (
                          <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-800">
                            {t('data_accounts_merge_status_pending')}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-0.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200/60 backdrop-blur-md">
                        {effectiveSession.mode === 'live'
                          ? `${formatBirthDateDisplay(effectiveProfile.birthDate)}`
                          : getPlayerPreviewIdentityLabel(snapshot.profile)}
                      </div>
                    </div>
                    <button type="button" onClick={() => { if (window.confirm(t('logout_confirm') || 'Sei sicuro di voler uscire?')) { void signOut(); } }} className="inline-flex items-center gap-2 rounded-xl bg-red-50/80 backdrop-blur-md px-3 py-2 text-sm font-black text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-100 hover:text-red-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50">
                      <LogOut className="h-4 w-4" /> {t('player_area_sign_out')}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  <MetricCard label={t('titles')} value={effectivePersonalProfile?.totalTitles ?? 0} />
                  <MetricCard label={t('scores_label')} value={effectivePersonalProfile?.totalCanestri ?? 0} />
                  <MetricCard label={t('soffi_label')} value={effectivePersonalProfile?.totalSoffi ?? 0} />
                  <MetricCard label={t('player_area_avg_scores')} value={oneDecimalFormatter.format(personalPerformanceSummary?.avgPoints ?? 0)} />
                  <MetricCard label={t('player_area_avg_soffi')} value={oneDecimalFormatter.format(personalPerformanceSummary?.avgSoffi ?? 0)} />
                  <MetricCard
                    label={t('player_area_win_rate')}
                    value={personalPerformanceSummary?.winRate != null ? `${oneDecimalFormatter.format(personalPerformanceSummary.winRate)}%` : t('not_available_short')}
                    hint={personalPerformanceSummary ? `${personalPerformanceSummary.wins}${t('standings_wins_short')} · ${personalPerformanceSummary.losses}${t('standings_losses_short')}` : null}
                  />
                  <MetricCard label={t('active_aliases')} value={effectivePersonalProfile?.aliasCount ?? 0} />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                  <div className="flex flex-col gap-4">
                    <div className="rounded-[26px] border border-white/60 bg-white/70 backdrop-blur-xl shadow-sm ring-1 ring-inset ring-slate-100 p-4 md:p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        <div className={sectionTitleClass}>{t('player_area_results_title')}</div>
                      </div>

                      {effectivePersonalProfile && effectivePersonalProfile.titles.length ? (
                        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                          {effectivePersonalProfile.titles.map((row) => {
                            const titleVisual = getTitleVisual(row.type, t);
                            const subtitle = formatMetaLine(row.year, cleanTeamLabel(row.teamName));
                            const tournamentName = cleanTournamentName(row.tournamentName || row.sourceTournamentName) || t('player_area_unknown_tournament');
                            return (
                              <div key={row.id} className="group relative overflow-hidden rounded-[20px] border border-slate-100 bg-gradient-to-r from-amber-50/50 to-white/50 px-4 py-3 shadow-sm hover:shadow-md hover:border-amber-100 transition-all">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-black text-slate-900 group-hover:text-amber-900 transition-colors">{tournamentName}</div>
                                    {subtitle ? (
                                      <div className="mt-1 text-xs font-bold text-slate-500">{subtitle}</div>
                                    ) : null}
                                  </div>
                                  <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black shadow-sm ring-1 ring-inset ${titleVisual.chipClass}`}>
                                    <titleVisual.Icon className={`h-3.5 w-3.5 ${titleVisual.iconClass}`} />
                                    <span>{titleVisual.label}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-bold text-slate-500 text-center">
                          {t('player_area_no_results')}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[26px] border border-white/60 bg-white/70 backdrop-blur-xl shadow-sm ring-1 ring-inset ring-slate-100 p-4 md:p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <BadgeCheck className="h-5 w-5 text-sky-500" />
                        <div className={sectionTitleClass}>{t('player_area_tournaments_played')}</div>
                      </div>

                      {participations.length > 0 ? (
                        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                          {participations.map((row) => {
                            const subtitle = formatMetaLine(row.year, row.team);
                            const body = (
                              <>
                                <div className="min-w-0">
                                  <div className="text-sm font-black text-slate-900 group-hover:text-sky-900 transition-colors">{row.name}</div>
                                  {subtitle ? (
                                    <div className="mt-1 text-xs font-bold text-slate-500">{subtitle}</div>
                                  ) : null}
                                </div>
                                {onOpenTournament ? (
                                  <div className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-sky-700">
                                    <span>{t('player_area_open_tournament')}</span>
                                    <ChevronRight className="h-4 w-4" />
                                  </div>
                                ) : null}
                              </>
                            );

                            return onOpenTournament ? (
                              <button
                                key={row.id}
                                type="button"
                                onClick={() => onOpenTournament(row.id)}
                                className="group flex w-full items-start justify-between gap-3 overflow-hidden rounded-[20px] border border-slate-100 bg-white/80 px-4 py-3 text-left shadow-sm transition-all hover:border-sky-100 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
                              >
                                {body}
                              </button>
                            ) : (
                              <div key={row.id} className="group flex items-start justify-between gap-3 overflow-hidden rounded-[20px] border border-slate-100 bg-white/80 px-4 py-3 shadow-sm transition-all hover:border-sky-100 hover:shadow-md">
                                {body}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-bold text-slate-500 text-center">
                          {t('player_area_no_tournaments')}
                        </div>
                      )}
                    </div>
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

                      {/* Show call only after push permission has been handled */}
                      {(canManuallyOpenNativePushPrompt || nativePushPermissionPromptOpen) && embeddedNativeShell ? null : effectiveLiveStatus.activeCall ? (
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
                      {embeddedNativeShell && (nativePushRegistration || nativePushPermissionPromptOpen) ? (
                        canManuallyOpenNativePushPrompt || nativePushPermissionPromptOpen ? (
                          // Prominent inline push-permission card — shown BEFORE the call notification
                          <div className="rounded-[20px] border-2 border-amber-400 bg-amber-50 p-4 space-y-3 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-700">
                                <BellRing className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.08em] text-amber-700">{t('player_native_push_prompt_title')}</div>
                                <div className="text-sm font-semibold text-amber-900">{t('player_native_push_prompt_body')}</div>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={confirmNativePushPermission}
                                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 shadow-sm transition hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                              >
                                <BellRing className="h-4 w-4" /> {t('player_native_push_prompt_enable')}
                              </button>
                              <button
                                type="button"
                                onClick={dismissNativePushPermission}
                                className={`${btnSecondary}`}
                              >
                                {t('player_native_push_prompt_later')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm font-semibold text-amber-900">
                            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-amber-700">{t('player_native_push_status_title')}</div>
                            <div className="mt-1">{nativePushStatusMessage}</div>
                          </div>
                        )
                      ) : null}
                    </div>

                    {onOpenFantabeerpong && (
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 md:p-5 space-y-4 transition-all hover:border-beer-300 hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <Trophy className="h-5 w-5 text-beer-500" />
                          <div className={sectionTitleClass}>{t('fanta_shell_title')}</div>
                        </div>
                        <div className="text-sm font-semibold text-slate-600">
                          {t('fanta_shell_subtitle')}
                        </div>
                        <button
                          type="button"
                          onClick={onOpenFantabeerpong}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-beer-600 bg-beer-600 px-4 py-2 text-sm font-black text-white hover:bg-beer-700 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                        >
                          <Trophy className="h-4 w-4" />
                          {t('fanta_shell_active_section')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>


        </div>
      </div>
    </div>
    </>
  );
};
