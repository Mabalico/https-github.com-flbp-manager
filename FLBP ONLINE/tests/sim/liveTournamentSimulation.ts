// FLBP live tournament simulator (headless).
//
// Simula un torneo a eliminazione diretta inserendo i referti UNO PER UNO con
// le stesse funzioni di servizio usate dall'app (motore torneo, RPC per-match,
// snapshot, export incrementale, archiviazione) contro il Supabase reale.
// Misura tempi, errori e coerenza della propagazione admin -> pubblico.
//
// Uso:
//   npm run sim:live                          (default 128 squadre)
//   npm run sim:live -- --teams=32 --seed=7
//
// Credenziali admin (obbligatorie), in ordine di priorita':
//   1) variabili d'ambiente FLBP_SIM_ADMIN_EMAIL / FLBP_SIM_ADMIN_PASSWORD
//   2) file locale `.env.sim` accanto a package.json (NON tracciato da git):
//        FLBP_SIM_ADMIN_EMAIL=admin@example.com
//        FLBP_SIM_ADMIN_PASSWORD=lapassword
//
// Sicurezza: NON tocca lo storico esistente. Si rifiuta di partire se c'e' gia'
// un torneo live. Aggiunge squadre sintetiche ("Sim Squadra NNN") alla lista
// iscritti e a fine corsa archivia il torneo simulato come farebbe l'admin.

import './nodeShims';
import { readFileSync } from 'node:fs';
import type { AppState } from '../../services/storageService';
import { archiveTournamentV2, coerceAppState, setTournamentMvps } from '../../services/storageService';
import { generateTournamentStructure } from '../../services/tournamentEngine';
import { reconcileBracketAdvancements } from '../../services/tournamentStructureSelectors';
import { cloneMatchesForResultSync, collectChangedMatchResults } from '../../services/matchUtils';
import { withRefereeReportAudit } from '../../services/refereeReportAudit';
import { getPlayerKey } from '../../services/playerIdentity';
import { removeArchivedTournamentDeep } from '../../services/archiveCascadeDelete';
import {
  archiveFantaTournamentEdition,
  cancelActivePlayerAppCallsForMatch,
  deleteFantaTournamentData,
  getSupabaseConfig,
  isMatchResultRpcMissingError,
  promoteFantaPretournamentToTournament,
  pullWorkspaceState,
  pushAdminMatchResults,
  pushLiveTournamentIncremental,
  pushNormalizedFromState,
  pushWorkspaceState,
  resetFantaConfigToPretournament,
  setRemoteBaseUpdatedAt,
  setSupabaseSession,
  signInWithPassword,
} from '../../services/supabaseRest';
import { isPublicWorkspaceLiveUnavailableError, pullPublicWorkspaceLive } from '../../services/supabasePublic';
import { initAdminWriteLease, releaseAdminWriteLease, takeoverAdminWriteLease } from '../../services/adminWriteLease';
import { readAdminLeaseInfo } from '../../services/adminWriteLeaseState';
import type { Match, Team } from '../../types';

// ----------------------------- CLI / env ----------------------------------

const argValue = (name: string): string | null => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

const TEAMS_N = Math.max(4, Math.min(400, parseInt(argValue('teams') || '128', 10) || 128));
const SEED = parseInt(argValue('seed') || `${Date.now() % 100000}`, 10) || 1;
// --use-existing: usa le squadre GIA' presenti in lista iscritti (es. generate
// dal pool in-app) invece di crearne di sintetiche.
const USE_EXISTING_TEAMS = process.argv.includes('--use-existing');
const PROPAGATION_TIMEOUT_MS = 20_000;

const longestCommonIdPrefix = (ids: string[]): string | null => {
  if (!ids.length) return null;
  let prefix = ids[0];
  for (const id of ids) {
    while (prefix && !id.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return null;
  }
  return prefix.length >= 4 ? prefix : null;
};

const readEnvSim = (): Record<string, string> => {
  // Eseguito come `node ./.tmp-node-tests/...` dalla cartella FLBP ONLINE:
  // .env.sim vive nella working directory. Provo cwd e alcuni fallback.
  const candidates = ['.env.sim', './.env.sim', '../.env.sim'];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf8');
      const out: Record<string, string> = {};
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].trim();
      }
      return out;
    } catch {
      // prova il prossimo path
    }
  }
  return {};
};

const envSim = readEnvSim();
const ADMIN_EMAIL = process.env.FLBP_SIM_ADMIN_EMAIL || envSim.FLBP_SIM_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.FLBP_SIM_ADMIN_PASSWORD || envSim.FLBP_SIM_ADMIN_PASSWORD || '';

// ----------------------------- utilities ----------------------------------

// Deterministic PRNG (mulberry32) so a run can be reproduced with --seed.
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rnd = mulberry32(SEED);
const randInt = (minIncl: number, maxIncl: number) => minIncl + Math.floor(rnd() * (maxIncl - minIncl + 1));

type OpStat = { label: string; ms: number; ok: boolean; error?: string; at: string };
const opStats: OpStat[] = [];
const issues: string[] = [];

const timeIt = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t0 = Date.now();
  try {
    const out = await fn();
    opStats.push({ label, ms: Date.now() - t0, ok: true, at: new Date().toISOString() });
    return out;
  } catch (e: any) {
    const error = String(e?.message || e || 'errore sconosciuto');
    opStats.push({ label, ms: Date.now() - t0, ok: false, error, at: new Date().toISOString() });
    throw e;
  }
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

const summarizeOps = () => {
  const byLabel = new Map<string, OpStat[]>();
  for (const s of opStats) byLabel.set(s.label, [...(byLabel.get(s.label) || []), s]);
  const lines: string[] = [];
  for (const [label, list] of byLabel) {
    const okList = list.filter((s) => s.ok).map((s) => s.ms);
    const failures = list.filter((s) => !s.ok).length;
    lines.push(
      `  ${label}: n=${list.length} ok=${list.length - failures} err=${failures}` +
      (okList.length
        ? ` | ms min=${Math.min(...okList)} avg=${Math.round(okList.reduce((a, b) => a + b, 0) / okList.length)} p95=${percentile(okList, 95)} max=${Math.max(...okList)}`
        : '')
    );
  }
  return lines.join('\n');
};

