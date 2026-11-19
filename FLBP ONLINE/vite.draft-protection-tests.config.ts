import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(root, 'tests/ui/draftProtectionFixtures.tsx');

export default defineConfig({
  root, envDir: false, envPrefix: [], cacheDir: '.tmp-draft-protection/vite-cache',
  optimizeDeps: { entries: ['tests/ui/draftProtection.html'] },
  plugins: [{
    name: 'isolated-draft-io', enforce: 'pre',
    resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return;
      const owner = importer.replaceAll('\\', '/');
      const name = path.posix.basename(source);
      if (name === 'App') return fixture;
      // The dependency scanner caches resolutions per source and importer directory, so an
      // importer-specific redirect would leak to sibling files and break the scan. Vite passes
      // `scan` to plugin hooks at runtime but its public hook type does not declare it.
      if ((options as { scan?: boolean } | undefined)?.scan) return;
      if (owner.endsWith('/FantaTeamBuilder.tsx') && ['fantaSupabaseService', 'playerAppService'].includes(name)) return fixture;
      if (owner.endsWith('/admin/tabs/DataTab.tsx') && source === './data') return fixture;
    },
  }],
  server: { host: '127.0.0.1', port: 0 },
});
