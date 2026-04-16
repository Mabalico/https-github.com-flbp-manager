import type { FantaTeam, FantaPlayer, FantaConfig, FantaMyTeamPlayer, FantaLineupSlot } from './types';
import { getSupabaseConfig, getPlayerSupabaseAccessToken } from '../supabaseRest';
import { fetchWithDevRequestPerf } from '../devRequestPerf';

/**
 * FantaBeerpong Persistence Service (Supabase Integration)
 */

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
  user_id: string;
  name: string;
  created_at: string;
}

interface SupabaseFantaRoster {
  id: string;
  team_id: string;
  player_id: string;
  role: 'captain' | 'defender' | 'starter';
}

const restUrl = (cfg: { url: string }, path: string) => {
  const base = cfg.url.replace(/\/$/, '');
  return `${base}/rest/v1/${path}`;
};

const buildHeaders = (cfg: { anonKey: string }, token?: string | null) => {
  const auth = token || cfg.anonKey;
  return {
    'apikey': cfg.anonKey,
    'Authorization': `Bearer ${auth}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
};

export const fetchFantaConfig = async (): Promise<FantaConfig | null> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  try {
    const res = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_config')}?workspace_id=eq.${cfg.workspaceId}&select=*`, {
      method: 'GET',
      headers: buildHeaders(cfg)
    }, { source: 'fetchFantaConfig' });

    if (!res.ok) return null;
    const data = await res.json() as SupabaseFantaConfig[];
    if (!data.length) return null;

    return {
      activeTournamentId: data[0].active_tournament_id,
      isLockActive: data[0].is_lock_active,
      registrationOpen: data[0].registration_open
    };
  } catch {
    return null;
  }
};

export const fetchUserFantaTeam = async (userId: string): Promise<{ team: SupabaseFantaTeam, roster: SupabaseFantaRoster[] } | null> => {
  const cfg = getSupabaseConfig();
  const token = getPlayerSupabaseAccessToken();
  if (!cfg || !token) return null;

  try {
    // 1. Fetch Team
    const teamRes = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_teams')}?user_id=eq.${userId}&workspace_id=eq.${cfg.workspaceId}&select=*`, {
      method: 'GET',
      headers: buildHeaders(cfg, token)
    }, { source: 'fetchUserFantaTeam' });

    if (!teamRes.ok) return null;
    const teams = await teamRes.json() as SupabaseFantaTeam[];
    if (!teams.length) return null;

    const team = teams[0];

    // 2. Fetch Roster
    const rosterRes = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_rosters')}?team_id=eq.${team.id}&select=*`, {
      method: 'GET',
      headers: buildHeaders(cfg, token)
    }, { source: 'fetchUserFantaRoster' });

    if (!rosterRes.ok) return { team, roster: [] };
    const roster = await rosterRes.json() as SupabaseFantaRoster[];

    return { team, roster };
  } catch {
    return null;
  }
};

export const saveFantaTeam = async (
  userId: string, 
  teamName: string, 
  lineup: { player: FantaPlayer, role: FantaLineupSlot['role'] }[]
): Promise<boolean> => {
  const cfg = getSupabaseConfig();
  const token = getPlayerSupabaseAccessToken();
  if (!cfg || !token) return false;

  try {
    // 1. Upsert Team
    const teamRes = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_teams')}`, {
      method: 'POST',
      headers: { ...buildHeaders(cfg, token), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        workspace_id: cfg.workspaceId,
        user_id: userId,
        name: teamName
      })
    }, { source: 'saveFantaTeam' });

    if (!teamRes.ok) return false;
    const teams = await teamRes.json() as SupabaseFantaTeam[];
    const teamId = teams[0].id;

    // 2. Delete old roster
    await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_rosters')}?team_id=eq.${teamId}`, {
      method: 'DELETE',
      headers: buildHeaders(cfg, token)
    }, { source: 'deleteOldRoster' });

    // 3. Insert new roster
    const rosterPayload = lineup.map(item => ({
      team_id: teamId,
      player_id: item.player.id,
      role: item.role
    }));

    const rosterRes = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_rosters')}`, {
      method: 'POST',
      headers: buildHeaders(cfg, token),
      body: JSON.stringify(rosterPayload)
    }, { source: 'insertNewRoster' });

    return rosterRes.ok;
  } catch {
    return false;
  }
};

export const fetchFantaStandings = async (): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  try {
    const res = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_live_standings')}?select=*`, {
      method: 'GET',
      headers: buildHeaders(cfg)
    }, { source: 'fetchFantaStandings' });

    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

export const fetchFantaPlayerStandings = async (): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  try {
    const res = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_player_standings')}?select=*`, {
      method: 'GET',
      headers: buildHeaders(cfg)
    }, { source: 'fetchFantaPlayerStandings' });

    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

export const fetchFantaTeamDetail = async (teamId: string): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];
  try {
    const res = await fetchWithDevRequestPerf(`${restUrl(cfg, 'fanta_live_standings')}?team_id=eq.${teamId}&select=*`, {
      method: 'GET',
      headers: buildHeaders(cfg)
    }, { source: 'fetchFantaTeamDetail' });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

export const fetchFantaPlayerContributions = async (playerId: string): Promise<any[]> => {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];
  try {
    const res = await fetchWithDevRequestPerf(`${restUrl(cfg, 'tournament_match_stats')}?player_key=eq.${playerId}&select=*,tournament_matches(*)`, {
      method: 'GET',
      headers: buildHeaders(cfg)
    }, { source: 'fetchFantaPlayerContributions' });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};
