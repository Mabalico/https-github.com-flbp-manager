import type { Match, PlayerProfileSnapshot, Team } from '../types';
import type { AppState } from './storageService';
import { buildPlayerProfileSnapshot } from './playerDataProvenance';
import { getMatchParticipantIds } from './matchUtils';
import { getPlayerKey, normalizeBirthDateInput, pickPlayerIdentityValue, resolvePlayerKey } from './playerIdentity';
import type { AdminPlayerAccountCatalogRow, PlayerSupabaseCallRow, PlayerSupabaseSession } from './supabaseRest';
import { getPlayerSupabaseSession, getSupabaseConfig } from './supabaseRest';
import { isLocalOnlyMode } from './repository/featureFlags';

const PREVIEW_ACCOUNTS_KEY = 'flbp_player_preview_accounts_v1';
const PREVIEW_SESSION_KEY = 'flbp_player_preview_session_v1';
const PREVIEW_PROFILES_KEY = 'flbp_player_preview_profiles_v1';
const PREVIEW_CALLS_KEY = 'flbp_player_preview_calls_v1';
const PLAYER_PRESENCE_KEY = 'flbp_player_presence_v1';
export const PLAYER_APP_CHANGE_EVENT = 'flbp-player-preview-change';

export type PlayerAuthProvider =
  | 'preview_password'
  | 'google'
  | 'facebook'
  | 'apple';

export type PlayerAccountAdminOrigin =
  | 'in_app'
  | 'google'
  | 'facebook'
  | 'apple'
  | 'other';

export type PlayerCallStatus = 'ringing' | 'acknowledged' | 'cancelled';

export interface PlayerPreviewAccount {
  id: string;
  username: string;
  password: string;
  createdAt: number;
  lastLoginAt?: number;
}

export interface PlayerAccountAdminRow {
  id: string;
  email: string;
  provider: PlayerAuthProvider | 'other';
  origin: PlayerAccountAdminOrigin;
  providerOrigins: PlayerAccountAdminOrigin[];
  mode: 'preview' | 'live';
  providers: string[];
  createdAt: number;
  lastLoginAt?: number;
  linkedPlayerName?: string | null;
  birthDate?: string | null;
  canonicalPlayerId?: string | null;
  totalTitles: number;
  totalCanestri: number;
  totalSoffi: number;
  hasProfile: boolean;
  hasPasswordRecovery: boolean;
  isAdmin: boolean;
}

export interface PlayerPreviewSession {
  accountId: string;
  username: string;
  provider: PlayerAuthProvider;
  mode: 'preview';
  createdAt: number;
  lastActiveAt: number;
}

