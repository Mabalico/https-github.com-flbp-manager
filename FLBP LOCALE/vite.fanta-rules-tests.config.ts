import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(root, 'tests/ui/fantaArchivedRulesFixtures.tsx');
const isolatedViews = new Set([
  'FantaOverviewSection', 'FantaMyTeamSection', 'FantaGeneralStandingsSection',
  'FantaPlayersStandingsSection', 'FantaTeamDetail', 'FantaPlayerDetail',
  'FantaHistoryEditionDetail', 'FantaTeamBuilder',
]);

// Real shell, HistorySection and RulesSection; replace only IO and unrelated views.
// No production config imports this fixture or rewrites the behavior under test.
export default defineConfig({
  root,
  envDir: path.join(root, '.tmp-fanta-rules/no-env'),
  cacheDir: '.tmp-fanta-rules/vite-cache',
  optimizeDeps: { entries: ['tests/ui/fantaArchivedRules.html'] },
  plugins: [{
    name: 'fanta-rules-isolated-fixture',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return;
      const name = path.posix.basename(source);
      if (name === 'App' || name === 'fantaSupabaseService' || name === 'playerAppService'
        || isolatedViews.has(name)) return fixture;
    },
  }],
  server: { host: '127.0.0.1', port: 0 },
});
