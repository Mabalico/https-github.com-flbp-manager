import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.tmp-node-tests',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/sim/coppaBaobabLocalSimulation.ts',
      formats: ['es'],
      fileName: () => 'coppaBaobabLocalSimulation.js',
    },
    rollupOptions: {
      external: [/^node:/],
    },
  },
});
