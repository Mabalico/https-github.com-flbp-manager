import React from 'react';
import type { Team } from '../../types';
import type { AppState } from '../../services/storageService';
import { getPlayerKey, pickPlayerIdentityValue, resolvePlayerKey } from '../../services/playerIdentity';
import {
  cancelPreviewTeamCall,
  getPreviewCallAvailabilityForTeam,
  mapSupabaseCallRowToPlayerCallRequest,
  PLAYER_APP_CHANGE_EVENT,
  queuePreviewTeamCall,
  type PlayerCallRequest,
} from '../../services/playerAppService';
import { isLocalOnlyMode } from '../../services/repository/featureFlags';
import {
  callPlayerAppTeam,
  cancelPlayerAppCall,
  dispatchPlayerCallPush,
  getSupabaseConfig,
  pullAdminPlayerCalls,
  pullAdminPlayerCallTargets,
} from '../../services/supabaseRest';

type LiveCallTarget = {
  userId: string;
  playerId: string;
  playerName: string;
};

export type AdminTeamCallMode =
  | 'local_only'
  | 'supabase_missing'
  | 'backend_pending'
  | 'admin_missing'
  | 'live_ready';

export type AdminTeamCallStatus = 'idle' | 'ringing' | 'acknowledged';

export interface AdminTeamCallMeta {
  disabled: boolean;
  status: AdminTeamCallStatus;
  activeCall: PlayerCallRequest | null;
  liveTarget: LiveCallTarget | undefined;
}

