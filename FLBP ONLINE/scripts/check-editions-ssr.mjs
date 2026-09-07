import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outfile = resolve('.tmp-node-tests/editionSsr.mjs');
await build({
  entryPoints: ['tests/ui/editionSsr.tsx'], outfile, bundle: true,
  platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});
await import(pathToFileURL(outfile).href);
