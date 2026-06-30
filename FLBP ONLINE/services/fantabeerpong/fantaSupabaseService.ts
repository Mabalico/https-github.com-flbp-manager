import type {
  FantaArchivedEdition,
  FantaArchivedEditionDetail,
  FantaArchivedPlayerRow,
  FantaArchivedStandingRow,
  FantaBuilderTeamGroup,
  FantaConfig,
  FantaLineupSlot,
  FantaPlayer,
} from './types';
import { ensureFreshPlayerSupabaseSession, getSupabaseConfig } from '../supabaseRest';
import { fetchWithDevRequestPerf } from '../devRequestPerf';
import { getPlayerKey, getPlayerKeyLabel } from '../playerIdentity';

interface SupabaseFantaConfig {
  workspace_id: string;
  active_tournament_id: string;
  is_lock_active: boolean;
  registration_open: boolean;
  updated_at: string;
}

interface SupabaseFantaTeam {
  id: string;
  workspace_id: string;
  tournament_id: string;
  user_id: string;
  name: string;
  status?: string;
  created_at: string;
}

interface SupabaseTournamentSummary {
  id: string;
  name: string;
  status?: 'live' | 'archived';
  start_date?: string;
  updated_at?: string;
  config?: Record<string, unknown> | null;
}

interface SupabasePublicTournamentTeam {
  id: string;
  name: string;
  player1?: string | null;
  player2?: string | null;
}

interface SupabasePublicTournamentMatch {
  id: string;
  code?: string | null;
  phase?: string | null;
  round?: number | null;
  round_name?: string | null;
  order_index?: number | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  played?: boolean | null;
  status?: string | null;
  is_bye?: boolean | null;
  hidden?: boolean | null;
}

interface SupabasePublicMatchStat {
  match_id: string;
  team_id: string;
  player_name: string;
  canestri?: number | null;
  soffi?: number | null;
}

interface SupabaseFantaRoster {
  id: string;
  team_id: string;
  player_id: string;
  player_name?: string | null;
  real_team_id?: string | null;
  real_team_name?: string | null;
  role: FantaLineupSlot['role'];
}

interface SupabaseFantaStanding {
  tournament_id: string;
  team_id: string;
  team_name: string;
  user_id?: string | null;
  live_points?: number | null;
  total_points?: number | null;
  points_from_goals?: number | null;
  points_from_blows?: number | null;
  points_from_wins?: number | null;
  bonus_scia?: number | null;
  players_in_game?: number | null;
  captain_name?: string | null;
  defenders_count?: number | null;
  status_label?: string | null;
}

interface SupabaseFantaPlayerStanding {
  tournament_id: string;
  player_key: string;
  player_name?: string | null;
  real_team_id?: string | null;
  real_team_name?: string | null;
  live_points?: number | null;
  total_points?: number | null;
  points_from_goals?: number | null;
  points_from_blows?: number | null;
  points_from_wins?: number | null;
  bonus_scia?: number | null;
  selected_by_teams?: number | null;
  status?: string | null;
  eliminated_by_team_name?: string | null;
}

export type FantaSaveTeamErrorCode =
  | 'not_authenticated'
  | 'no_live_tournament'
  | 'results_only_tournament'
  | 'tournament_locked'
  | 'invalid_roster'
  | 'backend_error';

export type FantaSaveTeamResult =
  | { ok: true; teamId?: string }
  | { ok: false; code: FantaSaveTeamErrorCode; message: string };

const restUrl = (cfg: { url: string }, path: string) => {
  const base = cfg.url.replace(/\/$/, '');
  return `${base}/rest/v1/${path}`;
};

const buildHeaders = (cfg: { anonKey: string }, token?: string | null) => {
  const auth = token || cfg.anonKey;
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${auth}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
};

const encode = (value: string) => encodeURIComponent(value);
const publicTournamentsSelect = 'id,name,status,start_date,updated_at,config';
const FANTA_CONFIG_CACHE_MS = 5_000;
const FANTA_COMPUTED_FALLBACK_CACHE_MS = 3_000;

let fantaConfigCache: {
  key: string;
  expiresAt: number;
  promise: Promise<FantaConfig | null>;
} | null = null;

const hasResultsOnlyConfig = (config?: Record<string, unknown> | null): boolean =>
  Boolean(config && typeof config === 'object' && config.resultsOnly === true);

const fetchJson = async <T>(
  url: string,
  headers: Record<string, string>,
  source: string,
): Promise<T | null> => {
  try {
    const res = await fetchWithDevRequestPerf(url, { method: 'GET', headers }, { source });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
};

const readRpcStringResult = async (res: Response): Promise<string> => {
  try {
    const payload = await res.json();
    return String(payload || '').trim();
  } catch {
    return '';
  }
};

const fetchLatestLiveTournament = async (cfg: { url: string; anonKey: string; workspaceId: string }) => {
  const rows = await fetchJson<SupabaseTournamentSummary[]>(
    `${restUrl(cfg, 'public_tournaments')}?workspace_id=eq.${encode(cfg.workspaceId)}&status=eq.live&select=${publicTournamentsSelect}&order=updated_at.desc&limit=1`,
    buildHeaders(cfg),
    'fetchFantaLatestLiveTournament',
  );
  return rows?.[0] || null;
};

const fetchTournamentSummary = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
  tournamentId: string,
) => {
  if (!tournamentId) return null;
  const rows = await fetchJson<SupabaseTournamentSummary[]>(
    `${restUrl(cfg, 'public_tournaments')}?workspace_id=eq.${encode(cfg.workspaceId)}&id=eq.${encode(tournamentId)}&select=${publicTournamentsSelect}&limit=1`,
    buildHeaders(cfg),
    'fetchFantaTournamentSummary',
  );
  return rows?.[0] || null;
};

