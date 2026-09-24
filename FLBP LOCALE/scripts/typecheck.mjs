import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scopes = process.argv.slice(2);
if (!scopes.length) scopes.push('browser', 'tests');
if (scopes.some((scope) => !['browser', 'tests', 'deno'].includes(scope))) {
  console.error('Usage: node scripts/typecheck.mjs [browser|tests|deno ...]');
  process.exit(1);
}

for (const scope of scopes) {
  const start = performance.now();
  let command = process.execPath;
  let args = [resolve(root, 'node_modules/typescript/bin/tsc'), '--project', `tsconfig.${scope}.json`, '--pretty', 'false'];
  if (scope === 'deno') {
    command = 'deno';
    const functionsRoot = resolve(root, 'supabase/functions');
    const entries = readdirSync(functionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => `supabase/functions/${entry.name}/index.ts`);
    args = ['check', ...entries];
  }
  console.log(`[typecheck:${scope}] Checking source files`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(scope === 'deno' && result.error.code === 'ENOENT'
      ? 'Deno is required for Edge Function typechecking. Install Deno and rerun typecheck:deno; this check has not passed.'
      : result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[typecheck:${scope}] Failed after ${((performance.now() - start) / 1000).toFixed(1)}s`);
    process.exit(result.status ?? 1);
  }
  console.log(`[typecheck:${scope}] Passed in ${((performance.now() - start) / 1000).toFixed(1)}s`);
}
