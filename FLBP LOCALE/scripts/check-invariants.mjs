#!/usr/bin/env node

/**
 * Minimal, dependency-free invariant checks.
 *
 * Usage:
 *   node scripts/check-invariants.mjs path/to/backup.json
 */

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-invariants.mjs path/to/backup.json');
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error('Cannot read file:', e?.message || String(e));
  process.exit(2);
}

let state;
try {
  state = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON:', e?.message || String(e));
  process.exit(2);
}

const failures = [];

const isByeMatch = (m) => {
  if (!m || typeof m !== 'object') return false;
  return !!m.isBye || m.teamAId === 'BYE' || m.teamBId === 'BYE';
};

const collectMatches = () => {
  const out = [];
  if (Array.isArray(state.matches)) out.push(...state.matches);
  if (Array.isArray(state.tournamentMatches)) out.push(...state.tournamentMatches);
  if (state.tournament && Array.isArray(state.tournament.matches)) out.push(...state.tournament.matches);

  const hist = Array.isArray(state.tournamentHistory) ? state.tournamentHistory : [];
  for (const t of hist) {
    if (Array.isArray(t.matches) && t.matches.length) out.push(...t.matches);
    // legacy archived shape: rounds[]
    if (Array.isArray(t.rounds)) {
      for (const r of t.rounds) {
        if (Array.isArray(r)) out.push(...r);
      }
    }
  }
  return out;
};

const matches = collectMatches();

for (const m of matches) {
  if (!isByeMatch(m)) continue;
  const code = m.code || m.id || '?';
  if (!m.hidden) failures.push(`[BYE hidden] Match ${code}: hidden must be true`);
  if (m.status && m.status !== 'finished') failures.push(`[BYE status] Match ${code}: status must be finished`);
  if (m.played === false) failures.push(`[BYE played] Match ${code}: played should be true`);
  const a = Number(m.scoreA ?? 0);
  const b = Number(m.scoreB ?? 0);
  if (a !== 0 || b !== 0) failures.push(`[BYE score] Match ${code}: score must be 0-0`);
  if (Array.isArray(m.stats)) {
    for (const s of m.stats) {
      const canestri = Number(s?.canestri ?? 0);
      const soffi = Number(s?.soffi ?? 0);
      if (canestri !== 0 || soffi !== 0) failures.push(`[BYE stats] Match ${code}: stats must be zeroed`);
    }
  }
}

// Ensure we don't have a real team called BYE in roster teams arrays
const allTeamsArrays = [];
if (Array.isArray(state.teams)) allTeamsArrays.push(state.teams);
if (state.tournament && Array.isArray(state.tournament.teams)) allTeamsArrays.push(state.tournament.teams);
for (const t of Array.isArray(state.tournamentHistory) ? state.tournamentHistory : []) {
  if (Array.isArray(t.teams)) allTeamsArrays.push(t.teams);
}
for (const arr of allTeamsArrays) {
  for (const team of arr) {
    if (team?.id === 'BYE' || String(team?.name || '').trim().toUpperCase() === 'BYE') {
      failures.push(`[BYE team] Found a real team entry named/with id BYE. BYE must be implicit in matches only.`);
    }
  }
}

if (failures.length) {
  console.error('Invariant check FAILED:\n');
  for (const f of failures) console.error('-', f);
  process.exit(1);
}

console.log('Invariant check OK');