const fetchTournamentStarted = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
  tournamentId: string,
) => {
  if (!tournamentId) return false;
  const rows = await fetchJson<Array<{ id: string }>>(
    `${restUrl(cfg, 'public_tournament_matches')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&hidden=eq.false&is_bye=eq.false&or=(played.eq.true,status.eq.playing)&select=id&limit=1`,
    buildHeaders(cfg),
    'fetchFantaTournamentStarted',
  );
  return !!rows?.length;
};

const fetchFantaConfigFresh = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
): Promise<FantaConfig | null> => {
  const rows = await fetchJson<SupabaseFantaConfig[]>(
    `${restUrl(cfg, 'fanta_config')}?workspace_id=eq.${encode(cfg.workspaceId)}&select=*`,
    buildHeaders(cfg),
    'fetchFantaConfig',
  );

  const configured = rows?.[0] || null;
  const [configuredTournament, liveTournament] = await Promise.all([
    configured?.active_tournament_id ? fetchTournamentSummary(cfg, configured.active_tournament_id) : Promise.resolve(null),
    fetchLatestLiveTournament(cfg),
  ]);
  const activeTournament = configuredTournament?.status === 'live' ? configuredTournament : liveTournament;
  const activeTournamentId = activeTournament?.id || '';
  if (!activeTournamentId) return null;

  const tournamentStarted = await fetchTournamentStarted(cfg, activeTournamentId);
  const activeTournamentResultsOnly = hasResultsOnlyConfig(activeTournament?.config);
  return {
    activeTournamentId,
    activeTournamentName: activeTournament?.name,
    activeTournamentResultsOnly,
    isLockActive: activeTournamentResultsOnly || tournamentStarted,
    registrationOpen: !activeTournamentResultsOnly && !tournamentStarted,
    registrationOpenFlag: true,
    manualLockActive: false,
    tournamentStarted,
    lockReason: activeTournamentResultsOnly ? 'results_only_tournament' : tournamentStarted ? 'first_match_started' : null,
    updatedAt: configured?.updated_at,
  };
};

export const fetchFantaConfig = async (): Promise<FantaConfig | null> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  const key = `${cfg.url}::${cfg.workspaceId}`;
  const now = Date.now();
  if (fantaConfigCache?.key === key && fantaConfigCache.expiresAt > now) {
    return fantaConfigCache.promise;
  }

  const promise = fetchFantaConfigFresh(cfg).catch((error) => {
    if (fantaConfigCache?.promise === promise) fantaConfigCache = null;
    throw error;
  });
  fantaConfigCache = { key, expiresAt: now + FANTA_CONFIG_CACHE_MS, promise };
  return promise;
};

export const fetchFantaTournamentTeams = async (
  tournamentId?: string,
): Promise<FantaBuilderTeamGroup[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const config = await fetchFantaConfig();
  if (config?.activeTournamentResultsOnly) return [];

  const activeTournamentId = tournamentId || config?.activeTournamentId || '';
  if (!activeTournamentId) return [];

  const rows = await fetchJson<SupabasePublicTournamentTeam[]>(
    `${restUrl(cfg, 'public_tournament_teams')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(activeTournamentId)}&select=id,name,player1,player2&order=created_at.asc`,
    buildHeaders(cfg),
    'fetchFantaTournamentTeams',
  );

  return (rows || []).map((team) => {
    const players = [team.player1, team.player2]
      .map((playerName) => String(playerName || '').trim())
      .filter(Boolean)
      .map((playerName) => ({
        id: getPlayerKey(playerName, 'ND'),
        playerName,
        realTeamId: team.id,
        realTeamName: team.name,
        status: 'live' as const,
        trend: 'steady' as const,
        note: 'Disponibile nella rosa del torneo live.',
      }));

    return { id: team.id, teamName: team.name, players };
  }).filter((team) => team.players.length > 0);
};

const formatFantaDate = (value?: string | null) => {
  if (!value) return 'Data non disponibile';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const compareFantaStandings = (left: SupabaseFantaStanding, right: SupabaseFantaStanding) => {
  if ((right.total_points || 0) !== (left.total_points || 0)) return (right.total_points || 0) - (left.total_points || 0);
  if ((right.players_in_game || 0) !== (left.players_in_game || 0)) return (right.players_in_game || 0) - (left.players_in_game || 0);
  if ((right.points_from_wins || 0) !== (left.points_from_wins || 0)) return (right.points_from_wins || 0) - (left.points_from_wins || 0);
  if ((right.points_from_goals || 0) !== (left.points_from_goals || 0)) return (right.points_from_goals || 0) - (left.points_from_goals || 0);
  return String(left.team_name || '').localeCompare(String(right.team_name || ''), 'it', { sensitivity: 'base' });
};

const buildArchivedEdition = (
  tournament: SupabaseTournamentSummary,
  standingRows: SupabaseFantaStanding[],
): FantaArchivedEdition | null => {
  const sorted = [...standingRows].sort(compareFantaStandings);
  const winner = sorted[0];
  if (!winner) return null;
  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    dateLabel: formatFantaDate(tournament.start_date || tournament.updated_at),
    winnerTeamName: winner.team_name || 'N/D',
    winnerPoints: winner.total_points || 0,
    teamsCount: sorted.length,
    updatedAt: tournament.updated_at,
  };
};

