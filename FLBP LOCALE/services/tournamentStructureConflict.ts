import type { AppState } from './storageService';
import { coerceAppState } from './storageService';
import { getRemoteBaseUpdatedAt, getSupabaseConfig, pullWorkspaceState, pullWorkspaceStateUpdatedAt } from './supabaseRest';
import type { TournamentStructureConflictResult } from './tournamentStructureTypes';

export interface TournamentStructureReloadResult {
  ok: boolean;
  status: 200 | 404 | 503;
  state?: AppState;
  etag?: string | null;
  message?: string;
}

export const getTournamentStructureIfMatch = (): string | null => getRemoteBaseUpdatedAt();

export const preflightTournamentStructureConflict = async (): Promise<TournamentStructureConflictResult> => {
  const cfg = getSupabaseConfig();
  const ifMatch = getTournamentStructureIfMatch();
  if (!cfg) {
    return { ok: true, status: 200, etag: null, ifMatch };
  }

  try {
    const etag = await pullWorkspaceStateUpdatedAt();
    if (!etag || !ifMatch || etag === ifMatch) {
      return { ok: true, status: 200, etag, ifMatch };
    }

    return {
      ok: false,
      status: 409,
      etag,
      ifMatch,
      message:
        'Il torneo è stato aggiornato da un altro admin. Ricarica lo stato attuale oppure scarta la bozza prima di applicare.',
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 503,
      etag: null,
      ifMatch,
      message: error?.message || 'Impossibile verificare lo stato remoto del torneo.',
    };
  }
};

export const reloadRemoteTournamentStructureState = async (): Promise<TournamentStructureReloadResult> => {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      etag: null,
      message: 'Supabase non configurato: impossibile ricaricare lo stato remoto.',
    };
  }

  try {
    const row = await pullWorkspaceState();
    if (!row?.state) {
      return {
        ok: false,
        status: 404,
        etag: row?.updated_at || null,
        message: 'Nessuno snapshot remoto disponibile per questo workspace.',
      };
    }
    return {
      ok: true,
      status: 200,
      state: coerceAppState(row.state),
      etag: row.updated_at || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 503,
      etag: null,
      message: error?.message || 'Impossibile scaricare lo stato remoto corrente.',
    };
  }
};
