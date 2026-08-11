import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStatePatch, buildStatePatch } from '../src/stateDelta.mjs';

test('state delta round-trips nested objects and fixed arrays', () => {
  const before = { tournament: { name: 'A', matches: [{ id: 'm1', score: 0 }] }, old: true };
  const after = { tournament: { name: 'B', matches: [{ id: 'm1', score: 7 }] }, added: ['x'] };
  const patch = buildStatePatch(before, after);
  assert.deepEqual(applyStatePatch(before, patch), after);
  assert.ok(patch.some((operation) => operation.path.join('.') === 'tournament.matches.0.score'));
});

test('state delta replaces arrays whose length changes', () => {
  const before = { values: [1, 2] };
  const after = { values: [1, 2, 3] };
  assert.deepEqual(applyStatePatch(before, buildStatePatch(before, after)), after);
});

test('state delta rejects prototype-pollution paths', () => {
  assert.throws(
    () => applyStatePatch({}, [{ op: 'set', path: ['__proto__', 'polluted'], value: true }]),
    /percorso non sicuro/,
  );
  assert.equal({}.polluted, undefined);
});
