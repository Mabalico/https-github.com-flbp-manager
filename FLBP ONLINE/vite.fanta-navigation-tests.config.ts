import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const ioFixture = path.join(root, 'tests/ui/fantaNavigationFixtures.tsx');
export default defineConfig({
  root,
  envDir: path.join(root, '.tmp-fanta-navigation/no-env'),
  cacheDir: '.tmp-fanta-navigation/vite-cache',
  optimizeDeps: { entries: ['tests/ui/fantaNavigation.html'] },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
    'import.meta.env.VITE_REMOTE_REPO': '"0"',
    'import.meta.env.VITE_ALLOW_LOCAL_ONLY': '"1"',
    'import.meta.env.VITE_AUTO_STRUCTURED_SYNC': '"0"',
    'import.meta.env.VITE_PUBLIC_DB_READ': '"0"',
  },
  plugins: [{
    name: 'fanta-navigation-io-fixture',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return;
      if (source.endsWith('/getRepository') || source.endsWith('/AdminDashboard')) return ioFixture;
      // The dependency scanner caches resolutions per source and importer directory, so an
      // importer-specific redirect would leak to sibling files and break the scan. Vite passes
      // `scan` to plugin hooks at runtime but its public hook type does not declare it.
      if ((options as { scan?: boolean } | undefined)?.scan) return;
      const parent = importer.replace(/\\/g, '/').split('?')[0];
      if (source.endsWith('/fantaSupabaseService') && (
        parent.endsWith('/components/FantaBeerpong.tsx')
        || parent.endsWith('/components/fantabeerpong/FantaHistorySection.tsx'))) return ioFixture;
    },
  }],
  server: { host: '127.0.0.1', port: 0 },
});
