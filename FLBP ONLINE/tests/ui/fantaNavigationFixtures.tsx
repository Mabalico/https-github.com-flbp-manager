import React from 'react';
import { coerceAppState } from '../../services/storageService';
import type { AppStateRepository } from '../../services/repository/AppStateRepository';
import type { TvProjection } from '../../types';

export {
  fetchFantaConfig, fetchFantaArchivedEditions, fetchPendingFantaRosterChangeNotices,
  invalidateFantaConfigCache, markFantaRosterChangeNoticesSeen,
} from './fantaArchivedRulesFixtures';

let state = coerceAppState({});
const repository: AppStateRepository = {
  source: 'local',
  load: () => state,
  save: next => { state = next; },
};
export const getAppStateRepository = () => repository;

// Only the Admin view is substituted: App's onEnterTv callback remains real.
export const AdminDashboard = ({ onEnterTv }: { onEnterTv: (mode: TvProjection) => void }) =>
  <section><h1>Admin fixture</h1><button onClick={() => onEnterTv('groups')}>Apri TV fixture</button></section>;
