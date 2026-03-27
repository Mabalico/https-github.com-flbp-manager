import fs from 'node:fs';
import path from 'node:path';
import { analyzeFile } from './backup-profile-utils.mjs';

const ROOT = process.cwd();
const CANDIDATE_DIRS = ['docs', '.codex-tmp', 'release_bundle'];
const IGNORE_SUFFIXES = ['_summary.json'];
const REPORT_PATH = path.join(ROOT, 'docs', 'BACKUP_PROFILE_AUDIT.md');
const IGNORE_RELATIVE_PREFIXES = [
  '.codex-tmp/edge-perf-',
];

function walkJsonFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    const relCurrent = path.relative(ROOT, current).replace(/\\/g, '/');
    if (IGNORE_RELATIVE_PREFIXES.some((prefix) => relCurrent.startsWith(prefix))) continue;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
      continue;
    }
    if (!current.endsWith('.json')) continue;
    const rel = path.relative(ROOT, current).replace(/\\/g, '/');
    if (IGNORE_SUFFIXES.some((suffix) => rel.endsWith(suffix))) continue;
    out.push(rel);
  }
  return out.sort();
}

const candidates = CANDIDATE_DIRS.flatMap(walkJsonFiles);
const results = candidates.map((relPath) => analyzeFile(ROOT, relPath)).filter((entry) => entry.kind === 'backup-json');
const modern = results.filter((entry) => entry.profile === 'modern');
const legacy = results.filter((entry) => entry.profile === 'legacy-compatible');
const generatedAt = new Date().toISOString();

const lines = [];
lines.push('# Audit profilo backup JSON inclusi nel repository');
lines.push('');
lines.push(`Generato automaticamente da \`npm run audit:backup-profiles\` il ${generatedAt}.`);
lines.push('');
lines.push('Questo report censisce solo i JSON **già inclusi nello ZIP/repository** che espongono davvero una shape di backup FLBP (sample, import, restore, fixture operative). I template/stub senza stato completo vengono ignorati.');
lines.push('Non analizza i backup caricati in chat o i file esterni dell\'utente.');
lines.push('');
lines.push(`- File backup-like trovati: **${results.length}**`);
lines.push(`- Profilo **modern**: **${modern.length}**`);
lines.push(`- Profilo **legacy-compatible**: **${legacy.length}**`);
lines.push('');
lines.push('## Risultato');
lines.push('');
if (!legacy.length) {
  lines.push('- Tutti i JSON backup-like inclusi nel repository risultano **moderni**.');
  lines.push('- Non è stata necessaria alcuna migrazione dei file di esempio/template già versionati.');
  lines.push('- La compatibilità YoB resta attiva solo per backup esterni o snapshot legacy non inclusi nel repository.');
} else {
  lines.push('- Sono presenti file **legacy-compatible** che richiedono ancora fallback YoB.');
  lines.push('- Prima di rimuovere YoB dal modello di restore serve una migrazione esplicita di quei file.');
}
lines.push('');
lines.push('## Dettaglio file');
lines.push('');
lines.push('| File | Wrapper | Profilo | Teams | Storico | HoF | Scorers | YoB live | YoB torneo | YoB storico | YoB scorers |');
lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const item of results) {
  lines.push(`| \`${item.path}\` | ${item.wrapper} | **${item.profile}** | ${item.summary.teams} | ${item.summary.tournamentHistory} | ${item.summary.hallOfFame} | ${item.summary.integrationsScorers} | ${item.summary.liveTeamsWithLegacyYoB} | ${item.summary.liveTournamentTeamsWithLegacyYoB} | ${item.summary.historyTeamsWithLegacyYoB} | ${item.summary.scorerEntriesWithLegacyYoB} |`);
}
lines.push('');
lines.push('## Uso');
lines.push('');
lines.push('```bash');
lines.push('npm run audit:backup-profiles');
lines.push('```');
lines.push('');
lines.push('Il comando rigenera questo report e fallisce solo se non riesce a leggere un JSON incluso nel repository.');

fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`Audit completato: ${results.length} file backup-like, ${legacy.length} legacy-compatible.`);
console.log(`Report scritto in ${path.relative(ROOT, REPORT_PATH).replace(/\\/g, '/')}`);