type NetworkMetric = {
  service: string;
  method: string;
  status: number | null;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  ok: boolean;
  rateLimitRemaining: string | null;
  retryAfter: string | null;
};

const summarizeNetwork = () => {
  const entries = (((globalThis as any).__flbpSimNetworkMetrics || []) as NetworkMetric[]);
  if (!entries.length) return '  nessuna richiesta registrata';
  const byService = new Map<string, NetworkMetric[]>();
  for (const entry of entries) byService.set(entry.service, [...(byService.get(entry.service) || []), entry]);
  const lines: string[] = [];
  for (const [service, list] of byService) {
    const durations = list.map((entry) => entry.durationMs);
    const requestBytes = list.reduce((sum, entry) => sum + entry.requestBytes, 0);
    const responseBytes = list.reduce((sum, entry) => sum + entry.responseBytes, 0);
    const failures = list.filter((entry) => !entry.ok).length;
    const rateLimited = list.filter((entry) => entry.status === 429 || entry.retryAfter).length;
    lines.push(
      `  ${service}: n=${list.length} ok=${list.length - failures} err=${failures} 429/retry=${rateLimited}` +
      ` | req=${requestBytes}B resp=${responseBytes}B` +
      ` | ms avg=${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}` +
      ` p95=${percentile(durations, 95)} max=${Math.max(...durations)}`
    );
  }
  const totalRequestBytes = entries.reduce((sum, entry) => sum + entry.requestBytes, 0);
  const totalResponseBytes = entries.reduce((sum, entry) => sum + entry.responseBytes, 0);
  lines.push(`  TOTALE: richieste=${entries.length} upload=${totalRequestBytes}B download=${totalResponseBytes}B I/O HTTP=${totalRequestBytes + totalResponseBytes}B`);
  return lines.join('\n');
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const anonRestGet = async (path: string): Promise<any> => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase non configurato');
  const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return await res.json();
};

// ----------------------------- sim teams -----------------------------------

const pad3 = (n: number) => String(n).padStart(3, '0');

const buildSimTeams = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `simt_${SEED}_${pad3(i + 1)}`,
    name: `Sim Squadra ${pad3(i + 1)}`,
    player1: `Simuno${pad3(i + 1)} Prova`,
    player2: `Simdue${pad3(i + 1)} Prova`,
    createdAt: Date.now(),
  }));

// ----------------------------- report logic --------------------------------

const isRealTeamId = (id?: string) => {
  const v = String(id || '').trim().toUpperCase();
  return !!v && v !== 'BYE' && !v.startsWith('TBD');
};

