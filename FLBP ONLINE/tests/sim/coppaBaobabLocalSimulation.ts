// Simulazione end-to-end del torneo reale "Coppa Baobab" sul data plane locale.
// Il file non contiene credenziali: legge esclusivamente i file .env ignorati da git.

import './nodeShims';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AppState } from '../../services/storageService';
import { coerceAppState } from '../../services/storageService';
import type { Match, Team } from '../../types';
import { generateTournamentStructure } from '../../services/tournamentEngine';
import {
  buildTournamentStructureSnapshot,
  getRound1Matches,
  getSlotValue,
  reconcileBracketAdvancements,
} from '../../services/tournamentStructureSelectors';
import { applyStructuralOperation } from '../../services/tournamentStructureOperations';
import { prepareTournamentStructureApply } from '../../services/tournamentStructureApply';
import { cloneMatchesForResultSync, collectChangedMatchResults } from '../../services/matchUtils';
import { withRefereeReportAudit } from '../../services/refereeReportAudit';
import {
  getSupabaseConfig,
  promoteFantaPretournamentToTournament,
  pullWorkspaceState,
  pushLiveTournamentIncremental,
  resetFantaConfigToPretournament,
  sanitizeAppStateForPublic,
  setRemoteBaseUpdatedAt,
  setSupabaseSession,
  signInWithPassword,
} from '../../services/supabaseRest';
import { initAdminWriteLease, releaseAdminWriteLease } from '../../services/adminWriteLease';
import { readAdminLeaseInfo } from '../../services/adminWriteLeaseState';

type SourceStat = { team: string; player: string; canestri: number; soffi: number };
type ReportSpec = { a: string; b: string; scoreA: number; scoreB: number; stats: SourceStat[] };
type JsonRecord = Record<string, any>;

const stat = (team: string, player: string, canestri: number, soffi: number): SourceStat => ({
  team, player, canestri, soffi,
});
const report = (a: string, b: string, scoreA: number, scoreB: number, stats: SourceStat[]): ReportSpec => ({
  a, b, scoreA, scoreB, stats,
});