export const fetchFantaArchivedEditions = async (): Promise<FantaArchivedEdition[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const [tournaments, standings] = await Promise.all([
    fetchJson<SupabaseTournamentSummary[]>(
      `${restUrl(cfg, 'public_tournaments')}?workspace_id=eq.${encode(cfg.workspaceId)}&status=eq.archived&select=${publicTournamentsSelect}&order=start_date.desc`,
      buildHeaders(cfg),
      'fetchFantaArchivedTournaments',
    ),
    fetchJson<SupabaseFantaStanding[]>(
      `${restUrl(cfg, 'fanta_live_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&select=*`,
      buildHeaders(cfg),
      'fetchFantaArchivedStandings',
    ),
  ]);

  const standingsByTournament = new Map<string, SupabaseFantaStanding[]>();
  (standings || []).forEach((row) => {
    const rows = standingsByTournament.get(row.tournament_id) || [];
    rows.push(row);
    standingsByTournament.set(row.tournament_id, rows);
  });

  return (tournaments || [])
    .map((tournament) => buildArchivedEdition(tournament, standingsByTournament.get(tournament.id) || []))
    .filter((edition): edition is FantaArchivedEdition => Boolean(edition));
};

const fetchFantaStandingsForTournament = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
  tournamentId: string,
): Promise<SupabaseFantaStanding[]> => {
  return await fetchJson<SupabaseFantaStanding[]>(
    `${restUrl(cfg, 'fanta_live_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&select=*`,
    buildHeaders(cfg),
    'fetchFantaStandingsForTournament',
  ) || [];
};

const fetchFantaPlayersForTournament = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
  tournamentId: string,
): Promise<SupabaseFantaPlayerStanding[]> => {
  return await fetchJson<SupabaseFantaPlayerStanding[]>(
    `${restUrl(cfg, 'fanta_player_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&select=*&order=total_points.desc,points_from_wins.desc,points_from_goals.desc`,
    buildHeaders(cfg),
    'fetchFantaPlayersForTournament',
  ) || [];
};

const fantaSaveFailure = (code: FantaSaveTeamErrorCode): FantaSaveTeamResult => {
  switch (code) {
    case 'not_authenticated':
      return { ok: false, code, message: 'Accedi al tuo account giocatore e riprova.' };
    case 'no_live_tournament':
      return { ok: false, code, message: 'Non c’è un torneo live disponibile per creare la squadra Fanta.' };
    case 'results_only_tournament':
      return { ok: false, code, message: 'Questo torneo live è in modalità solo risultati: il FantaBeerpong è disponibile solo quando si segnano canestri e soffi.' };
    case 'tournament_locked':
      return { ok: false, code, message: 'Il mercato Fanta è chiuso: la squadra non può più essere modificata.' };
    case 'invalid_roster':
      return { ok: false, code, message: 'Completa la squadra con 4 giocatori, 1 capitano e 2 difensori.' };
    case 'backend_error':
    default:
      return { ok: false, code: 'backend_error', message: 'Non sono riuscito a salvare la squadra. Riprova tra poco.' };
  }
};

const isSupabaseSessionExpired = (expiresAt?: string | null) => {
  if (!expiresAt) return false;
  const raw = String(expiresAt).trim();
  if (!raw) return false;
  const numeric = Number(raw);
  const expiresMs = Number.isFinite(numeric)
    ? numeric * 1000
    : new Date(raw).getTime();
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs <= Date.now() + 30_000;
};

const fantaSaveAuthFailure = (message: string): FantaSaveTeamResult => ({
  ok: false,
  code: 'not_authenticated',
  message,
});

const fantaSaveFailureFromResponse = async (res: Response): Promise<FantaSaveTeamResult> => {
  if (res.status === 401 || res.status === 403) return fantaSaveFailure('not_authenticated');

  let body = '';
  try {
    body = await res.text();
  } catch {
    body = '';
  }
  const lowerBody = body.toLowerCase();
  if (lowerBody.includes('no live tournament') || lowerBody.includes('while the tournament is live')) {
    return fantaSaveFailure('no_live_tournament');
  }
  if (lowerBody.includes('results-only') || lowerBody.includes('results only') || lowerBody.includes('scorer stats')) {
    return fantaSaveFailure('results_only_tournament');
  }
  if (lowerBody.includes('locked') || lowerBody.includes('first match')) {
    return fantaSaveFailure('tournament_locked');
  }
  if (lowerBody.includes('invalid fanta roster') || lowerBody.includes('roster must') || lowerBody.includes('invalid players')) {
    return fantaSaveFailure('invalid_roster');
  }
  return fantaSaveFailure('backend_error');
};

