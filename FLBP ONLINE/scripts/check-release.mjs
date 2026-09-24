import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const run = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run(['scripts/check-web.mjs']);
if (backupPath) run(['scripts/check-all.mjs', backupPath]);
console.log('[release:check] Web gates passed. SQL/Edge and device checks use their dedicated pipelines.');
