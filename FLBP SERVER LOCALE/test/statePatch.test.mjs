import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveAuthoritativeRefereeReports } from '../src/statePatch.mjs';

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