export const fetchFantaArchivedEditionDetail = async (
  tournamentId: string,
): Promise<FantaArchivedEditionDetail | null> => {
  const cfg = getSupabaseConfig();
  if (!cfg || !tournamentId) return null;

  const [tournament, standingsRows, playerRows] = await Promise.all([
    fetchTournamentSummary(cfg, tournamentId),
    fetchFantaStandingsForTournament(cfg, tournamentId),
    fetchFantaPlayersForTournament(cfg, tournamentId),
  ]);

  if (!tournament || standingsRows.length === 0) return null;

  const edition = buildArchivedEdition(tournament, standingsRows);
  if (!edition) return null;

  const standings: FantaArchivedStandingRow[] = [...standingsRows]
    .sort(compareFantaStandings)
    .map((row, index) => ({
      teamId: row.team_id,
      userId: row.user_id || null,
      rank: index + 1,
      teamName: row.team_name || 'N/D',
      totalPoints: row.total_points || 0,
      goals: row.points_from_goals || 0,
      blows: row.points_from_blows || 0,
      wins: row.points_from_wins || 0,
      bonusScia: row.bonus_scia || 0,
      playersInGame: row.players_in_game || 0,
    }));

  const topPlayers: FantaArchivedPlayerRow[] = [...playerRows]
    .sort((left, right) => {
      if ((right.total_points || 0) !== (left.total_points || 0)) return (right.total_points || 0) - (left.total_points || 0);
      if ((right.points_from_wins || 0) !== (left.points_from_wins || 0)) return (right.points_from_wins || 0) - (left.points_from_wins || 0);
      if ((right.points_from_goals || 0) !== (left.points_from_goals || 0)) return (right.points_from_goals || 0) - (left.points_from_goals || 0);
      return String(left.player_name || '').localeCompare(String(right.player_name || ''), 'it', { sensitivity: 'base' });
    })
    .slice(0, 10)
    .map((row, index) => ({
      playerId: row.player_key,
      rank: index + 1,
      playerName: row.player_name || 'N/D',
      realTeamName: row.real_team_name || 'N/D',
      totalPoints: row.total_points || 0,
      goals: row.points_from_goals || 0,
      blows: row.points_from_blows || 0,
      wins: row.points_from_wins || 0,
      bonusScia: row.bonus_scia || 0,
    }));

  return { edition, standings, topPlayers };
};

export const fetchUserFantaTeam = async (
  userId: string,
): Promise<{ team: SupabaseFantaTeam; roster: SupabaseFantaRoster[] } | null> => {
  const cfg = getSupabaseConfig();
  const token = (await ensureFreshPlayerSupabaseSession())?.accessToken || null;
  if (!cfg || !token) return null;

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId || config.activeTournamentResultsOnly) return null;

  const teams = await fetchJson<SupabaseFantaTeam[]>(
    `${restUrl(cfg, 'fanta_teams')}?user_id=eq.${encode(userId)}&workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=*&limit=1`,
    buildHeaders(cfg, token),
    'fetchUserFantaTeam',
  );
  const team = teams?.[0];
  if (!team) return null;

  const roster = await fetchJson<SupabaseFantaRoster[]>(
    `${restUrl(cfg, 'fanta_rosters')}?team_id=eq.${encode(team.id)}&select=*&order=created_at.asc`,
    buildHeaders(cfg, token),
    'fetchUserFantaRoster',
  );

  return { team, roster: roster || [] };
};

export const fetchFantaTeamById = async (
  teamId: string,
): Promise<{ team: SupabaseFantaTeam; roster: SupabaseFantaRoster[] } | null> => {
  const cfg = getSupabaseConfig();
  const token = (await ensureFreshPlayerSupabaseSession())?.accessToken || null;
  const safeTeamId = String(teamId || '').trim();
  if (!cfg || !token || !safeTeamId) return null;

  const teams = await fetchJson<SupabaseFantaTeam[]>(
    `${restUrl(cfg, 'fanta_teams')}?id=eq.${encode(safeTeamId)}&workspace_id=eq.${encode(cfg.workspaceId)}&select=*&limit=1`,
    buildHeaders(cfg, token),
    'fetchFantaTeamById',
  );
  const team = teams?.[0];
  if (!team) return null;

  const roster = await fetchJson<SupabaseFantaRoster[]>(
    `${restUrl(cfg, 'fanta_rosters')}?team_id=eq.${encode(team.id)}&select=*&order=created_at.asc`,
    buildHeaders(cfg, token),
    'fetchFantaTeamByIdRoster',
  );

  return { team, roster: roster || [] };
};

export const saveFantaTeam = async (
  _userId: string,
  teamName: string,
  lineup: { player: FantaPlayer; role: FantaLineupSlot['role'] }[],
): Promise<boolean> => {
  const result = await saveFantaTeamWithResult(_userId, teamName, lineup);
  return result.ok;
};

