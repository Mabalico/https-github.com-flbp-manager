import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMatchResultPatch, preserveAuthoritativeRefereeReports } from '../src/statePatch.mjs';

const stateWithMatch = (match) => ({
  teams: [],
  matches: [],
  tournament: { id: 't-1', name: 'Test' },
  tournamentMatches: [match],
  tournamentHistory: [],
});

test('local recovery preserves a newer authoritative referee report', () => {
  const current = stateWithMatch({
    id: 'm-1',
    played: true,
    status: 'finished',
    scoreA: 10,
    scoreB: 7,
    refereeReportFinalId: 'report-new',
    refereeReportSavedAt: '2026-08-17T12:00:00.000Z',
  });
  const incoming = stateWithMatch({
    id: 'm-1',
    played: false,
    status: 'scheduled',
    scoreA: 0,
    scoreB: 0,
    refereeReportFinalId: 'report-old',
    refereeReportSavedAt: '2026-08-17T11:00:00.000Z',
  });

  const out = preserveAuthoritativeRefereeReports({ currentState: current, incomingState: incoming });
  assert.deepEqual(out.preservedMatchIds, ['m-1']);
  assert.equal(out.state.tournamentMatches[0].scoreA, 10);
  assert.equal(out.state.tournamentMatches[0].refereeReportFinalId, 'report-new');
  assert.equal(incoming.tournamentMatches[0].scoreA, 0, 'incoming draft must not be mutated');
});

test('local recovery rejects deleting a match with an authoritative report', () => {
  const current = stateWithMatch({
    id: 'm-1',
    played: true,
    status: 'finished',
    scoreA: 10,
    scoreB: 7,
    refereeReportFinalId: 'report-new',
    refereeReportSavedAt: '2026-08-17T12:00:00.000Z',
  });
  const incoming = { ...stateWithMatch(null), tournamentMatches: [] };

  assert.throws(
    () => preserveAuthoritativeRefereeReports({ currentState: current, incomingState: incoming }),
    (error) => error?.code === 'FLBP_LOCAL_RECOVERY_REQUIRES_RECONCILIATION' && error?.statusCode === 409,
  );
});

test('local recovery keeps the incoming state when no newer report exists', () => {
  const current = stateWithMatch({ id: 'm-1', played: false, status: 'scheduled', scoreA: 0, scoreB: 0 });
  const incoming = stateWithMatch({ id: 'm-1', played: false, status: 'scheduled', scoreA: 1, scoreB: 0 });

  const out = preserveAuthoritativeRefereeReports({ currentState: current, incomingState: incoming });
  assert.deepEqual(out.preservedMatchIds, []);
  assert.equal(out.state.tournamentMatches[0].scoreA, 1);
});

// A report save that leaves teams level creates the tie-break in the same patch.
const groupMatch = (id, code, groupName, teamAId, teamBId, finished = true) => ({
  id, code, phase: 'groups', groupName, teamAId, teamBId,
  scoreA: finished ? 10 : 0, scoreB: finished ? 8 : 0, played: finished, status: finished ? 'finished' : 'scheduled',
});

const tieBreakState = ({ finalActive = true } = {}) => {
  const matches = [
    groupMatch('c13', 'C13', 'Girone C', 'c1', 'c2'),
    groupMatch('c14', 'C14', 'Girone C', 'c1', 'c3'),
    groupMatch('c15', 'C15', 'Girone C', 'c1', 'c4'),
    groupMatch('c16', 'C16', 'Girone C', 'c2', 'c3'),
    groupMatch('c17', 'C17', 'Girone C', 'c2', 'c4'),
    groupMatch('c18', 'C18', 'Girone C', 'c3', 'c4', false),
    groupMatch('d19', 'D19', 'Girone D', 'd1', 'd2', false),
    groupMatch('f1', 'F1', 'Girone Finale', 'c1', 'c2'),
    groupMatch('f2', 'F2', 'Girone Finale', 'c1', 'c3'),
    groupMatch('f3', 'F3', 'Girone Finale', 'c2', 'c3'),
  ];
  return {
    teams: [],
    tournament: {
      id: 't-tb',
      name: 'Test spareggi',
      type: 'groups_elimination',
      config: { finalRoundRobin: { enabled: true, activated: finalActive, topTeams: 4 } },
      groups: [
        { name: 'Girone C', teams: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }] },
        { name: 'Girone D', teams: [{ id: 'd1' }, { id: 'd2' }] },
        { name: 'Girone Finale', stage: 'final', teams: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] },
      ],
      matches: structuredClone(matches),
    },
    tournamentMatches: matches,
  };
};

