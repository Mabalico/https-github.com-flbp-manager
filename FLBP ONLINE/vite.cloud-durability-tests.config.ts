import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.tmp-node-tests',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/durability/cloudAdminIdempotency.test.ts',
      formats: ['es'],
      fileName: () => 'cloudAdminIdempotency.test.js',
    },
    rollupOptions: { external: [] },
  },
});
