import fs from 'node:fs';
import path from 'node:path';

export const APP_STATE_ROOT_KEYS = [
  '__schemaVersion',
  'teams',
  'matches',
  'tournament',
  'tournamentMatches',
  'tournamentHistory',
  'logo',
  'hallOfFame',
  'integrationsScorers',
  'playerAliases'
];

export const hasLegacyYoB = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
export const hasUsableBirthDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

export function extractState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state)) return raw.state;
  return raw;
}

export function countTeamsWithLegacyYoB(teams) {
  return Array.isArray(teams)
    ? teams.filter((team) => team && typeof team === 'object' && (hasLegacyYoB(team.player1YoB) || hasLegacyYoB(team.player2YoB))).length
    : 0;
}

export function countScorersWithLegacyYoB(entries) {
  return Array.isArray(entries)
    ? entries.filter((entry) => entry && typeof entry === 'object' && hasLegacyYoB(entry.yob)).length
    : 0;
}

export function inspectBackupLikeJson(raw) {
  const state = extractState(raw);
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { kind: 'non-backup-json' };
  }
  const foundKeys = APP_STATE_ROOT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(state, key));
  if (!foundKeys.length) {
    return { kind: 'non-backup-json' };
  }

  const liveTeamsWithLegacyYoB = countTeamsWithLegacyYoB(state.teams);
  const liveTournamentTeamsWithLegacyYoB = countTeamsWithLegacyYoB(state.tournament?.teams);
  const historyTeamsWithLegacyYoB = Array.isArray(state.tournamentHistory)
    ? state.tournamentHistory.reduce((acc, tournament) => acc + countTeamsWithLegacyYoB(tournament?.teams), 0)
    : 0;
  const scorerEntriesWithLegacyYoB = countScorersWithLegacyYoB(state.integrationsScorers);
  const totalLegacyYoB = liveTeamsWithLegacyYoB + liveTournamentTeamsWithLegacyYoB + historyTeamsWithLegacyYoB + scorerEntriesWithLegacyYoB;

  return {
    kind: 'backup-json',
    wrapper: raw && raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state) ? 'state' : 'raw',
    profile: totalLegacyYoB > 0 ? 'legacy-compatible' : 'modern',
    summary: {
      teams: Array.isArray(state.teams) ? state.teams.length : 0,
      matches: Array.isArray(state.matches) ? state.matches.length : 0,
      tournamentHistory: Array.isArray(state.tournamentHistory) ? state.tournamentHistory.length : 0,
      hallOfFame: Array.isArray(state.hallOfFame) ? state.hallOfFame.length : 0,
      integrationsScorers: Array.isArray(state.integrationsScorers) ? state.integrationsScorers.length : 0,
      liveTeamsWithLegacyYoB,
      liveTournamentTeamsWithLegacyYoB,
      historyTeamsWithLegacyYoB,
      scorerEntriesWithLegacyYoB,
    }
  };
}

export function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

export function analyzeFile(rootDir, relPath) {
  const abs = path.join(rootDir, relPath);
  const raw = readJsonFile(abs);
  return { path: relPath, ...inspectBackupLikeJson(raw) };
}