export const useAdminTeamCalls = (state: AppState) => {
  const [callRefreshNonce, setCallRefreshNonce] = React.useState(0);
  const [liveCallMode, setLiveCallMode] = React.useState<AdminTeamCallMode>(
    isLocalOnlyMode() ? 'local_only' : (getSupabaseConfig() ? 'backend_pending' : 'supabase_missing')
  );
  const [liveCallTargets, setLiveCallTargets] = React.useState<Record<string, LiveCallTarget>>({});
  const [liveTeamCalls, setLiveTeamCalls] = React.useState<Record<string, PlayerCallRequest>>({});

  React.useEffect(() => {
    const handler = () => setCallRefreshNonce((value) => value + 1);
    window.addEventListener('storage', handler);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadLiveCalls = async () => {
      if (isLocalOnlyMode()) {
        if (!cancelled) {
          setLiveCallMode('local_only');
          setLiveCallTargets({});
          setLiveTeamCalls({});
        }
        return;
      }
      if (!getSupabaseConfig()) {
        if (!cancelled) {
          setLiveCallMode('supabase_missing');
          setLiveCallTargets({});
          setLiveTeamCalls({});
        }
        return;
      }

      const tournament = state.tournament;
      if (!tournament) {
        if (!cancelled) {
          setLiveCallMode('backend_pending');
          setLiveCallTargets({});
          setLiveTeamCalls({});
        }
        return;
      }

      const teams = Array.isArray(tournament.teams) ? tournament.teams : [];
      const teamCanonicalIds = new Map<string, string[]>();
      const allCanonicalIds = new Set<string>();

      teams.forEach((team) => {
        const ids: string[] = [];
        const appendCanonical = (playerName?: string, birthDate?: string | null, yob?: string | number | null) => {
          const safeName = String(playerName || '').trim();
          if (!safeName) return;
          const canonical = resolvePlayerKey(state, getPlayerKey(safeName, pickPlayerIdentityValue(birthDate, yob)));
          if (!canonical) return;
          ids.push(canonical);
          allCanonicalIds.add(canonical);
        };
        appendCanonical(team.player1, (team as any).player1BirthDate, team.player1YoB);
        appendCanonical(team.player2, (team as any).player2BirthDate, team.player2YoB);
        teamCanonicalIds.set(team.id, ids);
      });

      try {
        const [targetRows, activeRows] = await Promise.all([
          allCanonicalIds.size ? pullAdminPlayerCallTargets(Array.from(allCanonicalIds)) : Promise.resolve([]),
          pullAdminPlayerCalls({ tournamentId: tournament.id, statuses: ['ringing', 'acknowledged'] }),
        ]);
        if (cancelled) return;

        const targetsByCanonical = new Map<string, LiveCallTarget>();
        targetRows.forEach((row) => {
          const canonical = String(row.canonical_player_id || '').trim();
          const userId = String(row.user_id || '').trim();
          if (!canonical || !userId || targetsByCanonical.has(canonical)) return;
          const playerName = String(row.canonical_player_name || `${row.last_name || ''} ${row.first_name || ''}`).trim();
          targetsByCanonical.set(canonical, {
            userId,
            playerId: canonical,
            playerName,
          });
        });

        const nextTargets: Record<string, LiveCallTarget> = {};
        teamCanonicalIds.forEach((ids, teamId) => {
          for (const id of ids) {
            const hit = targetsByCanonical.get(id);
            if (hit) {
              nextTargets[teamId] = hit;
              break;
            }
          }
        });

        const nextCalls: Record<string, PlayerCallRequest> = {};
        activeRows.forEach((row) => {
          const mapped = mapSupabaseCallRowToPlayerCallRequest(row);
          if (!mapped.teamId) return;
          if (!nextCalls[mapped.teamId] || nextCalls[mapped.teamId].requestedAt < mapped.requestedAt) {
            nextCalls[mapped.teamId] = mapped;
          }
        });

        setLiveCallTargets(nextTargets);
        setLiveTeamCalls(nextCalls);
        setLiveCallMode('live_ready');
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message || error || '');
        setLiveCallTargets({});
        setLiveTeamCalls({});
        if (/Sessione admin assente|Accesso admin richiesto|admin_users|workspace_state/i.test(message)) {
          setLiveCallMode('admin_missing');
        } else {
          setLiveCallMode('backend_pending');
        }
      }
    };

    void loadLiveCalls();
    return () => {
      cancelled = true;
    };
  }, [state, callRefreshNonce]);

  const getTeamCallMeta = React.useCallback((team?: Team): AdminTeamCallMeta => {
    if (!team?.id) {
      return {
        disabled: true,
        status: 'idle',
        activeCall: null,
        liveTarget: undefined,
      };
    }

    const useLiveCalls = liveCallMode === 'live_ready';
    const previewAvailability = getPreviewCallAvailabilityForTeam(state, team);
    const activeCall = useLiveCalls ? (liveTeamCalls[team.id] || null) : previewAvailability.activeCall;
    const liveTarget = liveCallTargets[team.id];
    const status = (activeCall?.status || 'idle') as AdminTeamCallStatus;

    return {
      disabled: useLiveCalls ? (!activeCall && !liveTarget) : (!activeCall && !previewAvailability.enabled),
      status,
      activeCall,
      liveTarget,
    };
  }, [liveCallMode, liveCallTargets, liveTeamCalls, state]);

  const triggerTeamCall = React.useCallback(async (team: Team) => {
    const meta = getTeamCallMeta(team);
    if (meta.disabled || !state.tournament) return;

    if (liveCallMode === 'live_ready') {
      if (meta.activeCall) {
        await cancelPlayerAppCall(meta.activeCall.id);
        try {
          await dispatchPlayerCallPush({
            callId: meta.activeCall.id,
            action: 'cancelled',
          });
        } catch (pushError) {
          console.warn('FLBP call push dispatch failed after cancel', pushError);
        }
      } else if (meta.liveTarget) {
        const result = await callPlayerAppTeam({
          tournamentId: state.tournament.id,
          teamId: team.id,
          teamName: team.name || team.id,
          targetUserId: meta.liveTarget.userId,
          targetPlayerId: meta.liveTarget.playerId,
          targetPlayerName: meta.liveTarget.playerName,
        });
        const callId = String((result as any)?.call_id || '').trim();
        if (callId) {
          try {
            await dispatchPlayerCallPush({
              callId,
              action: 'ringing',
            });
          } catch (pushError) {
            console.warn('FLBP call push dispatch failed after ring', pushError);
          }
        }
      }
    } else if (meta.activeCall) {
      cancelPreviewTeamCall(state.tournament.id, team.id);
    } else {
      queuePreviewTeamCall(state, team);
    }

    setCallRefreshNonce((value) => value + 1);
  }, [getTeamCallMeta, liveCallMode, state]);

  return {
    liveCallMode,
    getTeamCallMeta,
    triggerTeamCall,
    refreshTeamCalls: () => setCallRefreshNonce((value) => value + 1),
  };
};