const REPORTS: ReportSpec[] = [
  report('Manco na tocca', 'Dos Los Ramatos', 10, 5, [stat('Manco na tocca', 'Alessandro Materazzi', 5, 0), stat('Manco na tocca', 'Riccardo De Martino', 5, 0), stat('Dos Los Ramatos', 'Giuseppe Pagano', 5, 3), stat('Dos Los Ramatos', 'Matteo Bene', 0, 0)]),
  report('Tutatop', 'Wawoncelli', 10, 7, [stat('Tutatop', 'Filippo Bimbi', 5, 0), stat('Tutatop', 'Filippo Pennucci', 5, 0), stat('Wawoncelli', 'Marco Baroncelli', 4, 1), stat('Wawoncelli', 'Costantino Marsili', 3, 0)]),
  report('Pedry Lovers', 'Bagnini', 10, 9, [stat('Pedry Lovers', 'Arianna Martini', 3, 0), stat('Pedry Lovers', 'Micol Bertelloni', 7, 0), stat('Bagnini', 'Gianpaolo Bruni', 7, 0), stat('Bagnini', 'Davide Nutile', 2, 0)]),
  report('Gli Smerdini', 'Ccc Brothers', 10, 9, [stat('Gli Smerdini', 'Yonas Panigada', 6, 1), stat('Gli Smerdini', 'Michele Rossi', 4, 0), stat('Ccc Brothers', 'Lorenzo Ceccotti', 6, 0), stat('Ccc Brothers', 'Andrea Ceccotti', 3, 1)]),
  report('Compagni di Merende', 'Si Vola', 10, 7, [stat('Compagni di Merende', 'Niccolò Lanzini', 3, 1), stat('Compagni di Merende', 'Giacomo Ruggeri', 7, 0), stat('Si Vola', 'Annamaria Bertolla', 5, 0), stat('Si Vola', 'Marco Alibano', 2, 0)]),
  report('Gli Amici di B. O. R. I. S.', 'Joderz', 10, 9, [stat('Gli Amici di B. O. R. I. S.', 'Ludovico Giusti', 6, 1), stat('Gli Amici di B. O. R. I. S.', 'Riccardo Bianchi', 4, 0), stat('Joderz', 'Marco Pini', 6, 1), stat('Joderz', 'Francesco Di Gennario', 3, 1)]),
  report('Latin Mafia', "Beck's Street Boys", 10, 7, [stat('Latin Mafia', 'Matteo Corsi', 7, 2), stat('Latin Mafia', 'Paolo Austeri', 3, 0), stat("Beck's Street Boys", 'Manuel Mariani', 4, 0), stat("Beck's Street Boys", 'Elia Briglia', 3, 0)]),
  report('Tartarughine', 'Gufi', 10, 0, [stat('Tartarughine', 'Caterina Terreni', 5, 0), stat('Tartarughine', 'Francesco Brunicardi', 5, 0), stat('Gufi', 'Diego Buongiorno', 0, 0), stat('Gufi', 'Gaetano Mattarocci', 0, 0)]),
  report('Le Palline Calde', 'Vabben Moivven', 10, 5, [stat('Le Palline Calde', 'Mattia Mazzucchi', 4, 0), stat('Le Palline Calde', 'Emanuele Frugoli', 6, 0), stat('Vabben Moivven', 'Matteo Peranzoni', 4, 0), stat('Vabben Moivven', 'Raffaele Cecchinato', 1, 0)]),

  report('Manco na tocca', 'The Warriors', 11, 10, [stat('Manco na tocca', 'Alessandro Materazzi', 7, 0), stat('Manco na tocca', 'Riccardo De Martino', 4, 2), stat('The Warriors', 'Giancarlo Vannucci', 5, 0), stat('The Warriors', 'Matteo Del Grande', 5, 1)]),
  report('Il Popolo Della Gaina', 'N beer A', 10, 0, [stat('Il Popolo Della Gaina', 'Gabriele Della Bona', 8, 0), stat('Il Popolo Della Gaina', 'Simone Baccei', 2, 0), stat('N beer A', 'Chiara Pullerà', 0, 0), stat('N beer A', 'Gianluca Frusciante', 0, 0)]),
  report('Ionicoperiodico', 'I Facometepareame', 10, 8, [stat('Ionicoperiodico', 'Caterina Persiani', 5, 0), stat('Ionicoperiodico', 'Gianni Schicchi', 5, 0), stat('I Facometepareame', 'Andra Basteri', 4, 0), stat('I Facometepareame', 'Simone Ballero', 4, 0)]),
  report('Sotto Cassa', 'Tutatop', 10, 8, [stat('Sotto Cassa', "Giulia Dell'Unto", 5, 0), stat('Sotto Cassa', 'Sharon Sauella', 5, 0), stat('Tutatop', 'Filippo Bimbi', 4, 0), stat('Tutatop', 'Filippo Pennucci', 4, 0)]),
  report('Gli Smerdini', 'Pedry Lovers', 10, 9, [stat('Gli Smerdini', 'Michele Rossi', 6, 0), stat('Gli Smerdini', 'Yonas Panigada', 4, 3), stat('Pedry Lovers', 'Arianna Martini', 4, 1), stat('Pedry Lovers', 'Micol Bertelloni', 5, 2)]),
  report('Compagni di Merende', 'Gli Amici di B. O. R. I. S.', 10, 3, [stat('Compagni di Merende', 'Niccolò Lanzini', 4, 0), stat('Compagni di Merende', 'Giacomo Ruggeri', 6, 0), stat('Gli Amici di B. O. R. I. S.', 'Ludovico Giusti', 2, 0), stat('Gli Amici di B. O. R. I. S.', 'Riccardo Bianchi', 1, 0)]),
  report('Latin Mafia', 'Puppare', 10, 4, [stat('Latin Mafia', 'Matteo Corsi', 7, 1), stat('Latin Mafia', 'Paolo Austeri', 3, 0), stat('Puppare', 'Gianni Vagli', 3, 1), stat('Puppare', 'Nicola Manfredini', 1, 0)]),
  report('Tartarughine', 'Le Palline Calde', 10, 9, [stat('Tartarughine', 'Caterina Terreni', 3, 0), stat('Tartarughine', 'Francesco Brunicardi', 7, 4), stat('Le Palline Calde', 'Emanuele Frugoli', 6, 0), stat('Le Palline Calde', 'Mattia Mazzucchi', 3, 1)]),

  report('Manco na tocca', 'Il Popolo Della Gaina', 10, 8, [stat('Manco na tocca', 'Alessandro Materazzi', 4, 0), stat('Manco na tocca', 'Riccardo De Martino', 6, 2), stat('Il Popolo Della Gaina', 'Simone Baccei', 3, 0), stat('Il Popolo Della Gaina', 'Gabriele Della Bona', 5, 1)]),
  report('Ionicoperiodico', 'Sotto Cassa', 10, 8, [stat('Ionicoperiodico', 'Caterina Persiani', 5, 0), stat('Ionicoperiodico', 'Gianni Schicchi', 5, 0), stat('Sotto Cassa', "Giulia Dell'Unto", 4, 0), stat('Sotto Cassa', 'Sharon Sauella', 4, 0)]),
  report('Compagni di Merende', 'Gli Smerdini', 10, 8, [stat('Compagni di Merende', 'Niccolò Lanzini', 5, 0), stat('Compagni di Merende', 'Giacomo Ruggeri', 5, 0), stat('Gli Smerdini', 'Michele Rossi', 6, 0), stat('Gli Smerdini', 'Yonas Panigada', 2, 0)]),
  report('Latin Mafia', 'Tartarughine', 11, 10, [stat('Latin Mafia', 'Matteo Corsi', 6, 0), stat('Latin Mafia', 'Paolo Austeri', 5, 0), stat('Tartarughine', 'Caterina Terreni', 4, 0), stat('Tartarughine', 'Francesco Brunicardi', 6, 2)]),

  report('Manco na tocca', 'Ionicoperiodico', 10, 8, [stat('Manco na tocca', 'Alessandro Materazzi', 5, 0), stat('Manco na tocca', 'Riccardo De Martino', 5, 0), stat('Ionicoperiodico', 'Caterina Persiani', 4, 0), stat('Ionicoperiodico', 'Gianni Schicchi', 4, 0)]),
  report('Compagni di Merende', 'Latin Mafia', 11, 10, [stat('Compagni di Merende', 'Niccolò Lanzini', 5, 0), stat('Compagni di Merende', 'Giacomo Ruggeri', 6, 1), stat('Latin Mafia', 'Matteo Corsi', 4, 2), stat('Latin Mafia', 'Paolo Austeri', 6, 0)]),
  report('Compagni di Merende', 'Manco na tocca', 10, 8, [stat('Compagni di Merende', 'Niccolò Lanzini', 3, 1), stat('Compagni di Merende', 'Giacomo Ruggeri', 7, 0), stat('Manco na tocca', 'Riccardo De Martino', 3, 3), stat('Manco na tocca', 'Alessandro Materazzi', 5, 0)]),
];

