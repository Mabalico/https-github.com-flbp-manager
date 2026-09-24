import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-spreadsheet-compat-'));
try {
  // Browser-style bundling exercises the same ESM entry points as production.
  await build({
    root,
    configFile: false,
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'es2022',
      lib: {
        entry: path.join(root, 'tests/dependencies/spreadsheetCompatibility.test.ts'),
        formats: ['es'],
        fileName: () => 'spreadsheetCompatibility.test.mjs',
      },
      rollupOptions: {
        external: (id) => id.startsWith('node:'),
        output: { chunkFileNames: '[name]-[hash].mjs' },
      },
    },
  });
  const result = spawnSync(process.execPath, ['--test', path.join(outDir, 'spreadsheetCompatibility.test.mjs')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      TZ: 'Europe/Rome',
      FLBP_SPREADSHEET_FIXTURE: path.join(root, 'tests/dependencies/fixtures/legacy-cp1251.xls'),
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
