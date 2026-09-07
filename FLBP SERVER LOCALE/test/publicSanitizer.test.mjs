import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAppStateForPublic, buildPublicWorkspaceLiveState } from '../src/publicSanitizer.mjs';

test('public snapshots remove both champion identities and preserve U25 at the tournament date', () => {
  const team = { id: 'a', player1: 'Mario', player1BirthDate: '2000-07-13', player2: 'Luca', player2BirthDate: '1994-01-01' };
  const state = {
    tournament: { id: 't', startDate: '2026-07-12', teams: [team], groups: [{ teams: [team] }] },
    teams: [team],
    hallOfFame: [{ tournamentId: 't', playerNames: ['Mario', 'Luca'], playerIds: ['mario_2000-07-13', 'luca_1994-01-01'], playerBirthDates: ['2000-07-13', '1994-01-01'] }],
    integrationsScorers: [{ name: 'Mario', birthDate: '2000-07-13', sourceTournamentId: 't' }],
  };
  const safe = sanitizeAppStateForPublic(state);
  const twice = sanitizeAppStateForPublic(safe);
  assert.equal(JSON.stringify(safe).includes('2000-07-13'), false);
  assert.equal(JSON.stringify(safe).includes('1994-01-01'), false);
  assert.equal(safe.tournament.teams[0].player1U25, true);
  assert.equal(safe.tournament.teams[0].player2U25, false);
  assert.equal(twice.integrationsScorers[0].tournamentU25, true);
  assert.equal(buildPublicWorkspaceLiveState(safe).teams[0].player1U25, true);
  const birthday = sanitizeAppStateForPublic({ ...state, tournament: { ...state.tournament, startDate: '2026-07-13' } });
  assert.equal(birthday.tournament.teams[0].player1U25, false);
  assert.equal(birthday.integrationsScorers[0].tournamentU25, false);
});
