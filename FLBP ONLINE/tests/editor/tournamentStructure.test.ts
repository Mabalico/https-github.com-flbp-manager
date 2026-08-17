import type { Group, Match, Team, TournamentData } from '../../types';
import {
  applyOperationToTournamentStructureDraft,
  createTournamentStructureDraftState,
  redoTournamentStructureDraft,
  resetTournamentStructureDraft,
  undoTournamentStructureDraft,
} from '../../services/tournamentStructureDraft';
import { diffTournamentStructure } from '../../services/tournamentStructureDiff';
import { generateTournamentStructure } from '../../services/tournamentEngine';
import {
  canInsertTeamIntoBracketSlot,
  canReplaceBracketSlot,
  getTeamEligibility,
  validateDraftBeforeApply,
} from '../../services/tournamentStructureEligibility';
import { applyStructuralOperation } from '../../services/tournamentStructureOperations';
import {
  advanceWinner,
  buildTournamentStructureSnapshot,
  cloneSnapshot,
  findSuccessorMatch,
  getSlotValue,
  reconcileBracketAdvancements,
} from '../../services/tournamentStructureSelectors';

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
  assertEqual(canReplaceBracketSlot(snapshot, 'r1m2|A', 'D').allowed, true);
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

defineCase('clearing an unplayed bracket slot prunes only the live tournament roster', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const tournament = makeTournament(
    'elim-prune',
    'elimination',
    [a, b],
    [],
    [makeBracketMatch('r1m1', 1, 'A', 'B')]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || [], [a, b]);

  const result = applyStructuralOperation(snapshot, {
    type: 'CLEAR_BRACKET_SLOT',
    slotKey: 'r1m1|B',
  });

  assertEqual(result.ok, true);
  assertEqual(result.nextSnapshot!.tournament.teams.map((team) => team.id).join(','), 'A');
  assertOk(result.nextSnapshot!.catalogTeams.some((team) => team.id === 'B'));
  assertEqual(validateDraftBeforeApply(snapshot, result.nextSnapshot!).canApply, true);
});

defineCase('clearing an auto-finished bye seed removes its propagated successor', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const tournament = makeTournament(
    'elim-bye-prune',
    'elimination',
    [a, b],
    [],
    [
      makeBracketMatch('r1m1', 1, 'A', 'BYE', { played: true, status: 'finished', hidden: true, isBye: true }),
      makeBracketMatch('r1m2', 1, 'B', 'BYE', { played: true, status: 'finished', hidden: true, isBye: true }),
      makeBracketMatch('r2m1', 2, 'A', 'B'),
    ]
  );
  const snapshot = makeSnapshot(tournament, tournament.matches || [], [a, b]);

  const result = applyStructuralOperation(snapshot, { type: 'CLEAR_BRACKET_SLOT', slotKey: 'r1m1|A' });

  assertEqual(result.ok, true);
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|A'), 'BYE');
  assertOk(getSlotValue(result.nextSnapshot!, 'r2m1|A') !== 'A');
  assertOk(!result.nextSnapshot!.tournament.teams.some((team) => team.id === 'A'));
});

defineCase('rebuilding a 128-team elimination roster produces seven rounds and 127 matches', () => {
  const teams = Array.from({ length: 128 }, (_, index) => makeTeam(`T${index + 1}`));
  const oversized = generateTournamentStructure(teams, {
    mode: 'elimination',
    tournamentName: '128 teams',
  });
  const snapshot = makeSnapshot(oversized.tournament, oversized.matches, teams);

  const result = applyStructuralOperation(snapshot, { type: 'REBUILD_ELIMINATION_BRACKET' });

  assertEqual(result.ok, true);
  assertEqual(result.nextSnapshot!.matches.length, 127);
  assertEqual(new Set(result.nextSnapshot!.matches.map((match) => match.round)).size, 7);
  assertEqual(result.nextSnapshot!.tournament.teams.length, 128);
  const diff = diffTournamentStructure(snapshot, result.nextSnapshot!);
  assertEqual(diff.changed, true);
  assertEqual(diff.structureChanged, true);
  assertOk(diff.operationsCount >= 1);
  assertEqual(validateDraftBeforeApply(snapshot, result.nextSnapshot!).canApply, true);
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

defineCase('bracket insert into empty opposite slot auto-advances unless successor is locked', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');

  const makeBracket = (successorLocked: boolean) => makeSnapshot(
    makeTournament('insert-bye-advance', 'elimination', [a, b, c], [], []),
    [
      makeBracketMatch('r1m1', 1, undefined, undefined, { orderIndex: 0 }),
      makeBracketMatch('r1m2', 1, 'B', 'C', {
        orderIndex: 1,
        played: true,
        status: 'finished',
        scoreA: 10,
        scoreB: 5,
      }),
      makeBracketMatch('r2m1', 2, undefined, undefined, {
        orderIndex: 0,
        played: successorLocked,
        status: successorLocked ? 'finished' : 'scheduled',
        scoreA: successorLocked ? 10 : 0,
        scoreB: successorLocked ? 5 : 0,
      }),
    ],
    [a, b, c]
  );

  const lockedCheck = canInsertTeamIntoBracketSlot(makeBracket(true), 'A', 'r1m1|A');
  assertEqual(lockedCheck.allowed, false);
  assertEqual(lockedCheck.reasonCode, 'successor_locked');

  const result = applyStructuralOperation(makeBracket(false), {
    type: 'INSERT_TEAM_IN_BRACKET_SLOT',
    teamId: 'A',
    slotKey: 'r1m1|A',
  });

  assertEqual(result.ok, true);
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|A'), 'A');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|B'), 'BYE');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r2m1|A'), 'A');
});

