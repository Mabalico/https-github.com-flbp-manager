import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.tmp-fanta-save-retry-tests',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/fantabeerpong/fantaSaveRetry.test.ts',
      formats: ['es'],
      fileName: () => 'fantaSaveRetry.test.js',
    },
    rollupOptions: {
      external: [],
    },
  },
});
