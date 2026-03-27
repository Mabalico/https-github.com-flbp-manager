#!/usr/bin/env node

/**
 * Validates that a public snapshot does not contain sensitive fields.
 * Dependency-free: scans the JSON string for forbidden keys.
 *
 * Usage:
 *   node scripts/check-public-sanitization.mjs path/to/backup.json
 */

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-public-sanitization.mjs path/to/backup.json');
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error('Cannot read file:', e?.message || String(e));
  process.exit(2);
}

// Forbidden keys in public snapshot
const forbidden = [
  'player1YoB',
  'player2YoB',
  'yob',
  'playerKey',
  'playerId',
  'playerAliases'
];

const hits = [];
for (const k of forbidden) {
  // quick substring check; this is intentional and conservative
  if (raw.includes(`"${k}"`)) hits.push(k);
}

if (hits.length) {
  console.error('Public sanitization check FAILED. Found forbidden keys:', hits.join(', '));
  process.exit(1);
}

console.log('Public sanitization check OK');