// Posizioni del primo turno dopo l'avvio. Ogni coppia alimenta lo stesso ottavo.
const ROUND1_TARGETS: Array<[string, string]> = [
  ['Manco na tocca', 'Dos Los Ramatos'],
  ['The Warriors', 'BYE'],
  ['Il Popolo Della Gaina', 'BYE'],
  ['N beer A', 'BYE'],
  ['Ionicoperiodico', 'BYE'],
  ['I Facometepareame', 'BYE'],
  ['Sotto Cassa', 'BYE'],
  ['Tutatop', 'Wawoncelli'],
  ['Gli Smerdini', 'Ccc Brothers'],
  ['Pedry Lovers', 'Bagnini'],
  ['Compagni di Merende', 'Si Vola'],
  ['Gli Amici di B. O. R. I. S.', 'Joderz'],
  ['Latin Mafia', "Beck's Street Boys"],
  ['Puppare', 'BYE'],
  ['Tartarughine', 'Gufi'],
  ['Le Palline Calde', 'Vabben Moivven'],
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();
const runId = `coppa-baobab-${Date.now()}`;
const dryRun = process.argv.includes('--dry-run');
const fast = process.argv.includes('--fast');

const parseEnvFile = (filename: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1].trim()] = value;
  }
  return out;
};

