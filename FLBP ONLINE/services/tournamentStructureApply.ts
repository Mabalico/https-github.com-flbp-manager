import type { Match, TournamentData } from '../types';
import { validateDraftBeforeApply } from './tournamentStructureEligibility';
import { diffTournamentStructure } from './tournamentStructureDiff';
import { finalizeDraftSnapshotForApply } from './tournamentStructureDraft';
import { cloneSnapshot } from './tournamentStructureSelectors';
import type {
  DraftValidationResult,
  TournamentStructureDiffResult,
  TournamentStructureSnapshot,
} from './tournamentStructureTypes';

export interface PreparedTournamentStructureApply {
  snapshot: TournamentStructureSnapshot;
  tournament: TournamentData;
  matches: Match[];
  validation: DraftValidationResult;
  diff: TournamentStructureDiffResult;
}

export const prepareTournamentStructureApply = (
  original: TournamentStructureSnapshot,
  present: TournamentStructureSnapshot
): PreparedTournamentStructureApply => {
  const snapshot = finalizeDraftSnapshotForApply(cloneSnapshot(present));
  const validation = validateDraftBeforeApply(original, snapshot);
  const diff = diffTournamentStructure(original, snapshot);

  return {
    snapshot,
    tournament: snapshot.tournament,
    matches: snapshot.matches,
    validation,
    diff,
  };
};
