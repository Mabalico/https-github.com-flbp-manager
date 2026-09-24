import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const common = [
  'typecheck', 'test:data', 'test:editor', 'test:persistence', 'test:local-storage',
  'test:referee-save', 'test:restore-ui', 'test:spreadsheet-compat',
  'test:fanta-save-retry', 'test:tv-route', 'check:ssr-admin', 'check:ssr-editions',
  'check:ssr-tv', 'check:tv-readonly', 'check:i18n', 'build',
];
const onlineOnly = ['check:durability', 'test:local-data-plane', 'test:cloud-durability', 'test:backup-edge', 'test:referee-client'];
const isOnline = fs.existsSync(path.join(root, 'scripts/check-data-durability.mjs'));
const tasks = [...common, ...(isOnline ? onlineOnly : [])];
if (process.argv.includes('--list')) {
  console.log(tasks.join('\n'));
  process.exit(0);
}
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) {
  console.error('Run this gate through npm: npm run check:web');
  process.exit(2);
}
for (const name of tasks) {
  if (!manifest.scripts[name]) throw new Error('Required web gate script missing: ' + name);
  console.log('\n[check:web] ' + name);
  const result = spawnSync(process.execPath, [npmCli, 'run', name], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\n[check:web] ' + tasks.length + ' web gates passed.');