const nextReportableMatch = (matches: Match[]): Match | null => {
  const eligible = matches
    .filter((m) => m.phase === 'bracket' && m.status !== 'finished' && !m.hidden && !m.isBye)
    .filter((m) => isRealTeamId(m.teamAId) && isRealTeamId(m.teamBId))
    .sort((a, b) => (a.round || 1) - (b.round || 1) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  return eligible[0] || null;
};

const splitBetweenPlayers = (total: number): [number, number] => {
  const first = randInt(0, total);
  return [first, total - first];
};

const buildReportedMatch = (state: AppState, base: Match): Match => {
  const teamA = (state.tournament?.teams || []).find((t) => t.id === base.teamAId);
  const teamB = (state.tournament?.teams || []).find((t) => t.id === base.teamBId);
  const aWins = rnd() < 0.5;
  const winnerScore = 10;
  const loserScore = randInt(0, 9);
  const scoreA = aWins ? winnerScore : loserScore;
  const scoreB = aWins ? loserScore : winnerScore;

  const stats: NonNullable<Match['stats']> = [];
  const pushTeamStats = (team: Team | undefined, teamScore: number) => {
    if (!team) return;
    const [can1, can2] = splitBetweenPlayers(teamScore);
    const [sf1, sf2] = splitBetweenPlayers(randInt(0, 5));
    if (team.player1) stats.push({ teamId: team.id, playerName: team.player1, canestri: can1, soffi: sf1 });
    if (team.player2) stats.push({ teamId: team.id, playerName: team.player2, canestri: can2, soffi: sf2 });
  };
  pushTeamStats(teamA, scoreA);
  pushTeamStats(teamB, scoreB);

  const updated: Match = { ...base, scoreA, scoreB, stats, status: 'finished', played: true };
  return withRefereeReportAudit(base, updated, { source: 'admin', refereeName: 'Sim Runner' });
};

// ------------------------------ fanta helpers ------------------------------

let adminAccessToken = '';

const adminRpc = async (name: string, body: Record<string, unknown>): Promise<any> => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase non configurato');
  const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${adminAccessToken || cfg.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC ${name} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
};

// Statistiche locali accumulate (fonte di verita' del simulatore) per i
// confronti con le viste fanta lato DB.
const localPlayerGoals = new Map<string, number>(); // player_name normalizzato -> canestri totali
const normalizePlayerNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

type FantaCheck = { atMatch: number; ok: boolean; detail: string };
const fantaChecks: FantaCheck[] = [];
let fantaTeamsPromoted = 0;
let fantaEnabledForRun = false;

const checkFantaLivePropagation = async (tournamentId: string, atMatch: number) => {
  if (!fantaEnabledForRun) return;
  try {
    const cfg = getSupabaseConfig()!;
    const wEnc = encodeURIComponent(cfg.workspaceId);
    const tEnc = encodeURIComponent(tournamentId);
    const [standings, rosterRows] = await Promise.all([
      anonRestGet(`fanta_live_standings?workspace_id=eq.${wEnc}&tournament_id=eq.${tEnc}&select=team_id,total_points`),
      anonRestGet(`fanta_roster_live_rows?workspace_id=eq.${wEnc}&tournament_id=eq.${tEnc}&select=player_name,raw_goals&limit=1000`),
    ]);

    const problems: string[] = [];
    if ((standings?.length || 0) !== fantaTeamsPromoted) {
      problems.push(`classifica fanta: ${standings?.length || 0} squadre attese ${fantaTeamsPromoted}`);
    }
    let comparedPlayers = 0;
    for (const row of rosterRows || []) {
      const expected = localPlayerGoals.get(normalizePlayerNameKey(String(row.player_name || ''))) ?? 0;
      const got = Number(row.raw_goals || 0);
      comparedPlayers += 1;
      if (got !== expected) {
        problems.push(`canestri di "${row.player_name}": vista fanta=${got} attesi=${expected}`);
        if (problems.length > 5) break;
      }
    }
    if (problems.length) {
      fantaChecks.push({ atMatch, ok: false, detail: problems.slice(0, 5).join(' | ') });
      issues.push(`Fanta NON coerente al referto #${atMatch}: ${problems[0]}`);
    } else {
      fantaChecks.push({ atMatch, ok: true, detail: `${standings?.length || 0} squadre, ${comparedPlayers} giocatori-rosa coerenti` });
    }
  } catch (e: any) {
    fantaChecks.push({ atMatch, ok: false, detail: `errore lettura viste fanta: ${String(e?.message || e)}` });
  }
};

// -------------------------- propagation check ------------------------------

type SavedResult = { id: string; scoreA: number; scoreB: number };
type PropagationCheck = { atMatch: number; ok: boolean; latencyMs: number | null; detail: string };
const propagationChecks: PropagationCheck[] = [];

// Legge i match live pubblici dal documento "live" se presente (migration
// applicata), altrimenti dallo snapshot pubblico completo (fallback).
let publicLiveDocAvailable = true;
const fetchPublicLiveMatches = async (): Promise<Match[]> => {
  if (publicLiveDocAvailable) {
    try {
      const row = await pullPublicWorkspaceLive({ source: 'sim.propagationCheck', kind: 'polling' });
      if (row?.state) return ((row.state as any).tournamentMatches as Match[]) || [];
    } catch (e) {
      if (!isPublicWorkspaceLiveUnavailableError(e)) throw e;
      publicLiveDocAvailable = false;
    }
  }
  const cfg = getSupabaseConfig()!;
  const rows = await anonRestGet(`public_workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=state&limit=1`);
  return ((rows?.[0]?.state?.tournamentMatches) as Match[]) || [];
};

const checkPublicPropagation = async (savedSoFar: SavedResult[], atMatch: number) => {
  const wanted = savedSoFar.slice(-5);
  const t0 = Date.now();
  let lastDetail = '';
  while (Date.now() - t0 < PROPAGATION_TIMEOUT_MS) {
    try {
      const liveMatches: Match[] = await fetchPublicLiveMatches();
      const byId = new Map(liveMatches.map((m) => [m.id, m]));
      const misses = wanted.filter((w) => {
        const m = byId.get(w.id);
        return !m || m.status !== 'finished' || m.scoreA !== w.scoreA || m.scoreB !== w.scoreB;
      });
      if (!misses.length) {
        propagationChecks.push({ atMatch, ok: true, latencyMs: Date.now() - t0, detail: 'ultimi 5 referti coerenti sul live pubblico' });
        return;
      }
      lastDetail = `mancano/incoerenti: ${misses.map((m) => m.id).join(', ')}`;
    } catch (e: any) {
      lastDetail = `errore lettura live pubblico: ${String(e?.message || e)}`;
    }
    await sleep(1000);
  }
  propagationChecks.push({ atMatch, ok: false, latencyMs: null, detail: `timeout ${PROPAGATION_TIMEOUT_MS}ms - ${lastDetail}` });
  issues.push(`Propagazione NON coerente al referto #${atMatch}: ${lastDetail}`);
};

// ------------------------------- main --------------------------------------

const main = async () => {
  console.log(`\n=== FLBP SIM LIVE TOURNAMENT | squadre=${TEAMS_N} seed=${SEED} ===\n`);

  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase non configurato: attese VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in .env.local');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Credenziali admin mancanti: imposta FLBP_SIM_ADMIN_EMAIL e FLBP_SIM_ADMIN_PASSWORD (env o file .env.sim)');
  }
  console.log(`Workspace: ${cfg.workspaceId} @ ${cfg.url}`);

  // 1) Login admin (stessa funzione dell'app)
  const session = await timeIt('login admin', () => signInWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD));
  setSupabaseSession(session);
  adminAccessToken = session.accessToken;
  console.log(`Login ok come ${session.email || ADMIN_EMAIL}`);

  // Write lease "un solo admin scrive alla volta": il simulatore e' una
  // sessione admin a tutti gli effetti. takeover=true scavalca eventuali
  // sessioni rimaste appese, come "Prendi il controllo" nell'app.
  await initAdminWriteLease({ label: 'Simulatore headless', takeover: true });
  {
    const leaseStatus = readAdminLeaseInfo().status;
    if (leaseStatus === 'active') console.log('Write lease admin acquisito (takeover).');
    else console.log(`Write lease non attivo (${leaseStatus}): migration assente? Proseguo senza gating.`);
  }

  // 2) Stato attuale + guardie di sicurezza
  const remoteRow = await timeIt('pull workspace state', () => pullWorkspaceState({ source: 'sim.initialPull', kind: 'admin' }));
  if (!remoteRow?.state) throw new Error('Snapshot admin non trovato nel DB');
  setRemoteBaseUpdatedAt(remoteRow.updated_at || null);
  let state: AppState = coerceAppState(remoteRow.state);

  // Maintenance-only path mirroring the double-confirmed Admin action. The
  // exact live id or name is mandatory, so a stale command cannot delete a
  // newly-created tournament by accident.
  const deleteLiveConfirmation = argValue('delete-live');
  if (deleteLiveConfirmation) {
    const live = state.tournament;
    if (!live) {
      console.log('Nessun torneo live da eliminare.');
      console.log('\nConsumo rete Supabase:');
      console.log(summarizeNetwork());
      await releaseAdminWriteLease();
      return;
    }
    const liveId = String(live.id || '').trim();
    const liveName = String(live.name || '').trim();
    if (deleteLiveConfirmation !== liveId && deleteLiveConfirmation !== liveName) {
      throw new Error(`Conferma eliminazione non corrispondente: live id="${liveId}" nome="${liveName}"`);
    }
    console.log(`Elimino esclusivamente il torneo live confermato: "${liveName}" (${liveId})`);
    try {
      await timeIt('chiusura chiamate torneo live', () => cancelActivePlayerAppCallsForMatch({
        tournamentId: liveId,
        dispatchPush: true,
      }));
    } catch (error: any) {
      console.warn(`Pulizia chiamate live non bloccante: ${String(error?.message || error)}`);
    }
    state = { ...state, tournament: null, tournamentMatches: [] };
    await timeIt('push eliminazione torneo live', () => pushWorkspaceState(state));
    await timeIt('export completo post-eliminazione', () => pushNormalizedFromState(state, { force: true }));
    await timeIt('reset fanta a pretorneo', () => resetFantaConfigToPretournament());
    const verified = await timeIt('verifica eliminazione torneo live', () => pullWorkspaceState({ source: 'sim.deleteLiveVerify', kind: 'admin' }));
    if (verified?.state?.tournament) throw new Error('Verifica fallita: il torneo live risulta ancora presente.');
    console.log('Eliminazione verificata sullo snapshot Admin e sul mirror normalizzato.');
    console.log('\nConsumo rete Supabase:');
    console.log(summarizeNetwork());
    await releaseAdminWriteLease();
    return;
  }

  // Modalita' pulizia: rimuove dallo storico i tornei di simulazione
  // ("Torneo Sim ...") e i loro dati derivati (albo, carriera, mirror).
  if (process.argv.includes('--cleanup-sim')) {
    const simEditions = (state.tournamentHistory || []).filter((tr) => String(tr.name || '').startsWith('Torneo Sim'));
    const delFanta = async (id: string, label: string) => {
      try {
        const out = await adminRpc('flbp_admin_delete_fanta_tournament_data', {
          p_workspace_id: cfg.workspaceId,
          p_tournament_id: id,
        });
        if ((out?.deleted_teams ?? 0) > 0) console.log(`  fanta ${label} ${id}: rimosse ${out.deleted_teams} squadre, ${out.deleted_rosters} rose`);
      } catch (e: any) {
        console.warn(`  delete fanta ${label} ${id}: ${String(e?.message || e)}`);
      }
    };

    // Ids fanta "legittimi" da preservare: il container pretorneo e ogni torneo
    // ancora presente nel mirror pubblico. Tutto il resto = residuo di test.
    const publicTournaments = await anonRestGet(
      `public_tournaments?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id&limit=1000`
    );
    const keepIds = new Set<string>(['__pre_tournament__', ...(publicTournaments || []).map((t: any) => String(t.id))]);
    const fantaTeamRows = await anonRestGet(
      `fanta_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=tournament_id&limit=5000`
    );
    const fantaTournamentIds = [...new Set((fantaTeamRows || []).map((r: any) => String(r.tournament_id || '')).filter(Boolean))];
    const simEditionIds = new Set(simEditions.map((t) => t.id));
    const orphanFantaIds = fantaTournamentIds.filter((id) => !keepIds.has(id) && !simEditionIds.has(id));

    if (!simEditions.length && !orphanFantaIds.length) {
      console.log('Nessun torneo di simulazione o dato fanta orfano da rimuovere.');
      await releaseAdminWriteLease();
      return;
    }

    if (simEditions.length) {
      console.log(`Rimuovo ${simEditions.length} tornei di simulazione: ${simEditions.map((t) => t.name).join(', ')}`);
      for (const ed of simEditions) {
        const res = removeArchivedTournamentDeep(state, ed.id);
        state = res.state;
        await delFanta(ed.id, 'edizione');
      }
    }
    if (orphanFantaIds.length) {
      console.log(`Rimuovo dati fanta orfani per ${orphanFantaIds.length} tornei non piu' nel mirror: ${orphanFantaIds.join(', ')}`);
      for (const id of orphanFantaIds) await delFanta(id, 'orfano');
    }
    // rimuovo anche le squadre sintetiche residue in lista iscritti
    state = { ...state, teams: (state.teams || []).filter((t) => !String(t.id || '').startsWith('simt_')) };
    await timeIt('push stato ripulito', () => pushWorkspaceState(state));
    await timeIt('export completo post-pulizia', () => pushNormalizedFromState(state, { force: true }));
    console.log('Pulizia completata: storico, albo, classifiche, mirror e dati fanta riallineati.');
    console.log('\nConsumo rete Supabase:');
    console.log(summarizeNetwork());
    await releaseAdminWriteLease();
    return;
  }

  // Verifica del percorso di produzione: chiama la vera deleteFantaTournamentData
  // (come fa l'app quando elimini un torneo) e controlla che le squadre fanta
  // spariscano davvero via la RPC admin.
  const verifyDeleteTid = argValue('verify-app-delete');
  if (verifyDeleteTid) {
    const teamsUrl = `fanta_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${encodeURIComponent(verifyDeleteTid)}&select=id`;
    const before = (await anonRestGet(teamsUrl))?.length || 0;
    console.log(`Verifica delete app per torneo ${verifyDeleteTid}: squadre fanta prima = ${before}`);
    const res = await deleteFantaTournamentData(verifyDeleteTid);
    console.log(`Risultato deleteFantaTournamentData: ${JSON.stringify(res.removed)} (configReset=${res.configReset})`);
    const after = (await anonRestGet(teamsUrl))?.length || 0;
    const pass = before > 0 && after === 0;
    console.log(`Squadre fanta dopo = ${after} -> ${pass ? 'PASS' : (before === 0 ? 'INCONCLUSIVO (nessuna squadra da rimuovere)' : 'FAIL')}`);
    process.exitCode = pass ? 0 : 1;
    await releaseAdminWriteLease();
    return;
  }

  // Verifica del write lease "un solo admin scrive alla volta": esercita il
  // gate lato server (zombie senza/con holder sbagliato), il takeover e la
  // retrocompatibilita' a lease libero. Non modifica lo stato (ripusha lo
  // snapshot appena letto).
  if (process.argv.includes('--verify-lease')) {
    const checks: Array<{ name: string; pass: boolean }> = [];
    const note = (name: string, pass: boolean, detail = '') => {
      checks.push({ name, pass });
      console.log(`  ${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ` [${detail.slice(0, 130)}]` : ''}`);
    };
    console.log('Verifica write lease:');

    if (readAdminLeaseInfo().status !== 'active') {
      console.log('FAIL - lease non attivo dopo il takeover iniziale: migration non applicata?');
      process.exitCode = 1;
      await releaseAdminWriteLease();
      return;
    }

    try {
      await pushWorkspaceState(state);
      note('push con lease attivo accettato', true);
    } catch (e: any) {
      note('push con lease attivo accettato', false, String(e?.message || e));
    }

    try {
      await adminRpc('flbp_admin_push_match_result', {
        p_workspace_id: cfg.workspaceId, p_tournament_id: 'x', p_match_id: 'x', p_matches: [], p_lease_holder: null,
      });
      note('zombie SENZA holder rifiutato a lease attivo', false, 'accettato!');
    } catch (e: any) {
      const m = String(e?.message || e);
      note('zombie SENZA holder rifiutato a lease attivo', m.includes('FLBP_LEASE_HELD'), m);
    }

    try {
      await adminRpc('flbp_admin_push_match_result', {
        p_workspace_id: cfg.workspaceId, p_tournament_id: 'x', p_match_id: 'x', p_matches: [], p_lease_holder: 'zombie-tab',
      });
      note('zombie con holder SBAGLIATO rifiutato a lease attivo', false, 'accettato!');
    } catch (e: any) {
      const m = String(e?.message || e);
      note('zombie con holder SBAGLIATO rifiutato a lease attivo', m.includes('FLBP_LEASE_HELD'), m);
    }

    const holderB = `verifica-seconda-finestra-${SEED}`;
    try {
      const acq = await adminRpc('flbp_admin_acquire_write_lease', {
        p_workspace_id: cfg.workspaceId, p_holder_id: holderB, p_holder_label: 'Seconda finestra (verifica)', p_takeover: true,
      });
      note('takeover dalla seconda finestra riuscito', !!acq?.acquired);
    } catch (e: any) {
      note('takeover dalla seconda finestra riuscito', false, String(e?.message || e));
    }

    try {
      await pushWorkspaceState(state);
      note('push della finestra spodestata rifiutato', false, 'accettato!');
    } catch (e: any) {
      const m = String(e?.message || e);
      note('push della finestra spodestata rifiutato', m.includes('FLBP_LEASE'), m);
    }

    try {
      await takeoverAdminWriteLease();
      await pushWorkspaceState(state);
      note('push dopo ri-takeover accettato', true);
    } catch (e: any) {
      note('push dopo ri-takeover accettato', false, String(e?.message || e));
    }

    await releaseAdminWriteLease();
    try {
      await adminRpc('flbp_admin_push_match_result', {
        p_workspace_id: cfg.workspaceId, p_tournament_id: 'x', p_match_id: 'x', p_matches: [], p_lease_holder: null,
      });
      note('a lease libero il gate non blocca i client legacy', false, 'inatteso: nessun errore di business');
    } catch (e: any) {
      const m = String(e?.message || e);
      note('a lease libero il gate non blocca i client legacy', !m.includes('FLBP_LEASE'), m);
    }

    const failed = checks.filter((c) => !c.pass).length;
    console.log(failed ? `\nESITO LEASE: ${failed} verifiche FALLITE` : '\nESITO LEASE: TUTTO VERDE');
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (state.tournament) {
    throw new Error(`SICUREZZA: esiste gia' un torneo live ("${state.tournament.name}"). Archivialo o eliminalo prima di simulare.`);
  }
  const historyBefore = (state.tournamentHistory || []).length;
  const hofBefore = (state.hallOfFame || []).length;
  console.log(`Stato attuale: ${state.teams?.length || 0} iscritti, ${historyBefore} tornei storici, ${hofBefore} voci albo`);

  // 3) Squadre (sintetiche o gia' in lista) + FASE PRETORNEO FANTA
  let simTeams: Team[];
  let fantaSeedPrefix: string | null;
  if (USE_EXISTING_TEAMS) {
    simTeams = (state.teams || []).filter((t) => !t.hidden && !t.isBye);
    if (simTeams.length < 4) throw new Error(`--use-existing: servono almeno 4 squadre in lista, trovate ${simTeams.length}`);
    fantaSeedPrefix = longestCommonIdPrefix(simTeams.map((t) => String(t.id || '')));
    console.log(`Uso ${simTeams.length} squadre gia' iscritte (prefisso fanta: ${fantaSeedPrefix || 'nessuno (tutte)'})`);
    state = {
      ...state,
      fantaSettings: { ...(state.fantaSettings || {}), enabled: true, updatedAt: new Date().toISOString() },
    } as AppState;
  } else {
    simTeams = buildSimTeams(TEAMS_N);
    fantaSeedPrefix = `simt_${SEED}_`;
    state = {
      ...state,
      teams: [...(state.teams || []), ...simTeams],
      fantaSettings: { ...(state.fantaSettings || {}), enabled: true, updatedAt: new Date().toISOString() },
    } as AppState;
  }
  await timeIt('push stato pretorneo', () => pushWorkspaceState(state));
  try {
    await timeIt('reset fanta config a pretorneo', () => resetFantaConfigToPretournament());
    const seedOut = await timeIt('seed squadre fanta pretorneo', () =>
      adminRpc('flbp_sim_seed_fanta_pretournament', {
        p_workspace_id: cfg.workspaceId,
        p_overwrite: false,
        p_team_id_prefix: fantaSeedPrefix,
      })
    );
    console.log(`Seed fanta pretorneo: ${JSON.stringify(seedOut)}`);
    const containerTeams = await anonRestGet(
      `fanta_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.__pre_tournament__&select=id`
    );
    fantaTeamsPromoted = containerTeams?.length || 0;
    fantaEnabledForRun = fantaTeamsPromoted > 0;
    console.log(`Squadre fanta sul pretorneo: ${fantaTeamsPromoted}${fantaEnabledForRun ? '' : ' (fanta checks disattivati: nessun account player)'}`);
  } catch (e: any) {
    issues.push(`Setup fanta pretorneo fallito: ${String(e?.message || e)}`);
    fantaEnabledForRun = false;
  }

  const generated = generateTournamentStructure(simTeams, {
    mode: 'elimination',
    tournamentName: `Torneo Sim ${simTeams.length} - seed ${SEED}`,
  } as any);
  state = {
    ...state,
    tournament: {
      ...generated.tournament,
      refereesPassword: 'TestSim2026!x',
      refereesAuthVersion: new Date().toISOString(),
    } as any,
    tournamentMatches: generated.matches,
  };
  const tournamentId = String(state.tournament!.id);
  const totalPlayable = generated.matches.filter((m) => m.phase === 'bracket' && !m.isBye && isRealTeamId(m.teamAId) && isRealTeamId(m.teamBId)).length;
  console.log(`Tabellone generato: torneo ${tournamentId}, ${generated.matches.length} match totali (~${totalPlayable} giocabili al via)`);

  // 4) Push iniziale (snapshot + export incrementale) - come "Conferma e Avvia Live"
  await timeIt('push snapshot iniziale', () => pushWorkspaceState(state));
  await timeIt('export incrementale iniziale', () => pushLiveTournamentIncremental(state));

  // 4b) Promozione fanta pretorneo -> torneo live (come fa handleStartLive)
  if (fantaEnabledForRun) {
    try {
      const promoteOut = await timeIt('promozione fanta al live', () =>
        promoteFantaPretournamentToTournament(tournamentId, state.tournament as any)
      );
      console.log(`Promozione fanta: ${JSON.stringify(promoteOut)}`);
      const liveTeams = await anonRestGet(
        `fanta_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}&select=id`
      );
      fantaTeamsPromoted = liveTeams?.length || 0;
      if (!fantaTeamsPromoted) {
        issues.push('Promozione fanta: nessuna squadra risulta collegata al torneo live');
        fantaEnabledForRun = false;
      } else {
        console.log(`Squadre fanta collegate al live: ${fantaTeamsPromoted}`);
      }
    } catch (e: any) {
      issues.push(`Promozione fanta fallita: ${String(e?.message || e)}`);
      fantaEnabledForRun = false;
    }
  }

  // Un conflitto di scrittura significa che il nostro base snapshot e' stantio:
  // qualcun altro ha scritto sul workspace dopo il nostro ultimo pull.
  const isWriteConflict = (e: any) =>
    /Conflitto|FLBP_DB_CONFLICT|aggiornato da un altro/i.test(String(e?.message || e || ''));

  // Ripulla lo stato dal DB, riallinea la base ottimistica e restituisce l'id
  // del torneo live attualmente nel DB (null se non c'e' nessun torneo live).
  const refreshBaseFromRemote = async (context: string): Promise<string | null> => {
    const row = await pullWorkspaceState({ source: `sim.recovery.${context}`, kind: 'admin' });
    setRemoteBaseUpdatedAt(row?.updated_at || null);
    const remote = row?.state ? coerceAppState(row.state) : null;
    const liveId = remote?.tournament?.id ? String(remote.tournament.id) : null;
    if (liveId && liveId !== tournamentId) {
      throw new Error(
        `Un altro writer (scheda Admin aperta?) ha sostituito il torneo live: nel DB c'e' ` +
        `${liveId}, il nostro e' ${tournamentId}. Chiudi ogni altra scheda Admin e rilancia. [${context}]`
      );
    }
    if (!liveId) {
      throw new Error(
        `Un altro writer ha azzerato il torneo live nel DB (nessun torneo live). ` +
        `Chiudi ogni altra scheda Admin e rilancia. [${context}]`
      );
    }
    return liveId;
  };

  // Persistenza di un referto: usa la RPC atomica per-match se disponibile,
  // altrimenti il percorso snapshot + export incrementale (identico al fallback
  // dell'app quando la migration per-match non e' applicata). In caso di
  // conflitto isolato ripulla lo stato e ritenta una volta, invece di cadere.
  let perMatchRpcAvailable = true;
  let loggedFallback = false;
  const persistReport = async (
    nextState: AppState,
    matchId: string,
    changed: Match[],
    reportIndex: number,
    matchLabel: string
  ) => {
    if (perMatchRpcAvailable) {
      try {
        await timeIt('RPC referto per-match', () => pushAdminMatchResults({ tournamentId, matchId, matches: changed }));
        return;
      } catch (e: any) {
        if (isMatchResultRpcMissingError(e)) {
          perMatchRpcAvailable = false;
          if (!loggedFallback) {
            loggedFallback = true;
            console.log('  (RPC per-match non applicata: uso il fallback snapshot + export incrementale come fa l\'app)');
          }
        } else {
          // La RPC per-match legge lo snapshot lato server: se e' ancora il nostro
          // torneo (refreshBaseFromRemote non lancia) il retry va a buon fine.
          issues.push(`Referto #${reportIndex} (${matchLabel}) errore RPC: ${String(e?.message || e)} - ritento`);
          await refreshBaseFromRemote(`rpc#${reportIndex}`);
          await sleep(1000);
          try {
            await timeIt('RPC referto per-match (retry)', () => pushAdminMatchResults({ tournamentId, matchId, matches: changed }));
            return;
          } catch (e2: any) {
            issues.push(`Referto #${reportIndex} (${matchLabel}) FALLITO anche al retry: ${String(e2?.message || e2)}`);
            perMatchRpcAvailable = false; // passa al fallback per non bloccare la corsa
          }
        }
      }
    }
    // Fallback: snapshot completo + export incrementale del solo torneo live.
    // Su conflitto isolato ripulla la base e ritenta una volta.
    try {
      await timeIt('fallback snapshot+incrementale', async () => {
        await pushWorkspaceState(nextState);
        await pushLiveTournamentIncremental(nextState);
      });
    } catch (e: any) {
      if (!isWriteConflict(e)) throw e;
      issues.push(`Referto #${reportIndex} (${matchLabel}) conflitto snapshot: ripullo e ritento`);
      await refreshBaseFromRemote(`fallback#${reportIndex}`);
      await timeIt('fallback snapshot+incrementale (retry)', async () => {
        await pushWorkspaceState(nextState);
        await pushLiveTournamentIncremental(nextState);
      });
    }
  };

  // 5) Referti uno per uno
  const savedResults: SavedResult[] = [];
  let reportNo = 0;
  for (;;) {
    const base = nextReportableMatch(state.tournamentMatches || []);
    if (!base) break;
    reportNo += 1;

    const before = cloneMatchesForResultSync(state.tournamentMatches || []);
    const reported = buildReportedMatch(state, base);
    let matches = (state.tournamentMatches || []).map((m) => (m.id === base.id ? reported : m));
    matches = reconcileBracketAdvancements(matches);
    const changed = collectChangedMatchResults(before, matches, base.id);
    const nextState: AppState = {
      ...state,
      tournamentMatches: matches,
      tournament: { ...state.tournament!, matches } as any,
    };

    await persistReport(nextState, base.id, changed, reportNo, base.code || base.id);
    state = nextState;

    savedResults.push({ id: base.id, scoreA: reported.scoreA, scoreB: reported.scoreB });
    for (const st of reported.stats || []) {
      const key = normalizePlayerNameKey(String(st.playerName || ''));
      localPlayerGoals.set(key, (localPlayerGoals.get(key) ?? 0) + (st.canestri || 0));
    }
    if (reportNo % 5 === 0) await checkPublicPropagation(savedResults, reportNo);
    if (reportNo % 10 === 0) {
      await checkFantaLivePropagation(tournamentId, reportNo);
      console.log(`  ... ${reportNo} referti inseriti`);
    }
  }
  console.log(`Referti completati: ${reportNo}`);

  const unfinished = (state.tournamentMatches || []).filter(
    (m) => m.phase === 'bracket' && !m.hidden && !m.isBye && m.status !== 'finished' && isRealTeamId(m.teamAId) && isRealTeamId(m.teamBId)
  );
  if (unfinished.length) issues.push(`Match rimasti non giocabili/incompiuti: ${unfinished.map((m) => m.code || m.id).join(', ')}`);

  // 6) MVP + archiviazione (come "Completa e Archivia" -> "Salva MVP e archivia")
  const anyPlayer = simTeams[randInt(0, simTeams.length - 1)];
  const mvpName = anyPlayer.player1;
  state = setTournamentMvps(state, tournamentId, state.tournament!.name, [
    { name: mvpName, id: getPlayerKey(mvpName, 'ND') },
  ]);
  state = archiveTournamentV2(state, { includeU25Awards: false });
  await timeIt('push snapshot archiviazione', () => pushWorkspaceState(state));
  await timeIt('export completo post-archiviazione', () => pushNormalizedFromState(state, { force: true }));
  try {
    const fantaOut = await timeIt('snapshot fanta archivio', () => archiveFantaTournamentEdition(tournamentId));
    console.log(`Fanta archivio: ${JSON.stringify(fantaOut)}`);
  } catch (e: any) {
    issues.push(`Snapshot fanta archivio fallito: ${String(e?.message || e)}`);
  }

  // 6b) Pulizia: in modalita' sintetica rimuovo le squadre "Sim Squadra" dalla
  // lista iscritti per non lasciare residui (lo storico conserva le sue copie).
  if (!USE_EXISTING_TEAMS) {
    const simIds = new Set(simTeams.map((t) => t.id));
    const cleanedTeams = (state.teams || []).filter((t) => !simIds.has(t.id));
    if (cleanedTeams.length !== (state.teams || []).length) {
      state = { ...state, teams: cleanedTeams };
      await timeIt('pulizia squadre sintetiche', () => pushWorkspaceState(state));
      console.log(`Rimosse ${(simTeams.length)} squadre sintetiche dalla lista iscritti.`);
    }
  }

  // 7) Verifiche finali dal lato PUBBLICO (anonimo)
  console.log('\nVerifiche finali (lettura pubblica):');
  const tEnc = encodeURIComponent(tournamentId);
  const wEnc = encodeURIComponent(cfg.workspaceId);

  const archivedRows = await anonRestGet(`public_tournaments?workspace_id=eq.${wEnc}&id=eq.${tEnc}&select=id,status`);
  const archivedOk = archivedRows?.[0]?.status === 'archived';
  console.log(`  torneo in storico pubblico: ${archivedOk ? 'OK' : 'MANCANTE'}`);
  if (!archivedOk) issues.push('Il torneo simulato non risulta archiviato in public_tournaments');

  const hofRows = await anonRestGet(`public_hall_of_fame_entries?workspace_id=eq.${wEnc}&tournament_id=eq.${tEnc}&select=type,player_names`);
  const hofTypes = new Set((hofRows || []).map((r: any) => r.type));
  const expectedTypes = ['winner', 'top_scorer', 'defender', 'mvp'];
  const missingTypes = expectedTypes.filter((t) => !hofTypes.has(t));
  console.log(`  albo d'oro (winner/top_scorer/defender/mvp): ${missingTypes.length ? `MANCANO ${missingTypes.join(',')}` : 'OK'} (${hofRows?.length || 0} voci)`);
  if (missingTypes.length) issues.push(`Albo d'oro incompleto per il torneo sim: mancano ${missingTypes.join(', ')}`);

  // Controllo carriera: prendo il capocannoniere della simulazione (verita' locale)
  const topScorerEntry = [...localPlayerGoals.entries()].sort((a, b) => b[1] - a[1])[0];
  const topScorerOriginalName = (state.tournamentHistory || [])
    .flatMap((tr) => tr.teams || [])
    .flatMap((tm) => [tm.player1, tm.player2])
    .find((n) => n && normalizePlayerNameKey(String(n)) === topScorerEntry?.[0]) || '';
  if (topScorerOriginalName) {
    const careerRows = await anonRestGet(
      `public_career_leaderboard?workspace_id=eq.${wEnc}&name=eq.${encodeURIComponent(topScorerOriginalName)}&select=name,games_played,points`
    );
    const careerOk = Array.isArray(careerRows) && careerRows.length > 0
      && (careerRows[0].points || 0) >= (topScorerEntry?.[1] || 0);
    console.log(`  classifiche storiche aggiornate (capocannoniere "${topScorerOriginalName}", ${topScorerEntry?.[1]} canestri sim): ${careerOk ? 'OK' : 'NON COERENTE'}`);
    if (!careerOk) issues.push(`public_career_leaderboard non riflette il capocannoniere sim (${topScorerOriginalName})`);
  } else {
    console.log('  classifiche storiche: capocannoniere sim non individuabile per nome, controllo saltato');
  }

  // 7b) Verifiche FANTA post-archiviazione (viste _awarded: snapshot + titoli vivi)
  if (fantaEnabledForRun) {
    const fantaStandings = await anonRestGet(
      `fanta_archived_standings_awarded?workspace_id=eq.${wEnc}&tournament_id=eq.${tEnc}&select=team_name,total_points,points_from_awards&order=rank.asc`
    );
    const fantaRowsOk = (fantaStandings?.length || 0) === fantaTeamsPromoted;
    console.log(`  archivio fanta (squadre): ${fantaStandings?.length || 0}/${fantaTeamsPromoted} ${fantaRowsOk ? 'OK' : 'INCOMPLETO'}`);
    if (!fantaRowsOk) issues.push(`Archivio fanta: attese ${fantaTeamsPromoted} squadre, trovate ${fantaStandings?.length || 0}`);

    const awardedPlayerNames: string[] = (hofRows || [])
      .flatMap((r: any) => (Array.isArray(r.player_names) ? r.player_names : []))
      .map((n: any) => normalizePlayerNameKey(String(n || '')))
      .filter(Boolean);
    const fantaRosterRows = await anonRestGet(
      `fanta_archived_rosters_awarded?workspace_id=eq.${wEnc}&tournament_id=eq.${tEnc}&select=player_name,points_from_awards,raw_goals&limit=1000`
    );
    const rosterHasAwardedPlayer = (fantaRosterRows || []).filter((r: any) =>
      awardedPlayerNames.includes(normalizePlayerNameKey(String(r.player_name || '')))
    );
    if (rosterHasAwardedPlayer.length) {
      const missingAwardPts = rosterHasAwardedPlayer.filter((r: any) => Number(r.points_from_awards || 0) < 10);
      console.log(`  punti-titoli nelle rose fanta: ${rosterHasAwardedPlayer.length - missingAwardPts.length}/${rosterHasAwardedPlayer.length} titolati con +10 ${missingAwardPts.length ? 'MANCANO PUNTI' : 'OK'}`);
      if (missingAwardPts.length) {
        issues.push(`Punti-titoli fanta mancanti per: ${missingAwardPts.slice(0, 5).map((r: any) => r.player_name).join(', ')}`);
      }
    } else {
      console.log('  punti-titoli nelle rose fanta: nessuna rosa contiene un titolato (caso possibile, nessuna verifica)');
    }

    // Coerenza canestri finale: vista archivio vs statistiche locali accumulate
    const goalMismatches = (fantaRosterRows || []).filter((r: any) => {
      const expected = localPlayerGoals.get(normalizePlayerNameKey(String(r.player_name || ''))) ?? 0;
      return Number(r.raw_goals || 0) !== expected;
    });
    console.log(`  canestri rose fanta vs simulazione: ${goalMismatches.length ? `${goalMismatches.length} INCOERENTI` : 'OK'}`);
    if (goalMismatches.length) {
      issues.push(`Canestri fanta incoerenti per: ${goalMismatches.slice(0, 5).map((r: any) => r.player_name).join(', ')}`);
    }

    const fantaEdition = await anonRestGet(
      `fanta_archived_editions_awarded?workspace_id=eq.${wEnc}&tournament_id=eq.${tEnc}&select=winner_team_name,winner_points,teams_count`
    );
    const editionOk = !!fantaEdition?.[0] && Number(fantaEdition[0].winner_points || 0) > 0;
    console.log(`  edizione fanta archiviata: ${editionOk ? `OK (vincitore "${fantaEdition[0].winner_team_name}" con ${fantaEdition[0].winner_points} punti)` : 'MANCANTE O SENZA PUNTI'}`);
    if (!editionOk) issues.push('fanta_archived_editions_awarded senza vincitore/punti per il torneo sim');
  } else {
    console.log('  fanta: non attivo in questa run (nessuna squadra fanta) - verifiche saltate');
  }

  // 8) Report finale
  console.log('\n================= REPORT =================');
  console.log(summarizeOps());
  console.log('\nConsumo rete Supabase:');
  console.log(summarizeNetwork());
  console.log('\nPropagazione admin -> live pubblico (check ogni 5 referti):');
  const okChecks = propagationChecks.filter((c) => c.ok);
  for (const c of propagationChecks) {
    console.log(`  #${c.atMatch}: ${c.ok ? `OK in ${c.latencyMs}ms` : `FALLITO (${c.detail})`}`);
  }
  if (propagationChecks.length) {
    const lat = okChecks.map((c) => c.latencyMs || 0);
    console.log(`  riepilogo: ${okChecks.length}/${propagationChecks.length} coerenti | latenza avg=${lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : '-'}ms p95=${percentile(lat, 95)}ms`);
  }
  if (fantaChecks.length) {
    console.log('\nPropagazione FANTA live (check ogni 10 referti):');
    for (const c of fantaChecks) console.log(`  #${c.atMatch}: ${c.ok ? 'OK' : 'FALLITO'} - ${c.detail}`);
  }
  console.log(`\nProblemi rilevati (${issues.length}):`);
  for (const p of issues) console.log(`  - ${p}`);
  if (!issues.length) console.log('  nessuno');
  const failedOps = opStats.filter((s) => !s.ok);
  console.log(`\nEsito: ${issues.length === 0 && failedOps.length === 0 ? 'TUTTO VERDE' : 'CON ANOMALIE (vedi sopra)'}`);
  console.log('Nota: il torneo simulato resta archiviato per ispezione; le "Sim Squadra" restano in lista iscritti (rimuovibili dall\'app).');

  process.exitCode = issues.length === 0 && failedOps.length === 0 ? 0 : 1;
  await releaseAdminWriteLease();
};

main().catch((e) => {
  console.error(`\nSIMULAZIONE INTERROTTA: ${String(e?.message || e)}`);
  console.log('\nOperazioni registrate fino all\'errore:');
  console.log(summarizeOps());
  process.exitCode = 1;
  void releaseAdminWriteLease();
});