export const saveFantaTeamWithResult = async (
  _userId: string,
  teamName: string,
  lineup: { player: FantaPlayer; role: FantaLineupSlot['role'] }[],
): Promise<FantaSaveTeamResult> => {
  const cfg = getSupabaseConfig();
  const playerSession = await ensureFreshPlayerSupabaseSession();
  const token = playerSession?.accessToken || null;
  const expectedUserId = String(_userId || '').trim();
  if (!cfg) return fantaSaveFailure('backend_error');
  if (!token) return fantaSaveFailure('not_authenticated');
  if (isSupabaseSessionExpired(playerSession?.expiresAt)) {
    return fantaSaveAuthFailure('La sessione giocatore su questo browser è scaduta. Esci dall’area giocatore e accedi di nuovo.');
  }
  if (playerSession?.userId && expectedUserId && playerSession.userId !== expectedUserId) {
    return fantaSaveAuthFailure('La sessione salvata in questo browser non coincide con l’account attivo. Esci dall’area giocatore e accedi di nuovo.');
  }

  try {
    const config = await fetchFantaConfig();
    const name = teamName.trim();
    const captainCount = lineup.filter((item) => item.role === 'captain').length;
    const defenderCount = lineup.filter((item) => item.role === 'defender').length;
    const distinctPlayers = new Set(lineup.map((item) => item.player.id)).size;

    if (!config?.activeTournamentId) return fantaSaveFailure('no_live_tournament');
    if (config.activeTournamentResultsOnly) return fantaSaveFailure('results_only_tournament');
    if (config.isLockActive || !config.registrationOpen) return fantaSaveFailure('tournament_locked');
    if (!name || lineup.length !== 4 || distinctPlayers !== 4 || captainCount !== 1 || defenderCount !== 2) {
      return fantaSaveFailure('invalid_roster');
    }

    const rosterPayload = lineup.map((item) => ({
      player_id: item.player.id,
      player_name: item.player.playerName,
      real_team_id: item.player.realTeamId || null,
      real_team_name: item.player.realTeamName,
      role: item.role,
    }));

    const res = await fetchWithDevRequestPerf(`${restUrl(cfg, 'rpc/fanta_save_team')}`, {
      method: 'POST',
      headers: buildHeaders(cfg, token),
      body: JSON.stringify({
        p_workspace_id: cfg.workspaceId,
        p_tournament_id: config.activeTournamentId,
        p_team_name: name,
        p_roster: rosterPayload,
      }),
    }, { source: 'saveFantaTeam' });
    if (res.ok) return { ok: true, teamId: await readRpcStringResult(res) };
    return await fantaSaveFailureFromResponse(res);
  } catch {
    return fantaSaveFailure('backend_error');
  }
};

const normalizeFantaNameKey = (value: unknown) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const toNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const isFinishedPublicMatch = (match: SupabasePublicTournamentMatch): boolean => {
  if (match.hidden || match.is_bye) return false;
  if (!match.team_a_id || !match.team_b_id) return false;
  if (match.team_a_id === 'BYE' || match.team_b_id === 'BYE') return false;
  if (!(match.played || match.status === 'finished')) return false;
  return toNumber(match.score_a) !== toNumber(match.score_b);
};

const getPublicMatchWinner = (match: SupabasePublicTournamentMatch): string | null => {
  if (!isFinishedPublicMatch(match)) return null;
  return toNumber(match.score_a) > toNumber(match.score_b)
    ? String(match.team_a_id || '')
    : String(match.team_b_id || '');
};

const getPublicMatchLoser = (match: SupabasePublicTournamentMatch): string | null => {
  if (!isFinishedPublicMatch(match)) return null;
  return toNumber(match.score_a) > toNumber(match.score_b)
    ? String(match.team_b_id || '')
    : String(match.team_a_id || '');
};

const getPublicMatchSort = (match: SupabasePublicTournamentMatch): number =>
  (toNumber(match.round) * 10000) + toNumber(match.order_index);

type FantaComputedFallback = {
  standings: SupabaseFantaStanding[];
  players: SupabaseFantaPlayerStanding[];
  rosterRows: any[];
  hasLiveProgress: boolean;
};

let computedFantaFallbackCache: {
  key: string;
  expiresAt: number;
  promise: Promise<FantaComputedFallback>;
} | null = null;

