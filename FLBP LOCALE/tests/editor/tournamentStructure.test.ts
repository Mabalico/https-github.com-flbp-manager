import type { Group, Match, Team, TournamentData } from '../../types';
import {
  applyOperationToTournamentStructureDraft,
  createTournamentStructureDraftState,
  redoTournamentStructureDraft,
  resetTournamentStructureDraft,
  undoTournamentStructureDraft,
} from '../../services/tournamentStructureDraft';
import { diffTournamentStructure } from '../../services/tournamentStructureDiff';
import {
  canInsertTeamIntoBracketSlot,
  canReplaceBracketSlot,
  getTeamEligibility,
  validateDraftBeforeApply,
} from '../../services/tournamentStructureEligibility';
import { applyStructuralOperation } from '../../services/tournamentStructureOperations';
import { buildTournamentStructureSnapshot, cloneSnapshot, getSlotValue } from '../../services/tournamentStructureSelectors';

const makeTeam = (id: string, name = id): Team => ({
  id,
  name,
  player1: `${name} One`,
  player2: `${name} Two`,
});

const makeGroup = (id: string, name: string, teams: Team[]): Group => ({
  id,
  name,
  teams,
});

const makeGroupMatch = (id: string, groupName: string, teamAId: string, teamBId: string, overrides: Partial<Match> = {}): Match => ({
  id,
  phase: 'groups',
  groupName,
  teamAId,
  teamBId,
  scoreA: 0,
  scoreB: 0,
  played: false,
  status: 'scheduled',
  orderIndex: 1,
  ...overrides,
});

const makeBracketMatch = (
  id: string,
  round: number,
  teamAId: string | undefined,
  teamBId: string | undefined,
  overrides: Partial<Match> = {}
): Match => ({
  id,
  phase: 'bracket',
  round,
  roundName: `Round ${round}`,
  teamAId,
  teamBId,
  scoreA: 0,
  scoreB: 0,
  played: false,
  status: 'scheduled',
  orderIndex: Number(id.replace(/\D/g, '')) || 1,
  ...overrides,
});

const makeTournament = (
  id: string,
  type: TournamentData['type'],
  teams: Team[],
  groups: Group[] = [],
  matches: Match[] = []
): TournamentData => ({
  id,
  name: `Tournament ${id}`,
  type,
  startDate: '2026-03-22',
  teams,
  groups,
  matches,
  rounds: [],
  config: { advancingPerGroup: 2 },
});

const makeSnapshot = (tournament: TournamentData, matches: Match[], globalTeams: Team[] = tournament.teams) =>
  buildTournamentStructureSnapshot(tournament, matches, globalTeams);

const cases: Array<{ name: string; run: () => void }> = [];
const defineCase = (name: string, run: () => void) => {
  cases.push({ name, run });
};

