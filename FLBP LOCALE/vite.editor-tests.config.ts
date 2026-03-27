import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.tmp-node-tests',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/editor/tournamentStructure.test.ts',
      formats: ['es'],
      fileName: () => 'tournamentStructure.test.js',
    },
    rollupOptions: {
      external: [],
    },
  },
});
