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
import { getPlayerSupabaseAccessToken, getSupabaseConfig } from '../supabaseRest';
import { fetchWithDevRequestPerf } from '../devRequestPerf';
import { getPlayerKey } from '../playerIdentity';

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
}

interface SupabasePublicTournamentTeam {
  id: string;
  name: string;
  player1?: string | null;
  player2?: string | null;
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
  total_points?: number | null;
  points_from_goals?: number | null;
  points_from_blows?: number | null;
  points_from_wins?: number | null;
  bonus_scia?: number | null;
  players_in_game?: number | null;
}

interface SupabaseFantaPlayerStanding {
  tournament_id: string;
  player_key: string;
  player_name?: string | null;
  real_team_name?: string | null;
  total_points?: number | null;
  points_from_goals?: number | null;
  points_from_blows?: number | null;
  points_from_wins?: number | null;
  bonus_scia?: number | null;
}

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
const publicTournamentsSelect = 'id,name,status,start_date,updated_at';

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
    `${restUrl(cfg, 'public_tournament_matches')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(tournamentId)}&hidden=eq.false&is_bye=eq.false&or=(played.eq.true,status.in.(playing,finished))&select=id&limit=1`,
    buildHeaders(cfg),
    'fetchFantaTournamentStarted',
  );
  return !!rows?.length;
};

export const fetchFantaConfig = async (): Promise<FantaConfig | null> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

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
  return {
    activeTournamentId,
    activeTournamentName: activeTournament?.name,
    isLockActive: tournamentStarted,
    registrationOpen: !tournamentStarted,
    registrationOpenFlag: true,
    manualLockActive: false,
    tournamentStarted,
    lockReason: tournamentStarted ? 'first_match_started' : null,
    updatedAt: configured?.updated_at,
  };
};

export const fetchFantaTournamentTeams = async (
  tournamentId?: string,
): Promise<FantaBuilderTeamGroup[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const activeTournamentId = tournamentId || (await fetchFantaConfig())?.activeTournamentId || '';
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
  const token = getPlayerSupabaseAccessToken();
  if (!cfg || !token) return null;

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId) return null;

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

export const saveFantaTeam = async (
  _userId: string,
  teamName: string,
  lineup: { player: FantaPlayer; role: FantaLineupSlot['role'] }[],
): Promise<boolean> => {
  const cfg = getSupabaseConfig();
  const token = getPlayerSupabaseAccessToken();
  if (!cfg || !token) return false;

  const config = await fetchFantaConfig();
  const name = teamName.trim();
  const captainCount = lineup.filter((item) => item.role === 'captain').length;
  const defenderCount = lineup.filter((item) => item.role === 'defender').length;
  const distinctPlayers = new Set(lineup.map((item) => item.player.id)).size;

  if (!config?.activeTournamentId || config.isLockActive || !config.registrationOpen) return false;
  if (!name || lineup.length !== 4 || distinctPlayers !== 4 || captainCount !== 1 || defenderCount !== 2) return false;

  const rosterPayload = lineup.map((item) => ({
    player_id: item.player.id,
    player_name: item.player.playerName,
    real_team_id: item.player.realTeamId || null,
    real_team_name: item.player.realTeamName,
    role: item.role,
  }));

  try {
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
    return res.ok;
  } catch {
    return false;
  }
};

export const fetchFantaStandings = async (): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId) return [];

  return await fetchJson<any[]>(
    `${restUrl(cfg, 'fanta_live_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=*&order=total_points.desc,players_in_game.desc,points_from_wins.desc,points_from_goals.desc`,
    buildHeaders(cfg),
    'fetchFantaStandings',
  ) || [];
};

export const fetchFantaPlayerStandings = async (): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId) return [];

  return await fetchJson<any[]>(
    `${restUrl(cfg, 'fanta_player_standings')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&select=*&order=total_points.desc,points_from_wins.desc,points_from_goals.desc`,
    buildHeaders(cfg),
    'fetchFantaPlayerStandings',
  ) || [];
};

export const fetchFantaTeamDetail = async (teamId: string): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg || !teamId) return [];

  return await fetchJson<any[]>(
    `${restUrl(cfg, 'fanta_roster_live_rows')}?team_id=eq.${encode(teamId)}&select=*&order=role.asc,player_name.asc`,
    buildHeaders(cfg),
    'fetchFantaTeamDetail',
  ) || [];
};

export const fetchFantaPlayerContributions = async (playerId: string): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg || !playerId) return [];

  const config = await fetchFantaConfig();
  if (!config?.activeTournamentId) return [];

  return await fetchJson<any[]>(
    `${restUrl(cfg, 'tournament_match_stats')}?workspace_id=eq.${encode(cfg.workspaceId)}&tournament_id=eq.${encode(config.activeTournamentId)}&player_key=eq.${encode(playerId)}&select=*,tournament_matches(*)&order=match_id.asc`,
    buildHeaders(cfg),
    'fetchFantaPlayerContributions',
  ) || [];
};
