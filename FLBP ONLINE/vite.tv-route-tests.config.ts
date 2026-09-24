import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.tmp-tv-route-tests',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/tv/tvProjectionRoute.test.ts',
      formats: ['es'],
      fileName: () => 'tvProjectionRoute.test.js',
    },
    rollupOptions: {
      external: [],
    },
  },
});