defineCase('inserting an opponent into a previous BYE clears the stale auto-advance', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');

  const tournament = makeTournament('bye-to-match', 'elimination', [a, b], [], [
    makeBracketMatch('r1m1', 1, 'A', 'BYE', {
      orderIndex: 0,
      played: true,
      status: 'finished',
      hidden: true,
      isBye: true,
    }),
    makeBracketMatch('r2m1', 2, 'A', undefined, { orderIndex: 0 }),
  ]);
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  const result = applyStructuralOperation(snapshot, {
    type: 'INSERT_TEAM_IN_BRACKET_SLOT',
    teamId: 'B',
    slotKey: 'r1m1|B',
  });

  assertEqual(result.ok, true);
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|A'), 'A');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|B'), 'B');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r2m1|A'), '');
  const source = result.nextSnapshot!.matches.find((match) => match.id === 'r1m1');
  assertEqual(source?.status, 'scheduled');
  assertEqual(source?.isBye, false);
});

defineCase('replacing a solo BYE winner removes the old winner from the successor', () => {
  const a = makeTeam('A', 'Alpha');
  const c = makeTeam('C', 'Charlie');

  const tournament = makeTournament('replace-bye-winner', 'elimination', [a, c], [], [
    makeBracketMatch('r1m1', 1, 'A', 'BYE', {
      orderIndex: 0,
      played: true,
      status: 'finished',
      hidden: true,
      isBye: true,
    }),
    makeBracketMatch('r2m1', 2, 'A', undefined, { orderIndex: 0 }),
  ]);
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  const result = applyStructuralOperation(snapshot, {
    type: 'REPLACE_BRACKET_SLOT',
    slotKey: 'r1m1|A',
    newTeamId: 'C',
  });

  assertEqual(result.ok, true);
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|A'), 'C');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r1m1|B'), 'BYE');
  assertEqual(getSlotValue(result.nextSnapshot!, 'r2m1|A'), 'C');
});

defineCase('explicit successor link overrides legacy positional bracket advancement', () => {
  const a = makeTeam('A', 'Alpha');
  const b = makeTeam('B', 'Bravo');
  const c = makeTeam('C', 'Charlie');
  const d = makeTeam('D', 'Delta');

  const matches = [
    makeBracketMatch('r1m1', 1, 'A', 'BYE', {
      orderIndex: 0,
      played: true,
      status: 'finished',
      hidden: true,
      isBye: true,
      nextMatchId: 'r2m2',
      nextSlot: 'B',
    }),
    makeBracketMatch('r1m2', 1, 'B', 'C', { orderIndex: 1 }),
    makeBracketMatch('r1m3', 1, 'D', 'BYE', { orderIndex: 2, played: true, status: 'finished', hidden: true, isBye: true }),
    makeBracketMatch('r2m1', 2, undefined, undefined, { orderIndex: 0 }),
    makeBracketMatch('r2m2', 2, undefined, undefined, { orderIndex: 1 }),
  ];

  const reconciled = reconcileBracketAdvancements(matches);
  const explicit = findSuccessorMatch(reconciled, 'r1m1');

  assertEqual(explicit?.source, 'explicit');
  assertEqual(explicit?.match.id, 'r2m2');
  assertEqual(explicit?.slotName, 'B');
  assertEqual((reconciled.find((match) => match.id === 'r2m1') as Match).teamAId, undefined);
  assertEqual((reconciled.find((match) => match.id === 'r2m2') as Match).teamBId, 'A');
});

defineCase('legacy bracket without explicit links still advances positionally', () => {
  const matches = [
    makeBracketMatch('r1m1', 1, 'A', 'BYE', {
      orderIndex: 0,
      played: true,
      status: 'finished',
      hidden: true,
      isBye: true,
    }),
    makeBracketMatch('r1m2', 1, 'B', 'C', { orderIndex: 1 }),
    makeBracketMatch('r2m1', 2, undefined, undefined, { orderIndex: 0 }),
  ];

  const reconciled = reconcileBracketAdvancements(matches);
  const successor = findSuccessorMatch(matches, 'r1m1');

  assertEqual(successor?.source, 'positional');
  assertEqual(successor?.match.id, 'r2m1');
  assertEqual((reconciled.find((match) => match.id === 'r2m1') as Match).teamAId, 'A');
});

