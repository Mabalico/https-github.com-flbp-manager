import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const nodeBin = JSON.stringify(process.execPath);

const run = (cmd) => {
  execSync(cmd, { stdio: 'inherit', cwd: rootDir });
};

// Usage:
//   npm run release:check -- <backup.json>
// If a backup path is provided, we also run the invariants/sanitization suite.

const args = process.argv.slice(2).filter(Boolean);
const backupPath = args[0];

run(`${nodeBin} ./node_modules/vite/bin/vite.js build`);

if (backupPath) {
  run(`${nodeBin} ./scripts/check-all.mjs ${JSON.stringify(backupPath)}`);
} else {
  console.log('\n[release:check] Build OK. Pass a backup path to also run check:all.');
  console.log('Example: npm run release:check -- ./backup.json\n');
}