const fetchComputedFantaFallbackFresh = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
  tournamentId: string,
): Promise<FantaComputedFallback> => {
  const fantaTeams = await fetchJson<SupabaseFantaTeam[]>(
    `${restUrl(cfg, 'fanta_teams')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&select=*`,
    buildHeaders(cfg),
    'fetchComputedFantaFallbackTeams',
  ) || [];

  if (!fantaTeams.length) {
    return { standings: [], players: [], rosterRows: [], hasLiveProgress: false };
  }

  const fantaTeamIds = fantaTeams.map((team) => team.id).filter(Boolean);
  const rosterFilter = fantaTeamIds.length ? `&team_id=in.(${fantaTeamIds.map(encode).join(',')})` : '';
  const [rosters, publicTeams, matches, stats] = await Promise.all([
    fetchJson<SupabaseFantaRoster[]>(
      `${restUrl(cfg, 'fanta_rosters')}?select=*${rosterFilter}&order=created_at.asc`,
      buildHeaders(cfg),
      'fetchComputedFantaFallbackRosters',
    ),
    fetchJson<SupabasePublicTournamentTeam[]>(
      `${restUrl(cfg, 'public_tournament_teams')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&select=id,name,player1,player2`,
      buildHeaders(cfg),
      'fetchComputedFantaFallbackRealTeams',
    ),
    fetchJson<SupabasePublicTournamentMatch[]>(
      `${restUrl(cfg, 'public_tournament_matches')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&select=id,phase,round,round_name,order_index,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden`,
      buildHeaders(cfg),
      'fetchComputedFantaFallbackMatches',
    ),
    fetchJson<SupabasePublicMatchStat[]>(
      `${restUrl(cfg, 'public_tournament_match_stats')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&select=match_id,team_id,player_name,canestri,soffi`,
      buildHeaders(cfg),
      'fetchComputedFantaFallbackStats',
    ),
  ]);

  const rostersByTeamId = new Map<string, SupabaseFantaRoster[]>();
  (rosters || []).forEach((roster) => {
    const rows = rostersByTeamId.get(roster.team_id) || [];
    rows.push(roster);
    rostersByTeamId.set(roster.team_id, rows);
  });

  const realTeamNameById = new Map<string, string>();
  (publicTeams || []).forEach((team) => {
    if (team.id) realTeamNameById.set(team.id, team.name || team.id);
  });

  const statsByTeamPlayer = new Map<string, { goals: number; blows: number; playerName: string }>();
  (stats || []).forEach((stat) => {
    const key = `${stat.team_id}||${normalizeFantaNameKey(stat.player_name)}`;
    const current = statsByTeamPlayer.get(key) || { goals: 0, blows: 0, playerName: String(stat.player_name || '') };
    current.goals += toNumber(stat.canestri);
    current.blows += toNumber(stat.soffi);
    if (stat.player_name) current.playerName = stat.player_name;
    statsByTeamPlayer.set(key, current);
  });

  const winnerRows = (matches || [])
    .filter(isFinishedPublicMatch)
    .map((match) => ({
      match,
      winnerTeamId: getPublicMatchWinner(match),
      loserTeamId: getPublicMatchLoser(match),
      sort: getPublicMatchSort(match),
      phase: String(match.phase || ''),
    }))
    .filter((row) => row.winnerTeamId && row.loserTeamId);

  const winsByTeamId = new Map<string, number>();
  winnerRows.forEach((row) => {
    winsByTeamId.set(row.winnerTeamId!, (winsByTeamId.get(row.winnerTeamId!) || 0) + 1);
  });

  const firstLossByTeamId = new Map<string, { eliminatedByTeamId: string; sort: number }>();
  winnerRows
    .filter((row) => row.phase === 'bracket')
    .sort((left, right) => left.sort - right.sort)
    .forEach((row) => {
      if (!row.loserTeamId || !row.winnerTeamId || firstLossByTeamId.has(row.loserTeamId)) return;
      firstLossByTeamId.set(row.loserTeamId, { eliminatedByTeamId: row.winnerTeamId, sort: row.sort });
    });

  const sciaByTeamId = new Map<string, number>();
  firstLossByTeamId.forEach((loss, eliminatedTeamId) => {
    const firstEliminatorLossSort = winnerRows
      .filter((row) => row.loserTeamId === loss.eliminatedByTeamId && row.sort > loss.sort)
      .map((row) => row.sort)
      .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY;
    const chainedWins = winnerRows.filter((row) =>
      row.winnerTeamId === loss.eliminatedByTeamId
      && row.sort > loss.sort
      && row.sort < firstEliminatorLossSort
    ).length;
    sciaByTeamId.set(eliminatedTeamId, chainedWins * 5);
  });

  const playerRowsById = new Map<string, SupabaseFantaPlayerStanding & { selectedByTeamsSet?: Set<string> }>();
  const computedRosterRows: any[] = [];
  const standings = fantaTeams.map((team) => {
    const rosterRows = rostersByTeamId.get(team.id) || [];
    let pointsFromGoals = 0;
    let pointsFromBlows = 0;
    let pointsFromWins = 0;
    let bonusScia = 0;
    let livePoints = 0;
    let playersInGame = 0;
    let captainName = 'N/D';
    let defendersCount = 0;

    rosterRows.forEach((roster) => {
      const playerName = String(roster.player_name || getPlayerKeyLabel(roster.player_id).name || roster.player_id || '').trim();
      const realTeamId = String(roster.real_team_id || '').trim();
      const stat = statsByTeamPlayer.get(`${realTeamId}||${normalizeFantaNameKey(playerName)}`) || { goals: 0, blows: 0, playerName };
      const rawGoals = stat.goals;
      const rawBlows = stat.blows;
      const rawWins = winsByTeamId.get(realTeamId) || 0;
      const rawScia = sciaByTeamId.get(realTeamId) || 0;
      const eliminated = realTeamId ? firstLossByTeamId.has(realTeamId) : false;

      if (!eliminated) playersInGame += 1;
      if (roster.role === 'captain') captainName = playerName || captainName;
      if (roster.role === 'defender') defendersCount += 1;

      const goalsPoints = roster.role === 'captain' ? rawGoals * 2 : rawGoals;
      const blowsPoints = (roster.role === 'captain' || roster.role === 'defender') ? rawBlows * 4 : rawBlows * 2;
      const winsPoints = roster.role === 'captain' ? rawWins * 14 : rawWins * 7;
      const sciaPoints = roster.role === 'captain' ? rawScia * 2 : rawScia;
      const eliminatorTeamId = firstLossByTeamId.get(realTeamId)?.eliminatedByTeamId || null;
      const eliminatedByTeamName = eliminated && eliminatorTeamId ? realTeamNameById.get(eliminatorTeamId) || null : null;

      pointsFromGoals += goalsPoints;
      pointsFromBlows += blowsPoints;
      pointsFromWins += winsPoints;
      bonusScia += sciaPoints;
      livePoints += goalsPoints + blowsPoints + winsPoints;

      computedRosterRows.push({
        workspace_id: cfg.workspaceId,
        tournament_id: tournamentId,
        team_id: team.id,
        team_name: team.name,
        user_id: team.user_id,
        player_id: roster.player_id,
        player_name: playerName,
        real_team_id: realTeamId || null,
        real_team_name: roster.real_team_name || realTeamNameById.get(realTeamId) || 'N/D',
        role: roster.role,
        raw_goals: rawGoals,
        raw_blows: rawBlows,
        raw_wins: rawWins,
        raw_scia: rawScia,
        points_from_goals: goalsPoints,
        points_from_blows: blowsPoints,
        points_from_wins: winsPoints,
        points_from_scia: sciaPoints,
        bonus_scia: sciaPoints,
        live_points: goalsPoints + blowsPoints + winsPoints,
        total_points: goalsPoints + blowsPoints + winsPoints + sciaPoints,
        status: eliminated ? 'eliminated' : 'live',
        eliminated_by_team_id: eliminatorTeamId,
        eliminated_by_team_name: eliminatedByTeamName,
      });

      const existingPlayer = playerRowsById.get(roster.player_id) || {
        tournament_id: tournamentId,
        player_key: roster.player_id,
        player_name: playerName,
        real_team_id: realTeamId || null,
        real_team_name: roster.real_team_name || realTeamNameById.get(realTeamId) || 'N/D',
        points_from_goals: rawGoals,
        points_from_blows: rawBlows * 2,
        points_from_wins: rawWins * 7,
        bonus_scia: rawScia,
        total_points: rawGoals + (rawBlows * 2) + (rawWins * 7) + rawScia,
        live_points: rawGoals + (rawBlows * 2) + (rawWins * 7),
        status: eliminated ? 'eliminated' : 'live',
        eliminated_by_team_name: eliminated ? realTeamNameById.get(firstLossByTeamId.get(realTeamId)?.eliminatedByTeamId || '') || null : null,
        selected_by_teams: 0,
        selectedByTeamsSet: new Set<string>(),
      };
      existingPlayer.selectedByTeamsSet?.add(team.id);
      existingPlayer.selected_by_teams = existingPlayer.selectedByTeamsSet?.size || 0;
      playerRowsById.set(roster.player_id, existingPlayer);
    });

    const totalPoints = pointsFromGoals + pointsFromBlows + pointsFromWins + bonusScia;
    return {
      tournament_id: tournamentId,
      team_id: team.id,
      team_name: team.name,
      user_id: team.user_id,
      total_points: totalPoints,
      live_points: livePoints,
      points_from_goals: pointsFromGoals,
      points_from_blows: pointsFromBlows,
      points_from_wins: pointsFromWins,
      bonus_scia: bonusScia,
      players_in_game: playersInGame,
      captain_name: captainName,
      defenders_count: defendersCount,
      status_label: playersInGame > 0 ? 'Live' : 'Stabile',
    };
  });

  const players = Array.from(playerRowsById.values()).map(({ selectedByTeamsSet, ...row }) => row);
  const hasLiveProgress = winnerRows.length > 0 || Array.from(statsByTeamPlayer.values()).some((row) => row.goals > 0 || row.blows > 0);

  return { standings, players, rosterRows: computedRosterRows, hasLiveProgress };
};

