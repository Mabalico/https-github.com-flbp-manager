import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, '.tmp-ssr-tv');
// Build environment is fixture-only, including when invoked from a deployment shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
const run = args => {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

// Compile _ssr_tv_check.tsx against the current TV sources on every run, execute
// the bundle, then delete it: no generated bundle is kept or committed.
let status = 1;
try {
  status = run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.ssr-tv-tests.config.ts', '--logLevel', 'warn']);
  if (status === 0) status = run(['.tmp-ssr-tv/tv-ssr.mjs']);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
process.exit(status);