const assertEqual = (actual: unknown, expected: unknown, message?: string) => {
  if (!Object.is(actual, expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const assertOk = (value: unknown, message?: string) => {
  if (!value) {
    throw new Error(message || 'Expected condition to be truthy.');
  }
};

defineCase('eligibility marks assigned, locked and eliminated teams correctly', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');

  const groupTournament = makeTournament(
    'groups',
    'round_robin',
    [a, b, c],
    [makeGroup('g1', 'Girone A', [a, b]), makeGroup('g2', 'Girone B', [c])],
    [makeGroupMatch('g1m1', 'Girone A', 'A', 'B', { played: true, status: 'finished', scoreA: 10, scoreB: 8 })]
  );
  const groupSnapshot = makeSnapshot(groupTournament, groupTournament.matches || []);

  assertEqual(getTeamEligibility(groupSnapshot, 'A', 'groups').status, 'locked_by_match');
  assertEqual(getTeamEligibility(groupSnapshot, 'C', 'groups').status, 'already_assigned');

  const eliminationTournament = makeTournament(
    'elim',
    'elimination',
    [a, b, c],
    [],
    [
      makeBracketMatch('r1m1', 1, 'A', 'B', { played: true, status: 'finished', scoreA: 10, scoreB: 5 }),
      makeBracketMatch('r1m2', 1, 'C', 'TBD'),
    ]
  );
  const eliminationSnapshot = makeSnapshot(eliminationTournament, eliminationTournament.matches || []);

  assertEqual(getTeamEligibility(eliminationSnapshot, 'B', 'bracket').status, 'eliminated');
  assertEqual(getTeamEligibility(eliminationSnapshot, 'C', 'bracket').status, 'already_assigned');
});

defineCase('bracket insert and replace checks respect BYE/TBD and locked matches', () => {
  const a = makeTeam('A', 'Alpha');
  const c = makeTeam('C', 'Charlie');
  const d = makeTeam('D', 'Delta');

  const tournament = makeTournament(
    'elim',
    'elimination',
    [a, c, d],
    [],
    [
      makeBracketMatch('r1m1', 1, 'A', 'TBD'),
      makeBracketMatch('r1m2', 1, 'C', 'BYE', { played: true, status: 'finished', hidden: true, isBye: true }),
    ]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  assertEqual(canInsertTeamIntoBracketSlot(snapshot, 'D', 'r1m1|B').allowed, true);
  assertEqual(canReplaceBracketSlot(snapshot, 'r1m2|A', 'D').allowed, false);
  assertEqual(canReplaceBracketSlot(snapshot, 'r1m2|A', 'D').reasonCode, 'slot_locked');
});

defineCase('move to placeholder preserves original placeholder type in source slot', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');

  const tournament = makeTournament(
    'elim',
    'elimination',
    [a, b, c],
    [],
    [
      makeBracketMatch('r1m1', 1, 'A', 'TBD'),
      makeBracketMatch('r1m2', 1, 'B', 'C'),
      makeBracketMatch('r2m1', 2, undefined, undefined),
    ]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  const result = applyStructuralOperation(snapshot, {
    type: 'MOVE_BRACKET_SLOT',
    fromSlotKey: 'r1m2|A',
    toSlotKey: 'r1m1|B',
  });

  assertEqual(result.ok, true);
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|B'), 'B');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m2|A'), 'TBD');
});

defineCase('validateDraftBeforeApply blocks duplicates and locked structural changes', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');

  const originalTournament = makeTournament(
    'groups',
    'round_robin',
    [a, b, c],
    [makeGroup('g1', 'Girone A', [a, b]), makeGroup('g2', 'Girone B', [c])],
    [makeGroupMatch('g1m1', 'Girone A', 'A', 'B', { played: true, status: 'finished', scoreA: 10, scoreB: 7 })]
  );
  const originalSnapshot = makeSnapshot(originalTournament, originalTournament.matches || []);
  const draftSnapshot = cloneSnapshot(originalSnapshot);

  draftSnapshot.tournament.groups = [
    makeGroup('g1', 'Girone A', [b, b]),
    makeGroup('g2', 'Girone B', [a]),
  ];

  const validation = validateDraftBeforeApply(originalSnapshot, draftSnapshot);
  const codes = validation.blockingErrors.map((issue) => issue.code);

  assertEqual(validation.canApply, false);
  assertOk(codes.includes('duplicate_in_groups'));
  assertOk(codes.includes('locked_by_group_match'));
});

defineCase('diff reports group and bracket changes from draft snapshots', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');
  const d = makeTeam('D', 'Delta');

  const tournament = makeTournament(
    'mixed',
    'groups_elimination',
    [a, b, c, d],
    [makeGroup('g1', 'Girone A', [a, b]), makeGroup('g2', 'Girone B', [c, d])],
    [
      makeGroupMatch('g1m1', 'Girone A', 'A', 'B'),
      makeGroupMatch('g2m1', 'Girone B', 'C', 'D'),
      makeBracketMatch('r1m1', 1, 'A', 'C'),
      makeBracketMatch('r1m2', 1, 'B', 'D'),
    ]
  );
  const originalSnapshot = makeSnapshot(tournament, tournament.matches || []);
  const draftSnapshot = cloneSnapshot(originalSnapshot);

  draftSnapshot.tournament.groups = [
    makeGroup('g1', 'Girone A', [a, d]),
    makeGroup('g2', 'Girone B', [c, b]),
  ];
  const bracketMatch = draftSnapshot.matches.find((match) => match.id === 'r1m1');
  if (!bracketMatch) throw new Error('Expected bracket match not found.');
  bracketMatch.teamBId = 'D';

  const diff = diffTournamentStructure(originalSnapshot, draftSnapshot);

  assertEqual(diff.changed, true);
  assertOk(diff.groupChanges.length >= 2);
  assertOk(diff.bracketChanges.some((change) => change.slotKey === 'r1m1|B'));
});