const localEnv = parseEnvFile(path.resolve(process.cwd(), '../FLBP SERVER LOCALE/.env'));
const simEnv = parseEnvFile(path.resolve(process.cwd(), '.env.sim'));
const localBase = `http://127.0.0.1:${localEnv.FLBP_PORT || '8787'}`;
const workspaceId = localEnv.FLBP_WORKSPACE_ID || 'default';
const localToken = localEnv.FLBP_LOCAL_ADMIN_TOKEN || '';
const serviceUrl = (localEnv.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = localEnv.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY || '';
const writerId = `${runId}-writer`;
const secondWriterId = `${runId}-second-window`;

if (!localToken || !serviceUrl || !serviceKey) throw new Error('Configurazione server locale incompleta.');

const normalize = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const tokenKey = (value: string) => normalize(value).split(' ').filter(Boolean).sort().join('|');

const requestLog: Array<{ at: string; label: string; method: string; status: number; ms: number; requestBytes: number; responseBytes: number }> = [];
const requestJson = async (label: string, url: string, init: RequestInit = {}) => {
  const started = Date.now();
  const response = await fetch(url, init);
  const text = await response.text();
  requestLog.push({
    at: nowIso(), label, method: String(init.method || 'GET'), status: response.status,
    ms: Date.now() - started, requestBytes: typeof init.body === 'string' ? Buffer.byteLength(init.body) : 0,
    responseBytes: Buffer.byteLength(text),
  });
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const error: any = new Error(`${label}: HTTP ${response.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
};

const localHeaders = (writer?: string) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'x-flbp-local-token': localToken,
  ...(writer ? { 'x-flbp-writer-id': writer } : {}),
});

const getHealth = () => requestJson('local health', `${localBase}/health`);
const pullLocal = () => requestJson('local admin pull', `${localBase}/api/v1/admin/workspace/${encodeURIComponent(workspaceId)}`, {
  headers: { Accept: 'application/json', 'x-flbp-local-token': localToken },
});
const postLocal = (label: string, route: string, body: JsonRecord, writer?: string) => requestJson(label, `${localBase}${route}`, {
  method: 'POST', headers: localHeaders(writer), body: JSON.stringify(body),
});

const serviceHeaders = () => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'User-Agent': 'FLBP-Local-Simulation/1.0',
});
const serviceGet = (label: string, resource: string) => requestJson(label, `${serviceUrl}/rest/v1/${resource}`, { headers: serviceHeaders() });

const teamByName = (teams: Team[], name: string): Team => {
  const matches = teams.filter((team) => normalize(team.name) === normalize(name));
  if (matches.length !== 1) throw new Error(`Squadra "${name}" non risolta univocamente (${matches.length}).`);
  return matches[0];
};
const teamNameById = (teams: Team[], id?: string) => id === 'BYE' ? 'BYE' : (teams.find((team) => team.id === id)?.name || String(id || ''));

const placeBracketWithStructuralEditor = (state: AppState) => {
  if (!state.tournament) throw new Error('Torneo live mancante durante l’Editor strutturale.');
  const original = buildTournamentStructureSnapshot(state.tournament, state.tournamentMatches || [], state.teams || []);
  let present = original;
  const teamIdByName = new Map((state.teams || []).map((team) => [normalize(team.name), team.id]));
  const targetIds = ROUND1_TARGETS.flatMap(([a, b]) => [a, b]).map((name) => name === 'BYE' ? 'BYE' : teamIdByName.get(normalize(name)) || '');
  if (targetIds.some((id) => !id)) throw new Error('Editor: una o più squadre target non sono presenti nel catalogo.');

  const operationLog: string[] = [];
  for (let index = 0; index < targetIds.length; index += 1) {
    const desired = targetIds[index];
    if (desired === 'BYE') continue;
    const round1 = getRound1Matches(present);
    const targetMatch = round1[Math.floor(index / 2)];
    const targetSlot = `${targetMatch.id}|${index % 2 === 0 ? 'A' : 'B'}`;
    if (getSlotValue(present, targetSlot) === desired) continue;
    const allSlots = round1.flatMap((match) => [`${match.id}|A`, `${match.id}|B`]);
    const sourceSlot = allSlots.find((slot) => getSlotValue(present, slot) === desired);
    if (!sourceSlot) throw new Error(`Editor: slot corrente non trovato per ${desired}.`);
    const result = applyStructuralOperation(present, { type: 'SWAP_BRACKET_SLOTS', slotAKey: sourceSlot, slotBKey: targetSlot });
    if (!result.ok || !result.nextSnapshot) throw new Error(`Editor: ${result.check.humanMessage}`);
    present = result.nextSnapshot;
    operationLog.push(`${sourceSlot} -> ${targetSlot}`);
  }

  const actualIds = getRound1Matches(present).flatMap((match) => [String(match.teamAId || ''), String(match.teamBId || '')]);
  const differences = targetIds.map((expected, index) => ({ index, expected, actual: actualIds[index] })).filter((row) => row.expected !== row.actual);
  if (differences.length) throw new Error(`Editor: disposizione finale non coerente: ${JSON.stringify(differences.slice(0, 5))}`);
  const prepared = prepareTournamentStructureApply(original, present);
  if (!prepared.validation.canApply) {
    throw new Error(`Editor: validazione bloccante: ${prepared.validation.issues.map((issue: any) => issue.humanMessage || issue.reasonCode).join(' | ')}`);
  }
  return { prepared, operationLog };
};

const resolveStoredPlayer = (team: Team, sourcePlayer: string) => {
  const wanted = tokenKey(sourcePlayer);
  const candidates = [team.player1, team.player2].filter(Boolean) as string[];
  const hit = candidates.find((name) => tokenKey(name) === wanted);
  if (!hit) throw new Error(`Giocatore "${sourcePlayer}" non riconciliato nella squadra "${team.name}".`);
  return hit;
};

const findSpecMatch = (state: AppState, spec: ReportSpec): Match => {
  const wanted = [normalize(spec.a), normalize(spec.b)].sort().join('|');
  const matches = (state.tournamentMatches || []).filter((match) => {
    if (match.phase !== 'bracket' || match.status === 'finished' || match.hidden || match.isBye) return false;
    const names = [teamNameById(state.teams || [], match.teamAId), teamNameById(state.teams || [], match.teamBId)].map(normalize).sort().join('|');
    return names === wanted;
  });
  if (matches.length !== 1) throw new Error(`Partita ${spec.a} – ${spec.b} non trovata univocamente (${matches.length}).`);
  return matches[0];
};

const applyReportInMemory = (state: AppState, spec: ReportSpec) => {
  const base = findSpecMatch(state, spec);
  const teams = state.teams || [];
  const teamA = teams.find((team) => team.id === base.teamAId)!;
  const teamB = teams.find((team) => team.id === base.teamBId)!;
  const specAIsMatchA = normalize(teamA.name) === normalize(spec.a);
  const stats = spec.stats.map((source) => {
    const team = teamByName(teams, source.team);
    return { teamId: team.id, playerName: resolveStoredPlayer(team, source.player), canestri: source.canestri, soffi: source.soffi };
  });
  const updated = withRefereeReportAudit(base, {
    ...base,
    scoreA: specAIsMatchA ? spec.scoreA : spec.scoreB,
    scoreB: specAIsMatchA ? spec.scoreB : spec.scoreA,
    stats,
    played: true,
    status: 'finished',
  }, { source: 'admin', refereeName: 'Admin' });
  const before = cloneMatchesForResultSync(state.tournamentMatches || []);
  let matches = (state.tournamentMatches || []).map((match) => match.id === base.id ? updated : match);
  matches = reconcileBracketAdvancements(matches);
  const changed = collectChangedMatchResults(before, matches, base.id);
  const nextState: AppState = {
    ...state,
    tournamentMatches: matches,
    tournament: state.tournament ? { ...state.tournament, matches } : state.tournament,
  };
  return { base, updated, changed, nextState };
};

const validateNoBirthDates = (teams: Team[]) => {
  const offenders = teams.filter((team) => team.player1BirthDate || team.player2BirthDate);
  if (offenders.length) throw new Error(`Sono presenti date di nascita nelle squadre del torneo: ${offenders.map((team) => team.name).join(', ')}`);
};

const createGeneratedState = (baseState: AppState) => {
  const teams = (baseState.teams || []).filter((team) => !team.hidden && !team.isBye);
  if (teams.length !== 25) throw new Error(`Attese 25 squadre, trovate ${teams.length}.`);
  validateNoBirthDates(teams);
  for (const name of new Set(ROUND1_TARGETS.flat().filter((name) => name !== 'BYE'))) teamByName(teams, name);
  const generated = generateTournamentStructure(teams, {
    mode: 'elimination', tournamentName: 'Coppa Baobab', startDate: '2026-07-18', resultsOnly: false,
  });
  return {
    ...baseState,
    fantaSettings: { ...(baseState.fantaSettings || {}), enabled: true, updatedAt: nowIso() },
    tournament: { ...generated.tournament, refereesPassword: 'CoppaBaobab-Referti-2026', refereesAuthVersion: nowIso() },
    tournamentMatches: generated.matches,
  } as AppState;
};

const dryRunAll = (baseState: AppState) => {
  const started = createGeneratedState(baseState);
  const editor = placeBracketWithStructuralEditor(started);
  let state: AppState = {
    ...started,
    tournament: { ...editor.prepared.tournament, matches: editor.prepared.matches },
    tournamentMatches: editor.prepared.matches,
  };
  for (const spec of REPORTS) state = applyReportInMemory(state, spec).nextState;
  const finished = (state.tournamentMatches || []).filter((match) => match.phase === 'bracket' && !match.isBye && !match.hidden && match.status === 'finished');
  const finalSpec = REPORTS[REPORTS.length - 1];
  const finalMatch = (state.tournamentMatches || []).find((match) => {
    const names = [teamNameById(state.teams || [], match.teamAId), teamNameById(state.teams || [], match.teamBId)].map(normalize).sort().join('|');
    return names === [normalize(finalSpec.a), normalize(finalSpec.b)].sort().join('|');
  });
  if (finished.length !== 24 || !finalMatch || finalMatch.status !== 'finished') throw new Error(`Dry-run incompleto: ${finished.length}/24 referti.`);
  const winnerId = finalMatch.scoreA > finalMatch.scoreB ? finalMatch.teamAId : finalMatch.teamBId;
  const winner = teamNameById(state.teams || [], winnerId);
  if (winner !== 'Compagni di Merende') throw new Error(`Vincitore dry-run errato: ${winner}.`);
  return { state, editorOperations: editor.operationLog.length, finished: finished.length, winner };
};

const metrics: JsonRecord = {
  runId, startedAt: nowIso(), dryRun, requests: requestLog, reports: [], tv: { readers: [0, 0], errors: [0, 0] },
  cloudMonitorRequests: 0, cloudSamples: [], fantaChecks: [], issues: [], checkpoints: {},
};

let tvStop = false;
const tvSeen = new Map<string, number[]>();
const runTvReader = async (index: number) => {
  while (!tvStop) {
    try {
      const row = await requestJson(`tv reader ${index + 1}`, `${localBase}/api/v1/public/workspace/${encodeURIComponent(workspaceId)}`);
      metrics.tv.readers[index] += 1;
      for (const match of row?.state?.tournamentMatches || []) {
        if (match.status !== 'finished') continue;
        const seen = tvSeen.get(match.id) || [];
        if (!seen[index]) seen[index] = Date.now();
        tvSeen.set(match.id, seen);
      }
    } catch {
      metrics.tv.errors[index] += 1;
    }
    await sleep(1000);
  }
};

let monitorStop = false;
const cloudSeen = new Map<string, number>();
const runCloudMonitor = async () => {
  let cycle = 0;
  while (!monitorStop) {
    const sample: JsonRecord = { at: nowIso() };
    try {
      const live = await serviceGet('cloud monitor public live', `public_workspace_live?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*`);
      metrics.cloudMonitorRequests += 1;
      const row = live?.[0] || {};
      sample.liveVersion = row.version ?? row.local_version ?? null;
      sample.liveOperationId = row.operation_id ?? row.last_operation_id ?? null;
      sample.liveUpdatedAt = row.updated_at ?? null;
      for (const match of row?.state?.tournamentMatches || []) {
        if (match.status === 'finished' && !cloudSeen.has(match.id)) cloudSeen.set(match.id, Date.now());
      }
      if (cycle % 2 === 0) {
        const [canonical, plane] = await Promise.all([
          serviceGet('cloud monitor canonical', `workspace_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=version,last_operation_id,updated_at,primary_epoch`),
          serviceGet('cloud monitor plane', `flbp_data_plane?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*`),
        ]);
        metrics.cloudMonitorRequests += 2;
        sample.canonical = canonical?.[0] || null;
        sample.plane = plane?.[0] || null;
      }
    } catch (error: any) {
      sample.error = String(error?.message || error);
    }
    metrics.cloudSamples.push(sample);
    cycle += 1;
    await sleep(15_000);
  }
};

const adminRpc = async (accessToken: string, name: string, body: JsonRecord) => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase client non configurato.');
  return requestJson(`admin RPC ${name}`, `${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

const anonGet = async (label: string, resource: string) => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase client non configurato.');
  return requestJson(label, `${cfg.url.replace(/\/$/, '')}/rest/v1/${resource}`, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
  });
};

const fantaCheck = async (tournamentId: string, stage: string) => {
  try {
    const t = encodeURIComponent(tournamentId);
    const w = encodeURIComponent(workspaceId);
    const [standings, rosters] = await Promise.all([
      anonGet(`fanta ${stage} standings`, `fanta_live_standings?workspace_id=eq.${w}&tournament_id=eq.${t}&select=team_id,total_points`),
      anonGet(`fanta ${stage} roster`, `fanta_roster_live_rows?workspace_id=eq.${w}&tournament_id=eq.${t}&select=player_name,raw_goals,raw_blows&limit=1000`),
    ]);
    metrics.fantaChecks.push({ at: nowIso(), stage, teams: standings?.length || 0, rosterRows: rosters?.length || 0, rawGoals: (rosters || []).reduce((sum: number, row: any) => sum + Number(row.raw_goals || 0), 0) });
  } catch (error: any) {
    metrics.fantaChecks.push({ at: nowIso(), stage, error: String(error?.message || error) });
  }
};

const waitForNoPending = async (timeoutMs: number) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const health = await getHealth();
    if (Number(health.pendingOperations || 0) === 0) return { ok: true, ms: Date.now() - started, health };
    await sleep(1000);
  }
  return { ok: false, ms: Date.now() - started, health: await getHealth() };
};