const lastGroupResult = { ...groupMatch('c18', 'C18', 'Girone C', 'c3', 'c4'), scoreA: 8, scoreB: 10, refereeReportSavedAt: '2026-11-22T10:00:00.000Z' };
const groupTieBreak = (overrides = {}) => ({
  id: 'tb-c-1', code: 'CTB1', phase: 'groups', groupName: 'Girone C',
  teamIds: ['c1', 'c2', 'c3'], scoresByTeam: { c1: 0, c2: 0, c3: 0 },
  scoreA: 0, scoreB: 0, played: false, status: 'scheduled', orderIndex: 20, isTieBreak: true, targetScore: 1,
  ...overrides,
});

const patchWith = (state, matchId, matches) => applyMatchResultPatch({
  state,
  publicState: structuredClone(state),
  tournamentId: 't-tb',
  matchId,
  matches,
});

const idsOf = (items) => (items || []).map((item) => item.id);

test('a report save creates the three-team group tie-break it makes necessary', () => {
  const state = tieBreakState();
  const before = structuredClone(state);
  const out = patchWith(state, 'c18', [lastGroupResult, groupTieBreak({ injectedField: 'not stored' })]);

  for (const view of [out.state, out.publicState]) {
    assert.ok(idsOf(view.tournamentMatches).includes('tb-c-1'));
    assert.ok(idsOf(view.tournament.matches).includes('tb-c-1'));
  }
  const created = out.state.tournamentMatches.find((match) => match.id === 'tb-c-1');
  assert.deepEqual(created.teamIds, ['c1', 'c2', 'c3']);
  assert.equal(created.code, 'CTB1');
  assert.equal('injectedField' in created, false, 'only tie-break fields are stored');
  assert.equal(out.state.tournamentMatches.find((match) => match.id === 'c18').status, 'finished');
  assert.deepEqual(state, before, 'the input snapshot is never mutated');
});

test('a two-team group tie-break and a final-group FTB with legacy fields are accepted', () => {
  const twoTeams = patchWith(tieBreakState(), 'c18', [
    lastGroupResult,
    groupTieBreak({ id: 'tb-c-2', teamIds: undefined, scoresByTeam: undefined, teamAId: 'c1', teamBId: 'c2' }),
  ]);
  assert.ok(idsOf(twoTeams.state.tournamentMatches).includes('tb-c-2'));

  const state = tieBreakState();
  const finalTieBreak = groupTieBreak({
    id: 'ftb-1', code: 'FTB1', groupName: 'Girone Finale', teamAId: 'c1', teamBId: 'c2', scoresByTeam: undefined,
  });
  const out = patchWith(state, 'f3', [state.tournamentMatches.find((match) => match.id === 'f3'), finalTieBreak]);
  assert.ok(idsOf(out.state.tournamentMatches).includes('ftb-1'));
});