const fetchComputedFantaFallback = async (
  cfg: { url: string; anonKey: string; workspaceId: string },
  tournamentId: string,
): Promise<FantaComputedFallback> => {
  const key = `${cfg.url}::${cfg.workspaceId}::${tournamentId}`;
  const now = Date.now();
  if (computedFantaFallbackCache?.key === key && computedFantaFallbackCache.expiresAt > now) {
    return computedFantaFallbackCache.promise;
  }

  const promise = fetchComputedFantaFallbackFresh(cfg, tournamentId).catch((error) => {
    if (computedFantaFallbackCache?.promise === promise) computedFantaFallbackCache = null;
    throw error;
  });
  computedFantaFallbackCache = { key, expiresAt: now + FANTA_COMPUTED_FALLBACK_CACHE_MS, promise };
  return promise;
};

const hasMeaningfulFantaStandings = (rows: SupabaseFantaStanding[]): boolean =>
  rows.some((row) =>
    toNumber(row.total_points) > 0
    || toNumber(row.live_points) > 0
    || toNumber(row.points_from_goals) > 0
    || toNumber(row.points_from_blows) > 0
    || toNumber(row.points_from_wins) > 0
    || toNumber(row.bonus_scia) > 0
  );

const hasMeaningfulFantaPlayers = (rows: SupabaseFantaPlayerStanding[]): boolean =>
  rows.some((row) =>
    toNumber(row.total_points) > 0
    || toNumber(row.live_points) > 0
    || toNumber(row.points_from_goals) > 0
    || toNumber(row.points_from_blows) > 0
    || toNumber(row.points_from_wins) > 0
    || toNumber(row.bonus_scia) > 0
  );

const hasMeaningfulFantaRosterRows = (rows: any[]): boolean =>
  rows.some((row) =>
    toNumber(row.total_points) > 0
    || toNumber(row.live_points) > 0
    || toNumber(row.points_from_goals) > 0
    || toNumber(row.points_from_blows) > 0
    || toNumber(row.points_from_wins) > 0
    || toNumber(row.points_from_scia) > 0
    || toNumber(row.bonus_scia) > 0
  );

