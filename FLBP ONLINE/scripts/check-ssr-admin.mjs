import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Build environment is fixture-only, including when invoked from a deployment shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
const run = args => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.ssr-admin-tests.config.ts', '--logLevel', 'warn']);
run(['.tmp-ssr-admin/admin-ssr.mjs']);
