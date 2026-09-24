import React from 'react';
import { dictionary } from '../../services/i18n/it';

export const useTranslation = () => ({ t: (key: string) => dictionary[key] ?? key });
export const FANTA_APP_CHANGE_EVENT = 'fixture:fanta-change';
export const PLAYER_APP_CHANGE_EVENT = 'fixture:player-change';
export const readPlayerPresenceSnapshot = () => null;
export const invalidateFantaConfigCache = () => {};
export const fetchPendingFantaRosterChangeNotices = async () => [];
export const markFantaRosterChangeNoticesSeen = async () => { throw new Error('Unexpected fixture write'); };
export const fetchFantaConfig = async () => {
  const mode = new URLSearchParams(window.location.search).get('mode') || 'archived';
  return {
    fantaEnabled: mode !== 'disabled', activeTournamentResultsOnly: mode === 'results-only',
    lockReason: mode === 'disabled' ? 'fanta_disabled' : mode === 'active' ? null : 'tournament_archived',
    isPreTournament: false,
  };
};
export const fetchFantaArchivedEditions = async () => [{
  tournamentId: 'fixture-archive', tournamentName: 'Coppa Fixture', dateLabel: '24/09/2026',
  winnerTeamName: 'Squadra Fixture', winnerPoints: 42, teamsCount: 3,
}];

const unrelatedView = () => { throw new Error('Unexpected unrelated Fanta view'); };
export const FantaMyTeamSection = unrelatedView;
export const FantaGeneralStandingsSection = unrelatedView;
export const FantaPlayersStandingsSection = unrelatedView;
export const FantaTeamDetail = unrelatedView;
export const FantaPlayerDetail = unrelatedView;
export const FantaTeamBuilder = unrelatedView;
export const FantaOverviewSection = () => <p>Panoramica fixture</p>;
export const FantaHistoryEditionDetail = ({ editionId, onBack }: { editionId: string; onBack: () => void }) =>
  <section><h2>Edizione {editionId}</h2><button onClick={onBack}>Torna allo storico fixture</button></section>;