defineCase('generated non-power-of-two bracket stores successor links', () => {
  const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => makeTeam(id));
  const generated = generateTournamentStructure(teams, { mode: 'elimination', tournamentName: 'Five teams' });
  const bracket = generated.matches.filter((match) => match.phase === 'bracket');
  const firstRound = bracket.filter((match) => (match.round || 1) === 1);
  const secondRoundIds = new Set(bracket.filter((match) => (match.round || 1) === 2).map((match) => match.id));

  assertOk(firstRound.length > 0);
  assertOk(firstRound.every((match) => !!match.nextMatchId && (match.nextSlot === 'A' || match.nextSlot === 'B')));
  assertOk(firstRound.every((match) => secondRoundIds.has(String(match.nextMatchId))));
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

defineCase('score correction re-propagates the corrected winner to the next round', () => {
  let matches: Match[] = [
    makeBracketMatch('r1m1', 1, 'A', 'B', { played: true, status: 'finished', scoreA: 10, scoreB: 5 }),
    makeBracketMatch('r1m2', 1, 'C', 'D'),
    makeBracketMatch('r2m1', 2, undefined, undefined),
  ];
  matches = reconcileBracketAdvancements(matches, { resetFutureParticipants: true });
  assertEqual(matches.find((m) => m.id === 'r2m1')?.teamAId, 'A', 'winner advances after first report');

  // Correction: the report is fixed and B actually won.
  matches = matches.map((m) => (m.id === 'r1m1' ? { ...m, scoreA: 4, scoreB: 10 } : m));
  const corrected = matches.find((m) => m.id === 'r1m1')!;
  matches = advanceWinner(matches, corrected);
  assertEqual(matches.find((m) => m.id === 'r2m1')?.teamAId, 'B', 'corrected winner replaces the stale one');
});

defineCase('manually seeded team in a future round survives the realign reset', () => {
  let matches: Match[] = [
    makeBracketMatch('r1m1', 1, 'A', 'B', { played: true, status: 'finished', scoreA: 10, scoreB: 7 }),
    makeBracketMatch('r1m2', 1, 'C', 'D'),
    makeBracketMatch('r2m1', 2, undefined, 'X'),
  ];
  matches = reconcileBracketAdvancements(matches, { resetFutureParticipants: true });
  const final = matches.find((m) => m.id === 'r2m1');
  assertEqual(final?.teamBId, 'X', 'manual seed is not wiped by the reset');
  assertEqual(final?.teamAId, 'A', 'derived winner still fills the feeder-fed slot');
});

defineCase('winner reaching an auto-resolved bye successor reopens and keeps propagating', () => {
  let matches: Match[] = [
    makeBracketMatch('r1m1', 1, 'A', 'B', { played: true, status: 'finished', scoreA: 10, scoreB: 2 }),
    makeBracketMatch('r2m1', 2, undefined, 'BYE', { played: true, status: 'finished', hidden: true, isBye: true }),
    makeBracketMatch('r3m1', 3, undefined, undefined),
  ];
  const finished = matches.find((m) => m.id === 'r1m1')!;
  matches = advanceWinner(matches, finished);
  const reopened = matches.find((m) => m.id === 'r2m1');
  assertEqual(reopened?.teamAId, 'A', 'winner lands in the bye successor slot');
  assertEqual(reopened?.status, 'finished', 'A vs BYE resolves again as a bye');
  assertEqual(matches.find((m) => m.id === 'r3m1')?.teamAId, 'A', 'winner keeps propagating through the bye');
});

defineCase('insert into a future-round slot waits for the real opponent instead of fabricating a BYE', () => {
  const teams = [makeTeam('A'), makeTeam('B'), makeTeam('C'), makeTeam('D'), makeTeam('X')];
  const tournament = makeTournament('elim', 'elimination', teams, [], [
    makeBracketMatch('r1m1', 1, 'A', 'B'),
    makeBracketMatch('r1m2', 1, 'C', 'D', { played: true, status: 'finished', scoreA: 10, scoreB: 8 }),
    makeBracketMatch('r2m1', 2, undefined, undefined),
  ]);
  const snapshot = makeSnapshot(tournament, tournament.matches || []);

  const result = applyStructuralOperation(snapshot, {
    type: 'INSERT_TEAM_IN_BRACKET_SLOT',
    teamId: 'X',
    slotKey: 'r2m1|A',
  });
  assertEqual(result.ok, true, 'insert into a free future slot is applied');
  const final = (result.nextSnapshot!.matches || []).find((m) => m.id === 'r2m1');
  assertEqual(final?.teamAId, 'X', 'inserted team survives the realign');
  assertEqual(final?.teamBId, 'C', 'feeder-fed side keeps the advancing winner instead of a BYE');
  assertEqual(final?.status, 'scheduled', 'the pairing stays playable');
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