const waitForCloudFinal = async (finalMatchId: string, timeoutMs: number) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (cloudSeen.has(finalMatchId)) return { ok: true, ms: Date.now() - started };
    await sleep(1000);
  }
  return { ok: false, ms: Date.now() - started };
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p / 100) - 1))];
};

const writeReport = () => {
  metrics.finishedAt = nowIso();
  const outDir = path.resolve(process.cwd(), `../outputs/coppa_baobab_simulazione_${runId.replace(/[^a-z0-9-]/gi, '_')}`);
  mkdirSync(outDir, { recursive: true });
  const reports = metrics.reports as any[];
  const localLatencies = reports.map((row) => Number(row.commitMs || 0));
  const cloudLatencies = reports.map((row) => Number(row.cloudPropagationMs || 0)).filter((value) => value > 0);
  const network = (((globalThis as any).__flbpSimNetworkMetrics || []) as any[]);
  const byService: Record<string, any> = {};
  for (const entry of network) {
    const bucket = byService[entry.service] ||= { requests: 0, requestBytes: 0, responseBytes: 0, errors: 0, rateLimited: 0 };
    bucket.requests += 1;
    bucket.requestBytes += Number(entry.requestBytes || 0);
    bucket.responseBytes += Number(entry.responseBytes || 0);
    if (!entry.ok) bucket.errors += 1;
    if (entry.status === 429 || entry.retryAfter) bucket.rateLimited += 1;
  }
  metrics.networkByService = byService;
  metrics.latencies = {
    localCommitMs: { min: localLatencies.length ? Math.min(...localLatencies) : 0, p95: percentile(localLatencies, 95), max: localLatencies.length ? Math.max(...localLatencies) : 0 },
    cloudPropagationMs: { p95: percentile(cloudLatencies, 95), max: cloudLatencies.length ? Math.max(...cloudLatencies) : 0 },
  };
  writeFileSync(path.join(outDir, 'metriche.json'), JSON.stringify(metrics, null, 2));
  const issueLines = metrics.issues.length ? metrics.issues.map((issue: string) => `- ${issue}`).join('\n') : '- Nessuna anomalia bloccante.';
  const md = `# Simulazione Coppa Baobab\n\n` +
    `- Run: \`${runId}\`\n- Inizio: ${metrics.startedAt}\n- Fine: ${metrics.finishedAt}\n` +
    `- Referti completati: ${reports.length}/24\n- Vincitore atteso: Compagni di Merende\n` +
    `- Letture TV locali: ${(metrics.tv.readers || []).join(' + ')}; errori: ${(metrics.tv.errors || []).join(' + ')}\n` +
    `- Richieste di osservazione Supabase: ${metrics.cloudMonitorRequests}\n\n` +
    `## Tempi\n\n- Commit locale p95: ${metrics.latencies.localCommitMs.p95} ms; massimo: ${metrics.latencies.localCommitMs.max} ms.\n` +
    `- Propagazione cloud p95: ${metrics.latencies.cloudPropagationMs.p95 || 'n/d'} ms; massimo: ${metrics.latencies.cloudPropagationMs.max || 'n/d'} ms.\n\n` +
    `## Controlli\n\n- Seconda finestra read-only: ${metrics.checkpoints.secondWriterReadOnly ? 'PASS' : 'FAIL'}\n` +
    `- Commit stale respinto: ${metrics.checkpoints.staleConflict ? 'PASS' : 'FAIL'}\n` +
    `- Retry idempotente: ${metrics.checkpoints.idempotentRetry ? 'PASS' : 'FAIL'}\n` +
    `- Replica esterna obbligatoria: ${metrics.checkpoints.secondaryBackup ? 'PASS' : 'FAIL'}\n` +
    `- Backup finale verificato: ${metrics.checkpoints.finalBackupVerified ? 'PASS' : 'FAIL'}\n` +
    `- Stato finale server: ${metrics.checkpoints.finalServerState || 'n/d'}\n\n` +
    `## FantaBeerPong\n\n\`\`\`json\n${JSON.stringify(metrics.fantaChecks, null, 2)}\n\`\`\`\n\n` +
    `## Rete per servizio\n\n\`\`\`json\n${JSON.stringify(byService, null, 2)}\n\`\`\`\n\n` +
    `## Anomalie e osservazioni\n\n${issueLines}\n`;
  writeFileSync(path.join(outDir, 'rapporto.md'), md);
  console.log(`REPORT_DIR=${outDir}`);
  return outDir;
};

