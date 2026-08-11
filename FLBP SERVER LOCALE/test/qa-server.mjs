import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalServer } from '../src/server.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-browser-qa-'));
const qaTournament = {
  id: 'qa-sqlite-tournament',
  name: 'QA SQLite locale',
  type: 'elimination',
  startDate: '2026-08-01',
  teams: [],
  rounds: [],
  matches: [],
  config: { advancingPerGroup: 2 },
};
const fixture = {
  teams: [], matches: [], tournament: null, tournamentMatches: [],
  tournamentHistory: [qaTournament], hallOfFame: [], integrationsScorers: [],
  playerAliases: {}, logo: '',
};
const app = createLocalServer({
  host: '127.0.0.1',
  port: 8799,
  dataDir,
  secondaryBackupDir: '',
  requireSecondaryBackup: false,
  workspaceId: 'default',
  adminToken: 'browser-qa-token-longer-than-thirty-two-characters',
  allowedOrigins: ['http://127.0.0.1:8799'],
  publicUrl: '',
  supabaseUrl: '',
  supabaseServiceRoleKey: '',
  heartbeatIntervalMs: 60_000,
  fullBackupIntervalMs: 60_000,
  webDist: path.resolve(process.cwd(), '../FLBP ONLINE/dist'),
  databaseFilename: 'browser-qa.sqlite',
});
app.store.importCloudSnapshot({ state: fixture, publicState: fixture });
app.store.setActive(true, 1);
await app.listen();
console.log(JSON.stringify({ ok: true, url: 'http://127.0.0.1:8799/', dataDir, pid: process.pid }));

const stop = async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
