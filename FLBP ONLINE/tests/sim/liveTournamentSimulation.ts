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
import {
  archiveFantaTournamentEdition,
  getSupabaseConfig,
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
import { pullPublicWorkspaceLive } from '../../services/supabasePublic';
import type { Match, Team } from '../../types';

// ----------------------------- CLI / env ----------------------------------

const argValue = (name: string): string | null => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

const TEAMS_N = Math.max(4, Math.min(400, parseInt(argValue('teams') || '128', 10) || 128));
const SEED = parseInt(argValue('seed') || `${Date.now() % 100000}`, 10) || 1;
const PROPAGATION_TIMEOUT_MS = 20_000;

const readEnvSim = (): Record<string, string> => {
  try {
    const raw = readFileSync(new URL('../../.env.sim', import.meta.url), 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
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

const checkPublicPropagation = async (savedSoFar: SavedResult[], atMatch: number) => {
  const wanted = savedSoFar.slice(-5);
  const t0 = Date.now();
  let lastDetail = '';
  while (Date.now() - t0 < PROPAGATION_TIMEOUT_MS) {
    try {
      const row = await pullPublicWorkspaceLive({ source: 'sim.propagationCheck', kind: 'polling' });
      const liveMatches: Match[] = (row?.state as any)?.tournamentMatches || [];
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

  // 2) Stato attuale + guardie di sicurezza
  const remoteRow = await timeIt('pull workspace state', () => pullWorkspaceState({ source: 'sim.initialPull', kind: 'admin' }));
  if (!remoteRow?.state) throw new Error('Snapshot admin non trovato nel DB');
  setRemoteBaseUpdatedAt(remoteRow.updated_at || null);
  let state: AppState = coerceAppState(remoteRow.state);
  if (state.tournament) {
    throw new Error(`SICUREZZA: esiste gia' un torneo live ("${state.tournament.name}"). Archivialo o eliminalo prima di simulare.`);
  }
  const historyBefore = (state.tournamentHistory || []).length;
  const hofBefore = (state.hallOfFame || []).length;
  console.log(`Stato attuale: ${state.teams?.length || 0} iscritti, ${historyBefore} tornei storici, ${hofBefore} voci albo`);

  // 3) Squadre sintetiche + FASE PRETORNEO FANTA (come "Attiva Fanta")
  const simTeams = buildSimTeams(TEAMS_N);
  state = {
    ...state,
    teams: [...(state.teams || []), ...simTeams],
    fantaSettings: { ...(state.fantaSettings || {}), enabled: true, updatedAt: new Date().toISOString() },
  } as AppState;
  await timeIt('push stato pretorneo', () => pushWorkspaceState(state));
  try {
    await timeIt('reset fanta config a pretorneo', () => resetFantaConfigToPretournament());
    const seedOut = await timeIt('seed squadre fanta pretorneo', () =>
      adminRpc('flbp_sim_seed_fanta_pretournament', {
        p_workspace_id: cfg.workspaceId,
        p_overwrite: false,
        p_team_id_prefix: `simt_${SEED}_`,
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
    tournamentName: `Torneo Sim ${TEAMS_N} - seed ${SEED}`,
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

    try {
      await timeIt('RPC referto per-match', () =>
        pushAdminMatchResults({ tournamentId, matchId: base.id, matches: changed })
      );
    } catch (e: any) {
      issues.push(`Referto #${reportNo} (${base.code || base.id}) FALLITO: ${String(e?.message || e)}`);
      // un retry, come farebbe un admin
      await sleep(1500);
      await timeIt('RPC referto per-match (retry)', () =>
        pushAdminMatchResults({ tournamentId, matchId: base.id, matches: changed })
      );
    }

    state = {
      ...state,
      tournamentMatches: matches,
      tournament: { ...state.tournament!, matches } as any,
    };

    // autosave dello snapshot come fa l'app dopo ogni modifica
    await timeIt('autosave snapshot', () => pushWorkspaceState(state));

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

  const anySimPlayerName = encodeURIComponent(`Simuno${pad3(1)} Prova`);
  const careerRows = await anonRestGet(`public_career_leaderboard?workspace_id=eq.${wEnc}&name=eq.${anySimPlayerName}&select=name,games_played,points`);
  const careerOk = Array.isArray(careerRows) && careerRows.length > 0 && (careerRows[0].games_played || 0) > 0;
  console.log(`  classifiche storiche aggiornate (giocatore campione di prova): ${careerOk ? 'OK' : 'NON TROVATO'}`);
  if (!careerOk) issues.push('public_career_leaderboard non contiene il giocatore sim dopo archiviazione');

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
};

main().catch((e) => {
  console.error(`\nSIMULAZIONE INTERROTTA: ${String(e?.message || e)}`);
  console.log('\nOperazioni registrate fino all\'errore:');
  console.log(summarizeOps());
  process.exitCode = 1;
});
