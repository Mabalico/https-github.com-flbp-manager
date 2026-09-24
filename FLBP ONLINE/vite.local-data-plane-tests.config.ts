import { defineConfig } from 'vite';

export default defineConfig({
  // The service contract tests must not depend on a developer's .env files
  // or inherited VITE_* variables. All requests are handled by the test fetch.
  envDir: false,
  envPrefix: [],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://durability-test.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-durability-anon-key'),
    'import.meta.env.VITE_WORKSPACE_ID': JSON.stringify('default'),
  },
  build: {
    outDir: '.tmp-node-tests',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: 'tests/durability/localDataPlaneClient.test.ts',
      formats: ['es'],
      fileName: () => 'localDataPlaneClient.test.js',
    },
    rollupOptions: { external: [] },
  },
});
