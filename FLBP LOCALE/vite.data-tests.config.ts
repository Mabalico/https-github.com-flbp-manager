import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.tmp-node-tests',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/data/playerDataManagement.test.ts',
      formats: ['es'],
      fileName: () => 'playerDataManagement.test.js',
    },
    rollupOptions: {
      external: [],
    },
  },
});
