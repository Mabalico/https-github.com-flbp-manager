import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// Used only by scripts/check-ssr-tv.mjs: compiles the current TV sources into a
// throwaway bundle on every run (the script deletes .tmp-ssr-tv afterwards).
export default defineConfig({
  root,
  // Never embed deployment .env files in a test artifact.
  envDir: path.join(root, '.tmp-ssr-tv/no-env'),
  build: {
    ssr: path.join(root, '_ssr_tv_check.tsx'),
    outDir: '.tmp-ssr-tv',
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
    sourcemap: false,
    target: 'node20',
    rollupOptions: {
      output: { entryFileNames: 'tv-ssr.mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
});