export const fetchFantaStandings = async (): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId || config.activeTournamentResultsOnly) return [];

  const rows = await fetchJson<SupabaseFantaStanding[]>(
    `${restUrl(cfg, 'fanta_live_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=*&order=total_points.desc,players_in_game.desc,points_from_wins.desc,points_from_goals.desc`,
    buildHeaders(cfg),
    'fetchFantaStandings',
  ) || [];

  if (rows.length && hasMeaningfulFantaStandings(rows)) return rows;

  const fallback = await fetchComputedFantaFallback(cfg, config.activeTournamentId);
  if (fallback.standings.length && (!rows.length || fallback.hasLiveProgress)) {
    return fallback.standings.sort(compareFantaStandings);
  }
  return rows;
};

export const fetchFantaPlayerStandings = async (): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId || config.activeTournamentResultsOnly) return [];

  const rows = await fetchJson<SupabaseFantaPlayerStanding[]>(
    `${restUrl(cfg, 'fanta_player_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=*&order=total_points.desc,points_from_wins.desc,points_from_goals.desc`,
    buildHeaders(cfg),
    'fetchFantaPlayerStandings',
  ) || [];

  if (rows.length && hasMeaningfulFantaPlayers(rows)) return rows;

  const fallback = await fetchComputedFantaFallback(cfg, config.activeTournamentId);
  if (fallback.players.length && (!rows.length || fallback.hasLiveProgress)) {
    return fallback.players.sort((left, right) => {
      if (toNumber(right.total_points) !== toNumber(left.total_points)) return toNumber(right.total_points) - toNumber(left.total_points);
      if (toNumber(right.points_from_wins) !== toNumber(left.points_from_wins)) return toNumber(right.points_from_wins) - toNumber(left.points_from_wins);
      return toNumber(right.points_from_goals) - toNumber(left.points_from_goals);
    });
  }
  return rows;
};

export const fetchFantaTeamDetail = async (teamId: string): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg || !teamId) return [];

  const rows = await fetchJson<any[]>(
    `${restUrl(cfg, 'fanta_roster_live_rows')}?team_id=eq.${encode(teamId)}&select=*&order=role.asc,player_name.asc`,
    buildHeaders(cfg),
    'fetchFantaTeamDetail',
  ) || [];

  if (rows.length && hasMeaningfulFantaRosterRows(rows)) return rows;

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId || config.activeTournamentResultsOnly) return rows;

  const fallback = await fetchComputedFantaFallback(cfg, config.activeTournamentId);
  const fallbackRows = fallback.rosterRows
    .filter((row) => row.team_id === teamId)
    .sort((left, right) =>
      String(left.role || '').localeCompare(String(right.role || ''))
      || String(left.player_name || '').localeCompare(String(right.player_name || ''), 'it', { sensitivity: 'base' })
    );

  if (fallbackRows.length && (!rows.length || fallback.hasLiveProgress)) return fallbackRows;
  return rows;
};

export const fetchFantaPlayerContributions = async (playerId: string): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg || !playerId) return [];

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId || config.activeTournamentResultsOnly) return [];

  const [stats, matches, teams] = await Promise.all([
    fetchJson<SupabasePublicMatchStat[]>(
      `${restUrl(cfg, 'public_tournament_match_stats')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=match_id,team_id,player_name,canestri,soffi&order=match_id.asc`,
      buildHeaders(cfg),
      'fetchFantaPlayerContributionsStats',
    ),
    fetchJson<SupabasePublicTournamentMatch[]>(
      `${restUrl(cfg, 'public_tournament_matches')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=id,code,round,round_name,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden&order=order_index.asc`,
      buildHeaders(cfg),
      'fetchFantaPlayerContributionsMatches',
    ),
    fetchJson<SupabasePublicTournamentTeam[]>(
      `${restUrl(cfg, 'public_tournament_teams')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=id,name`,
      buildHeaders(cfg),
      'fetchFantaPlayerContributionsTeams',
    ),
  ]);

  const playerLabel = getPlayerKeyLabel(playerId);
  const matchesById = new Map((matches || []).map((match) => [match.id, match]));
  const teamNameById = new Map((teams || []).map((team) => [team.id, team.name]));

  return (stats || [])
    .filter((row) => getPlayerKey(row.player_name || '', 'ND') === playerId || String(row.player_name || '').trim() === playerLabel.name)
    .map((row) => {
      const match = matchesById.get(row.match_id) || null;
      const teamAName = match?.team_a_id ? teamNameById.get(match.team_a_id) || match.team_a_id : null;
      const teamBName = match?.team_b_id ? teamNameById.get(match.team_b_id) || match.team_b_id : null;
      const opponentId = match?.team_a_id === row.team_id ? match?.team_b_id : match?.team_a_id;
      const opponentName = opponentId ? teamNameById.get(opponentId) || opponentId : 'BYE';

      return {
        id: `${row.match_id}-${row.team_id}-${row.player_name}`,
        match_id: row.match_id,
        team_id: row.team_id,
        team_name: teamNameById.get(row.team_id) || row.team_id,
        player_name: row.player_name,
        opponent_team_id: opponentId || null,
        opponent_team_name: opponentName,
        canestri: row.canestri || 0,
        soffi: row.soffi || 0,
        tournament_matches: match ? {
          ...match,
          team_a_name: teamAName,
          team_b_name: teamBName,
        } : null,
      };
    });
};
