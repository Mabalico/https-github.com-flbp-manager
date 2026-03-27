#!/usr/bin/env node
import path from 'node:path';
import { inspectBackupLikeJson, readJsonFile } from './backup-profile-utils.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/inspect-backup-profile.mjs path/to/backup.json');
  process.exit(2);
}

const abs = path.resolve(process.cwd(), file);
const raw = readJsonFile(abs);
const result = inspectBackupLikeJson(raw);

if (result.kind !== 'backup-json') {
  console.error(`File non compatibile con il backup FLBP: ${file}`);
  process.exit(1);
}

console.log(`File: ${file}`);
console.log(`Wrapper: ${result.wrapper}`);
console.log(`Profilo: ${result.profile}`);
console.log(`Teams: ${result.summary.teams}`);
console.log(`Matches: ${result.summary.matches}`);
console.log(`Tournament history: ${result.summary.tournamentHistory}`);
console.log(`Hall of Fame: ${result.summary.hallOfFame}`);
console.log(`Integrations scorers: ${result.summary.integrationsScorers}`);
console.log(`YoB live teams: ${result.summary.liveTeamsWithLegacyYoB}`);
console.log(`YoB live tournament: ${result.summary.liveTournamentTeamsWithLegacyYoB}`);
console.log(`YoB history teams: ${result.summary.historyTeamsWithLegacyYoB}`);
console.log(`YoB scorer entries: ${result.summary.scorerEntriesWithLegacyYoB}`);