const main = async () => {
  const health = await getHealth();
  if (!health.active || health.transition !== 'idle') throw new Error(`Server locale non pronto: ${JSON.stringify(health)}`);
  const initialRow = await pullLocal();
  let state = coerceAppState(initialRow.state);
  if (state.tournament) throw new Error(`Esiste già un torneo live: ${state.tournament.name}`);
  metrics.checkpoints.initial = { health, version: initialRow.version, history: state.tournamentHistory?.length || 0, teams: state.teams?.length || 0 };

  const dry = dryRunAll(state);
  console.log(`Dry-run: ${dry.finished}/24 referti, vincitore ${dry.winner}, operazioni Editor ${dry.editorOperations}.`);
  if (dryRun) return;

  const adminEmail = process.env.FLBP_SIM_ADMIN_EMAIL || simEnv.FLBP_SIM_ADMIN_EMAIL || '';
  const adminPassword = process.env.FLBP_SIM_ADMIN_PASSWORD || simEnv.FLBP_SIM_ADMIN_PASSWORD || '';
  if (!adminEmail || !adminPassword) throw new Error('Credenziali Admin mancanti in .env.sim.');
  const session = await signInWithPassword(adminEmail, adminPassword);
  setSupabaseSession(session);
  metrics.checkpoints.adminLogin = { ok: true, email: session.email || adminEmail };

  // Lease locale: mai takeover automatico.
  let lease: any = null;
  const leaseDeadline = Date.now() + 100_000;
  while (Date.now() < leaseDeadline) {
    lease = await postLocal('lease acquire', '/api/v1/admin/write-lease/acquire', { holderId: writerId, holderLabel: 'Simulazione Coppa Baobab', takeover: false });
    if (lease?.acquired) break;
    await sleep(5000);
  }
  if (!lease?.acquired) throw new Error('Lease Admin locale ancora occupato dopo 100 secondi.');
  const heartbeat = setInterval(() => {
    void postLocal('lease heartbeat', '/api/v1/admin/write-lease/heartbeat', { holderId: writerId }).catch((error) => metrics.issues.push(`Heartbeat lease: ${String(error?.message || error)}`));
  }, 25_000);
  heartbeat.unref?.();

  const second = await postLocal('second writer acquire', '/api/v1/admin/write-lease/acquire', { holderId: secondWriterId, holderLabel: 'Seconda finestra simulata', takeover: false });
  metrics.checkpoints.secondWriterReadOnly = second?.acquired === false;

  // Metriche Supabase prima delle scritture e seed Fanta pretorneo.
  metrics.checkpoints.supabaseBefore = {
    workspace: (await serviceGet('baseline canonical', `workspace_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=version,last_operation_id,updated_at,primary_epoch`))?.[0] || null,
    plane: (await serviceGet('baseline plane', `flbp_data_plane?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*`))?.[0] || null,
    operationLog: await serviceGet('baseline operation log', `flbp_local_operation_log?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=local_version&order=local_version.desc&limit=1`),
  };
  await resetFantaConfigToPretournament();
  const seed = await adminRpc(session.accessToken, 'flbp_sim_seed_fanta_pretournament', {
    p_workspace_id: workspaceId, p_overwrite: true, p_team_id_prefix: null,
  });
  const cfg = getSupabaseConfig()!;
  const w = encodeURIComponent(cfg.workspaceId);
  const [profiles, preTeams, preRosters] = await Promise.all([
    requestJson('player profiles count', `${cfg.url}/rest/v1/player_app_profiles?workspace_id=eq.${w}&select=user_id`, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.accessToken}` } }),
    anonGet('fanta pre teams', `fanta_teams?workspace_id=eq.${w}&tournament_id=eq.__pre_tournament__&select=id,user_id`),
    anonGet('fanta pre rosters', `fanta_rosters?select=team_id,player_id&team_id=in.(${encodeURIComponent('')})`).catch(() => []),
  ]);
  metrics.checkpoints.fantaSeed = { seed, profiles: profiles?.length || 0, teams: preTeams?.length || 0, rosterProbe: preRosters?.length || 0 };
  if ((preTeams?.length || 0) !== (profiles?.length || 0)) metrics.issues.push(`Fanta pretorneo: ${preTeams?.length || 0} squadre per ${profiles?.length || 0} account.`);

  // Avvio live mediante commit completo locale.
  state = createGeneratedState(state);
  let currentVersion = Number(initialRow.version);
  const startOperationId = `${runId}-start-live`;
  const startCommit = await postLocal('start live commit', `/api/v1/admin/workspace/${encodeURIComponent(workspaceId)}/commit`, {
    state, publicState: sanitizeAppStateForPublic(state), operationId: startOperationId, baseVersion: currentVersion,
  }, writerId);
  currentVersion = Number(startCommit.version);
  const tournamentId = String(state.tournament!.id);
  metrics.checkpoints.start = { version: currentVersion, operationId: startOperationId, tournamentId };

  const promotion = await promoteFantaPretournamentToTournament(tournamentId, state.tournament);
  metrics.checkpoints.fantaPromotion = promotion;

  // Editor strutturale sul live già avviato.
  const editor = placeBracketWithStructuralEditor(state);
  state = {
    ...state,
    tournament: { ...editor.prepared.tournament, matches: editor.prepared.matches },
    tournamentMatches: editor.prepared.matches,
  };
  const structureOperationId = `${runId}-structural-editor`;
  const structureCommit = await postLocal('structural editor commit', `/api/v1/admin/workspace/${encodeURIComponent(workspaceId)}/commit`, {
    state, publicState: sanitizeAppStateForPublic(state), operationId: structureOperationId, baseVersion: currentVersion,
  }, writerId);
  const staleBaseVersion = currentVersion;
  currentVersion = Number(structureCommit.version);
  metrics.checkpoints.editor = { version: currentVersion, operations: editor.operationLog.length, diff: editor.prepared.diff };

  // La stessa finestra tenta volontariamente una base stale: deve essere 409 e non scrivere.
  try {
    await postLocal('stale full commit', `/api/v1/admin/workspace/${encodeURIComponent(workspaceId)}/commit`, {
      state, publicState: sanitizeAppStateForPublic(state), operationId: `${runId}-stale`, baseVersion: staleBaseVersion,
    }, writerId);
    metrics.checkpoints.staleConflict = false;
  } catch (error: any) {
    metrics.checkpoints.staleConflict = error.status === 409;
    if (error.status !== 409) throw error;
  }

  void runTvReader(0);
  void runTvReader(1);
  void runCloudMonitor();

  for (let index = 0; index < REPORTS.length; index += 1) {
    const spec = REPORTS[index];
    const applied = applyReportInMemory(state, spec);
    const operationId = `${runId}-report-${String(index + 1).padStart(2, '0')}`;
    const commitStarted = Date.now();
    const body = { tournamentId, matchId: applied.base.id, matches: applied.changed, operationId, admin: true, writerId };
    const committed = await postLocal(`report ${index + 1}`, `/api/v1/referee/workspace/${encodeURIComponent(workspaceId)}/admin-match-result`, body, writerId);
    const commitMs = Date.now() - commitStarted;
    currentVersion = Number(committed.version);
    const pulled = await pullLocal();
    state = coerceAppState(pulled.state);
    const healthAfter = await getHealth();
    const reportMetric: JsonRecord = {
      number: index + 1, matchId: applied.base.id, code: applied.base.code || null, teams: `${spec.a} – ${spec.b}`,
      score: `${spec.scoreA}-${spec.scoreB}`, operationId, commitMs, version: currentVersion,
      pendingOperations: healthAfter.pendingOperations, secondaryVersion: healthAfter.lastSecondaryBackupVersion,
      committedAt: nowIso(), commitAtMs: commitStarted,
    };
    metrics.reports.push(reportMetric);

    if (index === 0) {
      const beforeRetryVersion = currentVersion;
      const retry = await postLocal('idempotent retry', `/api/v1/referee/workspace/${encodeURIComponent(workspaceId)}/admin-match-result`, body, writerId);
      metrics.checkpoints.idempotentRetry = retry?.idempotent === true && Number(retry.version) === beforeRetryVersion;
    }
    if (index === 6) {
      const beforeRetryVersion = currentVersion;
      const retry = await postLocal('lost-response retry', `/api/v1/referee/workspace/${encodeURIComponent(workspaceId)}/admin-match-result`, body, writerId);
      metrics.checkpoints.lostResponseRetry = retry?.idempotent === true && Number(retry.version) === beforeRetryVersion;
    }

    if ([8, 16, 20, 22, 23].includes(index)) await fantaCheck(tournamentId, `dopo-referto-${index + 1}`);
    console.log(`REFERTI=${index + 1}/24 VERSIONE=${currentVersion} COMMIT_MS=${commitMs} PENDING=${healthAfter.pendingOperations}`);

    if (index < REPORTS.length - 1) {
      const roundPause = index === 8 || index === 16;
      const delay = fast ? 100 : (roundPause ? 45_000 : 12_000 + ((index * 7919) % 18_001));
      await sleep(delay);
    }
  }

  // Lascia qualche secondo ai due lettori TV per vedere la finale.
  await sleep(fast ? 200 : 3000);
  tvStop = true;
  const finalReport = metrics.reports[metrics.reports.length - 1];
  const finalSeen = tvSeen.get(finalReport.matchId) || [];
  for (const row of metrics.reports) {
    const seen = tvSeen.get(row.matchId) || [];
    row.tvPropagationMs = seen.length === 2 ? Math.max(...seen) - row.commitAtMs : null;
    const cloudAt = cloudSeen.get(row.matchId);
    row.cloudPropagationMs = cloudAt ? cloudAt - row.commitAtMs : null;
  }
  metrics.checkpoints.tvFinal = finalSeen.length === 2;

  metrics.checkpoints.outboxDrain = await waitForNoPending(120_000);
  metrics.checkpoints.cloudFinalBeforeBackup = await waitForCloudFinal(finalReport.matchId, 300_000);
  monitorStop = true;

  const finalLocal = await pullLocal();
  state = coerceAppState(finalLocal.state);
  const completed = (state.tournamentMatches || []).filter((match) => match.phase === 'bracket' && !match.hidden && !match.isBye && match.status === 'finished');
  if (completed.length !== 24) throw new Error(`Stato locale finale: ${completed.length}/24 referti.`);
  const winnerCheck = dryRunAll({ ...state, tournament: null, tournamentMatches: [] } as AppState); // valida ancora il dataset senza mutare lo stato reale
  metrics.checkpoints.localFinal = { version: finalLocal.version, completed: completed.length, expectedWinner: winnerCheck.winner };

  const finalBackup = await postLocal('final backup', '/control/backup', {});
  metrics.checkpoints.finalBackupVerified = !!finalBackup?.result?.verified;
  metrics.checkpoints.secondaryBackup = !!finalBackup?.secondary?.backedUp && Number(finalBackup?.lastSecondaryBackupVersion || finalBackup?.secondary?.version) === Number(finalBackup?.version);

  const deactivated = await postLocal('deactivate', '/control/deactivate', {});
  metrics.checkpoints.firstDeactivate = { active: deactivated.active, version: deactivated.version, result: deactivated.result };

  // Simula il rebuild strutturato che l'app esegue quando il data plane torna cloud.
  const cloudRow = await pullWorkspaceState({ source: 'coppa-baobab.post-deactivate', kind: 'admin' });
  setRemoteBaseUpdatedAt(cloudRow.updated_at || null);
  state = coerceAppState(cloudRow.state);
  await initAdminWriteLease({ label: 'Coppa Baobab - riallineamento finale', takeover: false });
  if (readAdminLeaseInfo().status !== 'active') throw new Error('Lease cloud non acquisito per il riallineamento normalizzato finale.');
  const normalized = await pushLiveTournamentIncremental(state, { force: true });
  metrics.checkpoints.normalizedRebuild = normalized;
  await releaseAdminWriteLease();
  await fantaCheck(tournamentId, 'dopo-riallineamento-cloud');

  // Riporta SQLite e replica esterna alla nuova versione cloud identica, poi torna in standby.
  const reactivated = await postLocal('reactivate for final parity', '/control/activate', {});
  const parityBackup = await postLocal('parity backup', '/control/backup', {});
  const finalDeactivate = await postLocal('final deactivate', '/control/deactivate', {});
  metrics.checkpoints.parity = { reactivated, backup: parityBackup.result, secondary: parityBackup.secondary, finalDeactivate };
  metrics.checkpoints.finalServerState = finalDeactivate.active === false && finalDeactivate.transition === 'idle' ? 'standby' : 'non conforme';

  metrics.checkpoints.supabaseAfter = {
    workspace: (await serviceGet('final canonical', `workspace_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=version,last_operation_id,updated_at,primary_epoch`))?.[0] || null,
    plane: (await serviceGet('final plane', `flbp_data_plane?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=*`))?.[0] || null,
    operationLog: await serviceGet('final operation log', `flbp_local_operation_log?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=local_version&order=local_version.desc&limit=1`),
  };
  const finalHealth = await getHealth();
  metrics.checkpoints.finalHealth = finalHealth;
  metrics.checkpoints.versionParity = Number(finalHealth.version) === Number(metrics.checkpoints.supabaseAfter.workspace?.version)
    && Number(finalHealth.lastSecondaryBackupVersion) === Number(finalHealth.version);

  clearInterval(heartbeat);
  await postLocal('local lease release', '/api/v1/admin/write-lease/release', { holderId: writerId }).catch(() => null);
  writeReport();
};

main().then(() => {
  if (dryRun) console.log('DRY_RUN_OK');
}).catch((error: any) => {
  metrics.issues.push(String(error?.stack || error?.message || error));
  try { writeReport(); } catch { /* ignore */ }
  console.error(error);
  process.exitCode = 1;
});
