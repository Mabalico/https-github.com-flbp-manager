import { useMemo, useReducer } from 'react';
import { validateDraftBeforeApply } from './tournamentStructureEligibility';
import { diffTournamentStructure } from './tournamentStructureDiff';
import { applyStructuralOperation } from './tournamentStructureOperations';
import {
  buildBracketRoundsFromMatches,
  cloneSnapshot,
  syncTournamentRosterFromStructure,
} from './tournamentStructureSelectors';
import type {
  DraftValidationResult,
  StructuralOperation,
  TournamentStructureDiffResult,
  TournamentStructureDraftState,
  TournamentStructureSnapshot,
} from './tournamentStructureTypes';

const cloneMatchList = <T extends { [key: string]: any }>(matches: T[]) => matches.map((match) => ({ ...match }));

export const createTournamentStructureDraftState = (snapshot: TournamentStructureSnapshot): TournamentStructureDraftState => ({
  original: cloneSnapshot(snapshot),
  present: cloneSnapshot(snapshot),
  past: [],
  future: [],
  log: [],
  lastResult: null,
});

type DraftReducerAction =
  | ReturnType<typeof makeTournamentStructureApplyOperationAction>
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET' }
  | { type: 'REBASE'; snapshot: TournamentStructureSnapshot }
  | { type: 'CLEAR_RESULT' };

export const makeTournamentStructureApplyOperationAction = (result: ReturnType<typeof applyStructuralOperation>) => ({
  type: 'APPLY_OPERATION_RESULT' as const,
  result,
});

export const tournamentStructureDraftReducer = (
  state: TournamentStructureDraftState,
  action: DraftReducerAction
): TournamentStructureDraftState => {
  switch (action.type) {
    case 'APPLY_OPERATION_RESULT': {
      if (!action.result.ok || !action.result.nextSnapshot || !action.result.entry) {
        return { ...state, lastResult: action.result };
      }
      return {
        ...state,
        past: [...state.past, { snapshot: cloneSnapshot(state.present), entry: action.result.entry }],
        future: [],
        present: cloneSnapshot(action.result.nextSnapshot),
        log: [...state.log, action.result.entry],
        lastResult: action.result,
      };
    }
    case 'UNDO': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        future: [{ snapshot: cloneSnapshot(state.present), entry: prev.entry }, ...state.future],
        present: cloneSnapshot(prev.snapshot),
        lastResult: null,
      };
    }
    case 'REDO': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, { snapshot: cloneSnapshot(state.present), entry: next.entry }],
        future: state.future.slice(1),
        present: cloneSnapshot(next.snapshot),
        lastResult: null,
      };
    }
    case 'RESET':
      return createTournamentStructureDraftState(state.original);
    case 'REBASE':
      return createTournamentStructureDraftState(action.snapshot);
    case 'CLEAR_RESULT':
      return { ...state, lastResult: null };
    default:
      return state;
  }
};

export const applyOperationToTournamentStructureDraft = (
  state: TournamentStructureDraftState,
  operation: StructuralOperation
) => tournamentStructureDraftReducer(state, makeTournamentStructureApplyOperationAction(applyStructuralOperation(state.present, operation)));

export const undoTournamentStructureDraft = (state: TournamentStructureDraftState) =>
  tournamentStructureDraftReducer(state, { type: 'UNDO' });

export const redoTournamentStructureDraft = (state: TournamentStructureDraftState) =>
  tournamentStructureDraftReducer(state, { type: 'REDO' });

export const resetTournamentStructureDraft = (state: TournamentStructureDraftState) =>
  tournamentStructureDraftReducer(state, { type: 'RESET' });

export const useTournamentStructureDraft = (snapshot: TournamentStructureSnapshot) => {
  const [state, dispatch] = useReducer(tournamentStructureDraftReducer, snapshot, createTournamentStructureDraftState);

  const validation: DraftValidationResult = useMemo(
    () => validateDraftBeforeApply(state.original, state.present),
    [state.original, state.present]
  );
  const diff: TournamentStructureDiffResult = useMemo(
    () => diffTournamentStructure(state.original, state.present),
    [state.original, state.present]
  );

  return {
    state,
    validation,
    diff,
    applyOperation: (operation: StructuralOperation) => {
      const result = applyStructuralOperation(state.present, operation);
      dispatch(makeTournamentStructureApplyOperationAction(result));
      return result;
    },
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    reset: () => dispatch({ type: 'RESET' }),
    rebase: (nextSnapshot: TournamentStructureSnapshot) => dispatch({ type: 'REBASE', snapshot: nextSnapshot }),
    clearResult: () => dispatch({ type: 'CLEAR_RESULT' }),
  };
};

export const finalizeDraftSnapshotForApply = (snapshot: TournamentStructureSnapshot): TournamentStructureSnapshot => {
  const next = syncTournamentRosterFromStructure(snapshot);
  next.tournament.matches = cloneMatchList(next.matches);
  next.tournament.rounds = buildBracketRoundsFromMatches(next.matches);
  return next;
};
