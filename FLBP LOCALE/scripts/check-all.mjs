#!/usr/bin/env node

/**
 * Runs all local regression checks.
 *
 * Usage:
 *   node scripts/check-all.mjs path/to/backup.json
 */

import { spawnSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-all.mjs path/to/backup.json');
  process.exit(2);
}

const run = (script) => {
  const r = spawnSync(process.execPath, [script, file], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
};

run('scripts/check-invariants.mjs');
run('scripts/check-public-sanitization.mjs');

console.log('All checks OK');