export interface PlayerPreviewProfile {
  accountId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  canonicalPlayerId: string;
  canonicalPlayerName: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerRuntimeProfile {
  accountId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  canonicalPlayerId: string;
  canonicalPlayerName: string;
}

export interface PlayerRuntimeSession {
  accountId: string;
  username: string;
  provider: PlayerAuthProvider | 'other';
  mode: 'preview' | 'live';
  createdAt: number;
  lastActiveAt: number;
}

export interface PlayerCallRequest {
  id: string;
  tournamentId: string;
  matchId?: string;
  teamId: string;
  teamName: string;
  targetAccountId: string;
  targetPlayerId: string;
  targetPlayerName: string;
  requestedAt: number;
  acknowledgedAt?: number;
  cancelledAt?: number;
  status: PlayerCallStatus;
  previewOnly: boolean;
}

export interface PlayerPresenceSnapshot {
  accountId: string;
  mode: 'preview' | 'live';
  email: string;
  firstName: string;
  displayName: string;
  lastActiveAt: number;
}

export interface PlayerFeatureStatus {
  previewEnabled: boolean;
  supabaseConfigured: boolean;
  supabaseSessionPresent: boolean;
  remoteAuthPrepared: boolean;
  socialAuthPrepared: Array<'google' | 'facebook' | 'apple'>;
  playerProfilesPrepared: boolean;
  playerCallsPrepared: boolean;
  refereeBypassPrepared: boolean;
}

export interface PlayerLiveStatus {
  liveTournamentId: string | null;
  liveTournamentName: string | null;
  linkedTeam: Team | null;
  nextMatch: Match | null;
  nextMatchTurn: number | null;
  turnsUntilPlay: number | null;
  refereeBypassEligible: boolean;
  activeCall: PlayerCallRequest | null;
}

export interface PlayerAreaSnapshot {
  session: PlayerPreviewSession | null;
  profile: PlayerPreviewProfile | null;
  personalProfile: PlayerProfileSnapshot | null;
  liveStatus: PlayerLiveStatus;
  featureStatus: PlayerFeatureStatus;
}

export interface PlayerAreaBootstrapSnapshot {
  session: PlayerPreviewSession | null;
  profile: PlayerPreviewProfile | null;
  featureStatus: PlayerFeatureStatus;
}

type PreviewProfilesMap = Record<string, PlayerPreviewProfile>;

const nowTs = () => Date.now();

const PREVIEW_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizePlayerPreviewEmail = (raw: string) => String(raw || '').trim().toLowerCase();

const toDisplayFirstName = (raw: string, email?: string | null) => {
  const safeRaw = String(raw || '').trim();
  if (safeRaw) return safeRaw.split(/\s+/)[0] || safeRaw;
  const localPart = String(email || '').trim().split('@')[0] || '';
  if (!localPart) return '';
  return localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
    .split(/\s+/)[0] || '';
};

const ensurePlayerPreviewEmail = (raw: string) => {
  const email = normalizePlayerPreviewEmail(raw);
  if (!email || !PREVIEW_EMAIL_REGEX.test(email)) {
    throw new Error('Inserisci un indirizzo email valido.');
  }
  return email;
};

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const buildPlayerCanonicalIdentity = (
  firstNameRaw: string,
  lastNameRaw: string,
  birthDateRaw: string,
  fallbackCanonicalPlayerId?: string | null
): PlayerRuntimeProfile => {
  const firstName = String(firstNameRaw || '').trim();
  const lastName = String(lastNameRaw || '').trim();
  const birthDate = normalizeBirthDateInput(birthDateRaw) || String(birthDateRaw || '').trim();
  const canonicalPlayerName = `${lastName} ${firstName}`.trim();
  const canonicalPlayerId = String(fallbackCanonicalPlayerId || '').trim()
    || getPlayerKey(canonicalPlayerName, pickPlayerIdentityValue(birthDate));
  return {
    accountId: '',
    firstName,
    lastName,
    birthDate,
    canonicalPlayerId,
    canonicalPlayerName,
  };
};

export const toPlayerRuntimeProfile = (
  profile: Pick<PlayerRuntimeProfile, 'accountId' | 'firstName' | 'lastName' | 'birthDate' | 'canonicalPlayerId' | 'canonicalPlayerName'> | null | undefined
): PlayerRuntimeProfile | null => {
  if (!profile?.accountId || !profile.canonicalPlayerId || !profile.canonicalPlayerName) return null;
  return {
    accountId: String(profile.accountId),
    firstName: String(profile.firstName || '').trim(),
    lastName: String(profile.lastName || '').trim(),
    birthDate: normalizeBirthDateInput(profile.birthDate) || String(profile.birthDate || '').trim(),
    canonicalPlayerId: String(profile.canonicalPlayerId || '').trim(),
    canonicalPlayerName: String(profile.canonicalPlayerName || '').trim(),
  };
};

export const buildPlayerRuntimeSessionFromSupabase = (session: PlayerSupabaseSession): PlayerRuntimeSession => {
  const now = nowTs();
  return {
    accountId: String(session.userId || '').trim(),
    username: String(session.email || '').trim(),
    provider: (session.provider === 'google' || session.provider === 'facebook' || session.provider === 'apple' || session.provider === 'password')
      ? (session.provider === 'password' ? 'preview_password' : session.provider)
      : 'other',
    mode: 'live',
    createdAt: now,
    lastActiveAt: now,
  };
};

export const buildPlayerRuntimeProfileSnapshot = (state: AppState, profile: PlayerRuntimeProfile | null): PlayerProfileSnapshot | null => {
  const canonical = profile ? resolvePlayerKey(state, profile.canonicalPlayerId) : '';
  return canonical ? buildPlayerProfileSnapshot(state, canonical) : null;
};

export const mapSupabaseCallRowToPlayerCallRequest = (row: PlayerSupabaseCallRow): PlayerCallRequest => {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return {
    id: String(row.id || '').trim(),
    tournamentId: String(row.tournament_id || '').trim(),
    matchId: String(metadata.match_id || metadata.matchId || '').trim() || undefined,
    teamId: String(row.team_id || '').trim(),
    teamName: String(row.team_name || row.team_id || '').trim(),
    targetAccountId: String(row.target_user_id || '').trim(),
    targetPlayerId: String(row.target_player_id || '').trim(),
    targetPlayerName: String(row.target_player_name || '').trim(),
    requestedAt: row.requested_at ? Date.parse(row.requested_at) || nowTs() : nowTs(),
    acknowledgedAt: row.acknowledged_at ? (Date.parse(row.acknowledged_at) || undefined) : undefined,
    cancelledAt: row.cancelled_at ? (Date.parse(row.cancelled_at) || undefined) : undefined,
    status: row.status === 'expired' ? 'cancelled' : row.status,
    previewOnly: false,
  };
};

export const buildPlayerAccountAdminRowFromLive = (
  state: AppState,
  row: AdminPlayerAccountCatalogRow
): PlayerAccountAdminRow => {
  const firstName = '';
  const lastName = '';
  const birthDate = normalizeBirthDateInput(String(row.birth_date || '').trim()) || String(row.birth_date || '').trim();
  const canonicalPlayerId = String(row.canonical_player_id || '').trim();
  const canonicalPlayerName = String(row.linked_player_name || '').trim();
  const profile = canonicalPlayerId && canonicalPlayerName
    ? ({
        accountId: String(row.user_id || '').trim(),
        firstName,
        lastName,
        birthDate,
        canonicalPlayerId,
        canonicalPlayerName,
      } satisfies PlayerRuntimeProfile)
    : null;
  const personalProfile = buildPlayerRuntimeProfileSnapshot(state, profile);
  const providers = Array.isArray(row.providers) ? row.providers.map((value) => String(value || '').trim()).filter(Boolean) : [];
  const primaryProvider = String(row.primary_provider || '').trim().toLowerCase();
  const providerOrigins = Array.from(new Set(
    (providers.length ? providers : [primaryProvider])
      .map((value) => String(value || '').trim().toLowerCase())
      .map((value) =>
        value === 'google' || value === 'facebook' || value === 'apple' || value === 'in_app'
          ? value as PlayerAccountAdminOrigin
          : 'other'
      )
      .filter(Boolean)
  ));
  const provider: PlayerAccountAdminRow['provider'] =
    primaryProvider === 'google' || primaryProvider === 'facebook' || primaryProvider === 'apple'
      ? primaryProvider
      : 'other';
  return {
    id: String(row.user_id || '').trim(),
    email: String(row.email || '').trim(),
    provider,
    origin: (primaryProvider === 'google' || primaryProvider === 'facebook' || primaryProvider === 'apple' || primaryProvider === 'in_app')
      ? primaryProvider as PlayerAccountAdminOrigin
      : 'other',
    providerOrigins: providerOrigins.length ? providerOrigins : ['other'],
    mode: 'live',
    providers: providers.length ? providers.map((value) => {
      switch (value) {
        case 'in_app':
          return 'Email/Password';
        case 'google':
          return 'Google';
        case 'facebook':
          return 'Facebook';
        case 'apple':
          return 'Apple';
        default:
          return 'Other';
      }
    }) : ['Other'],
    createdAt: row.created_at ? Date.parse(row.created_at) || nowTs() : nowTs(),
    lastLoginAt: row.last_login_at ? (Date.parse(row.last_login_at) || undefined) : undefined,
    linkedPlayerName: canonicalPlayerName || null,
    birthDate: birthDate || null,
    canonicalPlayerId: canonicalPlayerId || null,
    totalTitles: personalProfile?.totalTitles || 0,
    totalCanestri: personalProfile?.totalCanestri || 0,
    totalSoffi: personalProfile?.totalSoffi || 0,
    hasProfile: !!row.has_profile,
    hasPasswordRecovery: providers.includes('in_app') && !!String(row.email || '').trim(),
    isAdmin: !!row.is_admin,
  };
};

const emitPlayerAppChange = () => {
  try {
    window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
  } catch {
    // ignore
  }
};

const readPreviewAccounts = (): PlayerPreviewAccount[] => {
  try {
    const rows = safeParse<PlayerPreviewAccount[]>(localStorage.getItem(PREVIEW_ACCOUNTS_KEY), []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const writePreviewAccounts = (rows: PlayerPreviewAccount[]) => {
  try {
    localStorage.setItem(PREVIEW_ACCOUNTS_KEY, JSON.stringify(rows));
    emitPlayerAppChange();
  } catch {
    // ignore
  }
};

const readPreviewProfilesMap = (): PreviewProfilesMap => {
  try {
    const raw = safeParse<PreviewProfilesMap>(localStorage.getItem(PREVIEW_PROFILES_KEY), {});
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};

const writePreviewProfilesMap = (rows: PreviewProfilesMap) => {
  try {
    localStorage.setItem(PREVIEW_PROFILES_KEY, JSON.stringify(rows));
    emitPlayerAppChange();
  } catch {
    // ignore
  }
};

export const readPlayerPreviewSession = (): PlayerPreviewSession | null => {
  try {
    const raw = safeParse<PlayerPreviewSession | null>(localStorage.getItem(PREVIEW_SESSION_KEY), null);
    if (!raw?.accountId || !raw.username) return null;
    return raw;
  } catch {
    return null;
  }
};

const writePlayerPreviewSession = (session: PlayerPreviewSession | null) => {
  try {
    if (!session) localStorage.removeItem(PREVIEW_SESSION_KEY);
    else localStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(session));
    emitPlayerAppChange();
  } catch {
    // ignore
  }
};

export const readPlayerPresenceSnapshot = (): PlayerPresenceSnapshot | null => {
  try {
    const raw = safeParse<PlayerPresenceSnapshot | null>(localStorage.getItem(PLAYER_PRESENCE_KEY), null);
    if (!raw?.accountId || !raw.mode) return null;
    return {
      accountId: String(raw.accountId || '').trim(),
      mode: raw.mode === 'live' ? 'live' : 'preview',
      email: String(raw.email || '').trim(),
      firstName: String(raw.firstName || '').trim(),
      displayName: String(raw.displayName || '').trim(),
      lastActiveAt: Number(raw.lastActiveAt || 0) || nowTs(),
    };
  } catch {
    return null;
  }
};

export const writePlayerPresenceSnapshot = (input: {
  accountId: string;
  mode: 'preview' | 'live';
  email?: string | null;
  firstName?: string | null;
}) => {
  const accountId = String(input.accountId || '').trim();
  if (!accountId) return;
  const email = normalizePlayerPreviewEmail(input.email || '');
  const firstName = toDisplayFirstName(String(input.firstName || '').trim(), email);
  const next: PlayerPresenceSnapshot = {
    accountId,
    mode: input.mode === 'live' ? 'live' : 'preview',
    email,
    firstName,
    displayName: firstName || email || 'Profilo',
    lastActiveAt: nowTs(),
  };
  try {
    localStorage.setItem(PLAYER_PRESENCE_KEY, JSON.stringify(next));
    emitPlayerAppChange();
  } catch {
    // ignore
  }
};

export const clearPlayerPresenceSnapshot = () => {
  try {
    localStorage.removeItem(PLAYER_PRESENCE_KEY);
    emitPlayerAppChange();
  } catch {
    // ignore
  }
};

export const signOutPlayerPreviewSession = () => {
  writePlayerPreviewSession(null);
  clearPlayerPresenceSnapshot();
};

export const registerPlayerPreviewAccount = (usernameRaw: string, passwordRaw: string): PlayerPreviewSession => {
  const username = ensurePlayerPreviewEmail(usernameRaw);
  const password = String(passwordRaw || '');
  if (!password.trim()) throw new Error('Inserisci una password valida.');

  const existing = readPreviewAccounts();
  if (existing.some((row) => row.username === username)) {
    throw new Error('Esiste già un account preview con questa email.');
  }

  const account: PlayerPreviewAccount = {
    id: `preview_${Math.random().toString(36).slice(2, 10)}`,
    username,
    password,
    createdAt: nowTs(),
    lastLoginAt: nowTs(),
  };

  writePreviewAccounts([...existing, account]);
  const session: PlayerPreviewSession = {
    accountId: account.id,
    username: account.username,
    provider: 'preview_password',
    mode: 'preview',
    createdAt: account.createdAt,
    lastActiveAt: nowTs(),
  };
  writePlayerPreviewSession(session);
  return session;
};

export const signInPlayerPreviewAccount = (usernameRaw: string, passwordRaw: string): PlayerPreviewSession => {
  const username = ensurePlayerPreviewEmail(usernameRaw);
  const password = String(passwordRaw || '');
  if (!password) throw new Error('Inserisci email e password.');

  const accounts = readPreviewAccounts();
  const match = accounts.find((row) => row.username === username && row.password === password);
  if (!match) {
    throw new Error('Credenziali preview non valide.');
  }

  const nextAccounts = accounts.map((row) =>
    row.id === match.id
      ? { ...row, lastLoginAt: nowTs() }
      : row
  );
  writePreviewAccounts(nextAccounts);

  const session: PlayerPreviewSession = {
    accountId: match.id,
    username: match.username,
    provider: 'preview_password',
    mode: 'preview',
    createdAt: match.createdAt,
    lastActiveAt: nowTs(),
  };
  writePlayerPreviewSession(session);
  return session;
};

export const readPlayerPreviewProfile = (accountId?: string | null): PlayerPreviewProfile | null => {
  const safeAccountId = String(accountId || '').trim();
  if (!safeAccountId) return null;
  const map = readPreviewProfilesMap();
  const hit = map[safeAccountId];
  return hit?.accountId ? hit : null;
};

export const savePlayerPreviewProfile = (
  session: PlayerPreviewSession,
  input: { firstName: string; lastName: string; birthDate: string }
): PlayerPreviewProfile => {
  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const birthDate = normalizeBirthDateInput(input.birthDate);
  if (!firstName || !lastName) throw new Error('Inserisci nome e cognome.');
  if (!birthDate) throw new Error('Inserisci una data di nascita valida.');

  const fullName = `${lastName} ${firstName}`.trim();
  const canonicalPlayerId = getPlayerKey(fullName, pickPlayerIdentityValue(birthDate));
  const now = nowTs();
  const previous = readPlayerPreviewProfile(session.accountId);
  const nextProfile: PlayerPreviewProfile = {
    accountId: session.accountId,
    firstName,
    lastName,
    birthDate,
    canonicalPlayerId,
    canonicalPlayerName: fullName,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };

  const nextMap = {
    ...readPreviewProfilesMap(),
    [session.accountId]: nextProfile,
  };
  writePreviewProfilesMap(nextMap);
  writePlayerPreviewSession({
    ...session,
    lastActiveAt: now,
  });
  return nextProfile;
};

export const readPlayerFeatureStatus = (): PlayerFeatureStatus => {
  const cfg = getSupabaseConfig();
  const session = getPlayerSupabaseSession();
  return {
    previewEnabled: true,
    supabaseConfigured: !!cfg,
    supabaseSessionPresent: !!session?.accessToken,
    remoteAuthPrepared: !!cfg,
    socialAuthPrepared: cfg ? ['google', 'facebook', 'apple'] : [],
    playerProfilesPrepared: !!cfg,
    playerCallsPrepared: !!cfg,
    refereeBypassPrepared: true,
  };
};

const resolveTeamPlayerKey = (
  state: AppState,
  name?: string | null,
  birthDate?: string | null,
  yob?: number | null
) => {
  if (!name) return '';
  return resolvePlayerKey(state, getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob)));
};

const normalizeRefereeNameKey = (value: string) => {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  try {
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
};

const buildRefereeNameCandidateKeys = (profile: PlayerRuntimeProfile) => {
  const candidateNames = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    const key = normalizeRefereeNameKey(normalized);
    if (key) candidateNames.add(key);

    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length === 2) {
      const reversedKey = normalizeRefereeNameKey(`${parts[1]} ${parts[0]}`);
      if (reversedKey) candidateNames.add(reversedKey);
    }
  };

  add(profile.canonicalPlayerName);
  add(`${profile.lastName} ${profile.firstName}`.trim());
  add(`${profile.firstName} ${profile.lastName}`.trim());
  return candidateNames;
};

const teamContainsCanonicalPlayer = (state: AppState, team: Team, canonicalPlayerId: string) => {
  const p1Key = resolveTeamPlayerKey(state, team.player1, (team as any).player1BirthDate, team.player1YoB);
  const p2Key = resolveTeamPlayerKey(state, team.player2, (team as any).player2BirthDate, team.player2YoB);
  return p1Key === canonicalPlayerId || p2Key === canonicalPlayerId;
};

const matchContainsTeam = (match: Match, teamId: string) => {
  const ids = getMatchParticipantIds(match);
  return ids.includes(teamId);
};

const isPlaceholderMatch = (match: Match) => {
  const ids = getMatchParticipantIds(match);
  return ids.length < 2 || ids.some((id) => {
    const upper = String(id || '').trim().toUpperCase();
    return upper === 'BYE' || upper === 'TBD' || upper.startsWith('TBD-');
  });
};

const readPreviewCalls = (): PlayerCallRequest[] => {
  try {
    const rows = safeParse<PlayerCallRequest[]>(localStorage.getItem(PREVIEW_CALLS_KEY), []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const writePreviewCalls = (rows: PlayerCallRequest[]) => {
  try {
    localStorage.setItem(PREVIEW_CALLS_KEY, JSON.stringify(rows));
    emitPlayerAppChange();
  } catch {
    // ignore
  }
};

export const readActiveCallForAccount = (accountId?: string | null, tournamentId?: string | null): PlayerCallRequest | null => {
  const safeAccountId = String(accountId || '').trim();
  if (!safeAccountId) return null;
  const safeTournamentId = String(tournamentId || '').trim();
  return readPreviewCalls()
    .filter((row) => row.targetAccountId === safeAccountId)
    .filter((row) => !safeTournamentId || row.tournamentId === safeTournamentId)
    .filter((row) => row.status === 'ringing' || row.status === 'acknowledged')
    .sort((a, b) => b.requestedAt - a.requestedAt)[0] || null;
};

export const acknowledgePlayerPreviewCall = (session: PlayerPreviewSession, callId: string): PlayerCallRequest => {
  const rows = readPreviewCalls();
  const target = rows.find((row) => row.id === callId && row.targetAccountId === session.accountId);
  if (!target) throw new Error('Convocazione non trovata per questo account.');
  const next: PlayerCallRequest = {
    ...target,
    status: 'acknowledged',
    acknowledgedAt: nowTs(),
  };
  writePreviewCalls(rows.map((row) => (row.id === callId ? next : row)));
  return next;
};

export const clearPlayerPreviewCall = (session: PlayerPreviewSession, callId: string): PlayerCallRequest => {
  const rows = readPreviewCalls();
  const target = rows.find((row) => row.id === callId && row.targetAccountId === session.accountId);
  if (!target) throw new Error('Convocazione non trovata per questo account.');
  const next: PlayerCallRequest = {
    ...target,
    status: 'cancelled',
    cancelledAt: nowTs(),
  };
  writePreviewCalls(rows.map((row) => (row.id === callId ? next : row)));
  return next;
};

const getPreviewCallTargetForTeam = (state: AppState, team: Team) => {
  const profiles = Object.values(readPreviewProfilesMap());
  for (const profile of profiles) {
    const canonical = resolvePlayerKey(state, profile.canonicalPlayerId);
    if (teamContainsCanonicalPlayer(state, team, canonical)) {
      return profile;
    }
  }
  return null;
};

export const getPreviewTeamCallState = (tournamentId: string, teamId: string, matchId?: string | null): PlayerCallRequest | null => {
  const safeMatchId = String(matchId || '').trim();
  return readPreviewCalls()
    .filter((row) => row.tournamentId === tournamentId && row.teamId === teamId)
    .filter((row) => !safeMatchId || row.matchId === safeMatchId)
    .filter((row) => row.status === 'ringing' || row.status === 'acknowledged')
    .sort((a, b) => b.requestedAt - a.requestedAt)[0] || null;
};

export const queuePreviewTeamCall = (state: AppState, team: Team, matchId?: string | null): PlayerCallRequest => {
  const tournamentId = String(state.tournament?.id || '').trim();
  if (!tournamentId) throw new Error('Nessun torneo live attivo.');
  const target = getPreviewCallTargetForTeam(state, team);
  if (!target) {
    throw new Error('Nessun giocatore registrato in questa anteprima browser per questa squadra.');
  }

  const safeMatchId = String(matchId || '').trim();
  const previous = getPreviewTeamCallState(tournamentId, team.id, safeMatchId);
  const call: PlayerCallRequest = {
    id: previous?.id || `call_${Math.random().toString(36).slice(2, 10)}`,
    tournamentId,
    matchId: safeMatchId || undefined,
    teamId: team.id,
    teamName: team.name || team.id,
    targetAccountId: target.accountId,
    targetPlayerId: target.canonicalPlayerId,
    targetPlayerName: target.canonicalPlayerName,
    requestedAt: nowTs(),
    status: 'ringing',
    previewOnly: true,
  };

  const rows = readPreviewCalls().filter((row) => !(
    row.tournamentId === tournamentId
    && row.teamId === team.id
    && (safeMatchId ? row.matchId === safeMatchId : !row.matchId)
  ));
  writePreviewCalls([...rows, call]);
  return call;
};

export const cancelPreviewTeamCall = (tournamentId: string, teamId: string, matchId?: string | null): PlayerCallRequest | null => {
  const previous = getPreviewTeamCallState(tournamentId, teamId, matchId);
  if (!previous) return null;
  const next: PlayerCallRequest = {
    ...previous,
    status: 'cancelled',
    cancelledAt: nowTs(),
  };
  writePreviewCalls(readPreviewCalls().map((row) => (row.id === previous.id ? next : row)));
  return next;
};

export const findRefereeBypassNameForProfile = (state: AppState, profile: PlayerRuntimeProfile | null) => {
  if (!profile || !state.tournament) return '';
  const canonical = resolvePlayerKey(state, profile.canonicalPlayerId);
  const liveTeams = Array.isArray(state.tournament.teams) ? state.tournament.teams : [];
  for (const team of liveTeams) {
    const p1Key = resolveTeamPlayerKey(state, team.player1, (team as any).player1BirthDate, team.player1YoB);
    const p2Key = resolveTeamPlayerKey(state, team.player2, (team as any).player2BirthDate, team.player2YoB);
    const p1Ref = !!(team as any).player1IsReferee || (!!team.isReferee && !(team as any).player2IsReferee);
    const p2Ref = !!(team as any).player2IsReferee;
    if (p1Key === canonical && p1Ref) {
      return String(team.player1 || profile.canonicalPlayerName || '').trim();
    }
    if (p2Key === canonical && p2Ref) {
      return String(team.player2 || profile.canonicalPlayerName || '').trim();
    }
  }

  const roster = Array.isArray((state.tournament as any)?.refereesRoster) ? ((state.tournament as any).refereesRoster as string[]) : [];
  const candidateNames = buildRefereeNameCandidateKeys(profile);
  const rosterName = roster.find((row) => candidateNames.has(normalizeRefereeNameKey(row)));
  return String(rosterName || '').trim();
};

const deriveRefereeBypassEligible = (state: AppState, profile: PlayerRuntimeProfile | null, _linkedTeam: Team | null) => {
  return !!findRefereeBypassNameForProfile(state, profile);
};

export const derivePlayerLiveStatus = (
  state: AppState,
  profile: PlayerRuntimeProfile | null,
  activeCallOverride?: PlayerCallRequest | null
): PlayerLiveStatus => {
  if (!state.tournament || !profile) {
    return {
      liveTournamentId: null,
      liveTournamentName: null,
      linkedTeam: null,
      nextMatch: null,
      nextMatchTurn: null,
      turnsUntilPlay: null,
      refereeBypassEligible: false,
      activeCall: activeCallOverride || null,
    };
  }

  const liveTeams = Array.isArray(state.tournament.teams) ? state.tournament.teams : [];
  const canonical = resolvePlayerKey(state, profile.canonicalPlayerId);
  const linkedTeam = liveTeams.find((team) => teamContainsCanonicalPlayer(state, team, canonical)) || null;
  if (!linkedTeam) {
    return {
      liveTournamentId: state.tournament.id,
      liveTournamentName: state.tournament.name || 'Torneo live',
      linkedTeam: null,
      nextMatch: null,
      nextMatchTurn: null,
      turnsUntilPlay: null,
      refereeBypassEligible: deriveRefereeBypassEligible(state, profile, null),
      activeCall: activeCallOverride ?? readActiveCallForAccount(profile.accountId, state.tournament.id),
    };
  }

  const tables = Math.max(1, Number((state.tournament.config as any)?.refTables || 1));
  const sorted = [...(state.tournamentMatches || [])]
    .filter((match) => !(match as any).hidden)
    .filter((match) => !match.isBye)
    .sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER));

  const eligible = sorted.filter((match) => !isPlaceholderMatch(match));
  const activeAnchorIndex = eligible.findIndex((match) => match.status === 'playing');
  const fallbackAnchorIndex = eligible.findIndex((match) => match.status !== 'finished');
  const anchorIndex = activeAnchorIndex >= 0 ? activeAnchorIndex : (fallbackAnchorIndex >= 0 ? fallbackAnchorIndex : -1);
  const anchorTurn = anchorIndex >= 0 ? Math.floor(anchorIndex / tables) + 1 : null;

  const nextMatch = eligible.find((match) => match.status !== 'finished' && matchContainsTeam(match, linkedTeam.id)) || null;
  const nextIndex = nextMatch ? eligible.findIndex((match) => match.id === nextMatch.id) : -1;
  const nextTurn = nextIndex >= 0 ? Math.floor(nextIndex / tables) + 1 : null;
  const turnsUntilPlay =
    nextTurn != null
      ? Math.max(0, nextTurn - (anchorTurn || nextTurn))
      : null;

  return {
    liveTournamentId: state.tournament.id,
    liveTournamentName: state.tournament.name || 'Torneo live',
    linkedTeam,
    nextMatch,
    nextMatchTurn: nextTurn,
    turnsUntilPlay,
    refereeBypassEligible: deriveRefereeBypassEligible(state, profile, linkedTeam),
    activeCall: activeCallOverride ?? readActiveCallForAccount(profile.accountId, state.tournament.id),
  };
};

export const buildPlayerAreaSnapshot = (state: AppState): PlayerAreaSnapshot => {
  const bootstrap = buildPlayerAreaBootstrapSnapshot();
  const runtimeProfile = toPlayerRuntimeProfile(bootstrap.profile);
  return {
    session: bootstrap.session,
    profile: bootstrap.profile,
    personalProfile: buildPlayerRuntimeProfileSnapshot(state, runtimeProfile),
    liveStatus: derivePlayerLiveStatus(state, runtimeProfile),
    featureStatus: bootstrap.featureStatus,
  };
};

export const buildPlayerAreaBootstrapSnapshot = (): PlayerAreaBootstrapSnapshot => {
  const session = readPlayerPreviewSession();
  const profile = readPlayerPreviewProfile(session?.accountId || null);
  return {
    session,
    profile,
    featureStatus: readPlayerFeatureStatus(),
  };
};

export const isPreviewPlayerRefereeForLive = (state: AppState): boolean => {
  const snapshot = buildPlayerAreaSnapshot(state);
  return !!snapshot.liveStatus.refereeBypassEligible;
};

export const usePlayerAppChangeSubscription = (onChange: () => void) => {
  const stableCallback = onChange;
  return () => {
    const handler = () => stableCallback();
    window.addEventListener('storage', handler);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    };
  };
};

export const getPreviewCallAvailabilityForTeam = (state: AppState, team: Team, matchId?: string | null) => {
  const tournamentId = String(state.tournament?.id || '').trim();
  const target = getPreviewCallTargetForTeam(state, team);
  const activeCall = tournamentId ? getPreviewTeamCallState(tournamentId, team.id, matchId) : null;
  return {
    tournamentId,
    target,
    activeCall,
    enabled: !!tournamentId && !!target,
  };
};

export const getPlayerPreviewIdentityLabel = (profile: PlayerPreviewProfile | null): string => {
  if (!profile) return '';
  return `${profile.canonicalPlayerName} · ${normalizeBirthDateInput(profile.birthDate) || profile.birthDate}`;
};

export const listPlayerPreviewAccountsAdminRows = (state: AppState): PlayerAccountAdminRow[] => {
  const profilesMap = readPreviewProfilesMap();
  return readPreviewAccounts()
    .map((account) => {
      const profile = profilesMap[account.id] || null;
      const canonical = profile ? resolvePlayerKey(state, profile.canonicalPlayerId) : '';
      const personalProfile = canonical ? buildPlayerProfileSnapshot(state, canonical) : null;
      return {
        id: account.id,
        email: normalizePlayerPreviewEmail(account.username),
        provider: 'preview_password',
        origin: 'in_app',
        providerOrigins: ['in_app'],
        mode: 'preview',
        providers: ['Email/Password'],
        createdAt: account.createdAt,
        lastLoginAt: account.lastLoginAt,
        linkedPlayerName: profile?.canonicalPlayerName || null,
        birthDate: profile?.birthDate || null,
        canonicalPlayerId: profile?.canonicalPlayerId || null,
        totalTitles: personalProfile?.totalTitles || 0,
        totalCanestri: personalProfile?.totalCanestri || 0,
        totalSoffi: personalProfile?.totalSoffi || 0,
        hasProfile: !!profile,
        hasPasswordRecovery: false,
        isAdmin: false,
      } satisfies PlayerAccountAdminRow;
    })
    .sort((a, b) => {
      const loginDiff = (b.lastLoginAt || 0) - (a.lastLoginAt || 0);
      if (loginDiff !== 0) return loginDiff;
      return a.email.localeCompare(b.email, 'it', { sensitivity: 'base' });
    });
};

export const updatePlayerPreviewAccountAdmin = (
  accountIdRaw: string,
  input: {
    email: string;
    firstName?: string;
    lastName?: string;
    birthDate?: string;
  }
): PlayerPreviewAccount => {
  const accountId = String(accountIdRaw || '').trim();
  if (!accountId) throw new Error('Account non valido.');

  const email = ensurePlayerPreviewEmail(input.email);
  const accounts = readPreviewAccounts();
  const current = accounts.find((row) => row.id === accountId);
  if (!current) throw new Error('Account preview non trovato.');
  if (accounts.some((row) => row.id !== accountId && normalizePlayerPreviewEmail(row.username) === email)) {
    throw new Error('Esiste già un account con questa email.');
  }

  const nextAccount: PlayerPreviewAccount = { ...current, username: email };
  writePreviewAccounts(accounts.map((row) => (row.id === accountId ? nextAccount : row)));

  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const birthDate = normalizeBirthDateInput(input.birthDate);
  const hasProfileInput = !!firstName || !!lastName || !!birthDate;
  if (hasProfileInput) {
    if (!firstName || !lastName) throw new Error('Per aggiornare il profilo inserisci nome e cognome.');
    if (!birthDate) throw new Error('Per aggiornare il profilo inserisci una data di nascita valida.');
    const previous = readPlayerPreviewProfile(accountId);
    const now = nowTs();
    const fullName = `${lastName} ${firstName}`.trim();
    const nextProfile: PlayerPreviewProfile = {
      accountId,
      firstName,
      lastName,
      birthDate,
      canonicalPlayerId: getPlayerKey(fullName, pickPlayerIdentityValue(birthDate)),
      canonicalPlayerName: fullName,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    writePreviewProfilesMap({
      ...readPreviewProfilesMap(),
      [accountId]: nextProfile,
    });
  }

  const currentSession = readPlayerPreviewSession();
  if (currentSession?.accountId === accountId) {
    writePlayerPreviewSession({
      ...currentSession,
      username: email,
      lastActiveAt: nowTs(),
    });
  }

  return nextAccount;
};

export const deletePlayerPreviewAccountAdmin = (accountIdRaw: string): PlayerPreviewAccount => {
  const accountId = String(accountIdRaw || '').trim();
  if (!accountId) throw new Error('Account non valido.');

  const accounts = readPreviewAccounts();
  const current = accounts.find((row) => row.id === accountId);
  if (!current) throw new Error('Account preview non trovato.');

  writePreviewAccounts(accounts.filter((row) => row.id !== accountId));

  const profiles = readPreviewProfilesMap();
  if (profiles[accountId]) {
    delete profiles[accountId];
    writePreviewProfilesMap(profiles);
  }

  const nextCalls = readPreviewCalls().filter((row) => row.targetAccountId !== accountId);
  writePreviewCalls(nextCalls);

  const currentSession = readPlayerPreviewSession();
  if (currentSession?.accountId === accountId) {
    writePlayerPreviewSession(null);
    clearPlayerPresenceSnapshot();
  }

  return current;
};

export type PlayerCallAdminNoteKind =
  | 'local_only'
  | 'supabase_missing'
  | 'backend_pending';

export const getPlayerCallAdminNoteKind = (): PlayerCallAdminNoteKind => {
  if (isLocalOnlyMode()) {
    return 'local_only';
  }
  if (!getSupabaseConfig()) {
    return 'supabase_missing';
  }
  return 'backend_pending';
};
