import React from 'react';
import { dictionary } from '../../services/i18n/it';
import type { FantaConfig, FantaBuilderTeamGroup, FantaLineupSlot } from '../../services/fantabeerpong/types';
export { IntegrationsSubTab } from '../../components/admin/tabs/data/EditionWorkspace';

// Only destination views/IO are fixtures: DataTab, EditionWorkspace, editor,
// confirmation modal and FantaTeamBuilder execute their actual React code.
export const AccountsSubTab = () => <p>Destination accounts</p>;
export const ViewsSubTab = () => <p>Destination views</p>;
export const TrafficSubTab = () => <p>Destination traffic</p>;
export const BackupSyncPanel = () => <p>Destination persistence</p>;
export const DbSyncPanel = () => null;
export const ArchiveSubTab = () => null;
export const useTranslation = () => ({ t: (key: string) => dictionary[key] ?? key });
export const PLAYER_PRESENCE_KEY = 'flbp_player_presence_v1';
export const PLAYER_APP_CHANGE_EVENT = 'flbp-player-preview-change';
export const emitFantaAppChange = () => {};
export const readPlayerPresenceSnapshot = () => JSON.parse(localStorage.getItem(PLAYER_PRESENCE_KEY) || 'null') as { accountId: string; mode: 'live' | 'preview'; lastActiveAt: number } | null;

type SavedRoster = { team: { name: string }; roster: Array<{ player_id: string; role: string }> };
export const draftFixture = {
  fetches: 0, saves: [] as Array<{ accountId: string; name: string; lineup: FantaLineupSlot[] }>,
  pendingReads: [] as Array<() => void>, holdReads: false,
  pendingSaves: [] as Array<(success: boolean) => void>, holdSaves: false, saveSuccess: false, backCalls: 0,
  pendingCommit: null as null | ((success: boolean) => void),
  commitAttempts: 0,
};
declare global { interface Window { draftFixture: typeof draftFixture } }
window.draftFixture = draftFixture;

export const fetchFantaConfig = async (): Promise<FantaConfig> => ({
  activeTournamentId: 'fixture-edition', activeTournamentName: 'Coppa fixture', fantaEnabled: true,
  isLockActive: false, registrationOpen: true,
});
export const fetchFantaTournamentTeams = async (): Promise<FantaBuilderTeamGroup[]> => [{
  id: 'fixture-team', teamName: 'Squadra reale fixture',
  players: Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}`, playerName: `Giocatore ${i + 1}`, realTeamName: 'Squadra reale fixture', status: 'live' as const, trend: 'steady' as const, note: '' })),
}];
export const fetchUserFantaTeam = async (accountId: string): Promise<SavedRoster | null> => {
  draftFixture.fetches++;
  const result = new URLSearchParams(location.search).get('roster') === 'new' ? null : {
    team: { name: `Salvata ${accountId}` },
    roster: ['captain', 'defender', 'defender', 'starter'].map((role, i) => ({ player_id: `p${i + 1}`, role })),
  };
  if (draftFixture.holdReads) await new Promise<void>(resolve => draftFixture.pendingReads.push(resolve));
  return result;
};
export const fetchFantaTeamById = async () => ({ team: { name: 'Confirmed fixture' }, roster: [] });
export const saveFantaTeamWithResult = async (accountId: string, name: string, lineup: FantaLineupSlot[]) => {
  draftFixture.saves.push({ accountId, name, lineup });
  const success = draftFixture.holdSaves ? await new Promise<boolean>(resolve => draftFixture.pendingSaves.push(resolve)) : draftFixture.saveSuccess;
  return success ? { ok: true as const, teamId: 'fixture-saved' } : { ok: false as const, message: 'Errore simulato: bozza conservata' };
};