test('a report save cannot create any other match', () => {
  const pendingTieBreakState = () => {
    const state = tieBreakState();
    const pending = groupTieBreak({ id: 'tb-pending' });
    state.tournamentMatches.push(pending);
    state.tournament.matches.push(structuredClone(pending));
    return state;
  };
  const cases = [
    ['an arbitrary bracket match', tieBreakState, 'c18', [lastGroupResult, { id: 'evil', phase: 'bracket', teamAId: 'c1', teamBId: 'c2', status: 'scheduled', scoreA: 0, scoreB: 0 }]],
    ['a tie-break of an unfinished group', tieBreakState, 'c18', [lastGroupResult, groupTieBreak({ id: 'tb-d', code: 'DTB1', groupName: 'Girone D', teamIds: ['d1', 'd2'], scoresByTeam: undefined })]],
    ['a tie-break with a team from another group', tieBreakState, 'c18', [lastGroupResult, groupTieBreak({ teamIds: ['c1', 'c2', 'd1'], scoresByTeam: undefined })]],
    ['a tie-break with the wrong code', tieBreakState, 'c18', [lastGroupResult, groupTieBreak({ code: 'CTB2' })]],
    ['two new tie-breaks in one group', tieBreakState, 'c18', [lastGroupResult, groupTieBreak(), groupTieBreak({ id: 'tb-c-1b' })]],
    ['a tie-break that already has a result', tieBreakState, 'c18', [lastGroupResult, groupTieBreak({ scoreA: 1 })]],
    ['a second tie-break while one is still to play', pendingTieBreakState, 'c18', [lastGroupResult, groupTieBreak({ id: 'tb-c-next', code: 'CTB2' })]],
    ['an FTB while the final group is not active', () => tieBreakState({ finalActive: false }), 'f1', [groupMatch('f1', 'F1', 'Girone Finale', 'c1', 'c2'), groupTieBreak({ id: 'ftb-x', code: 'FTB1', groupName: 'Girone Finale', scoresByTeam: undefined })]],
  ];
  for (const [label, makeState, matchId, matches] of cases) {
    const state = makeState();
    const before = structuredClone(state);
    assert.throws(() => patchWith(state, matchId, matches), /Creazione partita non autorizzata/, label);
    assert.deepEqual(state, before, `${label}: snapshot unchanged`);
  }
  assert.throws(
    () => patchWith(tieBreakState(), 'ghost', [groupTieBreak({ id: 'ghost' })]),
    /Match ghost non trovato nello snapshot live/,
    'the reported match itself must already exist',
  );
});

test('a renamed group keeps the exact tie-break codes the app numbers', () => {
  const matches = [
    groupMatch('n1', 'X1', 'Girone Nord', 'n1', 'n2'),
    groupMatch('n2', 'X2', 'Girone Nord', 'n1', 'n3'),
    groupMatch('n3', 'X3', 'Girone Nord', 'n2', 'n3', false),
  ];
  const state = {
    teams: [],
    tournament: {
      id: 't-tb', type: 'groups_elimination',
      groups: [{ name: 'Girone Nord', teams: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }] }],
      matches: structuredClone(matches),
    },
    tournamentMatches: matches,
  };
  const last = { ...groupMatch('n3', 'X3', 'Girone Nord', 'n2', 'n3'), refereeReportSavedAt: '2026-11-22T10:00:00.000Z' };
  const first = patchWith(state, 'n3', [last, groupTieBreak({
    id: 'tb-n-1', code: 'dTB1', groupName: 'Girone Nord', teamIds: ['n1', 'n2', 'n3'], scoresByTeam: { n1: 0, n2: 0, n3: 0 },
  })]);
  assert.equal(first.state.tournamentMatches.find((match) => match.id === 'tb-n-1').code, 'dTB1', 'the code keeps its case');

  // The app numbers the next tie-break of "Girone Nord" dTB2.
  const played = {
    ...first.state.tournamentMatches.find((match) => match.id === 'tb-n-1'),
    status: 'finished', played: true, scoresByTeam: { n1: 1, n2: 0, n3: 0 }, refereeReportSavedAt: '2026-11-22T10:05:00.000Z',
  };
  const next = (code) => applyMatchResultPatch({
    state: first.state, publicState: first.publicState, tournamentId: 't-tb', matchId: 'tb-n-1',
    matches: [played, groupTieBreak({ id: 'tb-n-2', code, groupName: 'Girone Nord', teamIds: undefined, scoresByTeam: undefined, teamAId: 'n2', teamBId: 'n3' })],
  });
  assert.ok(idsOf(next('dTB2').state.tournamentMatches).includes('tb-n-2'));
  assert.throws(() => next('dTB1'), /codice spareggio non coerente/);
});
