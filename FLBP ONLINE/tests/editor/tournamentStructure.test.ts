import type { Group, Match, Team, TournamentData } from '../../types';
import {
  applyOperationToTournamentStructureDraft,
  createTournamentStructureDraftState,
  redoTournamentStructureDraft,
  resetTournamentStructureDraft,
  undoTournamentStructureDraft,
} from '../../services/tournamentStructureDraft';
import { diffTournamentStructure } from '../../services/tournamentStructureDiff';
import { ensureFinalTieBreakIfNeeded, generateTournamentStructure, syncBracketFromGroups } from '../../services/tournamentEngine';
import { computeGroupStandings } from '../../services/groupStandings';
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

const withRandomPrefix = <T>(values: number[], run: () => T): T => {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => (index < values.length ? values[index++] : originalRandom());
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
};

const getGeneratedRoundOne = (matches: Match[]) => matches
  .filter((match) => match.phase === 'bracket' && (match.round || 1) === 1)
  .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

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

defineCase('rebuilding never changes a bracket after a real match starts', () => {
  const teams = [makeTeam('A'), makeTeam('B')];
  for (const status of ['playing', 'finished'] as const) {
    const match = makeBracketMatch('locked-match', 1, 'A', 'B', {
      status, played: status === 'finished', scoreA: 7, scoreB: 4,
      stats: [{ teamId: 'A', playerName: 'A One', canestri: 7, soffi: 0 }],
    });
    const tournament = makeTournament('locked-rebuild', 'elimination', teams, [], [match]);
    const snapshot = makeSnapshot(tournament, [match], teams);
    const before = JSON.stringify(snapshot);
    const result = applyStructuralOperation(snapshot, { type: 'REBUILD_ELIMINATION_BRACKET' });
    assertEqual(result.ok, false);
    assertEqual(result.nextSnapshot, undefined);
    assertEqual(JSON.stringify(snapshot), before);
  }
});

defineCase('rebuilding excludes placeholders and allows only automatic BYE results', () => {
  const teams = Array.from({ length: 5 }, (_, index) => makeTeam(`T${index + 1}`));
  const roster = [...teams, { ...makeTeam('BYE'), isBye: true, hidden: true }, makeTeam('TBD')];
  const tournament = makeTournament('bye-rebuild', 'elimination', roster);
  const snapshot = makeSnapshot(tournament, [], roster);
  const result = applyStructuralOperation(snapshot, { type: 'REBUILD_ELIMINATION_BRACKET' });
  assertEqual(result.ok, true);
  assertEqual(result.nextSnapshot!.tournament.teams.length, 5);
  assertOk(!result.nextSnapshot!.tournament.teams.some((team) => team.id === 'BYE' || team.id === 'TBD'));
  const finished = result.nextSnapshot!.matches.filter((match) => match.status === 'finished');
  assertOk(finished.length > 0);
  assertOk(finished.every((match) => match.isBye || match.teamAId === 'BYE' || match.teamBId === 'BYE'));
  assertEqual(applyStructuralOperation(result.nextSnapshot!, { type: 'REBUILD_ELIMINATION_BRACKET' }).ok, true);
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

defineCase('elimination generation without late teams preserves the legacy randomized layout', () => {
  const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => makeTeam(id));
  const signatureFor = (lateTeamIds?: string[]) => withRandomPrefix([0, 0, 0, 0, 0], () => {
    const generated = lateTeamIds === undefined
      ? generateTournamentStructure(teams, { mode: 'elimination', tournamentName: 'Legacy layout' })
      : generateTournamentStructure(teams, { mode: 'elimination', tournamentName: 'Legacy layout', lateTeamIds });
    return getGeneratedRoundOne(generated.matches)
      .map((match) => `${match.teamAId}|${match.teamBId}`)
      .join(',');
  });

  const expectedLegacyLayout = 'B|BYE,C|BYE,D|BYE,E|A';
  assertEqual(signatureFor(), expectedLegacyLayout);
  assertEqual(signatureFor([]), expectedLegacyLayout);
});

defineCase('a late team receives a BYE when one is available', () => {
  const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => makeTeam(id));
  const generated = withRandomPrefix([0, 0, 0, 0, 0], () => generateTournamentStructure(teams, {
    mode: 'elimination',
    tournamentName: 'Late team with bye',
    lateTeamIds: ['E'],
  }));
  const lateMatch = getGeneratedRoundOne(generated.matches)
    .find((match) => match.teamAId === 'E' || match.teamBId === 'E');

  assertOk(lateMatch);
  assertEqual(lateMatch?.isBye, true);
  assertEqual(lateMatch?.played, true);
  assertEqual(lateMatch?.hidden, true);
  assertOk(lateMatch?.teamAId === 'BYE' || lateMatch?.teamBId === 'BYE');
});