defineCase('can add a preliminary round before a full bracket and keep existing teams protected by BYE slots', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');
  const d = makeTeam('D', 'Delta');

  const tournament = makeTournament(
    'elim-expand',
    'elimination',
    [a, b, c, d],
    [],
    [
      makeBracketMatch('r1m1', 1, 'A', 'B'),
      makeBracketMatch('r1m2', 1, 'C', 'D'),
      makeBracketMatch('r2m1', 2, undefined, undefined),
    ]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  const result = applyStructuralOperation(snapshot, { type: 'ADD_PRELIMINARY_BRACKET_ROUND' });
  assertEqual(result.ok, true);
  const next = result.nextSnapshot!;
  const newRound1 = next.matches
    .filter((match) => match.phase === 'bracket' && (match.round || 1) === 1)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  const shiftedRound2 = next.matches.filter((match) => match.phase === 'bracket' && (match.round || 1) === 2);

  assertEqual(newRound1.length, 4);
  assertEqual(shiftedRound2.length, 2);
  assertEqual(getSlotValue(next, `${newRound1[0].id}|A`), 'A');
  assertEqual(getSlotValue(next, `${newRound1[1].id}|A`), 'B');
  assertEqual(getSlotValue(next, `${newRound1[2].id}|A`), 'C');
  assertEqual(getSlotValue(next, `${newRound1[3].id}|A`), 'D');
  assertEqual(getSlotValue(next, `${newRound1[0].id}|B`), 'BYE');
  assertEqual(getSlotValue(next, `${newRound1[1].id}|B`), 'BYE');
});

defineCase('adding a catalog team makes it immediately available for bracket insert operations', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');

  const tournament = makeTournament(
    'elim-pool',
    'elimination',
    [a, b],
    [],
    [makeBracketMatch('r1m1', 1, 'A', 'BYE'), makeBracketMatch('r1m2', 1, 'B', 'BYE')]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  const added = applyStructuralOperation(snapshot, {
    type: 'ADD_CATALOG_TEAM',
    team: makeTeam('C', 'Charlie'),
  });
  assertEqual(added.ok, true);
  assertOk((added.nextSnapshot?.catalogTeams || []).some((team) => team.id === 'C'));
  assertEqual(canInsertTeamIntoBracketSlot(added.nextSnapshot!, 'C', 'r1m1|B').allowed, true);
});

defineCase('draft reducer supports apply, undo, redo and reset', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');

  const tournament = makeTournament(
    'elim',
    'elimination',
    [a, b, c],
    [],
    [makeBracketMatch('r1m1', 1, 'A', 'TBD'), makeBracketMatch('r1m2', 1, 'B', 'BYE')]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  let draftState = createTournamentStructureDraftState(snapshot);
  draftState = applyOperationToTournamentStructureDraft(draftState, {
    type: 'INSERT_TEAM_IN_BRACKET_SLOT',
    teamId: 'C',
    slotKey: 'r1m1|B',
  });

  assertEqual(getSlotValue(draftState.present, 'r1m1|B'), 'C');
  assertEqual(draftState.past.length, 1);

  draftState = undoTournamentStructureDraft(draftState);
  assertEqual(getSlotValue(draftState.present, 'r1m1|B'), 'TBD');

  draftState = redoTournamentStructureDraft(draftState);
  assertEqual(getSlotValue(draftState.present, 'r1m1|B'), 'C');

  draftState = resetTournamentStructureDraft(draftState);
  assertEqual(getSlotValue(draftState.present, 'r1m1|B'), 'TBD');
  assertEqual(draftState.past.length, 0);
  assertEqual(draftState.future.length, 0);
});

let failed = 0;
for (const entry of cases) {
  try {
    entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All tournament editor tests passed (${cases.length}).`);
}