defineCase('late teams beyond the available BYEs occupy the final Round 1 slots', () => {
  const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => makeTeam(id));
  const lateTeamIds = ['E', 'F', 'G'];
  const generated = withRandomPrefix([0, 0, 0, 0, 0, 0, 0], () => generateTournamentStructure(teams, {
    mode: 'elimination',
    tournamentName: 'Late teams overflow',
    lateTeamIds,
  }));
  const firstRound = getGeneratedRoundOne(generated.matches);
  const byeLateTeamIds = firstRound
    .filter((match) => match.isBye)
    .flatMap((match) => [match.teamAId, match.teamBId])
    .filter((id): id is string => !!id && id !== 'BYE' && lateTeamIds.includes(id));
  const remainingLateTeamIds = lateTeamIds.filter((id) => !byeLateTeamIds.includes(id));
  const realTeamSlots = firstRound
    .flatMap((match) => [match.teamAId, match.teamBId])
    .filter((id): id is string => !!id && id !== 'BYE');
  const finalSlots = realTeamSlots.slice(-remainingLateTeamIds.length);

  assertEqual(byeLateTeamIds.length, 1);
  assertEqual(finalSlots.slice().sort().join(','), remainingLateTeamIds.slice().sort().join(','));
});

defineCase('marking every team late still creates a complete bracket without duplicate or BYE-only pairs', () => {
  const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => makeTeam(id));
  const lateTeamIds = teams.map((team) => team.id);
  const generated = withRandomPrefix([0, 0, 0, 0, 0], () => generateTournamentStructure(teams, {
    mode: 'elimination',
    tournamentName: 'All teams late',
    lateTeamIds,
  }));
  const firstRound = getGeneratedRoundOne(generated.matches);
  const assignedTeamIds = firstRound
    .flatMap((match) => [match.teamAId, match.teamBId])
    .filter((id): id is string => !!id && id !== 'BYE')
    .sort();

  assertEqual(firstRound.length, 4);
  assertEqual(firstRound.filter((match) => match.isBye).length, 3);
  assertEqual(firstRound.filter((match) => !match.isBye).length, 1);
  assertOk(firstRound.every((match) => !(match.teamAId === 'BYE' && match.teamBId === 'BYE')));
  assertEqual(assignedTeamIds.join(','), lateTeamIds.slice().sort().join(','));
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

// --- B2 audit 2026-11-16: groups -> bracket sync must never wipe played bracket results ---

const twelveGroupTeams = () => Array.from({ length: 12 }, (_, index) => makeTeam(`T${index + 1}`, `Team ${String(index + 1).padStart(2, '0')}`));

const generateFourGroupsTournament = () => {
  const generated = generateTournamentStructure(twelveGroupTeams(), {
    mode: 'groups_elimination',
    numGroups: 4,
    advancingPerGroup: 2,
    tournamentName: 'Four groups',
  });
  const groups = [...(generated.tournament.groups || [])].sort((a, b) => a.name.localeCompare(b.name));
  return { tournament: generated.tournament, matches: generated.matches, groups };
};

// Finishes every regular match of the group so that the ranking follows `order` (first = group winner).
const finishGroupInOrder = (matches: Match[], group: Group, order: string[] = group.teams.map((team) => team.id)): Match[] => {
  const rank = new Map(order.map((teamId, index) => [teamId, index]));
  return matches.map((match) => {
    if (match.phase !== 'groups' || match.groupName !== group.name || match.isTieBreak) return match;
    const aAhead = (rank.get(match.teamAId || '') ?? 99) < (rank.get(match.teamBId || '') ?? 99);
    return { ...match, status: 'finished', played: true, scoreA: aAhead ? 10 : 4, scoreB: aAhead ? 4 : 10 };
  });
};

const playBracketMatch = (matches: Match[], matchId: string, scoreA: number, scoreB: number): Match[] => {
  const target = matches.find((match) => match.id === matchId)!;
  const finished: Match = { ...target, status: 'finished', played: true, scoreA, scoreB };
  return advanceWinner(matches.map((match) => (match.id === matchId ? finished : match)), finished);
};

const getBracketRound = (matches: Match[], round: number) => matches
  .filter((match) => match.phase === 'bracket' && (match.round || 1) === round)
  .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

defineCase('a group report never wipes a bracket match already played while other groups are running', () => {
  const { tournament, groups } = generateFourGroupsTournament();
  let matches = tournament.matches || [];
  const [groupA, groupB, groupC, groupD] = groups;
  const first = (group: Group) => group.teams[0].id;
  const second = (group: Group) => group.teams[1].id;

  matches = finishGroupInOrder(matches, groupA);
  matches = finishGroupInOrder(matches, groupB);
  matches = syncBracketFromGroups(tournament, matches);

  const opening = getBracketRound(matches, 1)[0];
  assertEqual(opening.teamAId, first(groupA), 'A1 is resolved into the first Round 1 match');
  assertEqual(opening.teamBId, second(groupB), 'B2 is resolved into the first Round 1 match');

  matches = playBracketMatch(matches, opening.id, 10, 6);
  assertEqual(getBracketRound(matches, 2)[0].teamAId, first(groupA), 'the bracket winner advances');

  // A report of group C arrives: the played bracket match must survive.
  matches = finishGroupInOrder(matches, groupC);
  matches = syncBracketFromGroups(tournament, matches);

  let played = matches.find((match) => match.id === opening.id)!;
  assertEqual(played.status, 'finished', 'played bracket match stays finished after a group C report');
  assertEqual(played.scoreA, 10);
  assertEqual(played.scoreB, 6);
  assertEqual(getBracketRound(matches, 2)[0].teamAId, first(groupA), 'the advanced winner stays in Round 2');
  assertEqual(getBracketRound(matches, 1)[2].teamAId, first(groupC), 'C1 is still resolved while D is running');
  assertEqual(getBracketRound(matches, 1)[2].teamBId, 'TBD-D-2', 'D2 stays a placeholder while D is running');

  // The last group closes: placeholders must resolve without resetting the played match.
  matches = finishGroupInOrder(matches, groupD);
  matches = syncBracketFromGroups(tournament, matches);

  played = matches.find((match) => match.id === opening.id)!;
  assertEqual(played.status, 'finished', 'played bracket match stays finished when the last group closes');
  assertEqual(played.scoreA, 10);
  assertEqual(played.scoreB, 6);
  assertEqual(getBracketRound(matches, 2)[0].teamAId, first(groupA), 'the advanced winner stays in Round 2 at the end');
  const round1 = getBracketRound(matches, 1);
  assertEqual(round1[2].teamBId, second(groupD), 'D2 is resolved when group D closes');
  assertEqual(round1[3].teamAId, second(groupC), 'C2 is resolved when group D closes');
  assertEqual(round1[3].teamBId, first(groupD), 'D1 is resolved when group D closes');
  assertOk(round1.every((match) => !String(match.teamAId).startsWith('TBD') && !String(match.teamBId).startsWith('TBD')), 'no TBD left in Round 1');
});

defineCase('correcting a group result after the bracket started keeps played bracket matches untouched', () => {
  const { tournament, groups } = generateFourGroupsTournament();
  let matches = tournament.matches || [];
  groups.forEach((group) => {
    matches = finishGroupInOrder(matches, group);
  });
  matches = syncBracketFromGroups(tournament, matches);

  const opening = getBracketRound(matches, 1)[0];
  matches = playBracketMatch(matches, opening.id, 10, 7);

  // Correct group A so that its first and second place swap.
  const [groupA] = groups;
  matches = finishGroupInOrder(matches, groupA, [groupA.teams[1].id, groupA.teams[0].id, groupA.teams[2].id]);
  matches = syncBracketFromGroups(tournament, matches);

  const played = matches.find((match) => match.id === opening.id)!;
  assertEqual(played.status, 'finished', 'played bracket match is not reset by a group correction');
  assertEqual(played.scoreA, 10);
  assertEqual(played.scoreB, 7);
  assertEqual(played.teamAId, groupA.teams[0].id, 'participants of a played match are never rewritten');
  assertEqual(getBracketRound(matches, 2)[0].teamAId, groupA.teams[0].id, 'the advanced winner stays in Round 2');
});

defineCase('a tie-break inserted before the bracket starts still resets resolved slots to placeholders', () => {
  const { tournament, groups } = generateFourGroupsTournament();
  let matches = tournament.matches || [];
  const [groupA, groupB] = groups;
  matches = finishGroupInOrder(matches, groupA);
  matches = finishGroupInOrder(matches, groupB);
  matches = syncBracketFromGroups(tournament, matches);
  assertEqual(getBracketRound(matches, 1)[0].teamAId, groupA.teams[0].id, 'A1 resolved before the correction');

  // Correct group A into a perfect three-way tie (each team wins once, same cups): a tie-break is needed.
  const [x, y, z] = groupA.teams.map((team) => team.id);
  const beats: Record<string, string> = { [x]: y, [y]: z, [z]: x };
  matches = matches.map((match) => {
    if (match.phase !== 'groups' || match.groupName !== groupA.name) return match;
    const aWins = beats[match.teamAId || ''] === match.teamBId;
    return { ...match, status: 'finished', played: true, scoreA: aWins ? 10 : 4, scoreB: aWins ? 4 : 10 };
  });
  matches = syncBracketFromGroups(tournament, matches);

  assertOk(matches.some((match) => match.groupName === groupA.name && match.isTieBreak && match.status === 'scheduled'), 'tie-break created');
  const round1 = getBracketRound(matches, 1);
  assertEqual(round1[0].teamAId, 'TBD-A-1', 'A1 goes back to its placeholder while the tie-break is pending');
  assertEqual(round1[1].teamAId, 'TBD-A-2', 'A2 goes back to its placeholder while the tie-break is pending');
  assertEqual(round1[1].teamBId, groupB.teams[0].id, 'B1 stays resolved');
});

// --- B2 audit 2026-11-16: a group tie-break only orders the tied teams ---

const fiveTeamGroupScenario = () => {
  const teams = ['T1', 'T2', 'T3', 'T4', 'T5'].map((id) => makeTeam(id, `Team ${id}`));
  const result = (id: string, a: string, b: string, scoreA: number, scoreB: number) =>
    makeGroupMatch(id, 'Girone A', a, b, { status: 'finished', played: true, scoreA, scoreB });
  // T1: 3 wins, cups diff +2. T2 and T3: 2 wins, cups diff +4 (tied on Pt/ΔC/ΔS).
  const matches = [
    result('a1', 'T1', 'T2', 10, 9),
    result('a2', 'T1', 'T3', 10, 9),
    result('a3', 'T1', 'T4', 5, 10),
    result('a4', 'T1', 'T5', 10, 5),
    result('a5', 'T2', 'T3', 10, 8),
    result('a6', 'T2', 'T4', 9, 10),
    result('a7', 'T2', 'T5', 10, 6),
    result('a8', 'T3', 'T4', 10, 5),
    result('a9', 'T3', 'T5', 10, 8),
    result('a10', 'T4', 'T5', 9, 10),
  ];
  return { teams, matches };
};

defineCase('a played group tie-break does not add points or cups and only orders the tied teams', () => {
  const { teams, matches } = fiveTeamGroupScenario();
  const tieBreak = makeGroupMatch('atb1', 'Girone A', 'T3', 'T2', {
    status: 'finished',
    played: true,
    scoreA: 1,
    scoreB: 0,
    isTieBreak: true,
    targetScore: 1,
    orderIndex: 20,
  });

  const { rows, rankedTeams } = computeGroupStandings({ teams, matches: [...matches, tieBreak] });
  assertEqual(rankedTeams.map((team) => team.id).join(','), 'T1,T3,T2,T4,T5', 'T1 keeps first place, the tie-break winner is second');
  assertEqual(rows.T3.points, 2, 'the tie-break win is not a point');
  assertEqual(rows.T3.cupsDiff, 4, 'the tie-break cups are not counted');
  assertEqual(rows.T3.played, 4, 'the tie-break is not a group match');
  assertEqual(rows.T2.cupsDiff, 4);
});

defineCase('the bracket seeds the real group winner after a group tie-break and no second tie-break is created', () => {
  const { teams: groupATeams, matches: groupAMatches } = fiveTeamGroupScenario();
  const groupBTeams = [makeTeam('U1', 'Team U1'), makeTeam('U2', 'Team U2')];
  const tournament = makeTournament(
    'tb-seed',
    'groups_elimination',
    [...groupATeams, ...groupBTeams],
    [makeGroup('ga', 'Girone A', groupATeams), makeGroup('gb', 'Girone B', groupBTeams)],
    []
  );
  let matches: Match[] = [
    ...groupAMatches,
    makeGroupMatch('b1', 'Girone B', 'U1', 'U2'),
    makeBracketMatch('r1m1', 1, 'TBD-A-1', 'TBD-B-2', { orderIndex: 101 }),
    makeBracketMatch('r1m2', 1, 'TBD-A-2', 'TBD-B-1', { orderIndex: 102 }),
    makeBracketMatch('r2m1', 2, undefined, undefined, { orderIndex: 103 }),
  ];

  matches = syncBracketFromGroups(tournament, matches);
  const tieBreaks = matches.filter((match) => match.isTieBreak);
  assertEqual(tieBreaks.length, 1, 'T2/T3 tie at the cutline creates one tie-break');
  assertEqual(matches.find((match) => match.id === 'r1m1')?.teamAId, 'TBD-A-1', 'group A stays unresolved while the tie-break is pending');

  matches = matches.map((match) => (match.isTieBreak
    ? { ...match, status: 'finished', played: true, scoreA: match.teamAId === 'T3' ? 1 : 0, scoreB: match.teamBId === 'T3' ? 1 : 0 }
    : match));
  matches = syncBracketFromGroups(tournament, matches);

  assertEqual(matches.filter((match) => match.isTieBreak).length, 1, 'a played tie-break is not created again');
  assertEqual(matches.find((match) => match.id === 'r1m1')?.teamAId, 'T1', 'A1 is the team that was ahead before the tie-break');
  assertEqual(matches.find((match) => match.id === 'r1m2')?.teamAId, 'T3', 'A2 is the tie-break winner');
});

defineCase('a played final tie-break decides the final group leader without creating another one', () => {
  const finalTeams = ['F1', 'F2', 'F3', 'F4'].map((id) => makeTeam(id, `Team ${id}`));
  const finalGroup: Group = { id: 'gf', name: 'Girone Finale', teams: finalTeams, stage: 'final' };
  const tournament: TournamentData = {
    ...makeTournament('final-rr', 'elimination', finalTeams, [finalGroup], []),
    config: { advancingPerGroup: 2, finalRoundRobin: { enabled: true, activated: true, topTeams: 4 } },
  };
  const result = (id: string, a: string, b: string, aWins: boolean) =>
    makeGroupMatch(id, 'Girone Finale', a, b, { status: 'finished', played: true, scoreA: aWins ? 10 : 4, scoreB: aWins ? 4 : 10 });
  // F1 and F2 end tied on Pt, ΔC, ΔS and cups for.
  let matches: Match[] = [
    result('f1', 'F1', 'F2', true),
    result('f2', 'F1', 'F3', false),
    result('f3', 'F1', 'F4', true),
    result('f4', 'F2', 'F3', true),
    result('f5', 'F2', 'F4', true),
    result('f6', 'F3', 'F4', false),
  ];

  matches = ensureFinalTieBreakIfNeeded(tournament, matches);
  const ftb = matches.find((match) => match.code === 'FTB1');
  assertOk(ftb, 'FTB1 is created for the tied leaders');
  assertEqual([ftb!.teamAId, ftb!.teamBId].sort().join(','), 'F1,F2');

  matches = matches.map((match) => (match.code === 'FTB1'
    ? { ...match, status: 'finished', played: true, scoreA: match.teamAId === 'F2' ? 1 : 0, scoreB: match.teamBId === 'F2' ? 1 : 0 }
    : match));
  const after = ensureFinalTieBreakIfNeeded(tournament, matches);
  assertEqual(after.length, matches.length, 'no FTB2 after FTB1 decided the leader');
  const standings = computeGroupStandings({ teams: finalTeams, matches: after.filter((match) => match.status === 'finished') });
  assertEqual(standings.rankedTeams[0].id, 'F2', 'the FTB winner leads the final group');
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
