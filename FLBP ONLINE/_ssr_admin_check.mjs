var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// types.ts
var TV_PROJECTIONS;
var init_types = __esm({
  "types.ts"() {
    TV_PROJECTIONS = ["groups", "groups_bracket", "bracket", "scorers"];
  }
});

// services/groupStandings.ts
var aggregateMatchStats, scoreForTeam, soffiForTeam, getParticipants, computeGroupStandings;
var init_groupStandings = __esm({
  "services/groupStandings.ts"() {
    aggregateMatchStats = (m) => {
      const canestriByTeam = {};
      const soffiByTeam = {};
      const stats = m.stats || [];
      for (const s of stats) {
        const tid = s.teamId;
        if (!tid) continue;
        canestriByTeam[tid] = (canestriByTeam[tid] || 0) + (s.canestri || 0);
        soffiByTeam[tid] = (soffiByTeam[tid] || 0) + (s.soffi || 0);
      }
      return { canestriByTeam, soffiByTeam };
    };
    scoreForTeam = (m, teamId, canestriByTeam) => {
      if (m.scoresByTeam && typeof m.scoresByTeam[teamId] === "number") {
        return m.scoresByTeam[teamId] || 0;
      }
      return canestriByTeam[teamId] || 0;
    };
    soffiForTeam = (teamId, soffiByTeam) => {
      return soffiByTeam[teamId] || 0;
    };
    getParticipants = (m) => {
      const ids = m.teamIds && m.teamIds.length ? m.teamIds : m.teamAId && m.teamBId ? [m.teamAId, m.teamBId] : [];
      return ids.filter(Boolean);
    };
    computeGroupStandings = (opts) => {
      const { teams, matches } = opts;
      const rows = {};
      for (const t of teams) {
        rows[t.id] = {
          teamId: t.id,
          played: 0,
          wins: 0,
          losses: 0,
          points: 0,
          cupsFor: 0,
          cupsAgainst: 0,
          cupsDiff: 0,
          blowFor: 0,
          blowAgainst: 0,
          blowDiff: 0
        };
      }
      for (const m of matches) {
        if (m.status !== "finished") continue;
        const participants = getParticipants(m);
        if (participants.length < 2) continue;
        if (m.hidden) continue;
        if (m.isBye) continue;
        if (participants.includes("BYE")) continue;
        const { canestriByTeam, soffiByTeam } = aggregateMatchStats(m);
        const scores = {};
        const blows = {};
        let totalScore = 0;
        let totalBlows = 0;
        for (const id of participants) {
          const sc = scoreForTeam(m, id, canestriByTeam);
          const bl = soffiForTeam(id, soffiByTeam);
          scores[id] = sc;
          blows[id] = bl;
          totalScore += sc;
          totalBlows += bl;
        }
        for (const id of participants) {
          const r = rows[id];
          if (!r) continue;
          r.played += 1;
          r.cupsFor += scores[id] || 0;
          r.cupsAgainst += totalScore - (scores[id] || 0);
          r.blowFor += blows[id] || 0;
          r.blowAgainst += totalBlows - (blows[id] || 0);
        }
        const maxScore = Math.max(...participants.map((id) => scores[id] || 0));
        const leaders = participants.filter((id) => (scores[id] || 0) === maxScore);
        if (leaders.length === 1) {
          const winnerId = leaders[0];
          for (const id of participants) {
            const r = rows[id];
            if (!r) continue;
            if (id === winnerId) r.wins += 1;
            else r.losses += 1;
          }
        }
      }
      for (const id of Object.keys(rows)) {
        const r = rows[id];
        r.points = r.wins;
        r.cupsDiff = r.cupsFor - r.cupsAgainst;
        r.blowDiff = r.blowFor - r.blowAgainst;
      }
      const rankedTeams = [...teams].sort((a, b) => {
        const A = rows[a.id];
        const B = rows[b.id];
        const pA = A?.points ?? 0;
        const pB = B?.points ?? 0;
        if (pB !== pA) return pB - pA;
        const dCA = A?.cupsDiff ?? 0;
        const dCB = B?.cupsDiff ?? 0;
        if (dCB !== dCA) return dCB - dCA;
        const dSA = A?.blowDiff ?? 0;
        const dSB = B?.blowDiff ?? 0;
        if (dSB !== dSA) return dSB - dSA;
        const cfA = A?.cupsFor ?? 0;
        const cfB = B?.cupsFor ?? 0;
        if (cfB !== cfA) return cfB - cfA;
        return (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" });
      });
      return { rows, rankedTeams };
    };
  }
});

// services/storageService.ts
var storageService_exports = {};
__export(storageService_exports, {
  APP_STATE_SCHEMA_VERSION: () => APP_STATE_SCHEMA_VERSION,
  archiveTournamentV2: () => archiveTournamentV2,
  assertTvProjection: () => assertTvProjection,
  coerceAppState: () => coerceAppState,
  getPlayerKey: () => getPlayerKey,
  getPlayerKeyLabel: () => getPlayerKeyLabel,
  isU25: () => isU25,
  loadState: () => loadState,
  normalizeTvProjection: () => normalizeTvProjection,
  resolvePlayerKey: () => resolvePlayerKey,
  saveState: () => saveState,
  setTournamentMvp: () => setTournamentMvp,
  setTournamentMvps: () => setTournamentMvps
});
var STORAGE_KEY, APP_STATE_SCHEMA_VERSION, initialState, coerceAppState, loadState, saveState, getPlayerKey, resolvePlayerKey, getPlayerKeyLabel, isU25, normalizeName, isUnder25Rule, getWinnerTeamId, isByeTeam, isFinalGroupName, isFinalGroup, getUniqueLeaderFromGroup, buildTournamentAwards, setTournamentMvp, setTournamentMvps, archiveTournamentV2, normalizeTvProjection, assertTvProjection;
var init_storageService = __esm({
  "services/storageService.ts"() {
    init_types();
    init_groupStandings();
    STORAGE_KEY = "beer_pong_app_state";
    APP_STATE_SCHEMA_VERSION = 1;
    initialState = {
      teams: [],
      matches: [],
      tournament: null,
      tournamentMatches: [],
      tournamentHistory: [],
      logo: "",
      hallOfFame: [],
      integrationsScorers: [],
      playerAliases: {}
    };
    coerceAppState = (raw2) => {
      const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
      const asArr = (v, fallback = []) => Array.isArray(v) ? v : fallback;
      const asObj = (v, fallback = {}) => isObj(v) ? v : fallback;
      const asStr = (v, fallback = "") => typeof v === "string" ? v : fallback;
      if (!isObj(raw2)) return { ...initialState };
      const merged = { ...initialState, ...raw2 };
      merged.teams = asArr(merged.teams);
      merged.matches = asArr(merged.matches);
      merged.tournamentMatches = asArr(merged.tournamentMatches);
      merged.tournamentHistory = asArr(merged.tournamentHistory);
      merged.hallOfFame = asArr(merged.hallOfFame);
      merged.integrationsScorers = asArr(merged.integrationsScorers);
      merged.playerAliases = asObj(merged.playerAliases, {});
      merged.logo = asStr(merged.logo, "");
      merged.tournament = merged.tournament && isObj(merged.tournament) ? merged.tournament : null;
      return merged;
    };
    loadState = () => {
      try {
        const serialized = localStorage.getItem(STORAGE_KEY);
        if (!serialized) return initialState;
        const next = coerceAppState(JSON.parse(serialized));
        if (typeof next.__schemaVersion !== "number") next.__schemaVersion = 0;
        return next;
      } catch (e) {
        console.error("Failed to load state", e);
        return initialState;
      }
    };
    saveState = (state) => {
      try {
        const next = { ...state, __schemaVersion: APP_STATE_SCHEMA_VERSION };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save state", e);
      }
    };
    getPlayerKey = (name, yob) => {
      const base = (name || "").trim().toLowerCase().replace(/\s+/g, "_");
      if (yob === void 0) return base;
      const suffix = yob === "ND" ? "ND" : String(yob);
      return `${base}_${suffix}`;
    };
    resolvePlayerKey = (stateOrAliases, key) => {
      const aliases = !stateOrAliases ? {} : ("playerAliases" in stateOrAliases ? stateOrAliases.playerAliases || {} : stateOrAliases) || {};
      let cur = key;
      const seen = /* @__PURE__ */ new Set();
      while (aliases[cur] && !seen.has(cur)) {
        seen.add(cur);
        cur = aliases[cur];
      }
      return cur;
    };
    getPlayerKeyLabel = (key) => {
      const raw2 = (key || "").trim();
      const m = raw2.match(/_(ND|\d{4})$/i);
      if (!m) return { name: raw2.replace(/_/g, " "), yob: "ND" };
      const yob = m[1].toUpperCase();
      const namePart = raw2.slice(0, raw2.length - m[0].length).replace(/_/g, " ").trim();
      return { name: namePart, yob };
    };
    isU25 = (yob) => {
      if (!yob) return false;
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      return currentYear - yob < 26;
    };
    normalizeName = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");
    isUnder25Rule = (yob) => {
      if (!yob) return false;
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      return currentYear - yob < 26;
    };
    getWinnerTeamId = (m) => {
      if (!m) return void 0;
      if (m.teamAId === "BYE" && m.teamBId && m.teamBId !== "BYE") return m.teamBId;
      if (m.teamBId === "BYE" && m.teamAId && m.teamAId !== "BYE") return m.teamAId;
      if (m.status !== "finished") return void 0;
      if (m.scoreA > m.scoreB) return m.teamAId;
      if (m.scoreB > m.scoreA) return m.teamBId;
      return void 0;
    };
    isByeTeam = (t) => String(t?.id || "").toUpperCase() === "BYE" || !!t?.isBye || !!t?.hidden;
    isFinalGroupName = (name) => /\bfinale?\b/i.test(String(name || ""));
    isFinalGroup = (g) => !!g && (g.stage === "final" || isFinalGroupName(g.name));
    getUniqueLeaderFromGroup = (tournament, matches, groupName, teams) => {
      const gMatchesAll = (matches || []).filter((m) => m.phase === "groups" && (m.groupName || "") === groupName && !m.hidden && !m.isBye);
      if (!gMatchesAll.length) return void 0;
      const base = gMatchesAll.filter((m) => !m.isTieBreak);
      if (!base.length) return void 0;
      if (!base.every((m) => m.status === "finished")) return void 0;
      if (gMatchesAll.some((m) => m.isTieBreak && m.status !== "finished")) return void 0;
      const visibleTeams = (teams || []).filter((t) => !isByeTeam(t) && !t.isReferee);
      if (visibleTeams.length < 2) return void 0;
      const finished = gMatchesAll.filter((m) => m.status === "finished");
      const { rows, rankedTeams } = computeGroupStandings({ teams: visibleTeams, matches: finished });
      if (!rankedTeams.length) return void 0;
      if (rankedTeams.length < 2) return rankedTeams[0]?.id;
      const top = rankedTeams[0];
      const second = rankedTeams[1];
      if (!top || !second) return void 0;
      const key = (id) => {
        const r = rows[id] || {};
        return [r.points ?? 0, r.cupsDiff ?? 0, r.blowDiff ?? 0, r.cupsFor ?? 0];
      };
      const k1 = key(top.id);
      const k2 = key(second.id);
      const tied = k1[0] === k2[0] && k1[1] === k2[1] && k1[2] === k2[2] && k1[3] === k2[3];
      if (tied) return void 0;
      return top.id;
    };
    buildTournamentAwards = (tournament, matches, teams) => {
      const year = new Date(tournament.startDate).getFullYear().toString();
      const entries = [];
      let winnerTeamId;
      const finalRrActivated = !!tournament.config?.finalRoundRobin?.activated;
      const finalGroup = (tournament.groups || []).find((g) => isFinalGroup(g));
      if (finalRrActivated && finalGroup) {
        winnerTeamId = getUniqueLeaderFromGroup(tournament, matches, finalGroup.name, finalGroup.teams || []);
      } else if (tournament.type === "round_robin") {
        const group = (tournament.groups || [])[0];
        const groupName = group?.name || "Girone Unico";
        const groupTeams = group?.teams || (tournament.teams || []);
        winnerTeamId = getUniqueLeaderFromGroup(tournament, matches, groupName, groupTeams);
      }
      if (!winnerTeamId) {
        const bracket = (matches || []).filter((m) => m.phase === "bracket");
        const maxRound = bracket.reduce((acc, m) => Math.max(acc, m.round || 0), 0);
        const finalMatch = bracket.filter((m) => (m.round || 0) === maxRound).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0];
        winnerTeamId = finalMatch ? getWinnerTeamId(finalMatch) : void 0;
      }
      if (winnerTeamId && winnerTeamId !== "BYE") {
        const team = teams.find((tt) => tt.id === winnerTeamId);
        const playerNames = team ? [team.player1, team.player2].filter(Boolean) : [];
        entries.push({
          id: `${tournament.id}_winner`,
          year,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          type: "winner",
          teamName: team?.name || winnerTeamId,
          playerNames
        });
      }
      const agg = {};
      (matches || []).forEach((m) => {
        if (m.status !== "finished") return;
        if (!m.stats) return;
        m.stats.forEach((s) => {
          const team = teams.find((tt) => tt.id === s.teamId);
          const yob = team ? team.player1 === s.playerName ? team.player1YoB : team.player2YoB : void 0;
          const key = `${normalizeName(s.playerName)}_${yob || "ND"}`;
          if (!agg[key]) {
            agg[key] = { name: s.playerName, yob, points: 0, soffi: 0, games: 0 };
          }
          agg[key].points += s.canestri || 0;
          agg[key].soffi += s.soffi || 0;
          agg[key].games += 1;
        });
      });
      const players = Object.values(agg).filter((p) => p.games > 0);
      const pickMax = (arr, scoreFn) => {
        return arr.slice().sort((a, b) => {
          const sa = scoreFn(a);
          const sb = scoreFn(b);
          if (sb !== sa) return sb - sa;
          if (b.points !== a.points) return b.points - a.points;
          if (b.soffi !== a.soffi) return b.soffi - a.soffi;
          return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
        })[0];
      };
      const topScorer = pickMax(players, (p) => p.points);
      if (topScorer && topScorer.points > 0) {
        entries.push({
          id: `${tournament.id}_top_scorer`,
          year,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          type: "top_scorer",
          playerNames: [topScorer.name],
          value: topScorer.points,
          playerId: getPlayerKey(topScorer.name, topScorer.yob ?? "ND")
        });
      }
      const defender = pickMax(players, (p) => p.soffi);
      if (defender && defender.soffi > 0) {
        entries.push({
          id: `${tournament.id}_defender`,
          year,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          type: "defender",
          playerNames: [defender.name],
          value: defender.soffi,
          playerId: getPlayerKey(defender.name, defender.yob ?? "ND")
        });
      }
      const u25Players = players.filter((p) => isUnder25Rule(p.yob));
      const topScorerU25 = pickMax(u25Players, (p) => p.points);
      if (topScorerU25 && topScorerU25.points > 0) {
        entries.push({
          id: `${tournament.id}_top_scorer_u25`,
          year,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          type: "top_scorer_u25",
          playerNames: [topScorerU25.name],
          value: topScorerU25.points,
          playerId: getPlayerKey(topScorerU25.name, topScorerU25.yob ?? "ND")
        });
      }
      const defenderU25 = pickMax(u25Players, (p) => p.soffi);
      if (defenderU25 && defenderU25.soffi > 0) {
        entries.push({
          id: `${tournament.id}_defender_u25`,
          year,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          type: "defender_u25",
          playerNames: [defenderU25.name],
          value: defenderU25.soffi,
          playerId: getPlayerKey(defenderU25.name, defenderU25.yob ?? "ND")
        });
      }
      return entries;
    };
    setTournamentMvp = (state, tournamentId, tournamentName, playerName, playerId) => {
      return setTournamentMvps(state, tournamentId, tournamentName, [{ name: playerName, id: playerId }]);
    };
    setTournamentMvps = (state, tournamentId, tournamentName, players) => {
      const year = (state.tournament?.startDate ? new Date(state.tournament.startDate) : /* @__PURE__ */ new Date()).getFullYear().toString();
      const cleaned = (state.hallOfFame || []).filter((e) => !(e.tournamentId === tournamentId && e.type === "mvp"));
      const uniq = /* @__PURE__ */ new Map();
      (players || []).forEach((p) => {
        const k = (p.id || "").trim() || (p.name || "").trim().toLowerCase();
        if (!k) return;
        if (!uniq.has(k)) uniq.set(k, p);
      });
      const entries = Array.from(uniq.values()).map((p) => ({
        id: `${tournamentId}_mvp_${p.id || (p.name || "").trim().toLowerCase().replace(/\s+/g, "_")}`,
        year,
        tournamentId,
        tournamentName,
        type: "mvp",
        playerNames: [p.name],
        playerId: p.id
      }));
      return { ...state, hallOfFame: [...cleaned, ...entries] };
    };
    archiveTournamentV2 = (state) => {
      if (!state.tournament) return state;
      const archivedTournament = {
        ...state.tournament,
        matches: state.tournamentMatches
      };
      const newAwards = buildTournamentAwards(state.tournament, state.tournamentMatches || [], state.teams || []);
      const existingMvps = (state.hallOfFame || []).filter((e) => e.tournamentId === state.tournament.id && e.type === "mvp");
      const cleanedHallOfFame = (state.hallOfFame || []).filter((e) => e.tournamentId !== state.tournament.id);
      return {
        ...state,
        tournamentHistory: [...state.tournamentHistory || [], archivedTournament],
        hallOfFame: [...cleanedHallOfFame || [], ...existingMvps, ...newAwards],
        tournament: null,
        tournamentMatches: []
      };
    };
    normalizeTvProjection = (val) => {
      if (!val) return "scorers";
      if (TV_PROJECTIONS.includes(val)) {
        return val;
      }
      return "scorers";
    };
    assertTvProjection = (val) => {
      const normalized2 = normalizeTvProjection(val);
      if (val && val !== normalized2) {
        console.warn(`[TvProjection] Legacy or invalid mode detected: "${val}". Normalized to: "${normalized2}".`);
      }
      return normalized2;
    };
  }
});

// components/Home.tsx
import { Trophy, LayoutDashboard, Star, ChevronRight, Settings } from "lucide-react";
import { jsx, jsxs } from "react/jsx-runtime";
var init_Home = __esm({
  "components/Home.tsx"() {
    init_App();
  }
});

// services/simTeamNames200.ts
var SIM_TEAM_NAMES_200;
var init_simTeamNames200 = __esm({
  "services/simTeamNames200.ts"() {
    SIM_TEAM_NAMES_200 = [
      "LE MATUSA",
      "OMINI DELLE BOMBE",
      "Eppure",
      "Ricci&Muscoli",
      "Davattro",
      "Tucu Correa",
      "Sefarditi",
      "Buon NatAlex",
      "Pinco panico",
      "Sensibilit\xE0 e educazione",
      "Splash Bros",
      "Beer Angels",
      "K",
      "Basta Poco",
      "Rigatoni Pasta",
      "Parelli 5.4",
      "I Miralcoolati",
      "Senza SentimIento",
      "I boccino",
      "Gli Amici di B.O.R.I.S",
      "SUPER &QUARK",
      "Gsc",
      "Alcolisti ingenui",
      "Io e te",
      "Gli Zero Mira",
      "CB",
      "sissignore",
      "I Polpi",
      "Schisce",
      "I PNC",
      "Daddy e Quaglia",
      "Tranquilli ma Tossici",
      "Paziente e Dottore",
      "Double IPA",
      "Parappappa!",
      "I 101 sorsi",
      "Cabrones",
      "Senza lilleri non si Ler",
      "La Clio",
      "Ci vuole polso",
      "Seifuoribella",
      "IL DUO",
      "TENNIS MAULINA",
      "I Margini",
      "Northampton",
      "Zinellacci",
      "Grunge",
      "Los Mirabiliantes Dos",
      "Los fantasticos dos",
      "Olimpico",
      "Le Avvogatte",
      "Le SkizzoSkizzo",
      "Lagradisco",
      "Le tocche",
      "I Frusi",
      "Orate",
      "ALFONSO SIGNORINi",
      "The Plow and The Show",
      "Los Pollos Hermanos",
      "Ci falciano",
      "Atletico Divano",
      "La mattina dopo",
      "Perfetti sconosciuti",
      "Japan called",
      "Tampussi",
      "Dadi",
      "Bonny Pizza",
      "ARISTOCAZZI",
      "Tommi in scatola",
      "Beerkenau",
      "Fenomeno o bluffff",
      "Abu Bhari",
      "Newpsie",
      "Guelfi e Ghisellini",
      "Da Boe",
      "#Skizofrenia",
      "La Cappella",
      "Clickers",
      "Gli Stonfi",
      "Pinco panco panco pinco",
      "Nuanda1000",
      "PNC",
      "Odio Jo Bott",
      "MajinBu&Babidi",
      "Tanti auguri caro Peeta",
      "JLO",
      "Fidanzati con una sBirra",
      "Fuzcaldi",
      "Zio Gianluca",
      "FB buongiorno",
      "Squadra enchantix",
      "apostoli di Tognarazinger",
      "Schizzo del mercoled\xEC",
      "Siam queste amo",
      "Chaos&Loathing",
      "Alex & Michele",
      "Obrigad",
      "GLI OMINI DELLE BOMBE",
      "Procioni Frocioni",
      "Delicatezza e sensibilit\xE0",
      "Satanazzi",
      "Locals B",
      "Smithers&Mr.Burns",
      "I soci",
      "Costruzione dal basso",
      "Il danno e la beffa",
      "Daje Roma daje",
      "I Testimoni di Piero",
      "Mai una Gioia",
      "Billeri",
      "I Giocabili",
      "Smooth Operators",
      "Il boccino",
      "P.S.V.",
      "Blasco",
      "Senza quorum",
      "Igor Miti",
      "Alguer",
      "Poggiez",
      "Sti Stranieri",
      "Sbronzi a rete",
      "Funghi Furiosi",
      "I piolisti",
      "LE MATUSA II",
      "OMINI DELLE BOMBE II",
      "Eppure II",
      "Ricci&Muscoli II",
      "Davattro II",
      "Tucu Correa II",
      "Sefarditi II",
      "Buon NatAlex II",
      "Pinco panico II",
      "Sensibilit\xE0 e educazione II",
      "Splash Bros II",
      "Beer Angels II",
      "K II",
      "Basta Poco II",
      "Rigatoni Pasta II",
      "Parelli 5.4 II",
      "I Miralcoolati II",
      "Senza SentimIento II",
      "I boccino II",
      "Gli Amici di B.O.R.I.S II",
      "SUPER &QUARK II",
      "Gsc II",
      "Alcolisti ingenui II",
      "Io e te II",
      "Gli Zero Mira II",
      "CB II",
      "sissignore II",
      "I Polpi II",
      "Schisce II",
      "I PNC II",
      "Daddy e Quaglia II",
      "Tranquilli ma Tossici II",
      "Paziente e Dottore II",
      "Double IPA II",
      "Parappappa! II",
      "I 101 sorsi II",
      "Cabrones II",
      "Senza lilleri non si Ler II",
      "La Clio II",
      "Ci vuole polso II",
      "Seifuoribella II",
      "IL DUO II",
      "TENNIS MAULINA II",
      "I Margini II",
      "Northampton II",
      "Zinellacci II",
      "Grunge II",
      "Los Mirabiliantes Dos II",
      "Los fantasticos dos II",
      "Olimpico II",
      "Le Avvogatte II",
      "Le SkizzoSkizzo II",
      "Lagradisco II",
      "Le tocche II",
      "I Frusi II",
      "Orate II",
      "ALFONSO SIGNORINi II",
      "The Plow and The Show II",
      "Los Pollos Hermanos II",
      "Ci falciano II",
      "Atletico Divano II",
      "La mattina dopo II",
      "Perfetti sconosciuti II",
      "Japan called II",
      "Tampussi II",
      "Dadi II",
      "Bonny Pizza II",
      "ARISTOCAZZI II",
      "Tommi in scatola II",
      "Beerkenau II",
      "Fenomeno o bluffff II",
      "Abu Bhari II",
      "Newpsie II",
      "Guelfi e Ghisellini II",
      "Da Boe II",
      "#Skizofrenia II",
      "La Cappella II"
    ];
  }
});

// services/supabaseRest.ts
var SUPABASE_ACCESS_TOKEN_LS_KEY, SUPABASE_REFRESH_TOKEN_LS_KEY, SUPABASE_EXPIRES_AT_LS_KEY, SUPABASE_USER_EMAIL_LS_KEY, REMOTE_BASE_UPDATED_AT_LS_KEY, setRemoteBaseUpdatedAt, getRemoteBaseUpdatedAt, getSupabaseAccessToken, getSupabaseSession, setSupabaseSession, clearSupabaseSession, env, getSupabaseConfig, buildHeaders, buildAnonHeaders, restUrl, authUrl, readErrorBody, ensureFreshSupabaseSession, signInWithPassword, signOutSupabase, testSupabaseConnection, runDbHealthChecks, pullWorkspaceState, pullWorkspaceStateUpdatedAt, coerceFinalRoundRobin, coerceTournamentConfig, sanitizeTeamForPublic, sanitizeTournamentForPublic, sanitizeAppStateForPublic, pushPublicWorkspaceStateInternal, FLBP_DB_CONFLICT_CODE, readLocalUpdatedAt, makeConflictError, assertNoRemoteConflictForWrite, pushWorkspaceState, sha256Hex, buildPublicCareerLeaderboardRows, chunk, ensureWorkspace, restDeleteWhere, restUpsertRows, pushNormalizedFromState, buildSimPoolPeople400, seedSimPool, restGetJson, toBool, toInt, pullNormalizedState;
var init_supabaseRest = __esm({
  "services/supabaseRest.ts"() {
    init_simTeamNames200();
    SUPABASE_ACCESS_TOKEN_LS_KEY = "flbp_supabase_access_token";
    SUPABASE_REFRESH_TOKEN_LS_KEY = "flbp_supabase_refresh_token";
    SUPABASE_EXPIRES_AT_LS_KEY = "flbp_supabase_expires_at";
    SUPABASE_USER_EMAIL_LS_KEY = "flbp_supabase_user_email";
    REMOTE_BASE_UPDATED_AT_LS_KEY = "flbp_remote_base_updated_at";
    setRemoteBaseUpdatedAt = (updatedAt) => {
      try {
        const v = (updatedAt || "").trim();
        if (!v) localStorage.removeItem(REMOTE_BASE_UPDATED_AT_LS_KEY);
        else localStorage.setItem(REMOTE_BASE_UPDATED_AT_LS_KEY, v);
      } catch {
      }
    };
    getRemoteBaseUpdatedAt = () => {
      try {
        const v = (localStorage.getItem(REMOTE_BASE_UPDATED_AT_LS_KEY) || "").trim();
        return v ? v : null;
      } catch {
        return null;
      }
    };
    getSupabaseAccessToken = () => {
      try {
        const v = (localStorage.getItem(SUPABASE_ACCESS_TOKEN_LS_KEY) || "").trim();
        return v ? v : null;
      } catch {
        return null;
      }
    };
    getSupabaseSession = () => {
      try {
        const accessToken = (localStorage.getItem(SUPABASE_ACCESS_TOKEN_LS_KEY) || "").trim();
        if (!accessToken) return null;
        const refreshToken = (localStorage.getItem(SUPABASE_REFRESH_TOKEN_LS_KEY) || "").trim() || null;
        const expiresAt = (localStorage.getItem(SUPABASE_EXPIRES_AT_LS_KEY) || "").trim() || null;
        const email = (localStorage.getItem(SUPABASE_USER_EMAIL_LS_KEY) || "").trim() || null;
        return { accessToken, refreshToken, expiresAt, email };
      } catch {
        return null;
      }
    };
    setSupabaseSession = (s) => {
      try {
        if (!s?.accessToken) {
          localStorage.removeItem(SUPABASE_ACCESS_TOKEN_LS_KEY);
          localStorage.removeItem(SUPABASE_REFRESH_TOKEN_LS_KEY);
          localStorage.removeItem(SUPABASE_EXPIRES_AT_LS_KEY);
          localStorage.removeItem(SUPABASE_USER_EMAIL_LS_KEY);
          return;
        }
        localStorage.setItem(SUPABASE_ACCESS_TOKEN_LS_KEY, s.accessToken);
        if (s.refreshToken) localStorage.setItem(SUPABASE_REFRESH_TOKEN_LS_KEY, String(s.refreshToken));
        else localStorage.removeItem(SUPABASE_REFRESH_TOKEN_LS_KEY);
        if (s.expiresAt) localStorage.setItem(SUPABASE_EXPIRES_AT_LS_KEY, String(s.expiresAt));
        else localStorage.removeItem(SUPABASE_EXPIRES_AT_LS_KEY);
        if (s.email) localStorage.setItem(SUPABASE_USER_EMAIL_LS_KEY, String(s.email));
        else localStorage.removeItem(SUPABASE_USER_EMAIL_LS_KEY);
      } catch {
      }
    };
    clearSupabaseSession = () => setSupabaseSession(null);
    env = (k) => {
      try {
        return import.meta?.env?.[k];
      } catch {
        return void 0;
      }
    };
    getSupabaseConfig = () => {
      const url = (env("VITE_SUPABASE_URL") || "").trim();
      const anonKey = (env("VITE_SUPABASE_ANON_KEY") || "").trim();
      const workspaceId = (env("VITE_WORKSPACE_ID") || "default").trim() || "default";
      if (!url || !anonKey) return null;
      return { url, anonKey, workspaceId };
    };
    buildHeaders = (cfg, accessToken) => {
      const token = (accessToken || getSupabaseAccessToken() || "").trim();
      const auth = token ? token : cfg.anonKey;
      return {
        "apikey": cfg.anonKey,
        "Authorization": `Bearer ${auth}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      };
    };
    buildAnonHeaders = (cfg) => {
      return {
        "apikey": cfg.anonKey,
        "Authorization": `Bearer ${cfg.anonKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      };
    };
    restUrl = (cfg, path) => {
      const base = cfg.url.replace(/\/$/, "");
      return `${base}/rest/v1/${path}`;
    };
    authUrl = (cfg, pathAndQuery) => {
      const base = cfg.url.replace(/\/$/, "");
      return `${base}/auth/v1/${pathAndQuery.replace(/^\//, "")}`;
    };
    readErrorBody = async (res) => {
      try {
        const text = await res.text();
        return text || `${res.status} ${res.statusText}`;
      } catch {
        return `${res.status} ${res.statusText}`;
      }
    };
    ensureFreshSupabaseSession = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) return null;
      const cur = getSupabaseSession();
      if (!cur?.accessToken) return null;
      const expTs = cur.expiresAt ? Date.parse(cur.expiresAt) : NaN;
      if (!Number.isFinite(expTs)) return cur;
      if (expTs > Date.now() + 6e4) return cur;
      if (!cur.refreshToken) return cur;
      try {
        const res = await fetch(authUrl(cfg, "token?grant_type=refresh_token"), {
          method: "POST",
          headers: {
            "apikey": cfg.anonKey,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({ refresh_token: cur.refreshToken })
        });
        if (!res.ok) return cur;
        const j = await res.json();
        const accessToken = String(j.access_token || "").trim();
        if (!accessToken) return cur;
        const refreshToken = String(j.refresh_token || cur.refreshToken || "").trim() || null;
        const expiresIn = Number(j.expires_in || 0);
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1e3).toISOString() : cur.expiresAt || null;
        const email = j.user?.email ? String(j.user.email) : cur.email || null;
        const next = { accessToken, refreshToken, expiresAt, email };
        setSupabaseSession(next);
        return next;
      } catch {
        return cur;
      }
    };
    signInWithPassword = async (email, password) => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      const e = (email || "").trim();
      const p = password || "";
      if (!e || !p) throw new Error("Inserisci email e password.");
      const res = await fetch(authUrl(cfg, "token?grant_type=password"), {
        method: "POST",
        headers: {
          "apikey": cfg.anonKey,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ email: e, password: p })
      });
      if (!res.ok) throw new Error(await readErrorBody(res));
      const j = await res.json();
      const accessToken = String(j.access_token || "").trim();
      if (!accessToken) throw new Error("Login fallito (token mancante).");
      const refreshToken = String(j.refresh_token || "").trim() || null;
      const expiresIn = Number(j.expires_in || 0);
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1e3).toISOString() : null;
      const outEmail = j.user?.email ? String(j.user.email) : e;
      const session = {
        accessToken,
        refreshToken,
        expiresAt,
        email: outEmail
      };
      setSupabaseSession(session);
      return session;
    };
    signOutSupabase = async () => {
      const cfg = getSupabaseConfig();
      const cur = getSupabaseSession();
      try {
        if (cfg && cur?.accessToken) {
          await fetch(authUrl(cfg, "logout"), {
            method: "POST",
            headers: {
              "apikey": cfg.anonKey,
              "Authorization": `Bearer ${cur.accessToken}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            }
          });
        }
      } catch {
      } finally {
        clearSupabaseSession();
      }
    };
    testSupabaseConnection = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) return { ok: false, message: "Supabase non configurato (mancano VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)." };
      const url = restUrl(cfg, `workspace_state?select=workspace_id&limit=1`);
      try {
        const res = await fetch(url, { headers: buildHeaders(cfg) });
        if (!res.ok) {
          const body = await readErrorBody(res);
          return { ok: false, message: `Errore Supabase: ${body}` };
        }
        return { ok: true, message: "Connessione OK (workspace_state raggiungibile)." };
      } catch (e) {
        return { ok: false, message: `Errore rete: ${e?.message || String(e)}` };
      }
    };
    runDbHealthChecks = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) {
        return {
          ok: false,
          checks: [{ name: "Config", ok: false, severity: "error", message: "Supabase non configurato (mancano VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)." }]
        };
      }
      const checks = [];
      const workspaceEnc = encodeURIComponent(cfg.workspaceId);
      const hasJwt = !!getSupabaseAccessToken();
      try {
        const res = await fetch(restUrl(cfg, `public_workspace_state?workspace_id=eq.${workspaceEnc}&select=workspace_id&limit=1`), {
          headers: buildAnonHeaders(cfg)
        });
        if (res.ok) checks.push({ name: "REST / public", ok: true, severity: "info", message: "Endpoint REST raggiungibile e public_workspace_state leggibile (anon)." });
        else checks.push({ name: "REST / public", ok: false, severity: "error", message: await readErrorBody(res) });
      } catch (e) {
        checks.push({ name: "REST / public", ok: false, severity: "error", message: e?.message || String(e) });
      }
      const publicTables = [
        "public_tournaments",
        "public_hall_of_fame_entries",
        "public_career_leaderboard"
      ];
      for (const t of publicTables) {
        try {
          const res = await fetch(restUrl(cfg, `${t}?workspace_id=eq.${workspaceEnc}&select=workspace_id&limit=1`), {
            headers: buildAnonHeaders(cfg)
          });
          if (res.ok) checks.push({ name: `Public table: ${t}`, ok: true, severity: "info", message: "OK" });
          else checks.push({ name: `Public table: ${t}`, ok: false, severity: "warn", message: await readErrorBody(res) });
        } catch (e) {
          checks.push({ name: `Public table: ${t}`, ok: false, severity: "warn", message: e?.message || String(e) });
        }
      }
      if (!hasJwt) {
        checks.push({
          name: "Admin/RLS",
          ok: false,
          severity: "warn",
          message: "Nessun JWT admin presente: non posso verificare tabelle protette da RLS (workspace_state, tournaments, ...)."
        });
      } else {
        try {
          const res = await fetch(restUrl(cfg, `workspace_state?workspace_id=eq.${workspaceEnc}&select=updated_at&limit=1`), {
            headers: buildHeaders(cfg)
          });
          if (res.ok) checks.push({ name: "Admin/RLS", ok: true, severity: "info", message: "OK: accesso admin a workspace_state." });
          else checks.push({ name: "Admin/RLS", ok: false, severity: "error", message: await readErrorBody(res) });
        } catch (e) {
          checks.push({ name: "Admin/RLS", ok: false, severity: "error", message: e?.message || String(e) });
        }
        try {
          const res = await fetch(
            restUrl(cfg, `tournament_matches?workspace_id=eq.${workspaceEnc}&is_bye=eq.true&hidden=eq.false&select=id,code&limit=5`),
            { headers: buildHeaders(cfg) }
          );
          if (!res.ok) {
            checks.push({ name: "BYE invisibili", ok: false, severity: "warn", message: await readErrorBody(res) });
          } else {
            const rows = await res.json();
            if (!rows.length) {
              checks.push({ name: "BYE invisibili", ok: true, severity: "info", message: "OK: nessun match BYE visibile (is_bye=true e hidden=false)." });
            } else {
              const sample = rows.map((r) => r.code || r.id).slice(0, 3).join(", ");
              checks.push({ name: "BYE invisibili", ok: false, severity: "warn", message: `Trovati match BYE non nascosti (esempi: ${sample}).` });
            }
          }
        } catch (e) {
          checks.push({ name: "BYE invisibili", ok: false, severity: "warn", message: e?.message || String(e) });
        }
      }
      const ok = !checks.some((c) => c.severity === "error" && !c.ok);
      return { ok, checks };
    };
    pullWorkspaceState = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      const url = restUrl(cfg, `workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=workspace_id,state,updated_at&limit=1`);
      const res = await fetch(url, { headers: buildHeaders(cfg) });
      if (!res.ok) throw new Error(await readErrorBody(res));
      const rows = await res.json();
      return rows?.[0] || null;
    };
    pullWorkspaceStateUpdatedAt = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      const url = restUrl(cfg, `workspace_state?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=updated_at&limit=1`);
      const res = await fetch(url, { headers: buildHeaders(cfg) });
      if (!res.ok) throw new Error(await readErrorBody(res));
      const rows = await res.json();
      return rows?.[0]?.updated_at || null;
    };
    coerceFinalRoundRobin = (cfg) => {
      const fr = cfg && typeof cfg === "object" ? cfg.finalRoundRobin : void 0;
      if (!fr || typeof fr !== "object") return void 0;
      const enabled = !!fr.enabled;
      const rawTop = fr.topTeams;
      const nTop = typeof rawTop === "number" && Number.isFinite(rawTop) ? rawTop : parseInt(String(rawTop || ""), 10);
      const topTeams = nTop === 8 ? 8 : 4;
      const activated = typeof fr.activated === "boolean" ? fr.activated : void 0;
      return { enabled, topTeams, ...activated === void 0 ? {} : { activated } };
    };
    coerceTournamentConfig = (cfg) => {
      const n = cfg && typeof cfg === "object" ? cfg.advancingPerGroup : void 0;
      const v = typeof n === "number" && Number.isFinite(n) ? n : parseInt(String(n || ""), 10);
      const finalRoundRobin = coerceFinalRoundRobin(cfg);
      return {
        // NOTE: "round_robin" can legitimately store 0 (no qualifiers).
        advancingPerGroup: Number.isFinite(v) && v >= 0 ? v : 2,
        ...finalRoundRobin ? { finalRoundRobin } : {}
      };
    };
    sanitizeTeamForPublic = (t) => {
      if (!t || typeof t !== "object") return t;
      const out = { ...t };
      delete out.player1YoB;
      delete out.player2YoB;
      return out;
    };
    sanitizeTournamentForPublic = (t) => {
      if (!t || typeof t !== "object") return t;
      const out = { ...t };
      out.teams = (Array.isArray(out.teams) ? out.teams : []).map(sanitizeTeamForPublic);
      out.groups = (Array.isArray(out.groups) ? out.groups : []).map((g) => {
        const gg = { ...g };
        gg.teams = (Array.isArray(gg.teams) ? gg.teams : []).map(sanitizeTeamForPublic);
        return gg;
      });
      return out;
    };
    sanitizeAppStateForPublic = (state) => {
      const safe = { ...state };
      safe.teams = (Array.isArray(state.teams) ? state.teams : []).map(sanitizeTeamForPublic);
      safe.tournament = state.tournament ? sanitizeTournamentForPublic(state.tournament) : null;
      safe.tournamentHistory = (Array.isArray(state.tournamentHistory) ? state.tournamentHistory : []).map(sanitizeTournamentForPublic);
      safe.integrationsScorers = (Array.isArray(state.integrationsScorers) ? state.integrationsScorers : []).map((s) => {
        const { yob, ...rest } = s || {};
        return rest;
      });
      safe.hallOfFame = (Array.isArray(state.hallOfFame) ? state.hallOfFame : []).map((h) => {
        const { playerId, ...rest } = h || {};
        return rest;
      });
      safe.playerAliases = {};
      return safe;
    };
    pushPublicWorkspaceStateInternal = async (cfg, state) => {
      const payload = {
        workspace_id: cfg.workspaceId,
        state: sanitizeAppStateForPublic(state),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const url = restUrl(cfg, "public_workspace_state");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...buildHeaders(cfg),
          "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await readErrorBody(res));
      const rows = await res.json();
      return rows?.[0] || payload;
    };
    FLBP_DB_CONFLICT_CODE = "FLBP_DB_CONFLICT";
    readLocalUpdatedAt = () => {
      try {
        const v = (localStorage.getItem("flbp_local_state_updated_at") || "").trim();
        return v ? v : null;
      } catch {
        return null;
      }
    };
    makeConflictError = (message, meta) => {
      const e = new Error(message);
      e.code = FLBP_DB_CONFLICT_CODE;
      if (meta?.remoteUpdatedAt) e.remoteUpdatedAt = meta.remoteUpdatedAt;
      if (meta?.remoteBaseUpdatedAt) e.remoteBaseUpdatedAt = meta.remoteBaseUpdatedAt;
      return e;
    };
    assertNoRemoteConflictForWrite = async (cfg, opts) => {
      if (opts?.force) return;
      let remoteUpdatedAt = null;
      try {
        remoteUpdatedAt = await pullWorkspaceStateUpdatedAt();
      } catch {
        return;
      }
      if (!remoteUpdatedAt) return;
      const base = getRemoteBaseUpdatedAt();
      const baseTs = base ? Date.parse(base) : NaN;
      const remoteTs = Date.parse(remoteUpdatedAt);
      if (!base || !Number.isFinite(baseTs) || baseTs <= 0) {
        throw makeConflictError(
          'Conflitto: il DB contiene gi\xE0 uno stato pi\xF9 recente/inesplorato per questo workspace.\nPer sicurezza: scarica lo stato dal DB e applicalo, oppure abilita "Forza sovrascrittura".',
          { remoteUpdatedAt, remoteBaseUpdatedAt: base }
        );
      }
      if (Number.isFinite(remoteTs) && remoteTs > baseTs + 2e3) {
        const local = readLocalUpdatedAt();
        throw makeConflictError(
          `Conflitto: il DB \xE8 stato aggiornato da un altro admin dopo il tuo ultimo base snapshot.
DB updated_at: ${remoteUpdatedAt}
Base locale: ${base}
` + (local ? `Local updated_at: ${local}
` : "") + 'Scarica lo stato dal DB e applicalo, oppure abilita "Forza sovrascrittura" per sovrascrivere.',
          { remoteUpdatedAt, remoteBaseUpdatedAt: base }
        );
      }
    };
    pushWorkspaceState = async (state, opts) => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      await assertNoRemoteConflictForWrite(cfg, opts);
      const payload = {
        workspace_id: cfg.workspaceId,
        state,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const url = restUrl(cfg, "workspace_state");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...buildHeaders(cfg),
          // Merge on conflict (primary key workspace_id)
          "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await readErrorBody(res));
      const rows = await res.json();
      try {
        await pushPublicWorkspaceStateInternal(cfg, state);
      } catch {
      }
      const out = rows?.[0] || payload;
      setRemoteBaseUpdatedAt(out.updated_at || payload.updated_at);
      return out;
    };
    sha256Hex = async (input) => {
      try {
        const c = globalThis?.crypto;
        if (c?.subtle?.digest) {
          const enc = new TextEncoder();
          const buf = await c.subtle.digest("SHA-256", enc.encode(input));
          const bytes = Array.from(new Uint8Array(buf));
          return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
        }
      } catch {
      }
      let h = 2166136261;
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16).padStart(8, "0");
    };
    buildPublicCareerLeaderboardRows = async (cfg, state) => {
      const playerMap = {};
      const mod = await Promise.resolve().then(() => (init_storageService(), storageService_exports));
      const getPlayerKey2 = mod.getPlayerKey;
      const resolvePlayerKey2 = mod.resolvePlayerKey;
      const yearNow = (/* @__PURE__ */ new Date()).getFullYear();
      const yobInfoFromKey = (key) => {
        const m = (key || "").match(/_(ND|\d{4})$/i);
        if (!m) return { yob: void 0, label: void 0, u25: false };
        const raw2 = String(m[1]).toUpperCase();
        if (raw2 === "ND") return { yob: void 0, label: void 0, u25: false };
        const yob = parseInt(raw2, 10);
        if (!Number.isFinite(yob)) return { yob: void 0, label: void 0, u25: false };
        return { yob, label: String(yob).slice(-2), u25: yearNow - yob < 26 };
      };
      const initPlayer = (rawKey, name, teamName) => {
        const key = resolvePlayerKey2(state, rawKey);
        const cur = playerMap[key];
        if (cur) {
          cur.name = name || cur.name;
          cur.teamName = teamName || cur.teamName;
          return cur;
        }
        playerMap[key] = { key, name, teamName, games: 0, points: 0, soffi: 0 };
        return playerMap[key];
      };
      const processMatch = (m, teamsSource) => {
        if (!m?.played || !Array.isArray(m.stats)) return;
        for (const s of m.stats) {
          const team = teamsSource.find((tm) => tm.id === s.teamId);
          let yob;
          if (team) {
            if (team.player1 === s.playerName) yob = team.player1YoB;
            if (team.player2 === s.playerName) yob = team.player2YoB;
          }
          const rawKey = getPlayerKey2(s.playerName, yob ?? "ND");
          const p = initPlayer(rawKey, s.playerName, team?.name || s.teamId || "?");
          p.games += 1;
          p.points += s.canestri || 0;
          p.soffi += s.soffi || 0;
        }
      };
      if (Array.isArray(state.matches) && Array.isArray(state.teams)) {
        state.matches.forEach((m) => processMatch(m, state.teams));
      }
      (state.tournamentHistory || []).forEach((t) => {
        const teams = Array.isArray(t.teams) ? t.teams : [];
        const matches = Array.isArray(t.matches) && t.matches.length ? t.matches : Array.isArray(t.rounds) ? (t.rounds || []).flat() : [];
        matches.forEach((m) => processMatch(m, teams));
      });
      if (state.tournament) {
        (state.tournamentMatches || []).forEach((m) => processMatch(m, state.teams || []));
      }
      (state.integrationsScorers || []).forEach((e) => {
        const rawKey = getPlayerKey2(e.name, e.yob ?? "ND");
        const p = initPlayer(rawKey, e.name, "Integrazioni");
        p.games += e.games || 0;
        p.points += e.points || 0;
        p.soffi += e.soffi || 0;
      });
      const players = Object.values(playerMap).filter((p) => p.games > 0 || p.points > 0 || p.soffi > 0).map((p) => {
        const info = yobInfoFromKey(p.key);
        return {
          key: p.key,
          name: p.name,
          teamName: p.teamName,
          games: p.games,
          points: p.points,
          soffi: p.soffi,
          avgPoints: p.games > 0 ? parseFloat((p.points / p.games).toFixed(2)) : 0,
          avgSoffi: p.games > 0 ? parseFloat((p.soffi / p.games).toFixed(2)) : 0,
          u25: info.u25,
          yobLabel: info.label || null
        };
      });
      const keyToHash = /* @__PURE__ */ new Map();
      await Promise.all(players.map(async (p) => {
        if (keyToHash.has(p.key)) return;
        const h = await sha256Hex(p.key);
        keyToHash.set(p.key, h);
      }));
      const now = (/* @__PURE__ */ new Date()).toISOString();
      return players.map((p) => ({
        workspace_id: cfg.workspaceId,
        id: keyToHash.get(p.key) || p.key,
        name: p.name,
        team_name: p.teamName,
        games_played: p.games,
        points: p.points,
        soffi: p.soffi,
        avg_points: p.avgPoints,
        avg_soffi: p.avgSoffi,
        u25: !!p.u25,
        yob_label: p.yobLabel,
        updated_at: now
      }));
    };
    chunk = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    ensureWorkspace = async (cfg) => {
      const url = restUrl(cfg, "workspaces");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...buildHeaders(cfg),
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({ id: cfg.workspaceId })
      });
      if (!res.ok) throw new Error(await readErrorBody(res));
    };
    restDeleteWhere = async (cfg, table, whereQuery) => {
      const url = restUrl(cfg, `${table}?${whereQuery}`);
      const res = await fetch(url, { method: "DELETE", headers: buildHeaders(cfg) });
      if (!res.ok) throw new Error(await readErrorBody(res));
    };
    restUpsertRows = async (cfg, table, rows, onConflict, chunkSize = 500) => {
      if (!rows.length) return;
      const qp = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
      const url = restUrl(cfg, `${table}${qp}`);
      for (const part of chunk(rows, chunkSize)) {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            ...buildHeaders(cfg),
            "Prefer": "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify(part)
        });
        if (!res.ok) throw new Error(await readErrorBody(res));
      }
    };
    pushNormalizedFromState = async (state, opts) => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      await pushWorkspaceState(state, opts);
      await ensureWorkspace(cfg);
      await restDeleteWhere(cfg, "hall_of_fame_entries", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      await restDeleteWhere(cfg, "player_aliases", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      await restDeleteWhere(cfg, "integrations_scorers", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      await restDeleteWhere(cfg, "tournaments", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      try {
        await restDeleteWhere(cfg, "public_career_leaderboard", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
        await restDeleteWhere(cfg, "public_tournaments", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
        await restDeleteWhere(cfg, "public_hall_of_fame_entries", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      } catch {
      }
      await restUpsertRows(cfg, "app_settings", [{ workspace_id: cfg.workspaceId, logo: state.logo || "", updated_at: (/* @__PURE__ */ new Date()).toISOString() }], "workspace_id");
      const aliasesRows = Object.entries(state.playerAliases || {}).map(([from_key, to_key]) => ({
        workspace_id: cfg.workspaceId,
        from_key,
        to_key,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      await restUpsertRows(cfg, "player_aliases", aliasesRows, "workspace_id,from_key");
      const scorersRows = (state.integrationsScorers || []).map((s) => ({
        workspace_id: cfg.workspaceId,
        id: s.id,
        name: s.name,
        yob: s.yob ?? null,
        games: s.games ?? 0,
        points: s.points ?? 0,
        soffi: s.soffi ?? 0,
        source: s.source ?? null,
        created_at: new Date(s.createdAt ?? Date.now()).toISOString()
      }));
      await restUpsertRows(cfg, "integrations_scorers", scorersRows, "id");
      const hofRows = (state.hallOfFame || []).map((h) => ({
        workspace_id: cfg.workspaceId,
        id: h.id,
        year: h.year,
        tournament_id: h.tournamentId,
        tournament_name: h.tournamentName,
        type: h.type,
        team_name: h.teamName ?? null,
        player_names: h.playerNames ?? [],
        value: h.value ?? null,
        player_id: h.playerId ?? null,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      await restUpsertRows(cfg, "hall_of_fame_entries", hofRows, "id");
      const publicHofRows = (state.hallOfFame || []).map((h) => ({
        workspace_id: cfg.workspaceId,
        id: h.id,
        year: h.year,
        tournament_id: h.tournamentId,
        tournament_name: h.tournamentName,
        type: h.type,
        team_name: h.teamName ?? null,
        player_names: h.playerNames ?? [],
        value: h.value ?? null,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }));
      const tournaments = [];
      (state.tournamentHistory || []).forEach((t) => tournaments.push({ t, status: "archived", matches: (t.matches || []).length ? t.matches || [] : (t.rounds || []).flat() }));
      if (state.tournament) {
        tournaments.push({ t: state.tournament, status: "live", matches: state.tournamentMatches || [] });
      }
      const tournamentRows = [];
      const teamRows = [];
      const groupRows = [];
      const groupTeamRows = [];
      const matchRows = [];
      const statRows = [];
      const publicTournamentRows = [];
      const publicTeamRows = [];
      const publicGroupRows = [];
      const publicGroupTeamRows = [];
      const publicMatchRows = [];
      const publicStatRows = [];
      const mod = await Promise.resolve().then(() => (init_storageService(), storageService_exports));
      const getPlayerKey2 = mod.getPlayerKey;
      const resolvePlayerKey2 = mod.resolvePlayerKey;
      for (const entry of tournaments) {
        const t = entry.t;
        const tid = t.id;
        tournamentRows.push({
          workspace_id: cfg.workspaceId,
          id: tid,
          name: t.name,
          start_date: t.startDate,
          type: t.type,
          config: t.config || {},
          is_manual: !!t.isManual,
          status: entry.status,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        publicTournamentRows.push({
          workspace_id: cfg.workspaceId,
          id: tid,
          name: t.name,
          start_date: t.startDate,
          type: t.type,
          config: t.config || {},
          is_manual: !!t.isManual,
          status: entry.status,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        const teams = t.teams || [];
        teams.forEach((tm) => {
          teamRows.push({
            workspace_id: cfg.workspaceId,
            tournament_id: tid,
            id: tm.id,
            name: tm.name,
            player1: tm.player1,
            player2: tm.player2 ?? "",
            player1_yob: tm.player1YoB ?? null,
            player2_yob: tm.player2YoB ?? null,
            player1_is_referee: !!tm.player1IsReferee,
            player2_is_referee: !!tm.player2IsReferee,
            is_referee: !!tm.isReferee,
            created_at_ms: tm.createdAt ?? null
          });
          publicTeamRows.push({
            workspace_id: cfg.workspaceId,
            tournament_id: tid,
            id: tm.id,
            name: tm.name,
            player1: tm.player1,
            player2: tm.player2 ?? "",
            player1_is_referee: !!tm.player1IsReferee,
            player2_is_referee: !!tm.player2IsReferee,
            is_referee: !!tm.isReferee,
            created_at: tm.createdAt ? new Date(tm.createdAt).toISOString() : null
          });
        });
        const groups = t.groups || [];
        groups.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" })).forEach((g, idx) => {
          groupRows.push({
            workspace_id: cfg.workspaceId,
            tournament_id: tid,
            id: g.id,
            name: g.name,
            order_index: idx
          });
          publicGroupRows.push({
            workspace_id: cfg.workspaceId,
            tournament_id: tid,
            id: g.id,
            name: g.name,
            order_index: idx
          });
          (g.teams || []).forEach((gt) => {
            groupTeamRows.push({
              workspace_id: cfg.workspaceId,
              tournament_id: tid,
              group_id: g.id,
              team_id: gt.id
            });
            publicGroupTeamRows.push({
              workspace_id: cfg.workspaceId,
              tournament_id: tid,
              group_id: g.id,
              team_id: gt.id,
              seed: null
            });
          });
        });
        const teamById = new Map(teams.map((x) => [x.id, x]));
        const matches = entry.matches || [];
        matches.forEach((m) => {
          const phase = m.phase || (m.groupName ? "groups" : "bracket");
          const isBye = !!m.isBye || m.teamAId === "BYE" || m.teamBId === "BYE";
          const hidden = isBye ? true : !!m.hidden;
          matchRows.push({
            workspace_id: cfg.workspaceId,
            tournament_id: tid,
            id: m.id,
            code: m.code ?? null,
            phase,
            status: m.status,
            played: !!m.played,
            score_a: m.scoreA ?? 0,
            score_b: m.scoreB ?? 0,
            team_a_id: m.teamAId ?? null,
            team_b_id: m.teamBId ?? null,
            round: m.round ?? null,
            round_name: m.roundName ?? null,
            group_name: m.groupName ?? null,
            order_index: m.orderIndex ?? null,
            hidden,
            is_bye: isBye,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          publicMatchRows.push({
            workspace_id: cfg.workspaceId,
            tournament_id: tid,
            id: m.id,
            code: m.code ?? null,
            phase,
            status: m.status,
            played: !!m.played,
            score_a: m.scoreA ?? 0,
            score_b: m.scoreB ?? 0,
            team_a_id: m.teamAId ?? null,
            team_b_id: m.teamBId ?? null,
            round: m.round ?? null,
            round_name: m.roundName ?? null,
            group_name: m.groupName ?? null,
            order_index: m.orderIndex ?? null,
            hidden,
            is_bye: isBye,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          (m.stats || []).forEach((s) => {
            const team = teamById.get(s.teamId);
            const yob = team ? team.player1 === s.playerName ? team.player1YoB : team.player2YoB : void 0;
            const rawKey = getPlayerKey2(s.playerName, yob ?? "ND");
            const resolvedKey = resolvePlayerKey2(state, rawKey);
            statRows.push({
              workspace_id: cfg.workspaceId,
              tournament_id: tid,
              match_id: m.id,
              team_id: s.teamId,
              player_name: s.playerName,
              canestri: s.canestri ?? 0,
              soffi: s.soffi ?? 0,
              player_key: resolvedKey
            });
            publicStatRows.push({
              workspace_id: cfg.workspaceId,
              tournament_id: tid,
              match_id: m.id,
              team_id: s.teamId,
              player_name: s.playerName,
              canestri: s.canestri ?? 0,
              soffi: s.soffi ?? 0
            });
          });
        });
      }
      await restUpsertRows(cfg, "tournaments", tournamentRows, "workspace_id,id");
      await restUpsertRows(cfg, "tournament_teams", teamRows, "workspace_id,tournament_id,id");
      await restUpsertRows(cfg, "tournament_groups", groupRows, "workspace_id,tournament_id,id");
      await restUpsertRows(cfg, "tournament_group_teams", groupTeamRows, "workspace_id,tournament_id,group_id,team_id");
      await restUpsertRows(cfg, "tournament_matches", matchRows, "workspace_id,tournament_id,id");
      await restUpsertRows(cfg, "tournament_match_stats", statRows, "workspace_id,tournament_id,match_id,team_id,player_name", 800);
      try {
        await restUpsertRows(cfg, "public_tournaments", publicTournamentRows, "workspace_id,id");
        await restUpsertRows(cfg, "public_tournament_teams", publicTeamRows, "workspace_id,tournament_id,id");
        await restUpsertRows(cfg, "public_tournament_groups", publicGroupRows, "workspace_id,tournament_id,id");
        await restUpsertRows(cfg, "public_tournament_group_teams", publicGroupTeamRows, "workspace_id,tournament_id,group_id,team_id");
        await restUpsertRows(cfg, "public_tournament_matches", publicMatchRows, "workspace_id,tournament_id,id");
        await restUpsertRows(cfg, "public_tournament_match_stats", publicStatRows, "workspace_id,tournament_id,match_id,team_id,player_name", 800);
        await restUpsertRows(cfg, "public_hall_of_fame_entries", publicHofRows, "workspace_id,id");
      } catch {
      }
      let publicCareerPlayers = 0;
      try {
        const publicRows = await buildPublicCareerLeaderboardRows(cfg, state);
        publicCareerPlayers = publicRows.length;
        await restUpsertRows(cfg, "public_career_leaderboard", publicRows, "workspace_id,id", 800);
      } catch {
        publicCareerPlayers = 0;
      }
      return {
        tournaments: tournamentRows.length,
        teams: teamRows.length,
        groups: groupRows.length,
        groupTeams: groupTeamRows.length,
        matches: matchRows.length,
        matchStats: statRows.length,
        hallOfFame: hofRows.length,
        integrationsScorers: scorersRows.length,
        aliases: aliasesRows.length,
        publicCareerPlayers
      };
    };
    buildSimPoolPeople400 = () => {
      const BASE_FIRST = ["Mario", "Luca", "Andrea", "Marco", "Paolo", "Giuseppe", "Matteo", "Francesco", "Davide", "Simone", "Alessio", "Federico", "Riccardo", "Gabriele", "Stefano", "Antonio", "Nicola", "Pietro", "Edoardo", "Tommaso"];
      const BASE_LAST = ["Rossi", "Bianchi", "Ferrari", "Esposito", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "Costa", "Giordano", "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana"];
      const PEOPLE = [];
      const HOMONYM = "Mario Rossi";
      [1996, 1999, 2002, 2005, 2008].forEach((y) => PEOPLE.push({ name: HOMONYM, yob: y }));
      let idx = 0;
      while (PEOPLE.length < 400) {
        const fn = BASE_FIRST[idx % BASE_FIRST.length];
        const ln = BASE_LAST[Math.floor(idx / BASE_FIRST.length) % BASE_LAST.length];
        const name = `${fn} ${ln}`;
        const yob = 1990 + idx % 21;
        idx++;
        if (name === HOMONYM) continue;
        PEOPLE.push({ name, yob });
      }
      return PEOPLE;
    };
    seedSimPool = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      await ensureWorkspace(cfg);
      await restDeleteWhere(cfg, "sim_pool_team_names", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      await restDeleteWhere(cfg, "sim_pool_people", `workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}`);
      const teamRows = (SIM_TEAM_NAMES_200 || []).slice(0, 200).map((name, idx) => ({
        workspace_id: cfg.workspaceId,
        name,
        order_index: idx
      }));
      await restUpsertRows(cfg, "sim_pool_team_names", teamRows, "workspace_id,name");
      const people = buildSimPoolPeople400();
      const peopleRows = people.map((p) => ({
        workspace_id: cfg.workspaceId,
        name: p.name,
        yob: p.yob
      }));
      await restUpsertRows(cfg, "sim_pool_people", peopleRows, void 0, 800);
      return { teamNames: teamRows.length, people: peopleRows.length };
    };
    restGetJson = async (cfg, pathWithQuery) => {
      const res = await fetch(restUrl(cfg, pathWithQuery), { headers: buildHeaders(cfg) });
      if (!res.ok) throw new Error(await readErrorBody(res));
      return await res.json();
    };
    toBool = (v, fallback = false) => typeof v === "boolean" ? v : v == null ? fallback : String(v) === "true" || String(v) === "1";
    toInt = (v, fallback = 0) => {
      const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) ? n : fallback;
    };
    pullNormalizedState = async () => {
      const cfg = getSupabaseConfig();
      if (!cfg) throw new Error("Supabase non configurato");
      const [settingsRows, aliasesRows, scorersRows, hofRows, tournamentRows] = await Promise.all([
        restGetJson(cfg, `app_settings?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=logo,updated_at&limit=1`),
        restGetJson(cfg, `player_aliases?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=from_key,to_key`),
        restGetJson(cfg, `integrations_scorers?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,name,yob,games,points,soffi,source,created_at&order=created_at.asc`),
        restGetJson(cfg, `hall_of_fame_entries?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,year,tournament_id,tournament_name,type,team_name,player_names,value,player_id,created_at&order=year.asc,created_at.asc`),
        restGetJson(cfg, `tournaments?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&select=id,name,start_date,type,config,is_manual,status,updated_at&order=start_date.asc`)
      ]);
      const logo = settingsRows?.[0]?.logo ? String(settingsRows[0].logo) : "";
      const playerAliases = {};
      for (const r of aliasesRows || []) {
        const from = String(r.from_key || "").trim();
        const to = String(r.to_key || "").trim();
        if (from && to) playerAliases[from] = to;
      }
      const integrationsScorers = (scorersRows || []).map((r) => ({
        id: String(r.id),
        name: String(r.name || ""),
        yob: r.yob == null ? void 0 : toInt(r.yob, 0),
        games: toInt(r.games, 0),
        points: toInt(r.points, 0),
        soffi: toInt(r.soffi, 0),
        source: r.source == null ? void 0 : String(r.source),
        createdAt: r.created_at ? Date.parse(String(r.created_at)) : void 0
      }));
      const hallOfFame = (hofRows || []).map((r) => ({
        id: String(r.id),
        year: String(r.year ?? ""),
        tournamentId: String(r.tournament_id || ""),
        tournamentName: String(r.tournament_name || ""),
        type: r.type,
        teamName: r.team_name ?? void 0,
        playerNames: Array.isArray(r.player_names) ? r.player_names.map((x) => String(x)) : [],
        value: r.value == null ? void 0 : toInt(r.value, 0),
        playerId: r.player_id ?? void 0
      }));
      const rows = tournamentRows || [];
      const liveRow = rows.find((r) => r.status === "live") || null;
      const archivedRows = rows.filter((r) => r.status !== "live");
      const pullTournamentBundle = async (tid) => {
        const tidEnc = encodeURIComponent(tid);
        const [teamRows, groupRows, groupTeamRows, matchRows, statRows] = await Promise.all([
          restGetJson(cfg, `tournament_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=id,name,player1,player2,player1_yob,player2_yob,player1_is_referee,player2_is_referee,is_referee,created_at_ms&order=created_at_ms.asc`),
          restGetJson(cfg, `tournament_groups?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=id,name,order_index&order=order_index.asc`),
          restGetJson(cfg, `tournament_group_teams?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=group_id,team_id&order=group_id.asc`),
          restGetJson(cfg, `tournament_matches?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=id,code,phase,group_name,round,round_name,order_index,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden,updated_at&order=order_index.asc`),
          restGetJson(cfg, `tournament_match_stats?workspace_id=eq.${encodeURIComponent(cfg.workspaceId)}&tournament_id=eq.${tidEnc}&select=match_id,team_id,player_name,canestri,soffi,player_key`)
        ]);
        const teams = (teamRows || []).map((r) => ({
          id: String(r.id),
          name: String(r.name || ""),
          player1: String(r.player1 || ""),
          player2: r.player2 == null ? void 0 : String(r.player2),
          player1YoB: r.player1_yob == null ? void 0 : toInt(r.player1_yob, 0),
          player2YoB: r.player2_yob == null ? void 0 : toInt(r.player2_yob, 0),
          player1IsReferee: toBool(r.player1_is_referee, false),
          player2IsReferee: toBool(r.player2_is_referee, false),
          isReferee: toBool(r.is_referee, false),
          createdAt: r.created_at_ms == null ? void 0 : toInt(r.created_at_ms, 0)
        }));
        const teamById = /* @__PURE__ */ new Map();
        teams.forEach((t) => teamById.set(t.id, t));
        const groupList = (groupRows || []).map((r) => ({
          id: String(r.id),
          name: String(r.name || ""),
          orderIndex: r.order_index == null ? 0 : toInt(r.order_index, 0)
        }));
        const groupTeamsMap = /* @__PURE__ */ new Map();
        for (const gt of groupTeamRows || []) {
          const gid = String(gt.group_id || "");
          const teamId = String(gt.team_id || "");
          if (!gid || !teamId) continue;
          const arr = groupTeamsMap.get(gid) || [];
          arr.push(teamId);
          groupTeamsMap.set(gid, arr);
        }
        const groups = groupList.map((g) => ({
          id: g.id,
          name: g.name,
          teams: (groupTeamsMap.get(g.id) || []).map((id) => teamById.get(id)).filter(Boolean)
        }));
        const statsByMatchId = /* @__PURE__ */ new Map();
        for (const s of statRows || []) {
          const mid = String(s.match_id || "");
          if (!mid) continue;
          const arr = statsByMatchId.get(mid) || [];
          arr.push({
            teamId: String(s.team_id || ""),
            playerName: String(s.player_name || ""),
            canestri: toInt(s.canestri, 0),
            soffi: toInt(s.soffi, 0)
          });
          statsByMatchId.set(mid, arr);
        }
        const matches = (matchRows || []).map((r) => ({
          id: String(r.id),
          code: r.code == null ? void 0 : String(r.code),
          phase: r.phase === "groups" || r.phase === "bracket" ? r.phase : void 0,
          groupName: r.group_name == null ? void 0 : String(r.group_name),
          round: r.round == null ? void 0 : toInt(r.round, 0),
          roundName: r.round_name == null ? void 0 : String(r.round_name),
          orderIndex: r.order_index == null ? void 0 : toInt(r.order_index, 0),
          teamAId: r.team_a_id == null ? void 0 : String(r.team_a_id),
          teamBId: r.team_b_id == null ? void 0 : String(r.team_b_id),
          scoreA: toInt(r.score_a, 0),
          scoreB: toInt(r.score_b, 0),
          played: toBool(r.played, false),
          status: r.status === "scheduled" || r.status === "playing" || r.status === "finished" ? r.status : "scheduled",
          isBye: toBool(r.is_bye, false),
          hidden: toBool(r.hidden, false),
          stats: statsByMatchId.get(String(r.id))
        }));
        const maxUpdated = (matchRows || []).reduce((acc, r) => {
          const u = r.updated_at ? String(r.updated_at) : null;
          if (!u) return acc;
          if (!acc) return u;
          return Date.parse(u) > Date.parse(acc) ? u : acc;
        }, null);
        return { teams, groups, matches, maxUpdatedAt: maxUpdated };
      };
      const bundles = await Promise.all(rows.map(async (r) => {
        const b = await pullTournamentBundle(String(r.id));
        return { row: r, bundle: b };
      }));
      const buildTournamentData = (r, b) => ({
        id: String(r.id),
        name: String(r.name || ""),
        type: r.type,
        startDate: String(r.start_date || ""),
        teams: b.teams,
        groups: b.groups.length ? b.groups : void 0,
        matches: b.matches,
        config: coerceTournamentConfig(r.config),
        isManual: !!r.is_manual
      });
      const liveTournament = liveRow ? buildTournamentData(liveRow, bundles.find((x) => String(x.row.id) === String(liveRow.id)).bundle) : null;
      const tournamentHistory = archivedRows.map((r) => {
        const found = bundles.find((x) => String(x.row.id) === String(r.id));
        return buildTournamentData(r, found.bundle);
      });
      let remoteUpdatedAt = null;
      for (const b of bundles) {
        const u = b.bundle.maxUpdatedAt;
        if (!u) continue;
        if (!remoteUpdatedAt || Date.parse(u) > Date.parse(remoteUpdatedAt)) remoteUpdatedAt = u;
      }
      const reconstructed = {
        teams: [],
        matches: [],
        tournament: liveTournament,
        tournamentMatches: liveTournament ? liveTournament.matches || [] : [],
        tournamentHistory,
        logo,
        hallOfFame,
        integrationsScorers,
        playerAliases
      };
      const summary = {
        tournaments: rows.length,
        teams: bundles.reduce((a, x) => a + (x.bundle.teams.length || 0), 0),
        groups: bundles.reduce((a, x) => a + (x.bundle.groups.length || 0), 0),
        groupTeams: 0,
        // not strictly needed (can be derived)
        matches: bundles.reduce((a, x) => a + (x.bundle.matches.length || 0), 0),
        matchStats: bundles.reduce((a, x) => a + x.bundle.matches.reduce((mAcc, m) => mAcc + (m.stats || []).length, 0), 0),
        hallOfFame: hallOfFame.length,
        integrationsScorers: integrationsScorers.length,
        aliases: Object.keys(playerAliases).length
      };
      return { state: reconstructed, summary, remoteUpdatedAt };
    };
  }
});

// services/repository/featureFlags.ts
var REMOTE_REPO_LS_KEY, AUTO_STRUCTURED_SYNC_LS_KEY, isAutoStructuredSyncEnabled;
var init_featureFlags = __esm({
  "services/repository/featureFlags.ts"() {
    REMOTE_REPO_LS_KEY = "flbp_remote_repo";
    AUTO_STRUCTURED_SYNC_LS_KEY = "flbp_auto_structured_sync";
    isAutoStructuredSyncEnabled = () => {
      try {
        const v = localStorage.getItem(AUTO_STRUCTURED_SYNC_LS_KEY);
        if (v === "1" || v === "true") return true;
      } catch {
      }
      const env2 = import.meta?.env;
      const raw2 = env2?.VITE_AUTO_STRUCTURED_SYNC;
      return raw2 === "1" || raw2 === "true";
    };
  }
});

// components/icons/PlasticCupIcon.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var init_PlasticCupIcon = __esm({
  "components/icons/PlasticCupIcon.tsx"() {
  }
});

// components/Leaderboard.tsx
import { useEffect, useMemo, useState } from "react";
import { Trophy as Trophy2, Medal, Search, Filter, ArrowUpDown, ArrowDown, Star as Star2, Wind } from "lucide-react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var init_Leaderboard = __esm({
  "components/Leaderboard.tsx"() {
    init_storageService();
    init_App();
    init_supabaseRest();
    init_featureFlags();
    init_PlasticCupIcon();
  }
});

// components/HallOfFame.tsx
import React2, { useState as useState2, useEffect as useEffect2 } from "react";
import { Search as Search2, Trophy as Trophy3, Star as Star3, Wind as Wind2, Medal as Medal2 } from "lucide-react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var init_HallOfFame = __esm({
  "components/HallOfFame.tsx"() {
    init_storageService();
    init_App();
    init_supabaseRest();
    init_PlasticCupIcon();
  }
});

// components/PublicTournaments.tsx
import React3 from "react";
import { Activity, History, ArrowRight, MonitorPlay, Search as Search3, X, Users, CalendarDays } from "lucide-react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var init_PublicTournaments = __esm({
  "components/PublicTournaments.tsx"() {
    init_App();
  }
});

// components/TournamentBracket.tsx
import { useLayoutEffect, useRef, useState as useState3 } from "react";
import { Edit2, Save, X as X2, Trophy as Trophy4 } from "lucide-react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var TournamentBracket;
var init_TournamentBracket = __esm({
  "components/TournamentBracket.tsx"() {
    TournamentBracket = ({ teams, matches, data, readOnly = false, onUpdate, tvMode = false, fitToWidth = false, scale = 1, onMatchClick, wrapTeamNames = false }) => {
      const [editingMatch, setEditingMatch] = useState3(null);
      const [scoreA, setScoreA] = useState3(0);
      const [scoreB, setScoreB] = useState3(0);
      const containerRef = useRef(null);
      const contentRef = useRef(null);
      const [fitScale, setFitScale] = useState3(1);
      const [scaledBox, setScaledBox] = useState3(null);
      const userScale = typeof scale === "number" && isFinite(scale) && scale > 0 ? scale : 1;
      const finalScale = (fitToWidth ? fitScale : 1) * userScale;
      useLayoutEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return;
        const measure = () => {
          const cw = container.clientWidth;
          const iw = content.scrollWidth;
          const ih = content.scrollHeight;
          if (!iw || !ih) return;
          const autoFit = fitToWidth && cw ? Math.min(1, cw / iw) : 1;
          setFitScale(autoFit);
          const nextFinal = autoFit * userScale;
          setScaledBox({ w: iw * nextFinal, h: ih * nextFinal });
        };
        measure();
        const ro = new ResizeObserver(() => measure());
        ro.observe(container);
        ro.observe(content);
        return () => ro.disconnect();
      }, [fitToWidth, userScale, matches.length, data?.rounds?.length]);
      const rounds = [];
      if (data?.rounds) {
        data.rounds.forEach((r) => rounds.push(r));
      } else if (matches && matches.length > 0) {
        const bracketMatches = matches.filter((m) => m.phase === "bracket" && !m.hidden && m.teamAId !== "BYE" && m.teamBId !== "BYE");
        const map = /* @__PURE__ */ new Map();
        bracketMatches.forEach((m) => {
          const r = m.round || 1;
          if (!map.has(r)) map.set(r, []);
          map.get(r).push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach((k) => {
          rounds.push(map.get(k).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)));
        });
      }
      const getMatch = (id) => matches.find((m) => m.id === id);
      const findMatchPosition = (matchId) => {
        for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
          const round = rounds[rIdx] || [];
          for (let mIdx = 0; mIdx < round.length; mIdx++) {
            if (round[mIdx]?.id === matchId) return { rIdx, mIdx };
          }
        }
        return null;
      };
      const isTbd = (id) => !!id && String(id).toUpperCase().startsWith("TBD-");
      const isBye = (id) => String(id || "").toUpperCase() === "BYE";
      const resolveWinnerTeamId = (m) => {
        if (!m) return void 0;
        if (m.teamAId === "BYE" && m.teamBId && m.teamBId !== "BYE") {
          if (isTbd(m.teamBId)) return void 0;
          return m.teamBId;
        }
        if (m.teamBId === "BYE" && m.teamAId && m.teamAId !== "BYE") {
          if (isTbd(m.teamAId)) return void 0;
          return m.teamAId;
        }
        if (m.status !== "finished") return void 0;
        if (m.scoreA > m.scoreB) {
          if (isTbd(m.teamAId)) return void 0;
          return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
          if (isTbd(m.teamBId)) return void 0;
          return m.teamBId;
        }
        return void 0;
      };
      const applyByeAutoWin = (m) => {
        if (!m) return m;
        if (m.status === "finished") return m;
        if (m.teamAId === "BYE" && m.teamBId && m.teamBId !== "BYE" && !isTbd(m.teamBId)) {
          return { ...m, played: true, status: "finished", scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamBId === "BYE" && m.teamAId && m.teamAId !== "BYE" && !isTbd(m.teamAId)) {
          return { ...m, played: true, status: "finished", scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamAId === "BYE" && m.teamBId === "BYE") {
          return { ...m, played: true, status: "finished", scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        return m;
      };
      const tryPropagateWinner = (rIdx, mIdx, finishedMatch) => {
        if (!onUpdate) return;
        const winner = resolveWinnerTeamId(finishedMatch);
        if (!winner || winner === "BYE") return;
        const nextRound = rounds[rIdx + 1];
        if (!nextRound || nextRound.length === 0) return;
        const nextMatchSkeleton = nextRound[Math.floor(mIdx / 2)];
        if (!nextMatchSkeleton) return;
        const nextMatch = getMatch(nextMatchSkeleton.id) || nextMatchSkeleton;
        const slot = mIdx % 2 === 0 ? "teamAId" : "teamBId";
        if (nextMatch[slot]) return;
        let nextUpdated = { ...nextMatch, [slot]: winner };
        const beforeStatus = nextUpdated.status;
        nextUpdated = applyByeAutoWin(nextUpdated);
        onUpdate(nextUpdated);
        if (beforeStatus !== "finished" && nextUpdated.status === "finished") {
          tryPropagateWinner(rIdx + 1, Math.floor(mIdx / 2), nextUpdated);
        }
      };
      const getWinnerTeamId2 = (m) => resolveWinnerTeamId(m);
      const handleMatchClick = (m) => {
        const fullMatch = getMatch(m.id) || m;
        if (readOnly && !fullMatch.played) return;
        if (readOnly) return;
        if (onMatchClick) {
          onMatchClick(fullMatch);
          return;
        }
        setEditingMatch(fullMatch);
        setScoreA(fullMatch.scoreA || 0);
        setScoreB(fullMatch.scoreB || 0);
      };
      const teamNameClass = wrapTeamNames ? "text-sm max-w-[100px] font-medium whitespace-normal break-words" : "truncate text-sm max-w-[100px] font-medium";
      const handleSaveScore = () => {
        if (!editingMatch || !onUpdate) return;
        const aId = editingMatch.teamAId;
        const bId = editingMatch.teamBId;
        const hasTwoRealTeams = !!aId && !!bId && !isBye(aId) && !isBye(bId) && !isTbd(aId) && !isTbd(bId);
        if (hasTwoRealTeams && scoreA === scoreB) {
          alert("Pareggio non ammesso: inserisci uno spareggio finch\xE9 c'\xE8 un vincitore.");
          return;
        }
        const updated = {
          ...editingMatch,
          scoreA,
          scoreB,
          played: true,
          status: "finished"
        };
        onUpdate(updated);
        const pos = findMatchPosition(updated.id);
        if (pos) {
          tryPropagateWinner(pos.rIdx, pos.mIdx, updated);
        }
        setEditingMatch(null);
      };
      if (!rounds || rounds.length === 0) return /* @__PURE__ */ jsx6("div", { className: "p-4 text-center text-slate-500", children: "Nessun tabellone disponibile" });
      return /* @__PURE__ */ jsxs6("div", { ref: containerRef, className: `p-4 ${fitToWidth ? "overflow-hidden" : "overflow-x-auto"}`, children: [
        /* @__PURE__ */ jsx6("div", { style: scaledBox ? { width: `${scaledBox.w}px`, height: `${scaledBox.h}px` } : void 0, children: /* @__PURE__ */ jsx6(
          "div",
          {
            ref: contentRef,
            className: `flex gap-8 ${tvMode ? "scale-100" : ""}`,
            style: fitToWidth || userScale !== 1 ? { transform: `scale(${finalScale})`, transformOrigin: "top left", width: "max-content" } : { width: "max-content" },
            children: rounds.map((round, rIdx) => /* @__PURE__ */ jsxs6("div", { className: "flex flex-col justify-around gap-4 min-w-[200px]", children: [
              /* @__PURE__ */ jsx6("div", { className: "text-center font-black uppercase text-slate-400 mb-2 text-xs", children: rIdx === rounds.length - 1 ? "FINALE" : `Round ${rIdx + 1}` }),
              round.map((m, mIdx) => {
                const match = getMatch(m.id) || m;
                let teamAId = match.teamAId;
                let teamBId = match.teamBId;
                if (rIdx > 0) {
                  const prev = rounds[rIdx - 1] || [];
                  const srcA = prev[mIdx * 2] ? getMatch(prev[mIdx * 2].id) || prev[mIdx * 2] : void 0;
                  const srcB = prev[mIdx * 2 + 1] ? getMatch(prev[mIdx * 2 + 1].id) || prev[mIdx * 2 + 1] : void 0;
                  if (!teamAId && srcA) teamAId = getWinnerTeamId2(srcA);
                  if (!teamBId && srcB) teamBId = getWinnerTeamId2(srcB);
                }
                const t1 = teams.find((t) => t.id === teamAId);
                const t2 = teams.find((t) => t.id === teamBId);
                const isWinnerA = match.status === "finished" && match.scoreA > match.scoreB;
                const isWinnerB = match.status === "finished" && match.scoreB > match.scoreA;
                return /* @__PURE__ */ jsxs6(
                  "div",
                  {
                    onClick: () => handleMatchClick(match),
                    className: `
                                    relative bg-white border rounded-lg p-2 shadow-sm min-h-[80px] flex flex-col justify-center transition-all
                                    ${!readOnly || match.played ? "cursor-pointer hover:border-beer-500" : ""}
                                    ${match.status === "playing" ? "border-beer-500 ring-2 ring-beer-200" : "border-slate-200"}
                                    ${tvMode ? "min-w-[240px]" : "min-w-[200px]"}
                                `,
                    children: [
                      match.status === "playing" && /* @__PURE__ */ jsx6("div", { className: "absolute -top-2 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[9px] px-2 rounded-full font-bold animate-pulse", children: "LIVE" }),
                      match.status === "finished" && readOnly && rIdx === rounds.length - 1 && /* @__PURE__ */ jsxs6("div", { className: "absolute -top-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-white text-[9px] px-2 rounded-full font-bold shadow flex items-center gap-1", children: [
                        /* @__PURE__ */ jsx6(Trophy4, { className: "w-3 h-3" }),
                        " WINNER"
                      ] }),
                      /* @__PURE__ */ jsxs6("div", { className: `flex justify-between ${wrapTeamNames ? "items-start" : "items-center"} px-2 py-1 rounded ${isWinnerA ? "bg-beer-100 font-bold text-beer-900" : ""}`, children: [
                        /* @__PURE__ */ jsx6("span", { className: teamNameClass, children: t1?.name || teamAId || (teamAId === "BYE" ? "BYE" : "TBD") }),
                        /* @__PURE__ */ jsx6("span", { className: "font-mono text-lg", children: match.status === "finished" ? match.scoreA : "-" })
                      ] }),
                      /* @__PURE__ */ jsxs6("div", { className: `flex justify-between ${wrapTeamNames ? "items-start" : "items-center"} px-2 py-1 rounded ${isWinnerB ? "bg-beer-100 font-bold text-beer-900" : ""}`, children: [
                        /* @__PURE__ */ jsx6("span", { className: teamNameClass, children: t2?.name || teamBId || (teamBId === "BYE" ? "BYE" : "TBD") }),
                        /* @__PURE__ */ jsx6("span", { className: "font-mono text-lg", children: match.status === "finished" ? match.scoreB : "-" })
                      ] }),
                      !readOnly && /* @__PURE__ */ jsx6(Edit2, { className: "w-3 h-3 absolute top-1 right-1 text-slate-300" })
                    ]
                  },
                  match.id
                );
              })
            ] }, rIdx))
          }
        ) }),
        editingMatch && /* @__PURE__ */ jsx6("div", { className: "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in", children: /* @__PURE__ */ jsxs6("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-slide-up", children: [
          /* @__PURE__ */ jsxs6("div", { className: "bg-slate-900 text-white p-4 flex justify-between items-center", children: [
            /* @__PURE__ */ jsx6("h3", { className: "font-bold", children: "Modifica Risultato" }),
            /* @__PURE__ */ jsx6("button", { onClick: () => setEditingMatch(null), children: /* @__PURE__ */ jsx6(X2, { className: "w-5 h-5" }) })
          ] }),
          /* @__PURE__ */ jsxs6("div", { className: "p-6 space-y-4", children: [
            /* @__PURE__ */ jsxs6("div", { className: "flex justify-between items-center gap-4", children: [
              /* @__PURE__ */ jsxs6("div", { className: "text-center flex-1", children: [
                /* @__PURE__ */ jsx6("div", { className: "text-xs font-bold text-slate-500 mb-1 truncate", children: teams.find((t) => t.id === editingMatch.teamAId)?.name || "Team A" }),
                /* @__PURE__ */ jsx6(
                  "input",
                  {
                    type: "number",
                    value: scoreA,
                    onChange: (e) => setScoreA(Math.max(0, parseInt(e.target.value) || 0)),
                    className: "w-16 h-16 text-center text-2xl font-black border-2 border-slate-200 rounded-xl focus:border-beer-500 outline-none"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx6("div", { className: "font-black text-slate-300", children: "-" }),
              /* @__PURE__ */ jsxs6("div", { className: "text-center flex-1", children: [
                /* @__PURE__ */ jsx6("div", { className: "text-xs font-bold text-slate-500 mb-1 truncate", children: teams.find((t) => t.id === editingMatch.teamBId)?.name || "Team B" }),
                /* @__PURE__ */ jsx6(
                  "input",
                  {
                    type: "number",
                    value: scoreB,
                    onChange: (e) => setScoreB(Math.max(0, parseInt(e.target.value) || 0)),
                    className: "w-16 h-16 text-center text-2xl font-black border-2 border-slate-200 rounded-xl focus:border-beer-500 outline-none"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs6(
              "button",
              {
                onClick: handleSaveScore,
                className: "w-full bg-beer-500 text-white py-3 rounded-xl font-black uppercase hover:bg-beer-600 transition flex items-center justify-center gap-2",
                children: [
                  /* @__PURE__ */ jsx6(Save, { className: "w-4 h-4" }),
                  " Salva Risultato"
                ]
              }
            )
          ] })
        ] }) })
      ] });
    };
  }
});

// components/TournamentLeaderboard.tsx
import { useState as useState4, useMemo as useMemo2 } from "react";
import { Trophy as Trophy5, Medal as Medal3, Search as Search4, Baby, ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var init_TournamentLeaderboard = __esm({
  "components/TournamentLeaderboard.tsx"() {
    init_App();
    init_storageService();
    init_PlasticCupIcon();
  }
});

// components/GroupStandingsTable.tsx
import { useLayoutEffect as useLayoutEffect2, useRef as useRef2, useState as useState5 } from "react";
import { Fragment as Fragment2, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var thClass, tdClass, GroupStandingsTable;
var init_GroupStandingsTable = __esm({
  "components/GroupStandingsTable.tsx"() {
    thClass = "px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap";
    tdClass = "px-2 py-1 text-[11px] font-bold text-slate-800 whitespace-nowrap";
    GroupStandingsTable = ({
      rankedTeams,
      rows,
      advancingCount,
      headerStyle = "abbr",
      compact = false,
      fitToWidth = false
    }) => {
      const containerRef = useRef2(null);
      const [fitScale, setFitScale] = useState5(1);
      useLayoutEffect2(() => {
        if (!fitToWidth || compact) {
          setFitScale(1);
          return;
        }
        const container = containerRef.current;
        if (!container) return;
        const measure = () => {
          const inner = container.querySelector("table");
          if (!inner) return;
          const cw = container.clientWidth;
          const iw = inner.scrollWidth;
          if (!cw || !iw) return;
          const next = Math.min(1, cw / iw);
          setFitScale(next);
        };
        measure();
        const ro = new ResizeObserver(() => measure());
        ro.observe(container);
        return () => ro.disconnect();
      }, [fitToWidth, compact, rankedTeams.length]);
      if (!rankedTeams.length) {
        return /* @__PURE__ */ jsx8("div", { className: "text-xs text-slate-400 italic", children: "Nessuna squadra" });
      }
      if (compact) {
        return /* @__PURE__ */ jsx8("div", { className: "space-y-1", children: rankedTeams.map((t, idx) => {
          const r = rows[t.id];
          const qualifies = typeof advancingCount === "number" ? idx < advancingCount : false;
          const cupsDiff = r?.cupsDiff ?? 0;
          const blowDiff = r?.blowDiff ?? 0;
          return /* @__PURE__ */ jsxs8("div", { className: `rounded border ${qualifies ? "border-green-200 bg-green-50/40" : "border-slate-100 bg-slate-50"} px-2 py-1`, children: [
            /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2 min-w-0", children: [
                /* @__PURE__ */ jsx8("div", { className: `w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${qualifies ? "bg-beer-500 text-white" : "bg-slate-200 text-slate-600"}`, children: idx + 1 }),
                /* @__PURE__ */ jsx8("div", { className: "font-bold text-[11px] text-slate-800 truncate", children: t.name })
              ] }),
              /* @__PURE__ */ jsxs8("div", { className: "text-[10px] font-mono font-bold text-slate-700 whitespace-nowrap", children: [
                "P:",
                r?.played ?? 0,
                " V:",
                r?.wins ?? 0,
                " S:",
                r?.losses ?? 0
              ] })
            ] }),
            /* @__PURE__ */ jsxs8("div", { className: "mt-0.5 text-[10px] font-mono font-bold text-slate-600 flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsxs8("span", { className: "whitespace-nowrap", children: [
                "CF:",
                r?.cupsFor ?? 0,
                " CS:",
                r?.cupsAgainst ?? 0,
                " \u0394C:",
                cupsDiff
              ] }),
              /* @__PURE__ */ jsxs8("span", { className: "whitespace-nowrap", children: [
                "SF:",
                r?.blowFor ?? 0,
                " SS:",
                r?.blowAgainst ?? 0,
                " \u0394S:",
                blowDiff
              ] })
            ] })
          ] }, t.id);
        }) });
      }
      return /* @__PURE__ */ jsxs8("div", { className: "space-y-2", children: [
        headerStyle === "legend" && !compact && /* @__PURE__ */ jsxs8("div", { className: "text-[11px] text-slate-500 font-bold", children: [
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "P" }),
          "=Partite \xB7 ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "V" }),
          "=Vinte \xB7 ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "S" }),
          "=Perse \xB7",
          " ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "CF" }),
          "=Canestri fatti \xB7 ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "CS" }),
          "=Canestri subiti \xB7",
          " ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "\u0394C" }),
          "=Differenza canestri \xB7 ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "SF" }),
          "=Soffi fatti \xB7 ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "SS" }),
          "=Soffi subiti \xB7",
          " ",
          /* @__PURE__ */ jsx8("span", { className: "font-black", children: "\u0394S" }),
          "=Differenza soffi"
        ] }),
        /* @__PURE__ */ jsx8("div", { ref: containerRef, className: fitToWidth ? "overflow-hidden" : "overflow-x-auto", children: /* @__PURE__ */ jsxs8(
          "table",
          {
            className: `w-full ${compact ? "text-[10px]" : "text-xs"}`,
            style: fitToWidth ? { transform: `scale(${fitScale})`, transformOrigin: "top left" } : void 0,
            children: [
              /* @__PURE__ */ jsx8("thead", { children: /* @__PURE__ */ jsxs8("tr", { className: "border-b border-slate-200", children: [
                /* @__PURE__ */ jsx8("th", { className: `${thClass} text-left`, children: "#" }),
                /* @__PURE__ */ jsx8("th", { className: `${thClass} text-left`, children: "Squadra" }),
                /* @__PURE__ */ jsx8("th", { className: thClass, children: "P" }),
                /* @__PURE__ */ jsx8("th", { className: thClass, children: "V" }),
                /* @__PURE__ */ jsx8("th", { className: thClass, children: "S" }),
                compact ? /* @__PURE__ */ jsx8("th", { className: thClass, children: "CF-CS" }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
                  /* @__PURE__ */ jsx8("th", { className: thClass, children: "CF" }),
                  /* @__PURE__ */ jsx8("th", { className: thClass, children: "CS" })
                ] }),
                /* @__PURE__ */ jsx8("th", { className: thClass, children: "\u0394C" }),
                compact ? /* @__PURE__ */ jsx8("th", { className: thClass, children: "SF-SS" }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
                  /* @__PURE__ */ jsx8("th", { className: thClass, children: "SF" }),
                  /* @__PURE__ */ jsx8("th", { className: thClass, children: "SS" })
                ] }),
                /* @__PURE__ */ jsx8("th", { className: thClass, children: "\u0394S" })
              ] }) }),
              /* @__PURE__ */ jsx8("tbody", { children: rankedTeams.map((t, idx) => {
                const r = rows[t.id];
                const qualifies = typeof advancingCount === "number" ? idx < advancingCount : false;
                return /* @__PURE__ */ jsxs8("tr", { className: `border-b border-slate-100 ${qualifies ? "bg-green-50/40" : ""}`, children: [
                  /* @__PURE__ */ jsx8("td", { className: `${tdClass} text-left`, children: idx + 1 }),
                  /* @__PURE__ */ jsx8("td", { className: `${tdClass} text-left ${fitToWidth ? "whitespace-normal break-words" : "max-w-[240px] truncate"} ${compact ? "text-[10px]" : ""}`, children: t.name }),
                  /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.played ?? 0 }),
                  /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.wins ?? 0 }),
                  /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.losses ?? 0 }),
                  compact ? /* @__PURE__ */ jsxs8("td", { className: tdClass, children: [
                    r?.cupsFor ?? 0,
                    "-",
                    r?.cupsAgainst ?? 0
                  ] }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
                    /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.cupsFor ?? 0 }),
                    /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.cupsAgainst ?? 0 })
                  ] }),
                  /* @__PURE__ */ jsx8("td", { className: `${tdClass} ${r?.cupsDiff ? r.cupsDiff > 0 ? "text-green-700" : r.cupsDiff < 0 ? "text-red-700" : "" : ""}`, children: r?.cupsDiff ?? 0 }),
                  compact ? /* @__PURE__ */ jsxs8("td", { className: tdClass, children: [
                    r?.blowFor ?? 0,
                    "-",
                    r?.blowAgainst ?? 0
                  ] }) : /* @__PURE__ */ jsxs8(Fragment2, { children: [
                    /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.blowFor ?? 0 }),
                    /* @__PURE__ */ jsx8("td", { className: tdClass, children: r?.blowAgainst ?? 0 })
                  ] }),
                  /* @__PURE__ */ jsx8("td", { className: `${tdClass} ${r?.blowDiff ? r.blowDiff > 0 ? "text-green-700" : r.blowDiff < 0 ? "text-red-700" : "" : ""}`, children: r?.blowDiff ?? 0 })
                ] }, t.id);
              }) })
            ]
          }
        ) })
      ] });
    };
  }
});

// services/matchUtils.ts
var getMatchParticipantIds, getMatchScoreForTeam, formatMatchScoreLabel;
var init_matchUtils = __esm({
  "services/matchUtils.ts"() {
    getMatchParticipantIds = (m) => {
      const ids = m.teamIds && m.teamIds.length ? m.teamIds : [m.teamAId, m.teamBId].filter(Boolean);
      return (ids || []).filter(Boolean);
    };
    getMatchScoreForTeam = (m, teamId) => {
      if (!teamId) return 0;
      if (m.scoresByTeam && typeof m.scoresByTeam[teamId] === "number") {
        return m.scoresByTeam[teamId] || 0;
      }
      if (m.teamAId === teamId) return m.scoreA ?? 0;
      if (m.teamBId === teamId) return m.scoreB ?? 0;
      let tot = 0;
      for (const s of m.stats || []) {
        if (s.teamId === teamId) tot += s.canestri || 0;
      }
      return tot;
    };
    formatMatchScoreLabel = (m) => {
      const ids = getMatchParticipantIds(m);
      if (ids.length >= 3) {
        return ids.map((id) => String(getMatchScoreForTeam(m, id))).join("-");
      }
      return `${m.scoreA ?? 0}-${m.scoreB ?? 0}`;
    };
  }
});

// components/PublicTournamentDetail.tsx
import React7, { useState as useState6, useEffect as useEffect3 } from "react";
import { Trophy as Trophy6, LayoutList, Clock, Medal as Medal4, X as X3, GitBranch, Star as Star5, Wind as Wind3, UserRound } from "lucide-react";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var init_PublicTournamentDetail = __esm({
  "components/PublicTournamentDetail.tsx"() {
    init_App();
    init_TournamentBracket();
    init_TournamentLeaderboard();
    init_groupStandings();
    init_GroupStandingsTable();
    init_matchUtils();
    init_PlasticCupIcon();
  }
});

// components/HelpGuide.tsx
import { useState as useState7 } from "react";
import { HelpCircle, X as X4, Lightbulb, CheckCircle2 } from "lucide-react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var init_HelpGuide = __esm({
  "components/HelpGuide.tsx"() {
  }
});

// services/imageProcessingService.ts
var loadImage, solveLinearSystem, getPerspectiveTransform, findAnchorPoints, preprocessRefertoToAlignedCanvas, ocrTextFromAlignedCanvas;
var init_imageProcessingService = __esm({
  "services/imageProcessingService.ts"() {
    loadImage = (file) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    };
    solveLinearSystem = (A, B) => {
      const n = B.length;
      for (let i = 0; i < n; i++) {
        let maxEl = Math.abs(A[i][i]);
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(A[k][i]) > maxEl) {
            maxEl = Math.abs(A[k][i]);
            maxRow = k;
          }
        }
        for (let k = i; k < n; k++) {
          const tmp2 = A[maxRow][k];
          A[maxRow][k] = A[i][k];
          A[i][k] = tmp2;
        }
        const tmp = B[maxRow];
        B[maxRow] = B[i];
        B[i] = tmp;
        for (let k = i + 1; k < n; k++) {
          const c = -A[k][i] / A[i][i];
          for (let j = i; j < n; j++) {
            if (i === j) {
              A[k][j] = 0;
            } else {
              A[k][j] += c * A[i][j];
            }
          }
          B[k] += c * B[i];
        }
      }
      const x = new Array(n).fill(0);
      for (let i = n - 1; i > -1; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
          sum += A[i][j] * x[j];
        }
        x[i] = (B[i] - sum) / A[i][i];
      }
      return x;
    };
    getPerspectiveTransform = (src, dst) => {
      const A = [];
      const B = [];
      for (let i = 0; i < 4; i++) {
        const { x: sx, y: sy } = src[i];
        const { x: dx, y: dy } = dst[i];
        A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
        B.push(dx);
        A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
        B.push(dy);
      }
      const H = solveLinearSystem(A, B);
      return [...H, 1];
    };
    findAnchorPoints = (data, w, h) => {
      const threshold = 120;
      const visited = new Int8Array(w * h);
      const blobs = [];
      const marginX = Math.floor(w * 0.3);
      const marginY = Math.floor(h * 0.3);
      const checkPixel = (idx) => {
        return data[idx * 4] < threshold && data[idx * 4 + 1] < threshold && data[idx * 4 + 2] < threshold;
      };
      const getBlob = (sx, sy) => {
        const stack = [sx, sy];
        let size = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = sx, maxX = sx, minY = sy, maxY = sy;
        while (stack.length > 0) {
          const y = stack.pop();
          const x = stack.pop();
          const idx = y * w + x;
          if (visited[idx]) continue;
          visited[idx] = 1;
          size++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x > 0 && !visited[idx - 1] && checkPixel(idx - 1)) {
            stack.push(x - 1, y);
          }
          if (x < w - 1 && !visited[idx + 1] && checkPixel(idx + 1)) {
            stack.push(x + 1, y);
          }
          if (y > 0 && !visited[idx - w] && checkPixel(idx - w)) {
            stack.push(x, y - 1);
          }
          if (y < h - 1 && !visited[idx + w] && checkPixel(idx + w)) {
            stack.push(x, y + 1);
          }
        }
        const width = maxX - minX;
        const height = maxY - minY;
        const aspect = width / (height || 1);
        if (size > 15 && size < 15e3 && aspect > 0.4 && aspect < 2.5) {
          return { x: sumX / size, y: sumY / size, size };
        }
        return null;
      };
      const regions = [
        { name: "TL", x0: 0, x1: marginX, y0: 0, y1: marginY },
        { name: "TR", x0: w - marginX, x1: w, y0: 0, y1: marginY },
        { name: "BR", x0: w - marginX, x1: w, y0: h - marginY, y1: h },
        { name: "BL", x0: 0, x1: marginX, y0: h - marginY, y1: h }
      ];
      const anchors = [null, null, null, null];
      regions.forEach((r, idx) => {
        let bestBlob = null;
        for (let y = r.y0; y < r.y1; y += 4) {
          for (let x = r.x0; x < r.x1; x += 4) {
            const pixIdx = y * w + x;
            if (!visited[pixIdx] && checkPixel(pixIdx)) {
              const blob = getBlob(x, y);
              if (blob) {
                if (!bestBlob || blob.size > bestBlob.size) {
                  bestBlob = blob;
                }
              }
            }
          }
        }
        if (bestBlob) anchors[idx] = { x: bestBlob.x, y: bestBlob.y };
      });
      return anchors;
    };
    preprocessRefertoToAlignedCanvas = async (file) => {
      const img = await loadImage(file);
      const W = img.width;
      const H = img.height;
      const MAX_DETECTION_DIM = 800;
      const scale = Math.min(MAX_DETECTION_DIM / Math.max(W, H), 1);
      const dW = Math.floor(W * scale);
      const dH = Math.floor(H * scale);
      const detCvs = document.createElement("canvas");
      detCvs.width = dW;
      detCvs.height = dH;
      const detCtx = detCvs.getContext("2d", { willReadFrequently: true });
      detCtx.drawImage(img, 0, 0, dW, dH);
      const imgData = detCtx.getImageData(0, 0, dW, dH);
      const foundAnchors = findAnchorPoints(imgData.data, dW, dH);
      const outW = 1200;
      const outH = 1700;
      const outCvs = document.createElement("canvas");
      outCvs.width = outW;
      outCvs.height = outH;
      let outCtx = outCvs.getContext("2d");
      if (foundAnchors.some((a) => a === null)) {
        console.warn("OCR: Anchor detection failed, using original image.", foundAnchors);
        outCvs.width = W;
        outCvs.height = H;
        outCtx = outCvs.getContext("2d");
        outCtx.drawImage(img, 0, 0);
        return outCvs;
      }
      const srcPoints = foundAnchors.map((p) => ({ x: p.x / scale, y: p.y / scale }));
      const dstPoints = [
        { x: 0, y: 0 },
        // TL
        { x: outW, y: 0 },
        // TR
        { x: outW, y: outH },
        // BR
        { x: 0, y: outH }
        // BL
      ];
      const H_inv = getPerspectiveTransform(dstPoints, srcPoints);
      const outData = outCtx.createImageData(outW, outH);
      const dstBuf = outData.data;
      const origCvs = document.createElement("canvas");
      origCvs.width = W;
      origCvs.height = H;
      const origCtx = origCvs.getContext("2d", { willReadFrequently: true });
      origCtx.drawImage(img, 0, 0);
      const srcBuf = origCtx.getImageData(0, 0, W, H).data;
      const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H_inv;
      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const den = h6 * x + h7 * y + h8;
          const u = Math.floor((h0 * x + h1 * y + h2) / den);
          const v = Math.floor((h3 * x + h4 * y + h5) / den);
          const dstIdx = (y * outW + x) * 4;
          if (u >= 0 && u < W && v >= 0 && v < H) {
            const srcIdx = (v * W + u) * 4;
            dstBuf[dstIdx] = srcBuf[srcIdx];
            dstBuf[dstIdx + 1] = srcBuf[srcIdx + 1];
            dstBuf[dstIdx + 2] = srcBuf[srcIdx + 2];
            dstBuf[dstIdx + 3] = 255;
          } else {
            dstBuf[dstIdx] = 255;
            dstBuf[dstIdx + 1] = 255;
            dstBuf[dstIdx + 2] = 255;
            dstBuf[dstIdx + 3] = 255;
          }
        }
      }
      outCtx.putImageData(outData, 0, 0);
      return outCvs;
    };
    ocrTextFromAlignedCanvas = async (canvas) => {
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");
        const { data } = await worker.recognize(canvas);
        await worker.terminate();
        return data && data.text ? String(data.text) : "";
      } catch (err) {
        console.warn("[OCR] failed", err);
        return "";
      }
    };
  }
});

// services/tournamentEngine.ts
var uuid, isByeId, isTbdId, isFinalGroupName2, isFinalGroup2, shuffle, nextPowerOf2, getRoundName, getGroupLetter, getGroupMatches, isGroupComplete, computeGroupRanking, distributeReferees, buildSeededParticipantsFromGroups, buildRound1PairsWithPrelimsBottom, generateTournamentStructure, syncBracketFromGroups, getFinalRoundRobinActivationStatus, activateFinalRoundRobinStage, getRowKey, isSameKey, ensureFinalTieBreakIfNeeded;
var init_tournamentEngine = __esm({
  "services/tournamentEngine.ts"() {
    init_groupStandings();
    uuid = () => Math.random().toString(36).substr(2, 9);
    isByeId = (id) => String(id || "").toUpperCase() === "BYE";
    isTbdId = (id) => String(id || "").toUpperCase().startsWith("TBD-");
    isFinalGroupName2 = (name) => /\bfinale?\b/i.test(String(name || ""));
    isFinalGroup2 = (g) => !!g && (g.stage === "final" || isFinalGroupName2(g.name));
    shuffle = (array) => {
      let currentIndex = array.length, randomIndex;
      while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
          array[randomIndex],
          array[currentIndex]
        ];
      }
      return array;
    };
    nextPowerOf2 = (n) => {
      if (n <= 0) return 0;
      return Math.pow(2, Math.ceil(Math.log2(n)));
    };
    getRoundName = (size) => {
      if (size === 1) return "Finale";
      if (size === 2) return "Semifinali";
      if (size === 4) return "Quarti";
      if (size === 8) return "Ottavi";
      return `Round of ${size * 2}`;
    };
    getGroupLetter = (groupName) => {
      if (!groupName) return "";
      const m = groupName.match(/([A-Z])$/);
      return m ? m[1] : groupName.slice(-1);
    };
    getGroupMatches = (group, allMatches) => {
      const gName = group.name;
      return (allMatches || []).filter((m) => m.phase === "groups" && m.groupName === gName);
    };
    isGroupComplete = (group, allMatches) => {
      const ms = getGroupMatches(group, allMatches);
      if (!ms.length) return false;
      return ms.every((m) => m.status === "finished");
    };
    computeGroupRanking = (group, allMatches) => {
      const teams = group.teams || [];
      const ms = getGroupMatches(group, allMatches);
      const { rows, rankedTeams } = computeGroupStandings({ teams, matches: ms });
      const stats = {};
      for (const t of teams) {
        const r = rows[t.id];
        stats[t.id] = {
          wins: r?.wins ?? 0,
          scored: r?.cupsFor ?? 0,
          conceded: r?.cupsAgainst ?? 0,
          diff: r?.cupsDiff ?? 0,
          points: r?.points ?? 0,
          blowFor: r?.blowFor ?? 0,
          blowAgainst: r?.blowAgainst ?? 0,
          blowDiff: r?.blowDiff ?? 0
        };
      }
      return { ranked: rankedTeams, stats };
    };
    distributeReferees = (participants, teams) => {
      const isRef = (id) => !!teams.find((t) => t.id === id)?.isReferee;
      const refs = participants.filter((id) => id !== "BYE" && isRef(id));
      const non = participants.filter((id) => !refs.includes(id));
      const out = [...participants];
      let rIdx = 0;
      for (let i = 0; i < out.length && rIdx < refs.length; i += 2) {
        const cur = out[i];
        if (cur === "BYE") continue;
        if (isRef(cur)) continue;
        const refId = refs[rIdx++];
        const j = out.indexOf(refId);
        if (j >= 0) {
          out[j] = cur;
          out[i] = refId;
        }
      }
      for (let i = 0; i < out.length; i += 2) {
        const a = out[i];
        const b = out[i + 1];
        if (!a || !b) continue;
        if (a === "BYE" || b === "BYE") continue;
        if (isRef(a) && isRef(b)) {
          let swapIdx = -1;
          for (let j = i + 2; j < out.length; j++) {
            const cand = out[j];
            if (cand === "BYE") continue;
            if (!isRef(cand)) {
              swapIdx = j;
              break;
            }
          }
          if (swapIdx >= 0) {
            const tmp = out[i + 1];
            out[i + 1] = out[swapIdx];
            out[swapIdx] = tmp;
          }
        }
      }
      return out;
    };
    buildSeededParticipantsFromGroups = (groups, advancing) => {
      const orderedGroups = [...groups].sort((a, b) => getGroupLetter(a.name).localeCompare(getGroupLetter(b.name)));
      const out = [];
      for (let g = 0; g < orderedGroups.length; g += 2) {
        const g1 = orderedGroups[g];
        const g2 = orderedGroups[g + 1];
        if (!g1) continue;
        const l1 = getGroupLetter(g1.name);
        const l2 = g2 ? getGroupLetter(g2.name) : "";
        for (let r = 1; r <= advancing; r++) {
          const a = `TBD-${l1}-${r}`;
          const b = g2 ? `TBD-${l2}-${advancing - r + 1}` : "BYE";
          out.push(a);
          out.push(b);
        }
      }
      return out;
    };
    buildRound1PairsWithPrelimsBottom = (seededParticipants, targetSize, currentRoundSize) => {
      const base = (seededParticipants || []).filter((id) => !isByeId(id));
      const byeCount = Math.max(0, targetSize - base.length);
      const pairs = new Array(currentRoundSize);
      if (byeCount <= 0) {
        for (let i = 0; i < currentRoundSize; i++) {
          pairs[i] = [base[i * 2] || "BYE", base[i * 2 + 1] || "BYE"];
        }
        return pairs;
      }
      const byeTeams = base.slice(0, byeCount);
      const prelimTeams = base.slice(byeCount);
      for (let i = 0; i < byeTeams.length && i < currentRoundSize; i++) {
        pairs[i] = [byeTeams[i], "BYE"];
      }
      const stack = [...prelimTeams];
      for (let mIdx = currentRoundSize - 1; mIdx >= byeTeams.length; mIdx--) {
        const b = stack.pop() || "BYE";
        const a = stack.pop() || "BYE";
        pairs[mIdx] = [a, b];
      }
      return pairs;
    };
    generateTournamentStructure = (teams, config) => {
      const allMatches = [];
      const groups = [];
      const rounds = [];
      let matchOrderIndex = 0;
      if (config.mode === "round_robin") {
        const group = {
          id: uuid(),
          name: "Girone Unico",
          teams: [...teams],
          stage: "groups"
        };
        groups.push(group);
        const groupTeams = group.teams || [];
        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            const m = {
              id: uuid(),
              teamAId: groupTeams[i].id,
              teamBId: groupTeams[j].id,
              scoreA: 0,
              scoreB: 0,
              played: false,
              status: "scheduled",
              phase: "groups",
              groupName: group.name,
              code: `U${allMatches.length + 1}`,
              orderIndex: matchOrderIndex++
            };
            allMatches.push(m);
          }
        }
        const tournament2 = {
          id: uuid(),
          name: config.tournamentName || `Torneo ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`,
          startDate: (/* @__PURE__ */ new Date()).toISOString(),
          type: "round_robin",
          teams,
          rounds: [],
          groups,
          matches: allMatches,
          config: { advancingPerGroup: 0, finalRoundRobin: config.finalRoundRobin }
        };
        return { tournament: tournament2, matches: allMatches };
      }
      if (config.mode === "groups_elimination") {
        const numGroups = Math.max(1, Math.min(config.numGroups || 4, Math.max(1, teams.length)));
        const shuffled = shuffle([...teams]);
        for (let i = 0; i < numGroups; i++) {
          groups.push({
            id: uuid(),
            name: `Girone ${String.fromCharCode(65 + i)}`,
            teams: []
          });
        }
        shuffled.forEach((team, idx) => {
          groups[idx % numGroups].teams.push(team);
        });
        groups.forEach((group) => {
          const groupTeams = group.teams;
          for (let i = 0; i < groupTeams.length; i++) {
            for (let j = i + 1; j < groupTeams.length; j++) {
              const m = {
                id: uuid(),
                teamAId: groupTeams[i].id,
                teamBId: groupTeams[j].id,
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: "scheduled",
                phase: "groups",
                groupName: group.name,
                code: `${group.name.slice(-1)}${allMatches.length + 1}`,
                orderIndex: matchOrderIndex++
              };
              allMatches.push(m);
            }
          }
        });
      }
      const effectiveAdvancingMap = {};
      if (config.mode === "groups_elimination") {
        const adv = Math.max(1, config.advancingPerGroup || 2);
        groups.forEach((g) => {
          const size = (g.teams || []).length;
          effectiveAdvancingMap[g.id] = Math.min(adv, Math.max(0, size));
        });
      }
      let bracketTeamsCount = 0;
      if (config.mode === "elimination") {
        bracketTeamsCount = teams.length;
      } else {
        bracketTeamsCount = groups.reduce((sum, g) => sum + (effectiveAdvancingMap[g.id] ?? (config.advancingPerGroup || 2)), 0);
      }
      let targetSize = nextPowerOf2(bracketTeamsCount);
      if (targetSize === 0) {
        targetSize = 0;
      }
      let currentRoundSize = targetSize ? targetSize / 2 : 0;
      let roundNum = 1;
      const round1Matches = [];
      if (currentRoundSize === 0) {
        const tournament2 = {
          id: uuid(),
          name: config.tournamentName || `Torneo ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`,
          startDate: (/* @__PURE__ */ new Date()).toISOString(),
          type: config.mode,
          teams,
          rounds,
          groups,
          matches: allMatches,
          config: { advancingPerGroup: config.advancingPerGroup || 2, finalRoundRobin: config.finalRoundRobin }
        };
        return { tournament: tournament2, matches: allMatches };
      }
      if (config.mode === "elimination") {
        const shuffledTeamIds = shuffle([...teams]).map((t) => t.id);
        const byeCount = Math.max(0, targetSize - shuffledTeamIds.length);
        const pairs = new Array(currentRoundSize);
        if (byeCount <= 0) {
          for (let i = 0; i < currentRoundSize; i++) {
            pairs[i] = [shuffledTeamIds[i * 2], shuffledTeamIds[i * 2 + 1]];
          }
        } else {
          const byeTeams = shuffledTeamIds.slice(0, byeCount);
          const prelimTeams = shuffledTeamIds.slice(byeCount);
          for (let i = 0; i < byeCount; i++) {
            pairs[i] = [byeTeams[i], "BYE"];
          }
          const stack = [...prelimTeams];
          for (let mIdx = currentRoundSize - 1; mIdx >= byeCount; mIdx--) {
            const b = stack.pop() || "BYE";
            const a = stack.pop() || "BYE";
            pairs[mIdx] = [a, b];
          }
        }
        const finalParticipants = pairs.flat();
        for (let i = 0; i < currentRoundSize; i++) {
          const pA = finalParticipants[i * 2];
          const pB = finalParticipants[i * 2 + 1];
          const match = {
            id: uuid(),
            teamAId: pA,
            teamBId: pB,
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "bracket",
            round: 1,
            roundName: getRoundName(currentRoundSize),
            code: `B1${i + 1}`,
            orderIndex: matchOrderIndex++
          };
          if (isByeId(pA) && !isByeId(pB) && !isTbdId(pB)) {
            match.teamAId = "BYE";
            match.teamBId = pB;
            match.status = "finished";
            match.played = true;
            match.scoreA = 0;
            match.scoreB = 0;
            match.hidden = true;
            match.isBye = true;
          } else if (isByeId(pB) && !isByeId(pA) && !isTbdId(pA)) {
            match.teamAId = pA;
            match.teamBId = "BYE";
            match.status = "finished";
            match.played = true;
            match.scoreA = 0;
            match.hidden = true;
            match.scoreB = 0;
            match.hidden = true;
            match.isBye = true;
          } else if (isByeId(pA) && isByeId(pB)) {
            match.teamAId = "BYE";
            match.teamBId = "BYE";
            match.status = "finished";
            match.played = true;
            match.scoreA = 0;
            match.scoreB = 0;
            match.hidden = true;
            match.isBye = true;
          } else if (isByeId(pA) && isTbdId(pB) || isByeId(pB) && isTbdId(pA)) {
            match.hidden = true;
            match.isBye = true;
          }
          round1Matches.push(match);
          allMatches.push(match);
        }
        rounds.push(round1Matches);
      } else {
        const advancing = config.advancingPerGroup || 2;
        const seeded = buildSeededParticipantsFromGroups(groups, advancing);
        const pairs = buildRound1PairsWithPrelimsBottom(seeded, targetSize, currentRoundSize);
        for (let i = 0; i < currentRoundSize; i++) {
          const [pA, pB] = pairs[i];
          const m = {
            id: uuid(),
            teamAId: pA,
            teamBId: pB,
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "bracket",
            round: 1,
            roundName: getRoundName(currentRoundSize),
            code: `B1${i + 1}`,
            orderIndex: matchOrderIndex++
          };
          if (isByeId(pA) && !isByeId(pB) && !isTbdId(pB)) {
            m.teamAId = "BYE";
            m.teamBId = pB;
            m.status = "finished";
            m.played = true;
            m.scoreA = 0;
            m.scoreB = 0;
            m.hidden = true;
            m.isBye = true;
          } else if (isByeId(pB) && !isByeId(pA) && !isTbdId(pA)) {
            m.teamAId = pA;
            m.teamBId = "BYE";
            m.status = "finished";
            m.played = true;
            m.scoreA = 0;
            m.hidden = true;
            m.scoreB = 0;
            m.isBye = true;
          } else if (isByeId(pA) && isByeId(pB)) {
            m.teamAId = "BYE";
            m.teamBId = "BYE";
            m.status = "finished";
            m.played = true;
            m.scoreA = 0;
            m.scoreB = 0;
            m.hidden = true;
            m.isBye = true;
          } else if (isByeId(pA) && isTbdId(pB) || isByeId(pB) && isTbdId(pA)) {
            m.hidden = true;
            m.isBye = true;
          }
          round1Matches.push(m);
          allMatches.push(m);
        }
        rounds.push(round1Matches);
      }
      currentRoundSize /= 2;
      roundNum++;
      while (currentRoundSize >= 1) {
        const currentRoundMatches = [];
        for (let i = 0; i < currentRoundSize; i++) {
          const m = {
            id: uuid(),
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "bracket",
            round: roundNum,
            roundName: getRoundName(currentRoundSize),
            code: `B${roundNum}${i + 1}`,
            orderIndex: matchOrderIndex++
          };
          currentRoundMatches.push(m);
          allMatches.push(m);
        }
        rounds.push(currentRoundMatches);
        currentRoundSize /= 2;
        roundNum++;
      }
      if (rounds.length > 1) {
        const r1 = rounds[0] || [];
        const r2 = rounds[1] || [];
        r1.forEach((m, i) => {
          if (m.status !== "finished") return;
          if (m.teamAId !== "BYE" && m.teamBId !== "BYE") return;
          const winner = isByeId(m.teamAId) ? m.teamBId : isByeId(m.teamBId) ? m.teamAId : void 0;
          if (!winner || isByeId(winner) || isTbdId(winner)) return;
          const target = r2[Math.floor(i / 2)];
          if (!target) return;
          if (i % 2 === 0) {
            if (!target.teamAId) target.teamAId = winner;
          } else {
            if (!target.teamBId) target.teamBId = winner;
          }
        });
      }
      const tournament = {
        id: uuid(),
        name: config.tournamentName || `Torneo ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`,
        startDate: (/* @__PURE__ */ new Date()).toISOString(),
        type: config.mode,
        teams,
        rounds,
        groups,
        matches: allMatches,
        config: {
          advancingPerGroup: config.advancingPerGroup || 2,
          finalRoundRobin: config.finalRoundRobin
        }
      };
      return { tournament, matches: allMatches };
    };
    syncBracketFromGroups = (tournament, matches) => {
      if (!tournament || tournament.type !== "groups_elimination") return matches;
      const advancing = tournament.config?.advancingPerGroup || 2;
      const groups = (tournament.groups || []).filter((g) => !isFinalGroup2(g));
      const teams = tournament.teams || [];
      let out = matches.map((m) => ({ ...m }));
      const round1From = (arr) => arr.filter((m) => m.phase === "bracket" && (m.round || 1) === 1).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      const nextOrderIndex = () => {
        const max = out.reduce((acc, m) => Math.max(acc, m.orderIndex ?? -1), -1);
        return max + 1;
      };
      const ensureGroupTieBreak1v1 = () => {
        if (!groups.length) return false;
        let inserted = false;
        for (const g of groups) {
          if (!isGroupComplete(g, out)) continue;
          const gMatches = getGroupMatches(g, out);
          const { rows, rankedTeams } = computeGroupStandings({ teams: g.teams || [], matches: gMatches });
          const advEff = Math.min(Math.max(0, advancing), rankedTeams.length);
          if (advEff <= 0) continue;
          if (advEff >= rankedTeams.length) continue;
          const cutoff = rankedTeams[advEff - 1];
          const next = rankedTeams[advEff];
          if (!cutoff || !next) continue;
          const keyOf = (teamId) => {
            const r = rows[teamId];
            const p = r?.points ?? 0;
            const dC = r?.cupsDiff ?? 0;
            const dS = r?.blowDiff ?? 0;
            return `${p}|${dC}|${dS}`;
          };
          const cutKey = keyOf(cutoff.id);
          if (cutKey !== keyOf(next.id)) continue;
          const tiedTeams = rankedTeams.filter((t) => keyOf(t.id) === cutKey);
          if (tiedTeams.length < 2) continue;
          const letter = getGroupLetter(g.name);
          const tbPrefix = `${letter}TB`;
          const sameSet = (a, b) => {
            if (a.length !== b.length) return false;
            const sa = new Set(a);
            for (const x of b) if (!sa.has(x)) return false;
            return true;
          };
          const existing = gMatches.find((m2) => {
            if (m2.phase !== "groups" || m2.groupName !== g.name) return false;
            if (!m2.isTieBreak) return false;
            const parts = m2.teamIds && m2.teamIds.length ? m2.teamIds : m2.teamAId && m2.teamBId ? [m2.teamAId, m2.teamBId] : [];
            const wanted = tiedTeams.map((t) => t.id);
            return sameSet(parts, wanted);
          });
          if (existing) continue;
          const tbNums = gMatches.filter((m2) => m2.isTieBreak && (m2.code || "").startsWith(tbPrefix)).map((m2) => {
            const mm = String(m2.code || "").match(/TB(\d+)$/);
            return mm ? parseInt(mm[1], 10) : 0;
          }).filter((n) => Number.isFinite(n));
          const nextTb = (tbNums.length ? Math.max(...tbNums) : 0) + 1;
          const participants = tiedTeams.map((t) => t.id);
          const m = participants.length === 2 ? {
            id: uuid(),
            teamAId: participants[0],
            teamBId: participants[1],
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "groups",
            groupName: g.name,
            code: `${letter}TB${nextTb}`,
            orderIndex: nextOrderIndex(),
            isTieBreak: true,
            targetScore: 1
          } : {
            id: uuid(),
            teamIds: participants,
            scoresByTeam: participants.reduce((acc, id) => ({ ...acc, [id]: 0 }), {}),
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "groups",
            groupName: g.name,
            code: `${letter}TB${nextTb}`,
            orderIndex: nextOrderIndex(),
            isTieBreak: true,
            targetScore: 1
          };
          out = [...out, m];
          inserted = true;
        }
        return inserted;
      };
      ensureGroupTieBreak1v1();
      const round1 = round1From(out);
      if (!round1.length) return out;
      const targetSize = round1.length * 2;
      const allGroupsComplete = groups.length > 0 && groups.every((g) => isGroupComplete(g, out));
      const desiredPairs = (() => {
        if (allGroupsComplete) {
          const orderedGroups = [...groups].sort((a, b) => getGroupLetter(a.name).localeCompare(getGroupLetter(b.name)));
          const participants = [];
          for (let g = 0; g < orderedGroups.length; g += 2) {
            const g1 = orderedGroups[g];
            const g2 = orderedGroups[g + 1];
            if (!g1) continue;
            const r1 = computeGroupRanking(g1, out).ranked;
            const r2 = g2 ? computeGroupRanking(g2, out).ranked : [];
            for (let r = 1; r <= advancing; r++) {
              const a = r1[r - 1]?.id;
              const b = g2 ? r2[advancing - r]?.id : "BYE";
              participants.push(a || "BYE");
              participants.push(b || "BYE");
            }
          }
          const base = participants.filter((id) => !!id && !isByeId(id));
          const seeded2 = distributeReferees(base, teams);
          return buildRound1PairsWithPrelimsBottom(seeded2, targetSize, round1.length);
        }
        const seeded = buildSeededParticipantsFromGroups(groups, advancing);
        return buildRound1PairsWithPrelimsBottom(seeded, targetSize, round1.length);
      })();
      const needsRound1Reset = desiredPairs.some((pair, i) => {
        const m = round1[i];
        return m?.teamAId !== pair[0] || m?.teamBId !== pair[1];
      });
      if (needsRound1Reset) {
        const round1Ids = new Set(round1.map((m) => m.id));
        const reset = out.map((m) => {
          if (m.phase !== "bracket") return m;
          const base = { ...m };
          base.scoreA = 0;
          base.scoreB = 0;
          base.stats = void 0;
          base.played = false;
          base.status = "scheduled";
          if ((base.round || 1) > 1) {
            delete base.teamAId;
            delete base.teamBId;
          }
          return base;
        });
        let idx = 0;
        out = reset.map((m) => {
          if (m.phase === "bracket" && (m.round || 1) === 1 && round1Ids.has(m.id)) {
            const pair = desiredPairs[idx++];
            return { ...m, teamAId: pair[0], teamBId: pair[1] };
          }
          return m;
        });
      }
      const sanitizeBracketPlaceholders = (arr) => {
        return arr.map((m) => {
          if (m.phase !== "bracket") return m;
          const round = m.round || 1;
          const base = { ...m };
          if (round > 1) {
            if (isTbdId(base.teamAId)) delete base.teamAId;
            if (isTbdId(base.teamBId)) delete base.teamBId;
          }
          const a = base.teamAId;
          const b = base.teamBId;
          const byeVsTbd = isByeId(a) && isTbdId(b) || isByeId(b) && isTbdId(a);
          if (byeVsTbd) {
            base.hidden = true;
            base.isBye = true;
            if (base.status === "finished" || base.played) {
              base.status = "scheduled";
              base.played = false;
              base.scoreA = 0;
              base.scoreB = 0;
              base.stats = void 0;
            }
          }
          if (base.status === "finished") {
            const hasA = !!base.teamAId;
            const hasB = !!base.teamBId;
            if (!hasA || !hasB || isTbdId(base.teamAId) || isTbdId(base.teamBId)) {
              base.status = "scheduled";
              base.played = false;
              base.scoreA = 0;
              base.scoreB = 0;
              base.stats = void 0;
            }
          }
          return base;
        });
      };
      if (allGroupsComplete) return sanitizeBracketPlaceholders(out);
      const placeholderToTeamId = {};
      groups.forEach((g) => {
        if (!isGroupComplete(g, out)) return;
        const letter = getGroupLetter(g.name);
        const { ranked } = computeGroupRanking(g, out);
        for (let r = 1; r <= advancing; r++) {
          const ph = `TBD-${letter}-${r}`;
          const team = ranked[r - 1];
          if (team) placeholderToTeamId[ph] = team.id;
        }
      });
      const resolveId = (id) => {
        if (!id) return id;
        return placeholderToTeamId[id] || id;
      };
      const baseRound1 = round1From(out);
      const nextRound1 = baseRound1.map((m) => ({
        ...m,
        teamAId: resolveId(m.teamAId),
        teamBId: resolveId(m.teamBId)
      }));
      const changed = nextRound1.some((m, i) => m.teamAId !== baseRound1[i].teamAId || m.teamBId !== baseRound1[i].teamBId);
      if (!changed) return sanitizeBracketPlaceholders(out);
      return sanitizeBracketPlaceholders(out.map((m) => {
        if (m.phase === "bracket" && (m.round || 1) === 1) {
          const i = nextRound1.findIndex((x) => x.id === m.id);
          if (i >= 0) return { ...m, teamAId: nextRound1[i].teamAId, teamBId: nextRound1[i].teamBId };
        }
        return m;
      }));
    };
    getFinalRoundRobinActivationStatus = (tournament, matches) => {
      const cfg = tournament?.config?.finalRoundRobin;
      const enabled = !!cfg?.enabled;
      const topTeams = cfg?.topTeams;
      const hasFinal = (tournament?.groups || []).some((g) => isFinalGroup2(g));
      const activated = !!cfg?.activated || hasFinal;
      if (!enabled) {
        return { enabled: false, activated, canActivate: false, reason: "disabled" };
      }
      if (activated) {
        return { enabled: true, activated: true, canActivate: false, reason: "already_activated", topTeams };
      }
      if (!topTeams || topTeams !== 4 && topTeams !== 8) {
        return { enabled: true, activated: false, canActivate: false, reason: "missing_topTeams" };
      }
      if (!tournament || tournament.type !== "elimination" && tournament.type !== "groups_elimination") {
        return { enabled: true, activated: false, canActivate: false, reason: "unsupported_tournament_type", topTeams };
      }
      const bracket = (matches || []).filter((m) => m.phase === "bracket");
      if (!bracket.length) {
        return { enabled: true, activated: false, canActivate: false, reason: "no_bracket_matches", topTeams };
      }
      const byRound = {};
      for (const m of bracket) {
        const r = m.round || 1;
        if (!byRound[r]) byRound[r] = [];
        byRound[r].push(m);
      }
      const desiredMatchCount = topTeams / 2;
      const roundCandidates = Object.keys(byRound).map((n) => parseInt(n, 10)).sort((a, b) => a - b);
      const roundNum = roundCandidates.find((r) => (byRound[r]?.length || 0) === desiredMatchCount);
      if (!roundNum) {
        return { enabled: true, activated: false, canActivate: false, reason: "bracket_too_small_or_unexpected_shape", topTeams };
      }
      const roundMatches = byRound[roundNum] || [];
      const ids = /* @__PURE__ */ new Set();
      for (const m of roundMatches) {
        const a = m.teamAId;
        const b = m.teamBId;
        if (!a || !b) {
          return { enabled: true, activated: false, canActivate: false, reason: "participants_not_determined", topTeams };
        }
        if (isByeId(a) || isByeId(b)) {
          return { enabled: true, activated: false, canActivate: false, reason: "bye_in_participants", topTeams };
        }
        if (isTbdId(a) || isTbdId(b)) {
          return { enabled: true, activated: false, canActivate: false, reason: "participants_not_determined", topTeams };
        }
        ids.add(a);
        ids.add(b);
      }
      const participantIds = [...ids];
      if (participantIds.length !== topTeams) {
        return { enabled: true, activated: false, canActivate: false, reason: "participants_count_mismatch", topTeams };
      }
      const teamById = new Map((tournament.teams || []).map((t) => [t.id, t]));
      const participants = participantIds.map((id) => teamById.get(id)).filter(Boolean);
      if (participants.length !== topTeams) {
        return { enabled: true, activated: false, canActivate: false, reason: "participants_not_found_in_roster", topTeams };
      }
      return { enabled: true, activated: false, canActivate: true, topTeams, participants };
    };
    activateFinalRoundRobinStage = (tournament, matches) => {
      const status = getFinalRoundRobinActivationStatus(tournament, matches);
      if (!status.canActivate || !status.participants || !status.topTeams) return { tournament, matches };
      const finalName = "Girone Finale";
      const finalGroup = {
        id: uuid(),
        name: finalName,
        teams: status.participants,
        stage: "final"
      };
      const existingGroups = tournament.groups || [];
      const stageGroups = existingGroups.filter((g) => !isFinalGroup2(g));
      const nextGroups = [...stageGroups, finalGroup];
      const maxOrder = (matches || []).reduce((acc, m) => Math.max(acc, m.orderIndex ?? -1), -1);
      let orderIndex = maxOrder + 1;
      const ids = status.participants.map((t) => t.id);
      const rrPairs = [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          rrPairs.push([ids[i], ids[j]]);
        }
      }
      const finalMatches = rrPairs.map((pair, i) => ({
        id: uuid(),
        teamAId: pair[0],
        teamBId: pair[1],
        scoreA: 0,
        scoreB: 0,
        played: false,
        status: "scheduled",
        phase: "groups",
        groupName: finalName,
        code: `F${i + 1}`,
        orderIndex: orderIndex++
      }));
      const nextTournament = {
        ...tournament,
        groups: nextGroups,
        config: {
          ...tournament.config,
          finalRoundRobin: {
            ...tournament.config?.finalRoundRobin || { enabled: true, topTeams: status.topTeams },
            enabled: true,
            topTeams: status.topTeams,
            activated: true
          }
        }
      };
      return { tournament: nextTournament, matches: [...matches || [], ...finalMatches] };
    };
    getRowKey = (rows, teamId) => {
      const r = rows[teamId] || {};
      return {
        points: r.points ?? 0,
        cupsDiff: r.cupsDiff ?? 0,
        blowDiff: r.blowDiff ?? 0,
        cupsFor: r.cupsFor ?? 0
      };
    };
    isSameKey = (a, b) => {
      return a.points === b.points && a.cupsDiff === b.cupsDiff && a.blowDiff === b.blowDiff && a.cupsFor === b.cupsFor;
    };
    ensureFinalTieBreakIfNeeded = (tournament, matches) => {
      const cfg = tournament?.config?.finalRoundRobin;
      if (!cfg?.enabled || !cfg.activated) return matches;
      const groups = tournament.groups || [];
      const finalGroup = groups.find((g) => isFinalGroup2(g));
      if (!finalGroup) return matches;
      const finalName = finalGroup.name;
      const allFinalMatches = (matches || []).filter((m) => m.phase === "groups" && (m.groupName || "") === finalName && !m.hidden && !m.isBye);
      if (!allFinalMatches.length) return matches;
      const baseMatches = allFinalMatches.filter((m) => !m.isTieBreak);
      if (!baseMatches.length) return matches;
      if (!baseMatches.every((m) => m.status === "finished")) return matches;
      const pendingTbs = allFinalMatches.filter((m) => m.isTieBreak && m.status !== "finished");
      if (pendingTbs.length) return matches;
      const visibleTeams = (finalGroup.teams || []).filter((t) => !t.hidden && !t.isBye && !isByeId(t.id));
      if (visibleTeams.length < 2) return matches;
      const finished = allFinalMatches.filter((m) => m.status === "finished");
      const { rows, rankedTeams } = computeGroupStandings({ teams: visibleTeams, matches: finished });
      if (!rankedTeams.length) return matches;
      const top = rankedTeams[0];
      if (!top) return matches;
      if (rankedTeams.length > 1) {
        const second = rankedTeams[1];
        if (second) {
          const kTop = getRowKey(rows, top.id);
          const kSecond = getRowKey(rows, second.id);
          if (!isSameKey(kTop, kSecond)) return matches;
        } else {
          return matches;
        }
      } else {
        return matches;
      }
      const topKey = getRowKey(rows, top.id);
      const tied = rankedTeams.filter((tt) => isSameKey(getRowKey(rows, tt.id), topKey));
      const tiedIds = tied.map((t) => t.id).filter(Boolean);
      if (tiedIds.length < 2) return matches;
      let maxN = 0;
      for (const m of allFinalMatches) {
        const c = String(m.code || "").trim().toUpperCase();
        const mm = c.match(/^FTB(\d+)$/);
        if (mm) maxN = Math.max(maxN, parseInt(mm[1], 10) || 0);
      }
      const nextN = maxN + 1;
      const maxOrder = (matches || []).reduce((acc, m) => Math.max(acc, m.orderIndex ?? -1), -1);
      const orderIndex = maxOrder + 1;
      const tb = {
        id: uuid(),
        scoreA: 0,
        scoreB: 0,
        played: false,
        status: "scheduled",
        phase: "groups",
        groupName: finalName,
        code: `FTB${nextN}`,
        orderIndex,
        isTieBreak: true,
        targetScore: 1
      };
      if (tiedIds.length === 2) {
        tb.teamAId = tiedIds[0];
        tb.teamBId = tiedIds[1];
      } else {
        tb.teamIds = tiedIds;
        tb.teamAId = tiedIds[0];
        tb.teamBId = tiedIds[1];
      }
      return [...matches || [], tb];
    };
  }
});

// components/RefereesArea.tsx
import { useEffect as useEffect4, useMemo as useMemo3, useRef as useRef3, useState as useState8 } from "react";
import { Gavel, ArrowLeft, LogOut, Repeat2 } from "lucide-react";
import { Fragment as Fragment3, jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
var init_RefereesArea = __esm({
  "components/RefereesArea.tsx"() {
    init_App();
    init_matchUtils();
    init_imageProcessingService();
    init_tournamentEngine();
  }
});

// services/repository/LocalRepository.ts
var init_LocalRepository = __esm({
  "services/repository/LocalRepository.ts"() {
    init_storageService();
  }
});

// services/dbDiagnostics.ts
var LS_KEY, pushEvent, readRaw, writeRaw, readDbSyncDiagnostics, markDbSyncOk, markDbSyncError, markDbSyncConflict, clearDbSyncHistory, markDbHealth, markRemoteVersions;
var init_dbDiagnostics = __esm({
  "services/dbDiagnostics.ts"() {
    init_featureFlags();
    LS_KEY = "flbp_db_sync_diag_v1";
    pushEvent = (event) => {
      const cur = readRaw();
      const next = { ...cur };
      const list = Array.isArray(cur.events) ? cur.events.slice() : [];
      list.push(event);
      next.events = list.slice(-60);
      writeRaw(next);
    };
    readRaw = () => {
      try {
        const raw2 = localStorage.getItem(LS_KEY);
        if (!raw2) return {};
        const parsed = JSON.parse(raw2);
        if (!parsed || typeof parsed !== "object") return {};
        return parsed;
      } catch {
        return {};
      }
    };
    writeRaw = (next) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
      }
    };
    readDbSyncDiagnostics = () => readRaw();
    markDbSyncOk = (kind, summary) => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const cur = readRaw();
      const next = { ...cur };
      if (kind === "snapshot") {
        next.lastSnapshotOkAt = now;
      } else if (kind === "structured") {
        next.lastStructuredOkAt = now;
        if (summary != null) next.lastStructuredSummary = summary;
      }
      writeRaw(next);
      pushEvent({ at: now, kind, level: "ok", message: kind === "structured" ? "Sync strutturato OK" : kind === "snapshot" ? "Snapshot OK" : `${kind} OK`, meta: summary != null ? { summary } : void 0 });
    };
    markDbSyncError = (message, kind = "snapshot") => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const cur = readRaw();
      writeRaw({
        ...cur,
        lastErrorAt: now,
        lastErrorMessage: String(message || "Errore sconosciuto")
      });
      pushEvent({ at: now, kind, level: "error", message: String(message || "Errore sconosciuto") });
    };
    markDbSyncConflict = (message, meta) => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const cur = readRaw();
      writeRaw({
        ...cur,
        lastConflictAt: now,
        lastConflictMessage: String(message || "Conflitto rilevato"),
        lastRemoteUpdatedAt: meta?.remoteUpdatedAt || cur.lastRemoteUpdatedAt,
        lastRemoteBaseUpdatedAt: meta?.remoteBaseUpdatedAt || cur.lastRemoteBaseUpdatedAt
      });
      try {
        localStorage.removeItem(AUTO_STRUCTURED_SYNC_LS_KEY);
      } catch {
      }
      pushEvent({
        at: now,
        kind: "structured",
        level: "conflict",
        message: String(message || "Conflitto rilevato"),
        meta: { remoteUpdatedAt: meta?.remoteUpdatedAt ?? null, remoteBaseUpdatedAt: meta?.remoteBaseUpdatedAt ?? null }
      });
    };
    clearDbSyncHistory = () => {
      const cur = readRaw();
      writeRaw({ ...cur, events: [] });
    };
    markDbHealth = (ok, meta) => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      pushEvent({ at: now, kind: "health", level: ok ? "ok" : "warn", message: ok ? "Health check OK" : "Health check con warning/error", meta });
    };
    markRemoteVersions = (meta) => {
      const cur = readRaw();
      writeRaw({
        ...cur,
        lastRemoteUpdatedAt: meta.remoteUpdatedAt ?? cur.lastRemoteUpdatedAt,
        lastRemoteBaseUpdatedAt: meta.remoteBaseUpdatedAt ?? cur.lastRemoteBaseUpdatedAt
      });
    };
  }
});

// services/repository/RemoteRepository.ts
var RemoteRepository;
var init_RemoteRepository = __esm({
  "services/repository/RemoteRepository.ts"() {
    init_storageService();
    init_supabaseRest();
    init_dbDiagnostics();
    RemoteRepository = class _RemoteRepository {
      constructor(localFallback) {
        this.source = "remote";
        this.pullKicked = false;
        this.pendingTimer = null;
        this.pendingState = null;
        this.firstLoadAt = 0;
        this.listeners = /* @__PURE__ */ new Set();
        this.local = localFallback;
        const flush = () => this.flushNow();
        try {
          window.addEventListener("beforeunload", flush);
          window.addEventListener("pagehide", flush);
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") flush();
          });
        } catch {
        }
      }
      static {
        this.REMOTE_CACHE_KEY = "flbp_remote_state_cache_v1";
      }
      subscribe(listener) {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      }
      emit(state, meta) {
        try {
          for (const l of this.listeners) {
            try {
              l(state, meta);
            } catch {
            }
          }
        } catch {
        }
      }
      load() {
        const localState = this.local.load();
        if (!this.firstLoadAt) this.firstLoadAt = Date.now();
        const cfg = getSupabaseConfig();
        const token = getSupabaseAccessToken();
        if (!cfg || !token) return localState;
        const cached = this.readCache();
        const state = cached?.state ? coerceAppState(cached.state) : localState;
        try {
          if (cached?.updatedAt) setRemoteBaseUpdatedAt(cached.updatedAt);
        } catch {
        }
        if (!this.pullKicked) {
          this.pullKicked = true;
          void this.pullAndCache();
        }
        return state;
      }
      save(state) {
        this.local.save(state);
        const cfg = getSupabaseConfig();
        const token = getSupabaseAccessToken();
        if (!cfg || !token) return;
        this.writeCache({ updatedAt: (/* @__PURE__ */ new Date()).toISOString(), state });
        this.pendingState = state;
        if (this.pendingTimer != null) {
          window.clearTimeout(this.pendingTimer);
        }
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = null;
          void this.flushNow();
        }, 800);
      }
      readCache() {
        try {
          const raw2 = localStorage.getItem(_RemoteRepository.REMOTE_CACHE_KEY);
          if (!raw2) return null;
          const parsed = JSON.parse(raw2);
          if (!parsed || typeof parsed !== "object") return null;
          return parsed;
        } catch {
          return null;
        }
      }
      writeCache(v) {
        try {
          localStorage.setItem(_RemoteRepository.REMOTE_CACHE_KEY, JSON.stringify(v));
        } catch {
        }
      }
      async pullAndCache() {
        try {
          const row = await pullWorkspaceState();
          if (!row?.state) return;
          const cur = this.readCache();
          const curTs = cur?.updatedAt ? Date.parse(cur.updatedAt) : 0;
          const nextTs = row.updated_at ? Date.parse(row.updated_at) : Date.now();
          if (!cur || Number.isFinite(nextTs) && nextTs > curTs) {
            this.writeCache({ updatedAt: row.updated_at, state: row.state });
            try {
              if (row.updated_at) setRemoteBaseUpdatedAt(row.updated_at);
            } catch {
            }
            const nextState = coerceAppState(row.state);
            const withinBootWindow = this.firstLoadAt > 0 && Date.now() - this.firstLoadAt < 2500;
            if (withinBootWindow) {
              try {
                this.local.save(nextState);
              } catch {
              }
            }
            this.emit(nextState, { updatedAt: row.updated_at || void 0 });
          }
        } catch {
        }
      }
      async flushNow() {
        const s = this.pendingState;
        if (!s) return;
        this.pendingState = null;
        try {
          await pushWorkspaceState(s);
          markDbSyncOk("snapshot");
        } catch (e) {
          if (e?.code === "FLBP_DB_CONFLICT") {
            markDbSyncConflict(e?.message || "Conflitto DB");
          } else {
            markDbSyncError("Sync snapshot fallita (offline/non autorizzato).");
          }
        }
      }
    };
  }
});

// services/repository/getRepository.ts
var init_getRepository = __esm({
  "services/repository/getRepository.ts"() {
    init_LocalRepository();
    init_RemoteRepository();
    init_featureFlags();
  }
});

// services/autoDbSync.ts
var pending, inFlight, lastRunAt, lastFingerprint, MIN_INTERVAL_MS, safeFingerprint, flushAutoStructuredSync;
var init_autoDbSync = __esm({
  "services/autoDbSync.ts"() {
    init_supabaseRest();
    init_dbDiagnostics();
    init_featureFlags();
    pending = null;
    inFlight = false;
    lastRunAt = 0;
    lastFingerprint = "";
    MIN_INTERVAL_MS = 2e4;
    safeFingerprint = (s) => {
      try {
        const liveId = s.tournament?.id || "";
        const histLast = s.tournamentHistory?.[s.tournamentHistory.length - 1]?.id || "";
        const parts = [
          `t:${liveId}`,
          `h:${s.tournamentHistory?.length || 0}`,
          `hl:${histLast}`,
          `tm:${s.tournamentMatches?.length || 0}`,
          `teams:${s.teams?.length || 0}`,
          `hof:${s.hallOfFame?.length || 0}`,
          `als:${Object.keys(s.playerAliases || {}).length}`,
          `sc:${s.integrationsScorers?.length || 0}`
        ];
        return parts.join("|");
      } catch {
        return String(Date.now());
      }
    };
    flushAutoStructuredSync = async (stateOverride, opts) => {
      if (stateOverride) pending = stateOverride;
      if (inFlight) return;
      const s = pending;
      if (!s) return;
      const cfg = getSupabaseConfig();
      const token = getSupabaseAccessToken();
      if (!cfg || !token) return;
      const now = Date.now();
      const fp = safeFingerprint(s);
      if (!opts?.force) {
        if (now - lastRunAt < MIN_INTERVAL_MS && fp === lastFingerprint) return;
        if (now - lastRunAt < MIN_INTERVAL_MS) return;
      }
      inFlight = true;
      pending = null;
      try {
        const summary = await pushNormalizedFromState(s);
        lastRunAt = Date.now();
        lastFingerprint = fp;
        markDbSyncOk("structured", summary);
      } catch (e) {
        if (e?.code === "FLBP_DB_CONFLICT") {
          markDbSyncConflict(e?.message || "Conflitto DB");
        } else {
          markDbSyncError(e?.message || String(e));
        }
      } finally {
        inFlight = false;
      }
    };
  }
});

// services/i18nService.ts
var translations;
var init_i18nService = __esm({
  "services/i18nService.ts"() {
    translations = {
      it: {
        federation_name: "Fed. Lucense",
        dashboard: "Dashboard",
        historical: "Classifica Storica",
        hof: "Albo d'Oro",
        tournaments: "Tornei",
        admin: "Area Admin",
        referees_area: "Area Arbitri",
        teams: "Squadre",
        new_team: "Nuova",
        advanced_actions: "Avanzate",
        no_teams: "Nessuna squadra inserita.",
        no_results: "Nessun risultato.",
        edit: "Modifica",
        delete: "Elimina",
        players: "Giocatori",
        points: "Punti",
        soffi: "Soffi",
        winner: "Vincitore",
        search: "Cerca...",
        generate: "Genera",
        simulate: "Simula",
        all_time_stats: "Statistiche Storiche",
        active_now: "LIVE ORA",
        no_tournament: "Nessun Torneo Attivo",
        export: "Esporta",
        back: "Indietro",
        logout: "Esci",
        rank: "Rank",
        pos: "Pos",
        games: "Gare",
        avg_points: "Med PT",
        avg_soffi: "Med SF",
        no_players_found: "Nessun giocatore trovato.",
        pro_mode: "Pro (4+ Gare)",
        general_mode: "Generale",
        search_placeholder: "Cerca giocatore...",
        manual_entry: "Manuale",
        sim_teams_title: "Generatore Pool FLBP",
        num_teams: "Numero Squadre (X)",
        generate_from_pool: "Genera da Pool 300/600",
        import_excel: "Importa Excel",
        subtab_teams: "1. Squadre",
        subtab_structure: "2. Struttura",
        subtab_referti: "3. Referti",
        subtab_list: "4. Lista Codici",
        subtab_monitor: "5. Monitor Grafico",
        step_2_config: "Step 2: Configura",
        elimination_mode: "Eliminazione Diretta",
        groups_mode: "Gironi + Eliminazione",
        groups_label: "Gironi",
        advancing_label: "Qualificati x Girone",
        generate_structure: "GENERA STRUTTURA",
        start_live: "AVVIA LIVE",
        ocr_referto: "OCR Referto",
        pts_label: "PT",
        register_result: "Registra Risultato",
        step_by_step: "Passo Dopo Passo",
        instant_sim: "Istantaneo",
        sim_rules: "REGOLE SIMULAZIONE",
        match_list: "Lista Match",
        monitor_groups: "Monitor Gironi",
        monitor_bracket: "Monitor Tabellone",
        add_hof_record: "Aggiungi Record HoF",
        type: "Tipo",
        year: "Anno",
        tournament_name: "Nome Torneo",
        team_name_optional: "Nome Squadra (opzionale)",
        players_placeholder: "Giocatori (separati da virgola)",
        existing_records: "Record Esistenti",
        no_hof_records: "Nessun record salvato nell'Albo d'Oro",
        winner_plural: "Vincitori",
        top_scorers_plural: "Capocannonieri",
        defenders_plural: "Difensori",
        mvp_plural: "MVP",
        titled_players_plural: "Giocatori Titolati",
        titles_total: "Titoli Totali",
        monitor_inactive_title: "Monitor Inattivo",
        monitor_inactive_desc: "Non ci sono tornei attivi al momento.",
        go_back: "Torna Indietro",
        version_info: "Fed. Lucense Beer Pong \u2022 Live System v3.3",
        update_in: "Aggiornamento in",
        top_scorers_live: "Top Scorers Live",
        bracket_finale: "Tabellone Finale",
        finale: "FINALE",
        semi: "SEMI",
        quarti: "QUARTI",
        ottavi: "OTTAVI",
        canestri_tv: "CANESTRI",
        soffi_tv: "SOFFI",
        page: "Pagina",
        no_data_available: "Nessun dato disponibile",
        complete_tournament: "Completa e Archivia",
        confirm_archive: "Conferma Premiazioni",
        archive_desc: "I risultati verranno salvati nell'Albo d'Oro e il torneo verr\xE0 archiviato.",
        tournament_winner: "Campioni del Torneo",
        tournament_mvp: "Miglior Giocatore (MVP)",
        tournament_top_scorer: "Miglior Realizzatore",
        tournament_defender: "Miglior Difensore",
        view: "Vedi",
        home_leaderboard_desc: "Visualizza le statistiche aggregate di tutti i tempi, i record e le medie giocatori.",
        home_hof_desc: "La storia dei campioni. Vincitori passati, MVP e premi individuali.",
        home_tournaments_desc: "Segui i tabelloni e i gironi degli eventi in corso in tempo reale.",
        home_admin_desc: "Gestione squadre, struttura torneo, referti, monitor e archiviazione.",
        admin_auth_desc: "Accesso protetto. Per ora puoi entrare cliccando \u201CAccedi\u201D anche senza password.",
        admin_password_placeholder: "Password (opzionale)",
        admin_login: "Accedi",
        admin_live_management: "Gestione Live",
        admin_data_management: "Gestione Dati",
        admin_live_desc: "Torneo in corso (operativit\xE0 live)",
        admin_data_desc: "Storico / modifiche retroattive / inserimenti manuali",
        admin_tools: "Strumenti",
        admin_group_manage: "Gestione",
        admin_group_monitor: "Monitor",
        admin_group_data: "Dati",
        admin_select_archived_desc: "Seleziona un torneo archiviato e applica le modifiche.",
        admin_tv_groups: "TV Gironi",
        admin_tv_groups_bracket: "TV G+T",
        admin_tv_bracket: "TV Tabellone",
        admin_tv_scorers: "TV Marcatori",
        admin_set: "Imposta",
        structure: "Struttura",
        reports: "Referti",
        referees: "Arbitri",
        code_list: "Lista Codici",
        data_management: "Gestione dati",
        alert_fill_team_players: "Compila Squadra, Giocatore 1 e Giocatore 2.",
        alert_no_live_teams_copy: "Nessuna squadra live disponibile da copiare.",
        alert_enter_tournament_name: "Inserisci il nome torneo.",
        alert_min_2_teams: "Inserisci almeno 2 squadre.",
        alert_archived_created: "Torneo archiviato creato. Ora puoi inserire risultati e riconoscimenti dalla stessa schermata.",
        alert_no_live_selected: "Nessun torneo live selezionato.",
        alert_select_player: "Seleziona un giocatore.",
        alert_mvp_set: "MVP impostato.",
        alert_fill_teamname_players: "Compila Nome squadra, Giocatore 1 e Giocatore 2.",
        alert_export_backup_fail: "Impossibile esportare il backup.",
        alert_backup_restored: "Backup ripristinato.",
        alert_backup_invalid: "Backup non valido o corrotto.",
        alert_popup_blocked: "Popup bloccato: abilita le finestre popup per stampare.",
        alert_no_bracket_print: "Nessun tabellone disponibile da stampare.",
        alert_import_failed_no_team: "Import fallito: nessuna squadra valida trovata. Controlla formato colonne.",
        alert_import_error: "Errore durante import. Riprova con un file Excel .xlsx o CSV semplice.",
        alert_added_duplicate_test: "Aggiunti team con omonimi per test (alcuni senza anno).",
        alert_need_2_teams_generate: "Servono almeno 2 squadre per generare il torneo.",
        alert_generation_error: "Errore durante la generazione. Controlla i parametri.",
        alert_live_started: "Torneo Live avviato con successo!",
        alert_no_live_active: "Nessun torneo live attivo.",
        alert_no_match_simulable: "Nessun match simulabile in questo momento.",
        alert_select_match: "Seleziona un match.",
        alert_report_saved: "Referto salvato.",
        alert_saved_propagation: "Salvato. (Propagazione completata)",
        alert_awards_updated: "Riconoscimenti aggiornati.",
        alert_year_invalid: "Inserisci un anno valido (4 cifre).",
        alert_enter_champion_team: "Inserisci il nome della squadra campione.",
        alert_enter_player_name: "Inserisci il nome del giocatore.",
        alert_no_valid_scorers_rows: "Nessuna riga valida trovata nel file. Attesi: Nome, Anno, Partite, Canestri, Soffi.",
        alert_scorers_import_error: "Errore import marcatori. Verifica il file e riprova.",
        referees_auth_desc: "Accesso protetto. Per ora puoi entrare cliccando \u201CAccedi\u201D anche senza password.",
        referees_password_placeholder: "Password (opzionale)",
        referees_login: "Accedi",
        referees_select_referee: "Seleziona arbitro",
        referees_select_placeholder: "Scegli un nome...",
        referees_add_manual: "Aggiungi manualmente",
        referees_add_name_placeholder: "Nome arbitro",
        referees_add_confirm: "Aggiungi",
        referees_add_cancel: "Annulla",
        referees_selected: "Arbitro selezionato",
        referees_change_referee: "Cambia arbitro",
        referees_enter_report_code: "Inserisci codice referto",
        referees_report_code_label: "Codice referto",
        referees_report_code_placeholder: "Es. A12",
        referees_find_code: "Cerca",
        referees_match_found: "Match trovato",
        referees_choose_entry: "Modalit\xE0 inserimento",
        referees_entry_manual: "Manuale",
        referees_entry_ocr: "OCR",
        referees_upload_photo: "Carica foto referto",
        referees_pending_matches: "Match da refertare",
        referees_pending_matches_desc: "Seleziona un match in corso o programmato, oppure usa il codice.",
        referees_pick_match: "Seleziona",
        referees_match_list_show_all: "Mostra tutti",
        referees_match_list_show_less: "Mostra meno",
        referees_ocr_processing: "OCR in corso\u2026",
        referees_ocr_confirm_title: "Conferma dati OCR",
        referees_ocr_confirm_desc: "Controlla e correggi i dati estratti prima di aprire l'inserimento manuale.",
        referees_ocr_code_label: "Codice referto",
        referees_ocr_score_label: "Score letto (supporto)",
        referees_ocr_text_label: "Testo OCR (supporto)",
        referees_ocr_apply: "Apri inserimento manuale",
        referees_ocr_cancel: "Annulla",
        referees_manual_title: "Inserimento manuale",
        referees_manual_desc: "Inserisci canestri e soffi per ogni giocatore. Lo score viene calcolato automaticamente.",
        referees_save_report: "Salva referto",
        referees_save_busy: "Salvataggio\u2026",
        referees_ocr_support: "Supporto OCR",
        referees_clear_ocr_support: "Rimuovi supporto OCR",
        alert_tie_not_allowed: "Pareggio non ammesso: inserisci lo spareggio nei canestri/soffi dei giocatori."
      },
      en: {
        federation_name: "Lucca Federation",
        dashboard: "Dashboard",
        historical: "Historic Leaderboard",
        hof: "Hall of Fame",
        tournaments: "Tournaments",
        admin: "Admin Area",
        referees_area: "Referees Area",
        teams: "Teams",
        new_team: "New",
        advanced_actions: "Advanced",
        no_teams: "No teams added.",
        no_results: "No results.",
        edit: "Edit",
        delete: "Delete",
        players: "Players",
        points: "Points",
        soffi: "Defensive",
        winner: "Winner",
        search: "Search...",
        generate: "Generate",
        simulate: "Simulate",
        all_time_stats: "All-time Stats",
        active_now: "LIVE NOW",
        no_tournament: "No Active Tournament",
        export: "Export",
        back: "Back",
        logout: "Logout",
        rank: "Rank",
        pos: "Pos",
        games: "Games",
        avg_points: "Avg PT",
        avg_soffi: "Avg SF",
        no_players_found: "No players found.",
        pro_mode: "Pro (4+ Games)",
        general_mode: "General",
        search_placeholder: "Search player...",
        manual_entry: "Manual",
        sim_teams_title: "FLBP Pool Generator",
        num_teams: "Number of Teams (X)",
        generate_from_pool: "Generate from 300/600 Pool",
        import_excel: "Import Excel",
        subtab_teams: "1. Teams",
        subtab_structure: "2. Structure",
        subtab_referti: "3. Scoresheets",
        subtab_list: "4. Code List",
        subtab_monitor: "5. Visual Monitor",
        step_2_config: "Step 2: Configuration",
        elimination_mode: "Single Elimination",
        groups_mode: "Groups + Elimination",
        groups_label: "Groups",
        advancing_label: "Qualified per Group",
        generate_structure: "GENERATE STRUCTURE",
        start_live: "START LIVE",
        ocr_referto: "OCR Scoresheet",
        pts_label: "PT",
        register_result: "Register Result",
        step_by_step: "Step by Step",
        instant_sim: "Instant",
        sim_rules: "SIMULATION RULES",
        match_list: "Match List",
        monitor_groups: "Groups Monitor",
        monitor_bracket: "Bracket Monitor",
        add_hof_record: "Add HoF Record",
        type: "Type",
        year: "Year",
        tournament_name: "Tournament Name",
        team_name_optional: "Team Name (optional)",
        players_placeholder: "Players (comma separated)",
        existing_records: "Existing Records",
        no_hof_records: "No records saved in Hall of Fame",
        winner_plural: "Winners",
        top_scorers_plural: "Top Scorers",
        defenders_plural: "Defenders",
        mvp_plural: "MVPs",
        titled_players_plural: "Titled Players",
        titles_total: "Total Titles",
        monitor_inactive_title: "Monitor Inactive",
        monitor_inactive_desc: "There are no active tournaments at the moment.",
        go_back: "Go Back",
        version_info: "Lucca Federation Beer Pong \u2022 Live System v3.3",
        update_in: "Update in",
        top_scorers_live: "Live Top Scorers",
        bracket_finale: "Final Bracket",
        finale: "FINAL",
        semi: "SEMI",
        quarti: "QUARTERS",
        ottavi: "ROUND OF 16",
        canestri_tv: "POINTS",
        soffi_tv: "DEFENSIVE",
        page: "Page",
        no_data_available: "No data available",
        complete_tournament: "Complete & Archive",
        confirm_archive: "Confirm Awards",
        archive_desc: "Results will be saved in the Hall of Fame and the tournament will be archived.",
        tournament_winner: "Tournament Champions",
        tournament_mvp: "Most Valuable Player (MVP)",
        tournament_top_scorer: "Top Scorer",
        tournament_defender: "Best Defender",
        view: "View",
        home_leaderboard_desc: "View the all-time aggregated stats, records and player averages.",
        home_hof_desc: "The history of champions. Past winners, MVPs and individual awards.",
        home_tournaments_desc: "Follow brackets and group stages of ongoing events in real time.",
        home_admin_desc: "Manage teams, tournament structure, scoresheets, monitors and archiving.",
        admin_auth_desc: "Protected access. For now you can enter by clicking \u201CLogin\u201D even without a password.",
        admin_password_placeholder: "Password (optional)",
        admin_login: "Login",
        admin_live_management: "Live Management",
        admin_data_management: "Data Management",
        admin_live_desc: "Current tournament (live operations)",
        admin_data_desc: "History / retroactive edits / manual entries",
        admin_tools: "Tools",
        admin_group_manage: "Management",
        admin_group_monitor: "Monitors",
        admin_group_data: "Data",
        admin_select_archived_desc: "Select an archived tournament and apply changes.",
        admin_tv_groups: "TV Groups",
        admin_tv_groups_bracket: "TV Groups+Bracket",
        admin_tv_bracket: "TV Bracket",
        admin_tv_scorers: "TV Scorers",
        admin_set: "Set",
        structure: "Structure",
        reports: "Scoresheets",
        referees: "Referees",
        code_list: "Code List",
        data_management: "Data management",
        alert_fill_team_players: "Fill in Team, Player 1 and Player 2.",
        alert_no_live_teams_copy: "No live teams available to copy.",
        alert_enter_tournament_name: "Enter the tournament name.",
        alert_min_2_teams: "Enter at least 2 teams.",
        alert_archived_created: "Archived tournament created. You can now enter results and awards from the same screen.",
        alert_no_live_selected: "No live tournament selected.",
        alert_select_player: "Select a player.",
        alert_mvp_set: "MVP set.",
        alert_fill_teamname_players: "Fill in Team name, Player 1 and Player 2.",
        alert_export_backup_fail: "Unable to export the backup.",
        alert_backup_restored: "Backup restored.",
        alert_backup_invalid: "Invalid or corrupted backup.",
        alert_popup_blocked: "Popup blocked: enable popups to print.",
        alert_no_bracket_print: "No bracket available to print.",
        alert_import_failed_no_team: "Import failed: no valid team found. Check the column format.",
        alert_import_error: "Import error. Try again with an .xlsx Excel file or a simple CSV.",
        alert_added_duplicate_test: "Added duplicate-name teams for testing (some without year).",
        alert_need_2_teams_generate: "You need at least 2 teams to generate the tournament.",
        alert_generation_error: "Error during generation. Check the parameters.",
        alert_live_started: "Live tournament started successfully!",
        alert_no_live_active: "No live tournament active.",
        alert_no_match_simulable: "No match can be simulated at this time.",
        alert_select_match: "Select a match.",
        alert_report_saved: "Scoresheet saved.",
        alert_saved_propagation: "Saved. (Propagation completed)",
        alert_awards_updated: "Awards updated.",
        alert_year_invalid: "Enter a valid year (4 digits).",
        alert_enter_champion_team: "Enter the champion team name.",
        alert_enter_player_name: "Enter the player's name.",
        alert_no_valid_scorers_rows: "No valid rows found in the file. Expected: Name, Year, Games, Points, Defensive.",
        alert_scorers_import_error: "Scorers import error. Check the file and try again.",
        referees_auth_desc: "Protected access. For now you can enter by clicking \u201CLogin\u201D even without a password.",
        referees_password_placeholder: "Password (optional)",
        referees_login: "Login",
        referees_select_referee: "Select referee",
        referees_select_placeholder: "Choose a name...",
        referees_add_manual: "Add manually",
        referees_add_name_placeholder: "Referee name",
        referees_add_confirm: "Add",
        referees_add_cancel: "Cancel",
        referees_selected: "Selected referee",
        referees_change_referee: "Change referee",
        referees_enter_report_code: "Enter scoresheet code",
        referees_report_code_label: "Scoresheet code",
        referees_report_code_placeholder: "e.g. A12",
        referees_find_code: "Search",
        referees_match_found: "Match found",
        referees_choose_entry: "Entry mode",
        referees_entry_manual: "Manual",
        referees_entry_ocr: "OCR",
        referees_upload_photo: "Upload photo",
        referees_pending_matches: "Matches to report",
        referees_pending_matches_desc: "Pick an upcoming/playing match, or use the code.",
        referees_pick_match: "Select",
        referees_match_list_show_all: "Show all",
        referees_match_list_show_less: "Show less",
        referees_ocr_processing: "OCR processing\u2026",
        referees_ocr_confirm_title: "Confirm OCR data",
        referees_ocr_confirm_desc: "Review and fix extracted data before opening manual entry.",
        referees_ocr_code_label: "Scoresheet code",
        referees_ocr_score_label: "Detected score (helper)",
        referees_ocr_text_label: "OCR text (helper)",
        referees_ocr_apply: "Open manual entry",
        referees_ocr_cancel: "Cancel",
        referees_manual_title: "Manual entry",
        referees_manual_desc: "Enter baskets and defensive for each player. Score is calculated automatically.",
        referees_save_report: "Save scoresheet",
        referees_save_busy: "Saving\u2026",
        referees_ocr_support: "OCR helper",
        referees_clear_ocr_support: "Remove OCR helper",
        alert_tie_not_allowed: "Ties are not allowed: enter tie-break values in player baskets/defensive."
      },
      fr: { federation_name: "F\xE9d. de Lucca", dashboard: "Tableau de Bord", historical: "Classement Historique", hof: "Temple de la Renomm\xE9e", tournaments: "Tournois", admin: "Zone Admin", teams: "\xC9quipes", players: "Joueurs", points: "Points", soffi: "Soffi", winner: "Gagnant", search: "Rechercher...", generate: "G\xE9n\xE9rer", simulate: "Simuler", all_time_stats: "Statistiques Globales", active_now: "EN DIRECT", no_tournament: "Aucun Tournoi Actif", export: "Exporter", back: "Retour", logout: "D\xE9connexion", rank: "Rang", pos: "Pos", games: "Matchs", avg_points: "Moy PT", avg_soffi: "Moy SF", no_players_found: "Aucun joueur trouv\xE9.", pro_mode: "Pro (4+ Matchs)", general_mode: "G\xE9n\xE9ral", search_placeholder: "Chercher joueur...", manual_entry: "Manuel", sim_teams_title: "G\xE9n\xE9rateur de Pool FLBP", num_teams: "Nombre d'\xC9quipes (X)", generate_from_pool: "G\xE9n\xE9rer du Pool 300/600", import_excel: "Importer Excel", subtab_teams: "1. \xC9quipes", subtab_structure: "2. Structure", subtab_referti: "3. Feuilles de Match", subtab_list: "4. Liste des Codes", subtab_monitor: "5. Moniteur Graphique", step_2_config: "\xC9tape 2: Configurer", elimination_mode: "\xC9limination Directe", groups_mode: "Groupes + \xC9limination", groups_label: "Groupes", advancing_label: "Qualifi\xE9s par Groupe", generate_structure: "G\xC9N\xC9RER LA STRUCTURE", start_live: "LANCER LE LIVE", ocr_referto: "OCR Feuille de Match", pts_label: "PT", register_result: "Enregistrer le R\xE9sultat", step_by_step: "Pas \xE0 Pas", instant_sim: "Instantan\xE9", sim_rules: "R\xC8GLES DE SIMULATION", match_list: "Liste des Matchs", monitor_groups: "Moniteur de Groupes", monitor_bracket: "Moniteur de Tableau", add_hof_record: "Ajouter au Temple", type: "Type", year: "Ann\xE9e", tournament_name: "Nom du Tournoi", team_name_optional: "Nom de l'\xC9quipe (optionnel)", players_placeholder: "Joueurs (s\xE9par\xE9s par virgule)", existing_records: "Records Existants", no_hof_records: "Aucun record au Temple de la Renomm\xE9e", winner_plural: "Gagnants", top_scorers_plural: "Meilleurs Buteurs", defenders_plural: "D\xE9fenseurs", mvp_plural: "MVP", titled_players_plural: "Joueurs Titr\xE9s", titles_total: "Titres Totaux", monitor_inactive_title: "Moniteur Inactif", monitor_inactive_desc: "Aucun tournoi actif pour le moment.", go_back: "Retourner", version_info: "F\xE9d. Lucca Beer Pong \u2022 Live System v3.3", update_in: "Mise \xE0 jour dans", top_scorers_live: "Meilleurs Buteurs Live", bracket_finale: "Tableau Final", finale: "FINALE", semi: "DEMI", quarti: "QUARTS", ottavi: "HUITI\xC8MES", canestri_tv: "POINTS", soffi_tv: "DEFENSE", page: "Page", no_data_available: "Aucune donn\xE9e disponible", complete_tournament: "Terminer et Archiver", confirm_archive: "Confirmer les Prix", archive_desc: "Les r\xE9sultats seront sauvegard\xE9s au Temple de la Renomm\xE9e.", tournament_winner: "Champions du Tournoi", tournament_mvp: "Meilleur Joueur (MVP)", tournament_top_scorer: "Meilleur Buteur", tournament_defender: "Meilleur D\xE9fenseur", view: "Voir", home_leaderboard_desc: "Voir les statistiques cumul\xE9es de tous les temps, les records et les moyennes des joueurs.", home_hof_desc: "L\u2019histoire des champions. Vainqueurs pass\xE9s, MVP et r\xE9compenses individuelles.", home_tournaments_desc: "Suivez les tableaux et les groupes des \xE9v\xE9nements en cours en temps r\xE9el.", home_admin_desc: "Gestion des \xE9quipes, structure du tournoi, feuilles de match, moniteurs et archivage.", admin_auth_desc: "Acc\xE8s prot\xE9g\xE9. Pour l\u2019instant, vous pouvez entrer en cliquant sur \xAB Connexion \xBB m\xEAme sans mot de passe.", admin_password_placeholder: "Mot de passe (optionnel)", admin_login: "Connexion", admin_live_management: "Gestion Live", admin_data_management: "Gestion des Donn\xE9es", admin_live_desc: "Tournoi en cours (op\xE9rations live)", admin_data_desc: "Historique / modifications r\xE9troactives / saisies manuelles", admin_select_archived_desc: "S\xE9lectionnez un tournoi archiv\xE9 et appliquez les modifications.", admin_tv_groups: "TV Groupes", admin_tv_groups_bracket: "TV G+T", admin_tv_bracket: "TV Tableau", admin_tv_scorers: "TV Buteurs", admin_set: "D\xE9finir", structure: "Structure", reports: "Feuilles de match", referees: "Arbitres", code_list: "Liste des codes", data_management: "Gestion des donn\xE9es", alert_fill_team_players: "Renseignez l\u2019\xE9quipe, Joueur 1 et Joueur 2.", alert_no_live_teams_copy: "Aucune \xE9quipe live \xE0 copier.", alert_enter_tournament_name: "Saisissez le nom du tournoi.", alert_min_2_teams: "Saisissez au moins 2 \xE9quipes.", alert_archived_created: "Tournoi archiv\xE9 cr\xE9\xE9. Vous pouvez maintenant saisir les r\xE9sultats et les r\xE9compenses depuis le m\xEAme \xE9cran.", alert_no_live_selected: "Aucun tournoi live s\xE9lectionn\xE9.", alert_select_player: "S\xE9lectionnez un joueur.", alert_mvp_set: "MVP d\xE9fini.", alert_fill_teamname_players: "Renseignez le nom de l\u2019\xE9quipe, Joueur 1 et Joueur 2.", alert_export_backup_fail: "Impossible d\u2019exporter la sauvegarde.", alert_backup_restored: "Sauvegarde restaur\xE9e.", alert_backup_invalid: "Sauvegarde invalide ou corrompue.", alert_popup_blocked: "Popup bloqu\xE9 : autorisez les popups pour imprimer.", alert_no_bracket_print: "Aucun tableau disponible \xE0 imprimer.", alert_import_failed_no_team: "Import \xE9chou\xE9 : aucune \xE9quipe valide trouv\xE9e. V\xE9rifiez le format des colonnes.", alert_import_error: "Erreur d\u2019import. R\xE9essayez avec un fichier Excel .xlsx ou un CSV simple.", alert_added_duplicate_test: "\xC9quipes homonymes ajout\xE9es pour test (certaines sans ann\xE9e).", alert_need_2_teams_generate: "Il faut au moins 2 \xE9quipes pour g\xE9n\xE9rer le tournoi.", alert_generation_error: "Erreur lors de la g\xE9n\xE9ration. V\xE9rifiez les param\xE8tres.", alert_live_started: "Tournoi live lanc\xE9 avec succ\xE8s !", alert_no_live_active: "Aucun tournoi live actif.", alert_no_match_simulable: "Aucun match simulable pour le moment.", alert_select_match: "S\xE9lectionnez un match.", alert_report_saved: "Feuille de match enregistr\xE9e.", alert_saved_propagation: "Enregistr\xE9. (Propagation termin\xE9e)", alert_awards_updated: "R\xE9compenses mises \xE0 jour.", alert_year_invalid: "Saisissez une ann\xE9e valide (4 chiffres).", alert_enter_champion_team: "Saisissez le nom de l\u2019\xE9quipe championne.", alert_enter_player_name: "Saisissez le nom du joueur.", alert_no_valid_scorers_rows: "Aucune ligne valide trouv\xE9e dans le fichier. Attendu : Nom, Ann\xE9e, Matchs, Points, D\xE9fense.", alert_scorers_import_error: "Erreur d\u2019import des buteurs. V\xE9rifiez le fichier et r\xE9essayez." },
      de: { federation_name: "Lucca Verband", dashboard: "Dashboard", historical: "Historische Rangliste", hof: "Ruhmeshalle", tournaments: "Turniere", admin: "Admin-Bereich", teams: "Teams", players: "Spieler", points: "Punkte", soffi: "Soffi", winner: "Gewinner", search: "Suche...", generate: "Generieren", simulate: "Simulieren", all_time_stats: "Gesamtstatistik", active_now: "JETZT LIVE", no_tournament: "Kein aktives Turnier", export: "Exportieren", back: "Zur\xFCck", logout: "Abmelden", rank: "Rang", pos: "Pos", games: "Spiele", avg_points: "Schnitt PT", avg_soffi: "Schnitt SF", no_players_found: "Keine Spieler gefunden.", pro_mode: "Pro (4+ Spiele)", general_mode: "Allgemein", search_placeholder: "Spieler suchen...", manual_entry: "Manuell", sim_teams_title: "FLBP Pool-Generator", num_teams: "Anzahl Teams (X)", generate_from_pool: "Aus Pool 300/600 generieren", import_excel: "Excel Import", subtab_teams: "1. Teams", subtab_structure: "2. Struktur", subtab_referti: "3. Spielberichte", subtab_list: "4. Codeliste", subtab_monitor: "5. Monitor", step_2_config: "Schritt 2: Konfiguration", elimination_mode: "Direktes Ausscheiden", groups_mode: "Gruppen + Ausscheiden", groups_label: "Gruppen", advancing_label: "Qualifizierte pro Gruppe", generate_structure: "STRUKTUR GENERIEREN", start_live: "LIVE STARTEN", ocr_referto: "OCR Spielbericht", pts_label: "PT", register_result: "Ergebnis eintragen", step_by_step: "Schritt f\xFCr Schritt", instant_sim: "Sofort", sim_rules: "SIMULATIONSREGELN", match_list: "Spielliste", monitor_groups: "Gruppen-Monitor", monitor_bracket: "Turnierplan-Monitor", add_hof_record: "Ruhmeshalle-Eintrag", type: "Type", year: "Jahr", tournament_name: "Turniername", team_name_optional: "Teamname (optional)", players_placeholder: "Spieler (mit Komma getrennt)", existing_records: "Eintr\xE4ge", no_hof_records: "Keine Eintr\xE4ge in der Ruhmeshalle", winner_plural: "Gewinner", top_scorers_plural: "Torsch\xFCtzenk\xF6nige", defenders_plural: "Verteidiger", mvp_plural: "MVP", titled_players_plural: "Titeltr\xE4ger", titles_total: "Gesamttitel", monitor_inactive_title: "Monitor Inaktiv", monitor_inactive_desc: "Derzeit sind keine aktiven Turniere vorhanden.", go_back: "Zur\xFCckgehen", version_info: "Lucca Beer Pong Verband \u2022 Live System v3.3", update_in: "Aktualisierung in", top_scorers_live: "Live Torsch\xFCtzen", bracket_finale: "Finalrunde", finale: "FINALE", semi: "HALBFINALE", quarti: "VIERTELFINALE", ottavi: "ACHTELFINALE", canestri_tv: "PUNKTE", soffi_tv: "ABWEHR", page: "Seite", no_data_available: "Keine Daten verf\xFCgbar", complete_tournament: "Abschlie\xDFen & Archivieren", confirm_archive: "Ehrungen best\xE4tigen", archive_desc: "Ergebnisse werden in der Ruhmeshalle gespeichert.", tournament_winner: "Turniersieger", tournament_mvp: "MVP", tournament_top_scorer: "Bester Torsch\xFCtze", tournament_defender: "Bester Verteidiger", view: "Ansehen", home_leaderboard_desc: "Sieh dir die Allzeit-Statistiken, Rekorde und Spieler-Durchschnitte an.", home_hof_desc: "Die Geschichte der Champions. Fr\xFChere Sieger, MVPs und individuelle Auszeichnungen.", home_tournaments_desc: "Verfolge K.-o.-Runde und Gruppenphasen laufender Events in Echtzeit.", home_admin_desc: "Teams, Turnierstruktur, Spielberichte, Monitore und Archivierung verwalten.", admin_auth_desc: "Gesch\xFCtzter Zugriff. Vorerst kannst du auch ohne Passwort \xFCber \u201EAnmelden\u201C hinein.", admin_password_placeholder: "Passwort (optional)", admin_login: "Anmelden", admin_live_management: "Live-Verwaltung", admin_data_management: "Datenverwaltung", admin_live_desc: "Aktuelles Turnier (Live-Betrieb)", admin_data_desc: "Historie / nachtr\xE4gliche \xC4nderungen / manuelle Eintr\xE4ge", admin_select_archived_desc: "W\xE4hle ein archiviertes Turnier aus und wende \xC4nderungen an.", admin_tv_groups: "TV Gruppen", admin_tv_groups_bracket: "TV G+T", admin_tv_bracket: "TV Turnierplan", admin_tv_scorers: "TV Scorer", admin_set: "Setzen", structure: "Struktur", reports: "Spielberichte", referees: "Schiedsrichter", code_list: "Codeliste", data_management: "Datenverwaltung", alert_fill_team_players: "Team, Spieler 1 und Spieler 2 ausf\xFCllen.", alert_no_live_teams_copy: "Keine Live-Teams zum Kopieren verf\xFCgbar.", alert_enter_tournament_name: "Turniernamen eingeben.", alert_min_2_teams: "Mindestens 2 Teams eingeben.", alert_archived_created: "Archiviertes Turnier erstellt. Ergebnisse und Ehrungen k\xF6nnen jetzt im selben Bildschirm eingetragen werden.", alert_no_live_selected: "Kein Live-Turnier ausgew\xE4hlt.", alert_select_player: "Spieler ausw\xE4hlen.", alert_mvp_set: "MVP gesetzt.", alert_fill_teamname_players: "Teamname, Spieler 1 und Spieler 2 ausf\xFCllen.", alert_export_backup_fail: "Backup kann nicht exportiert werden.", alert_backup_restored: "Backup wiederhergestellt.", alert_backup_invalid: "Backup ung\xFCltig oder besch\xE4digt.", alert_popup_blocked: "Popup blockiert: Popups zum Drucken erlauben.", alert_no_bracket_print: "Kein Turnierplan zum Drucken verf\xFCgbar.", alert_import_failed_no_team: "Import fehlgeschlagen: kein g\xFCltiges Team gefunden. Spaltenformat pr\xFCfen.", alert_import_error: "Importfehler. Bitte mit einer .xlsx-Datei oder einem einfachen CSV erneut versuchen.", alert_added_duplicate_test: "Teams mit gleichen Namen f\xFCr Tests hinzugef\xFCgt (einige ohne Jahr).", alert_need_2_teams_generate: "Zum Generieren werden mindestens 2 Teams ben\xF6tigt.", alert_generation_error: "Fehler bei der Generierung. Parameter pr\xFCfen.", alert_live_started: "Live-Turnier erfolgreich gestartet!", alert_no_live_active: "Kein Live-Turnier aktiv.", alert_no_match_simulable: "Derzeit kann kein Match simuliert werden.", alert_select_match: "Match ausw\xE4hlen.", alert_report_saved: "Spielbericht gespeichert.", alert_saved_propagation: "Gespeichert. (Propagation abgeschlossen)", alert_awards_updated: "Ehrungen aktualisiert.", alert_year_invalid: "G\xFCltiges Jahr eingeben (4 Ziffern).", alert_enter_champion_team: "Name des Champion-Teams eingeben.", alert_enter_player_name: "Spielername eingeben.", alert_no_valid_scorers_rows: "Keine g\xFCltigen Zeilen im File gefunden. Erwartet: Name, Jahr, Spiele, Punkte, Abwehr.", alert_scorers_import_error: "Scorer-Importfehler. Datei pr\xFCfen und erneut versuchen." },
      es: { federation_name: "Fed. Lucense", dashboard: "Panel", historical: "Clasificaci\xF3n Hist\xF3rica", hof: "Sal\xF3n de la Fama", tournaments: "Torneos", admin: "\xC1rea Admin", teams: "Equipos", players: "Jugadores", points: "Puntos", soffi: "Soffi", winner: "Ganador", search: "Buscar...", generate: "Generar", simulate: "Simular", all_time_stats: "Estad\xEDsticas Hist\xF3ricas", active_now: "EN VIVO", no_tournament: "Sin Torneo Activo", export: "Exportar", back: "Atr\xE1s", logout: "Salir", rank: "Rango", pos: "Pos", games: "Partidos", avg_points: "Med PT", avg_soffi: "Med SF", no_players_found: "No se encontraron jugadores.", pro_mode: "Pro (4+ Partidos)", general_mode: "General", search_placeholder: "Buscar jugador o equipo...", manual_entry: "Manual", sim_teams_title: "Generador de Pool FLBP", num_teams: "N\xFAmero de Equipos (X)", generate_from_pool: "Generar de Pool 300/600", import_excel: "Importar Excel", subtab_teams: "1. Equipos", subtab_structure: "2. Estructura", subtab_referti: "3. Actas", subtab_list: "4. Lista de C\xF3digos", subtab_monitor: "5. Monitor Gr\xE1fico", step_2_config: "Paso 2: Configurar", elimination_mode: "Eliminaci\xF3n Directa", groups_mode: "Grupos + Eliminaci\xF3n", groups_label: "Grupos", advancing_label: "Clasificados por Grupo", generate_structure: "GENERAR ESTRUCTURA", start_live: "INICIAR VIVO", ocr_referto: "OCR Acta", pts_label: "PT", register_result: "Registrar Resultado", step_by_step: "Paso a Paso", instant_sim: "Instant\xE1neo", sim_rules: "REGLAS DE SIMULACI\xD3N", match_list: "Lista de Partidos", monitor_groups: "Monitor de Grupos", monitor_bracket: "Monitor de Cuadro", add_hof_record: "A\xF1adir al Sal\xF3n", type: "Tipo", year: "A\xF1o", tournament_name: "Nombre del Torneo", team_name_optional: "Nombre del Equipo (opcional)", players_placeholder: "Jugadores (separados por coma)", existing_records: "Registros Existentes", no_hof_records: "No hay registros en el Sal\xF3n de la Fama", winner_plural: "Ganadores", top_scorers_plural: "M\xE1ximos Goleadores", defenders_plural: "Defensores", mvp_plural: "MVP", titled_players_plural: "Jugadores Titulados", titles_total: "T\xEDtulos Totales", monitor_inactive_title: "Monitor Inactivo", monitor_inactive_desc: "No hay torneos activos en este momento.", go_back: "Volver", version_info: "Fed. Lucca Beer Pong \u2022 Live System v3.3", update_in: "Actualizaci\xF3n en", top_scorers_live: "Goleadores en Vivo", bracket_finale: "Cuadro Final", finale: "FINAL", semi: "SEMI", quarti: "CUARTOS", ottavi: "OCTAVOS", canestri_tv: "PUNTOS", soffi_tv: "DEFENSA", page: "P\xE1gina", no_data_available: "No hay datos disponibles", complete_tournament: "Completar y Archivar", confirm_archive: "Confirmar Premios", archive_desc: "Los resultados se guardar\xE1n en el Sal\xF3n de la Fama.", tournament_winner: "Campeones del Torneo", tournament_mvp: "MVP", tournament_top_scorer: "M\xE1ximo Goleador", tournament_defender: "Mejor Defensor", view: "Ver", home_leaderboard_desc: "Ver estad\xEDsticas hist\xF3ricas agregadas, r\xE9cords y promedios de jugadores.", home_hof_desc: "La historia de los campeones. Ganadores pasados, MVP y premios individuales.", home_tournaments_desc: "Sigue cuadros y grupos de eventos en curso en tiempo real.", home_admin_desc: "Gesti\xF3n de equipos, estructura del torneo, actas, monitores y archivado.", admin_auth_desc: "Acceso protegido. Por ahora puedes entrar haciendo clic en \xABAcceder\xBB incluso sin contrase\xF1a.", admin_password_placeholder: "Contrase\xF1a (opcional)", admin_login: "Acceder", admin_live_management: "Gesti\xF3n en vivo", admin_data_management: "Gesti\xF3n de datos", admin_live_desc: "Torneo en curso (operativa en vivo)", admin_data_desc: "Historial / cambios retroactivos / inserciones manuales", admin_select_archived_desc: "Selecciona un torneo archivado y aplica los cambios.", admin_tv_groups: "TV Grupos", admin_tv_groups_bracket: "TV G+Cuadro", admin_tv_bracket: "TV Cuadro", admin_tv_scorers: "TV Goleadores", admin_set: "Establecer", structure: "Estructura", reports: "Actas", referees: "\xC1rbitros", code_list: "Lista de c\xF3digos", data_management: "Gesti\xF3n de datos", alert_fill_team_players: "Completa Equipo, Jugador 1 y Jugador 2.", alert_no_live_teams_copy: "No hay equipos en vivo para copiar.", alert_enter_tournament_name: "Introduce el nombre del torneo.", alert_min_2_teams: "Introduce al menos 2 equipos.", alert_archived_created: "Torneo archivado creado. Ahora puedes introducir resultados y premios desde la misma pantalla.", alert_no_live_selected: "No hay torneo en vivo seleccionado.", alert_select_player: "Selecciona un jugador.", alert_mvp_set: "MVP establecido.", alert_fill_teamname_players: "Completa Nombre del equipo, Jugador 1 y Jugador 2.", alert_export_backup_fail: "No se pudo exportar la copia de seguridad.", alert_backup_restored: "Copia de seguridad restaurada.", alert_backup_invalid: "Copia de seguridad inv\xE1lida o corrupta.", alert_popup_blocked: "Popup bloqueado: habilita las ventanas emergentes para imprimir.", alert_no_bracket_print: "No hay cuadro disponible para imprimir.", alert_import_failed_no_team: "Importaci\xF3n fallida: no se encontr\xF3 ning\xFAn equipo v\xE1lido. Revisa el formato de columnas.", alert_import_error: "Error de importaci\xF3n. Int\xE9ntalo de nuevo con un Excel .xlsx o un CSV simple.", alert_added_duplicate_test: "Se a\xF1adieron equipos con nombres duplicados para prueba (algunos sin a\xF1o).", alert_need_2_teams_generate: "Se necesitan al menos 2 equipos para generar el torneo.", alert_generation_error: "Error durante la generaci\xF3n. Revisa los par\xE1metros.", alert_live_started: "\xA1Torneo en vivo iniciado correctamente!", alert_no_live_active: "No hay torneo en vivo activo.", alert_no_match_simulable: "No hay partidos simulables en este momento.", alert_select_match: "Selecciona un partido.", alert_report_saved: "Acta guardada.", alert_saved_propagation: "Guardado. (Propagaci\xF3n completada)", alert_awards_updated: "Premios actualizados.", alert_year_invalid: "Introduce un a\xF1o v\xE1lido (4 d\xEDgitos).", alert_enter_champion_team: "Introduce el nombre del equipo campe\xF3n.", alert_enter_player_name: "Introduce el nombre del jugador.", alert_no_valid_scorers_rows: "No se encontraron filas v\xE1lidas en el archivo. Se espera: Nombre, A\xF1o, Partidos, Puntos, Defensa.", alert_scorers_import_error: "Error al importar goleadores. Verifica el archivo y reintenta." },
      pt: { federation_name: "Fed. de Lucca", dashboard: "Painel", historical: "Classifica\xE7\xE3o Hist\xF3rica", hof: "Galeria da Fama", tournaments: "Torneios", admin: "\xC1rea Admin", teams: "Equipes", players: "Jogadores", points: "Pontos", soffi: "Soffi", winner: "Vencedor", search: "Buscar...", generate: "Gerar", simulate: "Simular", all_time_stats: "Estat\xEDsticas Gerais", active_now: "AO VIVO", no_tournament: "Nenhum Torneio Ativo", export: "Exportar", back: "Voltar", logout: "Sair", rank: "Rank", pos: "Pos", games: "Jogos", avg_points: "M\xE9d PT", avg_soffi: "M\xE9d SF", no_players_found: "Nenhum jogador trovato.", pro_mode: "Pro (4+ Jogos)", general_mode: "Geral", search_placeholder: "Buscar jogador ou equipe...", manual_entry: "Manual", sim_teams_title: "Gerador de Pool FLBP", num_teams: "N\xFAmero de Equipes (X)", generate_from_pool: "Gerar de Pool 300/600", import_excel: "Importar Excel", subtab_teams: "1. Equipes", subtab_structure: "2. Estrutura", subtab_referti: "3. S\xFAmulas", subtab_list: "4. Lista de C\xF3digos", subtab_monitor: "5. Monitor Gr\xE1fico", step_2_config: "Passo 2: Configurar", elimination_mode: "Elimina\xE7\xE3o Direta", groups_mode: "Grupos + Elimina\xE7\xE3o", groups_label: "Grupos", advancing_label: "Classificados por Grupo", generate_structure: "GERAR ESTRUTURA", start_live: "INICIAR VIVO", ocr_referto: "OCR S\xFAmula", pts_label: "PT", register_result: "Registrar Resultado", step_by_step: "Passo a Passo", instant_sim: "Instant\xE2neo", sim_rules: "REGRAS DE SIMULA\xC7\xC3O", match_list: "Lista de Jogos", monitor_groups: "Monitor de Grupos", monitor_bracket: "Monitor de Chave", add_hof_record: "Adicionar \xE0 Galeria", type: "Tipo", year: "Ano", tournament_name: "Nome do Torneio", team_name_optional: "Nome da Equipe (opcional)", players_placeholder: "Jogadores (separados por v\xEDrgula)", existing_records: "Registros Existentes", no_hof_records: "Nenhum registro na Galeria da Fama", winner_plural: "Vencedores", top_scorers_plural: "Artilheiros", defenders_plural: "Defensores", mvp_plural: "MVP", titled_players_plural: "Jogadores Titulados", titles_total: "T\xEDtulos Totais", monitor_inactive_title: "Monitor Inativo", monitor_inactive_desc: "N\xE3o h\xE1 torneios ativos no momento.", go_back: "Voltar", version_info: "Fed. Lucca Beer Pong \u2022 Live System v3.3", update_in: "Atualiza\xE7\xE3o em", top_scorers_live: "Artilheiros ao Vivo", bracket_finale: "Chave Final", finale: "FINAL", semi: "SEMI", quarti: "QUARTAS", ottavi: "OITAVAS", canestri_tv: "PONTOS", soffi_tv: "DEFESA", page: "P\xE1gina", no_data_available: "Nenhum dado dispon\xEDvel", complete_tournament: "Completar e Arquivar", confirm_archive: "Confirmar Pr\xEAmios", archive_desc: "Os resultados ser\xE3o salvos na Galeria da Fama.", tournament_winner: "Campe\xF5es do Torneio", tournament_mvp: "MVP", tournament_top_scorer: "Melhor Marcador", tournament_defender: "Melhor Defensor", view: "Ver", home_leaderboard_desc: "Veja estat\xEDsticas agregadas de todos os tempos, recordes e m\xE9dias dos jogadores.", home_hof_desc: "A hist\xF3ria dos campe\xF5es. Vencedores anteriores, MVP e pr\xEAmios individuais.", home_tournaments_desc: "Acompanhe quadros e grupos de eventos em andamento em tempo real.", home_admin_desc: "Gest\xE3o de equipes, estrutura do torneio, s\xFAmulas, monitores e arquivamento.", admin_auth_desc: "Acesso protegido. Por enquanto voc\xEA pode entrar clicando em \u201CEntrar\u201D mesmo sem senha.", admin_password_placeholder: "Senha (opcional)", admin_login: "Entrar", admin_live_management: "Gest\xE3o ao vivo", admin_data_management: "Gest\xE3o de dados", admin_live_desc: "Torneio atual (opera\xE7\xE3o ao vivo)", admin_data_desc: "Hist\xF3rico / edi\xE7\xF5es retroativas / inser\xE7\xF5es manuais", admin_select_archived_desc: "Selecione um torneio arquivado e aplique as altera\xE7\xF5es.", admin_tv_groups: "TV Grupos", admin_tv_groups_bracket: "TV G+Chave", admin_tv_bracket: "TV Chave", admin_tv_scorers: "TV Artilheiros", admin_set: "Definir", structure: "Estrutura", reports: "S\xFAmulas", referees: "\xC1rbitros", code_list: "Lista de c\xF3digos", data_management: "Gest\xE3o de dados", alert_fill_team_players: "Preencha Equipe, Jogador 1 e Jogador 2.", alert_no_live_teams_copy: "Nenhuma equipe ao vivo dispon\xEDvel para copiar.", alert_enter_tournament_name: "Insira o nome do torneio.", alert_min_2_teams: "Insira pelo menos 2 equipes.", alert_archived_created: "Torneio arquivado criado. Agora voc\xEA pode inserir resultados e pr\xEAmios na mesma tela.", alert_no_live_selected: "Nenhum torneio ao vivo selecionado.", alert_select_player: "Selecione um jogador.", alert_mvp_set: "MVP definido.", alert_fill_teamname_players: "Preencha Nome da equipe, Jogador 1 e Jogador 2.", alert_export_backup_fail: "N\xE3o foi poss\xEDvel exportar o backup.", alert_backup_restored: "Backup restaurado.", alert_backup_invalid: "Backup inv\xE1lido ou corrompido.", alert_popup_blocked: "Popup bloqueado: habilite pop-ups para imprimir.", alert_no_bracket_print: "Nenhuma chave dispon\xEDvel para imprimir.", alert_import_failed_no_team: "Importa\xE7\xE3o falhou: nenhuma equipe v\xE1lida encontrada. Verifique o formato das colunas.", alert_import_error: "Erro ao importar. Tente novamente com um Excel .xlsx ou um CSV simples.", alert_added_duplicate_test: "Equipes com nomes iguais adicionadas para teste (algumas sem ano).", alert_need_2_teams_generate: "S\xE3o necess\xE1rias pelo menos 2 equipes para gerar o torneio.", alert_generation_error: "Erro durante a gera\xE7\xE3o. Verifique os par\xE2metros.", alert_live_started: "Torneio ao vivo iniciado com sucesso!", alert_no_live_active: "Nenhum torneio ao vivo ativo.", alert_no_match_simulable: "Nenhuma partida pode ser simulada no momento.", alert_select_match: "Selecione uma partida.", alert_report_saved: "S\xFAmula salva.", alert_saved_propagation: "Salvo. (Propaga\xE7\xE3o conclu\xEDda)", alert_awards_updated: "Pr\xEAmios atualizados.", alert_year_invalid: "Insira um ano v\xE1lido (4 d\xEDgitos).", alert_enter_champion_team: "Insira o nome da equipe campe\xE3.", alert_enter_player_name: "Insira o nome do jogador.", alert_no_valid_scorers_rows: "Nenhuma linha v\xE1lida encontrada no arquivo. Esperado: Nome, Ano, Jogos, Pontos, Defesa.", alert_scorers_import_error: "Erro ao importar artilheiros. Verifique o arquivo e tente novamente." },
      pl: { federation_name: "Fed. Lucca", dashboard: "Panel", historical: "Ranking Historyczny", hof: "Galeria S\u0142aw", tournaments: "Turnieje", admin: "Panel Admina", teams: "Zespo\u0142y", players: "Gracze", points: "Punkty", soffi: "Soffi", winner: "Zwyci\u0119zca", search: "Szukaj...", generate: "Generuj", simulate: "Symuluj", all_time_stats: "Statystyki Og\xF3lne", active_now: "NA \u017BYWO", no_tournament: "Brak Aktywnego Turnieju", export: "Eksportuj", back: "Wstecz", logout: "Wyloguj", rank: "Ranking", pos: "Poz", games: "Gry", avg_points: "\u015Ared PT", avg_soffi: "\u015Ared SF", no_players_found: "Nie znaleziono graczy.", pro_mode: "Pro (4+ Gry)", general_mode: "Og\xF3lne", search_placeholder: "Szukaj gracza lub zespo\u0142u...", manual_entry: "R\u0119cznie", sim_teams_title: "Generator FLBP", num_teams: "Liczba Zespo\u0142\xF3w (X)", generate_from_pool: "Generuj z Pool 300/600", import_excel: "Import Excel", subtab_teams: "1. Zespo\u0142y", subtab_structure: "2. Struktura", subtab_referti: "3. Protoko\u0142y", subtab_list: "4. Lista Kod\xF3w", subtab_monitor: "5. Monitor Graficzny", step_2_config: "Krok 2: Konfiguracja", elimination_mode: "Pucharowa", groups_mode: "Grupy + Pucharowa", groups_label: "Grupy", advancing_label: "Miejsca w Grupie", generate_structure: "GENERUJ STRUKTUR\u0118", start_live: "URUCHOM LIVE", ocr_referto: "OCR Protoko\u0142u", pts_label: "PT", register_result: "Zapisz Wynik", step_by_step: "Krok po Kroku", instant_sim: "Natychmiast", sim_rules: "ZASADY SYMULACJI", match_list: "Lista Mecz\xF3w", monitor_groups: "Monitor Grup", monitor_bracket: "Monitor Drabinki", add_hof_record: "Dodaj do Galerii", type: "Typ", year: "Rok", tournament_name: "Nazwa Turnieju", team_name_optional: "Nazwa Zespo\u0142u (opcjonalnie)", players_placeholder: "Gracze (oddzieleni przecinkiem)", existing_records: "Istniej\u0105ce Rekordy", no_hof_records: "Brak rekord\xF3w w Galerii S\u0142aw", winner_plural: "Zwyci\u0119zcy", top_scorers_plural: "Kr\xF3l Strzelc\xF3w", defenders_plural: "Obro\u0144cy", mvp_plural: "MVP", titled_players_plural: "Utytu\u0142owani Gracze", titles_total: "Suma Tytu\u0142\xF3w", monitor_inactive_title: "Monitor Nieaktywny", monitor_inactive_desc: "Obecnie nie ma aktywnych turniej\xF3w.", go_back: "Wr\xF3\u0107", version_info: "Fed. Lucca Beer Pong \u2022 Live System v3.3", update_in: "Aktualizacja za", top_scorers_live: "Kr\xF3l Strzelc\xF3w Live", bracket_finale: "Drabinka Fina\u0142owa", finale: "FINA\u0141", semi: "P\xD3\u0141FINA\u0141", quarti: "\u0106WIER\u0106FINA\u0141", ottavi: "1/8 FINA\u0141U", canestri_tv: "PUNKTY", soffi_tv: "OBRONA", page: "Strona", no_data_available: "Brak danych", complete_tournament: "Zako\u0144cz i Archiwizuj", confirm_archive: "Potwierd\u017A Nagrody", archive_desc: "Wyniki zostan\u0105 zapisane w Galerii S\u0142aw.", tournament_winner: "Mistrzowie Turnieju", tournament_mvp: "MVP", tournament_top_scorer: "Kr\xF3l Strzelc\xF3w", tournament_defender: "Najlepszy Obro\u0144ca", view: "Widok", home_leaderboard_desc: "Zobacz statystyki wszech czas\xF3w, rekordy i \u015Brednie zawodnik\xF3w.", home_hof_desc: "Historia mistrz\xF3w. Poprzedni zwyci\u0119zcy, MVP i nagrody indywidualne.", home_tournaments_desc: "\u015Aled\u017A drabink\u0119 i faz\u0119 grupow\u0105 trwaj\u0105cych wydarze\u0144 w czasie rzeczywistym.", home_admin_desc: "Zarz\u0105dzanie dru\u017Cynami, struktur\u0105 turnieju, protoko\u0142ami, monitorami i archiwizacj\u0105.", admin_auth_desc: "Dost\u0119p chroniony. Na razie mo\u017Cesz wej\u015B\u0107 klikaj\u0105c \u201EZaloguj\u201D nawet bez has\u0142a.", admin_password_placeholder: "Has\u0142o (opcjonalne)", admin_login: "Zaloguj", admin_live_management: "Zarz\u0105dzanie na \u017Cywo", admin_data_management: "Zarz\u0105dzanie danymi", admin_live_desc: "Bie\u017C\u0105cy turniej (obs\u0142uga na \u017Cywo)", admin_data_desc: "Historia / zmiany wsteczne / wpisy r\u0119czne", admin_select_archived_desc: "Wybierz zarchiwizowany turniej i zastosuj zmiany.", admin_tv_groups: "TV Grupy", admin_tv_groups_bracket: "TV G+Drabinka", admin_tv_bracket: "TV Drabinka", admin_tv_scorers: "TV Strzelcy", admin_set: "Ustaw", structure: "Struktura", reports: "Protoko\u0142y", referees: "S\u0119dziowie", code_list: "Lista kod\xF3w", data_management: "Zarz\u0105dzanie danymi", alert_fill_team_players: "Uzupe\u0142nij Dru\u017Cyn\u0119, Gracza 1 i Gracza 2.", alert_no_live_teams_copy: "Brak dru\u017Cyn na \u017Cywo do skopiowania.", alert_enter_tournament_name: "Wpisz nazw\u0119 turnieju.", alert_min_2_teams: "Wpisz co najmniej 2 dru\u017Cyny.", alert_archived_created: "Utworzono zarchiwizowany turniej. Teraz mo\u017Cesz wprowadzi\u0107 wyniki i nagrody z tego samego ekranu.", alert_no_live_selected: "Nie wybrano turnieju na \u017Cywo.", alert_select_player: "Wybierz zawodnika.", alert_mvp_set: "Ustawiono MVP.", alert_fill_teamname_players: "Uzupe\u0142nij nazw\u0119 dru\u017Cyny, Gracza 1 i Gracza 2.", alert_export_backup_fail: "Nie mo\u017Cna wyeksportowa\u0107 kopii zapasowej.", alert_backup_restored: "Przywr\xF3cono kopi\u0119 zapasow\u0105.", alert_backup_invalid: "Nieprawid\u0142owa lub uszkodzona kopia zapasowa.", alert_popup_blocked: "Zablokowano okno: w\u0142\u0105cz wyskakuj\u0105ce okna, aby drukowa\u0107.", alert_no_bracket_print: "Brak drabinki do wydruku.", alert_import_failed_no_team: "Import nieudany: nie znaleziono poprawnej dru\u017Cyny. Sprawd\u017A format kolumn.", alert_import_error: "B\u0142\u0105d importu. Spr\xF3buj ponownie z plikiem Excel .xlsx lub prostym CSV.", alert_added_duplicate_test: "Dodano dru\u017Cyny o tych samych nazwach do test\xF3w (niekt\xF3re bez roku).", alert_need_2_teams_generate: "Do wygenerowania turnieju potrzebne s\u0105 co najmniej 2 dru\u017Cyny.", alert_generation_error: "B\u0142\u0105d podczas generowania. Sprawd\u017A parametry.", alert_live_started: "Turniej na \u017Cywo uruchomiony pomy\u015Blnie!", alert_no_live_active: "Brak aktywnego turnieju na \u017Cywo.", alert_no_match_simulable: "W tej chwili nie mo\u017Cna zasymulowa\u0107 meczu.", alert_select_match: "Wybierz mecz.", alert_report_saved: "Protok\xF3\u0142 zapisany.", alert_saved_propagation: "Zapisano. (Propagacja zako\u0144czona)", alert_awards_updated: "Nagrody zaktualizowane.", alert_year_invalid: "Wpisz poprawny rok (4 cyfry).", alert_enter_champion_team: "Wpisz nazw\u0119 dru\u017Cyny mistrz\xF3w.", alert_enter_player_name: "Wpisz imi\u0119 i nazwisko zawodnika.", alert_no_valid_scorers_rows: "Nie znaleziono poprawnych wierszy w pliku. Oczekiwano: Imi\u0119, Rok, Mecze, Punkty, Obrona.", alert_scorers_import_error: "B\u0142\u0105d importu strzelc\xF3w. Sprawd\u017A plik i spr\xF3buj ponownie." },
      zh: { federation_name: "\u5362\u5361\u8054\u5408\u4F1A", dashboard: "\u4EEA\u8868\u677F", historical: "\u5386\u53F2\u6392\u884C\u699C", hof: "\u540D\u4EBA\u5802", tournaments: "\u9526\u6807\u8D5B", admin: "\u7BA1\u7406\u533A", teams: "\u961F\u4F0D", players: "\u9009\u624B", points: "\u5F97\u5206", soffi: "\u9632\u5FA1", winner: "\u83B7\u80DC\u8005", search: "\u641C\u7D22...", generate: "\u751F\u6210", simulate: "\u6A21\u62DF", all_time_stats: "\u5386\u53F2\u7EDF\u8BA1", active_now: "\u6B63\u5728\u76F4\u64AD", no_tournament: "\u6CA1\u6709\u8FDB\u884C\u7684\u9526\u6807\u8D5B", export: "\u5BFC\u51FA", back: "\u8FD4\u56DE", logout: "\u767B\u51FA", rank: "\u6392\u540D", pos: "\u4F4D\u7F6E", games: "\u573A\u6B21", avg_points: "\u573A\u5747\u5F97\u5206", avg_soffi: "\u573A\u5747\u9632\u5FA1", no_players_found: "\u672A\u627E\u5230\u9009\u624B\u3002", pro_mode: "\u4E13\u4E1A (4\u573A\u4EE5\u4E0A)", general_mode: "\u5E38\u89C4", search_placeholder: "\u641C\u7D22\u9009\u624B\u6216\u961F\u4F0D...", manual_entry: "\u624B\u52A8\u8F93\u5165", sim_teams_title: "FLBP \u7403\u961F\u751F\u6210\u5668", num_teams: "\u7403\u961F\u6570\u91CF (X)", generate_from_pool: "\u4ECE 300/600 \u6C60\u4E2D\u751F\u6210", import_excel: "\u5BFC\u5165 Excel", subtab_teams: "1. \u961F\u4F0D", subtab_structure: "2. \u7ED3\u6784", subtab_referti: "3. \u8BB0\u5206\u8868", subtab_list: "4. \u4EE3\u7801\u8868", subtab_monitor: "5. \u56FE\u5F62\u76D1\u63A7", step_2_config: "\u7B2C\u4E8C\u6B65\uFF1A\u914D\u7F6E", elimination_mode: "\u5355\u8D25\u6DD8\u6C70", groups_mode: "\u5C0F\u7EC4 + \u6DD8\u6C70", groups_label: "\u5C0F\u7EC4", advancing_label: "\u5C0F\u7EC4\u664B\u7EA7\u540D\u989D", generate_structure: "\u751F\u6210\u7ED3\u6784", start_live: "\u5F00\u59CB\u76F4\u64AD", ocr_referto: "OCR \u8BC6\u522B\u8BB0\u5206\u8868", pts_label: "\u5206", register_result: "\u767B\u8BB0\u7ED3\u679C", step_by_step: "\u9010\u6B65\u6A21\u62DF", instant_sim: "\u5373\u65F6\u6A21\u62DF", sim_rules: "\u6A21\u62DF\u89C4\u5219", match_list: "\u6BD4\u8D5B\u5217\u8868", monitor_groups: "\u5C0F\u7EC4\u76D1\u63A7", monitor_bracket: "\u5BF9\u9635\u76D1\u63A7", add_hof_record: "\u6DFB\u52A0\u540D\u4EBA\u5802\u8BB0\u5F55", type: "\u7C7B\u578B", year: "\u5E74\u5EA6", tournament_name: "\u9526\u6807\u8D5B\u540D\u79F0", team_name_optional: "\u961F\u540D (\u53EF\u9009)", players_placeholder: "\u9009\u624B (\u9017\u53F7\u5206\u9694)", existing_records: "\u73B0\u6709\u8BB0\u5F55", no_hof_records: "\u540D\u4EBA\u5802\u4E2D\u6CA1\u6709\u4FDD\u5B58\u7684\u8BB0\u5F55", winner_plural: "\u83B7\u80DC\u8005", top_scorers_plural: "\u5F97\u5206\u738B", defenders_plural: "\u9632\u5B88\u4E13\u5BB6", mvp_plural: "\u6700\u6709\u4EF7\u503C\u7403\u5458", titled_players_plural: "\u83B7\u5956\u9009\u624B", titles_total: "\u603B\u5934\u8854", monitor_inactive_title: "\u76D1\u63A7\u672A\u542F\u7528", monitor_inactive_desc: "\u76EE\u524D\u6CA1\u6709\u6B63\u5728\u8FDB\u884C\u7684\u9526\u6807\u8D5B\u3002", go_back: "\u8FD4\u56DE", version_info: "\u5362\u5361\u5564\u9152\u4E52\u4E53\u8054\u5408\u4F1A \u2022 \u76F4\u64AD\u7CFB\u7EDF v3.3", update_in: "\u66F4\u65B0\u5012\u8BA1\u65F6", top_scorers_live: "\u76F4\u64AD\u5B9E\u65F6\u5F97\u5206\u738B", bracket_finale: "\u5BF9\u9635\u56FE", finale: "\u51B3\u8D5B", semi: "\u534A\u51B3\u8D5B", quarti: "\u56DB\u5206\u4E4B\u4E00\u51B3\u8D5B", ottavi: "\u516B\u5206\u4E4B\u4E00\u51B3\u8D5B", canestri_tv: "\u5F97\u5206", soffi_tv: "\u9632\u5FA1", page: "\u9875\u7801", no_data_available: "\u6682\u65E0\u6570\u636E", complete_tournament: "\u5B8C\u6210\u5E76\u5F52\u6863", confirm_archive: "\u786E\u8BA4\u5956\u9879", archive_desc: "\u7ED3\u679C\u5C06\u4FDD\u5B58\u5728\u540D\u4EBA\u5802\u4E2D\u3002", tournament_winner: "\u9526\u6807\u8D5B\u51A0\u519B", tournament_mvp: "\u6700\u6709\u4EF7\u503C\u7403\u5458 (MVP)", tournament_top_scorer: "\u5F97\u5206\u738B", tournament_defender: "\u6700\u4F73\u9632\u5B88\u8005", view: "\u67E5\u770B", home_leaderboard_desc: "\u67E5\u770B\u5386\u53F2\u6C47\u603B\u6570\u636E\u3001\u7EAA\u5F55\u4E0E\u7403\u5458\u5E73\u5747\u503C\u3002", home_hof_desc: "\u51A0\u519B\u5386\u53F2\uFF1A\u5386\u5C4A\u83B7\u80DC\u8005\u3001MVP \u4E0E\u4E2A\u4EBA\u5956\u9879\u3002", home_tournaments_desc: "\u5B9E\u65F6\u67E5\u770B\u6B63\u5728\u8FDB\u884C\u7684\u8D5B\u4E8B\u5206\u7EC4\u4E0E\u6DD8\u6C70\u8D5B\u3002", home_admin_desc: "\u7BA1\u7406\u961F\u4F0D\u3001\u8D5B\u5236\u7ED3\u6784\u3001\u8BB0\u5206\u8868\u3001\u76D1\u89C6\u5668\u4E0E\u5F52\u6863\u3002", admin_auth_desc: "\u53D7\u4FDD\u62A4\u8BBF\u95EE\u3002\u5F53\u524D\u53EF\u76F4\u63A5\u70B9\u51FB\u201C\u767B\u5F55\u201D\u8FDB\u5165\uFF08\u65E0\u9700\u5BC6\u7801\uFF09\u3002", admin_password_placeholder: "\u5BC6\u7801\uFF08\u53EF\u9009\uFF09", admin_login: "\u767B\u5F55", admin_live_management: "\u73B0\u573A\u7BA1\u7406", admin_data_management: "\u6570\u636E\u7BA1\u7406", admin_live_desc: "\u5F53\u524D\u8D5B\u4E8B\uFF08\u73B0\u573A\u64CD\u4F5C\uFF09", admin_data_desc: "\u5386\u53F2 / \u8FFD\u6EAF\u4FEE\u6539 / \u624B\u52A8\u5F55\u5165", admin_select_archived_desc: "\u9009\u62E9\u5DF2\u5F52\u6863\u7684\u8D5B\u4E8B\u5E76\u5E94\u7528\u4FEE\u6539\u3002", admin_tv_groups: "TV \u5206\u7EC4", admin_tv_groups_bracket: "TV \u5206\u7EC4+\u6DD8\u6C70", admin_tv_bracket: "TV \u6DD8\u6C70\u8D5B", admin_tv_scorers: "TV \u5F97\u5206\u699C", admin_set: "\u8BBE\u7F6E", structure: "\u7ED3\u6784", reports: "\u8BB0\u5206\u8868", referees: "\u88C1\u5224", code_list: "\u4EE3\u7801\u5217\u8868", data_management: "\u6570\u636E\u7BA1\u7406", alert_fill_team_players: "\u8BF7\u586B\u5199\u961F\u4F0D\u3001\u7403\u54581\u548C\u7403\u54582\u3002", alert_no_live_teams_copy: "\u6CA1\u6709\u53EF\u590D\u5236\u7684\u73B0\u573A\u961F\u4F0D\u3002", alert_enter_tournament_name: "\u8BF7\u8F93\u5165\u8D5B\u4E8B\u540D\u79F0\u3002", alert_min_2_teams: "\u8BF7\u81F3\u5C11\u8F93\u51652\u652F\u961F\u4F0D\u3002", alert_archived_created: "\u5DF2\u521B\u5EFA\u5F52\u6863\u8D5B\u4E8B\u3002\u73B0\u5728\u53EF\u5728\u540C\u4E00\u9875\u9762\u5F55\u5165\u7ED3\u679C\u4E0E\u5956\u9879\u3002", alert_no_live_selected: "\u672A\u9009\u62E9\u73B0\u573A\u8D5B\u4E8B\u3002", alert_select_player: "\u8BF7\u9009\u62E9\u7403\u5458\u3002", alert_mvp_set: "\u5DF2\u8BBE\u7F6E MVP\u3002", alert_fill_teamname_players: "\u8BF7\u586B\u5199\u961F\u4F0D\u540D\u79F0\u3001\u7403\u54581\u548C\u7403\u54582\u3002", alert_export_backup_fail: "\u65E0\u6CD5\u5BFC\u51FA\u5907\u4EFD\u3002", alert_backup_restored: "\u5907\u4EFD\u5DF2\u6062\u590D\u3002", alert_backup_invalid: "\u5907\u4EFD\u65E0\u6548\u6216\u5DF2\u635F\u574F\u3002", alert_popup_blocked: "\u5F39\u7A97\u88AB\u62E6\u622A\uFF1A\u8BF7\u5141\u8BB8\u5F39\u7A97\u4EE5\u4FBF\u6253\u5370\u3002", alert_no_bracket_print: "\u6CA1\u6709\u53EF\u6253\u5370\u7684\u6DD8\u6C70\u8D5B\u8868\u3002", alert_import_failed_no_team: "\u5BFC\u5165\u5931\u8D25\uFF1A\u672A\u627E\u5230\u6709\u6548\u961F\u4F0D\u3002\u8BF7\u68C0\u67E5\u5217\u683C\u5F0F\u3002", alert_import_error: "\u5BFC\u5165\u51FA\u9519\u3002\u8BF7\u4F7F\u7528 .xlsx \u6216\u7B80\u5355 CSV \u91CD\u8BD5\u3002", alert_added_duplicate_test: "\u5DF2\u6DFB\u52A0\u540C\u540D\u961F\u4F0D\u7528\u4E8E\u6D4B\u8BD5\uFF08\u90E8\u5206\u65E0\u5E74\u4EFD\uFF09\u3002", alert_need_2_teams_generate: "\u751F\u6210\u8D5B\u4E8B\u81F3\u5C11\u9700\u89812\u652F\u961F\u4F0D\u3002", alert_generation_error: "\u751F\u6210\u51FA\u9519\u3002\u8BF7\u68C0\u67E5\u53C2\u6570\u3002", alert_live_started: "\u73B0\u573A\u8D5B\u4E8B\u5DF2\u6210\u529F\u542F\u52A8\uFF01", alert_no_live_active: "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u73B0\u573A\u8D5B\u4E8B\u3002", alert_no_match_simulable: "\u5F53\u524D\u6CA1\u6709\u53EF\u6A21\u62DF\u7684\u6BD4\u8D5B\u3002", alert_select_match: "\u8BF7\u9009\u62E9\u4E00\u573A\u6BD4\u8D5B\u3002", alert_report_saved: "\u8BB0\u5206\u8868\u5DF2\u4FDD\u5B58\u3002", alert_saved_propagation: "\u5DF2\u4FDD\u5B58\u3002\uFF08\u4F20\u64AD\u5B8C\u6210\uFF09", alert_awards_updated: "\u5956\u9879\u5DF2\u66F4\u65B0\u3002", alert_year_invalid: "\u8BF7\u8F93\u5165\u6709\u6548\u5E74\u4EFD\uFF084\u4F4D\uFF09\u3002", alert_enter_champion_team: "\u8BF7\u8F93\u5165\u51A0\u519B\u961F\u4F0D\u540D\u79F0\u3002", alert_enter_player_name: "\u8BF7\u8F93\u5165\u7403\u5458\u59D3\u540D\u3002", alert_no_valid_scorers_rows: "\u6587\u4EF6\u4E2D\u6CA1\u6709\u6709\u6548\u884C\u3002\u5E94\u5305\u542B\uFF1A\u59D3\u540D\u3001\u5E74\u4EFD\u3001\u573A\u6B21\u3001\u5F97\u5206\u3001\u9632\u5B88\u3002", alert_scorers_import_error: "\u5F97\u5206\u699C\u5BFC\u5165\u9519\u8BEF\u3002\u8BF7\u68C0\u67E5\u6587\u4EF6\u5E76\u91CD\u8BD5\u3002" },
      ja: { federation_name: "\u30EB\u30C3\u30AB\u9023\u76DF", dashboard: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9", historical: "\u6B74\u53F2\u7684\u30E9\u30F3\u30AD\u30F3\u30B0", hof: "\u6BBF\u5802", tournaments: "\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8", admin: "\u7BA1\u7406\u30A8\u30EA\u30A2", teams: "\u30C1\u30FC\u30E0", players: "\u30D7\u30EC\u30A4\u30E4\u30FC", points: "\u30DD\u30A4\u30F3\u30C8", soffi: "\u30C7\u30A3\u30D5\u30A7\u30F3\u30B9", winner: "\u52DD\u8005", search: "\u691C\u7D22...", generate: "\u751F\u6210", simulate: "\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3", all_time_stats: "\u5168\u7D71\u8A08", active_now: "\u30E9\u30A4\u30D6\u4E2D", no_tournament: "\u9032\u884C\u4E2D\u306E\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8\u306F\u3042\u308A\u307E\u305B\u3093", export: "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8", back: "\u623B\u308B", logout: "\u30ED\u30B0\u30A2\u30A6\u30C8", rank: "\u30E9\u30F3\u30AF", pos: "\u9806\u4F4D", games: "\u8A66\u5408\u6570", avg_points: "\u5E73\u5747 PT", avg_soffi: "\u5E73\u5747 SF", no_players_found: "\u30D7\u30EC\u30A4\u30E4\u30FC\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002", pro_mode: "\u30D7\u30ED (4\u8A66\u5408\u4EE5\u4E0A)", general_mode: "\u4E00\u822C", search_placeholder: "\u9078\u624B\u307E\u305F\u306F\u30C1\u30FC\u30E0\u3092\u691C\u7D22...", manual_entry: "\u624B\u52D5\u5165\u529B", sim_teams_title: "FLBP \u30D7\u30FC\u30EB\u751F\u6210\u5668", num_teams: "\u30C1\u30FC\u30E0\u6570 (X)", generate_from_pool: "300/600\u30D7\u30FC\u30EB\u304B\u3089\u751F\u6210", import_excel: "Excel\u30A4\u30F3\u30DD\u30FC\u30C8", subtab_teams: "1. \u30C1\u30FC\u30E0", subtab_structure: "2. \u69CB\u6210", subtab_referti: "3. \u8A66\u5408\u8A18\u9332", subtab_list: "4. \u30B3\u30FC\u30C9\u4E00\u89A7", subtab_monitor: "5. \u30E2\u30CB\u30BF\u30FC", step_2_config: "\u30B9\u30C6\u30C3\u30D72: \u8A2D\u5B9A", elimination_mode: "\u52DD\u3061\u629C\u304D\u6226", groups_mode: "\u4E88\u9078 + \u52DD\u3061\u629C\u304D", groups_label: "\u30B0\u30EB\u30FC\u30D7", advancing_label: "\u30B0\u30EB\u30FC\u30D7\u901A\u904E\u6570", generate_structure: "\u69CB\u6210\u3092\u751F\u6210", start_live: "\u30E9\u30A4\u30D6\u958B\u59CB", ocr_referto: "\u8A18\u9332\u3092OCR\u3067\u8AAD\u307F\u53D6\u308B", pts_label: "\u70B9", register_result: "\u7D50\u679C\u3092\u767B\u9332", step_by_step: "\u30B9\u30C6\u30C3\u30D7\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3", instant_sim: "\u5373\u6642\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3", sim_rules: "\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u30EB\u30FC\u30EB", match_list: "\u8A66\u5408\u4E00\u89A7", monitor_groups: "\u30B0\u30EB\u30FC\u30D7\u30E2\u30CB\u30BF\u30FC", monitor_bracket: "\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8\u8868\u30E2\u30CB\u30BF\u30FC", add_hof_record: "\u6BBF\u5802\u5165\u308A\u3092\u8FFD\u52A0", type: "\u30BF\u30A4\u30D7", year: "\u5E74", tournament_name: "\u5927\u4F1A\u540D", team_name_optional: "\u30C1\u30FC\u30E0\u540D (\u4EFB\u610F)", players_placeholder: "\u9078\u624B\u540D (\u30AB\u30F3\u30DE\u533A\u5207\u308A)", existing_records: "\u767B\u9332\u6E08\u307F\u30EC\u30B3\u30FC\u30C9", no_hof_records: "\u6BBF\u5802\u306B\u8A18\u9332\u306F\u3042\u308A\u307E\u305B\u3093", winner_plural: "\u512A\u52DD\u8005", top_scorers_plural: "\u5F97\u70B9\u738B", defenders_plural: "\u6700\u512A\u79C0\u5B88\u5099", mvp_plural: "MVP", titled_players_plural: "\u30BF\u30A4\u30C8\u30EB\u4FDD\u6301\u8005", titles_total: "\u901A\u7B97\u30BF\u30A4\u30C8\u30EB\u6570", monitor_inactive_title: "\u30E2\u30CB\u30BF\u30FC\u505C\u6B62\u4E2D", monitor_inactive_desc: "\u73FE\u5728\u3001\u30A2\u30AF\u30C6\u30A3\u30D6\u306A\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8\u306F\u3042\u308A\u307E\u305B\u3093\u3002", go_back: "\u623B\u308B", version_info: "\u30EB\u30C3\u30AB\u30FB\u30D3\u30A2\u30DD\u30F3\u9023\u76DF \u2022 \u30E9\u30A4\u30D6\u30B7\u30B9\u30C6\u30E0 v3.3", update_in: "\u66F4\u65B0\u307E\u3067", top_scorers_live: "\u30E9\u30A4\u30D6\u5F97\u70B9\u738B", bracket_finale: "\u6C7A\u52DD\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8", finale: "\u6C7A\u52DD", semi: "\u6E96\u6C7A\u52DD", quarti: "\u6E96\u3005\u6C7A\u52DD", ottavi: "1\u56DE\u6226", canestri_tv: "\u30DD\u30A4\u30F3\u30C8", soffi_tv: "\u30C7\u30A3\u30D5\u30A7\u30F3\u30B9", page: "\u30DA\u30FC\u30B8", no_data_available: "\u30C7\u30FC\u30BF\u306A\u3057", complete_tournament: "\u5B8C\u4E86\u3057\u3066\u30A2\u30FC\u30AB\u30A4\u30D6", confirm_archive: "\u8868\u5F70\u306E\u78BA\u8A8D", archive_desc: "\u7D50\u679C\u306F\u6BBF\u5802\u306B\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002", tournament_winner: "\u5927\u4F1A\u512A\u52DD\u30C1\u30FC\u30E0", tournament_mvp: "\u6700\u512A\u79C0\u9078\u624B (MVP)", tournament_top_scorer: "\u5F97\u70B9\u738B", tournament_defender: "\u6700\u512A\u79C0\u5B88\u5099", view: "\u8868\u793A", home_leaderboard_desc: "\u901A\u7B97\u306E\u96C6\u8A08\u7D71\u8A08\u3001\u8A18\u9332\u3001\u5E73\u5747\u5024\u3092\u8868\u793A\u3057\u307E\u3059\u3002", home_hof_desc: "\u30C1\u30E3\u30F3\u30D4\u30AA\u30F3\u306E\u6B74\u53F2\u3002\u904E\u53BB\u306E\u512A\u52DD\u8005\u3001MVP\u3001\u500B\u4EBA\u8CDE\u3002", home_tournaments_desc: "\u9032\u884C\u4E2D\u30A4\u30D9\u30F3\u30C8\u306E\u30B0\u30EB\u30FC\u30D7\u3068\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8\u3092\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u3067\u78BA\u8A8D\u3002", home_admin_desc: "\u30C1\u30FC\u30E0\u3001\u69CB\u6210\u3001\u8A66\u5408\u8A18\u9332\u3001\u30E2\u30CB\u30BF\u30FC\u3001\u30A2\u30FC\u30AB\u30A4\u30D6\u3092\u7BA1\u7406\u3057\u307E\u3059\u3002", admin_auth_desc: "\u4FDD\u8B77\u3055\u308C\u305F\u30A2\u30AF\u30BB\u30B9\u3002\u73FE\u5728\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u306A\u3057\u3067\u3082\u300C\u30ED\u30B0\u30A4\u30F3\u300D\u3067\u5165\u308C\u307E\u3059\u3002", admin_password_placeholder: "\u30D1\u30B9\u30EF\u30FC\u30C9\uFF08\u4EFB\u610F\uFF09", admin_login: "\u30ED\u30B0\u30A4\u30F3", admin_live_management: "\u30E9\u30A4\u30D6\u7BA1\u7406", admin_data_management: "\u30C7\u30FC\u30BF\u7BA1\u7406", admin_live_desc: "\u73FE\u5728\u306E\u5927\u4F1A\uFF08\u30E9\u30A4\u30D6\u904B\u7528\uFF09", admin_data_desc: "\u5C65\u6B74 / \u9061\u53CA\u7DE8\u96C6 / \u624B\u52D5\u767B\u9332", admin_select_archived_desc: "\u30A2\u30FC\u30AB\u30A4\u30D6\u6E08\u307F\u5927\u4F1A\u3092\u9078\u629E\u3057\u3066\u5909\u66F4\u3092\u9069\u7528\u3057\u307E\u3059\u3002", admin_tv_groups: "TV \u30B0\u30EB\u30FC\u30D7", admin_tv_groups_bracket: "TV G+T", admin_tv_bracket: "TV \u30C8\u30FC\u30CA\u30E1\u30F3\u30C8", admin_tv_scorers: "TV \u5F97\u70B9", admin_set: "\u8A2D\u5B9A", structure: "\u69CB\u6210", reports: "\u8A66\u5408\u8A18\u9332", referees: "\u5BE9\u5224", code_list: "\u30B3\u30FC\u30C9\u4E00\u89A7", data_management: "\u30C7\u30FC\u30BF\u7BA1\u7406", alert_fill_team_players: "\u30C1\u30FC\u30E0\u3001\u9078\u624B1\u3001\u9078\u624B2\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_no_live_teams_copy: "\u30B3\u30D4\u30FC\u3067\u304D\u308B\u30E9\u30A4\u30D6\u30C1\u30FC\u30E0\u304C\u3042\u308A\u307E\u305B\u3093\u3002", alert_enter_tournament_name: "\u5927\u4F1A\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_min_2_teams: "\u5C11\u306A\u304F\u3068\u30822\u30C1\u30FC\u30E0\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_archived_created: "\u30A2\u30FC\u30AB\u30A4\u30D6\u5927\u4F1A\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F\u3002\u540C\u3058\u753B\u9762\u3067\u7D50\u679C\u3068\u8868\u5F70\u3092\u5165\u529B\u3067\u304D\u307E\u3059\u3002", alert_no_live_selected: "\u30E9\u30A4\u30D6\u5927\u4F1A\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", alert_select_player: "\u9078\u624B\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_mvp_set: "MVP \u3092\u8A2D\u5B9A\u3057\u307E\u3057\u305F\u3002", alert_fill_teamname_players: "\u30C1\u30FC\u30E0\u540D\u3001\u9078\u624B1\u3001\u9078\u624B2\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_export_backup_fail: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3067\u304D\u307E\u305B\u3093\u3002", alert_backup_restored: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3092\u5FA9\u5143\u3057\u307E\u3057\u305F\u3002", alert_backup_invalid: "\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u304C\u7121\u52B9\u307E\u305F\u306F\u7834\u640D\u3057\u3066\u3044\u307E\u3059\u3002", alert_popup_blocked: "\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u304C\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u307E\u3057\u305F\uFF1A\u5370\u5237\u306E\u305F\u3081\u306B\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_no_bracket_print: "\u5370\u5237\u3067\u304D\u308B\u30C8\u30FC\u30CA\u30E1\u30F3\u30C8\u8868\u304C\u3042\u308A\u307E\u305B\u3093\u3002", alert_import_failed_no_team: "\u30A4\u30F3\u30DD\u30FC\u30C8\u5931\u6557\uFF1A\u6709\u52B9\u306A\u30C1\u30FC\u30E0\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u5217\u5F62\u5F0F\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_import_error: "\u30A4\u30F3\u30DD\u30FC\u30C8\u30A8\u30E9\u30FC\u3002.xlsx \u307E\u305F\u306F\u7C21\u5358\u306A CSV \u3067\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_added_duplicate_test: "\u30C6\u30B9\u30C8\u7528\u306B\u540C\u540D\u30C1\u30FC\u30E0\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\uFF08\u5E74\u306A\u3057\u3042\u308A\uFF09\u3002", alert_need_2_teams_generate: "\u5927\u4F1A\u751F\u6210\u306B\u306F\u5C11\u306A\u304F\u3068\u30822\u30C1\u30FC\u30E0\u304C\u5FC5\u8981\u3067\u3059\u3002", alert_generation_error: "\u751F\u6210\u4E2D\u306B\u30A8\u30E9\u30FC\u3002\u30D1\u30E9\u30E1\u30FC\u30BF\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_live_started: "\u30E9\u30A4\u30D6\u5927\u4F1A\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\uFF01", alert_no_live_active: "\u30A2\u30AF\u30C6\u30A3\u30D6\u306A\u30E9\u30A4\u30D6\u5927\u4F1A\u304C\u3042\u308A\u307E\u305B\u3093\u3002", alert_no_match_simulable: "\u73FE\u5728\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u3067\u304D\u308B\u8A66\u5408\u304C\u3042\u308A\u307E\u305B\u3093\u3002", alert_select_match: "\u8A66\u5408\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_report_saved: "\u8A66\u5408\u8A18\u9332\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002", alert_saved_propagation: "\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\uFF08\u4F1D\u64AD\u5B8C\u4E86\uFF09", alert_awards_updated: "\u8868\u5F70\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002", alert_year_invalid: "\u6709\u52B9\u306A\u5E74\uFF084\u6841\uFF09\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_enter_champion_team: "\u512A\u52DD\u30C1\u30FC\u30E0\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_enter_player_name: "\u9078\u624B\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", alert_no_valid_scorers_rows: "\u6709\u52B9\u306A\u884C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u5FC5\u8981\uFF1A\u540D\u524D\u3001\u5E74\u3001\u8A66\u5408\u6570\u3001\u5F97\u70B9\u3001\u5B88\u5099\u3002", alert_scorers_import_error: "\u5F97\u70B9\u30C7\u30FC\u30BF\u306E\u30A4\u30F3\u30DD\u30FC\u30C8\u30A8\u30E9\u30FC\u3002\u30D5\u30A1\u30A4\u30EB\u3092\u78BA\u8A8D\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" },
      ar: { federation_name: "\u0627\u062A\u062D\u0627\u062F \u0644\u0648\u0643\u0627", dashboard: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629", historical: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u062A\u0635\u062F\u0631\u064A\u0646 \u0627\u0644\u062A\u0627\u0631\u064A\u062E\u064A\u0629", hof: "\u0642\u0627\u0639\u0629 \u0627\u0644\u0645\u0634\u0627\u0647\u064A\u0631", tournaments: "\u0627\u0644\u0628\u0637\u0648\u0644\u0627\u062A", admin: "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0645\u0633\u0624\u0648\u0644", teams: "\u0627\u0644\u0641\u0631\u0642", players: "\u0627\u0644\u0644\u0627\u0639\u0628\u0648\u0646", points: "\u0627\u0644\u0646\u0642\u0627\u0637", soffi: "\u0627\u0644\u062F\u0641\u0627\u0639", winner: "\u0627\u0644\u0641\u0627\u0626\u0632", search: "\u0628\u062D\u062B...", generate: "\u0625\u0646\u0634\u0627\u0621", simulate: "\u0645\u062D\u0627\u0643\u0627\u0629", all_time_stats: "\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u062A\u0627\u0631\u064A\u062E\u064A\u0629", active_now: "\u0645\u0628\u0627\u0634\u0631 \u0627\u0644\u0622\u0646", no_tournament: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0637\u0648\u0644\u0629 \u0646\u0634\u0637\u0629", export: "\u062A\u0635\u062F\u064A\u0631", back: "\u0631\u062C\u0648\u0639", logout: "\u062E\u0631\u0648\u062C", rank: "\u0627\u0644\u0631\u062A\u0628\u0629", pos: "\u0627\u0644\u0645\u0631\u0643\u0632", games: "\u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A", avg_points: "\u0645\u0639\u062F\u0644 \u0627\u0644\u0646\u0642\u0627\u0637", avg_soffi: "\u0645\u0639\u062F\u0644 \u0627\u0644\u062F\u0641\u0627\u0639", no_players_found: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0644\u0627\u0639\u0628\u064A\u0646.", pro_mode: "\u0645\u062D\u062A\u0631\u0641 (4+ \u0645\u0628\u0627\u0631\u064A\u0627\u062A)", general_mode: "\u0639\u0627\u0645", search_placeholder: "\u0628\u062D\u062B \u0639\u0646 \u0644\u0627\u0639\u0628 \u0623\u0648 \u0641\u0631\u064A\u0642...", manual_entry: "\u064A\u062F\u0648\u064A", sim_teams_title: "\u0645\u0648\u0644\u062F \u0627\u0644\u0641\u0631\u0642 FLBP", num_teams: "\u0639\u062F\u062F \u0627\u0644\u0641\u0631\u0642 (X)", generate_from_pool: "\u062A\u0648\u0644\u064A\u062F \u0645\u0646 300/600", import_excel: "\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0625\u0643\u0633\u0644", subtab_teams: "1. \u0627\u0644\u0641\u0631\u0642", subtab_structure: "2. \u0627\u0644\u0647\u064A\u0643\u0644", subtab_referti: "3. \u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A", subtab_list: "4. \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0631\u0645\u0648\u0632", subtab_monitor: "5. \u0627\u0644\u0645\u0631\u0627\u0642\u0628 \u0627\u0644\u0645\u0631\u0626\u064A", step_2_config: "\u0627\u0644\u062E\u0637\u0648\u0629 2: \u0627\u0644\u062A\u0643\u0648\u064A\u0646", elimination_mode: "\u062E\u0631\u0648\u062C \u0627\u0644\u0645\u063A\u0644\u0648\u0628", groups_mode: "\u0645\u062C\u0645\u0648\u0639\u0627\u062A + \u062E\u0631\u0648\u062C \u0627\u0644\u0645\u063A\u0644\u0648\u0628", groups_label: "\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A", advancing_label: "\u0627\u0644\u0645\u062A\u0623\u0647\u0644\u0648\u0646 \u0645\u0646 \u0643\u0644 \u0645\u062C\u0645\u0648\u0639\u0629", generate_structure: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0647\u064A\u0643\u0644", start_live: "\u0628\u062F\u0621 \u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631", ocr_referto: "\u0645\u0633\u062D \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629", pts_label: "\u0646\u0642\u0637\u0629", register_result: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0646\u062A\u064A\u062C\u0629", step_by_step: "\u062E\u0637\u0648\u0629 \u0628\u062E\u0637\u0648\u0629", instant_sim: "\u0645\u062D\u0627\u0643\u0627\u0629 \u0641\u0648\u0631\u064A\u0629", sim_rules: "\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0643\u0627\u0629", match_list: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A", monitor_groups: "\u0645\u0631\u0627\u0642\u0628 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A", monitor_bracket: "\u0645\u0631\u0627\u0642\u0628 \u0627\u0644\u062C\u062F\u0648\u0644", add_hof_record: "\u0625\u0636\u0627\u0641\u0629 \u0633\u062C\u0644 \u0644\u0644\u0642\u0627\u0639\u0629", type: "\u0627\u0644\u0646\u0648\u0639", year: "\u0627\u0644\u0633\u0646\u0629", tournament_name: "\u0627\u0633\u0645 \u0627\u0644\u0628\u0637\u0648\u0644\u0629", team_name_optional: "\u0627\u0633\u0645 \u0627\u0644\u0641\u0631\u064A\u0642 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", players_placeholder: "\u0627\u0644\u0644\u0627\u0639\u0628\u0648\u0646 (\u0645\u0641\u0635\u0648\u0644\u0648\u0646 \u0628\u0641\u0627\u0635\u0644\u0629)", existing_records: "\u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0629", no_hof_records: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0633\u062C\u0644\u0627\u062A \u0641\u064A \u0642\u0627\u0639\u0629 \u0627\u0644\u0645\u0634\u0627\u0647\u064A\u0631", winner_plural: "\u0627\u0644\u0641\u0627\u0626\u0632\u0648\u0646", top_scorers_plural: "\u0627\u0644\u0647\u062F\u0627\u0641\u0648\u0646", defenders_plural: "\u0627\u0644\u0645\u062F\u0627\u0641\u0639\u0648\u0646", mvp_plural: "\u0623\u0641\u0636\u0644 \u0644\u0627\u0639\u0628", titled_players_plural: "\u0627\u0644\u0644\u0627\u0639\u0628\u0648\u0646 \u0627\u0644\u0645\u062A\u0648\u062C\u0648\u0646", titles_total: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0623\u0644\u0642\u0627\u0628", monitor_inactive_title: "\u0627\u0644\u0645\u0631\u0627\u0642\u0628 \u063A\u064A\u0631 \u0646\u0634\u0637", monitor_inactive_desc: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0637\u0648\u0644\u0627\u062A \u0646\u0634\u0637\u0629 \u062D\u0627\u0644\u064A\u0627\u064B.", go_back: "\u0631\u062C\u0648\u0639", version_info: "\u0627\u062A\u062D\u0627\u062F \u0644\u0648\u0643\u0627 \u0644\u0644\u0628\u064A\u0631 \u0628\u0648\u0646\u063A \u2022 \u0646\u0638\u0627\u0645 \u0627\u0644\u0628\u062B v3.3", update_in: "\u0627\u0644\u062A\u062D\u062F\u064A\u062B \u062E\u0644\u0627\u0644", top_scorers_live: "\u0627\u0644\u0647\u062F\u0627\u0641\u0648\u0646 \u0645\u0628\u0627\u0634\u0631\u0629", bracket_finale: "\u0627\u0644\u062C\u062F\u0648\u0644 \u0627\u0644\u0646\u0647\u0627\u0626\u064A", finale: "\u0627\u0644\u0646\u0647\u0627\u0626\u064A", semi: "\u0646\u0635\u0641 \u0627\u0644\u0646\u0647\u0627\u0626\u064A", quarti: "\u0631\u0628\u0639 \u0627\u0644\u0646\u0647\u0627\u0626\u064A", ottavi: "\u062B\u0645\u0646 \u0627\u0644\u0646\u0647\u0627\u0626\u064A", canestri_tv: "\u0627\u0644\u0646\u0642\u0627\u0637", soffi_tv: "\u0627\u0644\u062F\u0641\u0627\u0639", page: "\u0635\u0641\u062D\u0629", no_data_available: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u062A\u0627\u062D\u0629", complete_tournament: "\u0625\u0643\u0645\u0627\u0644 \u0648\u0623\u0631\u0634\u0641\u0629", confirm_archive: "\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062C\u0648\u0627\u0626\u0632", archive_desc: "\u0633\u064A\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0641\u064A \u0642\u0627\u0639\u0629 \u0627\u0644\u0645\u0634\u0627\u0647\u064A\u0631.", tournament_winner: "\u0623\u0628\u0637\u0627\u0644 \u0627\u0644\u0628\u0637\u0648\u0644\u0629", tournament_mvp: "\u0623\u0641\u0636\u0644 \u0644\u0627\u0639\u0628 (MVP)", tournament_top_scorer: "\u0627\u0644\u0647\u062F\u0627\u0641", tournament_defender: "\u0623\u0641\u0636\u0644 \u0645\u062F\u0627\u0641\u0639", view: "\u0639\u0631\u0636", home_leaderboard_desc: "\u0639\u0631\u0636 \u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 \u0639\u0628\u0631 \u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0648\u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0648\u0645\u062A\u0648\u0633\u0637\u0627\u062A \u0627\u0644\u0644\u0627\u0639\u0628\u064A\u0646.", home_hof_desc: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0623\u0628\u0637\u0627\u0644: \u0627\u0644\u0641\u0627\u0626\u0632\u0648\u0646 \u0627\u0644\u0633\u0627\u0628\u0642\u0648\u0646 \u0648MVP \u0648\u0627\u0644\u062C\u0648\u0627\u0626\u0632 \u0627\u0644\u0641\u0631\u062F\u064A\u0629.", home_tournaments_desc: "\u062A\u0627\u0628\u0639 \u0627\u0644\u062C\u062F\u0627\u0648\u0644 \u0648\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A \u0644\u0644\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u062C\u0627\u0631\u064A\u0629 \u0645\u0628\u0627\u0634\u0631\u0629.", home_admin_desc: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0641\u0631\u0642 \u0648\u0647\u064A\u0643\u0644 \u0627\u0644\u0628\u0637\u0648\u0644\u0629 \u0648\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A \u0648\u0627\u0644\u0634\u0627\u0634\u0627\u062A \u0648\u0627\u0644\u0623\u0631\u0634\u0641\u0629.", admin_auth_desc: "\u062F\u062E\u0648\u0644 \u0645\u062D\u0645\u064A. \u062D\u0627\u0644\u064A\u0627\u064B \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \xAB\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644\xBB \u062D\u062A\u0649 \u0628\u062F\u0648\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631.", admin_password_placeholder: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", admin_login: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644", admin_live_management: "\u0625\u062F\u0627\u0631\u0629 \u0645\u0628\u0627\u0634\u0631\u0629", admin_data_management: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", admin_live_desc: "\u0627\u0644\u0628\u0637\u0648\u0644\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 (\u062A\u0634\u063A\u064A\u0644 \u0645\u0628\u0627\u0634\u0631)", admin_data_desc: "\u0627\u0644\u0623\u0631\u0634\u064A\u0641 / \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0631\u062C\u0639\u064A\u0629 / \u0625\u062F\u062E\u0627\u0644\u0627\u062A \u064A\u062F\u0648\u064A\u0629", admin_select_archived_desc: "\u0627\u062E\u062A\u0631 \u0628\u0637\u0648\u0644\u0629 \u0645\u0624\u0631\u0634\u0641\u0629 \u0648\u0637\u0628\u0651\u0642 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A.", admin_tv_groups: "TV \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A", admin_tv_groups_bracket: "TV \u0645\u062C\u0645\u0648\u0639\u0627\u062A+\u062C\u062F\u0648\u0644", admin_tv_bracket: "TV \u0627\u0644\u062C\u062F\u0648\u0644", admin_tv_scorers: "TV \u0627\u0644\u0647\u062F\u0627\u0641\u0648\u0646", admin_set: "\u062A\u0639\u064A\u064A\u0646", structure: "\u0627\u0644\u0647\u064A\u0643\u0644", reports: "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A", referees: "\u0627\u0644\u062D\u0643\u0627\u0645", code_list: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0631\u0645\u0648\u0632", data_management: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", alert_fill_team_players: "\u0623\u0643\u0645\u0644 \u0627\u0644\u0641\u0631\u064A\u0642 \u0648\u0627\u0644\u0644\u0627\u0639\u0628 1 \u0648\u0627\u0644\u0644\u0627\u0639\u0628 2.", alert_no_live_teams_copy: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0631\u0642 \u0645\u0628\u0627\u0634\u0631\u0629 \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0646\u0633\u062E.", alert_enter_tournament_name: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u0627\u0644\u0628\u0637\u0648\u0644\u0629.", alert_min_2_teams: "\u0623\u062F\u062E\u0644 \u0641\u0631\u064A\u0642\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", alert_archived_created: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0628\u0637\u0648\u0644\u0629 \u0645\u0624\u0631\u0634\u0641\u0629. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0622\u0646 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0648\u0627\u0644\u062C\u0648\u0627\u0626\u0632 \u0645\u0646 \u0646\u0641\u0633 \u0627\u0644\u0634\u0627\u0634\u0629.", alert_no_live_selected: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u062E\u062A\u064A\u0627\u0631 \u0628\u0637\u0648\u0644\u0629 \u0645\u0628\u0627\u0634\u0631\u0629.", alert_select_player: "\u0627\u062E\u062A\u0631 \u0644\u0627\u0639\u0628\u0627\u064B.", alert_mvp_set: "\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 MVP.", alert_fill_teamname_players: "\u0623\u0643\u0645\u0644 \u0627\u0633\u0645 \u0627\u0644\u0641\u0631\u064A\u0642 \u0648\u0627\u0644\u0644\u0627\u0639\u0628 1 \u0648\u0627\u0644\u0644\u0627\u0639\u0628 2.", alert_export_backup_fail: "\u062A\u0639\u0630\u0631 \u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629.", alert_backup_restored: "\u062A\u0645\u062A \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629.", alert_backup_invalid: "\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629 \u0623\u0648 \u062A\u0627\u0644\u0641\u0629.", alert_popup_blocked: "\u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u0646\u0627\u0641\u0630\u0629 \u0627\u0644\u0645\u0646\u0628\u062B\u0642\u0629: \u0641\u0639\u0651\u0644 \u0627\u0644\u0646\u0648\u0627\u0641\u0630 \u0627\u0644\u0645\u0646\u0628\u062B\u0642\u0629 \u0644\u0644\u0637\u0628\u0627\u0639\u0629.", alert_no_bracket_print: "\u0644\u0627 \u064A\u0648\u062C\u062F \u062C\u062F\u0648\u0644 \u0645\u062A\u0627\u062D \u0644\u0644\u0637\u0628\u0627\u0639\u0629.", alert_import_failed_no_team: "\u0641\u0634\u0644 \u0627\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F: \u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0641\u0631\u064A\u0642 \u0635\u0627\u0644\u062D. \u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u0623\u0639\u0645\u062F\u0629.", alert_import_error: "\u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0645\u0644\u0641 Excel .xlsx \u0623\u0648 CSV \u0628\u0633\u064A\u0637.", alert_added_duplicate_test: "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0641\u0631\u0642 \u0628\u0623\u0633\u0645\u0627\u0621 \u0645\u062A\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0627\u062E\u062A\u0628\u0627\u0631 (\u0628\u0639\u0636\u0647\u0627 \u0628\u062F\u0648\u0646 \u0633\u0646\u0629).", alert_need_2_teams_generate: "\u062A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u0641\u0631\u064A\u0642\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0628\u0637\u0648\u0644\u0629.", alert_generation_error: "\u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0625\u0646\u0634\u0627\u0621. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A.", alert_live_started: "\u062A\u0645 \u0628\u062F\u0621 \u0627\u0644\u0628\u0637\u0648\u0644\u0629 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 \u0628\u0646\u062C\u0627\u062D!", alert_no_live_active: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0637\u0648\u0644\u0629 \u0645\u0628\u0627\u0634\u0631\u0629 \u0646\u0634\u0637\u0629.", alert_no_match_simulable: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0628\u0627\u0631\u0627\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0645\u062D\u0627\u0643\u0627\u0629 \u062D\u0627\u0644\u064A\u0627\u064B.", alert_select_match: "\u0627\u062E\u062A\u0631 \u0645\u0628\u0627\u0631\u0627\u0629.", alert_report_saved: "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u0642\u0631\u064A\u0631.", alert_saved_propagation: "\u062A\u0645 \u0627\u0644\u062D\u0641\u0638. (\u0627\u0643\u062A\u0645\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B)", alert_awards_updated: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062C\u0648\u0627\u0626\u0632.", alert_year_invalid: "\u0623\u062F\u062E\u0644 \u0633\u0646\u0629 \u0635\u062D\u064A\u062D\u0629 (4 \u0623\u0631\u0642\u0627\u0645).", alert_enter_champion_team: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u0641\u0631\u064A\u0642 \u0627\u0644\u0623\u0628\u0637\u0627\u0644.", alert_enter_player_name: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u0627\u0644\u0644\u0627\u0639\u0628.", alert_no_valid_scorers_rows: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0635\u0641\u0648\u0641 \u0635\u0627\u0644\u062D\u0629 \u0641\u064A \u0627\u0644\u0645\u0644\u0641. \u0627\u0644\u0645\u062A\u0648\u0642\u0639: \u0627\u0644\u0627\u0633\u0645\u060C \u0627\u0644\u0633\u0646\u0629\u060C \u0627\u0644\u0645\u0628\u0627\u0631\u064A\u0627\u062A\u060C \u0627\u0644\u0646\u0642\u0627\u0637\u060C \u0627\u0644\u062F\u0641\u0627\u0639.", alert_scorers_import_error: "\u062E\u0637\u0623 \u0641\u064A \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0647\u062F\u0627\u0641\u064A\u0646. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0644\u0641 \u0648\u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629." },
      ru: { federation_name: "\u0424\u0435\u0434\u0435\u0440\u0430\u0446\u0438\u044F \u041B\u0443\u043A\u043A\u0438", dashboard: "\u041F\u0430\u043D\u0435\u043B\u044C", historical: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0440\u0435\u0439\u0442\u0438\u043D\u0433\u0430", hof: "\u0417\u0430\u043B \u0441\u043B\u0430\u0432\u044B", tournaments: "\u0422\u0443\u0440\u043D\u0438\u0440\u044B", admin: "\u0410\u0434\u043C\u0438\u043D-\u0437\u043E\u043D\u0430", teams: "\u041A\u043E\u043C\u0430\u043D\u0434\u044B", players: "\u0418\u0433\u0440\u043E\u043A\u0438", points: "\u041E\u0447\u043A\u0438", soffi: "\u0417\u0430\u0449\u0438\u0442\u0430", winner: "\u041F\u043E\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044C", search: "\u041F\u043E\u0438\u0441\u043A...", generate: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C", simulate: "\u0421\u0438\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C", all_time_stats: "\u041E\u0431\u0449\u0430\u044F \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430", active_now: "\u0412 \u042D\u0424\u0418\u0420\u0415", no_tournament: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0442\u0443\u0440\u043D\u0438\u0440\u043E\u0432", export: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442", back: "\u041D\u0430\u0437\u0430\u0434", logout: "\u0412\u044B\u0445\u043E\u0434", rank: "\u0420\u0430\u043D\u0433", pos: "\u041F\u043E\u0437", games: "\u0418\u0433\u0440\u044B", avg_points: "\u0421\u0440. PT", avg_soffi: "\u0421\u0440. SF", no_players_found: "\u0418\u0433\u0440\u043E\u043A\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B.", pro_mode: "Pro (4+ \u0438\u0433\u0440\u044B)", general_mode: "\u041E\u0431\u0449\u0438\u0439", search_placeholder: "\u041F\u043E\u0438\u0441\u043A \u0438\u0433\u0440\u043E\u043A\u0430 \u0438\u043B\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B...", manual_entry: "\u0412\u0440\u0443\u0447\u043D\u0443\u044E", sim_teams_title: "\u0413\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440 \u043A\u043E\u043C\u0430\u043D\u0434 FLBP", num_teams: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043A\u043E\u043C\u0430\u043D\u0434 (X)", generate_from_pool: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0438\u0437 \u043F\u0443\u043B\u0430 300/600", import_excel: "\u0418\u043C\u043F\u043E\u0440\u0442 Excel", subtab_teams: "1. \u041A\u043E\u043C\u0430\u043D\u0434\u044B", subtab_structure: "2. \u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430", subtab_referti: "3. \u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B", subtab_list: "4. \u0421\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u0434\u043E\u0432", subtab_monitor: "5. \u041C\u043E\u043D\u0438\u0442\u043E\u0440", step_2_config: "\u0428\u0430\u0433 2: \u041A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044F", elimination_mode: "\u041F\u043B\u0435\u0439-\u043E\u0444\u0444", groups_mode: "\u0413\u0440\u0443\u043F\u043F\u044B + \u041F\u043B\u0435\u0439-\u043E\u0444\u0444", groups_label: "\u0413\u0440\u0443\u043F\u043F\u044B", advancing_label: "\u0412\u044B\u0445\u043E\u0434 \u0438\u0437 \u0433\u0440\u0443\u043F\u043F\u044B", generate_structure: "\u0421\u041E\u0417\u0414\u0410\u0422\u042C \u0421\u0422\u0420\u0423\u041A\u0422\u0423\u0420\u0423", start_live: "\u0417\u0410\u041F\u0423\u0421\u0422\u0418\u0422\u042C LIVE", ocr_referto: "OCR \u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430", pts_label: "\u041E\u0427\u041A", register_result: "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442", step_by_step: "\u041F\u043E\u0448\u0430\u0433\u043E\u0432\u043E", instant_sim: "\u041C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E", sim_rules: "\u041F\u0420\u0410\u0412\u0418\u041B\u0410 \u0421\u0418\u041C\u0423\u041B\u042F\u0426\u0418\u0418", match_list: "\u0421\u043F\u0438\u0441\u043E\u043A \u043C\u0430\u0442\u0447\u0435\u0439", monitor_groups: "\u041C\u043E\u043D\u0438\u0442\u043E\u0440 \u0433\u0440\u0443\u043F\u043F", monitor_bracket: "\u041C\u043E\u043D\u0438\u0442\u043E\u0440 \u0441\u0435\u0442\u043A\u0438", add_hof_record: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0417\u0430\u043B \u0441\u043B\u0430\u0432\u044B", type: "\u0422\u0438\u043F", year: "\u0413\u043E\u0434", tournament_name: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u0443\u0440\u043D\u0438\u0440\u0430", team_name_optional: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 (\u043E\u043F\u0446.)", players_placeholder: "\u0418\u0433\u0440\u043E\u043A\u0438 (\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E)", existing_records: "\u0417\u0430\u043F\u0438\u0441\u0438", no_hof_records: "\u0412 \u0417\u0430\u043B\u0435 \u0441\u043B\u0430\u0432\u044B \u043D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439", winner_plural: "\u041F\u043E\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u0438", top_scorers_plural: "\u0411\u043E\u043C\u0431\u0430\u0440\u0434\u0438\u0440\u044B", defenders_plural: "\u0417\u0430\u0449\u0438\u0442\u043D\u0438\u043A\u0438", mvp_plural: "MVP", titled_players_plural: "\u0422\u0438\u0442\u0443\u043B\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0438\u0433\u0440\u043E\u043A\u0438", titles_total: "\u0412\u0441\u0435\u0433\u043E \u0442\u0438\u0442\u0443\u043B\u043E\u0432", monitor_inactive_title: "\u041C\u043E\u043D\u0438\u0442\u043E\u0440 \u043D\u0435\u0430\u043A\u0442\u0438\u0432\u0435\u043D", monitor_inactive_desc: "\u0412 \u0434\u0430\u043D\u043D\u044B\u0439 \u043C\u043E\u043C\u0435\u043D\u0442 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0442\u0443\u0440\u043D\u0438\u0440\u043E\u0432.", go_back: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F", version_info: "\u0424\u0435\u0434\u0435\u0440\u0430\u0446\u0438\u044F \u0411\u0438\u0440-\u043F\u043E\u043D\u0433\u0430 \u041B\u0443\u043A\u043A\u0438 \u2022 Live System v3.3", update_in: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437", top_scorers_live: "\u0411\u043E\u043C\u0431\u0430\u0440\u0434\u0438\u0440\u044B Live", bracket_finale: "\u0424\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0435\u0442\u043A\u0430", finale: "\u0424\u0418\u041D\u0410\u041B", semi: "\u041F\u041E\u041B\u0423\u0424\u0418\u041D\u0410\u041B", quarti: "\u0427\u0415\u0422\u0412\u0415\u0420\u0422\u042C\u0424\u0418\u041D\u0410\u041B", ottavi: "1/8 \u0424\u0418\u041D\u0410\u041B\u0410", canestri_tv: "\u041E\u0427\u041A\u0418", soffi_tv: "\u0417\u0410\u0429\u0418\u0422\u0410", page: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430", no_data_available: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445", complete_tournament: "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0438 \u0410\u0440\u0445\u0438\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C", confirm_archive: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u041D\u0430\u0433\u0440\u0430\u0434\u044B", archive_desc: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0431\u0443\u0434\u0443\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B \u0432 \u0417\u0430\u043B\u0435 \u0421\u043B\u0430\u0432\u044B.", tournament_winner: "\u0427\u0435\u043C\u043F\u0438\u043E\u043D\u044B \u0422\u0443\u0440\u043D\u0438\u0440\u0430", tournament_mvp: "\u041B\u0443\u0447\u0448\u0438\u0439 \u0418\u0433\u0440\u043E\u043A (MVP)", tournament_top_scorer: "\u0411\u043E\u043C\u0431\u0430\u0440\u0434\u0438\u0440", tournament_defender: "\u041B\u0443\u0447\u0448\u0438\u0439 \u0417\u0430\u0449\u0438\u0442\u043D\u0438\u043A", view: "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440", home_leaderboard_desc: "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043E\u0431\u0449\u0435\u0439 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0438, \u0440\u0435\u043A\u043E\u0440\u0434\u043E\u0432 \u0438 \u0441\u0440\u0435\u0434\u043D\u0438\u0445 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439 \u0438\u0433\u0440\u043E\u043A\u043E\u0432.", home_hof_desc: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0447\u0435\u043C\u043F\u0438\u043E\u043D\u043E\u0432. \u041F\u0440\u043E\u0448\u043B\u044B\u0435 \u043F\u043E\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u0438, MVP \u0438 \u0438\u043D\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0433\u0440\u0430\u0434\u044B.", home_tournaments_desc: "\u0421\u043B\u0435\u0434\u0438\u0442\u0435 \u0437\u0430 \u0441\u0435\u0442\u043A\u043E\u0439 \u0438 \u0433\u0440\u0443\u043F\u043F\u0430\u043C\u0438 \u0442\u0435\u043A\u0443\u0449\u0438\u0445 \u0441\u043E\u0431\u044B\u0442\u0438\u0439 \u0432 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u043C \u0432\u0440\u0435\u043C\u0435\u043D\u0438.", home_admin_desc: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0430\u043C\u0438, \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u043E\u0439 \u0442\u0443\u0440\u043D\u0438\u0440\u0430, \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430\u043C\u0438, \u043C\u043E\u043D\u0438\u0442\u043E\u0440\u0430\u043C\u0438 \u0438 \u0430\u0440\u0445\u0438\u0432\u043E\u043C.", admin_auth_desc: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u0449\u0438\u0449\u0451\u043D. \u041F\u043E\u043A\u0430 \u0447\u0442\u043E \u043C\u043E\u0436\u043D\u043E \u0432\u043E\u0439\u0442\u0438, \u043D\u0430\u0436\u0430\u0432 \xAB\u0412\u043E\u0439\u0442\u0438\xBB, \u0434\u0430\u0436\u0435 \u0431\u0435\u0437 \u043F\u0430\u0440\u043E\u043B\u044F.", admin_password_placeholder: "\u041F\u0430\u0440\u043E\u043B\u044C (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)", admin_login: "\u0412\u043E\u0439\u0442\u0438", admin_live_management: "Live-\u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435", admin_data_management: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u043C\u0438", admin_live_desc: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0442\u0443\u0440\u043D\u0438\u0440 (\u0440\u0430\u0431\u043E\u0442\u0430 \u0432\u0436\u0438\u0432\u0443\u044E)", admin_data_desc: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F / \u0440\u0435\u0442\u0440\u043E-\u043F\u0440\u0430\u0432\u043A\u0438 / \u0440\u0443\u0447\u043D\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438", admin_select_archived_desc: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u0440\u0445\u0438\u0432\u043D\u044B\u0439 \u0442\u0443\u0440\u043D\u0438\u0440 \u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F.", admin_tv_groups: "TV \u0413\u0440\u0443\u043F\u043F\u044B", admin_tv_groups_bracket: "TV \u0413+\u0421\u0435\u0442\u043A\u0430", admin_tv_bracket: "TV \u0421\u0435\u0442\u043A\u0430", admin_tv_scorers: "TV \u0411\u043E\u043C\u0431\u0430\u0440\u0434\u0438\u0440\u044B", admin_set: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C", structure: "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430", reports: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B", referees: "\u0421\u0443\u0434\u044C\u0438", code_list: "\u0421\u043F\u0438\u0441\u043E\u043A \u043A\u043E\u0434\u043E\u0432", data_management: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u043C\u0438", alert_fill_team_players: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u041A\u043E\u043C\u0430\u043D\u0434\u0443, \u0418\u0433\u0440\u043E\u043A\u0430 1 \u0438 \u0418\u0433\u0440\u043E\u043A\u0430 2.", alert_no_live_teams_copy: "\u041D\u0435\u0442 live-\u043A\u043E\u043C\u0430\u043D\u0434 \u0434\u043B\u044F \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F.", alert_enter_tournament_name: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u0443\u0440\u043D\u0438\u0440\u0430.", alert_min_2_teams: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043C\u0438\u043D\u0438\u043C\u0443\u043C 2 \u043A\u043E\u043C\u0430\u043D\u0434\u044B.", alert_archived_created: "\u0410\u0440\u0445\u0438\u0432\u043D\u044B\u0439 \u0442\u0443\u0440\u043D\u0438\u0440 \u0441\u043E\u0437\u0434\u0430\u043D. \u0422\u0435\u043F\u0435\u0440\u044C \u043C\u043E\u0436\u043D\u043E \u0432\u0432\u0435\u0441\u0442\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0438 \u043D\u0430\u0433\u0440\u0430\u0434\u044B \u043D\u0430 \u0442\u043E\u043C \u0436\u0435 \u044D\u043A\u0440\u0430\u043D\u0435.", alert_no_live_selected: "Live-\u0442\u0443\u0440\u043D\u0438\u0440 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D.", alert_select_player: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0433\u0440\u043E\u043A\u0430.", alert_mvp_set: "MVP \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D.", alert_fill_teamname_players: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u0418\u0433\u0440\u043E\u043A\u0430 1 \u0438 \u0418\u0433\u0440\u043E\u043A\u0430 2.", alert_export_backup_fail: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u0443\u044E \u043A\u043E\u043F\u0438\u044E.", alert_backup_restored: "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430.", alert_backup_invalid: "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0430.", alert_popup_blocked: "\u0412\u0441\u043F\u043B\u044B\u0432\u0430\u044E\u0449\u0435\u0435 \u043E\u043A\u043D\u043E \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E: \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 pop-up \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438.", alert_no_bracket_print: "\u041D\u0435\u0442 \u0441\u0435\u0442\u043A\u0438 \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438.", alert_import_failed_no_team: "\u0418\u043C\u043F\u043E\u0440\u0442 \u043D\u0435 \u0443\u0434\u0430\u043B\u0441\u044F: \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0439 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u044B. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 \u0441\u0442\u043E\u043B\u0431\u0446\u043E\u0432.", alert_import_error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0441 Excel .xlsx \u0438\u043B\u0438 \u043F\u0440\u043E\u0441\u0442\u044B\u043C CSV.", alert_added_duplicate_test: "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0441 \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u043C\u0438 \u0438\u043C\u0435\u043D\u0430\u043C\u0438 \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u0430 (\u043D\u0435\u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0431\u0435\u0437 \u0433\u043E\u0434\u0430).", alert_need_2_teams_generate: "\u0414\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0442\u0443\u0440\u043D\u0438\u0440\u0430 \u043D\u0443\u0436\u043D\u043E \u043C\u0438\u043D\u0438\u043C\u0443\u043C 2 \u043A\u043E\u043C\u0430\u043D\u0434\u044B.", alert_generation_error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B.", alert_live_started: "Live-\u0442\u0443\u0440\u043D\u0438\u0440 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0437\u0430\u043F\u0443\u0449\u0435\u043D!", alert_no_live_active: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E live-\u0442\u0443\u0440\u043D\u0438\u0440\u0430.", alert_no_match_simulable: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0442 \u043C\u0430\u0442\u0447\u0430 \u0434\u043B\u044F \u0441\u0438\u043C\u0443\u043B\u044F\u0446\u0438\u0438.", alert_select_match: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0442\u0447.", alert_report_saved: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D.", alert_saved_propagation: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E. (\u0420\u0430\u0441\u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E)", alert_awards_updated: "\u041D\u0430\u0433\u0440\u0430\u0434\u044B \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B.", alert_year_invalid: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0433\u043E\u0434 (4 \u0446\u0438\u0444\u0440\u044B).", alert_enter_champion_team: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B-\u0447\u0435\u043C\u043F\u0438\u043E\u043D\u0430.", alert_enter_player_name: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F \u0438\u0433\u0440\u043E\u043A\u0430.", alert_no_valid_scorers_rows: "\u0412 \u0444\u0430\u0439\u043B\u0435 \u043D\u0435\u0442 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0445 \u0441\u0442\u0440\u043E\u043A. \u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F: \u0418\u043C\u044F, \u0413\u043E\u0434, \u0418\u0433\u0440\u044B, \u041E\u0447\u043A\u0438, \u0417\u0430\u0449\u0438\u0442\u0430.", alert_scorers_import_error: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430 \u0431\u043E\u043C\u0431\u0430\u0440\u0434\u0438\u0440\u043E\u0432. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u0430\u0439\u043B \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." },
      tr: { federation_name: "Lucca Federasyonu", dashboard: "Panel", historical: "Ge\xE7mi\u015F S\u0131ralama", hof: "\u015Eeref K\xFCrs\xFCs\xFC", tournaments: "Turnuvalar", admin: "Y\xF6netici Alan\u0131", teams: "Tak\u0131mlar", players: "Oyuncular", points: "Puanlar", soffi: "Soffi", winner: "Kazanan", search: "Ara...", generate: "Olu\u015Ftur", simulate: "Sim\xFCle Et", all_time_stats: "T\xFCm Zamanlar \u0130statistikleri", active_now: "\u015E\u0130MD\u0130 CANLI", no_tournament: "Aktif Turnuva Yok", export: "D\u0131\u015Fa Aktar", back: "Geri", logout: "\xC7\u0131k\u0131\u015F", rank: "Derece", pos: "S\u0131ra", games: "Ma\xE7", avg_points: "Ort PT", avg_soffi: "Ort SF", no_players_found: "Oyuncu bulunamad\u0131.", pro_mode: "Pro (4+ Ma\xE7)", general_mode: "Genel", search_placeholder: "Oyuncu ara...", manual_entry: "Manuel", sim_teams_title: "FLBP Havuz Olu\u015Fturucu", num_teams: "Tak\u0131m Say\u0131s\u0131 (X)", generate_from_pool: "300/600 Havuzundan Olu\u015Ftur", import_excel: "Excel \u0130\xE7e Aktar", subtab_teams: "1. Tak\u0131mlar", subtab_structure: "2. Yap\u0131", subtab_referti: "3. Ma\xE7 Formlar\u0131", subtab_list: "4. Kod Listesi", subtab_monitor: "5. Grafik Monit\xF6r", step_2_config: "Ad\u0131m 2: Yap\u0131land\u0131r", elimination_mode: "Tekli Eleme", groups_mode: "Gruplar + Eleme", groups_label: "Gruplar", advancing_label: "Gruptan \xC7\u0131kanlar", generate_structure: "YAPIYI OLU\u015ETUR", start_live: "CANLIYI BA\u015ELAT", ocr_referto: "Formu OCR ile Tara", pts_label: "PT", register_result: "Sonucu Kaydet", step_by_step: "Ad\u0131m Ad\u0131m", instant_sim: "An\u0131nda", sim_rules: "S\u0130M\xDCLASYON KURALLARI", match_list: "Ma\xE7 Listesi", monitor_groups: "Grup Monit\xF6r\xFC", monitor_bracket: "Turnuva Tablosu Monit\xF6r\xFC", add_hof_record: "\u015Eeref K\xFCrs\xFCs\xFC Kayd\u0131", type: "Type", year: "Y\u0131l", tournament_name: "Turnuva Ad\u0131", team_name_optional: "Tak\u0131m Ad\u0131 (opsiyonel)", players_placeholder: "Oyuncular (virg\xFClle ay\u0131r\u0131n)", existing_records: "Mevcut Kay\u0131tlar", no_hof_records: "\u015Eeref K\xFCrs\xFCs\xFC'nde kay\u0131t yok", winner_plural: "Kazananlar", top_scorers_plural: "Gol Krallar\u0131", defenders_plural: "Savunmac\u0131lar", mvp_plural: "MVP", titled_players_plural: "Unvanl\u0131 Oyuncular", titles_total: "Toplam Unvan", monitor_inactive_title: "Monitor Pasif", monitor_inactive_desc: "\u015Eu anda aktif turnuva bulunmuyor.", go_back: "Geri D\xF6n", version_info: "Lucca Birra Pong Federasyonu \u2022 Canl\u0131 Sistem v3.3", update_in: "G\xFCncelleme", top_scorers_live: "Canl\u0131 Gol Krallar\u0131", bracket_finale: "Final Tablosu", finale: "F\u0130NAL", semi: "YARI F\u0130NAL", quarti: "\xC7EYREK F\u0130NAL", ottavi: "SON 16", canestri_tv: "PUANLAR", soffi_tv: "SAVUNMA", page: "Sayfa", no_data_available: "Veri yok", complete_tournament: "Tamamla e Ar\u015Fivle", confirm_archive: "\xD6d\xFClleri Onayla", archive_desc: "Sonu\xE7lar \u015Eeref K\xFCrs\xFCs\xFC'ne kaydedilecek.", tournament_winner: "Turnuva \u015Eampiyonlar\u0131", tournament_mvp: "MVP", tournament_top_scorer: "Gol Kral\u0131", tournament_defender: "En \u0130yi Savunmac\u0131", view: "G\xF6r\xFCnt\xFCle", home_leaderboard_desc: "T\xFCm zamanlar\u0131n istatistiklerini, rekorlar\u0131 ve oyuncu ortalamalar\u0131n\u0131 g\xF6r\xFCnt\xFCle.", home_hof_desc: "\u015Eampiyonlar\u0131n tarihi. Ge\xE7mi\u015F kazananlar, MVP ve bireysel \xF6d\xFCller.", home_tournaments_desc: "Devam eden etkinliklerin tablolar\u0131n\u0131 ve gruplar\u0131n\u0131 canl\u0131 takip et.", home_admin_desc: "Tak\u0131mlar, turnuva yap\u0131s\u0131, ma\xE7 formlar\u0131, monit\xF6rler ve ar\u015Fivleme y\xF6netimi.", admin_auth_desc: "Korumal\u0131 eri\u015Fim. \u015Eimdilik \u015Fifre olmadan da \u201CGiri\u015F\u201D ile girebilirsin.", admin_password_placeholder: "\u015Eifre (iste\u011Fe ba\u011Fl\u0131)", admin_login: "Giri\u015F", admin_live_management: "Canl\u0131 Y\xF6netim", admin_data_management: "Veri Y\xF6netimi", admin_live_desc: "Mevcut turnuva (canl\u0131 operasyon)", admin_data_desc: "Ge\xE7mi\u015F / geriye d\xF6n\xFCk d\xFCzenleme / manuel giri\u015Fler", admin_select_archived_desc: "Ar\u015Fivlenmi\u015F bir turnuva se\xE7 ve de\u011Fi\u015Fiklikleri uygula.", admin_tv_groups: "TV Gruplar", admin_tv_groups_bracket: "TV G+Tablo", admin_tv_bracket: "TV Tablo", admin_tv_scorers: "TV Skorerler", admin_set: "Ayarla", structure: "Yap\u0131", reports: "Ma\xE7 Formlar\u0131", referees: "Hakemler", code_list: "Kod Listesi", data_management: "Veri y\xF6netimi", alert_fill_team_players: "Tak\u0131m, Oyuncu 1 ve Oyuncu 2 alanlar\u0131n\u0131 doldurun.", alert_no_live_teams_copy: "Kopyalanacak canl\u0131 tak\u0131m yok.", alert_enter_tournament_name: "Turnuva ad\u0131n\u0131 girin.", alert_min_2_teams: "En az 2 tak\u0131m girin.", alert_archived_created: "Ar\u015Fiv turnuvas\u0131 olu\u015Fturuldu. Ayn\u0131 ekrandan sonu\xE7 ve \xF6d\xFCl girebilirsiniz.", alert_no_live_selected: "Canl\u0131 turnuva se\xE7ilmedi.", alert_select_player: "Bir oyuncu se\xE7in.", alert_mvp_set: "MVP ayarland\u0131.", alert_fill_teamname_players: "Tak\u0131m ad\u0131, Oyuncu 1 ve Oyuncu 2 alanlar\u0131n\u0131 doldurun.", alert_export_backup_fail: "Yedek d\u0131\u015Fa aktar\u0131lamad\u0131.", alert_backup_restored: "Yedek geri y\xFCklendi.", alert_backup_invalid: "Yedek ge\xE7ersiz veya bozuk.", alert_popup_blocked: "Popup engellendi: yazd\u0131rmak i\xE7in pop-up'lar\u0131 etkinle\u015Ftirin.", alert_no_bracket_print: "Yazd\u0131r\u0131lacak tablo yok.", alert_import_failed_no_team: "\u0130\xE7e aktarma ba\u015Far\u0131s\u0131z: ge\xE7erli tak\u0131m bulunamad\u0131. S\xFCtun format\u0131n\u0131 kontrol edin.", alert_import_error: "\u0130\xE7e aktarma hatas\u0131. .xlsx veya basit CSV ile tekrar deneyin.", alert_added_duplicate_test: "Test i\xE7in ayn\u0131 isimli tak\u0131mlar eklendi (baz\u0131lar\u0131 y\u0131l olmadan).", alert_need_2_teams_generate: "Turnuva olu\u015Fturmak i\xE7in en az 2 tak\u0131m gerekir.", alert_generation_error: "Olu\u015Fturma s\u0131ras\u0131nda hata. Parametreleri kontrol edin.", alert_live_started: "Canl\u0131 turnuva ba\u015Far\u0131yla ba\u015Flat\u0131ld\u0131!", alert_no_live_active: "Aktif canl\u0131 turnuva yok.", alert_no_match_simulable: "\u015Eu anda sim\xFCle edilecek ma\xE7 yok.", alert_select_match: "Bir ma\xE7 se\xE7in.", alert_report_saved: "Ma\xE7 formu kaydedildi.", alert_saved_propagation: "Kaydedildi. (Yay\u0131l\u0131m tamamland\u0131)", alert_awards_updated: "\xD6d\xFCller g\xFCncellendi.", alert_year_invalid: "Ge\xE7erli bir y\u0131l girin (4 hane).", alert_enter_champion_team: "\u015Eampiyon tak\u0131m ad\u0131n\u0131 girin.", alert_enter_player_name: "Oyuncu ad\u0131n\u0131 girin.", alert_no_valid_scorers_rows: "Dosyada ge\xE7erli sat\u0131r yok. Beklenen: \u0130sim, Y\u0131l, Ma\xE7, Puan, Savunma.", alert_scorers_import_error: "Skorer i\xE7e aktarma hatas\u0131. Dosyay\u0131 kontrol edip tekrar deneyin." }
    };
  }
});

// components/PublicTvShell.tsx
import { Keyboard, MonitorPlay as MonitorPlay2 } from "lucide-react";
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var PublicTvShell;
var init_PublicTvShell = __esm({
  "components/PublicTvShell.tsx"() {
    PublicTvShell = ({ data, logo, children }) => {
      const fallbackLogo = "/flbp_logo_2025.svg";
      const safeLogo = (logo || "").trim() ? logo : fallbackLogo;
      return /* @__PURE__ */ jsx12("div", { className: "fixed inset-0 bg-black flex items-center justify-center overflow-hidden z-50 cursor-none select-none", children: /* @__PURE__ */ jsx12("div", { className: "w-full h-full max-w-[177.78vh] max-h-[56.25vw] aspect-video bg-slate-950 text-white relative shadow-2xl flex flex-col p-[2.5%]", children: /* @__PURE__ */ jsxs12("div", { className: "h-full w-full bg-slate-900 rounded-2xl overflow-hidden flex flex-col border border-slate-950/70 shadow-2xl relative", children: [
        /* @__PURE__ */ jsxs12(
          "div",
          {
            className: "h-[12%] bg-blue-900 flex items-center justify-between px-[3%] z-20 shadow-lg",
            "aria-label": "Header modalit\xE0 TV (sola lettura)",
            children: [
              /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-6 min-w-0", children: [
                /* @__PURE__ */ jsx12(
                  "img",
                  {
                    src: safeLogo,
                    onError: (e) => {
                      if (e.currentTarget.src.endsWith(fallbackLogo)) return;
                      e.currentTarget.src = fallbackLogo;
                    },
                    className: "h-[60%] object-contain bg-white rounded-full p-1",
                    alt: "Logo"
                  }
                ),
                /* @__PURE__ */ jsxs12("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx12("h1", { className: "text-xl font-black uppercase tracking-tight leading-none truncate", children: data?.name || "FLBP BROADCAST" }),
                  /* @__PURE__ */ jsx12("p", { className: "text-blue-300 font-bold uppercase tracking-widest text-[10px] mt-0.5", children: "Canale Pubblico" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-3 text-blue-200 font-black uppercase text-[11px] tracking-wider", children: [
                /* @__PURE__ */ jsxs12("span", { className: "hidden md:inline-flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx12(MonitorPlay2, { className: "w-4 h-4" }),
                  " TV \u2022 16:9"
                ] }),
                /* @__PURE__ */ jsxs12("span", { className: "inline-flex items-center gap-2 bg-black/20 border border-white/10 rounded-full px-3 py-1", children: [
                  /* @__PURE__ */ jsx12(Keyboard, { className: "w-4 h-4" }),
                  " H/? Help \u2022 ESC Esci"
                ] })
              ] })
            ]
          }
        ),
        children ? children : /* @__PURE__ */ jsxs12("div", { className: "flex-1 flex flex-col items-center justify-center bg-slate-950 relative overflow-hidden", children: [
          /* @__PURE__ */ jsx12("div", { className: "absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950" }),
          /* @__PURE__ */ jsxs12("div", { className: "relative z-10 text-center space-y-6 opacity-60", children: [
            /* @__PURE__ */ jsx12(MonitorPlay2, { className: "w-32 h-32 mx-auto text-slate-700" }),
            /* @__PURE__ */ jsxs12("div", { children: [
              /* @__PURE__ */ jsx12("h2", { className: "text-5xl font-black uppercase text-slate-700 tracking-widest mb-2", children: "Segnale TV" }),
              /* @__PURE__ */ jsx12("p", { className: "text-2xl text-slate-600 font-mono", children: "In attesa di configurazione..." })
            ] })
          ] }),
          /* @__PURE__ */ jsx12("div", { className: "absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[5] bg-[length:100%_2px,3px_100%] pointer-events-none" })
        ] }),
        /* @__PURE__ */ jsxs12("div", { className: "h-[6%] bg-slate-900 border-t border-slate-800 flex items-center justify-between px-[3%] z-20", children: [
          /* @__PURE__ */ jsx12("div", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest", children: "Federazione Lucense Beer Pong" }),
          /* @__PURE__ */ jsx12("div", { className: "text-[10px] font-mono text-slate-600", children: "AUTO-REFRESH: ON" })
        ] })
      ] }) }) });
    };
  }
});

// components/TvSimpleView.tsx
import React10 from "react";
import { Fragment as Fragment4, jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
var ROTATION_MS, TvSimpleView;
var init_TvSimpleView = __esm({
  "components/TvSimpleView.tsx"() {
    init_PublicTvShell();
    init_groupStandings();
    init_GroupStandingsTable();
    init_matchUtils();
    ROTATION_MS = 15e3;
    TvSimpleView = ({ teams, data, matches, logo, onExit }) => {
      const groups = data?.groups || [];
      const isFinalGroup3 = React10.useCallback((g) => {
        const stage = String(g?.stage || "").toLowerCase();
        if (stage === "final") return true;
        const name = String(g?.name || "").toLowerCase();
        return /\bfinale?\b/i.test(name);
      }, []);
      const isByeTeam2 = React10.useCallback((t) => {
        if (!t) return false;
        if (String(t.id || "") === "BYE") return true;
        const name = String(t.name || "").trim();
        if (/^bye$/i.test(name)) return true;
        if (t.isBye === true) return true;
        if (t.hidden === true) return true;
        return false;
      }, []);
      const visibleTeams = React10.useCallback((arr) => {
        return (arr || []).filter((t) => !isByeTeam2(t));
      }, [isByeTeam2]);
      const finalGroup = React10.useMemo(() => {
        return groups.find(isFinalGroup3) || null;
      }, [groups, isFinalGroup3]);
      const stageGroups = React10.useMemo(() => {
        return groups.filter((g) => !isFinalGroup3(g));
      }, [groups, isFinalGroup3]);
      const teamNameById = React10.useMemo(() => {
        const map = /* @__PURE__ */ new Map();
        for (const t of teams) map.set(t.id, t.name);
        return map;
      }, [teams]);
      const getName = React10.useCallback((id) => {
        if (!id) return "TBD";
        return teamNameById.get(id) || "TBD";
      }, [teamNameById]);
      const groupMatchesByName = React10.useMemo(() => {
        const byGroup = /* @__PURE__ */ new Map();
        for (const m of matches || []) {
          if (m.phase !== "groups") continue;
          if (m.hidden || m.isBye) continue;
          const k = m.groupName || "";
          const arr = byGroup.get(k);
          if (arr) arr.push(m);
          else byGroup.set(k, [m]);
        }
        for (const arr of byGroup.values()) {
          arr.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        }
        return byGroup;
      }, [matches]);
      const isFinalMatch = React10.useCallback((m) => {
        const gName = String(m.groupName || "");
        if (finalGroup?.name && gName === finalGroup.name) return true;
        if (/final/i.test(gName)) return true;
        if (/^FTB/i.test(String(m.code || "").trim())) return true;
        return false;
      }, [finalGroup]);
      const pendingGroupTieBreaks = React10.useMemo(() => {
        return (matches || []).filter((m) => m.phase === "groups" && m.isTieBreak && m.status !== "finished" && !m.hidden && !m.isBye).filter((m) => {
          const ids = getMatchParticipantIds(m);
          return !ids.includes("BYE");
        }).filter((m) => !isFinalMatch(m));
      }, [matches, isFinalMatch]);
      const pendingFinalTieBreaks = React10.useMemo(() => {
        if (!finalGroup) return [];
        return (matches || []).filter((m) => m.phase === "groups" && m.isTieBreak && m.status !== "finished" && !m.hidden && !m.isBye).filter((m) => {
          const ids = getMatchParticipantIds(m);
          return !ids.includes("BYE");
        }).filter((m) => isFinalMatch(m));
      }, [matches, finalGroup, isFinalMatch]);
      const maxTeamsInGroup = Math.max(0, ...stageGroups.map((g) => visibleTeams(g.teams || []).length));
      const maxMatchesInGroup = Math.max(0, ...stageGroups.map((g) => (groupMatchesByName.get(g.name) || []).length));
      const groupsPerPage = stageGroups.length <= 2 ? Math.max(1, stageGroups.length) : maxTeamsInGroup <= 4 && maxMatchesInGroup <= 6 ? 3 : 2;
      const stagePageCount = stageGroups.length > 0 && groupsPerPage > 0 ? Math.ceil(stageGroups.length / groupsPerPage) : 0;
      const pageCount = stagePageCount + (finalGroup ? 1 : 0);
      const [page, setPage] = React10.useState(0);
      React10.useEffect(() => {
        if (pageCount <= 1) return;
        const t = setInterval(() => {
          setPage((prev) => (prev + 1) % pageCount);
        }, ROTATION_MS);
        return () => clearInterval(t);
      }, [pageCount]);
      React10.useEffect(() => {
        if (pageCount <= 0) return;
        if (page >= pageCount) setPage(0);
      }, [page, pageCount]);
      const isFinalPage = !!finalGroup && pageCount > 0 && page === pageCount - 1;
      const pageGroups = !isFinalPage && groupsPerPage > 0 ? stageGroups.slice(page * groupsPerPage, page * groupsPerPage + groupsPerPage) : [];
      const renderGroupCard = (g) => {
        const groupMatches = groupMatchesByName.get(g.name) || [];
        const standings = computeGroupStandings({ teams: visibleTeams(g.teams || []), matches: groupMatches });
        const played = groupMatches.filter((m) => m.status === "finished" && m.played);
        const upcoming = groupMatches.filter((m) => !m.played);
        return /* @__PURE__ */ jsxs13("div", { className: "bg-white rounded-lg shadow border border-slate-200 overflow-hidden flex flex-col min-h-0", children: [
          /* @__PURE__ */ jsx13("div", { className: "bg-slate-900 text-white px-3 py-2 font-black uppercase text-center tracking-widest text-xs", children: g.name }),
          /* @__PURE__ */ jsxs13("div", { className: "flex-1 min-h-0 grid grid-cols-2 gap-3 p-3", children: [
            /* @__PURE__ */ jsxs13("div", { className: "min-h-0", children: [
              /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2", children: "Classifica" }),
              /* @__PURE__ */ jsx13(
                GroupStandingsTable,
                {
                  rankedTeams: standings.rankedTeams,
                  rows: standings.rows,
                  advancingCount: data?.config?.advancingPerGroup ?? 0,
                  headerStyle: "abbr",
                  compact: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxs13("div", { className: "min-h-0", children: [
              /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2", children: "Partite" }),
              /* @__PURE__ */ jsxs13("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsxs13("div", { children: [
                  /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1", children: "Giocate" }),
                  /* @__PURE__ */ jsx13("div", { className: "space-y-1", children: played.length === 0 ? /* @__PURE__ */ jsx13("div", { className: "text-[10px] text-slate-400", children: "Nessuna" }) : played.slice(0, 4).map((m) => /* @__PURE__ */ jsx13("div", { className: "text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1", children: (() => {
                    const ids = getMatchParticipantIds(m);
                    const prefix = m.isTieBreak ? "SPAREGGIO \u2022 " : "";
                    if (ids.length >= 3) {
                      return prefix + ids.map((id) => `${getName(id)} ${getMatchScoreForTeam(m, id)}`).join(" \u2022 ");
                    }
                    return `${prefix}${getName(m.teamAId)} ${m.scoreA}-${m.scoreB} ${getName(m.teamBId)}`;
                  })() }, m.id)) })
                ] }),
                /* @__PURE__ */ jsxs13("div", { children: [
                  /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1", children: "Da giocare" }),
                  /* @__PURE__ */ jsx13("div", { className: "space-y-1", children: upcoming.length === 0 ? /* @__PURE__ */ jsx13("div", { className: "text-[10px] text-slate-400", children: "Nessuna" }) : upcoming.slice(0, 4).map((m) => /* @__PURE__ */ jsx13("div", { className: "text-xs font-mono text-slate-600 bg-white border border-slate-100 rounded px-2 py-1", children: (() => {
                    const ids = getMatchParticipantIds(m);
                    const names = ids.map((id) => getName(id));
                    const prefix = m.isTieBreak ? "SPAREGGIO \u2022 " : "";
                    return prefix + names.join(" vs ");
                  })() }, m.id)) })
                ] })
              ] }),
              (played.length > 4 || upcoming.length > 4) && /* @__PURE__ */ jsx13("div", { className: "mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest", children: "\u2026altre in elenco" })
            ] })
          ] })
        ] }, g.id);
      };
      const renderFinalGroupPage = () => {
        if (!finalGroup) return null;
        const groupMatches = groupMatchesByName.get(finalGroup.name) || [];
        const standings = computeGroupStandings({ teams: visibleTeams(finalGroup.teams || []), matches: groupMatches });
        const played = groupMatches.filter((m) => m.status === "finished" && m.played);
        const upcoming = groupMatches.filter((m) => !m.played);
        return /* @__PURE__ */ jsxs13("div", { className: "bg-white rounded-lg shadow border border-slate-200 overflow-hidden flex flex-col min-h-0 h-full", children: [
          /* @__PURE__ */ jsx13("div", { className: "bg-slate-900 text-white px-4 py-3 font-black uppercase text-center tracking-[0.2em] text-sm", children: "GIRONE FINALE" }),
          /* @__PURE__ */ jsxs13("div", { className: "flex-1 min-h-0 grid grid-cols-2 gap-4 p-4", children: [
            /* @__PURE__ */ jsxs13("div", { className: "min-h-0", children: [
              /* @__PURE__ */ jsxs13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2", children: [
                "Classifica",
                /* @__PURE__ */ jsxs13("span", { className: "ml-2 text-slate-400 font-mono font-bold", children: [
                  "(",
                  finalGroup.name,
                  ")"
                ] })
              ] }),
              /* @__PURE__ */ jsx13(
                GroupStandingsTable,
                {
                  rankedTeams: standings.rankedTeams,
                  rows: standings.rows,
                  advancingCount: 0,
                  headerStyle: "abbr",
                  compact: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxs13("div", { className: "min-h-0", children: [
              /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2", children: "Partite" }),
              /* @__PURE__ */ jsxs13("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxs13("div", { children: [
                  /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1", children: "Giocate" }),
                  /* @__PURE__ */ jsx13("div", { className: "space-y-1", children: played.length === 0 ? /* @__PURE__ */ jsx13("div", { className: "text-[10px] text-slate-400", children: "Nessuna" }) : played.slice(0, 6).map((m) => /* @__PURE__ */ jsx13("div", { className: "text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1", children: (() => {
                    const ids = getMatchParticipantIds(m);
                    const prefix = m.isTieBreak ? "SPAREGGIO \u2022 " : "";
                    if (ids.length >= 3) {
                      return prefix + ids.map((id) => `${getName(id)} ${getMatchScoreForTeam(m, id)}`).join(" \u2022 ");
                    }
                    return `${prefix}${getName(m.teamAId)} ${m.scoreA}-${m.scoreB} ${getName(m.teamBId)}`;
                  })() }, m.id)) })
                ] }),
                /* @__PURE__ */ jsxs13("div", { children: [
                  /* @__PURE__ */ jsx13("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1", children: "Da giocare" }),
                  /* @__PURE__ */ jsx13("div", { className: "space-y-1", children: upcoming.length === 0 ? /* @__PURE__ */ jsx13("div", { className: "text-[10px] text-slate-400", children: "Nessuna" }) : upcoming.slice(0, 6).map((m) => /* @__PURE__ */ jsx13("div", { className: "text-xs font-mono text-slate-600 bg-white border border-slate-100 rounded px-2 py-1", children: (() => {
                    const ids = getMatchParticipantIds(m);
                    const names = ids.map((id) => getName(id));
                    const prefix = m.isTieBreak ? "SPAREGGIO \u2022 " : "";
                    return prefix + names.join(" vs ");
                  })() }, m.id)) })
                ] })
              ] }),
              (played.length > 6 || upcoming.length > 6) && /* @__PURE__ */ jsx13("div", { className: "mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest", children: "\u2026altre in elenco" })
            ] })
          ] })
        ] });
      };
      return /* @__PURE__ */ jsxs13(PublicTvShell, { data, logo, onExit, children: [
        /* @__PURE__ */ jsxs13("div", { className: "flex-1 flex flex-col p-3 overflow-hidden bg-slate-100", children: [
          pendingGroupTieBreaks.length > 0 && /* @__PURE__ */ jsxs13("div", { className: "mb-2 bg-amber-600 text-white rounded-lg px-3 py-2 border border-amber-500 shadow-sm", children: [
            /* @__PURE__ */ jsx13("div", { className: "text-[11px] font-black uppercase tracking-widest", children: "Qualifica bloccata da spareggio" }),
            /* @__PURE__ */ jsxs13("div", { className: "text-[10px] font-mono font-bold opacity-90", children: [
              pendingGroupTieBreaks.slice(0, 4).map((m) => `${m.code || ""}${m.groupName ? ` (${m.groupName})` : ""}`).join(" \u2022 "),
              pendingGroupTieBreaks.length > 4 ? " \u2022 \u2026" : ""
            ] })
          ] }),
          pendingFinalTieBreaks.length > 0 && /* @__PURE__ */ jsxs13("div", { className: "mb-2 bg-rose-700 text-white rounded-lg px-3 py-2 border border-rose-600 shadow-sm", children: [
            /* @__PURE__ */ jsx13("div", { className: "text-[11px] font-black uppercase tracking-widest", children: "Titolo bloccato da spareggio finale" }),
            /* @__PURE__ */ jsxs13("div", { className: "text-[10px] font-mono font-bold opacity-90", children: [
              pendingFinalTieBreaks.slice(0, 4).map((m) => `${m.code || ""}${m.groupName ? ` (${m.groupName})` : ""}`).join(" \u2022 "),
              pendingFinalTieBreaks.length > 4 ? " \u2022 \u2026" : ""
            ] })
          ] }),
          data && (stageGroups.length > 0 || finalGroup) ? /* @__PURE__ */ jsxs13(Fragment4, { children: [
            isFinalPage ? /* @__PURE__ */ jsx13("div", { className: "h-full min-h-0", children: renderFinalGroupPage() }) : /* @__PURE__ */ jsx13("div", { className: `grid gap-3 h-full content-stretch ${groupsPerPage <= 2 ? "grid-cols-2" : "grid-cols-3"}`, children: pageGroups.map(renderGroupCard) }),
            pageCount > 1 && /* @__PURE__ */ jsxs13("div", { className: "mt-2 text-[10px] font-mono font-bold text-slate-500 text-center", children: [
              "Pagina ",
              page + 1,
              " di ",
              pageCount,
              " \u2022 Rotazione ogni ",
              Math.round(ROTATION_MS / 1e3),
              "s"
            ] })
          ] }) : /* @__PURE__ */ jsx13("div", { className: "flex-1 flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs", children: "Nessun dato gironi disponibile" })
        ] }),
        /* @__PURE__ */ jsx13("div", { className: "absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/35 backdrop-blur-sm px-4 py-1.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest text-white/60 border border-white/10 z-[60] select-none", children: "[1] Gironi \u2022 [2] G+Tab \u2022 [3] Tabellone \u2022 [4] Marcatori \u2022 [ESC] Esci" })
      ] });
    };
  }
});

// components/TvBracketView.tsx
import React11 from "react";
import { jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
var TvBracketView;
var init_TvBracketView = __esm({
  "components/TvBracketView.tsx"() {
    init_PublicTvShell();
    init_TournamentBracket();
    init_groupStandings();
    init_GroupStandingsTable();
    init_matchUtils();
    TvBracketView = ({ teams, matches, data, logo, onExit, mode }) => {
      const isSplit = mode === "groups_bracket";
      const isFinalGroup3 = React11.useCallback((g) => {
        const stage = g?.stage;
        if (stage === "final") return true;
        const name = String(g?.name || "");
        return /\bfinale?\b/i.test(name);
      }, []);
      const finalGroup = React11.useMemo(() => {
        const groups = data?.groups || [];
        return groups.find(isFinalGroup3) || null;
      }, [data?.groups, isFinalGroup3]);
      const stageGroups = React11.useMemo(() => {
        const groups = data?.groups || [];
        if (!finalGroup) return groups;
        return groups.filter((g) => g?.id !== finalGroup?.id);
      }, [data?.groups, finalGroup]);
      const isFinalMatch = React11.useCallback((m) => {
        if (/^FTB/i.test(String(m.code || ""))) return true;
        const gName = String(m.groupName || "");
        if (finalGroup?.name && gName === finalGroup.name) return true;
        return /\bfinale?\b/i.test(gName);
      }, [finalGroup]);
      const isByeTeam2 = React11.useCallback((t) => {
        const anyT = t;
        if (anyT?.hidden === true) return true;
        if (anyT?.isBye === true) return true;
        if (t.id === "BYE") return true;
        if (String(t.name || "").toUpperCase() === "BYE") return true;
        return false;
      }, []);
      const visibleTeams = React11.useCallback((teamsList) => {
        return (teamsList || []).filter((t) => !isByeTeam2(t));
      }, [isByeTeam2]);
      const pendingGroupTieBreaks = React11.useMemo(() => {
        return (matches || []).filter((m) => m.phase === "groups" && m.isTieBreak && m.status !== "finished" && !m.hidden && !m.isBye).filter((m) => {
          const ids = getMatchParticipantIds(m);
          return !ids.includes("BYE");
        }).filter((m) => !isFinalMatch(m));
      }, [matches, isFinalMatch]);
      const groupMatchesByName = React11.useMemo(() => {
        const byGroup = /* @__PURE__ */ new Map();
        for (const m of matches || []) {
          if (m.phase !== "groups") continue;
          if (m.hidden || m.isBye) continue;
          const k = m.groupName || "";
          const arr = byGroup.get(k);
          if (arr) arr.push(m);
          else byGroup.set(k, [m]);
        }
        for (const arr of byGroup.values()) {
          arr.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        }
        return byGroup;
      }, [matches]);
      return /* @__PURE__ */ jsxs14(PublicTvShell, { data, logo, onExit, children: [
        /* @__PURE__ */ jsxs14("div", { className: "flex-1 flex flex-col p-3 overflow-hidden bg-slate-100", children: [
          pendingGroupTieBreaks.length > 0 && /* @__PURE__ */ jsxs14("div", { className: "mb-2 bg-amber-600 text-white rounded-lg px-3 py-2 border border-amber-500 shadow-sm", children: [
            /* @__PURE__ */ jsx14("div", { className: "text-[11px] font-black uppercase tracking-widest", children: "Qualifica bloccata da spareggio" }),
            /* @__PURE__ */ jsxs14("div", { className: "text-[10px] font-mono font-bold opacity-90", children: [
              pendingGroupTieBreaks.slice(0, 4).map((m) => `${m.code || ""}${m.groupName ? ` (${m.groupName})` : ""}`).join(" \u2022 "),
              pendingGroupTieBreaks.length > 4 ? " \u2022 \u2026" : ""
            ] })
          ] }),
          data && /* @__PURE__ */ jsxs14("div", { className: `flex-1 ${isSplit ? "grid grid-cols-2 gap-4" : "flex justify-center"}`, children: [
            isSplit && /* @__PURE__ */ jsxs14("div", { className: "bg-white rounded-xl shadow-lg border border-slate-200 overflow-auto flex flex-col", children: [
              /* @__PURE__ */ jsx14("div", { className: "bg-slate-900 text-white p-3 font-black uppercase text-center tracking-widest", children: "Gironi" }),
              /* @__PURE__ */ jsx14("div", { className: "p-4 space-y-4", children: stageGroups && stageGroups.length ? stageGroups.map((g) => {
                const groupMatches = groupMatchesByName.get(g.name) || [];
                const standings = computeGroupStandings({ teams: visibleTeams(g.teams || []), matches: groupMatches });
                return /* @__PURE__ */ jsxs14("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
                  /* @__PURE__ */ jsx14("div", { className: "bg-slate-900 text-white p-2 font-black uppercase text-center tracking-widest text-xs", children: g.name }),
                  /* @__PURE__ */ jsx14("div", { className: "p-3", children: /* @__PURE__ */ jsx14(
                    GroupStandingsTable,
                    {
                      rankedTeams: standings.rankedTeams,
                      rows: standings.rows,
                      advancingCount: data.config.advancingPerGroup,
                      headerStyle: "abbr",
                      compact: true
                    }
                  ) })
                ] }, g.id);
              }) : /* @__PURE__ */ jsx14("div", { className: "text-slate-400 font-bold uppercase tracking-widest text-center py-10", children: "Nessun dato gironi disponibile" }) })
            ] }),
            /* @__PURE__ */ jsx14("div", { className: "bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-auto flex items-center justify-center", children: /* @__PURE__ */ jsx14("div", { className: `${isSplit ? "scale-[0.92]" : "scale-100"} origin-center`, children: /* @__PURE__ */ jsx14(
              TournamentBracket,
              {
                teams,
                data,
                matches,
                readOnly: true,
                tvMode: true
              }
            ) }) })
          ] }),
          !data && /* @__PURE__ */ jsx14("div", { className: "flex-1 flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest", children: "Nessun dato tabellone disponibile" })
        ] }),
        /* @__PURE__ */ jsx14("div", { className: "absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm px-6 py-2 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest text-white/50 border border-white/10 z-[60] select-none", children: "[1] Gironi \u2022 [2] G+Tab \u2022 [3] Tabellone \u2022 [4] Marcatori \u2022 [ESC] Esci" })
      ] });
    };
  }
});

// components/TvScorersView.tsx
import { useEffect as useEffect5, useMemo as useMemo4, useState as useState9 } from "react";
import { jsx as jsx15, jsxs as jsxs15 } from "react/jsx-runtime";
var TV_PAGE_DURATION_SEC, TV_ITEMS_PER_PAGE, TvScorersView;
var init_TvScorersView = __esm({
  "components/TvScorersView.tsx"() {
    init_PublicTvShell();
    init_storageService();
    TV_PAGE_DURATION_SEC = 10;
    TV_ITEMS_PER_PAGE = 10;
    TvScorersView = ({ teams, matches, data, logo, awards = [], onExit }) => {
      const aliasState = loadState();
      const [sortMode, setSortMode] = useState9("points");
      const [page, setPage] = useState9(0);
      const [timeLeft, setTimeLeft] = useState9(TV_PAGE_DURATION_SEC);
      const rows = useMemo4(() => {
        const map = {};
        const yobFromKey = (key) => {
          const m = (key || "").match(/_(ND|\d{4})$/i);
          if (!m) return void 0;
          if (String(m[1]).toUpperCase() === "ND") return void 0;
          const n = parseInt(String(m[1]), 10);
          return Number.isFinite(n) ? n : void 0;
        };
        teams.forEach((t) => {
          const p1Raw = getPlayerKey(t.player1, t.player1YoB ?? "ND");
          const p1Key = resolvePlayerKey(aliasState, p1Raw);
          map[p1Key] = {
            id: p1Key,
            name: t.player1,
            teamName: t.name,
            yob: yobFromKey(p1Key),
            points: 0,
            soffi: 0,
            matchesPlayed: 0
          };
          if (t.player2) {
            const p2Raw = getPlayerKey(t.player2, t.player2YoB ?? "ND");
            const p2Key = resolvePlayerKey(aliasState, p2Raw);
            map[p2Key] = {
              id: p2Key,
              name: t.player2,
              teamName: t.name,
              yob: yobFromKey(p2Key),
              points: 0,
              soffi: 0,
              matchesPlayed: 0
            };
          }
        });
        matches.forEach((m) => {
          if (!m.stats) return;
          m.stats.forEach((s) => {
            const team = teams.find((t) => t.id === s.teamId);
            const yob = team ? team.player1 === s.playerName ? team.player1YoB : team.player2YoB : void 0;
            const rawKey = getPlayerKey(s.playerName, yob ?? "ND");
            const key = resolvePlayerKey(aliasState, rawKey);
            if (!map[key]) {
              map[key] = {
                id: key,
                name: s.playerName,
                teamName: team?.name || s.teamId || "?",
                yob: yobFromKey(key),
                points: 0,
                soffi: 0,
                matchesPlayed: 0
              };
            }
            map[key].points += s.canestri || 0;
            map[key].soffi += s.soffi || 0;
            map[key].matchesPlayed += 1;
          });
        });
        return Object.values(map).filter((r) => (r.points > 0 || r.soffi > 0) && r.matchesPlayed > 0);
      }, [teams, matches]);
      const sorted = useMemo4(() => {
        const byMetric = [...rows].sort((a, b) => {
          if (sortMode === "points") return b.points - a.points || b.soffi - a.soffi;
          return b.soffi - a.soffi || b.points - a.points;
        });
        const filtered = byMetric.filter((r) => sortMode === "points" ? r.points > 0 : r.soffi > 0);
        return filtered.slice(0, 30);
      }, [rows, sortMode]);
      const totalPages = Math.max(1, Math.ceil(sorted.length / TV_ITEMS_PER_PAGE));
      const startIndex = page * TV_ITEMS_PER_PAGE;
      const visible = sorted.slice(startIndex, startIndex + TV_ITEMS_PER_PAGE);
      useEffect5(() => {
        const t = setInterval(() => {
          setTimeLeft((prev) => prev <= 1 ? TV_PAGE_DURATION_SEC : prev - 1);
        }, 1e3);
        return () => clearInterval(t);
      }, []);
      useEffect5(() => {
        if (timeLeft !== TV_PAGE_DURATION_SEC) return;
        setPage((prevPage) => {
          if (prevPage < totalPages - 1) return prevPage + 1;
          setSortMode((prevMode) => prevMode === "points" ? "soffi" : "points");
          return 0;
        });
      }, [timeLeft]);
      useEffect5(() => {
        if (page > totalPages - 1) setPage(0);
      }, [page, totalPages]);
      const normalize = (s) => (s || "").trim().toLowerCase();
      const hasTitle = (p, type) => {
        const pid = p.id;
        const pn = normalize(p.name);
        return awards.some((a) => {
          if (a.type !== type) return false;
          if (a.playerId) return resolvePlayerKey(aliasState, a.playerId) === pid;
          return (a.playerNames || []).some((n) => normalize(n) === pn);
        });
      };
      const metricLabel = sortMode === "points" ? "CANESTRI" : "SOFFI";
      return /* @__PURE__ */ jsx15(PublicTvShell, { data, logo, onExit, children: /* @__PURE__ */ jsxs15("div", { className: "flex-1 flex flex-col p-6 overflow-hidden bg-slate-900", children: [
        /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between mb-5", children: [
          /* @__PURE__ */ jsx15("div", { className: "text-white font-black tracking-tight text-sm", children: "MARCATORI LIVE" }),
          /* @__PURE__ */ jsx15("div", { className: "flex items-center gap-4", children: /* @__PURE__ */ jsx15("div", { className: `text-sm font-black ${sortMode === "points" ? "text-orange-400" : "text-cyan-300"}`, children: metricLabel }) })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "flex-1 rounded-2xl overflow-hidden border border-white/10 bg-white", children: [
          /* @__PURE__ */ jsxs15("div", { className: "grid grid-cols-12 bg-slate-950 text-white px-6 py-3 text-sm font-black uppercase tracking-wide", children: [
            /* @__PURE__ */ jsx15("div", { className: "col-span-1 text-center", children: "#" }),
            /* @__PURE__ */ jsx15("div", { className: "col-span-4", children: "Giocatore" }),
            /* @__PURE__ */ jsx15("div", { className: "col-span-4", children: "Squadra" }),
            /* @__PURE__ */ jsx15("div", { className: "col-span-1 text-center", children: "Gare" }),
            /* @__PURE__ */ jsx15("div", { className: "col-span-2 text-right", children: sortMode === "points" ? "Canestri" : "Soffi" })
          ] }),
          /* @__PURE__ */ jsx15("div", { className: "flex-1 bg-slate-50 flex flex-col", children: visible.length === 0 ? /* @__PURE__ */ jsx15("div", { className: "flex-1 flex items-center justify-center text-slate-400 text-sm font-black", children: "Nessun dato disponibile" }) : visible.map((p, idx) => {
            const rank = startIndex + idx + 1;
            return /* @__PURE__ */ jsxs15(
              "div",
              {
                className: "grid grid-cols-12 px-4 items-center border-b border-slate-200 last:border-0 text-sm font-bold",
                style: { height: `calc(100% / ${TV_ITEMS_PER_PAGE})` },
                children: [
                  /* @__PURE__ */ jsx15("div", { className: "col-span-1 text-center", children: /* @__PURE__ */ jsx15("span", { className: "inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-black text-sm", children: rank }) }),
                  /* @__PURE__ */ jsx15("div", { className: "col-span-4 pr-4", children: /* @__PURE__ */ jsxs15("div", { className: "text-slate-900 font-black leading-tight break-words", children: [
                    p.name,
                    isU25(p.yob) && /* @__PURE__ */ jsx15("span", { className: "ml-2 align-middle text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-black", children: "U25" }),
                    hasTitle(p, "mvp") && /* @__PURE__ */ jsx15("span", { className: "ml-2 align-middle", children: "\u2B50" })
                  ] }) }),
                  /* @__PURE__ */ jsx15("div", { className: "col-span-4 pr-4 text-slate-500 uppercase text-xs font-bold break-words", children: p.teamName }),
                  /* @__PURE__ */ jsx15("div", { className: "col-span-1 text-center text-slate-600 font-mono", children: p.matchesPlayed }),
                  /* @__PURE__ */ jsx15("div", { className: `col-span-2 text-right text-sm font-black font-mono ${sortMode === "points" ? "text-orange-600" : "text-cyan-600"}`, children: sortMode === "points" ? p.points : p.soffi })
                ]
              },
              p.id
            );
          }) }),
          /* @__PURE__ */ jsxs15("div", { className: "bg-slate-100 px-4 py-2 text-right text-slate-500 text-xs font-mono border-t border-slate-200", children: [
            "Pagina ",
            Math.min(page + 1, totalPages),
            " di ",
            totalPages,
            " \u2022 Cambio in: ",
            timeLeft,
            "s"
          ] })
        ] })
      ] }) });
    };
  }
});

// components/TvView.tsx
var TvView_exports = {};
__export(TvView_exports, {
  TvView: () => TvView
});
import { Activity as Activity2, Keyboard as Keyboard2 } from "lucide-react";
import { Fragment as Fragment5, jsx as jsx16, jsxs as jsxs16 } from "react/jsx-runtime";
var TvView;
var init_TvView = __esm({
  "components/TvView.tsx"() {
    init_TvSimpleView();
    init_TvBracketView();
    init_TvScorersView();
    TvView = ({ state, mode, onExit, helpOpen }) => {
      const getModeLabel = () => {
        switch (mode) {
          case "groups":
            return "GIRONI";
          case "bracket":
            return "TABELLONE";
          case "groups_bracket":
            return "GIRONI + TAB";
          case "scorers":
            return "MARCATORI";
          default:
            return mode;
        }
      };
      const renderContent = () => {
        const { tournament, teams, tournamentMatches, logo, hallOfFame } = state;
        const data = tournament;
        const matches = tournamentMatches;
        if (mode === "groups") {
          return /* @__PURE__ */ jsx16(TvSimpleView, { teams, data, matches, logo, onExit });
        }
        if (mode === "bracket" || mode === "groups_bracket") {
          return /* @__PURE__ */ jsx16(TvBracketView, { teams, matches, data, logo, onExit, mode });
        }
        if (mode === "scorers") {
          return /* @__PURE__ */ jsx16(
            TvScorersView,
            {
              teams,
              matches,
              data,
              logo,
              awards: hallOfFame.filter((h) => h.tournamentId === data?.id),
              onExit
            }
          );
        }
        return null;
      };
      return /* @__PURE__ */ jsxs16(Fragment5, { children: [
        renderContent(),
        helpOpen && /* @__PURE__ */ jsxs16(
          "div",
          {
            className: "fixed bottom-8 right-8 z-[110] bg-slate-900/95 backdrop-blur-md text-white p-6 rounded-2xl shadow-2xl border border-white/10 w-80 animate-fade-in pointer-events-none",
            "aria-label": "Guida comandi TV (sola lettura)",
            children: [
              /* @__PURE__ */ jsxs16("div", { className: "flex justify-between items-center mb-4 border-b border-white/10 pb-2", children: [
                /* @__PURE__ */ jsxs16("h3", { className: "font-black uppercase tracking-wider text-beer-500 flex items-center gap-2 text-sm", children: [
                  /* @__PURE__ */ jsx16(Keyboard2, { className: "w-4 h-4" }),
                  " Comandi TV"
                ] }),
                /* @__PURE__ */ jsx16("div", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400", children: "CHIUDI: ESC o H" })
              ] }),
              /* @__PURE__ */ jsxs16("div", { className: "space-y-4", children: [
                /* @__PURE__ */ jsxs16("div", { className: "space-y-2", children: [
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-xs font-bold text-slate-400 uppercase", children: "Gironi" }),
                    /* @__PURE__ */ jsx16("kbd", { className: "font-mono bg-white/10 px-2 py-0.5 rounded text-xs font-bold", children: "1" })
                  ] }),
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-xs font-bold text-slate-400 uppercase", children: "Gironi + Tab" }),
                    /* @__PURE__ */ jsx16("kbd", { className: "font-mono bg-white/10 px-2 py-0.5 rounded text-xs font-bold", children: "2" })
                  ] }),
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-xs font-bold text-slate-400 uppercase", children: "Tabellone" }),
                    /* @__PURE__ */ jsx16("kbd", { className: "font-mono bg-white/10 px-2 py-0.5 rounded text-xs font-bold", children: "3" })
                  ] }),
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-xs font-bold text-slate-400 uppercase", children: "Marcatori" }),
                    /* @__PURE__ */ jsx16("kbd", { className: "font-mono bg-white/10 px-2 py-0.5 rounded text-xs font-bold", children: "4" })
                  ] }),
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded border border-white/10", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-xs font-bold text-slate-400 uppercase", children: "Chiudi/Esci" }),
                    /* @__PURE__ */ jsx16("kbd", { className: "font-mono bg-white/10 px-2 py-0.5 rounded text-xs font-bold", children: "ESC" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs16("div", { className: "pt-2 border-t border-white/10 space-y-2", children: [
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between text-xs", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-slate-500 font-bold uppercase", children: "Vista" }),
                    /* @__PURE__ */ jsx16("span", { className: "font-mono font-bold text-beer-400", children: getModeLabel() })
                  ] }),
                  mode === "scorers" && /* @__PURE__ */ jsxs16("div", { className: "flex justify-between text-xs", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-slate-500 font-bold uppercase", children: "Metrica" }),
                    /* @__PURE__ */ jsx16("span", { className: "font-mono font-bold text-blue-400", children: "PUNTI (PT)" })
                  ] }),
                  /* @__PURE__ */ jsxs16("div", { className: "flex justify-between text-xs", children: [
                    /* @__PURE__ */ jsx16("span", { className: "text-slate-500 font-bold uppercase", children: "Aggiornamento" }),
                    /* @__PURE__ */ jsxs16("span", { className: "font-mono font-bold text-green-400 flex items-center gap-1", children: [
                      /* @__PURE__ */ jsx16(Activity2, { className: "w-3 h-3" }),
                      " AUTO"
                    ] })
                  ] })
                ] })
              ] })
            ]
          }
        )
      ] });
    };
  }
});

// App.tsx
import React13, { useState as useState10, useEffect as useEffect6, useRef as useRef4, createContext, useContext } from "react";
import { Menu, X as X5, Settings as Settings2, Globe, Home as HomeIcon, BarChart3, Trophy as Trophy7, Swords, Gavel as Gavel2, MonitorPlay as MonitorPlay3, ChevronDown as ChevronDown2, TriangleAlert } from "lucide-react";
import { jsx as jsx17, jsxs as jsxs17 } from "react/jsx-runtime";
var UiErrorBoundary, AdminDashboardLazy, TvViewLazy, LanguageContext, useTranslation;
var init_App = __esm({
  "App.tsx"() {
    init_Home();
    init_Leaderboard();
    init_HallOfFame();
    init_PublicTournaments();
    init_PublicTournamentDetail();
    init_HelpGuide();
    init_RefereesArea();
    init_storageService();
    init_getRepository();
    init_supabaseRest();
    init_autoDbSync();
    init_i18nService();
    init_dbDiagnostics();
    init_featureFlags();
    UiErrorBoundary = class extends React13.Component {
      constructor() {
        super(...arguments);
        this.state = { hasError: false, errorMsg: "" };
      }
      static getDerivedStateFromError(err) {
        return { hasError: true, errorMsg: String(err?.message || err || "Errore sconosciuto") };
      }
      componentDidCatch(err) {
        console.error("[UI ErrorBoundary]", err);
      }
      render() {
        if (!this.state.hasError) return this.props.children;
        return /* @__PURE__ */ jsx17("div", { className: "bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-2xl", children: /* @__PURE__ */ jsxs17("div", { className: "flex items-start gap-3", children: [
          /* @__PURE__ */ jsx17("div", { className: "p-2 rounded-xl bg-amber-50 border border-amber-200", children: /* @__PURE__ */ jsx17(TriangleAlert, { className: "w-5 h-5 text-amber-700", "aria-hidden": true }) }),
          /* @__PURE__ */ jsxs17("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx17("div", { className: "font-black text-slate-900 text-lg", children: this.props.title }),
            /* @__PURE__ */ jsx17("div", { className: "text-sm text-slate-600 font-semibold mt-1", children: "Si \xE8 verificato un errore di rendering. Non dovresti vedere una schermata bianca." }),
            /* @__PURE__ */ jsx17("div", { className: "mt-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 overflow-auto", children: this.state.errorMsg }),
            /* @__PURE__ */ jsxs17("div", { className: "mt-4 flex flex-wrap gap-2", children: [
              this.props.onReset ? /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => this.props.onReset?.(),
                  className: "px-4 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50",
                  children: "Torna alla Home"
                }
              ) : null,
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => window.location.reload(),
                  className: "px-4 py-2 rounded-xl font-black border border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
                  children: "Ricarica pagina"
                }
              )
            ] })
          ] })
        ] }) });
      }
    };
    AdminDashboardLazy = React13.lazy(
      () => Promise.resolve().then(() => (init_AdminDashboard(), AdminDashboard_exports)).then((m) => ({ default: m.AdminDashboard }))
    );
    TvViewLazy = React13.lazy(
      () => Promise.resolve().then(() => (init_TvView(), TvView_exports)).then((m) => ({ default: m.TvView }))
    );
    LanguageContext = createContext("it");
    useTranslation = () => {
      const lang = useContext(LanguageContext);
      return {
        t: (key) => translations[lang]?.[key] || translations.en[key] || translations.it[key] || key,
        lang
      };
    };
  }
});

// services/simulationService.ts
var splitInt, generateBlows, simulateMatchResult, simulateMultiMatchResult;
var init_simulationService = __esm({
  "services/simulationService.ts"() {
    splitInt = (total, parts) => {
      let remaining = total;
      const distribution = [];
      for (let i = 0; i < parts - 1; i++) {
        const val = Math.floor(Math.random() * (remaining + 1));
        distribution.push(val);
        remaining -= val;
      }
      distribution.push(remaining);
      return distribution.sort(() => Math.random() - 0.5);
    };
    generateBlows = () => {
      let count = 0;
      while (Math.random() < 0.2) count++;
      return count;
    };
    simulateMatchResult = (match, teamA, teamB) => {
      const rawTarget = match.targetScore ?? 10;
      const target = rawTarget >= 1 ? rawTarget : 10;
      let sA = 0;
      let sB = 0;
      const overtimeMatch = Math.random() < 0.03;
      if (!overtimeMatch) {
        const winnerA = Math.random() < 0.5;
        const loser = Math.floor(Math.random() * target);
        if (winnerA) {
          sA = target;
          sB = loser;
        } else {
          sB = target;
          sA = loser;
        }
      } else {
        sA = target;
        sB = target;
        while (sA === sB) {
          const roll = Math.random();
          if (roll < 0.03) {
            sA++;
            sB++;
          } else {
            if (Math.random() < 0.5) sA++;
            else sB++;
          }
        }
      }
      const [ptsA1, ptsA2] = splitInt(sA, 2);
      const [ptsB1, ptsB2] = splitInt(sB, 2);
      const totalBlows = generateBlows();
      const blowDist = splitInt(totalBlows, 4);
      const stats = [
        { playerName: teamA.player1 || "P1", teamId: teamA.id, canestri: ptsA1, soffi: blowDist[0] },
        { playerName: teamA.player2 || "P2", teamId: teamA.id, canestri: ptsA2, soffi: blowDist[1] },
        { playerName: teamB.player1 || "P1", teamId: teamB.id, canestri: ptsB1, soffi: blowDist[2] },
        { playerName: teamB.player2 || "P2", teamId: teamB.id, canestri: ptsB2, soffi: blowDist[3] }
      ];
      return { scoreA: sA, scoreB: sB, stats };
    };
    simulateMultiMatchResult = (match, teams) => {
      const rawTarget = match.targetScore ?? 10;
      const initialTarget = rawTarget >= 1 ? rawTarget : 10;
      const teamIds = (match.teamIds || []).filter(Boolean);
      const byId = new Map(teams.map((t) => [t.id, t]));
      const participants = teamIds.filter((id) => byId.has(id));
      if (participants.length < 2) {
        return { scoresByTeam: {}, stats: [] };
      }
      const scores = {};
      participants.forEach((id) => {
        scores[id] = 0;
      });
      let active = [...participants];
      let target = initialTarget;
      const tieAtTarget = active.length >= 2 && Math.random() < 0.03;
      if (!tieAtTarget) {
        const winner = active[Math.floor(Math.random() * active.length)];
        scores[winner] = target;
        for (const id of active) {
          if (id === winner) continue;
          scores[id] = Math.floor(Math.random() * target);
        }
      } else {
        const leaderCount = Math.min(active.length, 2 + Math.floor(Math.random() * Math.max(1, active.length - 1)));
        const shuffled = [...active].sort(() => Math.random() - 0.5);
        const leaders = shuffled.slice(0, Math.max(2, leaderCount));
        for (const id of leaders) scores[id] = target;
        for (const id of active) {
          if (leaders.includes(id)) continue;
          scores[id] = Math.floor(Math.random() * target);
        }
        active = leaders;
        while (true) {
          const roll = Math.random();
          if (roll < 0.03) {
            active.forEach((id) => {
              scores[id] = (scores[id] || 0) + 1;
            });
            target = target + 1;
            continue;
          }
          const winner = active[Math.floor(Math.random() * active.length)];
          scores[winner] = (scores[winner] || 0) + 1;
          break;
        }
      }
      const allPlayers = [];
      for (const id of participants) {
        const t = byId.get(id);
        if (t.player1) allPlayers.push({ teamId: id, playerName: t.player1 });
        if (t.player2) allPlayers.push({ teamId: id, playerName: t.player2 });
        if (!t.player1 && !t.player2) allPlayers.push({ teamId: id, playerName: "P1" });
      }
      const totalBlows = generateBlows();
      const blowDist = splitInt(totalBlows, Math.max(1, allPlayers.length));
      const stats = [];
      let blowIdx = 0;
      for (const id of participants) {
        const t = byId.get(id);
        const teamScore = scores[id] || 0;
        const pCount = (t.player1 ? 1 : 0) + (t.player2 ? 1 : 0) || 1;
        const parts = splitInt(teamScore, pCount);
        const players = [t.player1 || "P1", t.player2].filter(Boolean);
        if (!players.length) players.push("P1");
        for (let i = 0; i < players.length; i++) {
          stats.push({
            teamId: id,
            playerName: players[i],
            canestri: parts[i] ?? 0,
            soffi: blowDist[blowIdx++] ?? 0
          });
        }
      }
      return { scoresByTeam: scores, stats };
    };
  }
});

// services/id.ts
var uuid2;
var init_id = __esm({
  "services/id.ts"() {
    uuid2 = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
});

// services/adminCsvUtils.ts
var decodeCsvText, detectCsvSeparator, parseCsvRows;
var init_adminCsvUtils = __esm({
  "services/adminCsvUtils.ts"() {
    decodeCsvText = async (file) => {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const decodeWith = (enc) => {
        try {
          return new TextDecoder(enc, { fatal: false }).decode(bytes);
        } catch {
          return "";
        }
      };
      let text = decodeWith("utf-8");
      if (!text || text.includes("\uFFFD")) {
        const alt = decodeWith("windows-1252");
        if (alt) text = alt;
      }
      return text.replace(/^\uFEFF/, "");
    };
    detectCsvSeparator = (text) => {
      const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
      const count = (c) => (sample.match(new RegExp("\\" + c, "g")) || []).length;
      const counts = {
        ";": count(";"),
        ",": count(","),
        "	": (sample.match(/\t/g) || []).length
      };
      if (counts["	"] > counts[";"] && counts["	"] > counts[","]) return "	";
      return counts[";"] > counts[","] ? ";" : ",";
    };
    parseCsvRows = (text, sep) => {
      const rows = [];
      let row = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            const next = text[i + 1];
            if (next === '"') {
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            field += ch;
          }
          continue;
        }
        if (ch === '"') {
          inQuotes = true;
          continue;
        }
        if (ch === sep) {
          row.push(field);
          field = "";
          continue;
        }
        if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(field);
          field = "";
          const cleaned2 = row.map((v) => (v ?? "").toString().trim());
          if (cleaned2.some((v) => v !== "")) rows.push(cleaned2);
          row = [];
          continue;
        }
        field += ch;
      }
      row.push(field);
      const cleaned = row.map((v) => (v ?? "").toString().trim());
      if (cleaned.some((v) => v !== "")) rows.push(cleaned);
      return rows;
    };
  }
});

// services/simTeamNames400.ts
var SIM_TEAM_NAMES_400;
var init_simTeamNames400 = __esm({
  "services/simTeamNames400.ts"() {
    init_simTeamNames200();
    SIM_TEAM_NAMES_400 = [
      ...SIM_TEAM_NAMES_200,
      // Extended variants (200)
      "LE MATUSA United",
      "OMINI DELLE BOMBE Club",
      "Eppure Team",
      "Ricci&Muscoli Crew",
      "Davattro Squad",
      "Tucu Correa Academy",
      "Sefarditi FC",
      "Buon NatAlex BC",
      "Pinco panico Brewing",
      "Sensibilit\xE0 e educazione Party",
      "Splash Bros Legends",
      "Beer Angels Girls",
      "K Queens",
      "Basta Poco Sisters",
      "Rigatoni Pasta Warriors",
      "Parelli 5.4 Rebels",
      "I Miralcoolati Rockets",
      "Senza SentimIento Vikings",
      "I boccino Rangers",
      "Gli Amici di B.O.R.I.S Tigers",
      "SUPER &QUARK United",
      "Gsc Club",
      "Alcolisti ingenui Team",
      "Io e te Crew",
      "Gli Zero Mira Squad",
      "CB Academy",
      "sissignore FC",
      "I Polpi BC",
      "Schisce Brewing",
      "I PNC Party",
      "Daddy e Quaglia Legends",
      "Tranquilli ma Tossici Girls",
      "Paziente e Dottore Queens",
      "Double IPA Sisters",
      "Parappappa! Warriors",
      "I 101 sorsi Rebels",
      "Cabrones Rockets",
      "Senza lilleri non si Ler Vikings",
      "La Clio Rangers",
      "Ci vuole polso Tigers",
      "Seifuoribella United",
      "IL DUO Club",
      "TENNIS MAULINA Team",
      "I Margini Crew",
      "Northampton Squad",
      "Zinellacci Academy",
      "Grunge FC",
      "Los Mirabiliantes Dos BC",
      "Los fantasticos dos Brewing",
      "Olimpico Party",
      "Le Avvogatte Legends",
      "Le SkizzoSkizzo Girls",
      "Lagradisco Queens",
      "Le tocche Sisters",
      "I Frusi Warriors",
      "Orate Rebels",
      "ALFONSO SIGNORINi Rockets",
      "The Plow and The Show Vikings",
      "Los Pollos Hermanos Rangers",
      "Ci falciano Tigers",
      "Atletico Divano United",
      "La mattina dopo Club",
      "Perfetti sconosciuti Team",
      "Japan called Crew",
      "Tampussi Squad",
      "Dadi Academy",
      "Bonny Pizza FC",
      "ARISTOCAZZI BC",
      "Tommi in scatola Brewing",
      "Beerkenau Party",
      "Fenomeno o bluffff Legends",
      "Abu Bhari Girls",
      "Newpsie Queens",
      "Guelfi e Ghisellini Sisters",
      "Da Boe Warriors",
      "#Skizofrenia Rebels",
      "La Cappella Rockets",
      "Clickers Vikings",
      "Gli Stonfi Rangers",
      "Pinco panco panco pinco Tigers",
      "Nuanda1000 United",
      "PNC Club",
      "Odio Jo Bott Team",
      "MajinBu&Babidi Crew",
      "Tanti auguri caro Peeta Squad",
      "JLO Academy",
      "Fidanzati con una sBirra FC",
      "Fuzcaldi BC",
      "Zio Gianluca Brewing",
      "FB buongiorno Party",
      "Squadra enchantix Legends",
      "apostoli di Tognarazinger Girls",
      "Schizzo del mercoled\xEC Queens",
      "Siam queste amo Sisters",
      "Chaos&Loathing Warriors",
      "Alex & Michele Rebels",
      "Obrigad Rockets",
      "GLI OMINI DELLE BOMBE Vikings",
      "Procioni Frocioni Rangers",
      "Delicatezza e sensibilit\xE0 Tigers",
      "Satanazzi United",
      "Locals B Club",
      "Smithers&Mr.Burns Team",
      "I soci Crew",
      "Costruzione dal basso Squad",
      "Il danno e la beffa Academy",
      "Daje Roma daje FC",
      "I Testimoni di Piero BC",
      "Mai una Gioia Brewing",
      "Billeri Party",
      "I Giocabili Legends",
      "Smooth Operators Girls",
      "Il boccino Queens",
      "P.S.V. Sisters",
      "Blasco Warriors",
      "Senza quorum Rebels",
      "Igor Miti Rockets",
      "Alguer Vikings",
      "Poggiez Rangers",
      "Sti Stranieri Tigers",
      "Sbronzi a rete United",
      "Funghi Furiosi Club",
      "I piolisti Team",
      "LE MATUSA II Crew",
      "OMINI DELLE BOMBE II Squad",
      "Eppure II Academy",
      "Ricci&Muscoli II FC",
      "Davattro II BC",
      "Tucu Correa II Brewing",
      "Sefarditi II Party",
      "Buon NatAlex II Legends",
      "Pinco panico II Girls",
      "Sensibilit\xE0 e educazione II Queens",
      "Splash Bros II Sisters",
      "Beer Angels II Warriors",
      "K II Rebels",
      "Basta Poco II Rockets",
      "Rigatoni Pasta II Vikings",
      "Parelli 5.4 II Rangers",
      "I Miralcoolati II Tigers",
      "Senza SentimIento II United",
      "I boccino II Club",
      "Gli Amici di B.O.R.I.S II Team",
      "SUPER &QUARK II Crew",
      "Gsc II Squad",
      "Alcolisti ingenui II Academy",
      "Io e te II FC",
      "Gli Zero Mira II BC",
      "CB II Brewing",
      "sissignore II Party",
      "I Polpi II Legends",
      "Schisce II Girls",
      "I PNC II Queens",
      "Daddy e Quaglia II Sisters",
      "Tranquilli ma Tossici II Warriors",
      "Paziente e Dottore II Rebels",
      "Double IPA II Rockets",
      "Parappappa! II Vikings",
      "I 101 sorsi II Rangers",
      "Cabrones II Tigers",
      "Senza lilleri non si Ler II United",
      "La Clio II Club",
      "Ci vuole polso II Team",
      "Seifuoribella II Crew",
      "IL DUO II Squad",
      "TENNIS MAULINA II Academy",
      "I Margini II FC",
      "Northampton II BC",
      "Zinellacci II Brewing",
      "Grunge II Party",
      "Los Mirabiliantes Dos II Legends",
      "Los fantasticos dos II Girls",
      "Olimpico II Queens",
      "Le Avvogatte II Sisters",
      "Le SkizzoSkizzo II Warriors",
      "Lagradisco II Rebels",
      "Le tocche II Rockets",
      "I Frusi II Vikings",
      "Orate II Rangers",
      "ALFONSO SIGNORINi II Tigers",
      "The Plow and The Show II United",
      "Los Pollos Hermanos II Club",
      "Ci falciano II Team",
      "Atletico Divano II Crew",
      "La mattina dopo II Squad",
      "Perfetti sconosciuti II Academy",
      "Japan called II FC",
      "Tampussi II BC",
      "Dadi II Brewing",
      "Bonny Pizza II Party",
      "ARISTOCAZZI II Legends",
      "Tommi in scatola II Girls",
      "Beerkenau II Queens",
      "Fenomeno o bluffff II Sisters",
      "Abu Bhari II Warriors",
      "Newpsie II Rebels",
      "Guelfi e Ghisellini II Rockets",
      "Da Boe II Vikings",
      "#Skizofrenia II Rangers",
      "La Cappella II Tigers"
    ];
  }
});

// services/simPool.ts
var generateSimPoolTeams;
var init_simPool = __esm({
  "services/simPool.ts"() {
    init_simTeamNames400();
    generateSimPoolTeams = (n, existingTeams, uuidFn) => {
      const nn = Math.min(400, Math.max(1, Math.floor(n || 0)));
      const TEAM_NAMES = SIM_TEAM_NAMES_400;
      const BASE_FIRST = ["Giulia", "Sofia", "Aurora", "Alice", "Ginevra", "Emma", "Greta", "Martina", "Chiara", "Francesca", "Sara", "Elena", "Beatrice", "Vittoria", "Noemi", "Marta", "Gaia", "Arianna", "Rebecca", "Matilde", "Anna", "Ilaria", "Valentina", "Federica", "Silvia", "Claudia", "Lucia", "Camilla", "Alessia", "Veronica", "Irene", "Caterina", "Elisa", "Margherita", "Rachele", "Serena", "Giada", "Benedetta", "Adele", "Melissa"];
      const BASE_LAST = ["Rossi", "Bianchi", "Ferrari", "Esposito", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "Costa", "Giordano", "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana"];
      const PEOPLE = [];
      const HOMONYM = "Giulia Rossi";
      [1996, 1999, 2002, 2005, 2008].forEach((y) => PEOPLE.push({ name: HOMONYM, yob: y }));
      let idx = 0;
      while (PEOPLE.length < 800) {
        const fn = BASE_FIRST[idx % BASE_FIRST.length];
        const ln = BASE_LAST[Math.floor(idx / BASE_FIRST.length) % BASE_LAST.length];
        const name = `${fn} ${ln}`;
        const yob = 1990 + idx % 21;
        idx++;
        if (name === HOMONYM) continue;
        PEOPLE.push({ name, yob });
      }
      const existingTeamNames = new Set((existingTeams || []).map((t) => (t.name || "").trim().toLowerCase()));
      const availableNames = TEAM_NAMES.filter((nm) => !existingTeamNames.has(nm.trim().toLowerCase()));
      const usedThisGen = /* @__PURE__ */ new Set();
      const normName = (s) => (s || "").trim().toLowerCase();
      const pickTeamName = (i) => {
        const base = availableNames[i] || TEAM_NAMES[i % TEAM_NAMES.length] || `Team ${i + 1}`;
        let candidate = base;
        let guard = 0;
        while ((existingTeamNames.has(normName(candidate)) || usedThisGen.has(normName(candidate))) && guard < 50) {
          guard++;
          const suffix = guard === 1 ? " III" : guard === 2 ? " IV" : guard === 3 ? " V" : ` ${guard + 2}`;
          candidate = `${base}${suffix}`;
        }
        usedThisGen.add(normName(candidate));
        return candidate;
      };
      const pickPerson = () => PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
      const teams = [];
      for (let i = 0; i < nn; i++) {
        const teamName = pickTeamName(i);
        const a = pickPerson();
        let b = pickPerson();
        let guard = 0;
        while (b === a && guard < 20) {
          b = pickPerson();
          guard++;
        }
        const isRefTeam = i % 5 === 0;
        const hasTwoRefs = isRefTeam && i % 25 === 0;
        const aRef = isRefTeam;
        const bRef = hasTwoRefs;
        teams.push({
          id: uuidFn(),
          name: teamName,
          player1: a.name,
          player2: b.name,
          player1YoB: a.yob,
          player2YoB: b.yob,
          player1IsReferee: aRef,
          player2IsReferee: bRef,
          isReferee: aRef || bRef,
          createdAt: Date.now()
        });
      }
      return teams;
    };
  }
});

// services/lazyXlsx.ts
var _xlsx, getXLSX;
var init_lazyXlsx = __esm({
  "services/lazyXlsx.ts"() {
    _xlsx = null;
    getXLSX = async () => {
      if (_xlsx) return _xlsx;
      const mod = await import("xlsx");
      _xlsx = mod?.default ?? mod;
      return _xlsx;
    };
  }
});

// components/admin/modals/AliasModal.tsx
import { jsx as jsx18, jsxs as jsxs18 } from "react/jsx-runtime";
var AliasModal;
var init_AliasModal = __esm({
  "components/admin/modals/AliasModal.tsx"() {
    AliasModal = ({ title, conflicts, setConflicts, onClose, onConfirm }) => {
      const hasInvalidMerge = (conflicts || []).some((c) => c.action === "merge" && !c.targetKey);
      return /* @__PURE__ */ jsx18("div", { className: "fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs18("div", { className: "w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden", children: [
        /* @__PURE__ */ jsxs18("div", { className: "bg-slate-900 text-white px-4 py-3 font-black flex items-center justify-between", children: [
          /* @__PURE__ */ jsx18("span", { children: title || "Possibili omonimi (YoB diverso)" }),
          /* @__PURE__ */ jsx18(
            "button",
            {
              onClick: onClose,
              className: "px-3 py-2 rounded-lg font-black bg-white/10 hover:bg-white/20 text-xs",
              children: "Chiudi"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs18("div", { className: "p-4 space-y-4", children: [
          /* @__PURE__ */ jsxs18("div", { className: "text-sm font-bold text-slate-700", children: [
            "Stesso nome gi\xE0 presente con anno diverso. ",
            /* @__PURE__ */ jsx18("span", { className: "font-black", children: "Opzione A:" }),
            " ND \xE8 trattato come qualsiasi altro anno."
          ] }),
          conflicts.map((c) => /* @__PURE__ */ jsxs18("div", { className: "border border-slate-200 rounded-xl p-4", children: [
            /* @__PURE__ */ jsx18("div", { className: "flex items-start justify-between gap-3", children: /* @__PURE__ */ jsxs18("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxs18("div", { className: "font-black text-slate-900 truncate", children: [
                c.sourceName,
                " ",
                /* @__PURE__ */ jsxs18("span", { className: "text-slate-500", children: [
                  "(",
                  c.sourceYoB,
                  ")"
                ] })
              ] }),
              /* @__PURE__ */ jsx18("div", { className: "text-[11px] font-mono text-slate-500 truncate", children: c.sourceKey })
            ] }) }),
            /* @__PURE__ */ jsxs18("div", { className: "mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center", children: [
              /* @__PURE__ */ jsxs18("label", { className: "flex items-center gap-2 text-sm font-black text-slate-700", children: [
                /* @__PURE__ */ jsx18(
                  "input",
                  {
                    type: "radio",
                    checked: c.action === "separate",
                    onChange: () => setConflicts((prev) => prev.map((x) => x.id === c.id ? { ...x, action: "separate", targetKey: void 0 } : x))
                  }
                ),
                "Mantieni separati"
              ] }),
              /* @__PURE__ */ jsxs18("label", { className: "flex items-center gap-2 text-sm font-black text-slate-700", children: [
                /* @__PURE__ */ jsx18(
                  "input",
                  {
                    type: "radio",
                    checked: c.action === "merge",
                    onChange: () => setConflicts((prev) => prev.map((x) => x.id === c.id ? { ...x, action: "merge" } : x))
                  }
                ),
                "Integra in"
              ] }),
              /* @__PURE__ */ jsxs18(
                "select",
                {
                  value: c.targetKey || "",
                  onChange: (e) => setConflicts((prev) => prev.map((x) => x.id === c.id ? { ...x, action: "merge", targetKey: e.target.value || void 0 } : x)),
                  disabled: c.action !== "merge",
                  className: `w-full border border-slate-200 rounded-lg px-3 py-2 font-bold ${c.action !== "merge" ? "bg-slate-100 text-slate-400" : ""}`,
                  children: [
                    /* @__PURE__ */ jsx18("option", { value: "", children: "Seleziona profilo\u2026" }),
                    c.candidates.map((opt) => /* @__PURE__ */ jsx18("option", { value: opt.key, children: opt.label }, opt.key))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsx18("div", { className: "mt-3 text-[11px] font-bold text-slate-500", children: "Se scegli \u201CIntegra\u201D, i punti/statistiche verranno sommati nella classifica generale, ma i record originali restano separati nei dati." })
          ] }, c.id))
        ] }),
        /* @__PURE__ */ jsxs18("div", { className: "bg-slate-50 px-4 py-3 flex items-center justify-end gap-2", children: [
          /* @__PURE__ */ jsx18(
            "button",
            {
              onClick: onClose,
              className: "px-4 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50",
              children: "Annulla"
            }
          ),
          /* @__PURE__ */ jsx18(
            "button",
            {
              onClick: onConfirm,
              disabled: hasInvalidMerge,
              className: `px-4 py-2 rounded-lg font-black text-white ${hasInvalidMerge ? "bg-slate-400 cursor-not-allowed" : "bg-blue-700 hover:bg-blue-800"}`,
              children: "Conferma"
            }
          )
        ] })
      ] }) });
    };
  }
});

// components/admin/modals/MvpModal.tsx
import { jsx as jsx19, jsxs as jsxs19 } from "react/jsx-runtime";
var MvpModal;
var init_MvpModal = __esm({
  "components/admin/modals/MvpModal.tsx"() {
    MvpModal = ({
      forArchive,
      allPlayers,
      search,
      setSearch,
      selectedIds,
      setSelectedIds,
      searchPlaceholder,
      onClose,
      onArchiveWithoutMvp,
      onSave,
      saveLabel
    }) => {
      return /* @__PURE__ */ jsx19("div", { className: "fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4", children: /* @__PURE__ */ jsxs19("div", { className: "w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden", children: [
        /* @__PURE__ */ jsxs19("div", { className: "bg-slate-900 text-white px-4 py-3 font-black flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs19("span", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx19("span", { className: "text-base select-none", children: "\u2B50" }),
            forArchive ? "MVP (prima di archiviare)" : "MVP"
          ] }),
          /* @__PURE__ */ jsx19(
            "button",
            {
              onClick: onClose,
              className: "px-3 py-2 rounded-lg font-black bg-white/10 hover:bg-white/20 text-xs",
              children: "Chiudi"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "p-4 space-y-4", children: [
          /* @__PURE__ */ jsxs19("div", { className: "text-sm font-bold text-slate-700", children: [
            "Seleziona l'MVP (o gli MVP a parimerito). Puoi selezionare ",
            /* @__PURE__ */ jsx19("span", { className: "font-black", children: "pi\xF9 giocatori" }),
            "."
          ] }),
          /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx19(
              "input",
              {
                value: search,
                onChange: (e) => setSearch(e.target.value),
                placeholder: searchPlaceholder,
                className: "flex-1 border border-slate-200 rounded-lg px-3 py-2 font-bold"
              }
            ),
            /* @__PURE__ */ jsx19(
              "button",
              {
                onClick: () => setSelectedIds([]),
                className: "px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm",
                children: "Pulisci"
              }
            )
          ] }),
          /* @__PURE__ */ jsx19("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: /* @__PURE__ */ jsxs19("div", { className: "max-h-[360px] overflow-auto divide-y divide-slate-100", children: [
            allPlayers.filter((p) => {
              const q = (search || "").trim().toLowerCase();
              if (!q) return true;
              return (p.label || "").toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q);
            }).sort((a, b) => a.label.localeCompare(b.label, "it", { sensitivity: "base" })).map((p) => {
              const checked = selectedIds.includes(p.id);
              return /* @__PURE__ */ jsxs19("label", { className: "flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer", children: [
                /* @__PURE__ */ jsx19(
                  "input",
                  {
                    type: "checkbox",
                    checked,
                    onChange: () => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return Array.from(next);
                      });
                    }
                  }
                ),
                /* @__PURE__ */ jsx19("div", { className: "font-black text-slate-800", children: p.label })
              ] }, p.id);
            }),
            allPlayers.length === 0 && /* @__PURE__ */ jsx19("div", { className: "p-8 text-center text-slate-400 font-bold", children: "Nessun giocatore disponibile." })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "bg-slate-50 px-4 py-3 flex items-center justify-between gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx19("div", { className: "text-xs font-bold text-slate-500", children: "Se non imposti l'MVP ora, potrai farlo anche dopo (Gestione Dati \u2192 Integrazioni)." }),
          /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-2", children: [
            forArchive && /* @__PURE__ */ jsx19(
              "button",
              {
                onClick: onArchiveWithoutMvp,
                className: "px-4 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50",
                children: "Archivia senza MVP"
              }
            ),
            /* @__PURE__ */ jsx19(
              "button",
              {
                onClick: onSave,
                className: "px-4 py-2 rounded-lg font-black text-white bg-orange-600 hover:bg-orange-700",
                children: saveLabel
              }
            )
          ] })
        ] })
      ] }) });
    };
  }
});

// config/appMode.ts
var APP_MODE_OVERRIDE_KEY, raw, normalized, envMode, safeReadOverride, setAppModeOverride, overrideMode, APP_MODE, isTesterMode;
var init_appMode = __esm({
  "config/appMode.ts"() {
    APP_MODE_OVERRIDE_KEY = "flbp_app_mode_override";
    raw = import.meta?.env?.VITE_APP_MODE;
    normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    envMode = normalized === "official" ? "official" : "tester";
    safeReadOverride = () => {
      try {
        if (typeof window === "undefined") return null;
        const v = window.localStorage?.getItem(APP_MODE_OVERRIDE_KEY);
        const n = typeof v === "string" ? v.trim().toLowerCase() : "";
        if (n === "tester" || n === "official") return n;
        return null;
      } catch {
        return null;
      }
    };
    setAppModeOverride = (mode) => {
      try {
        if (typeof window === "undefined") return;
        if (!window.localStorage) return;
        if (!mode) window.localStorage.removeItem(APP_MODE_OVERRIDE_KEY);
        else window.localStorage.setItem(APP_MODE_OVERRIDE_KEY, mode);
      } catch {
      }
    };
    overrideMode = safeReadOverride();
    APP_MODE = overrideMode || envMode;
    isTesterMode = APP_MODE === "tester";
  }
});

// components/admin/tabs/TeamsTab.tsx
import React14 from "react";
import { Users as Users2, Upload, Download, Trash2, Plus, MoreHorizontal, ChevronDown as ChevronDown3, FileText, Pencil } from "lucide-react";
import { jsx as jsx20, jsxs as jsxs20 } from "react/jsx-runtime";
var TeamsTab;
var init_TeamsTab = __esm({
  "components/admin/tabs/TeamsTab.tsx"() {
    init_appMode();
    TeamsTab = ({
      t,
      fileRef,
      backupRef,
      importFile,
      importBackupJson,
      exportTeamsXlsx,
      exportBackupJson,
      printTeams,
      editingId,
      teamName,
      setTeamName,
      p1,
      setP1,
      p2,
      setP2,
      y1,
      setY1,
      y2,
      setY2,
      p1IsReferee,
      setP1IsReferee,
      p2IsReferee,
      setP2IsReferee,
      saveTeam,
      resetForm,
      poolN,
      setPoolN,
      genPool,
      addHomonyms,
      clearTeams,
      sortedTeams,
      editTeam,
      deleteTeam
    }) => {
      const [query, setQuery] = React14.useState("");
      const visibleTeams = React14.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return sortedTeams;
        return sortedTeams.filter((t2) => {
          const n = (t2.name ?? "").toLowerCase();
          const p12 = (t2.player1 ?? "").toLowerCase();
          const p22 = (t2.player2 ?? "").toLowerCase();
          const y1s = t2.player1YoB != null ? String(t2.player1YoB) : "";
          const y2s = t2.player2YoB != null ? String(t2.player2YoB) : "";
          return n.includes(q) || p12.includes(q) || p22.includes(q) || y1s.includes(q) || y2s.includes(q);
        });
      }, [query, sortedTeams]);
      return /* @__PURE__ */ jsxs20("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6", children: [
        /* @__PURE__ */ jsxs20("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxs20("h3", { className: "text-xl font-black flex items-center gap-2", children: [
            /* @__PURE__ */ jsx20(Users2, { className: "w-5 h-5" }),
            " ",
            t("teams")
          ] }),
          /* @__PURE__ */ jsxs20("div", { className: "flex flex-col gap-2 sm:items-end", children: [
            /* @__PURE__ */ jsxs20("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
              /* @__PURE__ */ jsx20(
                "input",
                {
                  value: query,
                  onChange: (e) => setQuery(e.target.value),
                  placeholder: t("search"),
                  className: "w-56 max-w-full border border-slate-200 rounded-lg px-3 py-2 font-bold bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                }
              ),
              /* @__PURE__ */ jsx20("input", { ref: fileRef, type: "file", className: "hidden", accept: ".xlsx,.xls,.csv", onChange: (e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.currentTarget.value = "";
              } }),
              /* @__PURE__ */ jsx20("input", { ref: backupRef, type: "file", className: "hidden", accept: "application/json,.json", onChange: (e) => {
                const f = e.target.files?.[0];
                if (f) importBackupJson(f);
                e.currentTarget.value = "";
              } }),
              /* @__PURE__ */ jsxs20("button", { type: "button", onClick: () => fileRef.current?.click(), className: "bg-emerald-600 text-white px-4 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2", children: [
                /* @__PURE__ */ jsx20(Upload, { className: "w-4 h-4" }),
                " Import Excel/CSV"
              ] }),
              /* @__PURE__ */ jsxs20("button", { type: "button", onClick: resetForm, className: "bg-white border border-slate-200 text-slate-900 px-4 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2", children: [
                /* @__PURE__ */ jsx20(Plus, { className: "w-4 h-4" }),
                " ",
                t("new_team")
              ] }),
              isTesterMode && /* @__PURE__ */ jsxs20("details", { className: "relative", children: [
                /* @__PURE__ */ jsxs20("summary", { className: "list-none cursor-pointer select-none bg-white border border-slate-200 text-slate-900 px-4 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2", children: [
                  /* @__PURE__ */ jsx20(MoreHorizontal, { className: "w-4 h-4" }),
                  " ",
                  t("advanced_actions"),
                  " ",
                  /* @__PURE__ */ jsx20(ChevronDown3, { className: "w-4 h-4 opacity-70" })
                ] }),
                /* @__PURE__ */ jsxs20("div", { className: "absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-20", children: [
                  /* @__PURE__ */ jsxs20("button", { type: "button", onClick: (e) => {
                    exportTeamsXlsx();
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }, className: "w-full text-left px-3 py-2 rounded-lg font-black hover:bg-slate-50 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx20(Download, { className: "w-4 h-4" }),
                    " Export Excel"
                  ] }),
                  /* @__PURE__ */ jsxs20("button", { type: "button", onClick: (e) => {
                    exportBackupJson();
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }, className: "w-full text-left px-3 py-2 rounded-lg font-black hover:bg-slate-50 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx20(Download, { className: "w-4 h-4" }),
                    " Backup JSON"
                  ] }),
                  /* @__PURE__ */ jsxs20("button", { type: "button", onClick: (e) => {
                    backupRef.current?.click();
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }, className: "w-full text-left px-3 py-2 rounded-lg font-black hover:bg-slate-50 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx20(Upload, { className: "w-4 h-4" }),
                    " Ripristina JSON"
                  ] }),
                  /* @__PURE__ */ jsxs20("button", { type: "button", onClick: (e) => {
                    printTeams();
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }, className: "w-full text-left px-3 py-2 rounded-lg font-black hover:bg-slate-50 flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx20(FileText, { className: "w-4 h-4" }),
                    " Export PDF"
                  ] })
                ] })
              ] })
            ] }),
            query.trim() ? /* @__PURE__ */ jsxs20("div", { className: "text-xs text-slate-500 font-bold", children: [
              visibleTeams.length,
              "/",
              sortedTeams.length
            ] }) : null
          ] })
        ] }),
        /* @__PURE__ */ jsxs20("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4", children: [
          /* @__PURE__ */ jsx20("div", { className: "flex items-center justify-between gap-3 mb-3", children: /* @__PURE__ */ jsx20("h4", { className: "font-black", children: editingId ? "Modifica squadra" : "Inserimento manuale" }) }),
          /* @__PURE__ */ jsxs20("div", { className: "grid grid-cols-1 gap-3", children: [
            /* @__PURE__ */ jsx20(
              "input",
              {
                value: teamName,
                onChange: (e) => setTeamName(e.target.value),
                placeholder: "Nome squadra",
                className: "border border-slate-200 rounded-lg px-3 py-2 font-bold"
              }
            ),
            /* @__PURE__ */ jsxs20("div", { className: "grid grid-cols-1 md:grid-cols-5 gap-3", children: [
              /* @__PURE__ */ jsxs20("div", { className: "md:col-span-3 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx20("input", { value: p1, onChange: (e) => setP1(e.target.value), placeholder: "Giocatore 1", className: "flex-1 border border-slate-200 rounded-lg px-3 py-2" }),
                /* @__PURE__ */ jsxs20("label", { className: "flex items-center gap-1 text-xs font-black text-slate-700 whitespace-nowrap", children: [
                  /* @__PURE__ */ jsx20("input", { type: "checkbox", checked: p1IsReferee, onChange: (e) => setP1IsReferee(e.target.checked) }),
                  "Arbitro"
                ] })
              ] }),
              /* @__PURE__ */ jsx20("input", { value: y1, onChange: (e) => setY1(e.target.value.replace(/[^\d]/g, "")), placeholder: "Anno 1 (es. 2003)", className: "md:col-span-2 border border-slate-200 rounded-lg px-3 py-2" })
            ] }),
            /* @__PURE__ */ jsxs20("div", { className: "grid grid-cols-1 md:grid-cols-5 gap-3", children: [
              /* @__PURE__ */ jsxs20("div", { className: "md:col-span-3 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx20("input", { value: p2, onChange: (e) => setP2(e.target.value), placeholder: "Giocatore 2", className: "flex-1 border border-slate-200 rounded-lg px-3 py-2" }),
                /* @__PURE__ */ jsxs20("label", { className: "flex items-center gap-1 text-xs font-black text-slate-700 whitespace-nowrap", children: [
                  /* @__PURE__ */ jsx20("input", { type: "checkbox", checked: p2IsReferee, onChange: (e) => setP2IsReferee(e.target.checked) }),
                  "Arbitro"
                ] })
              ] }),
              /* @__PURE__ */ jsx20("input", { value: y2, onChange: (e) => setY2(e.target.value.replace(/[^\d]/g, "")), placeholder: "Anno 2", className: "md:col-span-2 border border-slate-200 rounded-lg px-3 py-2" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs20("div", { className: "flex gap-2 mt-3", children: [
            /* @__PURE__ */ jsxs20("button", { onClick: saveTeam, className: "bg-blue-700 text-white px-4 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-blue-800", children: [
              /* @__PURE__ */ jsx20(Plus, { className: "w-4 h-4" }),
              " ",
              editingId ? "Salva modifiche" : "Aggiungi"
            ] }),
            editingId && /* @__PURE__ */ jsx20("button", { onClick: resetForm, className: "bg-white border border-slate-200 px-4 py-2 rounded-lg font-black hover:bg-slate-50", children: "Annulla" })
          ] }),
          /* @__PURE__ */ jsx20("p", { className: "text-xs text-slate-500 mt-2", children: "Nota: se l\u2019anno manca, il giocatore viene considerato \u201CSenior\u201D e non rientra nei filtri U25." })
        ] }),
        isTesterMode ? /* @__PURE__ */ jsxs20("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4", children: [
          /* @__PURE__ */ jsx20("h4", { className: "font-black mb-2", children: "Simulatore Pool (test)" }),
          /* @__PURE__ */ jsxs20("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsx20(
              "input",
              {
                value: poolN,
                onChange: (e) => setPoolN(e.target.value.replace(/[^\d]/g, "")),
                className: "w-24 border border-amber-300 rounded-lg px-3 py-2 font-black",
                placeholder: "N (1-400)"
              }
            ),
            /* @__PURE__ */ jsx20("button", { onClick: () => genPool(Number(poolN)), className: "bg-amber-600 text-white px-4 py-2 rounded-lg font-black hover:bg-amber-700", children: "Genera N squadre" }),
            /* @__PURE__ */ jsx20("button", { onClick: addHomonyms, className: "bg-slate-900 text-white px-4 py-2 rounded-lg font-black hover:bg-slate-800", children: "Aggiungi 5 omonimi (test)" }),
            /* @__PURE__ */ jsxs20("button", { onClick: clearTeams, className: "bg-white border border-amber-300 text-amber-900 px-4 py-2 rounded-lg font-black hover:bg-amber-100 flex items-center gap-2", children: [
              /* @__PURE__ */ jsx20(Trash2, { className: "w-4 h-4" }),
              " Svuota lista iscritti"
            ] })
          ] }),
          /* @__PURE__ */ jsx20("p", { className: "text-xs text-amber-900/70 mt-2", children: "Il simulatore assegna anni casuali 1990-2010 per testare i filtri U25 e le omonimie (Nome + Anno / ND)." })
        ] }) : null,
        /* @__PURE__ */ jsxs20("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
          /* @__PURE__ */ jsx20("div", { className: "bg-slate-50 px-4 py-3 flex items-center justify-between", children: /* @__PURE__ */ jsxs20("div", { className: "font-black", children: [
            "Lista iscritti (",
            sortedTeams.length,
            ")"
          ] }) }),
          /* @__PURE__ */ jsx20("div", { className: "overflow-auto", children: /* @__PURE__ */ jsxs20("table", { className: "min-w-full text-sm", children: [
            /* @__PURE__ */ jsx20("thead", { className: "bg-white sticky top-0 border-b border-slate-100", children: /* @__PURE__ */ jsxs20("tr", { className: "text-left text-slate-500", children: [
              /* @__PURE__ */ jsx20("th", { className: "p-3", children: "Squadra" }),
              /* @__PURE__ */ jsx20("th", { className: "p-3", children: "G1" }),
              /* @__PURE__ */ jsx20("th", { className: "p-3", children: "Anno" }),
              /* @__PURE__ */ jsx20("th", { className: "p-3", children: "G2" }),
              /* @__PURE__ */ jsx20("th", { className: "p-3", children: "Anno" }),
              /* @__PURE__ */ jsx20("th", { className: "p-3", children: "Arb" }),
              /* @__PURE__ */ jsx20("th", { className: "p-3 text-right", children: "Azioni" })
            ] }) }),
            /* @__PURE__ */ jsxs20("tbody", { className: "divide-y divide-slate-100", children: [
              visibleTeams.map((t2) => /* @__PURE__ */ jsxs20("tr", { className: "hover:bg-slate-50", children: [
                /* @__PURE__ */ jsx20("td", { className: "p-3 font-black text-slate-900", children: t2.name }),
                /* @__PURE__ */ jsx20("td", { className: "p-3", children: t2.player1 }),
                /* @__PURE__ */ jsx20("td", { className: "p-3 font-mono", children: t2.player1YoB ?? "ND" }),
                /* @__PURE__ */ jsx20("td", { className: "p-3", children: t2.player2 }),
                /* @__PURE__ */ jsx20("td", { className: "p-3 font-mono", children: t2.player2YoB ?? "ND" }),
                /* @__PURE__ */ jsx20("td", { className: "p-3", children: t2.player1IsReferee || t2.player2IsReferee || t2.isReferee ? /* @__PURE__ */ jsxs20("div", { className: "flex flex-wrap gap-2", children: [
                  t2.player1IsReferee ? /* @__PURE__ */ jsxs20("span", { className: "inline-flex items-center gap-1 text-xs font-black", children: [
                    /* @__PURE__ */ jsx20("span", { children: "G1" }),
                    /* @__PURE__ */ jsx20("span", { children: "\u2705" })
                  ] }) : null,
                  t2.player2IsReferee ? /* @__PURE__ */ jsxs20("span", { className: "inline-flex items-center gap-1 text-xs font-black", children: [
                    /* @__PURE__ */ jsx20("span", { children: "G2" }),
                    /* @__PURE__ */ jsx20("span", { children: "\u2705" })
                  ] }) : null,
                  !t2.player1IsReferee && !t2.player2IsReferee && t2.isReferee ? /* @__PURE__ */ jsxs20("span", { className: "inline-flex items-center gap-1 text-xs font-black", children: [
                    /* @__PURE__ */ jsx20("span", { children: "Arb" }),
                    /* @__PURE__ */ jsx20("span", { children: "\u2705" })
                  ] }) : null
                ] }) : "" }),
                /* @__PURE__ */ jsx20("td", { className: "p-3 text-right", children: /* @__PURE__ */ jsxs20("div", { className: "inline-flex items-center justify-end gap-2", children: [
                  /* @__PURE__ */ jsx20(
                    "button",
                    {
                      type: "button",
                      onClick: () => editTeam(t2.id),
                      title: t2("edit"),
                      "aria-label": t2("edit"),
                      className: "bg-white border border-slate-200 text-slate-900 px-3 py-2 rounded-lg font-black hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                      children: /* @__PURE__ */ jsx20(Pencil, { className: "w-4 h-4" })
                    }
                  ),
                  /* @__PURE__ */ jsx20(
                    "button",
                    {
                      type: "button",
                      onClick: () => deleteTeam(t2.id),
                      title: t2("delete"),
                      "aria-label": t2("delete"),
                      className: "bg-white border border-red-200 text-red-700 px-3 py-2 rounded-lg font-black hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2",
                      children: /* @__PURE__ */ jsx20(Trash2, { className: "w-4 h-4" })
                    }
                  )
                ] }) })
              ] }, t2.id)),
              !visibleTeams.length && /* @__PURE__ */ jsx20("tr", { children: /* @__PURE__ */ jsx20("td", { colSpan: 7, className: "p-6 text-center text-slate-400", children: sortedTeams.length ? t("no_results") : t("no_teams") }) })
            ] })
          ] }) })
        ] })
      ] });
    };
  }
});

// components/admin/SocialGraphicsPanel.tsx
import React15 from "react";
import { jsx as jsx21, jsxs as jsxs21 } from "react/jsx-runtime";
function getDefaultSocialGraphicsConfig() {
  return {
    prelimStartTime: "16:00",
    prelimCallTime: "15:30",
    slots: [
      { id: safeId(), callTime: "15:30", teamsCount: 16 },
      { id: safeId(), callTime: "16:00", teamsCount: 16 }
    ],
    selectedStoryKey: "prelims"
  };
}
function loadSocialGraphicsConfig() {
  const d = getDefaultSocialGraphicsConfig();
  if (typeof window === "undefined") return d;
  try {
    const raw2 = window.localStorage.getItem(SOCIAL_GRAPHICS_STORAGE_KEY);
    if (!raw2) return d;
    const parsed = JSON.parse(raw2);
    const prelimStartTime = typeof parsed.prelimStartTime === "string" ? parsed.prelimStartTime : d.prelimStartTime;
    const prelimCallTime = typeof parsed.prelimCallTime === "string" ? parsed.prelimCallTime : d.prelimCallTime;
    const slots = Array.isArray(parsed.slots) ? parsed.slots.map((s) => ({
      id: typeof s.id === "string" && s.id ? s.id : safeId(),
      callTime: typeof s.callTime === "string" ? s.callTime : "",
      teamsCount: typeof s.teamsCount === "number" && Number.isFinite(s.teamsCount) ? s.teamsCount : 0
    })).filter((s) => s.callTime.trim() || s.teamsCount > 0) : d.slots;
    const selectedStoryKey = typeof parsed.selectedStoryKey === "string" ? parsed.selectedStoryKey : d.selectedStoryKey;
    return {
      prelimStartTime,
      prelimCallTime,
      slots: slots.length ? slots : d.slots,
      selectedStoryKey
    };
  } catch {
    return d;
  }
}
function safeId() {
  return Math.random().toString(36).slice(2, 10);
}
function teamDisplayName(t) {
  const p2 = t.player2 ? ` & ${t.player2}` : "";
  const p1 = t.player1 ? `${t.player1}` : "";
  const players = p1 || t.player2 ? ` (${p1}${p2})` : "";
  return `${t.name}${players}`.trim();
}
function getBracketPrelims(matches, teamsById) {
  const round1 = matches.filter((m) => m.phase === "bracket" && (m.round === 1 || m.roundName === "Round 1"));
  const hasAnyBye = round1.some((m) => m.isBye || String(m.teamAId || "").toUpperCase() === "BYE" || String(m.teamBId || "").toUpperCase() === "BYE");
  if (!hasAnyBye) return [];
  return round1.filter((m) => !m.hidden && !m.isBye).filter((m) => !isByeOrTbd(m.teamAId) && !isByeOrTbd(m.teamBId)).map((m) => {
    const a = m.teamAId ? teamsById[m.teamAId] : void 0;
    const b = m.teamBId ? teamsById[m.teamBId] : void 0;
    if (!a || !b) return null;
    return { a, b };
  }).filter(Boolean);
}
function drawStoryToPng(story, fileKey) {
  const w = 1080;
  const h = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (story.bg === "prelims") {
    grad.addColorStop(0, "#ff512f");
    grad.addColorStop(1, "#dd2476");
  } else {
    grad.addColorStop(0, "#1A2980");
    grad.addColorStop(1, "#26D0CE");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const margin = 80;
  const cardX = margin;
  const cardY = 120;
  const cardW = w - margin * 2;
  const cardH = h - 220;
  const r = 36;
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cardX + r, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
  ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const pad = 64;
  let y = cardY + pad;
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 64px sans-serif";
  ctx.fillText(story.title, cardX + pad, y);
  y += 72;
  ctx.fillStyle = "#334155";
  ctx.font = "700 40px sans-serif";
  ctx.fillText(story.subtitle, cardX + pad, y);
  y += 56;
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 44px sans-serif";
  const maxLines = 18;
  const lines = story.lines.slice(0, maxLines);
  const maxTextWidth = cardW - pad * 2;
  for (let i = 0; i < lines.length; i++) {
    const numberedLine = `${i + 1}. ${lines[i]}`;
    const text = ctx.measureText(numberedLine).width > maxTextWidth ? truncateToWidth(ctx, numberedLine, maxTextWidth) : numberedLine;
    ctx.fillText(text, cardX + pad, y);
    y += 64;
    if (y > cardY + cardH - pad) break;
  }
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  const safeName = (fileKey || story.title).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  a.download = `flbp_story_${safeName || "story"}.png`;
  a.click();
}
function truncateToWidth(ctx, text, maxWidth) {
  let t = text;
  const ell = "\u2026";
  while (t.length > 0 && ctx.measureText(t + ell).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t.length ? t + ell : ell;
}
function SocialGraphicsPanel({ state, draft }) {
  const playableTeams = (state.teams || []).filter((t) => !t.isReferee && !t.hidden && !t.isBye);
  const teamsById = React15.useMemo(() => {
    const map = {};
    for (const t of playableTeams) map[t.id] = t;
    return map;
  }, [playableTeams]);
  const matches = (draft?.m || state.tournamentMatches || []).filter((m) => !m.hidden);
  const prelims = React15.useMemo(() => getBracketPrelims(matches, teamsById), [matches, teamsById]);
  const initialCfg = React15.useMemo(() => loadSocialGraphicsConfig(), []);
  const [prelimStartTime, setPrelimStartTime] = React15.useState(initialCfg.prelimStartTime);
  const [prelimCallTime, setPrelimCallTime] = React15.useState(initialCfg.prelimCallTime);
  const [slots, setSlots] = React15.useState(initialCfg.slots);
  const [selectedStoryKey, setSelectedStoryKey] = React15.useState(initialCfg.selectedStoryKey);
  React15.useEffect(() => {
    try {
      window.localStorage.setItem(
        SOCIAL_GRAPHICS_STORAGE_KEY,
        JSON.stringify({ prelimStartTime, prelimCallTime, slots, selectedStoryKey })
      );
    } catch {
    }
  }, [prelimStartTime, prelimCallTime, slots, selectedStoryKey]);
  const slotAssignments = React15.useMemo(() => {
    const res = [];
    let idx = 0;
    for (const s of slots) {
      const count = clamp(Number(s.teamsCount) || 0, 0, 256);
      const assigned = playableTeams.slice(idx, idx + count);
      idx += count;
      res.push({ slot: s, teams: assigned });
    }
    const leftover = playableTeams.slice(idx);
    return { res, leftover };
  }, [slots, playableTeams]);
  const stories = React15.useMemo(() => {
    const out = [];
    if (prelims.length > 0) {
      out.push({
        key: "prelims",
        label: "Preliminari",
        story: {
          kind: "prelims",
          bg: "prelims",
          title: "PRELIMINARI",
          subtitle: `INIZIO ${prelimStartTime} \u2022 CONVOCAZIONE ${prelimCallTime}`,
          lines: prelims.map((p) => `${p.a.name} vs ${p.b.name}`)
        }
      });
    }
    slotAssignments.res.forEach((a, i) => {
      out.push({
        key: `slot_${i}`,
        label: `Convocazioni ${a.slot.callTime}`,
        story: {
          kind: "slot",
          bg: "slot",
          title: "CONVOCAZIONI",
          subtitle: `ORE ${a.slot.callTime}`,
          lines: a.teams.map(teamDisplayName)
        }
      });
    });
    return out;
  }, [prelims, prelimStartTime, prelimCallTime, slotAssignments.res]);
  const selected = stories.find((s) => s.key === selectedStoryKey) || stories[0];
  return /* @__PURE__ */ jsxs21("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6", children: [
    /* @__PURE__ */ jsxs21("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
      /* @__PURE__ */ jsx21("h3", { className: "text-xl font-black", children: "Grafiche Social (Story 9:16)" }),
      /* @__PURE__ */ jsxs21("div", { className: "flex items-center gap-2 flex-wrap", children: [
        /* @__PURE__ */ jsx21(
          "button",
          {
            onClick: () => {
              const d = getDefaultSocialGraphicsConfig();
              try {
                window.localStorage.removeItem(SOCIAL_GRAPHICS_STORAGE_KEY);
              } catch {
              }
              setPrelimStartTime(d.prelimStartTime);
              setPrelimCallTime(d.prelimCallTime);
              setSlots(d.slots);
              setSelectedStoryKey(d.selectedStoryKey);
            },
            className: "bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100",
            children: "Reset"
          }
        ),
        /* @__PURE__ */ jsx21(
          "button",
          {
            onClick: () => {
              if (!stories.length) return;
              let i = 0;
              const tick = () => {
                const item = stories[i];
                if (!item) return;
                drawStoryToPng(item.story, item.key);
                i += 1;
                if (i < stories.length) {
                  window.setTimeout(tick, 300);
                }
              };
              tick();
            },
            disabled: stories.length === 0,
            className: "bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50",
            children: "Scarica tutte (PNG)"
          }
        ),
        /* @__PURE__ */ jsx21(
          "button",
          {
            onClick: () => selected && drawStoryToPng(selected.story, selected.key),
            disabled: !selected,
            className: "bg-slate-900 text-white px-4 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-800 disabled:opacity-50",
            children: "Scarica PNG"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx21("div", { className: "text-xs font-bold text-slate-500", children: "Impostazioni salvate automaticamente su questo dispositivo. Nota: il browser potrebbe chiedere conferma per download multipli." }),
    /* @__PURE__ */ jsxs21("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
      /* @__PURE__ */ jsxs21("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs21("div", { className: "bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3", children: [
          /* @__PURE__ */ jsx21("div", { className: "font-black text-slate-900", children: "Preliminari (solo se bracket con BYE)" }),
          /* @__PURE__ */ jsxs21("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxs21("div", { children: [
              /* @__PURE__ */ jsx21("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Inizio" }),
              /* @__PURE__ */ jsx21(
                "input",
                {
                  value: prelimStartTime,
                  onChange: (e) => setPrelimStartTime(e.target.value),
                  className: "w-full border border-slate-300 rounded-lg px-3 py-2 font-bold",
                  placeholder: "16:00"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs21("div", { children: [
              /* @__PURE__ */ jsx21("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Convocazione" }),
              /* @__PURE__ */ jsx21(
                "input",
                {
                  value: prelimCallTime,
                  onChange: (e) => setPrelimCallTime(e.target.value),
                  className: "w-full border border-slate-300 rounded-lg px-3 py-2 font-bold",
                  placeholder: "15:30"
                }
              )
            ] })
          ] }),
          prelims.length === 0 ? /* @__PURE__ */ jsx21("div", { className: "text-xs font-bold text-slate-500", children: "Nessun preliminare rilevato (serve un bracket con BYE e match real-vs-real nel Round 1)." }) : /* @__PURE__ */ jsxs21("div", { className: "text-xs font-bold text-slate-700", children: [
            "Preliminari trovati: ",
            prelims.length
          ] })
        ] }),
        /* @__PURE__ */ jsxs21("div", { className: "bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3", children: [
          /* @__PURE__ */ jsx21("div", { className: "font-black text-slate-900", children: "Convocazioni (slot orari)" }),
          /* @__PURE__ */ jsx21("div", { className: "space-y-2", children: slots.map((s, idx) => /* @__PURE__ */ jsxs21("div", { className: "grid grid-cols-12 gap-2 items-end", children: [
            /* @__PURE__ */ jsxs21("div", { className: "col-span-6", children: [
              /* @__PURE__ */ jsx21("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Orario" }),
              /* @__PURE__ */ jsx21(
                "input",
                {
                  value: s.callTime,
                  onChange: (e) => {
                    const v = e.target.value;
                    setSlots((prev) => prev.map((x) => x.id === s.id ? { ...x, callTime: v } : x));
                  },
                  className: "w-full border border-slate-300 rounded-lg px-3 py-2 font-bold",
                  placeholder: "15:30"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs21("div", { className: "col-span-4", children: [
              /* @__PURE__ */ jsx21("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "# Squadre" }),
              /* @__PURE__ */ jsx21(
                "input",
                {
                  type: "number",
                  value: s.teamsCount,
                  onChange: (e) => {
                    const v = Number(e.target.value);
                    setSlots((prev) => prev.map((x) => x.id === s.id ? { ...x, teamsCount: v } : x));
                  },
                  className: "w-full border border-slate-300 rounded-lg px-3 py-2 font-bold",
                  min: 0
                }
              )
            ] }),
            /* @__PURE__ */ jsx21("div", { className: "col-span-2 flex gap-2", children: /* @__PURE__ */ jsx21(
              "button",
              {
                onClick: () => {
                  setSlots((prev) => prev.filter((x) => x.id !== s.id));
                },
                disabled: slots.length <= 1,
                className: "w-full bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50",
                children: "-"
              }
            ) }),
            slotAssignments.res[idx] && /* @__PURE__ */ jsxs21("div", { className: "col-span-12 text-xs font-bold text-slate-500", children: [
              "Assegnate: ",
              slotAssignments.res[idx].teams.length
            ] })
          ] }, s.id)) }),
          /* @__PURE__ */ jsx21(
            "button",
            {
              onClick: () => setSlots((prev) => [...prev, { id: safeId(), callTime: "", teamsCount: 0 }]),
              className: "bg-white border border-slate-200 px-4 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100",
              children: "+ Aggiungi slot"
            }
          ),
          /* @__PURE__ */ jsxs21("div", { className: "text-xs font-bold text-slate-700", children: [
            "Squadre totali (non arbitri): ",
            playableTeams.length
          ] }),
          slotAssignments.leftover.length > 0 && /* @__PURE__ */ jsxs21("div", { className: "text-xs font-bold text-amber-700", children: [
            "Attenzione: ",
            slotAssignments.leftover.length,
            " squadre non assegnate agli slot (rimangono fuori dalla grafica)."
          ] })
        ] }),
        /* @__PURE__ */ jsxs21("div", { className: "bg-white border border-slate-200 rounded-xl p-4 space-y-3", children: [
          /* @__PURE__ */ jsx21("div", { className: "font-black text-slate-900", children: "Seleziona grafica da esportare" }),
          /* @__PURE__ */ jsx21(
            "select",
            {
              value: selectedStoryKey,
              onChange: (e) => setSelectedStoryKey(e.target.value),
              className: "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white",
              children: stories.map((s) => /* @__PURE__ */ jsx21("option", { value: s.key, children: s.label }, s.key))
            }
          ),
          /* @__PURE__ */ jsx21("div", { className: "text-xs font-bold text-slate-500", children: "Suggerimento: usa \u201CStampa/Salva come PDF\u201D solo per referti/tabelloni; qui il pulsante genera un PNG pronto per stories." })
        ] })
      ] }),
      /* @__PURE__ */ jsx21("div", { className: "flex flex-col items-center gap-3", children: selected ? /* @__PURE__ */ jsx21(
        "div",
        {
          className: "w-[360px] h-[640px] rounded-2xl overflow-hidden shadow-lg flex flex-col " + (selected.story.bg === "prelims" ? "bg-gradient-to-br from-[#ff512f] to-[#dd2476]" : "bg-gradient-to-br from-[#1A2980] to-[#26D0CE]"),
          children: /* @__PURE__ */ jsxs21("div", { className: "bg-white/95 m-5 rounded-2xl flex-1 flex flex-col p-5 shadow-md", children: [
            /* @__PURE__ */ jsx21("div", { className: "text-2xl font-black text-slate-900", children: selected.story.title }),
            /* @__PURE__ */ jsx21("div", { className: "text-sm font-bold text-slate-600 mt-1", children: selected.story.subtitle }),
            /* @__PURE__ */ jsx21("div", { className: "mt-4 space-y-2 overflow-hidden", children: selected.story.lines.length === 0 ? /* @__PURE__ */ jsx21("div", { className: "text-sm font-bold text-slate-400", children: "(nessun elemento)" }) : selected.story.lines.slice(0, 18).map((l, i) => /* @__PURE__ */ jsxs21("div", { className: "text-base font-bold text-slate-900 truncate", children: [
              i + 1,
              ". ",
              l
            ] }, i)) }),
            selected.story.lines.length > 18 && /* @__PURE__ */ jsxs21("div", { className: "mt-2 text-xs font-bold text-slate-400", children: [
              "+",
              selected.story.lines.length - 18,
              " non mostrati (limite preview)"
            ] })
          ] })
        }
      ) : /* @__PURE__ */ jsx21("div", { className: "text-sm font-bold text-slate-500", children: "Nessuna grafica disponibile (aggiungi slot o genera un draft bracket con BYE per preliminari)." }) })
    ] })
  ] });
}
var SOCIAL_GRAPHICS_STORAGE_KEY, isByeOrTbd, clamp;
var init_SocialGraphicsPanel = __esm({
  "components/admin/SocialGraphicsPanel.tsx"() {
    SOCIAL_GRAPHICS_STORAGE_KEY = "flbp_social_graphics_v1";
    isByeOrTbd = (id) => {
      const v = String(id || "").toUpperCase();
      return v === "BYE" || v.startsWith("TBD-");
    };
    clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  }
});

// components/admin/tabs/StructureTab.tsx
import { Brackets, Download as Download2, Settings as Settings3, CheckCircle2 as CheckCircle22, PlayCircle } from "lucide-react";
import { Fragment as Fragment6, jsx as jsx22, jsxs as jsxs22 } from "react/jsx-runtime";
var StructureTab;
var init_StructureTab = __esm({
  "components/admin/tabs/StructureTab.tsx"() {
    init_appMode();
    init_SocialGraphicsPanel();
    StructureTab = ({
      state,
      draft,
      tournName,
      setTournName,
      tournMode,
      setTournMode,
      finalRrEnabled,
      setFinalRrEnabled,
      finalRrTopTeams,
      setFinalRrTopTeams,
      numGroups,
      setNumGroups,
      advancing,
      setAdvancing,
      handleGenerate,
      handleStartLive,
      printBracket
    }) => {
      const playableTeamsCount = (state.teams || []).filter((t) => !t.isReferee && !t.hidden && !t.isBye).length;
      const finalToggleDisabled = playableTeamsCount < 4;
      const top8Disabled = playableTeamsCount < 8;
      return /* @__PURE__ */ jsxs22("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6", children: [
        /* @__PURE__ */ jsxs22("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs22("h3", { className: "text-xl font-black flex items-center gap-2", children: [
            /* @__PURE__ */ jsx22(Brackets, { className: "w-5 h-5" }),
            " Generazione Struttura"
          ] }),
          isTesterMode && /* @__PURE__ */ jsxs22(
            "button",
            {
              onClick: printBracket,
              disabled: !(state.tournamentMatches && state.tournamentMatches.length || draft?.m && draft.m.length),
              className: "bg-white border border-slate-200 px-4 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsx22(Download2, { className: "w-4 h-4" }),
                " Export PDF Tabellone"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs22("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
          /* @__PURE__ */ jsx22("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs22("div", { className: "bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6", children: [
            /* @__PURE__ */ jsxs22("div", { className: "flex items-start justify-between gap-4 flex-wrap", children: [
              /* @__PURE__ */ jsxs22("div", { children: [
                /* @__PURE__ */ jsx22("h4", { className: "text-sm font-black tracking-tight text-slate-900", children: "Configurazione" }),
                /* @__PURE__ */ jsxs22("p", { className: "text-xs text-slate-600 mt-1", children: [
                  "Imposta nome, formato e parametri. Il ",
                  /* @__PURE__ */ jsx22("b", { children: "Draft" }),
                  " non modifica il live finch\xE9 non confermi."
                ] })
              ] }),
              /* @__PURE__ */ jsxs22("div", { className: "text-xs font-bold text-slate-700 bg-white/70 border border-slate-200 px-3 py-1 rounded-full", children: [
                "Squadre attive: ",
                playableTeamsCount
              ] })
            ] }),
            /* @__PURE__ */ jsxs22("div", { children: [
              /* @__PURE__ */ jsx22("label", { className: "block text-sm font-bold text-slate-700 mb-1", children: "Nome Torneo" }),
              /* @__PURE__ */ jsx22(
                "input",
                {
                  value: tournName,
                  onChange: (e) => setTournName(e.target.value),
                  className: "w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs22("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
              /* @__PURE__ */ jsxs22("div", { children: [
                /* @__PURE__ */ jsx22("label", { className: "block text-sm font-bold text-slate-700 mb-1", children: "Modalit\xE0" }),
                /* @__PURE__ */ jsxs22(
                  "select",
                  {
                    value: tournMode,
                    onChange: (e) => setTournMode(e.target.value),
                    className: "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white",
                    children: [
                      /* @__PURE__ */ jsx22("option", { value: "round_robin", children: "All'italiana (Girone Unico)" }),
                      /* @__PURE__ */ jsx22("option", { value: "groups_elimination", children: "Gironi + Eliminazione Diretta" }),
                      /* @__PURE__ */ jsx22("option", { value: "elimination", children: "Solo Eliminazione Diretta (Bracket)" })
                    ]
                  }
                )
              ] }),
              tournMode === "groups_elimination" && /* @__PURE__ */ jsxs22(Fragment6, { children: [
                /* @__PURE__ */ jsxs22("div", { children: [
                  /* @__PURE__ */ jsx22("label", { className: "block text-sm font-bold text-slate-700 mb-1", children: "Numero Gironi" }),
                  /* @__PURE__ */ jsx22(
                    "input",
                    {
                      type: "number",
                      value: numGroups,
                      onChange: (e) => setNumGroups(Number(e.target.value)),
                      className: "w-full border border-slate-300 rounded-lg px-3 py-2",
                      min: 1
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs22("div", { children: [
                  /* @__PURE__ */ jsx22("label", { className: "block text-sm font-bold text-slate-700 mb-1", children: "Passano per girone" }),
                  /* @__PURE__ */ jsx22(
                    "input",
                    {
                      type: "number",
                      value: advancing,
                      onChange: (e) => setAdvancing(Number(e.target.value)),
                      className: "w-full border border-slate-300 rounded-lg px-3 py-2",
                      min: 1
                    }
                  )
                ] })
              ] })
            ] }),
            tournMode !== "round_robin" && /* @__PURE__ */ jsxs22("div", { className: "bg-white border border-slate-200 rounded-xl p-4", children: [
              /* @__PURE__ */ jsxs22("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsxs22("div", { children: [
                  /* @__PURE__ */ jsx22("div", { className: "font-black text-slate-900", children: "Girone Finale (All'italiana)" }),
                  /* @__PURE__ */ jsxs22("div", { className: "text-xs font-bold text-slate-500 mt-1", children: [
                    "Opzionale. Si attiva a runtime da ",
                    /* @__PURE__ */ jsx22("b", { children: "Monitor Tabellone" }),
                    " quando i partecipanti (Top4/Top8) sono determinati."
                  ] })
                ] }),
                /* @__PURE__ */ jsxs22("label", { className: "flex items-center gap-2 font-black text-slate-700", children: [
                  /* @__PURE__ */ jsx22(
                    "input",
                    {
                      type: "checkbox",
                      checked: finalRrEnabled,
                      disabled: finalToggleDisabled,
                      onChange: (e) => setFinalRrEnabled(e.target.checked)
                    }
                  ),
                  "Abilita"
                ] })
              ] }),
              /* @__PURE__ */ jsxs22("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mt-4", children: [
                /* @__PURE__ */ jsxs22("div", { children: [
                  /* @__PURE__ */ jsx22("label", { className: "block text-sm font-bold text-slate-700 mb-1", children: "Partecipanti" }),
                  /* @__PURE__ */ jsxs22(
                    "select",
                    {
                      value: finalRrTopTeams,
                      onChange: (e) => setFinalRrTopTeams(Number(e.target.value)),
                      disabled: !finalRrEnabled || finalToggleDisabled,
                      className: "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:opacity-50",
                      children: [
                        /* @__PURE__ */ jsx22("option", { value: 4, children: "Top 4" }),
                        /* @__PURE__ */ jsx22("option", { value: 8, disabled: top8Disabled, children: "Top 8" })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx22("div", { className: "text-xs font-bold text-slate-500 flex items-end", children: finalToggleDisabled ? /* @__PURE__ */ jsx22("div", { className: "text-amber-700", children: "Servono almeno 4 squadre (non arbitri) per abilitare il Girone Finale." }) : finalRrEnabled && top8Disabled && finalRrTopTeams === 8 ? /* @__PURE__ */ jsx22("div", { className: "text-amber-700", children: "Top 8 disponibile solo con almeno 8 squadre (non arbitri)." }) : null })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs22("div", { className: "space-y-6", children: [
            /* @__PURE__ */ jsxs22("div", { className: "bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4", children: [
              /* @__PURE__ */ jsx22("div", { className: "flex items-start justify-between gap-3", children: /* @__PURE__ */ jsxs22("div", { children: [
                /* @__PURE__ */ jsx22("h4", { className: "text-sm font-black tracking-tight text-slate-900", children: "Anteprima & Live" }),
                /* @__PURE__ */ jsx22("p", { className: "text-xs text-slate-600 mt-1", children: "1) Genera il draft \xA0\u2192\xA0 2) Controlla conteggi e struttura \xA0\u2192\xA0 3) Conferma per avviare." })
              ] }) }),
              /* @__PURE__ */ jsxs22(
                "button",
                {
                  onClick: handleGenerate,
                  disabled: !state.teams?.length,
                  className: "bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase tracking-wide flex items-center gap-2 hover:bg-slate-800 disabled:opacity-50 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-2",
                  children: [
                    /* @__PURE__ */ jsx22(Settings3, { className: "w-5 h-5" }),
                    " Genera Anteprima (Draft)"
                  ]
                }
              ),
              !draft && /* @__PURE__ */ jsx22("div", { className: "text-xs text-slate-500", children: "Nessuna anteprima generata. Le modifiche restano locali finch\xE9 non avvii il live." })
            ] }),
            draft && /* @__PURE__ */ jsxs22("div", { className: "border-2 border-dashed border-blue-200 bg-blue-50 p-6 rounded-2xl", children: [
              /* @__PURE__ */ jsxs22("div", { className: "flex items-center gap-3 mb-4", children: [
                /* @__PURE__ */ jsx22(CheckCircle22, { className: "w-8 h-8 text-blue-600" }),
                /* @__PURE__ */ jsxs22("div", { children: [
                  /* @__PURE__ */ jsx22("h4", { className: "font-black text-blue-900 text-lg", children: "Struttura Pronta per il Live" }),
                  /* @__PURE__ */ jsxs22("p", { className: "text-blue-700 text-sm", children: [
                    "Generati: ",
                    draft.t.groups?.length || 0,
                    " gironi, ",
                    draft.t.rounds?.length || 0,
                    " turni bracket, ",
                    draft.m.length,
                    " match totali."
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs22("div", { className: "flex flex-wrap gap-4 text-sm text-blue-800 mb-6", children: [
                /* @__PURE__ */ jsxs22("div", { className: "bg-white px-3 py-1 rounded border border-blue-100", children: [
                  /* @__PURE__ */ jsx22("b", { children: "Match Gironi:" }),
                  " ",
                  draft.m.filter((m) => m.phase === "groups").length
                ] }),
                /* @__PURE__ */ jsxs22("div", { className: "bg-white px-3 py-1 rounded border border-blue-100", children: [
                  /* @__PURE__ */ jsx22("b", { children: "Match Bracket:" }),
                  " ",
                  draft.m.filter((m) => m.phase === "bracket").length
                ] }),
                /* @__PURE__ */ jsxs22("div", { className: "bg-white px-3 py-1 rounded border border-blue-100", children: [
                  /* @__PURE__ */ jsx22("b", { children: "Arbitri:" }),
                  " ",
                  state.teams.filter((t) => t.isReferee).length,
                  " (distribuiti)"
                ] })
              ] }),
              /* @__PURE__ */ jsxs22(
                "button",
                {
                  onClick: handleStartLive,
                  className: "w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-3",
                  children: [
                    /* @__PURE__ */ jsx22(PlayCircle, { className: "w-8 h-8" }),
                    " Conferma e Avvia Live"
                  ]
                }
              ),
              /* @__PURE__ */ jsx22("p", { className: "text-center text-xs text-blue-600 mt-2", children: "Attenzione: cliccando, l'eventuale torneo precedente verr\xE0 archiviato nella history e i dati live sovrascritti." })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx22(SocialGraphicsPanel, { state, draft })
      ] });
    };
  }
});

// components/admin/tabs/ReportsTab.tsx
import React16 from "react";
import { ClipboardList, Upload as Upload2, CheckCircle2 as CheckCircle23, Search as Search5, X as X6, Play } from "lucide-react";
import { Fragment as Fragment7, jsx as jsx23, jsxs as jsxs23 } from "react/jsx-runtime";
var ReportsTab;
var init_ReportsTab = __esm({
  "components/admin/tabs/ReportsTab.tsx"() {
    init_matchUtils();
    ReportsTab = ({
      state,
      reportMatchId,
      handlePickReportMatch,
      getTeamFromCatalog,
      getTeamName,
      reportStatus,
      setReportStatus,
      reportScoreA,
      setReportScoreA,
      reportScoreB,
      setReportScoreB,
      reportStatsForm,
      setReportStatsForm,
      handleSaveReport,
      reportFileRef,
      handleReportFile,
      reportImageBusy,
      reportImageUrl,
      setReportImageUrl,
      reportOcrBusy,
      reportOcrText,
      setReportOcrText
    }) => {
      const [matchQuery, setMatchQuery] = React16.useState("");
      return /* @__PURE__ */ jsxs23("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4", children: [
        /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs23("h3", { className: "text-xl font-black flex items-center gap-2", children: [
            /* @__PURE__ */ jsx23(ClipboardList, { className: "w-5 h-5" }),
            " Referti"
          ] }),
          /* @__PURE__ */ jsxs23("div", { className: "text-xs font-bold text-slate-500", children: [
            "Torneo live: ",
            state.tournament ? "SI" : "NO",
            " \u2022 Match: ",
            (state.tournamentMatches || []).length
          ] })
        ] }),
        !state.tournament && /* @__PURE__ */ jsxs23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: [
          "Nessun torneo live attivo. Vai su ",
          /* @__PURE__ */ jsx23("b", { children: "Struttura" }),
          " \u2192 ",
          /* @__PURE__ */ jsx23("b", { children: "Conferma e Avvia Live" }),
          "."
        ] }),
        state.tournament && /* @__PURE__ */ jsx23(Fragment7, { children: (() => {
          const teamMap = new Map((state.teams || []).map((t) => [t.id, t.name]));
          const msAll = [...state.tournamentMatches || []].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          const current = msAll.find((m) => m.status === "playing") || msAll.find((m) => m.status === "scheduled") || msAll[0];
          const playing = msAll.find((m) => m.status === "playing");
          const selected = reportMatchId ? msAll.find((m) => m.id === reportMatchId) : void 0;
          const formatOpt = (m) => {
            const ids = getMatchParticipantIds(m);
            const names = ids.map((id) => id ? teamMap.get(id) || id : "TBD");
            const code = m.code || "-";
            const status = m.status.toUpperCase();
            const tb = m.isTieBreak ? ` \u2022 SPAREGGIO${typeof m.targetScore === "number" ? ` a ${m.targetScore}` : ""}` : "";
            return `${code} \u2022 ${names.join(" vs ")}${tb} \u2022 ${status}`;
          };
          const normalizedQuery = matchQuery.trim().toLowerCase();
          const matchesForSelect = normalizedQuery ? msAll.filter((m) => {
            const ids = getMatchParticipantIds(m);
            const names = ids.map((id) => id ? teamMap.get(id) || id : "TBD");
            const hay = `${m.code || ""} ${names.join(" ")} ${m.status}`.toLowerCase();
            return hay.includes(normalizedQuery);
          }) : msAll;
          const selectedIds = selected ? getMatchParticipantIds(selected) : [];
          const selectedTeams = selected ? selectedIds.filter((id) => id && id !== "BYE").map((id) => getTeamFromCatalog(id)).filter(Boolean) : [];
          const isMulti = !!selected && selectedIds.length >= 3;
          const tA = !isMulti && selected ? getTeamFromCatalog(selected.teamAId) : void 0;
          const tB = !isMulti && selected ? getTeamFromCatalog(selected.teamBId) : void 0;
          const computeTeamScoreFromForm = (teamId, p1, p2) => {
            const getCan = (playerName) => {
              if (!playerName) return 0;
              const k = `${teamId}||${playerName}`;
              const f = reportStatsForm[k] || { canestri: "0", soffi: "0" };
              return Math.max(0, parseInt(f.canestri || "0", 10) || 0);
            };
            return getCan(p1) + getCan(p2);
          };
          const renderPlayerRow = (teamId, playerName) => {
            const k = `${teamId}||${playerName}`;
            const f = reportStatsForm[k] || { canestri: "0", soffi: "0" };
            return /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-12 gap-2 items-center py-1", children: [
              /* @__PURE__ */ jsx23("div", { className: "col-span-6 font-black text-xs text-slate-800 truncate", children: playerName }),
              /* @__PURE__ */ jsx23("div", { className: "col-span-3", children: /* @__PURE__ */ jsx23(
                "input",
                {
                  type: "number",
                  min: 0,
                  value: f.canestri,
                  onChange: (e) => {
                    const v = e.target.value;
                    setReportStatsForm((prev) => ({
                      ...prev,
                      [k]: { ...prev[k] || { canestri: "0", soffi: "0" }, canestri: v }
                    }));
                  },
                  className: "w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-black",
                  placeholder: "PT"
                }
              ) }),
              /* @__PURE__ */ jsx23("div", { className: "col-span-3", children: /* @__PURE__ */ jsx23(
                "input",
                {
                  type: "number",
                  min: 0,
                  value: f.soffi,
                  onChange: (e) => {
                    const v = e.target.value;
                    setReportStatsForm((prev) => ({
                      ...prev,
                      [k]: { ...prev[k] || { canestri: "0", soffi: "0" }, soffi: v }
                    }));
                  },
                  className: "w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-black",
                  placeholder: "SF"
                }
              ) })
            ] }, k);
          };
          return /* @__PURE__ */ jsxs23("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs23("div", { className: "bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3", children: [
              /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsx23("div", { className: "font-black text-slate-900", children: "1) Seleziona match" }),
                /* @__PURE__ */ jsxs23("div", { className: "text-[11px] font-bold text-slate-500", children: [
                  matchesForSelect.length,
                  "/",
                  msAll.length,
                  " mostrati"
                ] })
              ] }),
              /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-1 md:grid-cols-12 gap-2", children: [
                /* @__PURE__ */ jsx23("div", { className: "md:col-span-4", children: /* @__PURE__ */ jsxs23("div", { className: "relative", children: [
                  /* @__PURE__ */ jsx23(Search5, { className: "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" }),
                  /* @__PURE__ */ jsx23(
                    "input",
                    {
                      value: matchQuery,
                      onChange: (e) => setMatchQuery(e.target.value),
                      placeholder: "Cerca codice o squadra\u2026",
                      className: "w-full pl-9 pr-9 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                    }
                  ),
                  matchQuery.trim() && /* @__PURE__ */ jsx23(
                    "button",
                    {
                      type: "button",
                      onClick: () => setMatchQuery(""),
                      className: "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                      "aria-label": "Pulisci ricerca",
                      title: "Pulisci",
                      children: /* @__PURE__ */ jsx23(X6, { className: "w-4 h-4 text-slate-500" })
                    }
                  )
                ] }) }),
                /* @__PURE__ */ jsx23("div", { className: "md:col-span-6", children: /* @__PURE__ */ jsxs23(
                  "select",
                  {
                    value: selected?.id || "",
                    onChange: (e) => handlePickReportMatch(e.target.value),
                    className: "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    children: [
                      /* @__PURE__ */ jsx23("option", { value: "", children: "Seleziona match\u2026" }),
                      matchesForSelect.map((m) => /* @__PURE__ */ jsx23("option", { value: m.id, children: formatOpt(m) }, m.id))
                    ]
                  }
                ) }),
                /* @__PURE__ */ jsxs23("div", { className: "md:col-span-2 flex gap-2", children: [
                  /* @__PURE__ */ jsx23(
                    "button",
                    {
                      type: "button",
                      onClick: () => current && handlePickReportMatch(current.id),
                      className: "flex-1 px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                      title: "Seleziona automaticamente il prossimo match (in corso/da giocare)",
                      children: "Prossimo"
                    }
                  ),
                  /* @__PURE__ */ jsx23(
                    "button",
                    {
                      type: "button",
                      onClick: () => playing && handlePickReportMatch(playing.id),
                      disabled: !playing,
                      className: `px-3 py-2 rounded-xl font-black border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center justify-center ${playing ? "border-slate-200 bg-white hover:bg-slate-100" : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"}`,
                      "aria-label": "Vai al match in corso",
                      title: playing ? "Vai al match in corso" : "Nessun match in corso",
                      children: /* @__PURE__ */ jsx23(Play, { className: "w-4 h-4" })
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs23("div", { className: "text-[11px] font-bold text-slate-500", children: [
                "Tip: filtra per ",
                /* @__PURE__ */ jsx23("span", { className: "font-black", children: "codice match" }),
                " o nome squadra. Il referto salva anche per aggiornare il tabellone."
              ] })
            ] }),
            !selected && /* @__PURE__ */ jsx23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: "Seleziona un match per compilare il referto." }),
            selected && /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs23("div", { className: "border border-slate-200 rounded-xl p-4 space-y-4", children: [
                /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between gap-2 flex-wrap", children: [
                  /* @__PURE__ */ jsx23("div", { className: "text-[11px] font-black text-slate-500 uppercase", children: "2) Dati match" }),
                  /* @__PURE__ */ jsx23("div", { className: "text-[11px] font-bold text-slate-500", children: "3) Statistiche \u2022 4) Salva" })
                ] }),
                /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between gap-2 flex-wrap", children: [
                  /* @__PURE__ */ jsxs23("div", { className: "font-black text-slate-900", children: [
                    selected.code || "-",
                    " ",
                    selected.isTieBreak && /* @__PURE__ */ jsxs23("span", { className: `text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${selectedTeams.length >= 3 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-amber-50 text-amber-800 border-amber-200"}`, children: [
                      "SPAREGGIO",
                      selectedTeams.length >= 3 ? " MULTI" : "",
                      typeof selected.targetScore === "number" ? ` a ${selected.targetScore}` : ""
                    ] }),
                    /* @__PURE__ */ jsx23("span", { className: "text-slate-400", children: "\u2022" }),
                    " ",
                    isMulti ? selectedIds.map((id) => getTeamName(id)).join(" vs ") : /* @__PURE__ */ jsxs23(Fragment7, { children: [
                      getTeamName(selected.teamAId),
                      " ",
                      /* @__PURE__ */ jsx23("span", { className: "text-slate-400", children: "vs" }),
                      " ",
                      getTeamName(selected.teamBId)
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs23("div", { className: "text-xs font-bold text-slate-500 uppercase", children: [
                    selected.phase === "groups" ? "GIRONI" : "BRACKET",
                    " \u2022 ",
                    selected.status
                  ] })
                ] }),
                !isMulti ? /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-3 gap-3 items-end", children: [
                  /* @__PURE__ */ jsxs23("div", { children: [
                    /* @__PURE__ */ jsx23("div", { className: "text-[10px] font-black text-slate-500 uppercase mb-1", children: "Team A" }),
                    /* @__PURE__ */ jsx23(
                      "input",
                      {
                        type: "number",
                        min: 0,
                        value: reportScoreA,
                        onChange: (e) => setReportScoreA(e.target.value),
                        readOnly: true,
                        className: "w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xl font-black text-center focus:border-beer-500 outline-none bg-slate-50",
                        title: "Lo score viene calcolato dai canestri dei giocatori"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx23("div", { className: "text-center font-black text-slate-300 text-2xl pb-2", children: "-" }),
                  /* @__PURE__ */ jsxs23("div", { children: [
                    /* @__PURE__ */ jsx23("div", { className: "text-[10px] font-black text-slate-500 uppercase mb-1", children: "Team B" }),
                    /* @__PURE__ */ jsx23(
                      "input",
                      {
                        type: "number",
                        min: 0,
                        value: reportScoreB,
                        onChange: (e) => setReportScoreB(e.target.value),
                        readOnly: true,
                        className: "w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xl font-black text-center focus:border-beer-500 outline-none bg-slate-50",
                        title: "Lo score viene calcolato dai canestri dei giocatori"
                      }
                    )
                  ] })
                ] }) : /* @__PURE__ */ jsxs23("div", { className: "space-y-2", children: [
                  /* @__PURE__ */ jsx23("div", { className: "text-[10px] font-black text-slate-500 uppercase", children: "Punteggi (derivati dai canestri)" }),
                  /* @__PURE__ */ jsx23("div", { className: "divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden", children: selectedTeams.map((tt) => /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between px-3 py-2 bg-white", children: [
                    /* @__PURE__ */ jsx23("div", { className: "font-black text-sm text-slate-900 truncate", children: tt.name || tt.id }),
                    /* @__PURE__ */ jsx23("div", { className: "font-mono font-black text-slate-700", children: computeTeamScoreFromForm(tt.id, tt.player1, tt.player2) })
                  ] }, tt.id)) })
                ] }),
                /* @__PURE__ */ jsxs23("div", { className: "flex items-center gap-2 flex-wrap", children: [
                  /* @__PURE__ */ jsx23("div", { className: "text-xs font-black text-slate-500 uppercase", children: "Stato" }),
                  /* @__PURE__ */ jsxs23(
                    "select",
                    {
                      value: reportStatus,
                      onChange: (e) => setReportStatus(e.target.value),
                      className: "border border-slate-200 rounded-lg px-3 py-2 text-xs font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                      children: [
                        /* @__PURE__ */ jsx23("option", { value: "scheduled", children: "Da giocare" }),
                        /* @__PURE__ */ jsx23("option", { value: "playing", children: "In corso" }),
                        /* @__PURE__ */ jsx23("option", { value: "finished", children: "Giocata" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx23("div", { className: "text-[10px] font-bold text-slate-400", children: "Suggerimento: salva \u201CGiocata\u201D per propagare il vincitore nel tabellone." })
                ] }),
                /* @__PURE__ */ jsxs23("div", { className: "border-t border-slate-100 pt-3 space-y-3", children: [
                  /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between", children: [
                    /* @__PURE__ */ jsx23("div", { className: "font-black text-slate-800", children: "Statistiche" }),
                    /* @__PURE__ */ jsx23("div", { className: "text-[10px] font-bold text-slate-400", children: "PT = canestri \u2022 SF = soffi" })
                  ] }),
                  !isMulti ? /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
                    /* @__PURE__ */ jsxs23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-3", children: [
                      /* @__PURE__ */ jsx23("div", { className: "font-black text-xs text-slate-700 mb-2 uppercase", children: tA?.name || getTeamName(selected.teamAId) }),
                      tA?.id && tA.id !== "BYE" && /* @__PURE__ */ jsxs23(Fragment7, { children: [
                        tA.player1 && renderPlayerRow(tA.id, tA.player1),
                        tA.player2 && renderPlayerRow(tA.id, tA.player2)
                      ] }),
                      !tA?.id && /* @__PURE__ */ jsx23("div", { className: "text-xs text-slate-400 font-bold", children: "N/D" })
                    ] }),
                    /* @__PURE__ */ jsxs23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-3", children: [
                      /* @__PURE__ */ jsx23("div", { className: "font-black text-xs text-slate-700 mb-2 uppercase", children: tB?.name || getTeamName(selected.teamBId) }),
                      tB?.id && tB.id !== "BYE" && /* @__PURE__ */ jsxs23(Fragment7, { children: [
                        tB.player1 && renderPlayerRow(tB.id, tB.player1),
                        tB.player2 && renderPlayerRow(tB.id, tB.player2)
                      ] }),
                      !tB?.id && /* @__PURE__ */ jsx23("div", { className: "text-xs text-slate-400 font-bold", children: "N/D" })
                    ] })
                  ] }) : /* @__PURE__ */ jsxs23("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
                    selectedTeams.map((tt) => /* @__PURE__ */ jsxs23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-3", children: [
                      /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between gap-3 mb-2", children: [
                        /* @__PURE__ */ jsx23("div", { className: "font-black text-xs text-slate-700 uppercase truncate", children: tt.name || tt.id }),
                        /* @__PURE__ */ jsx23("div", { className: "text-xs font-mono font-black text-slate-600", children: computeTeamScoreFromForm(tt.id, tt.player1, tt.player2) })
                      ] }),
                      tt.id && tt.id !== "BYE" && /* @__PURE__ */ jsxs23(Fragment7, { children: [
                        tt.player1 && renderPlayerRow(tt.id, tt.player1),
                        tt.player2 && renderPlayerRow(tt.id, tt.player2)
                      ] })
                    ] }, tt.id)),
                    !selectedTeams.length && /* @__PURE__ */ jsx23("div", { className: "text-xs text-slate-400 font-bold", children: "N/D" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs23(
                  "button",
                  {
                    type: "button",
                    onClick: handleSaveReport,
                    className: "w-full bg-beer-500 text-white py-3 rounded-xl font-black uppercase hover:bg-beer-600 transition flex items-center justify-center gap-2",
                    children: [
                      /* @__PURE__ */ jsx23(CheckCircle23, { className: "w-5 h-5" }),
                      " Salva Referto"
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs23("div", { className: "border border-slate-200 rounded-xl p-4 space-y-3", children: [
                /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between gap-2 flex-wrap", children: [
                  /* @__PURE__ */ jsxs23("div", { children: [
                    /* @__PURE__ */ jsx23("div", { className: "text-[11px] font-black text-slate-500 uppercase", children: "Foto & OCR (opzionale)" }),
                    /* @__PURE__ */ jsx23("div", { className: "font-black text-slate-900", children: "Allega referto" })
                  ] }),
                  /* @__PURE__ */ jsxs23("div", { className: "flex gap-2", children: [
                    /* @__PURE__ */ jsxs23(
                      "button",
                      {
                        type: "button",
                        onClick: () => reportFileRef.current?.click(),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                        children: [
                          /* @__PURE__ */ jsx23(Upload2, { className: "w-4 h-4" }),
                          " Carica foto"
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsx23(
                      "button",
                      {
                        type: "button",
                        onClick: () => setReportImageUrl(""),
                        disabled: !reportImageUrl || reportImageBusy,
                        className: `px-3 py-2 rounded-xl font-black border focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${!reportImageUrl || reportImageBusy ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed" : "border-slate-200 bg-white hover:bg-slate-50"}`,
                        children: "Pulisci"
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsx23("div", { className: "text-[11px] font-bold text-slate-500", children: "La foto aiuta la lettura: puoi copiare i dati nel form a sinistra. L\u2019OCR \xE8 solo un supporto." }),
                /* @__PURE__ */ jsx23(
                  "input",
                  {
                    ref: reportFileRef,
                    type: "file",
                    accept: "image/*",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (f) handleReportFile(f);
                    }
                  }
                ),
                reportImageBusy && /* @__PURE__ */ jsx23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: "Elaborazione immagine\u2026" }),
                !reportImageBusy && !reportImageUrl && /* @__PURE__ */ jsx23("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: "Carica una foto del referto: verr\xE0 allineata automaticamente per aiutarti nella lettura." }),
                !reportImageBusy && reportImageUrl && /* @__PURE__ */ jsxs23("div", { className: "bg-white border border-slate-200 rounded-xl p-2 overflow-auto space-y-2", children: [
                  /* @__PURE__ */ jsx23("img", { src: reportImageUrl, alt: "Referto allineato", className: "w-full h-auto rounded-lg" }),
                  /* @__PURE__ */ jsxs23("div", { className: "flex items-center justify-between", children: [
                    /* @__PURE__ */ jsx23("div", { className: "text-xs font-black text-slate-600 uppercase", children: "OCR (beta)" }),
                    reportOcrBusy && /* @__PURE__ */ jsx23("div", { className: "text-xs font-bold text-slate-500", children: "Lettura in corso\u2026" })
                  ] }),
                  /* @__PURE__ */ jsx23(
                    "textarea",
                    {
                      value: reportOcrText,
                      onChange: (e) => setReportOcrText(e.target.value),
                      placeholder: "Testo letto (se disponibile)\u2026",
                      className: "w-full h-32 border border-slate-200 rounded-lg px-2 py-2 text-xs font-mono text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                    }
                  )
                ] })
              ] })
            ] })
          ] });
        })() })
      ] });
    };
  }
});

// components/admin/tabs/RefereesTab.tsx
import React17 from "react";
import { Printer, Search as Search6, ShieldCheck, X as X7 } from "lucide-react";
import { Fragment as Fragment8, jsx as jsx24, jsxs as jsxs24 } from "react/jsx-runtime";
var RefereesTab;
var init_RefereesTab = __esm({
  "components/admin/tabs/RefereesTab.tsx"() {
    init_storageService();
    init_matchUtils();
    RefereesTab = ({ state, refTables, setRefTables, getTeamName }) => {
      const [query, setQuery] = React17.useState("");
      const nTables = Math.max(1, Math.floor(refTables || 1));
      return /* @__PURE__ */ jsxs24("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4", children: [
        /* @__PURE__ */ jsxs24("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxs24("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs24("h3", { className: "text-xl font-black flex items-center gap-2", children: [
              /* @__PURE__ */ jsx24(ShieldCheck, { className: "w-5 h-5" }),
              " Arbitri"
            ] }),
            /* @__PURE__ */ jsx24("div", { className: "text-xs font-bold text-slate-500 mt-1", children: "Suggerimenti rapidi su disponibilit\xE0 arbitri per turno + stampa referti (UI-only, logica invariata)." })
          ] }),
          /* @__PURE__ */ jsxs24("div", { className: "flex flex-col gap-2 sm:items-end", children: [
            /* @__PURE__ */ jsxs24("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
              /* @__PURE__ */ jsxs24("div", { className: "relative", children: [
                /* @__PURE__ */ jsx24(Search6, { className: "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" }),
                /* @__PURE__ */ jsx24(
                  "input",
                  {
                    value: query,
                    onChange: (e) => setQuery(e.target.value),
                    placeholder: "Cerca arbitro o squadra\u2026",
                    className: "w-60 max-w-full pl-9 pr-9 border border-slate-200 rounded-lg px-3 py-2 text-sm font-black bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                  }
                ),
                query.trim() && /* @__PURE__ */ jsx24(
                  "button",
                  {
                    type: "button",
                    onClick: () => setQuery(""),
                    className: "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    "aria-label": "Pulisci ricerca",
                    title: "Pulisci",
                    children: /* @__PURE__ */ jsx24(X7, { className: "w-4 h-4 text-slate-500" })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs24("div", { className: "flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2", children: [
                /* @__PURE__ */ jsx24("div", { className: "text-xs font-black text-slate-700 whitespace-nowrap", children: "Tavoli" }),
                /* @__PURE__ */ jsx24(
                  "input",
                  {
                    type: "number",
                    min: 1,
                    value: refTables,
                    onChange: (e) => {
                      const v = Math.max(1, parseInt(e.target.value || "0", 10) || 1);
                      setRefTables(v);
                      try {
                        localStorage.setItem("flbp_ref_tables", String(v));
                      } catch {
                      }
                    },
                    className: "w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm font-black bg-white text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    "aria-label": "Numero tavoli (partite contemporanee)"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs24("div", { className: "text-xs font-bold text-slate-500", children: [
              "Turno = blocchi da ",
              /* @__PURE__ */ jsx24("b", { children: nTables }),
              " match"
            ] })
          ] })
        ] }),
        !state.tournament && /* @__PURE__ */ jsxs24("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: [
          "Nessun torneo live attivo. Vai su ",
          /* @__PURE__ */ jsx24("b", { children: "Struttura" }),
          " \u2192 ",
          /* @__PURE__ */ jsx24("b", { children: "Conferma e Avvia Live" }),
          "."
        ] }),
        state.tournament && /* @__PURE__ */ jsx24(Fragment8, { children: (() => {
          const catalog = state.tournament?.teams && state.tournament.teams.length ? state.tournament.teams : state.teams || [];
          const teamById = new Map(catalog.map((t) => [t.id, t]));
          const refsAll = [];
          catalog.forEach((team) => {
            const p1Legacy = !!team.isReferee && !team.player2IsReferee;
            const p1Ref = !!team.player1IsReferee || p1Legacy;
            const p2Ref = !!team.player2IsReferee;
            if (p1Ref && team.player1) {
              const id = getPlayerKey(team.player1, team.player1YoB ?? "ND");
              refsAll.push({ id, name: team.player1, yob: team.player1YoB, teamId: team.id, teamName: team.name, slot: "G1" });
            }
            if (p2Ref && team.player2) {
              const id = getPlayerKey(team.player2, team.player2YoB ?? "ND");
              refsAll.push({ id, name: team.player2, yob: team.player2YoB, teamId: team.id, teamName: team.name, slot: "G2" });
            }
          });
          const seen = /* @__PURE__ */ new Set();
          const refs = refsAll.filter((r) => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
          });
          const q = query.trim().toLowerCase();
          const refsFiltered = !q ? refs : refs.filter((r) => {
            const name = (r.name || "").toLowerCase();
            const team = (r.teamName || "").toLowerCase();
            const yob = r.yob != null ? String(r.yob) : "";
            return name.includes(q) || team.includes(q) || yob.includes(q);
          });
          const isPlaceholder = (id) => !id || id === "BYE" || String(id).startsWith("TBD-");
          const hasValidParticipants = (m) => {
            const ids = getMatchParticipantIds(m);
            if (ids.length < 2) return false;
            return ids.every((id) => !isPlaceholder(id));
          };
          const msAll = [...state.tournamentMatches || []].filter((m) => m.status !== "finished").filter((m) => !m.hidden).filter((m) => !m.isBye).filter((m) => hasValidParticipants(m)).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          const blocks = [];
          for (let i = 0; i < msAll.length; i += nTables) blocks.push(msAll.slice(i, i + nTables));
          const playingIdxs = msAll.map((m, i) => m.status === "playing" ? i : -1).filter((i) => i >= 0);
          const currentBlockIdx = playingIdxs.length ? Math.floor(Math.min(...playingIdxs) / nTables) : 0;
          const currentMatches = blocks[currentBlockIdx] || [];
          const nextMatches = blocks[currentBlockIdx + 1] || [];
          const escapeHtml = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
          const openPrintWindow = (title, bodyHtml) => {
            const w = window.open("", "_blank", "noopener,noreferrer");
            if (!w) {
              alert("Popup bloccato: abilita i popup per stampare.");
              return;
            }
            w.document.open();
            w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
                        <style>
                          @page{ size:A4; margin:10mm; }
                          body{ font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; margin:0; padding:0; }
                          .page{ page-break-after:always; }
                          .page:last-child{ page-break-after:auto; }
                          .pageInner{ padding:0; display:flex; flex-direction:column; gap:10mm; }
                          .sheet{ border:2px solid #000; padding:6mm; box-sizing:border-box; }
                          .hdr{ display:flex; align-items:center; justify-content:space-between; gap:8mm; margin-bottom:4mm; }
                          .hdrLeft{ font-weight:900; font-size:14px; }
                          .hdrRight{ display:flex; align-items:center; gap:4mm; }
                          .logo{ width:22mm; height:auto; }
                          .meta{ width:100%; border-collapse:collapse; margin-bottom:4mm; }
                          .meta td{ border:1px solid #000; padding:2mm 3mm; font-size:11px; font-weight:800; vertical-align:top; }
                          .muted{ font-weight:700; }
                          .box{ display:inline-block; width:4mm; height:4mm; border:1px solid #000; line-height:4mm; text-align:center; font-size:11px; font-weight:900; vertical-align:middle; }
                          .teams{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; }
                          .teamBox{ border:1px solid #000; padding:3mm; }
                          .teamTitle{ font-size:12px; font-weight:900; margin-bottom:2mm; }
                          .playerTitle{ font-size:11px; font-weight:900; margin:2mm 0 1mm 0; }
                          .grid15{ width:100%; border-collapse:collapse; }
                          .grid15 td{ border:1px solid #000; padding:1.2mm 1.4mm; font-size:10px; }
                          .tiny{ font-size:9px; font-weight:800; }
                          .totRow{ display:flex; gap:6mm; margin-top:2mm; }
                          .totItem{ border:1px solid #000; padding:2mm 3mm; font-size:10px; font-weight:900; }
                          .winner{ margin-top:4mm; border:1px solid #000; padding:3mm; }
                          .winnerLine{ display:flex; gap:6mm; align-items:center; font-size:11px; font-weight:900; }
                          .foot{ margin-top:3mm; font-size:10px; font-weight:800; display:flex; justify-content:flex-end; }
                        </style>
                        </head><body>${bodyHtml}</body></html>`);
            w.document.close();
            w.focus();
            w.print();
          };
          const getTeamsForMatch = (m) => {
            const ids = getMatchParticipantIds(m);
            const aId = ids[0];
            const bId = ids[1];
            return {
              aId,
              bId,
              a: aId ? teamById.get(aId) : void 0,
              b: bId ? teamById.get(bId) : void 0
            };
          };
          const renderSheet = (m, turnoLabel) => {
            const { aId, bId, a, b } = getTeamsForMatch(m);
            const matchIdLabel = m.code || m.id || "-";
            const isGroups = m.phase === "groups";
            const phaseLabel = isGroups ? "Gironi" : "Eliminazione Diretta";
            const roundLabel = (m.roundName || m.groupName || "").trim();
            const aName = a?.name || getTeamName(aId) || "";
            const bName = b?.name || getTeamName(bId) || "";
            const aP1 = a?.player1 || "";
            const aP2 = a?.player2 || "";
            const bP1 = b?.player1 || "";
            const bP2 = b?.player2 || "";
            const rows15 = Array.from({ length: 15 }).map((_, i) => {
              const n = i + 1;
              return `<tr><td style="width:10mm"><b>${n}</b></td><td style="width:10mm" class="tiny">x2</td><td class="tiny" style="width:18mm">SOFFI</td></tr>`;
            }).join("");
            const playerGrid = () => `<table class="grid15"><tbody>${rows15}</tbody></table>
                             <div class="totRow">
                               <div class="totItem">TOT CANESTRI&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
                               <div class="totItem">TOT SOFFI&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
                             </div>`;
            return `
                          <div class="sheet">
                            <div class="hdr">
                              <div class="hdrLeft">REFERTO GARA FLBP 2025</div>
                              <div class="hdrRight">
                                <img class="logo" src="/flbp_logo_2025.svg" alt="FLBP" />
                              </div>
                            </div>
                            <table class="meta">
                              <tbody>
                                <tr>
                                  <td style="width:33%">ID PARTITA<br/><span class="muted">${escapeHtml(matchIdLabel)}</span></td>
                                  <td style="width:34%">FASE DEL TORNEO<br/>
                                    <span class="muted">${escapeHtml(phaseLabel)}</span>
                                    <div style="margin-top:2mm">
                                      Gironi <span class="box">${isGroups ? "X" : ""}</span>&nbsp;&nbsp;
                                      Eliminazione Diretta <span class="box">${!isGroups ? "X" : ""}</span>
                                    </div>
                                  </td>
                                  <td style="width:33%">Turno:<br/><span class="muted">${escapeHtml(turnoLabel)}${roundLabel ? ` \u2022 ${escapeHtml(roundLabel)}` : ""}</span></td>
                                </tr>
                              </tbody>
                            </table>

                            <div class="teams">
                              <div class="teamBox">
                                <div class="teamTitle">SQUADRA A: <span class="muted">${escapeHtml(aName)}</span></div>
                                <div class="playerTitle">GIOCATORE 1: <span class="muted">${escapeHtml(aP1)}</span></div>
                                ${playerGrid()}
                                <div class="playerTitle" style="margin-top:4mm">GIOCATORE 2: <span class="muted">${escapeHtml(aP2)}</span></div>
                                ${playerGrid()}
                              </div>
                              <div class="teamBox">
                                <div class="teamTitle">SQUADRA B: <span class="muted">${escapeHtml(bName)}</span></div>
                                <div class="playerTitle">GIOCATORE 1: <span class="muted">${escapeHtml(bP1)}</span></div>
                                ${playerGrid()}
                                <div class="playerTitle" style="margin-top:4mm">GIOCATORE 2: <span class="muted">${escapeHtml(bP2)}</span></div>
                                ${playerGrid()}
                              </div>
                            </div>

                            <div class="winner">
                              <div class="winnerLine">ESITO INCONTRO</div>
                              <div class="winnerLine" style="margin-top:2mm">
                                Vince SQUADRA A <span class="box"></span>
                                &nbsp;&nbsp;&nbsp;&nbsp;
                                Vince SQUADRA B <span class="box"></span>
                              </div>
                            </div>
                            <div class="foot">FLBP-OCR-v2.4</div>
                          </div>
                        `;
          };
          const printRefSheets = (title, ms, turnoNumber) => {
            if (!ms.length) {
              alert("Nessuna partita da stampare in questo turno.");
              return;
            }
            const pages = [];
            for (let i = 0; i < ms.length; i += 2) pages.push(ms.slice(i, i + 2));
            const body = pages.map((pageMs) => {
              const turnLabel = String(turnoNumber);
              const sheets = pageMs.map((m) => renderSheet(m, turnLabel)).join("");
              return `<div class="page"><div class="pageInner">${sheets}</div></div>`;
            }).join("");
            openPrintWindow(title, body);
          };
          const playersIn = (ms) => {
            const s = /* @__PURE__ */ new Set();
            ms.forEach((m) => {
              getMatchParticipantIds(m).forEach((id) => {
                if (!id) return;
                const team = teamById.get(id);
                if (!team) return;
                const p1Id = resolvePlayerKey(state, getPlayerKey(team.player1, team.player1YoB ?? "ND"));
                s.add(p1Id);
                if (team.player2) {
                  const p2Id = resolvePlayerKey(state, getPlayerKey(team.player2, team.player2YoB ?? "ND"));
                  s.add(p2Id);
                }
              });
            });
            return s;
          };
          const currentPlayers = playersIn(currentMatches);
          const nextPlayers = playersIn(nextMatches);
          const engagedNow = refsFiltered.filter((r) => currentPlayers.has(r.id));
          const engagedNext = refsFiltered.filter((r) => !currentPlayers.has(r.id) && nextPlayers.has(r.id));
          const freeNow = refsFiltered.filter((r) => !currentPlayers.has(r.id) && !nextPlayers.has(r.id));
          const fmtRef = (r) => {
            const y = r.yob ? String(r.yob).slice(-2) : "ND";
            return /* @__PURE__ */ jsx24("div", { className: "py-2 flex items-center justify-between gap-3", children: /* @__PURE__ */ jsxs24("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxs24("div", { className: "flex items-center gap-2 min-w-0", children: [
                /* @__PURE__ */ jsx24("span", { className: "font-black text-slate-900 truncate", children: r.name }),
                /* @__PURE__ */ jsxs24("span", { className: "text-xs font-black text-slate-500", children: [
                  "(",
                  y,
                  ")"
                ] }),
                isU25(r.yob) && /* @__PURE__ */ jsx24("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-black border border-amber-200 bg-amber-50 text-amber-800", children: "U25" }),
                /* @__PURE__ */ jsx24("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-black border border-slate-200 bg-slate-50 text-slate-700", children: r.slot })
              ] }),
              /* @__PURE__ */ jsx24("div", { className: "text-xs font-bold text-slate-500 truncate", children: r.teamName })
            ] }) }, r.id);
          };
          const renderBox = (title, tone, list, emptyText) => {
            const toneClasses = tone === "emerald" ? "border-emerald-200 bg-emerald-50" : tone === "rose" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50";
            return /* @__PURE__ */ jsxs24("div", { className: `border rounded-xl p-4 ${toneClasses}`, children: [
              /* @__PURE__ */ jsxs24("div", { className: "flex items-center justify-between gap-3 mb-2", children: [
                /* @__PURE__ */ jsx24("div", { className: "font-black text-slate-900", children: title }),
                /* @__PURE__ */ jsx24("div", { className: "text-xs font-black text-slate-700", children: list.length })
              ] }),
              list.length === 0 ? /* @__PURE__ */ jsx24("div", { className: "text-sm font-bold text-slate-600", children: emptyText }) : /* @__PURE__ */ jsx24("div", { className: "divide-y divide-slate-200", children: list.map(fmtRef) })
            ] });
          };
          const fmtMatch = (m) => {
            const code = m.code || "-";
            const ids = getMatchParticipantIds(m);
            const names = ids.map((id) => getTeamName(id));
            return `${code} \u2022 ${names.join(" vs ")}`;
          };
          return /* @__PURE__ */ jsxs24("div", { className: "space-y-4", children: [
            /* @__PURE__ */ jsxs24("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs24("div", { className: "border border-slate-200 rounded-xl p-4 bg-white", children: [
                /* @__PURE__ */ jsxs24("div", { className: "flex items-center justify-between gap-3 mb-2", children: [
                  /* @__PURE__ */ jsx24("div", { className: "font-black text-slate-900", children: "Turno corrente" }),
                  /* @__PURE__ */ jsxs24("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsxs24("div", { className: "text-xs font-bold text-slate-500", children: [
                      currentMatches.length,
                      "/",
                      nTables
                    ] }),
                    /* @__PURE__ */ jsxs24(
                      "button",
                      {
                        onClick: () => printRefSheets("Referti - Turno corrente", currentMatches, currentBlockIdx + 1),
                        className: "bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center gap-2",
                        title: "Stampa referti - turno corrente",
                        "aria-label": "Stampa referti - turno corrente",
                        children: [
                          /* @__PURE__ */ jsx24(Printer, { className: "w-4 h-4" }),
                          " ",
                          /* @__PURE__ */ jsx24("span", { className: "hidden sm:inline", children: "Stampa" })
                        ]
                      }
                    )
                  ] })
                ] }),
                currentMatches.length === 0 ? /* @__PURE__ */ jsx24("div", { className: "text-sm font-bold text-slate-600", children: "Nessuna partita in coda." }) : /* @__PURE__ */ jsx24("div", { className: "space-y-1 text-xs font-bold text-slate-700", children: currentMatches.map((m) => /* @__PURE__ */ jsx24("div", { className: "truncate", children: fmtMatch(m) }, m.id)) })
              ] }),
              /* @__PURE__ */ jsxs24("div", { className: "border border-slate-200 rounded-xl p-4 bg-white", children: [
                /* @__PURE__ */ jsxs24("div", { className: "flex items-center justify-between gap-3 mb-2", children: [
                  /* @__PURE__ */ jsx24("div", { className: "font-black text-slate-900", children: "Prossimo turno" }),
                  /* @__PURE__ */ jsxs24("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsxs24("div", { className: "text-xs font-bold text-slate-500", children: [
                      nextMatches.length,
                      "/",
                      nTables
                    ] }),
                    /* @__PURE__ */ jsxs24(
                      "button",
                      {
                        onClick: () => printRefSheets("Referti - Prossimo turno", nextMatches, currentBlockIdx + 2),
                        className: "bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center gap-2",
                        title: "Stampa referti - prossimo turno",
                        "aria-label": "Stampa referti - prossimo turno",
                        children: [
                          /* @__PURE__ */ jsx24(Printer, { className: "w-4 h-4" }),
                          " ",
                          /* @__PURE__ */ jsx24("span", { className: "hidden sm:inline", children: "Stampa" })
                        ]
                      }
                    )
                  ] })
                ] }),
                nextMatches.length === 0 ? /* @__PURE__ */ jsx24("div", { className: "text-sm font-bold text-slate-600", children: "Non ci sono ancora partite nel prossimo turno." }) : /* @__PURE__ */ jsx24("div", { className: "space-y-1 text-xs font-bold text-slate-700", children: nextMatches.map((m) => /* @__PURE__ */ jsx24("div", { className: "truncate", children: fmtMatch(m) }, m.id)) })
              ] })
            ] }),
            refs.length === 0 && /* @__PURE__ */ jsxs24("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 font-bold", children: [
              "Nessun arbitro trovato: usa le spunte ",
              /* @__PURE__ */ jsx24("b", { children: "Arbitro" }),
              " su Giocatore 1 / Giocatore 2 in ",
              /* @__PURE__ */ jsx24("b", { children: "Squadre" }),
              "."
            ] }),
            refs.length > 0 && query.trim() ? /* @__PURE__ */ jsxs24("div", { className: "text-xs font-bold text-slate-500", children: [
              "Risultati ricerca: ",
              /* @__PURE__ */ jsx24("b", { children: refsFiltered.length }),
              "/",
              refs.length
            ] }) : null,
            refs.length > 0 && refsFiltered.length === 0 && /* @__PURE__ */ jsxs24("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold flex items-center justify-between gap-3 flex-wrap", children: [
              /* @__PURE__ */ jsxs24("div", { className: "min-w-0", children: [
                "Nessun arbitro corrisponde alla ricerca ",
                /* @__PURE__ */ jsxs24("b", { children: [
                  "\u201C",
                  query.trim(),
                  "\u201D"
                ] }),
                "."
              ] }),
              /* @__PURE__ */ jsxs24(
                "button",
                {
                  type: "button",
                  onClick: () => setQuery(""),
                  className: "inline-flex items-center gap-2 px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                  children: [
                    /* @__PURE__ */ jsx24(X7, { className: "w-4 h-4" }),
                    " Pulisci"
                  ]
                }
              )
            ] }),
            refsFiltered.length > 0 && /* @__PURE__ */ jsxs24("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
              renderBox("Impegnati ora (stanno giocando)", "rose", engagedNow, "Nessuno."),
              renderBox("Liberi ora", "emerald", freeNow, "Nessuno libero."),
              renderBox("Impegnati nel prossimo turno", "slate", engagedNext, "Nessuno.")
            ] }),
            /* @__PURE__ */ jsxs24("div", { className: "text-xs font-bold text-slate-500", children: [
              "Nota: i \u201Cturni\u201D qui sono calcolati come blocchi da ",
              /* @__PURE__ */ jsx24("b", { children: nTables }),
              " match (tavoli), ordinati per ",
              /* @__PURE__ */ jsx24("b", { children: "orderIndex" }),
              ". Non coincidono necessariamente con le fasi (quarti/semifinali/finali)."
            ] })
          ] });
        })() })
      ] });
    };
  }
});

// components/admin/tabs/CodesTab.tsx
import React18 from "react";
import { CheckCircle2 as CheckCircle24, FileText as FileText2, ListChecks, Play as Play2, Printer as Printer2, Search as Search7, X as X8 } from "lucide-react";
import { Fragment as Fragment9, jsx as jsx25, jsxs as jsxs25 } from "react/jsx-runtime";
var CodesTab;
var init_CodesTab = __esm({
  "components/admin/tabs/CodesTab.tsx"() {
    init_matchUtils();
    CodesTab = ({
      state,
      codesStatusFilter,
      setCodesStatusFilter,
      printCodes,
      toggleMatchStatus,
      openReportFromCodes
    }) => {
      const [query, setQuery] = React18.useState("");
      const statusMeta = React18.useMemo(() => ({
        scheduled: { label: "Da giocare", pill: "border-slate-200 bg-slate-50 text-slate-700" },
        playing: { label: "In corso", pill: "border-emerald-200 bg-emerald-50 text-emerald-800" },
        finished: { label: "Giocata", pill: "border-rose-200 bg-rose-50 text-rose-800" }
      }), []);
      return /* @__PURE__ */ jsxs25("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4", children: [
        /* @__PURE__ */ jsxs25("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxs25("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs25("h3", { className: "text-xl font-black flex items-center gap-2", children: [
              /* @__PURE__ */ jsx25(ListChecks, { className: "w-5 h-5" }),
              " Codici match"
            ] }),
            /* @__PURE__ */ jsx25("div", { className: "text-xs font-bold text-slate-500 mt-1", children: "Filtra, stampa e apri rapidamente i referti. (BYE invisibili, TBD esclusi dai flussi)" })
          ] }),
          /* @__PURE__ */ jsxs25("div", { className: "flex flex-col gap-2 sm:items-end", children: [
            /* @__PURE__ */ jsxs25("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
              /* @__PURE__ */ jsxs25("div", { className: "relative", children: [
                /* @__PURE__ */ jsx25(Search7, { className: "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" }),
                /* @__PURE__ */ jsx25(
                  "input",
                  {
                    value: query,
                    onChange: (e) => setQuery(e.target.value),
                    placeholder: "Cerca codice o squadra\u2026",
                    className: "w-60 max-w-full pl-9 pr-9 border border-slate-200 rounded-lg px-3 py-2 text-sm font-black bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                  }
                ),
                query.trim() && /* @__PURE__ */ jsx25(
                  "button",
                  {
                    type: "button",
                    onClick: () => setQuery(""),
                    className: "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    "aria-label": "Pulisci ricerca",
                    title: "Pulisci",
                    children: /* @__PURE__ */ jsx25(X8, { className: "w-4 h-4 text-slate-500" })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs25(
                "select",
                {
                  value: codesStatusFilter,
                  onChange: (e) => setCodesStatusFilter(e.target.value),
                  className: "border border-slate-200 rounded-lg px-3 py-2 text-sm font-black bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                  "aria-label": "Filtro stato match",
                  children: [
                    /* @__PURE__ */ jsx25("option", { value: "all", children: "Tutte" }),
                    /* @__PURE__ */ jsx25("option", { value: "scheduled", children: "Da giocare" }),
                    /* @__PURE__ */ jsx25("option", { value: "playing", children: "In corso" }),
                    /* @__PURE__ */ jsx25("option", { value: "finished", children: "Giocate" })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs25(
                "button",
                {
                  onClick: printCodes,
                  className: "bg-white border border-slate-200 px-4 py-2 rounded-lg font-black text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 flex items-center gap-2",
                  title: "Stampa lista codici",
                  children: [
                    /* @__PURE__ */ jsx25(Printer2, { className: "w-4 h-4" }),
                    " Stampa"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsx25("div", { className: "text-xs font-bold text-slate-500", children: (() => {
              const total = (state.tournamentMatches || []).length;
              const filtered = codesStatusFilter === "all" ? total : (state.tournamentMatches || []).filter((m) => m.status === codesStatusFilter).length;
              return /* @__PURE__ */ jsxs25(Fragment9, { children: [
                "Torneo live: ",
                state.tournament ? "SI" : "NO",
                " \u2022 Match: ",
                filtered,
                "/",
                total
              ] });
            })() })
          ] })
        ] }),
        !state.tournament && /* @__PURE__ */ jsxs25("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: [
          "Nessun torneo live attivo. Vai su ",
          /* @__PURE__ */ jsx25("b", { children: "Struttura" }),
          " \u2192 ",
          /* @__PURE__ */ jsx25("b", { children: "Conferma e Avvia Live" }),
          "."
        ] }),
        state.tournament && /* @__PURE__ */ jsx25(Fragment9, { children: (() => {
          const teamMap = new Map((state.teams || []).map((t) => [t.id, t.name]));
          const ms = [...state.tournamentMatches || []].filter((m) => !m.hidden).filter((m) => {
            const ids = getMatchParticipantIds(m);
            return !ids.includes("BYE");
          }).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          const statusFiltered = codesStatusFilter === "all" ? ms : ms.filter((m) => m.status === codesStatusFilter);
          const current = ms.find((m) => m.status === "playing") || ms.find((m) => m.status === "scheduled") || ms[ms.length - 1];
          const currentIdx = current ? ms.findIndex((m) => m.id === current.id) + 1 : 0;
          const finishedCount = ms.filter((m) => m.status === "finished").length;
          const getLabelNames = (m) => {
            const ids = getMatchParticipantIds(m);
            const names = ids.map((id) => id ? teamMap.get(id) || id : "TBD");
            const isMulti = ids.length >= 3;
            return isMulti ? names.join(" vs ") : `${names[0] || "TBD"} vs ${names[1] || "TBD"}`;
          };
          const q = query.trim().toLowerCase();
          const visible = !q ? statusFiltered : statusFiltered.filter((m) => {
            const code = (m.code || "").toLowerCase();
            const label = getLabelNames(m).toLowerCase();
            const meta = `${m.phase || ""} ${m.groupName || ""} ${m.roundName || ""}`.toLowerCase();
            return code.includes(q) || label.includes(q) || meta.includes(q);
          });
          return /* @__PURE__ */ jsxs25(Fragment9, { children: [
            /* @__PURE__ */ jsxs25("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap", children: [
              /* @__PURE__ */ jsxs25("div", { className: "font-black text-slate-900", children: [
                "Avanzamento: ",
                /* @__PURE__ */ jsxs25("span", { className: "font-mono", children: [
                  currentIdx,
                  "/",
                  ms.length
                ] }),
                /* @__PURE__ */ jsx25("span", { className: "text-slate-500 font-bold", children: " \u2022 finiti " }),
                /* @__PURE__ */ jsx25("span", { className: "font-mono", children: finishedCount })
              ] }),
              /* @__PURE__ */ jsxs25("div", { className: "text-xs font-bold text-slate-600", children: [
                current?.status === "playing" ? "IN CORSO" : "PROSSIMA",
                ": ",
                /* @__PURE__ */ jsx25("span", { className: "font-mono", children: current?.code || "-" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs25("div", { className: "text-[11px] font-bold text-slate-500", children: [
              "Tip: usa ",
              /* @__PURE__ */ jsx25("span", { className: "font-black", children: "Avvia/Chiudi" }),
              " per avanzare lo stato. Le righe ",
              /* @__PURE__ */ jsx25("span", { className: "font-black", children: "giocate" }),
              " sono cliccabili per aprire il referto."
            ] }),
            /* @__PURE__ */ jsxs25("div", { className: "space-y-2", children: [
              visible.map((m) => {
                const isCurrent = current && m.id === current.id;
                const ids = getMatchParticipantIds(m);
                const isMulti = ids.length >= 3;
                const labelNames = getLabelNames(m);
                const code = m.code || "-";
                const score = m.status === "finished" ? formatMatchScoreLabel(m) : "\u2014";
                const isClickable = m.status === "finished";
                const meta = statusMeta[m.status] || statusMeta.scheduled;
                return /* @__PURE__ */ jsxs25(
                  "div",
                  {
                    onClick: isClickable ? () => openReportFromCodes(m.id) : void 0,
                    className: `border rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${isClickable ? "cursor-pointer hover:brightness-95" : ""} ${isCurrent ? "border-blue-600 ring-2 ring-blue-100 bg-blue-50" : m.status === "playing" ? "border-emerald-200 bg-emerald-50" : m.status === "finished" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`,
                    children: [
                      /* @__PURE__ */ jsxs25("div", { className: "min-w-0", children: [
                        /* @__PURE__ */ jsxs25("div", { className: "flex items-center gap-3 min-w-0", children: [
                          /* @__PURE__ */ jsx25("span", { className: "font-mono font-black text-slate-900", children: code }),
                          m.isTieBreak && /* @__PURE__ */ jsxs25("span", { className: `text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${isMulti ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-amber-50 text-amber-800 border-amber-200"}`, children: [
                            "SPAREGGIO",
                            isMulti ? " MULTI" : "",
                            typeof m.targetScore === "number" ? ` a ${m.targetScore}` : ""
                          ] }),
                          /* @__PURE__ */ jsx25("span", { className: "font-black text-slate-900 truncate", children: labelNames })
                        ] }),
                        /* @__PURE__ */ jsx25("div", { className: "text-xs font-bold text-slate-500 mt-1", children: m.phase === "groups" ? m.groupName ? `Girone ${m.groupName}` : "Gironi" : m.roundName || "Bracket" })
                      ] }),
                      /* @__PURE__ */ jsxs25("div", { className: "flex items-center gap-3 shrink-0", children: [
                        /* @__PURE__ */ jsx25("span", { className: "font-mono font-black text-slate-700", children: score }),
                        /* @__PURE__ */ jsx25("span", { className: `px-2 py-1 rounded-full text-xs font-black border uppercase ${meta.pill}`, children: meta.label }),
                        /* @__PURE__ */ jsxs25(
                          "button",
                          {
                            onClick: (e) => {
                              e.stopPropagation();
                              openReportFromCodes(m.id);
                            },
                            className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center gap-2",
                            title: "Apri referto",
                            "aria-label": "Apri referto",
                            children: [
                              /* @__PURE__ */ jsx25(FileText2, { className: "w-4 h-4" }),
                              " ",
                              /* @__PURE__ */ jsx25("span", { className: "hidden sm:inline", children: "Referto" })
                            ]
                          }
                        ),
                        m.status !== "finished" && /* @__PURE__ */ jsxs25(
                          "button",
                          {
                            onClick: (e) => {
                              e.stopPropagation();
                              toggleMatchStatus(m.id);
                            },
                            className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center gap-2",
                            title: "Avanza stato match",
                            "aria-label": m.status === "scheduled" ? "Avvia match" : "Chiudi match",
                            children: [
                              m.status === "scheduled" ? /* @__PURE__ */ jsx25(Play2, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx25(CheckCircle24, { className: "w-4 h-4" }),
                              /* @__PURE__ */ jsx25("span", { className: "hidden sm:inline", children: m.status === "scheduled" ? "Avvia" : "Chiudi" })
                            ]
                          }
                        )
                      ] })
                    ]
                  },
                  m.id
                );
              }),
              !visible.length && /* @__PURE__ */ jsx25("div", { className: "p-6 text-center text-slate-500 font-bold bg-slate-50 border border-slate-200 rounded-xl", children: query.trim() ? /* @__PURE__ */ jsxs25("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsxs25("div", { children: [
                  "Nessun match trovato per \u201C",
                  query.trim(),
                  "\u201D."
                ] }),
                /* @__PURE__ */ jsxs25(
                  "button",
                  {
                    type: "button",
                    onClick: () => setQuery(""),
                    className: "inline-flex items-center gap-2 px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    children: [
                      /* @__PURE__ */ jsx25(X8, { className: "w-4 h-4" }),
                      " Pulisci ricerca"
                    ]
                  }
                )
              ] }) : "Nessun match disponibile." })
            ] })
          ] });
        })() })
      ] });
    };
  }
});

// components/admin/tabs/MonitorGroupsTab.tsx
import React19 from "react";
import { LayoutDashboard as LayoutDashboard2, Search as Search8, X as X9, Play as Play3, Square, FileText as FileText3 } from "lucide-react";
import { Fragment as Fragment10, jsx as jsx26, jsxs as jsxs26 } from "react/jsx-runtime";
var ALL_GROUPS, MonitorGroupsTab;
var init_MonitorGroupsTab = __esm({
  "components/admin/tabs/MonitorGroupsTab.tsx"() {
    init_groupStandings();
    init_matchUtils();
    init_id();
    ALL_GROUPS = "__ALL__";
    MonitorGroupsTab = ({
      state,
      getTeamName,
      toggleMatchStatus,
      openReportFromCodes,
      handleUpdateTournamentAndMatches
    }) => {
      const isPlaceholderTeamId = React19.useCallback((teamId) => {
        const id = (teamId || "").trim();
        if (!id) return true;
        return id === "BYE" || id === "TBD";
      }, []);
      const allGroups = state.tournament?.groups || [];
      const [selectedGroup, setSelectedGroup] = React19.useState(ALL_GROUPS);
      const [query, setQuery] = React19.useState("");
      const tournamentTeams = React19.useMemo(() => {
        return state.tournament?.teams && state.tournament.teams.length ? state.tournament.teams : state.teams || [];
      }, [state.tournament?.teams, state.teams]);
      const teamsById = React19.useMemo(() => {
        const map = /* @__PURE__ */ new Map();
        for (const t of tournamentTeams || []) map.set(t.id, t);
        return map;
      }, [tournamentTeams]);
      const queryNorm = query.trim().toLowerCase();
      const matchMatchesQuery = React19.useCallback((m) => {
        if (!queryNorm) return true;
        const code = ((m.code || m.id || "") + "").toLowerCase();
        const group = ((m.groupName || "") + "").toLowerCase();
        if (code.includes(queryNorm) || group.includes(queryNorm)) return true;
        const ids = getMatchParticipantIds(m);
        for (const id of ids) {
          const name = ((getTeamName(id) || id || "") + "").toLowerCase();
          if (name.includes(queryNorm)) return true;
        }
        return false;
      }, [queryNorm, getTeamName]);
      const openGroupTieBreaks = React19.useMemo(() => {
        const ms = (state.tournamentMatches || []).filter((m) => m.phase === "groups" && !m.hidden && !m.isBye).filter((m) => m.isTieBreak).filter((m) => m.status !== "finished");
        return ms.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      }, [state.tournamentMatches]);
      React19.useEffect(() => {
        if (selectedGroup === ALL_GROUPS) return;
        const stillExists = allGroups.some((g) => g.name === selectedGroup);
        if (!stillExists) setSelectedGroup(ALL_GROUPS);
      }, [allGroups.map((g) => g.name).join("|")]);
      const visibleGroups = selectedGroup === ALL_GROUPS ? allGroups : allGroups.filter((g) => g.name === selectedGroup);
      const matchesByGroup = React19.useMemo(() => {
        const groupMatchesAll = (state.tournamentMatches || []).filter((m) => m.phase === "groups" && !m.hidden && !m.isBye).filter((m) => m.teamAId !== "BYE" && m.teamBId !== "BYE").sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        const byGroup = /* @__PURE__ */ new Map();
        groupMatchesAll.forEach((m) => {
          const k = m.groupName || "\u2014";
          const arr = byGroup.get(k);
          if (arr) arr.push(m);
          else byGroup.set(k, [m]);
        });
        return byGroup;
      }, [state.tournamentMatches]);
      const integrity = React19.useMemo(() => {
        if (!state.tournament) return null;
        const rosterRealIds = (tournamentTeams || []).filter((t) => !t.hidden && !t.isBye).map((t) => t.id).filter((id) => !isPlaceholderTeamId(id));
        const included = /* @__PURE__ */ new Set();
        for (const g of state.tournament.groups || []) {
          for (const t of g.teams || []) {
            const id = (t.id || "").trim();
            if (!id || isPlaceholderTeamId(id)) continue;
            if (t.hidden || t.isBye) continue;
            included.add(id);
          }
        }
        for (const m of state.tournamentMatches || []) {
          if (m.hidden || m.hidden) continue;
          if (m.isBye) continue;
          for (const idRaw of getMatchParticipantIds(m)) {
            const id = (idRaw || "").trim();
            if (!id || isPlaceholderTeamId(id)) continue;
            const tt = teamsById.get(id);
            if (tt?.hidden || tt?.isBye) continue;
            included.add(id);
          }
        }
        const excluded = rosterRealIds.filter((id) => !included.has(id));
        const concluded = (state.tournament.groups || []).filter((g) => {
          const msAll = matchesByGroup.get(g.name) || [];
          const ms = queryNorm ? msAll.filter(matchMatchesQuery) : msAll;
          if (!ms.length) return false;
          return ms.every((m) => m.status === "finished");
        }).map((g) => g.name);
        return {
          excluded,
          concludedGroups: concluded
        };
      }, [state.tournament, state.tournamentMatches, tournamentTeams, teamsById, isPlaceholderTeamId, matchesByGroup]);
      const selectedGroupConcluded = React19.useMemo(() => {
        if (!integrity) return false;
        if (selectedGroup === ALL_GROUPS) return false;
        return integrity.concludedGroups.includes(selectedGroup);
      }, [integrity, selectedGroup]);
      const selectedGroupObj = React19.useMemo(() => {
        if (selectedGroup === ALL_GROUPS) return null;
        return allGroups.find((g) => g.name === selectedGroup) || null;
      }, [allGroups, selectedGroup]);
      const selectedGroupMatches = React19.useMemo(() => {
        if (!selectedGroupObj) return [];
        return matchesByGroup.get(selectedGroupObj.name) || [];
      }, [selectedGroupObj, matchesByGroup]);
      const selectedGroupStarted = React19.useMemo(() => {
        return selectedGroupMatches.some((m) => m.status !== "scheduled" || m.played || m.isTieBreak);
      }, [selectedGroupMatches]);
      const groupsManualEditDisabledReason = React19.useMemo(() => {
        if (!state.tournament) return "Disabilitato: nessun torneo live.";
        if (selectedGroup === ALL_GROUPS) return "Disabilitato: seleziona un girone specifico.";
        if (!selectedGroupObj) return "Disabilitato: girone non trovato.";
        if (selectedGroupObj.stage === "final") return "Disabilitato: Girone Finale non modificabile.";
        if (selectedGroupConcluded) return `Disabilitato: Girone ${selectedGroup} concluso.`;
        if (selectedGroupStarted) return `Disabilitato: Girone ${selectedGroup} gi\xE0 iniziato.`;
        return "";
      }, [state.tournament, selectedGroup, selectedGroupObj, selectedGroupConcluded, selectedGroupStarted]);
      const canManualEditGroupsNow = !!state.tournament && !groupsManualEditDisabledReason;
      const availableTeamsToAdd = React19.useMemo(() => {
        if (!integrity) return [];
        return (integrity.excluded || []).filter((id) => !isPlaceholderTeamId(id));
      }, [integrity, isPlaceholderTeamId]);
      const groupStartedByName = React19.useMemo(() => {
        const map = /* @__PURE__ */ new Map();
        for (const g of allGroups || []) {
          const ms = matchesByGroup.get(g.name) || [];
          const started = ms.some((m) => m.status !== "scheduled" || m.played || m.isTieBreak);
          map.set(g.name, started);
        }
        return map;
      }, [allGroups, matchesByGroup]);
      const teamsInSelectedGroup = React19.useMemo(() => {
        if (!selectedGroupObj) return [];
        return (selectedGroupObj.teams || []).filter((t) => !t.hidden && !t.isBye).map((t) => t.id).filter((id) => !isPlaceholderTeamId(id));
      }, [selectedGroupObj, isPlaceholderTeamId]);
      const availableTargetGroups = React19.useMemo(() => {
        if (!integrity || !selectedGroupObj) return [];
        return (allGroups || []).filter((g) => g.id !== selectedGroupObj.id).filter((g) => g.stage !== "final").filter((g) => !integrity.concludedGroups.includes(g.name)).filter((g) => !(groupStartedByName.get(g.name) ?? false)).map((g) => g.name);
      }, [integrity, selectedGroupObj, allGroups, groupStartedByName]);
      const standingsByGroup = React19.useMemo(() => {
        const map = /* @__PURE__ */ new Map();
        for (const g of visibleGroups) {
          const ms = (matchesByGroup.get(g.name) || []).slice().sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          map.set(g.name, computeGroupStandings({ teams: g.teams || [], matches: ms }));
        }
        return map;
      }, [visibleGroups, matchesByGroup]);
      const [manualEditMode, setManualEditMode] = React19.useState(false);
      const [addTeamToGroupId, setAddTeamToGroupId] = React19.useState("");
      const [moveTeamFromGroupId, setMoveTeamFromGroupId] = React19.useState("");
      const [moveTeamToGroupName, setMoveTeamToGroupName] = React19.useState("");
      const [swapTeamFromSelectedId, setSwapTeamFromSelectedId] = React19.useState("");
      const [swapTargetGroupName, setSwapTargetGroupName] = React19.useState("");
      const [swapTeamFromTargetId, setSwapTeamFromTargetId] = React19.useState("");
      const [manualEditMsg, setManualEditMsg] = React19.useState("");
      React19.useEffect(() => {
        if (!canManualEditGroupsNow && manualEditMode) setManualEditMode(false);
      }, [canManualEditGroupsNow]);
      React19.useEffect(() => {
        if (!swapTargetGroupName) {
          if (swapTeamFromTargetId) setSwapTeamFromTargetId("");
        }
      }, [swapTargetGroupName]);
      const teamsInTargetGroupForSwap = React19.useMemo(() => {
        if (!state.tournament) return [];
        const g = (state.tournament.groups || []).find((gg) => gg.name === swapTargetGroupName);
        if (!g) return [];
        return (g.teams || []).filter((t) => !t.hidden && !t.isBye).map((t) => t.id).filter((id) => !isPlaceholderTeamId(id));
      }, [state.tournament, swapTargetGroupName, isPlaceholderTeamId]);
      const handleAddTeamToSelectedGroup = React19.useCallback(() => {
        setManualEditMsg("");
        if (!state.tournament) return;
        if (!selectedGroupObj) {
          setManualEditMsg("Girone non trovato.");
          return;
        }
        if (groupsManualEditDisabledReason) {
          setManualEditMsg(groupsManualEditDisabledReason);
          return;
        }
        const teamId = (addTeamToGroupId || "").trim();
        if (!teamId) {
          setManualEditMsg("Seleziona una squadra da aggiungere.");
          return;
        }
        if (isPlaceholderTeamId(teamId)) {
          setManualEditMsg("Non posso aggiungere BYE/TBD.");
          return;
        }
        const teamToAdd = (tournamentTeams || []).find((t) => t.id === teamId);
        if (!teamToAdd) {
          setManualEditMsg("Squadra non trovata nel roster torneo.");
          return;
        }
        const alreadyInGroup = (selectedGroupObj.teams || []).some((t) => t.id === teamToAdd.id);
        if (alreadyInGroup) {
          setManualEditMsg("La squadra \xE8 gi\xE0 presente in questo girone.");
          return;
        }
        const existingTeams = (selectedGroupObj.teams || []).filter((t) => !t.hidden && !t.isBye).filter((t) => !isPlaceholderTeamId(t.id));
        const allMatches = [...state.tournamentMatches || []];
        const maxOrder = allMatches.reduce((mx, m) => Math.max(mx, m.orderIndex ?? 0), 0);
        let orderIndex = maxOrder + 1;
        const groupLetter = (selectedGroupObj.name || "").slice(-1) || "G";
        const existingCodes = allMatches.filter((m) => m.phase === "groups" && (m.groupName || "") === (selectedGroupObj.name || "") && typeof m.code === "string").map((m) => (m.code || "").trim()).filter((c) => c.startsWith(groupLetter)).map((c) => parseInt(c.slice(groupLetter.length), 10)).filter((n) => Number.isFinite(n));
        let codeCounter = (existingCodes.length ? Math.max(...existingCodes) : 0) + 1;
        const newMatches = [];
        for (const t of existingTeams) {
          const exists = allMatches.some(
            (m) => m.phase === "groups" && (m.groupName || "") === (selectedGroupObj.name || "") && !m.hidden && !m.isBye && (m.teamAId === t.id && m.teamBId === teamToAdd.id || m.teamAId === teamToAdd.id && m.teamBId === t.id)
          );
          if (exists) continue;
          newMatches.push({
            id: uuid2(),
            teamAId: t.id,
            teamBId: teamToAdd.id,
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "groups",
            groupName: selectedGroupObj.name,
            code: `${groupLetter}${codeCounter++}`,
            orderIndex: orderIndex++
          });
        }
        const nextMatches = [...allMatches, ...newMatches];
        const nextGroups = (state.tournament.groups || []).map((g) => {
          if (g.id !== selectedGroupObj.id) return g;
          return { ...g, teams: [...g.teams || [], teamToAdd] };
        });
        const nextTournament = {
          ...state.tournament,
          groups: nextGroups,
          matches: nextMatches
        };
        handleUpdateTournamentAndMatches(nextTournament, nextMatches);
        setAddTeamToGroupId("");
        setManualEditMsg(`Aggiunta ${getTeamName(teamToAdd.id)} a ${selectedGroupObj.name}. Creati ${newMatches.length} match.`);
      }, [
        state.tournament,
        state.tournamentMatches,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        addTeamToGroupId,
        tournamentTeams,
        isPlaceholderTeamId,
        getTeamName,
        handleUpdateTournamentAndMatches
      ]);
      const handleMoveTeamToOtherGroup = React19.useCallback(() => {
        setManualEditMsg("");
        if (!state.tournament) return;
        if (!selectedGroupObj) {
          setManualEditMsg("Girone non trovato.");
          return;
        }
        if (groupsManualEditDisabledReason) {
          setManualEditMsg(groupsManualEditDisabledReason);
          return;
        }
        const teamId = (moveTeamFromGroupId || "").trim();
        const targetGroupName = (moveTeamToGroupName || "").trim();
        if (!teamId) {
          setManualEditMsg("Seleziona una squadra da spostare.");
          return;
        }
        if (!targetGroupName) {
          setManualEditMsg("Seleziona un girone di destinazione.");
          return;
        }
        if (isPlaceholderTeamId(teamId)) {
          setManualEditMsg("Non posso spostare BYE/TBD.");
          return;
        }
        if (targetGroupName === selectedGroupObj.name) {
          setManualEditMsg("Il girone di destinazione coincide con quello corrente.");
          return;
        }
        const targetGroupObj = (state.tournament.groups || []).find((g) => g.name === targetGroupName) || null;
        if (!targetGroupObj) {
          setManualEditMsg("Girone di destinazione non trovato.");
          return;
        }
        if (targetGroupObj.stage === "final") {
          setManualEditMsg("Girone Finale non modificabile.");
          return;
        }
        if (integrity?.concludedGroups.includes(targetGroupObj.name)) {
          setManualEditMsg(`Girone ${targetGroupObj.name} concluso: non modificabile.`);
          return;
        }
        if (groupStartedByName.get(targetGroupObj.name)) {
          setManualEditMsg(`Girone ${targetGroupObj.name} gi\xE0 iniziato: non modificabile.`);
          return;
        }
        const teamToMove = (tournamentTeams || []).find((t) => t.id === teamId);
        if (!teamToMove) {
          setManualEditMsg("Squadra non trovata nel roster torneo.");
          return;
        }
        const inSource = (selectedGroupObj.teams || []).some((t) => t.id === teamToMove.id);
        if (!inSource) {
          setManualEditMsg("La squadra selezionata non \xE8 nel girone corrente.");
          return;
        }
        const alreadyInTarget = (targetGroupObj.teams || []).some((t) => t.id === teamToMove.id);
        if (alreadyInTarget) {
          setManualEditMsg("La squadra \xE8 gi\xE0 presente nel girone di destinazione.");
          return;
        }
        const allMatches = [...state.tournamentMatches || []];
        const sourceGroupMatchesWithTeam = allMatches.filter(
          (m) => m.phase === "groups" && (m.groupName || "") === (selectedGroupObj.name || "") && !m.hidden && !m.isBye && getMatchParticipantIds(m).includes(teamToMove.id)
        );
        const startedInSource = sourceGroupMatchesWithTeam.some((m) => m.status !== "scheduled" || m.played || m.isTieBreak);
        if (startedInSource) {
          setManualEditMsg(`Impossibile: esistono match gi\xE0 iniziati nel girone ${selectedGroupObj.name}.`);
          return;
        }
        const removeIds = new Set(sourceGroupMatchesWithTeam.map((m) => m.id));
        const keptMatches = allMatches.filter((m) => !removeIds.has(m.id));
        const nextGroups = (state.tournament.groups || []).map((g) => {
          if (g.id === selectedGroupObj.id) {
            return { ...g, teams: (g.teams || []).filter((t) => t.id !== teamToMove.id) };
          }
          if (g.id === targetGroupObj.id) {
            return { ...g, teams: [...g.teams || [], teamToMove] };
          }
          return g;
        });
        const targetGroupNext = nextGroups.find((g) => g.id === targetGroupObj.id) || targetGroupObj;
        const targetExistingTeams = (targetGroupNext.teams || []).filter((t) => !t.hidden && !t.isBye).filter((t) => !isPlaceholderTeamId(t.id)).filter((t) => t.id !== teamToMove.id);
        const maxOrder = keptMatches.reduce((mx, m) => Math.max(mx, m.orderIndex ?? 0), 0);
        let orderIndex = maxOrder + 1;
        const groupLetter = (targetGroupNext.name || "").slice(-1) || "G";
        const existingCodes = keptMatches.filter((m) => m.phase === "groups" && (m.groupName || "") === (targetGroupNext.name || "") && typeof m.code === "string").map((m) => (m.code || "").trim()).filter((c) => c.startsWith(groupLetter)).map((c) => parseInt(c.slice(groupLetter.length), 10)).filter((n) => Number.isFinite(n));
        let codeCounter = (existingCodes.length ? Math.max(...existingCodes) : 0) + 1;
        const newMatches = [];
        for (const t of targetExistingTeams) {
          const exists = keptMatches.some(
            (m) => m.phase === "groups" && (m.groupName || "") === (targetGroupNext.name || "") && !m.hidden && !m.isBye && (m.teamAId === t.id && m.teamBId === teamToMove.id || m.teamAId === teamToMove.id && m.teamBId === t.id)
          );
          if (exists) continue;
          newMatches.push({
            id: uuid2(),
            teamAId: t.id,
            teamBId: teamToMove.id,
            scoreA: 0,
            scoreB: 0,
            played: false,
            status: "scheduled",
            phase: "groups",
            groupName: targetGroupNext.name,
            code: `${groupLetter}${codeCounter++}`,
            orderIndex: orderIndex++
          });
        }
        const nextMatches = [...keptMatches, ...newMatches];
        const nextTournament = {
          ...state.tournament,
          groups: nextGroups,
          matches: nextMatches
        };
        handleUpdateTournamentAndMatches(nextTournament, nextMatches);
        setMoveTeamFromGroupId("");
        setMoveTeamToGroupName("");
        setManualEditMsg(`Spostata ${getTeamName(teamToMove.id)}: ${selectedGroupObj.name} \u2192 ${targetGroupNext.name}. Rimossi ${sourceGroupMatchesWithTeam.length} match, creati ${newMatches.length} match.`);
      }, [
        state.tournament,
        state.tournamentMatches,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        moveTeamFromGroupId,
        moveTeamToGroupName,
        tournamentTeams,
        isPlaceholderTeamId,
        integrity,
        groupStartedByName,
        getTeamName,
        handleUpdateTournamentAndMatches
      ]);
      const handleSwapTeamsBetweenGroups = React19.useCallback(() => {
        setManualEditMsg("");
        if (!state.tournament) return;
        if (!selectedGroupObj) {
          setManualEditMsg("Girone non trovato.");
          return;
        }
        if (groupsManualEditDisabledReason) {
          setManualEditMsg(groupsManualEditDisabledReason);
          return;
        }
        const teamAId = (swapTeamFromSelectedId || "").trim();
        const targetGroupName = (swapTargetGroupName || "").trim();
        const teamBId = (swapTeamFromTargetId || "").trim();
        if (!teamAId) {
          setManualEditMsg("Seleziona la squadra del girone corrente.");
          return;
        }
        if (!targetGroupName) {
          setManualEditMsg("Seleziona il girone con cui fare lo scambio.");
          return;
        }
        if (!teamBId) {
          setManualEditMsg("Seleziona la squadra del girone di destinazione.");
          return;
        }
        if (isPlaceholderTeamId(teamAId) || isPlaceholderTeamId(teamBId)) {
          setManualEditMsg("Non posso scambiare BYE/TBD.");
          return;
        }
        const targetGroupObj = (state.tournament.groups || []).find((g) => g.name === targetGroupName) || null;
        if (!targetGroupObj) {
          setManualEditMsg("Girone di destinazione non trovato.");
          return;
        }
        if (targetGroupObj.stage === "final" || selectedGroupObj.stage === "final") {
          setManualEditMsg("Girone Finale non modificabile.");
          return;
        }
        if (integrity?.concludedGroups.includes(targetGroupObj.name)) {
          setManualEditMsg(`Girone ${targetGroupObj.name} concluso: non modificabile.`);
          return;
        }
        if (groupStartedByName.get(targetGroupObj.name)) {
          setManualEditMsg(`Girone ${targetGroupObj.name} gi\xE0 iniziato: non modificabile.`);
          return;
        }
        const teamA = (tournamentTeams || []).find((t) => t.id === teamAId);
        const teamB = (tournamentTeams || []).find((t) => t.id === teamBId);
        if (!teamA || !teamB) {
          setManualEditMsg("Una delle due squadre non \xE8 nel roster torneo.");
          return;
        }
        const inSource = (selectedGroupObj.teams || []).some((t) => t.id === teamA.id);
        const inTarget = (targetGroupObj.teams || []).some((t) => t.id === teamB.id);
        if (!inSource) {
          setManualEditMsg("La squadra del girone corrente non \xE8 presente nel girone selezionato.");
          return;
        }
        if (!inTarget) {
          setManualEditMsg("La squadra del girone di destinazione non \xE8 presente nel girone selezionato.");
          return;
        }
        const allMatches = [...state.tournamentMatches || []];
        const sourceMatchesWithA = allMatches.filter(
          (m) => m.phase === "groups" && (m.groupName || "") === (selectedGroupObj.name || "") && !m.hidden && !m.isBye && getMatchParticipantIds(m).includes(teamA.id)
        );
        const targetMatchesWithB = allMatches.filter(
          (m) => m.phase === "groups" && (m.groupName || "") === (targetGroupObj.name || "") && !m.hidden && !m.isBye && getMatchParticipantIds(m).includes(teamB.id)
        );
        const startedA = sourceMatchesWithA.some((m) => m.status !== "scheduled" || m.played || m.isTieBreak);
        if (startedA) {
          setManualEditMsg(`Impossibile: esistono match gi\xE0 iniziati nel girone ${selectedGroupObj.name}.`);
          return;
        }
        const startedB = targetMatchesWithB.some((m) => m.status !== "scheduled" || m.played || m.isTieBreak);
        if (startedB) {
          setManualEditMsg(`Impossibile: esistono match gi\xE0 iniziati nel girone ${targetGroupObj.name}.`);
          return;
        }
        const removeIds = new Set([...sourceMatchesWithA, ...targetMatchesWithB].map((m) => m.id));
        const keptMatches = allMatches.filter((m) => !removeIds.has(m.id));
        const nextGroups = (state.tournament.groups || []).map((g) => {
          if (g.id === selectedGroupObj.id) {
            const nextTeams = (g.teams || []).map((t) => t.id === teamA.id ? teamB : t);
            return { ...g, teams: nextTeams };
          }
          if (g.id === targetGroupObj.id) {
            const nextTeams = (g.teams || []).map((t) => t.id === teamB.id ? teamA : t);
            return { ...g, teams: nextTeams };
          }
          return g;
        });
        const sourceGroupNext = nextGroups.find((g) => g.id === selectedGroupObj.id) || selectedGroupObj;
        const targetGroupNext = nextGroups.find((g) => g.id === targetGroupObj.id) || targetGroupObj;
        const maxOrder = keptMatches.reduce((mx, m) => Math.max(mx, m.orderIndex ?? 0), 0);
        let orderIndex = maxOrder + 1;
        const makeGroupMatchesForTeam = (groupName, team, others) => {
          const groupLetter = (groupName || "").slice(-1) || "G";
          const existingCodes = keptMatches.filter((m) => m.phase === "groups" && (m.groupName || "") === groupName && typeof m.code === "string").map((m) => (m.code || "").trim()).filter((c) => c.startsWith(groupLetter)).map((c) => parseInt(c.slice(groupLetter.length), 10)).filter((n) => Number.isFinite(n));
          let codeCounter = (existingCodes.length ? Math.max(...existingCodes) : 0) + 1;
          const newMs = [];
          for (const t of others) {
            const exists = keptMatches.some(
              (m) => m.phase === "groups" && (m.groupName || "") === groupName && !m.hidden && !m.isBye && (m.teamAId === t.id && m.teamBId === team.id || m.teamAId === team.id && m.teamBId === t.id)
            );
            if (exists) continue;
            newMs.push({
              id: uuid2(),
              teamAId: t.id,
              teamBId: team.id,
              scoreA: 0,
              scoreB: 0,
              played: false,
              status: "scheduled",
              phase: "groups",
              groupName,
              code: `${groupLetter}${codeCounter++}`,
              orderIndex: orderIndex++
            });
          }
          return newMs;
        };
        const sourceOtherTeams = (sourceGroupNext.teams || []).filter((t) => !t.hidden && !t.isBye).filter((t) => !isPlaceholderTeamId(t.id)).filter((t) => t.id !== teamB.id);
        const targetOtherTeams = (targetGroupNext.teams || []).filter((t) => !t.hidden && !t.isBye).filter((t) => !isPlaceholderTeamId(t.id)).filter((t) => t.id !== teamA.id);
        const newForBInSource = makeGroupMatchesForTeam(sourceGroupNext.name, teamB, sourceOtherTeams);
        const newForAInTarget = makeGroupMatchesForTeam(targetGroupNext.name, teamA, targetOtherTeams);
        const nextMatches = [...keptMatches, ...newForBInSource, ...newForAInTarget];
        const nextTournament = {
          ...state.tournament,
          groups: nextGroups,
          matches: nextMatches
        };
        handleUpdateTournamentAndMatches(nextTournament, nextMatches);
        setSwapTeamFromSelectedId("");
        setSwapTargetGroupName("");
        setSwapTeamFromTargetId("");
        setManualEditMsg(`Scambio completato: ${getTeamName(teamA.id)} \u2194 ${getTeamName(teamB.id)}. Rimossi ${sourceMatchesWithA.length + targetMatchesWithB.length} match, creati ${newForBInSource.length + newForAInTarget.length} match.`);
      }, [
        state.tournament,
        state.tournamentMatches,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        swapTeamFromSelectedId,
        swapTargetGroupName,
        swapTeamFromTargetId,
        tournamentTeams,
        isPlaceholderTeamId,
        integrity,
        groupStartedByName,
        getTeamName,
        handleUpdateTournamentAndMatches
      ]);
      const searchStats = React19.useMemo(() => {
        if (!state.tournament) return { total: 0, filtered: 0 };
        const groups = selectedGroup === ALL_GROUPS ? allGroups : allGroups.filter((g) => g.name === selectedGroup);
        let total = 0;
        let filtered = 0;
        for (const g of groups) {
          const msAll = matchesByGroup.get(g.name) || [];
          total += msAll.length;
          filtered += queryNorm ? msAll.filter(matchMatchesQuery).length : msAll.length;
        }
        return { total, filtered };
      }, [state.tournament, selectedGroup, allGroups, matchesByGroup, queryNorm, matchMatchesQuery]);
      return /* @__PURE__ */ jsxs26("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4", children: [
        /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxs26("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs26("h3", { className: "text-xl font-black flex items-center gap-2", children: [
              /* @__PURE__ */ jsx26(LayoutDashboard2, { className: "w-5 h-5" }),
              " Monitor Gironi"
            ] }),
            /* @__PURE__ */ jsxs26("div", { className: "text-xs font-bold text-slate-500 mt-1", children: [
              "Ricerca rapida per codice/squadra/girone. Tip: usa ",
              /* @__PURE__ */ jsx26("span", { className: "font-black", children: "Avvia/Chiudi" }),
              " per avanzare lo stato, e apri il ",
              /* @__PURE__ */ jsx26("span", { className: "font-black", children: "Referto" }),
              " dai match giocati."
            ] })
          ] }),
          /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-2 sm:items-end", children: [
            /* @__PURE__ */ jsxs26("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
              /* @__PURE__ */ jsxs26("div", { className: "relative", children: [
                /* @__PURE__ */ jsx26(Search8, { className: "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" }),
                /* @__PURE__ */ jsx26(
                  "input",
                  {
                    value: query,
                    onChange: (e) => setQuery(e.target.value),
                    placeholder: "Cerca codice o squadra\u2026",
                    className: "w-64 max-w-full pl-9 pr-9 px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                  }
                ),
                query.trim() && /* @__PURE__ */ jsx26(
                  "button",
                  {
                    type: "button",
                    onClick: () => setQuery(""),
                    className: "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    "aria-label": "Pulisci ricerca",
                    children: /* @__PURE__ */ jsx26(X9, { className: "w-4 h-4 text-slate-500" })
                  }
                )
              ] }),
              state.tournament && allGroups.length > 1 && /* @__PURE__ */ jsxs26(
                "select",
                {
                  "aria-label": "Seleziona girone",
                  value: selectedGroup,
                  onChange: (e) => setSelectedGroup(e.target.value),
                  className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                  children: [
                    /* @__PURE__ */ jsx26("option", { value: ALL_GROUPS, children: "Tutti i gironi" }),
                    allGroups.map((g) => /* @__PURE__ */ jsxs26("option", { value: g.name, children: [
                      "Girone ",
                      g.name
                    ] }, g.id))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs26("div", { className: "text-xs font-bold text-slate-500", children: [
              "Torneo live: ",
              state.tournament ? "SI" : "NO",
              " \u2022 Gironi: ",
              (state.tournament?.groups || []).length,
              " \u2022 Match: ",
              (state.tournamentMatches || []).filter((m) => m.phase === "groups" && !m.hidden && !m.isBye && m.teamAId !== "BYE" && m.teamBId !== "BYE").length
            ] })
          ] })
        ] }),
        !state.tournament && /* @__PURE__ */ jsxs26("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: [
          "Nessun torneo live attivo. Vai su ",
          /* @__PURE__ */ jsx26("b", { children: "Struttura" }),
          " \u2192 ",
          /* @__PURE__ */ jsx26("b", { children: "Conferma e Avvia Live" }),
          "."
        ] }),
        state.tournament && /* @__PURE__ */ jsxs26(Fragment10, { children: [
          query.trim() && searchStats.filtered === 0 && /* @__PURE__ */ jsxs26("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold flex items-center justify-between gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsxs26("div", { children: [
              "Nessun match trovato per ",
              /* @__PURE__ */ jsxs26("span", { className: "font-mono", children: [
                "\u201C",
                query.trim(),
                "\u201D"
              ] }),
              ".",
              /* @__PURE__ */ jsx26("span", { className: "text-slate-600 font-bold", children: " Prova con codice, squadra o girone." })
            ] }),
            /* @__PURE__ */ jsx26(
              "button",
              {
                type: "button",
                onClick: () => setQuery(""),
                className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                children: "Pulisci"
              }
            )
          ] }),
          state.tournament.type === "groups_elimination" && openGroupTieBreaks.length > 0 && /* @__PURE__ */ jsxs26("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 font-bold", children: [
            /* @__PURE__ */ jsx26("div", { className: "font-black", children: "QUALIFICA BLOCCATA DA SPAREGGIO" }),
            /* @__PURE__ */ jsx26("div", { className: "text-sm font-bold text-amber-900/90 mt-1", children: "Completa gli spareggi dei gironi per sbloccare i qualificati nel tabellone." }),
            /* @__PURE__ */ jsxs26("div", { className: "text-xs font-mono font-black text-amber-900/80 mt-2 flex flex-wrap gap-2", children: [
              openGroupTieBreaks.slice(0, 8).map((m) => /* @__PURE__ */ jsxs26("span", { className: "px-2 py-1 rounded-full border border-amber-200 bg-white", children: [
                m.code || m.id,
                m.groupName ? ` (G ${m.groupName})` : ""
              ] }, m.id)),
              openGroupTieBreaks.length > 8 && /* @__PURE__ */ jsxs26("span", { className: "px-2 py-1 rounded-full border border-amber-200 bg-white", children: [
                "+",
                openGroupTieBreaks.length - 8
              ] })
            ] })
          ] }),
          integrity && /* @__PURE__ */ jsxs26("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold", children: [
            /* @__PURE__ */ jsxs26("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
              /* @__PURE__ */ jsxs26("div", { children: [
                /* @__PURE__ */ jsx26("div", { className: "font-black", children: "INTEGRIT\xC0 TORNEO \u2022 MODIFICHE MANUALI (pre-check)" }),
                /* @__PURE__ */ jsxs26("div", { className: "text-sm font-bold text-slate-700/90 mt-1", children: [
                  "Gironi conclusi: ",
                  integrity.concludedGroups.length,
                  "/",
                  (state.tournament.groups || []).length
                ] })
              ] }),
              integrity.excluded.length > 0 && /* @__PURE__ */ jsxs26("span", { className: "px-3 py-2 rounded-full border border-rose-200 bg-rose-50 text-rose-900 font-black text-xs", children: [
                "Squadre escluse: ",
                integrity.excluded.length
              ] })
            ] }),
            integrity.concludedGroups.length > 0 && /* @__PURE__ */ jsx26("div", { className: "text-xs font-mono font-black text-slate-700/80 mt-3 flex flex-wrap gap-2", children: integrity.concludedGroups.map((name) => /* @__PURE__ */ jsxs26("span", { className: "px-2 py-1 rounded-full border border-slate-200 bg-white", children: [
              "Girone ",
              name,
              " concluso"
            ] }, name)) }),
            integrity.excluded.length > 0 && /* @__PURE__ */ jsxs26("div", { className: "text-xs font-mono font-black text-rose-900/80 mt-3 flex flex-wrap gap-2", children: [
              integrity.excluded.slice(0, 14).map((id) => /* @__PURE__ */ jsx26("span", { className: "px-2 py-1 rounded-full border border-rose-200 bg-white", children: getTeamName(id) || id }, id)),
              integrity.excluded.length > 14 && /* @__PURE__ */ jsxs26("span", { className: "px-2 py-1 rounded-full border border-rose-200 bg-white", children: [
                "+",
                integrity.excluded.length - 14
              ] })
            ] })
          ] }),
          integrity && /* @__PURE__ */ jsxs26("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 font-bold", children: [
            /* @__PURE__ */ jsxs26("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
              /* @__PURE__ */ jsxs26("div", { children: [
                /* @__PURE__ */ jsx26("div", { className: "font-black", children: "MODIFICA MANUALE GIRONI (beta)" }),
                /* @__PURE__ */ jsx26("div", { className: "text-sm font-bold text-slate-700/90 mt-1", children: "Per modifiche manuali seleziona un girone specifico. I gironi conclusi non sono modificabili." })
              ] }),
              /* @__PURE__ */ jsxs26("label", { className: "flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white", children: [
                /* @__PURE__ */ jsx26(
                  "input",
                  {
                    type: "checkbox",
                    checked: manualEditMode,
                    onChange: (e) => setManualEditMode(e.target.checked),
                    disabled: !canManualEditGroupsNow
                  }
                ),
                /* @__PURE__ */ jsx26("span", { className: "text-sm font-black", children: "Abilita" })
              ] })
            ] }),
            !canManualEditGroupsNow && /* @__PURE__ */ jsx26("div", { className: "text-xs font-bold text-slate-700/80 mt-2", children: groupsManualEditDisabledReason }),
            manualEditMode && canManualEditGroupsNow && /* @__PURE__ */ jsxs26("div", { className: "mt-3", children: [
              manualEditMsg && /* @__PURE__ */ jsx26("div", { className: "mb-2 text-xs font-black text-slate-700/80", children: manualEditMsg }),
              /* @__PURE__ */ jsxs26("div", { className: "text-xs font-black text-slate-700/80", children: [
                "Azioni \u2014 ",
                selectedGroupObj?.name,
                ":"
              ] }),
              /* @__PURE__ */ jsxs26("div", { className: "mt-2 flex flex-wrap gap-2 items-end", children: [
                /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-1", children: [
                  /* @__PURE__ */ jsx26("span", { className: "text-[11px] font-black text-slate-600", children: "Squadra esclusa" }),
                  /* @__PURE__ */ jsxs26(
                    "select",
                    {
                      "aria-label": "Seleziona squadra esclusa da aggiungere",
                      value: addTeamToGroupId,
                      onChange: (e) => setAddTeamToGroupId(e.target.value),
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]",
                      children: [
                        /* @__PURE__ */ jsx26("option", { value: "", children: "\u2014 seleziona \u2014" }),
                        availableTeamsToAdd.map((id) => /* @__PURE__ */ jsx26("option", { value: id, children: getTeamName(id) || id }, id))
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx26(
                  "button",
                  {
                    onClick: handleAddTeamToSelectedGroup,
                    disabled: !addTeamToGroupId || availableTeamsToAdd.length === 0,
                    className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed",
                    title: availableTeamsToAdd.length === 0 ? "Nessuna squadra esclusa disponibile" : "Aggiungi al girone selezionato",
                    children: "Aggiungi squadra al girone"
                  }
                )
              ] }),
              availableTeamsToAdd.length === 0 && /* @__PURE__ */ jsx26("div", { className: "text-xs font-bold text-slate-700/70 mt-2", children: "Nessuna squadra esclusa disponibile da aggiungere." }),
              /* @__PURE__ */ jsxs26("div", { className: "mt-4 border-t border-slate-200 pt-3", children: [
                /* @__PURE__ */ jsx26("div", { className: "text-xs font-black text-slate-700/80", children: "Sposta squadra in un altro girone (solo se entrambi non iniziati):" }),
                /* @__PURE__ */ jsxs26("div", { className: "mt-2 flex flex-wrap gap-2 items-end", children: [
                  /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx26("span", { className: "text-[11px] font-black text-slate-600", children: "Squadra nel girone" }),
                    /* @__PURE__ */ jsxs26(
                      "select",
                      {
                        "aria-label": "Seleziona squadra da spostare",
                        value: moveTeamFromGroupId,
                        onChange: (e) => setMoveTeamFromGroupId(e.target.value),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]",
                        children: [
                          /* @__PURE__ */ jsx26("option", { value: "", children: "\u2014 seleziona \u2014" }),
                          teamsInSelectedGroup.map((id) => /* @__PURE__ */ jsx26("option", { value: id, children: getTeamName(id) || id }, id))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx26("span", { className: "text-[11px] font-black text-slate-600", children: "Girone destinazione" }),
                    /* @__PURE__ */ jsxs26(
                      "select",
                      {
                        "aria-label": "Seleziona girone di destinazione",
                        value: moveTeamToGroupName,
                        onChange: (e) => setMoveTeamToGroupName(e.target.value),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[180px]",
                        children: [
                          /* @__PURE__ */ jsx26("option", { value: "", children: "\u2014 seleziona \u2014" }),
                          availableTargetGroups.map((name) => /* @__PURE__ */ jsxs26("option", { value: name, children: [
                            "Girone ",
                            name
                          ] }, name))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx26(
                    "button",
                    {
                      onClick: handleMoveTeamToOtherGroup,
                      disabled: !moveTeamFromGroupId || !moveTeamToGroupName || availableTargetGroups.length === 0,
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed",
                      title: availableTargetGroups.length === 0 ? "Nessun altro girone modificabile disponibile" : "Sposta nel girone selezionato",
                      children: "Sposta squadra"
                    }
                  )
                ] }),
                availableTargetGroups.length === 0 && /* @__PURE__ */ jsx26("div", { className: "text-xs font-bold text-slate-700/70 mt-2", children: "Nessun altro girone modificabile disponibile (altri gironi gi\xE0 iniziati o conclusi)." })
              ] }),
              /* @__PURE__ */ jsxs26("div", { className: "mt-4 border-t border-slate-200 pt-3", children: [
                /* @__PURE__ */ jsx26("div", { className: "text-xs font-black text-slate-700/80", children: "Scambia squadre tra due gironi (solo se entrambi non iniziati):" }),
                /* @__PURE__ */ jsxs26("div", { className: "mt-2 flex flex-wrap gap-2 items-end", children: [
                  /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx26("span", { className: "text-[11px] font-black text-slate-600", children: "Squadra nel girone" }),
                    /* @__PURE__ */ jsxs26(
                      "select",
                      {
                        "aria-label": "Seleziona squadra del girone corrente per lo scambio",
                        value: swapTeamFromSelectedId,
                        onChange: (e) => setSwapTeamFromSelectedId(e.target.value),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]",
                        children: [
                          /* @__PURE__ */ jsx26("option", { value: "", children: "\u2014 seleziona \u2014" }),
                          teamsInSelectedGroup.map((id) => /* @__PURE__ */ jsx26("option", { value: id, children: getTeamName(id) || id }, id))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx26("span", { className: "text-[11px] font-black text-slate-600", children: "Altro girone" }),
                    /* @__PURE__ */ jsxs26(
                      "select",
                      {
                        "aria-label": "Seleziona girone per lo scambio",
                        value: swapTargetGroupName,
                        onChange: (e) => setSwapTargetGroupName(e.target.value),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[180px]",
                        children: [
                          /* @__PURE__ */ jsx26("option", { value: "", children: "\u2014 seleziona \u2014" }),
                          availableTargetGroups.map((name) => /* @__PURE__ */ jsxs26("option", { value: name, children: [
                            "Girone ",
                            name
                          ] }, name))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs26("div", { className: "flex flex-col gap-1", children: [
                    /* @__PURE__ */ jsx26("span", { className: "text-[11px] font-black text-slate-600", children: "Squadra nell\u2019altro girone" }),
                    /* @__PURE__ */ jsxs26(
                      "select",
                      {
                        "aria-label": "Seleziona squadra dell'altro girone per lo scambio",
                        value: swapTeamFromTargetId,
                        onChange: (e) => setSwapTeamFromTargetId(e.target.value),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]",
                        disabled: !swapTargetGroupName,
                        children: [
                          /* @__PURE__ */ jsx26("option", { value: "", children: "\u2014 seleziona \u2014" }),
                          teamsInTargetGroupForSwap.map((id) => /* @__PURE__ */ jsx26("option", { value: id, children: getTeamName(id) || id }, id))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx26(
                    "button",
                    {
                      onClick: handleSwapTeamsBetweenGroups,
                      disabled: !swapTeamFromSelectedId || !swapTargetGroupName || !swapTeamFromTargetId || availableTargetGroups.length === 0,
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed",
                      title: availableTargetGroups.length === 0 ? "Nessun altro girone modificabile disponibile" : "Scambia le due squadre",
                      children: "Scambia"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsx26("div", { className: "text-xs font-bold text-slate-700/70 mt-2", children: "Vincolo: le azioni sono permesse solo se il girone non \xE8 iniziato e non \xE8 concluso." })
            ] })
          ] }),
          (() => {
            const groups = visibleGroups;
            if (!groups.length) {
              return /* @__PURE__ */ jsx26("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: "Nessun girone disponibile in questo torneo." });
            }
            return /* @__PURE__ */ jsx26("div", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4", children: groups.map((g) => {
              const ms = matchesByGroup.get(g.name) || [];
              const played = ms.filter((m) => m.status === "finished");
              const upcoming = ms.filter((m) => m.status !== "finished");
              const total = ms.length;
              const done = played.length;
              const tieBreaks = ms.filter((m) => m.isTieBreak);
              const openTieBreaks = tieBreaks.filter((m) => m.status !== "finished");
              const standings = standingsByGroup.get(g.name) || computeGroupStandings({ teams: g.teams || [], matches: ms });
              const rankedTeams = standings.rankedTeams;
              const rows = standings.rows;
              const MatchRow = ({ m }) => {
                const label = m.code ? m.code : m.id;
                const ids = getMatchParticipantIds(m);
                const names = ids.map((id) => getTeamName(id));
                const isMulti = ids.length >= 3;
                const hasPlaceholder = ids.some((id) => isPlaceholderTeamId(id));
                const teamsLabel = isMulti ? names.join(" vs ") : `${names[0] || "TBD"} vs ${names[1] || "TBD"}`;
                const isFinished = m.status === "finished";
                const isPlaying = m.status === "playing";
                const score = formatMatchScoreLabel(m);
                return /* @__PURE__ */ jsxs26(
                  "div",
                  {
                    onClick: () => {
                      if (isFinished) openReportFromCodes(m.id);
                    },
                    className: `px-3 py-2 rounded-lg border cursor-pointer flex items-center justify-between gap-3 hover:brightness-95 ${isPlaying ? "border-emerald-200 bg-emerald-50" : isFinished ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`,
                    children: [
                      /* @__PURE__ */ jsxs26("div", { className: "min-w-0", children: [
                        /* @__PURE__ */ jsxs26("div", { className: "flex items-center gap-2 min-w-0 flex-wrap", children: [
                          /* @__PURE__ */ jsx26("span", { className: "font-mono font-black text-xs text-slate-600", children: label }),
                          m.isTieBreak && /* @__PURE__ */ jsxs26("span", { className: `text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${isMulti ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-amber-50 text-amber-800 border-amber-200"}`, children: [
                            "SPAREGGIO",
                            isMulti ? " MULTI" : "",
                            typeof m.targetScore === "number" ? ` a ${m.targetScore}` : ""
                          ] }),
                          /* @__PURE__ */ jsx26("span", { className: "font-black text-slate-900 whitespace-normal break-words", children: teamsLabel })
                        ] }),
                        /* @__PURE__ */ jsx26("div", { className: "text-[11px] font-bold text-slate-500 mt-0.5", children: isFinished ? `Risultato: ${score}` : isPlaying ? "IN CORSO" : "DA GIOCARE" })
                      ] }),
                      /* @__PURE__ */ jsxs26("div", { className: "flex items-center gap-2 shrink-0", children: [
                        /* @__PURE__ */ jsx26("span", { className: "px-2 py-1 rounded-full text-[11px] font-black border border-slate-200 bg-slate-50 text-slate-700 uppercase", children: isFinished ? "Giocata" : isPlaying ? "In corso" : "Da giocare" }),
                        isFinished ? /* @__PURE__ */ jsx26(
                          "button",
                          {
                            onClick: (e) => {
                              e.stopPropagation();
                              openReportFromCodes(m.id);
                            },
                            className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                            children: /* @__PURE__ */ jsxs26("span", { className: "inline-flex items-center gap-1", children: [
                              /* @__PURE__ */ jsx26(FileText3, { className: "w-4 h-4" }),
                              " Referto"
                            ] })
                          }
                        ) : /* @__PURE__ */ jsx26(
                          "button",
                          {
                            onClick: (e) => {
                              e.stopPropagation();
                              toggleMatchStatus(m.id);
                            },
                            disabled: hasPlaceholder,
                            className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-slate-900 text-white hover:brightness-110 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                            title: hasPlaceholder ? "Non disponibile: match con TBD/BYE" : "",
                            children: /* @__PURE__ */ jsxs26("span", { className: "inline-flex items-center gap-1", children: [
                              isPlaying ? /* @__PURE__ */ jsx26(Square, { className: "w-4 h-4" }) : /* @__PURE__ */ jsx26(Play3, { className: "w-4 h-4" }),
                              isPlaying ? "Chiudi" : "Avvia"
                            ] })
                          }
                        )
                      ] })
                    ]
                  }
                );
              };
              return /* @__PURE__ */ jsxs26("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden", children: [
                /* @__PURE__ */ jsxs26("div", { className: "bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between", children: [
                  /* @__PURE__ */ jsxs26("div", { className: "flex items-center gap-2 min-w-0", children: [
                    /* @__PURE__ */ jsxs26("span", { className: "truncate", children: [
                      "Girone ",
                      g.name
                    ] }),
                    openTieBreaks.length > 0 && /* @__PURE__ */ jsx26("span", { className: "text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-slate-900 border border-amber-300 shrink-0", children: "SPAREGGIO" })
                  ] }),
                  /* @__PURE__ */ jsxs26("span", { className: "text-xs font-mono font-bold text-white/70", children: [
                    done,
                    "/",
                    total
                  ] })
                ] }),
                /* @__PURE__ */ jsxs26("div", { className: "p-4 space-y-4", children: [
                  /* @__PURE__ */ jsxs26("div", { children: [
                    /* @__PURE__ */ jsx26("div", { className: "text-xs font-black uppercase tracking-widest text-slate-500 mb-2", children: "Classifica" }),
                    /* @__PURE__ */ jsx26("div", { className: "border border-slate-200 rounded-xl overflow-x-auto", children: /* @__PURE__ */ jsxs26("table", { className: "min-w-full text-xs", children: [
                      /* @__PURE__ */ jsx26("thead", { className: "bg-slate-50", children: /* @__PURE__ */ jsxs26("tr", { className: "text-[11px] uppercase tracking-widest text-slate-600", children: [
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-left font-black", children: "#" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-left font-black", children: "Squadra" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "P" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "V" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "S" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "CF" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "CS" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "Diff" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "SF" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "SS" }),
                        /* @__PURE__ */ jsx26("th", { className: "px-2 py-2 text-center font-black", children: "Diff" })
                      ] }) }),
                      /* @__PURE__ */ jsx26("tbody", { children: rankedTeams.map((tt, idx) => {
                        const r = rows[tt.id];
                        const advancing = idx < (state.tournament?.config?.advancingPerGroup ?? 0);
                        return /* @__PURE__ */ jsxs26("tr", { className: `border-t ${advancing ? "bg-beer-100" : "bg-white"}`, children: [
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 font-mono font-black text-slate-600", children: idx + 1 }),
                          /* @__PURE__ */ jsxs26("td", { className: "px-2 py-2 min-w-[180px]", children: [
                            /* @__PURE__ */ jsx26("div", { className: "font-black text-slate-900 whitespace-normal break-words", children: tt.name }),
                            /* @__PURE__ */ jsxs26("div", { className: "text-[11px] font-bold text-slate-500 whitespace-normal break-words", children: [
                              tt.player1,
                              tt.player2 ? ` \u2022 ${tt.player2}` : ""
                            ] })
                          ] }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.played ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.wins ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.losses ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.cupsFor ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.cupsAgainst ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-black", children: r?.cupsDiff ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.blowFor ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-bold", children: r?.blowAgainst ?? 0 }),
                          /* @__PURE__ */ jsx26("td", { className: "px-2 py-2 text-center font-mono font-black", children: r?.blowDiff ?? 0 })
                        ] }, tt.id);
                      }) })
                    ] }) })
                  ] }),
                  /* @__PURE__ */ jsxs26("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-3", children: [
                    /* @__PURE__ */ jsxs26("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
                      /* @__PURE__ */ jsxs26("div", { className: "bg-slate-50 px-3 py-2 font-black text-xs uppercase tracking-widest text-slate-600 flex items-center justify-between", children: [
                        /* @__PURE__ */ jsx26("span", { children: "Giocate" }),
                        /* @__PURE__ */ jsx26("span", { className: "font-mono", children: played.length })
                      ] }),
                      /* @__PURE__ */ jsx26("div", { className: "p-3 space-y-2", children: played.length ? played.map((m) => /* @__PURE__ */ jsx26(MatchRow, { m }, m.id)) : /* @__PURE__ */ jsx26("div", { className: "text-slate-400 font-bold text-sm", children: "Nessuna" }) })
                    ] }),
                    /* @__PURE__ */ jsxs26("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
                      /* @__PURE__ */ jsxs26("div", { className: "bg-slate-50 px-3 py-2 font-black text-xs uppercase tracking-widest text-slate-600 flex items-center justify-between", children: [
                        /* @__PURE__ */ jsx26("span", { children: "Da giocare" }),
                        /* @__PURE__ */ jsx26("span", { className: "font-mono", children: upcoming.length })
                      ] }),
                      /* @__PURE__ */ jsx26("div", { className: "p-3 space-y-2", children: upcoming.length ? upcoming.map((m) => /* @__PURE__ */ jsx26(MatchRow, { m }, m.id)) : /* @__PURE__ */ jsx26("div", { className: "text-slate-400 font-bold text-sm", children: "Nessuna" }) })
                    ] })
                  ] })
                ] })
              ] }, g.id);
            }) });
          })()
        ] })
      ] });
    };
  }
});

// components/admin/tabs/MonitorBracketTab.tsx
import React20 from "react";
import { LayoutDashboard as LayoutDashboard3, Search as Search9, X as X10 } from "lucide-react";
import { Fragment as Fragment11, jsx as jsx27, jsxs as jsxs27 } from "react/jsx-runtime";
var MonitorBracketTab;
var init_MonitorBracketTab = __esm({
  "components/admin/tabs/MonitorBracketTab.tsx"() {
    init_TournamentBracket();
    init_appMode();
    init_matchUtils();
    init_tournamentEngine();
    MonitorBracketTab = ({
      state,
      simBusy,
      handleSimulateTurn,
      handleSimulateAll,
      handleUpdateLiveMatch,
      handleUpdateTournamentAndMatches,
      getTeamName,
      openReportFromCodes,
      toggleMatchStatus,
      handleActivateFinalRoundRobin
    }) => {
      const isPlaceholderTeamId = React20.useCallback((teamId) => {
        const id = (teamId || "").trim();
        if (!id) return true;
        return id === "BYE" || id === "TBD";
      }, []);
      const tournamentTeams = React20.useMemo(() => {
        return state.tournament?.teams && state.tournament.teams.length ? state.tournament.teams : state.teams || [];
      }, [state.tournament?.teams, state.teams]);
      const teamsById = React20.useMemo(() => {
        const map = /* @__PURE__ */ new Map();
        for (const t of tournamentTeams || []) map.set(t.id, t);
        return map;
      }, [tournamentTeams]);
      const [query, setQuery] = React20.useState("");
      const queryNorm = query.trim().toLowerCase();
      const matchMatchesQuery = React20.useCallback((m) => {
        if (!queryNorm) return true;
        const code = ((m.code || m.id || "") + "").toLowerCase();
        const phase = ((m.phase || "") + "").toLowerCase();
        if (code.includes(queryNorm) || phase.includes(queryNorm)) return true;
        const ids = getMatchParticipantIds(m);
        for (const id of ids) {
          const name = ((getTeamName(id) || id || "") + "").toLowerCase();
          if (name.includes(queryNorm)) return true;
        }
        return false;
      }, [queryNorm, getTeamName]);
      const integrity = React20.useMemo(() => {
        if (!state.tournament) return null;
        const rosterRealIds = (tournamentTeams || []).filter((t) => !t.hidden && !t.isBye).map((t) => t.id).filter((id) => !isPlaceholderTeamId(id));
        const included = /* @__PURE__ */ new Set();
        for (const g of state.tournament.groups || []) {
          for (const t of g.teams || []) {
            const id = (t.id || "").trim();
            if (!id || isPlaceholderTeamId(id)) continue;
            if (t.hidden || t.isBye) continue;
            included.add(id);
          }
        }
        for (const m of state.tournamentMatches || []) {
          if (m.hidden || m.hidden) continue;
          if (m.isBye) continue;
          const ids = getMatchParticipantIds(m);
          for (const idRaw of ids) {
            const id = (idRaw || "").trim();
            if (!id || isPlaceholderTeamId(id)) continue;
            const tt = teamsById.get(id);
            if (tt?.hidden || tt?.isBye) continue;
            included.add(id);
          }
        }
        const excluded = rosterRealIds.filter((id) => !included.has(id));
        const bracketLocked = (state.tournamentMatches || []).some((m) => {
          if (m.phase === "groups") return false;
          if (m.hidden || m.hidden) return false;
          if (m.isBye) return false;
          const ids = getMatchParticipantIds(m);
          if (!ids.length) return false;
          if (ids.some((id) => isPlaceholderTeamId(id))) return false;
          return m.status !== "scheduled";
        });
        const groupsConcluded = (state.tournament.groups || []).filter((g) => {
          const ms = (state.tournamentMatches || []).filter((m) => m.phase === "groups" && !m.hidden && !m.isBye).filter((m) => (m.groupName || "\u2014") === g.name).filter((m) => m.teamAId !== "BYE" && m.teamBId !== "BYE");
          if (!ms.length) return false;
          return ms.every((m) => m.status === "finished");
        });
        return {
          excluded,
          bracketLocked,
          groupsConcludedCount: groupsConcluded.length,
          groupsTotal: (state.tournament.groups || []).length
        };
      }, [state.tournament, state.tournamentMatches, tournamentTeams, teamsById, isPlaceholderTeamId]);
      const finalRrStatus = React20.useMemo(() => {
        if (!state.tournament) return null;
        const cfg = state.tournament.config?.finalRoundRobin;
        if (!cfg?.enabled) return null;
        return getFinalRoundRobinActivationStatus(state.tournament, state.tournamentMatches || []);
      }, [state.tournament, state.tournamentMatches]);
      const finalRrReasonLabel = (reason) => {
        switch (reason) {
          case "already_activated":
            return "Gi\xE0 attivo";
          case "missing_topTeams":
            return "Configurazione incompleta (Top4/Top8)";
          case "unsupported_tournament_type":
            return "Non supportato per questo tipo di torneo";
          case "no_bracket_matches":
            return "Nessun tabellone disponibile";
          case "participants_not_determined":
            return "Partecipanti non determinati (TBD)";
          case "bye_in_participants":
            return "BYE tra i partecipanti (non ammesso)";
          case "participants_count_mismatch":
            return "Numero partecipanti non coerente";
          case "participants_not_found_in_roster":
            return "Partecipanti non trovati nella lista squadre";
          case "bracket_too_small_or_unexpected_shape":
            return "Tabellone non in forma attesa per Top selezionato";
          default:
            return "Condizioni non soddisfatte";
        }
      };
      const openGroupTieBreaks = React20.useMemo(() => {
        const ms = (state.tournamentMatches || []).filter((m) => m.phase === "groups" && !m.hidden && !m.isBye).filter((m) => m.isTieBreak).filter((m) => m.status !== "finished");
        return ms.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      }, [state.tournamentMatches]);
      const [bracketZoom, setBracketZoom] = React20.useState(() => {
        const raw2 = (() => {
          try {
            return sessionStorage.getItem("flbp_monitor_bracket_zoom");
          } catch {
            return null;
          }
        })();
        const z = raw2 ? Number(raw2) : 1;
        if (!isFinite(z) || z <= 0) return 1;
        const clamped = Math.min(1.6, Math.max(0.5, z));
        return Math.round(clamped * 10) / 10;
      });
      React20.useEffect(() => {
        try {
          sessionStorage.setItem("flbp_monitor_bracket_zoom", String(bracketZoom));
        } catch {
        }
      }, [bracketZoom]);
      const [manualEditMode, setManualEditMode] = React20.useState(false);
      const [replaceByeSlotKey, setReplaceByeSlotKey] = React20.useState("");
      const [replaceByeTeamId, setReplaceByeTeamId] = React20.useState("");
      const [swapSlotAKey, setSwapSlotAKey] = React20.useState("");
      const [swapSlotBKey, setSwapSlotBKey] = React20.useState("");
      const [manualEditMsg, setManualEditMsg] = React20.useState("");
      React20.useEffect(() => {
        if (integrity?.bracketLocked && manualEditMode) setManualEditMode(false);
      }, [integrity?.bracketLocked, manualEditMode]);
      const bracketMatches = React20.useMemo(() => {
        return (state.tournamentMatches || []).filter((m) => m.phase === "bracket");
      }, [state.tournamentMatches]);
      const round1All = React20.useMemo(() => {
        const ms = bracketMatches.filter((m) => (m.round || 1) === 1);
        return [...ms].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      }, [bracketMatches]);
      const round2All = React20.useMemo(() => {
        const ms = bracketMatches.filter((m) => (m.round || 1) === 2);
        return [...ms].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      }, [bracketMatches]);
      const parseSlotKey = React20.useCallback((key) => {
        const parts = (key || "").split("|");
        if (parts.length !== 2) return null;
        const matchId = parts[0];
        const side = parts[1];
        if (!matchId) return null;
        if (side !== "A" && side !== "B") return null;
        return { matchId, slot: side === "A" ? "teamAId" : "teamBId" };
      }, []);
      const printableRosterTeams = React20.useMemo(() => {
        return (tournamentTeams || []).filter((t) => !t.hidden && !t.isBye).filter((t) => !isPlaceholderTeamId(t.id));
      }, [tournamentTeams, isPlaceholderTeamId]);
      const bracketRealTeamIds = React20.useMemo(() => {
        const ids = /* @__PURE__ */ new Set();
        (bracketMatches || []).forEach((m) => {
          getMatchParticipantIds(m).forEach((id) => {
            if (!isPlaceholderTeamId(id)) ids.add(id);
          });
        });
        return ids;
      }, [bracketMatches, isPlaceholderTeamId]);
      const teamsNotInBracket = React20.useMemo(() => {
        return printableRosterTeams.filter((t) => !bracketRealTeamIds.has(t.id));
      }, [printableRosterTeams, bracketRealTeamIds]);
      const byeSlotOptions = React20.useMemo(() => {
        const opts = [];
        round1All.forEach((m) => {
          const a = (m.teamAId || "").trim();
          const b = (m.teamBId || "").trim();
          if (a === "BYE") opts.push({ key: `${m.id}|A`, label: `${m.code || m.id} \u2022 Slot A (BYE)` });
          if (b === "BYE") opts.push({ key: `${m.id}|B`, label: `${m.code || m.id} \u2022 Slot B (BYE)` });
        });
        return opts;
      }, [round1All]);
      const swapSlotOptions = React20.useMemo(() => {
        const opts = [];
        round1All.forEach((m) => {
          if (m.hidden || m.hidden) return;
          if (m.isBye) return;
          if (m.status !== "scheduled" || m.played) return;
          const a = (m.teamAId || "").trim();
          const b = (m.teamBId || "").trim();
          if (a && !isPlaceholderTeamId(a)) opts.push({ key: `${m.id}|A`, label: `${m.code || m.id} \u2022 A: ${getTeamName(a)}` });
          if (b && !isPlaceholderTeamId(b)) opts.push({ key: `${m.id}|B`, label: `${m.code || m.id} \u2022 B: ${getTeamName(b)}` });
        });
        return opts;
      }, [round1All, getTeamName, isPlaceholderTeamId]);
      const clearRound2PrefillIfByeWin = React20.useCallback((r1MatchId) => {
        const idx = round1All.findIndex((m) => m.id === r1MatchId);
        if (idx < 0) return;
        const r1 = round1All[idx];
        const a = (r1.teamAId || "").trim();
        const b = (r1.teamBId || "").trim();
        if (r1.status !== "finished") return;
        if (a !== "BYE" && b !== "BYE") return;
        const winner = a === "BYE" ? b : b === "BYE" ? a : "";
        if (!winner || isPlaceholderTeamId(winner)) return;
        const target = round2All[Math.floor(idx / 2)];
        if (!target) return;
        const slot = idx % 2 === 0 ? "teamAId" : "teamBId";
        if (target[slot] !== winner) return;
        handleUpdateLiveMatch({ ...target, [slot]: void 0 });
      }, [round1All, round2All, handleUpdateLiveMatch, isPlaceholderTeamId]);
      const handleReplaceBye = React20.useCallback(() => {
        setManualEditMsg("");
        const parsed = parseSlotKey(replaceByeSlotKey);
        const teamId = (replaceByeTeamId || "").trim();
        if (!parsed || !teamId) {
          setManualEditMsg("Seleziona uno slot BYE e una squadra.");
          return;
        }
        if (integrity?.bracketLocked) {
          setManualEditMsg("Tabellone bloccato: non \xE8 possibile modificare.");
          return;
        }
        const m = round1All.find((x) => x.id === parsed.matchId);
        if (!m) {
          setManualEditMsg("Match non trovato.");
          return;
        }
        if (m.phase !== "bracket" || (m.round || 1) !== 1) {
          setManualEditMsg("Solo Round 1 (bracket) \xE8 modificabile in questo step.");
          return;
        }
        if (m.status === "playing") {
          setManualEditMsg("Match in corso: modifica non consentita.");
          return;
        }
        const exists = printableRosterTeams.some((t) => t.id === teamId);
        if (!exists) {
          setManualEditMsg("Squadra non valida (non presente nel roster del torneo).");
          return;
        }
        if (bracketRealTeamIds.has(teamId)) {
          setManualEditMsg("Questa squadra \xE8 gi\xE0 presente nel tabellone.");
          return;
        }
        clearRound2PrefillIfByeWin(m.id);
        const next = { ...m, [parsed.slot]: teamId };
        const a = (next.teamAId || "").trim();
        const b = (next.teamBId || "").trim();
        const isRealA = a && !isPlaceholderTeamId(a);
        const isRealB = b && !isPlaceholderTeamId(b);
        if (a !== "BYE" && b !== "BYE" && isRealA && isRealB) {
          next.hidden = false;
          next.isBye = false;
          next.played = false;
          next.status = "scheduled";
          next.scoreA = 0;
          next.scoreB = 0;
          next.stats = void 0;
        }
        handleUpdateLiveMatch(next);
        setManualEditMsg("BYE sostituito: match aggiornato.");
        setReplaceByeSlotKey("");
        setReplaceByeTeamId("");
      }, [
        replaceByeSlotKey,
        replaceByeTeamId,
        parseSlotKey,
        integrity?.bracketLocked,
        round1All,
        printableRosterTeams,
        bracketRealTeamIds,
        clearRound2PrefillIfByeWin,
        isPlaceholderTeamId,
        handleUpdateLiveMatch
      ]);
      const handleSwapSlots = React20.useCallback(() => {
        setManualEditMsg("");
        const pA = parseSlotKey(swapSlotAKey);
        const pB = parseSlotKey(swapSlotBKey);
        if (!pA || !pB) {
          setManualEditMsg("Seleziona due slot da scambiare.");
          return;
        }
        if (pA.matchId === pB.matchId && pA.slot === pB.slot) {
          setManualEditMsg("Seleziona due slot diversi.");
          return;
        }
        if (integrity?.bracketLocked) {
          setManualEditMsg("Tabellone bloccato: non \xE8 possibile modificare.");
          return;
        }
        const m1 = round1All.find((x) => x.id === pA.matchId);
        const m2 = round1All.find((x) => x.id === pB.matchId);
        if (!m1 || !m2) {
          setManualEditMsg("Match non trovato.");
          return;
        }
        const invalid = (m) => m.phase !== "bracket" || (m.round || 1) !== 1 || m.hidden || m.hidden || m.isBye || m.status !== "scheduled" || m.played;
        if (invalid(m1) || invalid(m2)) {
          setManualEditMsg("Scambio consentito solo su match Round 1 schedulati e non giocati (non BYE).");
          return;
        }
        const t1 = (m1[pA.slot] || "").trim();
        const t2 = (m2[pB.slot] || "").trim();
        if (!t1 || !t2 || isPlaceholderTeamId(t1) || isPlaceholderTeamId(t2)) {
          setManualEditMsg("Scambio consentito solo tra squadre reali (no BYE/TBD).");
          return;
        }
        const u1 = { ...m1, [pA.slot]: t2 };
        const u2 = { ...m2, [pB.slot]: t1 };
        handleUpdateLiveMatch(u1);
        handleUpdateLiveMatch(u2);
        setManualEditMsg("Scambio effettuato (Round 1).");
        setSwapSlotAKey("");
        setSwapSlotBKey("");
      }, [
        swapSlotAKey,
        swapSlotBKey,
        parseSlotKey,
        integrity?.bracketLocked,
        round1All,
        isPlaceholderTeamId,
        handleUpdateLiveMatch
      ]);
      const handleRebuildEliminationBracket = React20.useCallback(() => {
        setManualEditMsg("");
        if (!state.tournament) {
          setManualEditMsg("Nessun torneo live attivo.");
          return;
        }
        if (state.tournament.type !== "elimination") {
          setManualEditMsg('Rigenerazione tabellone disponibile solo per tornei "Solo Eliminazione Diretta".');
          return;
        }
        if (integrity?.bracketLocked) {
          setManualEditMsg("Tabellone bloccato: non \xE8 possibile rigenerare.");
          return;
        }
        const ok = window.confirm("Rigenerare il tabellone (Round 1 + preliminari) in base alla lista squadre attuale?\n\nAttenzione: l\u2019ordine/accoppiamenti possono cambiare. Consentito solo se nessuna partita (reale) del tabellone \xE8 stata avviata.");
        if (!ok) return;
        const liveTeams = state.tournament.teams && state.tournament.teams.length ? state.tournament.teams : tournamentTeams || [];
        try {
          const { tournament: genT, matches: genM } = generateTournamentStructure(liveTeams, {
            mode: "elimination",
            tournamentName: state.tournament.name,
            advancingPerGroup: state.tournament.config?.advancingPerGroup || 2,
            finalRoundRobin: state.tournament.config?.finalRoundRobin
          });
          const nextTournament = {
            ...genT,
            id: state.tournament.id,
            name: state.tournament.name,
            startDate: state.tournament.startDate,
            type: "elimination",
            teams: liveTeams,
            config: {
              ...state.tournament.config,
              finalRoundRobin: state.tournament.config?.finalRoundRobin
            },
            matches: genM,
            rounds: genT.rounds,
            refereesRoster: state.tournament.refereesRoster,
            refereesPassword: state.tournament.refereesPassword,
            isManual: true
          };
          handleUpdateTournamentAndMatches(nextTournament, genM);
          setManualEditMsg("Tabellone rigenerato (preliminari aggiornati).");
        } catch (e) {
          console.error("Rigenerazione tabellone fallita:", e);
          setManualEditMsg("Errore: rigenerazione tabellone fallita.");
        }
      }, [state.tournament, integrity?.bracketLocked, tournamentTeams, handleUpdateTournamentAndMatches]);
      return /* @__PURE__ */ jsxs27("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4", children: [
        /* @__PURE__ */ jsxs27("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
          /* @__PURE__ */ jsxs27("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxs27("h3", { className: "text-xl font-black flex items-center gap-2", children: [
              /* @__PURE__ */ jsx27(LayoutDashboard3, { className: "w-5 h-5" }),
              " Monitor Tabellone"
            ] }),
            /* @__PURE__ */ jsxs27("div", { className: "text-xs font-bold text-slate-500 mt-1", children: [
              "Ricerca rapida per codice/squadra. Tip: usa ",
              /* @__PURE__ */ jsx27("span", { className: "font-black", children: "Avvia/Chiudi" }),
              " per avanzare lo stato, e apri il ",
              /* @__PURE__ */ jsx27("span", { className: "font-black", children: "Referto" }),
              " dai match giocati."
            ] })
          ] }),
          /* @__PURE__ */ jsxs27("div", { className: "flex flex-col gap-2 sm:items-end", children: [
            /* @__PURE__ */ jsxs27("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
              /* @__PURE__ */ jsxs27("div", { className: "relative", children: [
                /* @__PURE__ */ jsx27(Search9, { className: "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" }),
                /* @__PURE__ */ jsx27(
                  "input",
                  {
                    value: query,
                    onChange: (e) => setQuery(e.target.value),
                    placeholder: "Cerca codice o squadra\u2026",
                    className: "w-64 max-w-full pl-9 pr-9 px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                  }
                ),
                query.trim() && /* @__PURE__ */ jsx27(
                  "button",
                  {
                    type: "button",
                    onClick: () => setQuery(""),
                    className: "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500",
                    "aria-label": "Pulisci ricerca",
                    children: /* @__PURE__ */ jsx27(X10, { className: "w-4 h-4 text-slate-500" })
                  }
                )
              ] }),
              isTesterMode ? /* @__PURE__ */ jsxs27(Fragment11, { children: [
                /* @__PURE__ */ jsx27(
                  "button",
                  {
                    onClick: handleSimulateTurn,
                    disabled: !state.tournament || simBusy,
                    className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                    title: "Simula il prossimo turno (gironi: 1 match per girone; bracket: round corrente)",
                    children: "Simula turno"
                  }
                ),
                /* @__PURE__ */ jsx27(
                  "button",
                  {
                    onClick: handleSimulateAll,
                    disabled: !state.tournament || simBusy,
                    className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                    title: "Simula tutte le partite rimanenti",
                    children: "Simula tutto"
                  }
                )
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxs27("div", { className: "text-xs font-bold text-slate-500", children: [
              "Torneo live: ",
              state.tournament ? "SI" : "NO",
              " \u2022 Match: ",
              (state.tournamentMatches || []).length
            ] })
          ] })
        ] }),
        state.tournament && query.trim() && (state.tournamentMatches || []).filter((m) => !m.hidden && !m.isBye).filter(matchMatchesQuery).length === 0 && /* @__PURE__ */ jsxs27("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold flex items-center justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs27("div", { children: [
            "Nessun match trovato per ",
            /* @__PURE__ */ jsxs27("span", { className: "font-mono", children: [
              "\u201C",
              query.trim(),
              "\u201D"
            ] }),
            "."
          ] }),
          /* @__PURE__ */ jsx27(
            "button",
            {
              type: "button",
              onClick: () => setQuery(""),
              className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
              children: "Pulisci"
            }
          )
        ] }),
        state.tournament && integrity && /* @__PURE__ */ jsxs27("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold", children: [
          /* @__PURE__ */ jsxs27("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsxs27("div", { children: [
              /* @__PURE__ */ jsx27("div", { className: "font-black", children: "INTEGRIT\xC0 TORNEO \u2022 MODIFICHE MANUALI (pre-check)" }),
              /* @__PURE__ */ jsxs27("div", { className: "text-sm font-bold text-slate-700/90 mt-1", children: [
                "Tabellone: ",
                integrity.bracketLocked ? "BLOCCATO (match gi\xE0 iniziati)" : "modificabile (nessun match bracket iniziato)",
                " \u2022 Gironi conclusi: ",
                integrity.groupsConcludedCount,
                "/",
                integrity.groupsTotal
              ] })
            ] }),
            integrity.excluded.length > 0 && /* @__PURE__ */ jsxs27("span", { className: "px-3 py-2 rounded-full border border-rose-200 bg-rose-50 text-rose-900 font-black text-xs", children: [
              "Squadre escluse: ",
              integrity.excluded.length
            ] })
          ] }),
          integrity.excluded.length > 0 && /* @__PURE__ */ jsxs27("div", { className: "text-xs font-mono font-black text-rose-900/80 mt-3 flex flex-wrap gap-2", children: [
            integrity.excluded.slice(0, 14).map((id) => /* @__PURE__ */ jsx27("span", { className: "px-2 py-1 rounded-full border border-rose-200 bg-white", children: getTeamName(id) || id }, id)),
            integrity.excluded.length > 14 && /* @__PURE__ */ jsxs27("span", { className: "px-2 py-1 rounded-full border border-rose-200 bg-white", children: [
              "+",
              integrity.excluded.length - 14
            ] })
          ] })
        ] }),
        state.tournament && finalRrStatus && /* @__PURE__ */ jsx27("div", { className: "bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-indigo-900 font-bold", children: /* @__PURE__ */ jsxs27("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs27("div", { children: [
            /* @__PURE__ */ jsx27("div", { className: "font-black", children: "GIRONE FINALE (All'italiana)" }),
            /* @__PURE__ */ jsx27("div", { className: "text-sm font-bold text-indigo-900/90 mt-1", children: finalRrStatus.activated ? "Attivo." : finalRrStatus.canActivate ? `Pronto per l'attivazione (Top${finalRrStatus.topTeams}).` : `Non attivabile: ${finalRrReasonLabel(finalRrStatus.reason)}.` }),
            !finalRrStatus.activated && finalRrStatus.participants && finalRrStatus.participants.length ? /* @__PURE__ */ jsx27("div", { className: "text-xs font-mono font-black text-indigo-900/80 mt-2 flex flex-wrap gap-2", children: finalRrStatus.participants.map((t) => /* @__PURE__ */ jsx27("span", { className: "px-2 py-1 rounded-full border border-indigo-200 bg-white", children: t.name || t.id }, t.id)) }) : null
          ] }),
          !finalRrStatus.activated && /* @__PURE__ */ jsx27(
            "button",
            {
              onClick: handleActivateFinalRoundRobin,
              disabled: !finalRrStatus.canActivate,
              className: "px-4 py-3 rounded-xl font-black border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed",
              title: finalRrStatus.canActivate ? "Attiva il Girone Finale e genera i match all'italiana" : "Il Girone Finale non \xE8 ancora attivabile",
              children: "Attiva Girone Finale"
            }
          )
        ] }) }),
        state.tournament && state.tournament.type === "groups_elimination" && openGroupTieBreaks.length > 0 && /* @__PURE__ */ jsxs27("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 font-bold", children: [
          /* @__PURE__ */ jsx27("div", { className: "font-black", children: "QUALIFICA BLOCCATA DA SPAREGGIO" }),
          /* @__PURE__ */ jsx27("div", { className: "text-sm font-bold text-amber-900/90 mt-1", children: "Finch\xE9 questi spareggi non sono conclusi, i qualificati dei gironi non possono riempire il tabellone." }),
          /* @__PURE__ */ jsxs27("div", { className: "text-xs font-mono font-black text-amber-900/80 mt-2 flex flex-wrap gap-2", children: [
            openGroupTieBreaks.slice(0, 10).map((m) => /* @__PURE__ */ jsxs27("span", { className: "px-2 py-1 rounded-full border border-amber-200 bg-white", children: [
              m.code || m.id,
              m.groupName ? ` (G ${m.groupName})` : ""
            ] }, m.id)),
            openGroupTieBreaks.length > 10 && /* @__PURE__ */ jsxs27("span", { className: "px-2 py-1 rounded-full border border-amber-200 bg-white", children: [
              "+",
              openGroupTieBreaks.length - 10
            ] })
          ] })
        ] }),
        !state.tournament && /* @__PURE__ */ jsxs27("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold", children: [
          "Nessun torneo live attivo. Vai su ",
          /* @__PURE__ */ jsx27("b", { children: "Struttura" }),
          " \u2192 ",
          /* @__PURE__ */ jsx27("b", { children: "Conferma e Avvia Live" }),
          "."
        ] }),
        state.tournament && /* @__PURE__ */ jsxs27("div", { className: "space-y-4", children: [
          integrity && /* @__PURE__ */ jsxs27("div", { className: `border rounded-xl p-4 font-bold ${integrity.excluded.length ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`, children: [
            /* @__PURE__ */ jsx27("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: /* @__PURE__ */ jsxs27("div", { children: [
              /* @__PURE__ */ jsx27("div", { className: "font-black", children: "CONTROLLO COERENZA TORNEO" }),
              /* @__PURE__ */ jsx27("div", { className: "text-sm font-bold mt-1", children: integrity.excluded.length ? `Attenzione: ${integrity.excluded.length} squadra/e presenti in "Squadre" non risultano incluse in gironi/tabellone.` : "OK: tutte le squadre risultano incluse in gironi e/o tabellone." }),
              /* @__PURE__ */ jsxs27("div", { className: "text-xs font-bold mt-2 opacity-90", children: [
                "Tabellone modificabile: ",
                /* @__PURE__ */ jsx27("span", { className: "font-black", children: integrity.bracketLocked ? "NO (partite gi\xE0 avviate)" : "SI" }),
                integrity.groupsTotal > 0 ? /* @__PURE__ */ jsxs27(Fragment11, { children: [
                  " \u2022 Gironi conclusi: ",
                  /* @__PURE__ */ jsxs27("span", { className: "font-black", children: [
                    integrity.groupsConcludedCount,
                    "/",
                    integrity.groupsTotal
                  ] })
                ] }) : null
              ] })
            ] }) }),
            integrity.excluded.length > 0 && /* @__PURE__ */ jsxs27("div", { className: "mt-3 text-xs font-mono font-black flex flex-wrap gap-2", children: [
              integrity.excluded.slice(0, 16).map((id) => /* @__PURE__ */ jsx27("span", { className: "px-2 py-1 rounded-full border border-rose-200 bg-white", children: getTeamName(id) || id }, id)),
              integrity.excluded.length > 16 && /* @__PURE__ */ jsxs27("span", { className: "px-2 py-1 rounded-full border border-rose-200 bg-white", children: [
                "+",
                integrity.excluded.length - 16
              ] })
            ] })
          ] }),
          integrity && /* @__PURE__ */ jsxs27("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 font-bold", children: [
            /* @__PURE__ */ jsxs27("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
              /* @__PURE__ */ jsxs27("div", { children: [
                /* @__PURE__ */ jsx27("div", { className: "font-black", children: "MODIFICA MANUALE TABELLONE (beta)" }),
                /* @__PURE__ */ jsx27("div", { className: "text-sm font-bold text-slate-700/90 mt-1", children: "Abilitabile solo se nessuna partita del tabellone \xE8 stata avviata." })
              ] }),
              /* @__PURE__ */ jsxs27("label", { className: "flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white", children: [
                /* @__PURE__ */ jsx27(
                  "input",
                  {
                    type: "checkbox",
                    checked: manualEditMode,
                    onChange: (e) => setManualEditMode(e.target.checked),
                    disabled: integrity.bracketLocked
                  }
                ),
                /* @__PURE__ */ jsx27("span", { className: "text-sm font-black", children: "Abilita" })
              ] })
            ] }),
            integrity.bracketLocked && /* @__PURE__ */ jsx27("div", { className: "text-xs font-bold text-slate-700/80 mt-2", children: "Disabilitato: tabellone gi\xE0 bloccato (almeno una partita bracket \xE8 in corso o conclusa)." }),
            manualEditMode && !integrity.bracketLocked && /* @__PURE__ */ jsxs27("div", { className: "mt-3 space-y-3", children: [
              /* @__PURE__ */ jsx27("div", { className: "text-xs font-black text-slate-700/80", children: "Azioni (Round 1) \u2014 disponibili solo se il tabellone non \xE8 ancora iniziato" }),
              manualEditMsg && /* @__PURE__ */ jsx27("div", { className: "text-xs font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2", children: manualEditMsg }),
              /* @__PURE__ */ jsxs27("div", { className: "bg-white border border-slate-200 rounded-xl p-3", children: [
                /* @__PURE__ */ jsx27("div", { className: "text-xs font-black text-slate-700/80", children: "Sostituisci BYE con squadra (Round 1)" }),
                /* @__PURE__ */ jsxs27("div", { className: "mt-2 flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxs27(
                    "select",
                    {
                      className: "px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white",
                      value: replaceByeSlotKey,
                      onChange: (e) => setReplaceByeSlotKey(e.target.value),
                      children: [
                        /* @__PURE__ */ jsx27("option", { value: "", children: "Seleziona slot BYE\u2026" }),
                        byeSlotOptions.map((o) => /* @__PURE__ */ jsx27("option", { value: o.key, children: o.label }, o.key))
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs27(
                    "select",
                    {
                      className: "px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white",
                      value: replaceByeTeamId,
                      onChange: (e) => setReplaceByeTeamId(e.target.value),
                      children: [
                        /* @__PURE__ */ jsx27("option", { value: "", children: "Seleziona squadra\u2026" }),
                        teamsNotInBracket.map((t) => /* @__PURE__ */ jsx27("option", { value: t.id, children: t.name }, t.id))
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx27(
                    "button",
                    {
                      onClick: handleReplaceBye,
                      disabled: !replaceByeSlotKey || !replaceByeTeamId || byeSlotOptions.length === 0 || teamsNotInBracket.length === 0,
                      className: `px-3 py-2 rounded-xl font-black border text-xs ${!replaceByeSlotKey || !replaceByeTeamId || byeSlotOptions.length === 0 || teamsNotInBracket.length === 0 ? "border-slate-200 bg-white opacity-50 cursor-not-allowed" : "border-slate-300 bg-slate-900 text-white"}`,
                      title: byeSlotOptions.length === 0 ? "Nessuno slot BYE disponibile in Round 1" : teamsNotInBracket.length === 0 ? "Nessuna squadra \u201Cnuova\u201D da inserire (tutte gi\xE0 presenti nel tabellone)" : "",
                      children: "Inserisci"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx27("div", { className: "text-[11px] font-bold text-slate-700/70 mt-2", children: "Nota: inserendo una squadra al posto di un BYE, viene rimosso l\u2019auto-advance che aveva precompilato il Round 2 (se presente)." })
              ] }),
              /* @__PURE__ */ jsxs27("div", { className: "bg-white border border-slate-200 rounded-xl p-3", children: [
                /* @__PURE__ */ jsx27("div", { className: "text-xs font-black text-slate-700/80", children: "Scambia posizioni (Round 1)" }),
                /* @__PURE__ */ jsxs27("div", { className: "mt-2 flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxs27(
                    "select",
                    {
                      className: "px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white",
                      value: swapSlotAKey,
                      onChange: (e) => setSwapSlotAKey(e.target.value),
                      children: [
                        /* @__PURE__ */ jsx27("option", { value: "", children: "Slot 1\u2026" }),
                        swapSlotOptions.map((o) => /* @__PURE__ */ jsx27("option", { value: o.key, children: o.label }, o.key))
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs27(
                    "select",
                    {
                      className: "px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white",
                      value: swapSlotBKey,
                      onChange: (e) => setSwapSlotBKey(e.target.value),
                      children: [
                        /* @__PURE__ */ jsx27("option", { value: "", children: "Slot 2\u2026" }),
                        swapSlotOptions.map((o) => /* @__PURE__ */ jsx27("option", { value: o.key, children: o.label }, o.key))
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx27(
                    "button",
                    {
                      onClick: handleSwapSlots,
                      disabled: !swapSlotAKey || !swapSlotBKey,
                      className: `px-3 py-2 rounded-xl font-black border text-xs ${!swapSlotAKey || !swapSlotBKey ? "border-slate-200 bg-white opacity-50 cursor-not-allowed" : "border-slate-300 bg-slate-900 text-white"}`,
                      children: "Scambia"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx27("div", { className: "text-[11px] font-bold text-slate-700/70 mt-2", children: "Solo match Round 1 schedulati e non giocati (no BYE/TBD)." })
              ] }),
              /* @__PURE__ */ jsxs27("div", { className: "bg-white border border-slate-200 rounded-xl p-3", children: [
                /* @__PURE__ */ jsx27("div", { className: "text-xs font-black text-slate-700/80", children: "Rigenera tabellone (nuovi preliminari)" }),
                /* @__PURE__ */ jsxs27("div", { className: "mt-2 flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsx27(
                    "button",
                    {
                      onClick: handleRebuildEliminationBracket,
                      disabled: !state.tournament || state.tournament.type !== "elimination",
                      className: `px-3 py-2 rounded-xl font-black border text-xs ${!state.tournament || state.tournament.type !== "elimination" ? "border-slate-200 bg-white opacity-50 cursor-not-allowed" : "border-slate-300 bg-slate-900 text-white"}`,
                      title: state.tournament && state.tournament.type !== "elimination" ? 'Disponibile solo per tornei "Solo Eliminazione Diretta"' : "",
                      children: "Rigenera"
                    }
                  ),
                  /* @__PURE__ */ jsx27("div", { className: "text-[11px] font-bold text-slate-700/70", children: "Ricrea Round 1 + preliminari in base alla lista squadre attuale. Consentito solo se nessuna partita reale del tabellone \xE8 stata avviata." })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs27("div", { className: "bg-white rounded-xl shadow-lg border border-slate-200 p-4 space-y-3", children: [
            /* @__PURE__ */ jsxs27("div", { className: "flex items-center justify-between gap-2 flex-wrap", children: [
              /* @__PURE__ */ jsx27("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide", children: "Zoom tabellone" }),
              /* @__PURE__ */ jsxs27("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx27(
                  "button",
                  {
                    onClick: () => setBracketZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10)),
                    className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs",
                    title: "Riduci",
                    children: "\u2212"
                  }
                ),
                /* @__PURE__ */ jsxs27(
                  "button",
                  {
                    onClick: () => setBracketZoom(1),
                    className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs",
                    title: "Reset",
                    children: [
                      Math.round(bracketZoom * 100),
                      "%"
                    ]
                  }
                ),
                /* @__PURE__ */ jsx27(
                  "button",
                  {
                    onClick: () => setBracketZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10)),
                    className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs",
                    title: "Ingrandisci",
                    children: "+"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx27("div", { className: "overflow-auto", children: /* @__PURE__ */ jsx27(
              TournamentBracket,
              {
                teams: state.teams || [],
                data: state.tournament,
                matches: state.tournamentMatches || [],
                onUpdate: handleUpdateLiveMatch,
                scale: bracketZoom,
                onMatchClick: (m) => openReportFromCodes(m.id),
                wrapTeamNames: true
              }
            ) })
          ] }),
          (() => {
            const msAll = [...state.tournamentMatches || []].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            const playing = (queryNorm ? msAll.filter(matchMatchesQuery) : msAll).filter((m) => m.status === "playing");
            const scheduled = (queryNorm ? msAll.filter(matchMatchesQuery) : msAll).filter((m) => m.status === "scheduled");
            const finished = (queryNorm ? msAll.filter(matchMatchesQuery) : msAll).filter((m) => m.status === "finished");
            const Section = ({ title, items }) => /* @__PURE__ */ jsxs27("div", { className: "border border-slate-200 rounded-xl overflow-hidden bg-white", children: [
              /* @__PURE__ */ jsxs27("div", { className: "bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between", children: [
                /* @__PURE__ */ jsx27("span", { children: title }),
                /* @__PURE__ */ jsx27("span", { className: "text-xs font-mono font-bold text-white/70", children: items.length })
              ] }),
              /* @__PURE__ */ jsxs27("div", { className: "divide-y divide-slate-100", children: [
                items.map((m) => {
                  const label = m.code ? m.code : m.id;
                  const ids = getMatchParticipantIds(m);
                  const names = ids.map((id) => getTeamName(id));
                  const isMulti = ids.length >= 3;
                  const teamsLabel = isMulti ? names.join(" vs ") : `${names[0] || "TBD"} vs ${names[1] || "TBD"}`;
                  const where = m.phase === "groups" ? m.groupName ? `Girone ${m.groupName}` : "Gironi" : m.roundName || (m.round ? `Round ${m.round}` : "Bracket");
                  const canToggle = m.status !== "finished";
                  const toggleLabel = m.status === "playing" ? "Pausa" : "Avvia";
                  const scoreLabel = formatMatchScoreLabel(m);
                  return /* @__PURE__ */ jsxs27(
                    "div",
                    {
                      onClick: () => {
                        if (m.status === "finished") {
                          openReportFromCodes(m.id);
                        }
                      },
                      className: `px-4 py-3 flex items-center justify-between gap-3 cursor-pointer ${m.status === "playing" ? "bg-emerald-50" : m.status === "finished" ? "bg-rose-50" : "bg-white"} hover:brightness-95`,
                      children: [
                        /* @__PURE__ */ jsxs27("div", { className: "min-w-0", children: [
                          /* @__PURE__ */ jsxs27("div", { className: "font-black text-slate-900 flex items-center gap-2 min-w-0 flex-wrap", children: [
                            /* @__PURE__ */ jsx27("span", { className: "font-mono text-xs text-slate-500", children: label }),
                            m.isTieBreak && /* @__PURE__ */ jsxs27("span", { className: `text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${isMulti ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-amber-50 text-amber-800 border-amber-200"}`, children: [
                              "SPAREGGIO",
                              isMulti ? " MULTI" : "",
                              typeof m.targetScore === "number" ? ` a ${m.targetScore}` : ""
                            ] }),
                            /* @__PURE__ */ jsx27("span", { className: "whitespace-normal break-words", children: teamsLabel })
                          ] }),
                          /* @__PURE__ */ jsx27("div", { className: "text-xs font-bold text-slate-500 mt-1", children: where })
                        ] }),
                        /* @__PURE__ */ jsxs27("div", { className: "flex items-center gap-2 shrink-0", children: [
                          /* @__PURE__ */ jsx27("span", { className: "font-mono font-black text-slate-700 text-xs", children: scoreLabel }),
                          canToggle && /* @__PURE__ */ jsx27(
                            "button",
                            {
                              onClick: (e) => {
                                e.stopPropagation();
                                toggleMatchStatus(m.id);
                              },
                              className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs",
                              children: toggleLabel
                            }
                          ),
                          /* @__PURE__ */ jsx27(
                            "button",
                            {
                              onClick: (e) => {
                                e.stopPropagation();
                                openReportFromCodes(m.id);
                              },
                              className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs",
                              children: "Referto"
                            }
                          )
                        ] })
                      ]
                    },
                    m.id
                  );
                }),
                !items.length && /* @__PURE__ */ jsx27("div", { className: "px-4 py-6 text-center text-slate-400 font-bold", children: "Nessun match" })
              ] })
            ] });
            return /* @__PURE__ */ jsxs27("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
              /* @__PURE__ */ jsx27(Section, { title: "In corso", items: playing }),
              /* @__PURE__ */ jsx27(Section, { title: "Da giocare", items: scheduled }),
              /* @__PURE__ */ jsx27(Section, { title: "Giocate", items: finished })
            ] });
          })()
        ] })
      ] });
    };
  }
});

// components/admin/tabs/data/ArchiveSubTab.tsx
import { useEffect as useEffect7, useMemo as useMemo5, useState as useState11 } from "react";
import { Plus as Plus2, Archive, Upload as Upload3, Trash2 as Trash22, CheckCircle2 as CheckCircle25 } from "lucide-react";
import { Fragment as Fragment12, jsx as jsx28, jsxs as jsxs28 } from "react/jsx-runtime";
var ArchiveSubTab;
var init_ArchiveSubTab = __esm({
  "components/admin/tabs/data/ArchiveSubTab.tsx"() {
    init_storageService();
    init_tournamentEngine();
    init_matchUtils();
    ArchiveSubTab = ({
      state,
      setState,
      t,
      dataSubTab,
      setDataSubTab,
      integrationsSubTab,
      setIntegrationsSubTab,
      aliasesSearch,
      setAliasesSearch,
      aliasToolSelections,
      setAliasToolSelections,
      buildProfilesIndex,
      setAlias,
      removeAlias,
      dataSelectedTournamentId,
      setDataSelectedTournamentId,
      dataSelectedMatchId,
      setDataSelectedMatchId,
      dataScoreA,
      setDataScoreA,
      dataScoreB,
      setDataScoreB,
      dataStatus,
      setDataStatus,
      dataRecomputeAwards,
      setDataRecomputeAwards,
      dataWinnerTeamId,
      setDataWinnerTeamId,
      dataTopScorerPlayerId,
      setDataTopScorerPlayerId,
      dataDefenderPlayerId,
      setDataDefenderPlayerId,
      dataMvpPlayerId,
      setDataMvpPlayerId,
      dataTopScorerU25PlayerId,
      setDataTopScorerU25PlayerId,
      dataDefenderU25PlayerId,
      setDataDefenderU25PlayerId,
      hofEditId,
      setHofEditId,
      hofEditTournamentId,
      setHofEditTournamentId,
      hofYear,
      setHofYear,
      hofTournamentName,
      setHofTournamentName,
      hofType,
      setHofType,
      hofTeamName,
      setHofTeamName,
      hofWinnerP1,
      setHofWinnerP1,
      hofWinnerP2,
      setHofWinnerP2,
      hofPlayerName,
      setHofPlayerName,
      hofPlayerYoB,
      setHofPlayerYoB,
      hofValue,
      setHofValue,
      scorersImportWarnings,
      setScorersImportWarnings,
      setPendingScorersImport,
      setAliasModalOpen,
      setAliasModalTitle,
      setAliasModalConflicts,
      scorersFileRef,
      createArchiveOpen,
      createArchiveStep,
      setCreateArchiveStep,
      createArchiveName,
      setCreateArchiveName,
      createArchiveDate,
      setCreateArchiveDate,
      createArchiveMode,
      setCreateArchiveMode,
      createArchiveGroups,
      setCreateArchiveGroups,
      createArchiveAdvancing,
      setCreateArchiveAdvancing,
      createArchiveFinalRrEnabled,
      setCreateArchiveFinalRrEnabled,
      createArchiveFinalRrTopTeams,
      setCreateArchiveFinalRrTopTeams,
      createArchiveTeams,
      createArchiveFileRef,
      caTeamName,
      setCaTeamName,
      caP1,
      setCaP1,
      caY1,
      setCaY1,
      caP2,
      setCaP2,
      caY2,
      setCaY2,
      caP1IsRef,
      setCaP1IsRef,
      caP2IsRef,
      setCaP2IsRef,
      openCreateArchiveWizard,
      resetCreateArchiveWizard,
      copyLiveTeamsIntoWizard,
      importArchiveTeamsFile,
      addWizardTeam,
      removeWizardTeam,
      createArchivedTournament,
      autoFixBracketFromResults,
      computeAwardsFromArchive
    }) => {
      const [editStats, setEditStats] = useState11({});
      const [editStatsMatchId, setEditStatsMatchId] = useState11("");
      useEffect7(() => {
        const tsel = (state.tournamentHistory || []).find((x) => x.id === dataSelectedTournamentId);
        if (!tsel) return;
        const msel = (tsel.matches || []).find((mm) => mm.id === dataSelectedMatchId);
        if (!msel) return;
        if (editStatsMatchId === msel.id) return;
        const map = {};
        const push = (teamId, playerName) => {
          if (!teamId || !playerName) return;
          if (teamId === "BYE") return;
          const key = `${teamId}||${playerName}`;
          const existing = (msel.stats || []).find((st) => st.teamId === teamId && st.playerName === playerName);
          map[key] = { canestri: String(existing?.canestri ?? 0), soffi: String(existing?.soffi ?? 0) };
        };
        const participantIds = getMatchParticipantIds(msel);
        participantIds.forEach((id) => {
          const team = id ? (tsel.teams || []).find((tt) => tt.id === id) : null;
          if (!team) return;
          push(team.id, team.player1);
          push(team.id, team.player2);
        });
        setEditStats(map);
        setEditStatsMatchId(msel.id);
      }, [state.tournamentHistory, dataSelectedTournamentId, dataSelectedMatchId, editStatsMatchId]);
      const computedScores = useMemo5(() => {
        const tsel = (state.tournamentHistory || []).find((x) => x.id === dataSelectedTournamentId);
        if (!tsel) return { scoreA: 0, scoreB: 0 };
        const msel = (tsel.matches || []).find((mm) => mm.id === dataSelectedMatchId);
        if (!msel) return { scoreA: 0, scoreB: 0 };
        const participantIds = getMatchParticipantIds(msel);
        const teams = participantIds.map((id) => id ? (tsel.teams || []).find((tt) => tt.id === id) : null).filter(Boolean);
        const sumTeam = (team) => {
          if (!team) return 0;
          const keys = [team.player1, team.player2].filter(Boolean).map((pn) => `${team.id}||${pn}`);
          return keys.reduce((acc, k) => acc + (parseInt(editStats[k]?.canestri || "0", 10) || 0), 0);
        };
        const scoresByTeam = {};
        teams.forEach((t2) => {
          scoresByTeam[t2.id] = sumTeam(t2);
        });
        const ordered = Object.values(scoresByTeam).sort((a, b) => b - a);
        return { scoreA: ordered[0] ?? 0, scoreB: ordered[1] ?? 0, scoresByTeam };
      }, [state.tournamentHistory, dataSelectedTournamentId, dataSelectedMatchId, editStats]);
      const wizardPlayableTeamsCount = useMemo5(() => {
        return (createArchiveTeams || []).filter((t2) => !t2.isReferee && !t2.hidden && !t2.isBye).length;
      }, [createArchiveTeams]);
      const finalToggleDisabled = createArchiveMode === "round_robin" || wizardPlayableTeamsCount < 4;
      const top8Disabled = wizardPlayableTeamsCount < 8;
      return /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxs28("div", { className: "lg:col-span-1 space-y-3", children: [
          /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-700", children: "Tornei archiviati" }),
            /* @__PURE__ */ jsxs28(
              "button",
              {
                onClick: () => {
                  if (createArchiveOpen) {
                    if (confirm("Chiudere la creazione del torneo? I dati non salvati andranno persi.")) resetCreateArchiveWizard();
                    return;
                  }
                  openCreateArchiveWizard();
                },
                className: `px-3 py-2 rounded-xl font-black border text-sm flex items-center gap-2 ${createArchiveOpen ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800" : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"}`,
                children: [
                  /* @__PURE__ */ jsx28(Plus2, { className: "w-4 h-4" }),
                  createArchiveOpen ? "Chiudi" : "Nuovo torneo"
                ]
              }
            )
          ] }),
          createArchiveOpen && /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
            /* @__PURE__ */ jsxs28("div", { className: "bg-slate-50 px-4 py-3 flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsxs28("div", { className: "font-black text-slate-800 flex items-center gap-2", children: [
                /* @__PURE__ */ jsx28(Archive, { className: "w-4 h-4" }),
                " Nuovo torneo archiviato"
              ] }),
              /* @__PURE__ */ jsxs28("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsx28(
                  "button",
                  {
                    onClick: () => setCreateArchiveStep("meta"),
                    className: `px-2 py-1 rounded-lg text-xs font-black border ${createArchiveStep === "meta" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: "1) Meta"
                  }
                ),
                /* @__PURE__ */ jsx28(
                  "button",
                  {
                    onClick: () => setCreateArchiveStep("teams"),
                    className: `px-2 py-1 rounded-lg text-xs font-black border ${createArchiveStep === "teams" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: "2) Squadre"
                  }
                ),
                /* @__PURE__ */ jsx28(
                  "button",
                  {
                    onClick: () => setCreateArchiveStep("structure"),
                    className: `px-2 py-1 rounded-lg text-xs font-black border ${createArchiveStep === "structure" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: "3) Struttura"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs28("div", { className: "p-4 space-y-4", children: [
              createArchiveStep === "meta" && /* @__PURE__ */ jsxs28("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Nome torneo" }),
                  /* @__PURE__ */ jsx28(
                    "input",
                    {
                      value: createArchiveName,
                      onChange: (e) => setCreateArchiveName(e.target.value),
                      className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black",
                      placeholder: "Es. FLBP Christmas Cup"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
                  /* @__PURE__ */ jsxs28("div", { children: [
                    /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Data (anno torneo)" }),
                    /* @__PURE__ */ jsx28(
                      "input",
                      {
                        type: "date",
                        value: createArchiveDate,
                        onChange: (e) => setCreateArchiveDate(e.target.value),
                        className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs28("div", { children: [
                    /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Modalit\xE0" }),
                    /* @__PURE__ */ jsxs28(
                      "select",
                      {
                        value: createArchiveMode,
                        onChange: (e) => setCreateArchiveMode(e.target.value),
                        className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black",
                        children: [
                          /* @__PURE__ */ jsx28("option", { value: "round_robin", children: "All'italiana (Girone unico)" }),
                          /* @__PURE__ */ jsx28("option", { value: "groups_elimination", children: "Gironi + Eliminazione" }),
                          /* @__PURE__ */ jsx28("option", { value: "elimination", children: "Eliminazione diretta" })
                        ]
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-bold text-slate-500", children: "Poi: inserisci le squadre e genera la struttura. I risultati si inseriscono dalla schermata di edit gi\xE0 esistente." }),
                  /* @__PURE__ */ jsx28(
                    "button",
                    {
                      onClick: () => setCreateArchiveStep("teams"),
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm",
                      children: "Avanti \u2192"
                    }
                  )
                ] })
              ] }),
              createArchiveStep === "teams" && /* @__PURE__ */ jsxs28("div", { className: "space-y-4", children: [
                /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsxs28("div", { className: "font-black text-slate-800", children: [
                    "Squadre (",
                    (createArchiveTeams || []).length,
                    ")"
                  ] }),
                  /* @__PURE__ */ jsxs28("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx28(
                      "button",
                      {
                        onClick: copyLiveTeamsIntoWizard,
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs",
                        children: "Copia dal Live"
                      }
                    ),
                    /* @__PURE__ */ jsx28(
                      "input",
                      {
                        ref: createArchiveFileRef,
                        type: "file",
                        accept: ".xlsx,.xls,.csv",
                        className: "hidden",
                        onChange: (e) => {
                          const f = e.target.files?.[0];
                          if (f) importArchiveTeamsFile(f);
                          if (createArchiveFileRef.current) createArchiveFileRef.current.value = "";
                        }
                      }
                    ),
                    /* @__PURE__ */ jsxs28(
                      "button",
                      {
                        onClick: () => createArchiveFileRef.current?.click(),
                        className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs flex items-center gap-2",
                        children: [
                          /* @__PURE__ */ jsx28(Upload3, { className: "w-4 h-4" }),
                          " Import"
                        ]
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-xl p-3 space-y-2", children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500", children: "Inserimento manuale (3 righe)" }),
                  /* @__PURE__ */ jsx28("input", { value: caTeamName, onChange: (e) => setCaTeamName(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black", placeholder: "Squadra" }),
                  /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2", children: [
                    /* @__PURE__ */ jsx28("input", { value: caP1, onChange: (e) => setCaP1(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black", placeholder: "Giocatore 1" }),
                    /* @__PURE__ */ jsx28("input", { value: caY1, onChange: (e) => setCaY1(e.target.value.replace(/[^0-9]/g, "")), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black", placeholder: "Anno" }),
                    /* @__PURE__ */ jsxs28("label", { className: "flex items-center gap-2 text-xs font-black text-slate-700", children: [
                      /* @__PURE__ */ jsx28("input", { type: "checkbox", checked: caP1IsRef, onChange: (e) => setCaP1IsRef(e.target.checked) }),
                      "Arbitro"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2", children: [
                    /* @__PURE__ */ jsx28("input", { value: caP2, onChange: (e) => setCaP2(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black", placeholder: "Giocatore 2" }),
                    /* @__PURE__ */ jsx28("input", { value: caY2, onChange: (e) => setCaY2(e.target.value.replace(/[^0-9]/g, "")), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black", placeholder: "Anno" }),
                    /* @__PURE__ */ jsxs28("label", { className: "flex items-center gap-2 text-xs font-black text-slate-700", children: [
                      /* @__PURE__ */ jsx28("input", { type: "checkbox", checked: caP2IsRef, onChange: (e) => setCaP2IsRef(e.target.checked) }),
                      "Arbitro"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
                    /* @__PURE__ */ jsx28("div", { className: "text-xs font-bold text-slate-500", children: "Puoi anche importare lo stesso formato Excel/CSV delle squadre Live." }),
                    /* @__PURE__ */ jsxs28("button", { onClick: addWizardTeam, className: "px-3 py-2 rounded-xl font-black bg-blue-700 text-white hover:bg-blue-800 text-sm flex items-center gap-2", children: [
                      /* @__PURE__ */ jsx28(Plus2, { className: "w-4 h-4" }),
                      " Aggiungi"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
                  /* @__PURE__ */ jsx28("div", { className: "bg-slate-50 px-4 py-2 font-black text-slate-700", children: "Lista squadre" }),
                  /* @__PURE__ */ jsxs28("div", { className: "max-h-[260px] overflow-auto divide-y divide-slate-100", children: [
                    (createArchiveTeams || []).map((tn) => /* @__PURE__ */ jsxs28("div", { className: "px-4 py-2 flex items-center justify-between gap-2", children: [
                      /* @__PURE__ */ jsxs28("div", { className: "min-w-0", children: [
                        /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-900 truncate", children: tn.name }),
                        /* @__PURE__ */ jsxs28("div", { className: "text-xs font-bold text-slate-500 truncate", children: [
                          tn.player1,
                          " (",
                          tn.player1YoB ? String(tn.player1YoB).slice(-2) : "ND",
                          ")",
                          tn.player1IsReferee ? " \u2705" : "",
                          " \xB7 ",
                          tn.player2,
                          " (",
                          tn.player2YoB ? String(tn.player2YoB).slice(-2) : "ND",
                          ")",
                          tn.player2IsReferee ? " \u2705" : ""
                        ] })
                      ] }),
                      /* @__PURE__ */ jsxs28("button", { onClick: () => removeWizardTeam(tn.id), className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs flex items-center gap-2", children: [
                        /* @__PURE__ */ jsx28(Trash22, { className: "w-4 h-4" }),
                        " Elimina"
                      ] })
                    ] }, tn.id)),
                    !(createArchiveTeams || []).length && /* @__PURE__ */ jsx28("div", { className: "px-4 py-6 text-center text-slate-400 font-bold", children: "Nessuna squadra inserita." })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsx28(
                    "button",
                    {
                      onClick: () => setCreateArchiveStep("meta"),
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm",
                      children: "\u2190 Indietro"
                    }
                  ),
                  /* @__PURE__ */ jsx28(
                    "button",
                    {
                      onClick: () => setCreateArchiveStep("structure"),
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm",
                      children: "Avanti \u2192"
                    }
                  )
                ] })
              ] }),
              createArchiveStep === "structure" && /* @__PURE__ */ jsxs28("div", { className: "space-y-3", children: [
                /* @__PURE__ */ jsx28("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: createArchiveMode === "groups_elimination" && /* @__PURE__ */ jsxs28(Fragment12, { children: [
                  /* @__PURE__ */ jsxs28("div", { children: [
                    /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Numero gironi" }),
                    /* @__PURE__ */ jsx28(
                      "input",
                      {
                        value: String(createArchiveGroups),
                        onChange: (e) => setCreateArchiveGroups(Math.max(1, Math.min(64, Number(e.target.value.replace(/[^0-9]/g, "")) || 1))),
                        className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs28("div", { children: [
                    /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Qualificate per girone" }),
                    /* @__PURE__ */ jsx28(
                      "input",
                      {
                        value: String(createArchiveAdvancing),
                        onChange: (e) => setCreateArchiveAdvancing(Math.max(1, Math.min(8, Number(e.target.value.replace(/[^0-9]/g, "")) || 1))),
                        className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black"
                      }
                    )
                  ] })
                ] }) }),
                createArchiveMode === "round_robin" && /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-xl p-3 bg-slate-50", children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-700", children: "All'italiana (girone unico)" }),
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-bold text-slate-500 mt-1", children: "Tutte contro tutte. Nessun tabellone." })
                ] }),
                createArchiveMode !== "round_robin" && /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-xl p-3 space-y-2", children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-700", children: "Girone Finale (All'italiana)" }),
                  /* @__PURE__ */ jsxs28("label", { className: "flex items-center gap-2 text-xs font-black text-slate-700", children: [
                    /* @__PURE__ */ jsx28(
                      "input",
                      {
                        type: "checkbox",
                        checked: createArchiveFinalRrEnabled,
                        disabled: finalToggleDisabled,
                        onChange: (e) => setCreateArchiveFinalRrEnabled(e.target.checked)
                      }
                    ),
                    "Abilita girone finale (Top 4/8)"
                  ] }),
                  finalToggleDisabled && /* @__PURE__ */ jsx28("div", { className: "text-xs font-bold text-slate-500", children: "Richiede almeno 4 squadre (non arbitri). Top 8 richiede almeno 8 squadre." }),
                  !finalToggleDisabled && /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
                    /* @__PURE__ */ jsxs28("div", { children: [
                      /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Partecipanti (Top)" }),
                      /* @__PURE__ */ jsxs28(
                        "select",
                        {
                          value: String(createArchiveFinalRrTopTeams),
                          onChange: (e) => setCreateArchiveFinalRrTopTeams(Number(e.target.value) || 4),
                          disabled: !createArchiveFinalRrEnabled,
                          className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black",
                          children: [
                            /* @__PURE__ */ jsx28("option", { value: "4", children: "Top 4" }),
                            /* @__PURE__ */ jsx28("option", { value: "8", disabled: top8Disabled, children: "Top 8" })
                          ]
                        }
                      ),
                      createArchiveFinalRrEnabled && top8Disabled ? /* @__PURE__ */ jsx28("div", { className: "text-[11px] font-bold text-slate-500 mt-1", children: "Top 8 disponibile solo con almeno 8 squadre." }) : null
                    ] }),
                    /* @__PURE__ */ jsx28("div", { className: "flex items-end", children: /* @__PURE__ */ jsx28("div", { className: "text-[11px] font-bold text-slate-500", children: "Il girone finale viene creato/attivato quando i partecipanti sono determinabili dal tabellone (runtime)." }) })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "text-xs font-bold text-slate-500", children: [
                  "Squadre: ",
                  (createArchiveTeams || []).length,
                  " (utili: ",
                  wizardPlayableTeamsCount,
                  ") \xB7 Modalit\xE0: ",
                  createArchiveMode === "groups_elimination" ? "Gironi + Eliminazione" : createArchiveMode === "round_robin" ? "All'italiana" : "Eliminazione diretta",
                  createArchiveMode === "groups_elimination" ? ` \xB7 Gironi: ${createArchiveGroups} \xB7 Qualificate: ${createArchiveAdvancing}` : "",
                  createArchiveMode !== "round_robin" && createArchiveFinalRrEnabled ? ` \xB7 Girone Finale: Top ${createArchiveFinalRrTopTeams}` : ""
                ] }),
                /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsx28(
                    "button",
                    {
                      onClick: () => setCreateArchiveStep("teams"),
                      className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm",
                      children: "\u2190 Indietro"
                    }
                  ),
                  /* @__PURE__ */ jsxs28(
                    "button",
                    {
                      onClick: createArchivedTournament,
                      className: "px-3 py-2 rounded-xl font-black bg-emerald-600 text-white hover:bg-emerald-700 text-sm flex items-center gap-2",
                      children: [
                        /* @__PURE__ */ jsx28(CheckCircle25, { className: "w-4 h-4" }),
                        " Crea torneo"
                      ]
                    }
                  )
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-700", children: "Seleziona torneo archiviato" }),
            dataSelectedTournamentId ? /* @__PURE__ */ jsxs28(
              "button",
              {
                onClick: () => {
                  const tsel = (state.tournamentHistory || []).find((x) => x.id === dataSelectedTournamentId);
                  if (!tsel) return;
                  if (!confirm(`Eliminare definitivamente il torneo "${tsel.name}"? Questa azione \xE8 irreversibile.`)) return;
                  const nextHistory = (state.tournamentHistory || []).filter((tt) => tt.id !== tsel.id);
                  const nextHall = (state.hallOfFame || []).filter((e) => e.tournamentId !== tsel.id);
                  setState({ ...state, tournamentHistory: nextHistory, hallOfFame: nextHall });
                  setDataSelectedTournamentId("");
                  setDataSelectedMatchId("");
                  setEditStats({});
                  setEditStatsMatchId("");
                  alert("Torneo eliminato.");
                },
                className: "px-3 py-2 rounded-xl font-black border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs flex items-center gap-2",
                title: "Elimina torneo archiviato",
                children: [
                  /* @__PURE__ */ jsx28(Trash22, { className: "w-4 h-4" }),
                  " Elimina torneo"
                ]
              }
            ) : null
          ] }),
          /* @__PURE__ */ jsxs28(
            "select",
            {
              value: dataSelectedTournamentId,
              onChange: (e) => {
                const id = e.target.value;
                setDataSelectedTournamentId(id);
                setDataSelectedMatchId("");
                setDataWinnerTeamId("");
                setDataTopScorerPlayerId("");
                setDataDefenderPlayerId("");
                setDataMvpPlayerId("");
                setDataTopScorerU25PlayerId("");
                setDataDefenderU25PlayerId("");
              },
              className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold",
              children: [
                /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                (state.tournamentHistory || []).slice().sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).map((tn) => /* @__PURE__ */ jsx28("option", { value: tn.id, children: tn.name }, tn.id))
              ]
            }
          ),
          (() => {
            const tsel = (state.tournamentHistory || []).find((x) => x.id === dataSelectedTournamentId);
            if (!tsel) return null;
            const matches = (tsel.matches || []).slice().sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            return /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [
              /* @__PURE__ */ jsx28("div", { className: "bg-slate-50 px-4 py-2 font-black text-slate-700", children: "Match" }),
              /* @__PURE__ */ jsx28("div", { className: "max-h-[420px] overflow-auto divide-y divide-slate-100", children: matches.map((m) => {
                const label = m.code || m.id;
                const participantIds = getMatchParticipantIds(m);
                const names = participantIds.map((id) => {
                  if (!id) return "TBD";
                  if (id === "BYE") return "BYE";
                  return (tsel.teams || []).find((tt) => tt.id === id)?.name || id;
                });
                const vsLabel = names.join(" vs ");
                const scoreOf = (teamId) => getMatchScoreForTeam(m, teamId);
                const scoreLabel = formatMatchScoreLabel(m);
                const where = m.phase === "groups" ? m.groupName ? `Girone ${m.groupName}` : "Gironi" : m.roundName || (m.round ? `Round ${m.round}` : "Bracket");
                const isSel = dataSelectedMatchId === m.id;
                const badge = m.status === "finished" ? "bg-red-50 text-red-700 border-red-200" : m.status === "playing" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200";
                return /* @__PURE__ */ jsx28(
                  "button",
                  {
                    onClick: () => {
                      setDataSelectedMatchId(m.id);
                      const vals = participantIds.map((id) => scoreOf(id)).sort((a, b) => b - a);
                      const aInit = participantIds.length >= 3 ? vals[0] ?? 0 : m.scoreA ?? 0;
                      const bInit = participantIds.length >= 3 ? vals[1] ?? 0 : m.scoreB ?? 0;
                      setDataScoreA(String(aInit));
                      setDataScoreB(String(bInit));
                      setDataStatus(m.status || "scheduled");
                    },
                    className: `w-full text-left px-4 py-3 hover:bg-slate-50 transition ${isSel ? "bg-blue-50" : "bg-white"}`,
                    children: /* @__PURE__ */ jsxs28("div", { className: "flex items-center justify-between gap-3", children: [
                      /* @__PURE__ */ jsxs28("div", { className: "min-w-0", children: [
                        /* @__PURE__ */ jsxs28("div", { className: "font-black text-slate-900 flex items-center gap-2", children: [
                          /* @__PURE__ */ jsx28("span", { className: "font-mono text-xs text-slate-500", children: label }),
                          /* @__PURE__ */ jsx28("span", { className: "text-sm font-black", children: vsLabel })
                        ] }),
                        /* @__PURE__ */ jsx28("div", { className: "text-xs font-bold text-slate-500 mt-1", children: where })
                      ] }),
                      /* @__PURE__ */ jsxs28("div", { className: "flex items-center gap-2 shrink-0", children: [
                        /* @__PURE__ */ jsx28("span", { className: "font-mono font-black text-slate-700 text-xs", children: scoreLabel }),
                        /* @__PURE__ */ jsx28("span", { className: `text-[10px] px-2 py-1 rounded-full border font-black ${badge}`, children: m.status })
                      ] })
                    ] })
                  },
                  m.id
                );
              }) })
            ] });
          })()
        ] }),
        /* @__PURE__ */ jsx28("div", { className: "lg:col-span-2 space-y-4", children: (() => {
          const tsel = (state.tournamentHistory || []).find((x) => x.id === dataSelectedTournamentId);
          if (!tsel) {
            return /* @__PURE__ */ jsx28("div", { className: "text-slate-400 font-bold", children: "Seleziona un torneo per iniziare." });
          }
          const msel = (tsel.matches || []).find((mm) => mm.id === dataSelectedMatchId);
          const players = (tsel.teams || []).flatMap((tm) => [
            { id: getPlayerKey(tm.player1, tm.player1YoB ?? "ND"), name: tm.player1, yob: tm.player1YoB },
            { id: getPlayerKey(tm.player2, tm.player2YoB ?? "ND"), name: tm.player2, yob: tm.player2YoB }
          ]).filter((p) => !!p.name);
          const u25Players = players.filter((p) => isU25(p.yob));
          const getPlayerLabel = (pid) => {
            const pl = players.find((p) => p.id === pid);
            if (!pl) return "";
            const yy = pl.yob ? String(pl.yob).slice(-2) : "ND";
            return `${pl.name} (${yy})`;
          };
          const saveMatchEdit = () => {
            if (!msel) {
              alert(t("alert_select_match"));
              return;
            }
            const isBye = (id) => String(id || "").toUpperCase() === "BYE";
            const isTbd = (id) => !!id && String(id).toUpperCase().startsWith("TBD-");
            const participantIds = getMatchParticipantIds(msel).filter(Boolean);
            const participantTeams = participantIds.map((id) => id ? (tsel.teams || []).find((tt) => tt.id === id) : null).filter(Boolean);
            const stats = [];
            const push = (teamId, playerName) => {
              if (!teamId || !playerName) return;
              if (teamId === "BYE") return;
              const key = `${teamId}||${playerName}`;
              const f = editStats[key] || { canestri: "0", soffi: "0" };
              stats.push({
                teamId,
                playerName,
                canestri: Math.max(0, parseInt(f.canestri || "0", 10) || 0),
                soffi: Math.max(0, parseInt(f.soffi || "0", 10) || 0)
              });
            };
            participantTeams.forEach((team) => {
              push(team.id, team.player1);
              push(team.id, team.player2);
            });
            const playableIds = participantIds.filter((id) => !isBye(id));
            const playableScoresByTeam = {};
            for (const id of playableIds) {
              playableScoresByTeam[id] = computedScores.scoresByTeam?.[id] ?? 0;
            }
            const maxScore = Math.max(0, ...Object.values(playableScoresByTeam));
            if (dataStatus === "finished") {
              if (playableIds.some((id) => isTbd(id))) {
                alert("Impossibile salvare come FINITO: ci sono partecipanti TBD.");
                return;
              }
              const leaders = Object.keys(playableScoresByTeam).filter((id) => (playableScoresByTeam[id] ?? 0) === maxScore);
              if (leaders.length !== 1) {
                alert("Pareggio non ammesso: aggiungi canestri di spareggio finch\xE9 c'\xE8 un vincitore.");
                return;
              }
            }
            let nextMatches = (tsel.matches || []).map((mm) => {
              if (mm.id !== msel.id) return mm;
              const nextScoresByTeam = mm.teamIds && mm.teamIds.length ? mm.teamIds.reduce((acc, id) => ({ ...acc, [id]: computedScores.scoresByTeam?.[id] ?? 0 }), {}) : void 0;
              return {
                ...mm,
                // For tie-break matches we promote the effective target to the final max score.
                targetScore: mm.isTieBreak && dataStatus === "finished" ? maxScore : mm.targetScore,
                // Legacy 1v1 fields + some older components:
                // for multi-team we mirror the top-2 scores.
                scoreA: computedScores.scoreA ?? 0,
                scoreB: computedScores.scoreB ?? 0,
                scoresByTeam: nextScoresByTeam || mm.scoresByTeam,
                status: dataStatus,
                played: dataStatus !== "scheduled",
                stats: stats.length ? stats : mm.stats
              };
            });
            if (tsel.type === "groups_elimination") {
              nextMatches = syncBracketFromGroups(tsel, nextMatches);
            }
            nextMatches = ensureFinalTieBreakIfNeeded(tsel, nextMatches);
            nextMatches = autoFixBracketFromResults(nextMatches);
            const nextHistory = (state.tournamentHistory || []).map((tt) => tt.id === tsel.id ? { ...tt, matches: nextMatches } : tt);
            let nextHall = state.hallOfFame || [];
            if (dataRecomputeAwards) {
              const autoAwards = computeAwardsFromArchive(tsel, nextMatches);
              const mvpKeep = nextHall.filter((e) => e.tournamentId === tsel.id && e.type === "mvp");
              const others = nextHall.filter((e) => e.tournamentId !== tsel.id);
              nextHall = [...others, ...autoAwards, ...mvpKeep];
            }
            setState({ ...state, tournamentHistory: nextHistory, hallOfFame: nextHall });
            alert(t("alert_saved_propagation"));
          };
          const saveAwardsManual = () => {
            const year = new Date(tsel.startDate).getFullYear().toString();
            const cur = state.hallOfFame || [];
            const keep = cur.filter((e) => e.tournamentId !== tsel.id);
            const mkPlayerEntry = (type, playerId) => ({
              id: `${tsel.id}_${type}`,
              year,
              tournamentId: tsel.id,
              tournamentName: tsel.name,
              type,
              playerId,
              playerNames: [players.find((p) => p.id === playerId)?.name || ""]
            });
            const winnerTeam = (tsel.teams || []).find((tt) => tt.id === dataWinnerTeamId);
            const winnerEntry = dataWinnerTeamId ? {
              id: `${tsel.id}_winner`,
              year,
              tournamentId: tsel.id,
              tournamentName: tsel.name,
              type: "winner",
              teamName: winnerTeam?.name || dataWinnerTeamId,
              playerNames: winnerTeam ? [winnerTeam.player1, winnerTeam.player2].filter(Boolean) : []
            } : null;
            const entries = [];
            if (winnerEntry) entries.push(winnerEntry);
            if (dataTopScorerPlayerId) entries.push(mkPlayerEntry("top_scorer", dataTopScorerPlayerId));
            if (dataDefenderPlayerId) entries.push(mkPlayerEntry("defender", dataDefenderPlayerId));
            if (dataTopScorerU25PlayerId) entries.push(mkPlayerEntry("top_scorer_u25", dataTopScorerU25PlayerId));
            if (dataDefenderU25PlayerId) entries.push(mkPlayerEntry("defender_u25", dataDefenderU25PlayerId));
            if (dataMvpPlayerId) entries.push(mkPlayerEntry("mvp", dataMvpPlayerId));
            setState({ ...state, hallOfFame: [...keep, ...entries] });
            alert(t("alert_awards_updated"));
          };
          return /* @__PURE__ */ jsxs28("div", { className: "space-y-6", children: [
            /* @__PURE__ */ jsxs28("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3", children: [
              /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-800", children: "Editing risultato (retroattivo)" }),
              !msel && /* @__PURE__ */ jsx28("div", { className: "text-slate-400 font-bold", children: "Seleziona un match dalla colonna a sinistra." }),
              msel && /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3", children: [
                /* @__PURE__ */ jsxs28("div", { className: "md:col-span-2", children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Score" }),
                  /* @__PURE__ */ jsxs28("div", { className: "flex gap-2", children: [
                    /* @__PURE__ */ jsx28("input", { value: String(computedScores.scoreA), disabled: true, className: "w-24 border border-slate-200 rounded-lg px-3 py-2 font-black bg-slate-50 text-slate-700" }),
                    /* @__PURE__ */ jsx28("span", { className: "font-black self-center text-slate-500", children: "-" }),
                    /* @__PURE__ */ jsx28("input", { value: String(computedScores.scoreB), disabled: true, className: "w-24 border border-slate-200 rounded-lg px-3 py-2 font-black bg-slate-50 text-slate-700" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Stato" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataStatus, onChange: (e) => setDataStatus(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "scheduled", children: "scheduled" }),
                    /* @__PURE__ */ jsx28("option", { value: "playing", children: "playing" }),
                    /* @__PURE__ */ jsx28("option", { value: "finished", children: "finished" })
                  ] })
                ] }),
                /* @__PURE__ */ jsx28("div", { className: "flex items-end", children: /* @__PURE__ */ jsx28("button", { onClick: saveMatchEdit, className: "w-full bg-blue-700 text-white px-4 py-2 rounded-lg font-black hover:bg-blue-800", children: "Salva risultato" }) }),
                /* @__PURE__ */ jsxs28("div", { className: "md:col-span-4 flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx28("input", { type: "checkbox", checked: dataRecomputeAwards, onChange: (e) => setDataRecomputeAwards(e.target.checked) }),
                  /* @__PURE__ */ jsx28("span", { className: "text-xs font-black text-slate-700", children: "Ricalcola riconoscimenti automatici (Campioni/Capocannoniere/Difensore/U25). MVP resta manuale." })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs28("div", { className: "bg-white border border-slate-200 rounded-xl p-4 space-y-3", children: [
              /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-800", children: "Marcatori match (retroattivo)" }),
              !msel ? /* @__PURE__ */ jsx28("div", { className: "text-slate-400 font-bold", children: "Seleziona un match per modificare i marcatori." }) : /* @__PURE__ */ jsxs28(Fragment12, { children: [
                /* @__PURE__ */ jsx28("div", { className: "text-xs font-bold text-slate-500", children: "Modifica canestri e soffi per ciascun giocatore. Lo score del match si aggiorna automaticamente (somma canestri)." }),
                /* @__PURE__ */ jsx28("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: (() => {
                  const participantIds = getMatchParticipantIds(msel);
                  const teams = participantIds.map((id) => id ? (tsel.teams || []).find((tt) => tt.id === id) : null).filter(Boolean);
                  const rows = [];
                  const push = (team, playerName) => {
                    if (!team || !playerName) return;
                    rows.push({ teamId: team.id, teamName: team.name, playerName });
                  };
                  teams.forEach((team) => {
                    push(team, team.player1);
                    push(team, team.player2);
                  });
                  return rows.map((r) => {
                    const k = `${r.teamId}||${r.playerName}`;
                    const f = editStats[k] || { canestri: "0", soffi: "0" };
                    return /* @__PURE__ */ jsxs28("div", { className: "border border-slate-200 rounded-lg p-3", children: [
                      /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500", children: r.teamName }),
                      /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-900", children: r.playerName }),
                      /* @__PURE__ */ jsxs28("div", { className: "mt-2 grid grid-cols-2 gap-2", children: [
                        /* @__PURE__ */ jsxs28("div", { children: [
                          /* @__PURE__ */ jsx28("div", { className: "text-[10px] font-black text-slate-500 mb-1", children: "Canestri" }),
                          /* @__PURE__ */ jsx28(
                            "input",
                            {
                              value: f.canestri,
                              onChange: (e) => setEditStats((prev) => ({ ...prev, [k]: { ...prev[k], canestri: e.target.value.replace(/[^0-9]/g, "") } })),
                              className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black"
                            }
                          )
                        ] }),
                        /* @__PURE__ */ jsxs28("div", { children: [
                          /* @__PURE__ */ jsx28("div", { className: "text-[10px] font-black text-slate-500 mb-1", children: "Soffi" }),
                          /* @__PURE__ */ jsx28(
                            "input",
                            {
                              value: f.soffi,
                              onChange: (e) => setEditStats((prev) => ({ ...prev, [k]: { ...prev[k], soffi: e.target.value.replace(/[^0-9]/g, "") } })),
                              className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-black"
                            }
                          )
                        ] })
                      ] })
                    ] }, k);
                  });
                })() })
              ] })
            ] }),
            /* @__PURE__ */ jsxs28("div", { className: "bg-white border border-slate-200 rounded-xl p-4 space-y-3", children: [
              /* @__PURE__ */ jsx28("div", { className: "font-black text-slate-800", children: "Riconoscimenti (manuale)" }),
              /* @__PURE__ */ jsxs28("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: [
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Campioni (squadra)" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataWinnerTeamId, onChange: (e) => setDataWinnerTeamId(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                    (tsel.teams || []).map((tt) => /* @__PURE__ */ jsx28("option", { value: tt.id, children: tt.name }, tt.id))
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "MVP (\u2B50)" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataMvpPlayerId, onChange: (e) => setDataMvpPlayerId(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                    players.map((p) => /* @__PURE__ */ jsx28("option", { value: p.id, children: getPlayerLabel(p.id) }, p.id))
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Capocannoniere (\u{1F534})" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataTopScorerPlayerId, onChange: (e) => setDataTopScorerPlayerId(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                    players.map((p) => /* @__PURE__ */ jsx28("option", { value: p.id, children: getPlayerLabel(p.id) }, p.id))
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Difensore (\u{1F32C}\uFE0F)" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataDefenderPlayerId, onChange: (e) => setDataDefenderPlayerId(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                    players.map((p) => /* @__PURE__ */ jsx28("option", { value: p.id, children: getPlayerLabel(p.id) }, p.id))
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Capocannoniere U25" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataTopScorerU25PlayerId, onChange: (e) => setDataTopScorerU25PlayerId(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                    u25Players.map((p) => /* @__PURE__ */ jsx28("option", { value: p.id, children: getPlayerLabel(p.id) }, p.id))
                  ] })
                ] }),
                /* @__PURE__ */ jsxs28("div", { children: [
                  /* @__PURE__ */ jsx28("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Difensore U25" }),
                  /* @__PURE__ */ jsxs28("select", { value: dataDefenderU25PlayerId, onChange: (e) => setDataDefenderU25PlayerId(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                    /* @__PURE__ */ jsx28("option", { value: "", children: "\u2014" }),
                    u25Players.map((p) => /* @__PURE__ */ jsx28("option", { value: p.id, children: getPlayerLabel(p.id) }, p.id))
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx28("div", { children: /* @__PURE__ */ jsx28("button", { onClick: saveAwardsManual, className: "bg-slate-900 text-white px-4 py-2 rounded-lg font-black hover:bg-slate-800", children: "Salva riconoscimenti manuali" }) })
            ] })
          ] });
        })() })
      ] });
    };
  }
});

// components/admin/tabs/data/IntegrationsHof.tsx
import { Fragment as Fragment13, jsx as jsx29, jsxs as jsxs29 } from "react/jsx-runtime";
var IntegrationsHof;
var init_IntegrationsHof = __esm({
  "components/admin/tabs/data/IntegrationsHof.tsx"() {
    init_storageService();
    init_id();
    IntegrationsHof = ({
      state,
      setState,
      t,
      dataSubTab,
      setDataSubTab,
      integrationsSubTab,
      setIntegrationsSubTab,
      aliasesSearch,
      setAliasesSearch,
      aliasToolSelections,
      setAliasToolSelections,
      buildProfilesIndex,
      setAlias,
      removeAlias,
      dataSelectedTournamentId,
      setDataSelectedTournamentId,
      dataSelectedMatchId,
      setDataSelectedMatchId,
      dataScoreA,
      setDataScoreA,
      dataScoreB,
      setDataScoreB,
      dataStatus,
      setDataStatus,
      dataRecomputeAwards,
      setDataRecomputeAwards,
      dataWinnerTeamId,
      setDataWinnerTeamId,
      dataTopScorerPlayerId,
      setDataTopScorerPlayerId,
      dataDefenderPlayerId,
      setDataDefenderPlayerId,
      dataMvpPlayerId,
      setDataMvpPlayerId,
      dataTopScorerU25PlayerId,
      setDataTopScorerU25PlayerId,
      dataDefenderU25PlayerId,
      setDataDefenderU25PlayerId,
      hofEditId,
      setHofEditId,
      hofEditTournamentId,
      setHofEditTournamentId,
      hofYear,
      setHofYear,
      hofTournamentName,
      setHofTournamentName,
      hofType,
      setHofType,
      hofTeamName,
      setHofTeamName,
      hofWinnerP1,
      setHofWinnerP1,
      hofWinnerP2,
      setHofWinnerP2,
      hofPlayerName,
      setHofPlayerName,
      hofPlayerYoB,
      setHofPlayerYoB,
      hofValue,
      setHofValue,
      scorersImportWarnings,
      setScorersImportWarnings,
      setPendingScorersImport,
      setAliasModalOpen,
      setAliasModalTitle,
      setAliasModalConflicts,
      scorersFileRef,
      createArchiveOpen,
      createArchiveStep,
      setCreateArchiveStep,
      createArchiveName,
      setCreateArchiveName,
      createArchiveDate,
      setCreateArchiveDate,
      createArchiveMode,
      setCreateArchiveMode,
      createArchiveGroups,
      setCreateArchiveGroups,
      createArchiveAdvancing,
      setCreateArchiveAdvancing,
      createArchiveTeams,
      createArchiveFileRef,
      caTeamName,
      setCaTeamName,
      caP1,
      setCaP1,
      caY1,
      setCaY1,
      caP2,
      setCaP2,
      caY2,
      setCaY2,
      caP1IsRef,
      setCaP1IsRef,
      caP2IsRef,
      setCaP2IsRef,
      openCreateArchiveWizard,
      resetCreateArchiveWizard,
      copyLiveTeamsIntoWizard,
      importArchiveTeamsFile,
      addWizardTeam,
      createArchivedTournament
    }) => {
      return (() => {
        const isManual = (e) => String(e?.tournamentId || "").startsWith("manual_");
        const manualEntries = (state.hallOfFame || []).filter(isManual).slice().sort((a, b) => {
          const ay = parseInt(String(a.year || "0"), 10) || 0;
          const by = parseInt(String(b.year || "0"), 10) || 0;
          if (by !== ay) return by - ay;
          return String(a.tournamentName || "").localeCompare(String(b.tournamentName || ""), "it", { sensitivity: "base" });
        });
        const reset = () => {
          setHofEditId("");
          setHofEditTournamentId("");
          setHofYear((/* @__PURE__ */ new Date()).getFullYear().toString());
          setHofTournamentName("");
          setHofType("winner");
          setHofTeamName("");
          setHofWinnerP1("");
          setHofWinnerP2("");
          setHofPlayerName("");
          setHofPlayerYoB("");
          setHofValue("");
        };
        const typeLabel = (t2) => {
          if (t2 === "winner") return "Campioni";
          if (t2 === "mvp") return "MVP";
          if (t2 === "top_scorer") return "Capocannoniere";
          if (t2 === "defender") return "Difensore";
          if (t2 === "top_scorer_u25") return "Capocannoniere U25";
          if (t2 === "defender_u25") return "Difensore U25";
          return t2;
        };
        const startEdit = (e) => {
          setHofEditId(e.id);
          setHofEditTournamentId(e.tournamentId);
          setHofYear(String(e.year || ""));
          setHofTournamentName(String(e.tournamentName || ""));
          setHofType(e.type);
          setHofTeamName(String(e.teamName || ""));
          setHofWinnerP1(String((e.playerNames || [])[0] || ""));
          setHofWinnerP2(String((e.playerNames || [])[1] || ""));
          setHofPlayerName(String((e.playerNames || [])[0] || ""));
          setHofValue(e.value !== void 0 && e.value !== null ? String(e.value) : "");
          const pid = String(e.playerId || "");
          const m = pid.match(/_(\d{4}|ND)$/);
          setHofPlayerYoB(m && m[1] !== "ND" ? m[1] : "");
        };
        const saveManualEntry = () => {
          const yearClean = (hofYear || "").replace(/[^\d]/g, "").slice(0, 4);
          if (!yearClean || yearClean.length !== 4) {
            alert(t("alert_year_invalid"));
            return;
          }
          const tournamentName = (hofTournamentName || "").trim() || "Senza torneo in archivio";
          const isWinner = hofType === "winner";
          const isMetric = hofType === "top_scorer" || hofType === "defender" || hofType === "top_scorer_u25" || hofType === "defender_u25";
          if (isWinner) {
            if (!hofTeamName.trim()) {
              alert(t("alert_enter_champion_team"));
              return;
            }
          } else {
            if (!hofPlayerName.trim()) {
              alert(t("alert_enter_player_name"));
              return;
            }
          }
          const manualId = hofEditTournamentId || `manual_${uuid2()}`;
          const entryId = hofEditId || manualId;
          const yobNum = parseInt((hofPlayerYoB || "").replace(/[^\d]/g, ""), 10);
          const yob = Number.isFinite(yobNum) ? yobNum : "ND";
          const valNum = Number((hofValue || "").replace(/[^\d]/g, ""));
          const value = isMetric && Number.isFinite(valNum) && (hofValue || "").trim() !== "" ? Math.max(0, valNum) : void 0;
          const nextEntry = {
            id: entryId,
            year: yearClean,
            tournamentId: manualId,
            tournamentName,
            type: hofType,
            playerNames: []
          };
          if (isWinner) {
            nextEntry.teamName = hofTeamName.trim();
            nextEntry.playerNames = [hofWinnerP1, hofWinnerP2].map((s) => (s || "").trim()).filter(Boolean);
          } else {
            nextEntry.playerNames = [hofPlayerName.trim()];
            nextEntry.playerId = getPlayerKey(hofPlayerName.trim(), yob);
            if (value !== void 0) nextEntry.value = value;
          }
          const cur = state.hallOfFame || [];
          const keep = cur.filter((e) => e.id !== entryId);
          setState({ ...state, hallOfFame: [...keep, nextEntry] });
          alert(hofEditId ? "Record aggiornato." : "Record aggiunto.");
          reset();
        };
        const deleteManualEntry = (id) => {
          if (!confirm("Eliminare questo record dall'Albo d'Oro?")) return;
          const cur = state.hallOfFame || [];
          setState({ ...state, hallOfFame: cur.filter((e) => e.id !== id) });
        };
        const isWinnerType = hofType === "winner";
        const isMetricType = hofType === "top_scorer" || hofType === "defender" || hofType === "top_scorer_u25" || hofType === "defender_u25";
        const metricLabel = hofType === "defender" || hofType === "defender_u25" ? "Soffi" : "Punti";
        return /* @__PURE__ */ jsxs29(Fragment13, { children: [
          /* @__PURE__ */ jsxs29("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3", children: [
            /* @__PURE__ */ jsx29("div", { className: "font-black text-slate-800", children: "Albo d'Oro (manuale, senza torneo in archivio)" }),
            /* @__PURE__ */ jsxs29("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3", children: [
              /* @__PURE__ */ jsxs29("div", { children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Anno" }),
                /* @__PURE__ */ jsx29("input", { value: hofYear, onChange: (e) => setHofYear(e.target.value.replace(/[^\d]/g, "")), placeholder: "2024", className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold" })
              ] }),
              /* @__PURE__ */ jsxs29("div", { className: "md:col-span-2", children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Nome torneo (anche se non in archivio)" }),
                /* @__PURE__ */ jsx29("input", { value: hofTournamentName, onChange: (e) => setHofTournamentName(e.target.value), placeholder: "Es. Torneo di Natale", className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold" })
              ] }),
              /* @__PURE__ */ jsxs29("div", { children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Tipo" }),
                /* @__PURE__ */ jsxs29("select", { value: hofType, onChange: (e) => setHofType(e.target.value), className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold", children: [
                  /* @__PURE__ */ jsx29("option", { value: "winner", children: "Campioni" }),
                  /* @__PURE__ */ jsx29("option", { value: "top_scorer", children: "Capocannoniere" }),
                  /* @__PURE__ */ jsx29("option", { value: "defender", children: "Difensore" }),
                  /* @__PURE__ */ jsx29("option", { value: "mvp", children: "MVP" }),
                  /* @__PURE__ */ jsx29("option", { value: "top_scorer_u25", children: "Capocannoniere U25" }),
                  /* @__PURE__ */ jsx29("option", { value: "defender_u25", children: "Difensore U25" })
                ] })
              ] })
            ] }),
            isWinnerType ? /* @__PURE__ */ jsxs29("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: [
              /* @__PURE__ */ jsxs29("div", { className: "md:col-span-3", children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Squadra campione" }),
                /* @__PURE__ */ jsx29("input", { value: hofTeamName, onChange: (e) => setHofTeamName(e.target.value), placeholder: "Nome squadra", className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold" })
              ] }),
              /* @__PURE__ */ jsxs29("div", { children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Giocatore 1" }),
                /* @__PURE__ */ jsx29("input", { value: hofWinnerP1, onChange: (e) => setHofWinnerP1(e.target.value), placeholder: "Nome", className: "w-full border border-slate-200 rounded-lg px-3 py-2" })
              ] }),
              /* @__PURE__ */ jsxs29("div", { children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Giocatore 2" }),
                /* @__PURE__ */ jsx29("input", { value: hofWinnerP2, onChange: (e) => setHofWinnerP2(e.target.value), placeholder: "Nome", className: "w-full border border-slate-200 rounded-lg px-3 py-2" })
              ] }),
              /* @__PURE__ */ jsx29("div", { className: "md:col-span-3 text-[11px] font-bold text-slate-500", children: "Se non conosci i giocatori puoi lasciare vuoto: la squadra entra comunque nell'Albo d'Oro." })
            ] }) : /* @__PURE__ */ jsxs29("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3", children: [
              /* @__PURE__ */ jsxs29("div", { className: "md:col-span-2", children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Giocatore" }),
                /* @__PURE__ */ jsx29("input", { value: hofPlayerName, onChange: (e) => setHofPlayerName(e.target.value), placeholder: "Cognome Nome", className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold" })
              ] }),
              /* @__PURE__ */ jsxs29("div", { children: [
                /* @__PURE__ */ jsx29("div", { className: "text-xs font-black text-slate-500 mb-1", children: "Anno nascita (opz.)" }),
                /* @__PURE__ */ jsx29("input", { value: hofPlayerYoB, onChange: (e) => setHofPlayerYoB(e.target.value.replace(/[^\d]/g, "")), placeholder: "2002", className: "w-full border border-slate-200 rounded-lg px-3 py-2 font-bold" })
              ] }),
              /* @__PURE__ */ jsxs29("div", { children: [
                /* @__PURE__ */ jsxs29("div", { className: "text-xs font-black text-slate-500 mb-1", children: [
                  "Valore (",
                  metricLabel,
                  ")"
                ] }),
                /* @__PURE__ */ jsx29(
                  "input",
                  {
                    value: hofValue,
                    onChange: (e) => setHofValue(e.target.value.replace(/[^\d]/g, "")),
                    placeholder: isMetricType ? "Lascia vuoto = ND" : "\u2014",
                    disabled: !isMetricType,
                    className: `w-full border border-slate-200 rounded-lg px-3 py-2 font-bold ${!isMetricType ? "bg-slate-100 text-slate-400" : ""}`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs29("div", { className: "md:col-span-4 text-[11px] font-bold text-slate-500", children: [
                "PlayerKey: ",
                hofPlayerName.trim() ? getPlayerKey(hofPlayerName.trim(), (parseInt(hofPlayerYoB || "", 10) || void 0) ?? "ND") : "\u2014",
                isMetricType ? " \xB7 Se non hai dati marcatori, lascia vuoto: verr\xE0 salvato come ND." : ""
              ] })
            ] }),
            /* @__PURE__ */ jsxs29("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx29("button", { onClick: saveManualEntry, className: "bg-blue-700 text-white px-4 py-2 rounded-lg font-black hover:bg-blue-800", children: hofEditId ? "Aggiorna record" : "Aggiungi record" }),
              /* @__PURE__ */ jsx29("button", { onClick: reset, className: "bg-white border border-slate-200 px-4 py-2 rounded-lg font-black hover:bg-slate-50", children: "Reset" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs29("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden", children: [
            /* @__PURE__ */ jsxs29("div", { className: "bg-slate-50 px-4 py-2 font-black text-slate-700 flex items-center justify-between", children: [
              /* @__PURE__ */ jsx29("span", { children: "Record manuali" }),
              /* @__PURE__ */ jsx29("span", { className: "font-mono text-xs text-slate-500", children: manualEntries.length })
            ] }),
            /* @__PURE__ */ jsxs29("div", { className: "divide-y divide-slate-100", children: [
              manualEntries.map((e) => {
                const isMetric = e.type === "top_scorer" || e.type === "defender" || e.type === "top_scorer_u25" || e.type === "defender_u25";
                const metric = e.type === "defender" || e.type === "defender_u25" ? "Soffi" : "Punti";
                const valueText = isMetric ? e.value !== void 0 && e.value !== null ? String(e.value) : "ND" : "";
                return /* @__PURE__ */ jsxs29("div", { className: "px-4 py-3 flex items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsxs29("div", { className: "min-w-0", children: [
                    /* @__PURE__ */ jsxs29("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ jsx29("span", { className: "bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded", children: e.year }),
                      /* @__PURE__ */ jsx29("span", { className: "text-[11px] font-black text-slate-500 uppercase tracking-wider", children: typeLabel(e.type) }),
                      /* @__PURE__ */ jsx29("span", { className: "text-[11px] font-bold text-slate-400 truncate", children: e.tournamentName })
                    ] }),
                    /* @__PURE__ */ jsx29("div", { className: "font-black text-slate-900 mt-1 truncate", children: e.teamName ? e.teamName : (e.playerNames || []).join(", ") }),
                    e.teamName && (e.playerNames || []).length > 0 && /* @__PURE__ */ jsx29("div", { className: "text-[11px] font-bold text-slate-500 truncate", children: e.playerNames.join(" & ") }),
                    isMetric && /* @__PURE__ */ jsxs29("div", { className: "text-[11px] font-black text-slate-600 mt-1", children: [
                      metric,
                      ": ",
                      valueText
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs29("div", { className: "flex items-center gap-2 shrink-0", children: [
                    /* @__PURE__ */ jsx29("button", { onClick: () => startEdit(e), className: "px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs", children: "Modifica" }),
                    /* @__PURE__ */ jsx29("button", { onClick: () => deleteManualEntry(e.id), className: "px-3 py-2 rounded-lg font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs", children: "Elimina" })
                  ] })
                ] }, e.id);
              }),
              manualEntries.length === 0 && /* @__PURE__ */ jsx29("div", { className: "p-8 text-center text-slate-400 font-bold", children: "Nessun record manuale. Usa il form sopra per aggiungere Campioni/Capocannoniere/Difensore/MVP anche senza torneo in archivio." })
            ] })
          ] })
        ] });
      })();
    };
  }
});

// services/adminDownloadUtils.ts
var downloadBlob;
var init_adminDownloadUtils = __esm({
  "services/adminDownloadUtils.ts"() {
    downloadBlob = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };
  }
});

// components/admin/tabs/data/IntegrationsScorers.tsx
import { Upload as Upload4, Download as Download3, Trash2 as Trash23 } from "lucide-react";
import { jsx as jsx30, jsxs as jsxs30 } from "react/jsx-runtime";
var IntegrationsScorers;
var init_IntegrationsScorers = __esm({
  "components/admin/tabs/data/IntegrationsScorers.tsx"() {
    init_storageService();
    init_id();
    init_adminDownloadUtils();
    init_adminCsvUtils();
    init_lazyXlsx();
    init_appMode();
    IntegrationsScorers = (props) => {
      const {
        state,
        setState,
        t,
        scorersImportWarnings,
        setScorersImportWarnings,
        setPendingScorersImport,
        setAliasModalOpen,
        setAliasModalTitle,
        setAliasModalConflicts,
        scorersFileRef,
        buildProfilesIndex,
        removeAlias
      } = props;
      const normalizeName2 = (n) => (n || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizeCol = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const labelFromPlayerKey = (key) => {
        const { name, yob } = getPlayerKeyLabel(key);
        return `${name} (${yob})`;
      };
      const toInt2 = (v) => {
        const raw2 = String(v ?? "").trim();
        if (!raw2) return void 0;
        const n = parseInt(raw2.replace(/[^0-9]/g, ""), 10);
        return Number.isFinite(n) ? n : void 0;
      };
      const makeAliasConflict = (name, yob, index) => {
        const norm = normalizeName2(name);
        if (!norm) return null;
        const rawKey = getPlayerKey(name, yob ?? "ND");
        const resolved = resolvePlayerKey(state, rawKey);
        if (resolved !== rawKey) return null;
        const set = (index || buildProfilesIndex()).get(norm);
        if (!set || set.size === 0) return null;
        if (set.has(resolved)) return null;
        const candidates = Array.from(set).filter((k) => k !== resolved).map((k) => ({ key: String(k), label: labelFromPlayerKey(String(k)) }));
        if (candidates.length === 0) return null;
        return {
          id: uuid2(),
          sourceKey: rawKey,
          sourceName: name,
          sourceYoB: yob ? String(yob) : "ND",
          candidates,
          action: "separate"
        };
      };
      const parseScorersRows = (rows, fileName) => {
        const getField = (row, candidates) => {
          const cand = new Set(candidates.map(normalizeCol));
          for (const k of Object.keys(row)) {
            if (cand.has(normalizeCol(k))) return row[k];
          }
          return "";
        };
        const profilesIndex = buildProfilesIndex();
        const entries2 = [];
        const warnings = [];
        rows.forEach((r, idx) => {
          const name = String(getField(r, ["Nome", "Giocatore", "Player", "CognomeNome", "Cognome Nome", "Name"])).trim();
          if (!name) return;
          const yob = toInt2(getField(r, ["Anno", "AnnoNascita", "Year", "YoB", "Nascita", "BirthYear"]));
          const games = Math.max(0, toInt2(getField(r, ["Partite", "Gare", "Games", "Played"])) || 0);
          const points = Math.max(0, toInt2(getField(r, ["Canestri", "Punti", "Points", "PT"])) || 0);
          const soffi = Math.max(0, toInt2(getField(r, ["Soffi", "SF", "Blows"])) || 0);
          const norm = normalizeName2(name);
          const yobStr = yob ? String(yob) : "ND";
          const rawKey = getPlayerKey(name, yob ?? "ND");
          const resolved = resolvePlayerKey(state, rawKey);
          const existingKeys = profilesIndex.get(norm);
          if (existingKeys && existingKeys.size > 0 && resolved === rawKey && !existingKeys.has(resolved)) {
            const list = Array.from(existingKeys).map((k) => labelFromPlayerKey(String(k))).join(" | ");
            warnings.push(`${name} \xB7 esistenti: ${list} \xB7 import: ${yobStr} (riga ${idx + 2})`);
          }
          entries2.push({
            id: `sc_${uuid2()}`,
            name,
            yob,
            games,
            points,
            soffi,
            createdAt: Date.now(),
            source: fileName
          });
        });
        return { entries: entries2, warnings };
      };
      const importScorersFromFile = async (file) => {
        const name = (file.name || "").toLowerCase();
        const isCsv = name.endsWith(".csv") || (file.type || "").includes("csv");
        if (isCsv) {
          const text = await decodeCsvText(file);
          const sep = detectCsvSeparator(text);
          const matrix = parseCsvRows(text, sep);
          if (!matrix.length) return { entries: [], warnings: [] };
          const header = matrix[0] || [];
          const data = matrix.slice(1);
          const objects = data.map((row) => {
            const obj = {};
            header.forEach((h, i) => {
              obj[h || `COL_${i}`] = row[i] ?? "";
            });
            return obj;
          });
          return parseScorersRows(objects, file.name);
        }
        const XLSX = await getXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        return parseScorersRows(rows, file.name);
      };
      const entries = (state.integrationsScorers || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const aliases = Object.entries(state.playerAliases || {});
      const onPickFile = () => scorersFileRef.current?.click();
      const onFileChange = async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        try {
          const { entries: imported, warnings } = await importScorersFromFile(f);
          if (!imported.length) {
            alert(t("alert_no_valid_scorers_rows"));
            return;
          }
          const idxProfiles = buildProfilesIndex();
          const conflicts = [];
          imported.forEach((en) => {
            const c = makeAliasConflict(en.name, en.yob, idxProfiles);
            if (c) conflicts.push(c);
          });
          setScorersImportWarnings(warnings);
          if (conflicts.length > 0) {
            setAliasModalTitle("Possibili omonimi (YoB diverso) \u2014 Import Marcatori");
            setAliasModalConflicts(conflicts);
            setPendingScorersImport({ entries: imported, warnings });
            setAliasModalOpen(true);
            return;
          }
          setState({
            ...state,
            integrationsScorers: [...state.integrationsScorers || [], ...imported]
          });
        } catch (err) {
          console.error(err);
          alert(t("alert_scorers_import_error"));
        }
      };
      const deleteEntry = (id) => {
        setState({
          ...state,
          integrationsScorers: (state.integrationsScorers || []).filter((e) => e.id !== id)
        });
      };
      const clearAll = () => {
        if (!confirm("Svuotare tutte le integrazioni marcatori importate?")) return;
        setState({ ...state, integrationsScorers: [] });
        setScorersImportWarnings([]);
      };
      const exportCsv = async () => {
        const XLSX = await getXLSX();
        const rows = entries.map((e) => ({
          Nome: e.name,
          Anno: e.yob ?? "",
          Partite: e.games ?? 0,
          Canestri: e.points ?? 0,
          Soffi: e.soffi ?? 0
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { header: ["Nome", "Anno", "Partite", "Canestri", "Soffi"] });
        const csv = "\uFEFF" + XLSX.utils.sheet_to_csv(ws, { FS: ";" });
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `integrazioni_marcatori_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`);
      };
      const downloadTemplateXlsx = async () => {
        const XLSX = await getXLSX();
        const ws = XLSX.utils.aoa_to_sheet([
          ["Nome", "Anno", "Partite", "Canestri", "Soffi"],
          ["", "", "", "", ""]
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Marcatori");
        const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        downloadBlob(
          new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          "template_integrazioni_marcatori.xlsx"
        );
      };
      return /* @__PURE__ */ jsxs30("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsx30("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4", children: /* @__PURE__ */ jsxs30("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs30("div", { children: [
            /* @__PURE__ */ jsx30("div", { className: "font-black text-slate-900", children: "Marcatori (integrazioni)" }),
            /* @__PURE__ */ jsx30("div", { className: "text-xs text-slate-600 font-bold", children: "Importa statistiche extra nella classifica generale marcatori. Colonne attese: Nome, Anno, Partite, Canestri, Soffi." })
          ] }),
          /* @__PURE__ */ jsxs30("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs30(
              "button",
              {
                onClick: onPickFile,
                className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2",
                children: [
                  /* @__PURE__ */ jsx30(Upload4, { className: "w-4 h-4" }),
                  " Importa file"
                ]
              }
            ),
            isTesterMode && /* @__PURE__ */ jsxs30(
              "button",
              {
                onClick: downloadTemplateXlsx,
                className: "px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2",
                children: [
                  /* @__PURE__ */ jsx30(Download3, { className: "w-4 h-4" }),
                  " Template"
                ]
              }
            ),
            isTesterMode && /* @__PURE__ */ jsxs30(
              "button",
              {
                onClick: exportCsv,
                disabled: entries.length === 0,
                className: `px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 ${entries.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`,
                children: [
                  /* @__PURE__ */ jsx30(Download3, { className: "w-4 h-4" }),
                  " Esporta CSV"
                ]
              }
            ),
            /* @__PURE__ */ jsxs30(
              "button",
              {
                onClick: clearAll,
                className: "px-3 py-2 rounded-xl font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-2",
                children: [
                  /* @__PURE__ */ jsx30(Trash23, { className: "w-4 h-4" }),
                  " Svuota"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx30(
            "input",
            {
              ref: scorersFileRef,
              type: "file",
              className: "hidden",
              accept: ".xlsx,.xls,.csv",
              onChange: onFileChange
            }
          )
        ] }) }),
        aliases.length > 0 && /* @__PURE__ */ jsxs30("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden", children: [
          /* @__PURE__ */ jsxs30("div", { className: "bg-slate-50 px-4 py-2 font-black text-slate-700 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx30("span", { children: "Integrazioni giocatori (alias)" }),
            /* @__PURE__ */ jsx30("span", { className: "font-mono text-xs text-slate-500", children: aliases.length })
          ] }),
          /* @__PURE__ */ jsxs30("div", { className: "divide-y divide-slate-100", children: [
            aliases.slice(0, 50).map(([from, to]) => /* @__PURE__ */ jsxs30("div", { className: "px-4 py-3 flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsxs30("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsx30("div", { className: "text-xs font-bold text-slate-500", children: "Da" }),
                /* @__PURE__ */ jsx30("div", { className: "font-black text-slate-900 truncate", children: labelFromPlayerKey(from) }),
                /* @__PURE__ */ jsx30("div", { className: "text-xs font-bold text-slate-500 mt-2", children: "A" }),
                /* @__PURE__ */ jsx30("div", { className: "font-black text-slate-900 truncate", children: labelFromPlayerKey(to) })
              ] }),
              /* @__PURE__ */ jsx30("div", { className: "shrink-0", children: /* @__PURE__ */ jsx30(
                "button",
                {
                  onClick: () => removeAlias(from),
                  className: "px-3 py-2 rounded-lg font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs",
                  children: "Rimuovi"
                }
              ) })
            ] }, from)),
            aliases.length > 50 && /* @__PURE__ */ jsx30("div", { className: "px-4 py-3 text-xs font-bold text-slate-500", children: "Mostro solo i primi 50 alias (per evitare lista infinita)." })
          ] }),
          /* @__PURE__ */ jsx30("div", { className: "px-4 py-3 text-[11px] font-bold text-slate-500 bg-slate-50", children: "Gli alias uniscono i profili a livello logico (classifiche/icone). I dati originali restano invariati." })
        ] }),
        scorersImportWarnings.length > 0 && /* @__PURE__ */ jsxs30("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4", children: [
          /* @__PURE__ */ jsx30("div", { className: "font-black text-amber-900 mb-2", children: "Possibili omonimi (YoB diverso)" }),
          /* @__PURE__ */ jsx30("ul", { className: "list-disc pl-5 space-y-1 text-xs font-bold text-amber-900", children: scorersImportWarnings.slice(0, 10).map((w, i) => /* @__PURE__ */ jsx30("li", { children: w }, i)) }),
          scorersImportWarnings.length > 10 && /* @__PURE__ */ jsxs30("div", { className: "text-xs font-bold text-amber-800 mt-2", children: [
            "+",
            scorersImportWarnings.length - 10,
            " altri..."
          ] }),
          /* @__PURE__ */ jsx30("div", { className: "text-xs text-amber-800 font-bold mt-2", children: "Puoi gestire le integrazioni Nome+Anno scegliendo \u201CIntegra\u201D nella modale che compare durante l\u2019import, oppure dalla tab \u201CAlias\u201D." })
        ] }),
        /* @__PURE__ */ jsxs30("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden", children: [
          /* @__PURE__ */ jsxs30("div", { className: "bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between", children: [
            /* @__PURE__ */ jsx30("span", { children: "Record importati" }),
            /* @__PURE__ */ jsx30("span", { className: "text-xs font-mono font-bold text-white/70", children: entries.length })
          ] }),
          /* @__PURE__ */ jsx30("div", { className: "overflow-auto", children: /* @__PURE__ */ jsxs30("table", { className: "min-w-full text-sm", children: [
            /* @__PURE__ */ jsx30("thead", { className: "bg-slate-50 text-slate-700", children: /* @__PURE__ */ jsxs30("tr", { children: [
              /* @__PURE__ */ jsx30("th", { className: "text-left px-3 py-2 font-black", children: "Nome" }),
              /* @__PURE__ */ jsx30("th", { className: "text-left px-3 py-2 font-black", children: "Anno" }),
              /* @__PURE__ */ jsx30("th", { className: "text-right px-3 py-2 font-black", children: "Partite" }),
              /* @__PURE__ */ jsx30("th", { className: "text-right px-3 py-2 font-black", children: "Canestri" }),
              /* @__PURE__ */ jsx30("th", { className: "text-right px-3 py-2 font-black", children: "Soffi" }),
              /* @__PURE__ */ jsx30("th", { className: "text-left px-3 py-2 font-black", children: "Fonte" }),
              /* @__PURE__ */ jsx30("th", { className: "text-right px-3 py-2 font-black", children: "Azioni" })
            ] }) }),
            /* @__PURE__ */ jsxs30("tbody", { className: "divide-y divide-slate-100", children: [
              entries.map((e) => /* @__PURE__ */ jsxs30("tr", { className: "hover:bg-slate-50", children: [
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 font-bold", children: e.name }),
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 font-mono text-xs text-slate-600", children: e.yob ? e.yob : "ND" }),
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 text-right font-mono", children: e.games }),
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 text-right font-mono", children: e.points }),
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 text-right font-mono", children: e.soffi }),
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 text-xs text-slate-600 font-bold", children: e.source || "" }),
                /* @__PURE__ */ jsx30("td", { className: "px-3 py-2 text-right", children: /* @__PURE__ */ jsx30(
                  "button",
                  {
                    onClick: () => deleteEntry(e.id),
                    className: "px-3 py-2 rounded-lg font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs",
                    children: "Elimina"
                  }
                ) })
              ] }, e.id)),
              entries.length === 0 && /* @__PURE__ */ jsx30("tr", { children: /* @__PURE__ */ jsx30("td", { colSpan: 7, className: "p-6 text-center text-slate-400 font-bold", children: "Nessun record importato." }) })
            ] })
          ] }) })
        ] })
      ] });
    };
  }
});

// components/admin/tabs/data/IntegrationsAliases.tsx
import { Fragment as Fragment14, jsx as jsx31, jsxs as jsxs31 } from "react/jsx-runtime";
var IntegrationsAliases;
var init_IntegrationsAliases = __esm({
  "components/admin/tabs/data/IntegrationsAliases.tsx"() {
    init_storageService();
    IntegrationsAliases = ({
      state,
      setState,
      t,
      dataSubTab,
      setDataSubTab,
      integrationsSubTab,
      setIntegrationsSubTab,
      aliasesSearch,
      setAliasesSearch,
      aliasToolSelections,
      setAliasToolSelections,
      buildProfilesIndex,
      setAlias,
      removeAlias,
      dataSelectedTournamentId,
      setDataSelectedTournamentId,
      dataSelectedMatchId,
      setDataSelectedMatchId,
      dataScoreA,
      setDataScoreA,
      dataScoreB,
      setDataScoreB,
      dataStatus,
      setDataStatus,
      dataRecomputeAwards,
      setDataRecomputeAwards,
      dataWinnerTeamId,
      setDataWinnerTeamId,
      dataTopScorerPlayerId,
      setDataTopScorerPlayerId,
      dataDefenderPlayerId,
      setDataDefenderPlayerId,
      dataMvpPlayerId,
      setDataMvpPlayerId,
      dataTopScorerU25PlayerId,
      setDataTopScorerU25PlayerId,
      dataDefenderU25PlayerId,
      setDataDefenderU25PlayerId,
      hofEditId,
      setHofEditId,
      hofEditTournamentId,
      setHofEditTournamentId,
      hofYear,
      setHofYear,
      hofTournamentName,
      setHofTournamentName,
      hofType,
      setHofType,
      hofTeamName,
      setHofTeamName,
      hofWinnerP1,
      setHofWinnerP1,
      hofWinnerP2,
      setHofWinnerP2,
      hofPlayerName,
      setHofPlayerName,
      hofPlayerYoB,
      setHofPlayerYoB,
      hofValue,
      setHofValue,
      scorersImportWarnings,
      setScorersImportWarnings,
      setPendingScorersImport,
      setAliasModalOpen,
      setAliasModalTitle,
      setAliasModalConflicts,
      scorersFileRef,
      createArchiveOpen,
      createArchiveStep,
      setCreateArchiveStep,
      createArchiveName,
      setCreateArchiveName,
      createArchiveDate,
      setCreateArchiveDate,
      createArchiveMode,
      setCreateArchiveMode,
      createArchiveGroups,
      setCreateArchiveGroups,
      createArchiveAdvancing,
      setCreateArchiveAdvancing,
      createArchiveTeams,
      createArchiveFileRef,
      caTeamName,
      setCaTeamName,
      caP1,
      setCaP1,
      caY1,
      setCaY1,
      caP2,
      setCaP2,
      caY2,
      setCaY2,
      caP1IsRef,
      setCaP1IsRef,
      caP2IsRef,
      setCaP2IsRef,
      openCreateArchiveWizard,
      resetCreateArchiveWizard,
      copyLiveTeamsIntoWizard,
      importArchiveTeamsFile,
      addWizardTeam,
      createArchivedTournament
    }) => {
      return (() => {
        const normalizeName2 = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");
        const labelFromPlayerKey = (key) => {
          const { name, yob } = getPlayerKeyLabel(key);
          return " ()";
        };
        const aliases = Object.entries(state.playerAliases || {});
        const removeAlias2 = (sourceKey) => {
          if (!confirm("Rimuovere questo alias?")) return;
          const next = { ...state.playerAliases || {} };
          delete next[sourceKey];
          setState({ ...state, playerAliases: next });
        };
        const setAlias2 = (fromKey, toKey) => {
          const from = (fromKey || "").trim();
          const toRaw = (toKey || "").trim();
          if (!from || !toRaw) return;
          if (from === toRaw) {
            alert("Seleziona un profilo diverso come destinazione.");
            return;
          }
          const to = resolvePlayerKey(state, toRaw);
          const nextAliases = { ...state.playerAliases || {}, [from]: to };
          const resolvedTo = resolvePlayerKey({ playerAliases: nextAliases }, to);
          if (resolvedTo === from) {
            alert("Alias non valido: creerebbe un ciclo.");
            return;
          }
          setState({ ...state, playerAliases: nextAliases });
          setAliasToolSelections((prev) => {
            const n = { ...prev };
            delete n[from];
            return n;
          });
        };
        const collectConflicts = () => {
          const map = /* @__PURE__ */ new Map();
          const add = (name, yob, source) => {
            const norm = normalizeName2(name);
            if (!norm) return;
            const rawKey = getPlayerKey(name, yob ?? "ND");
            const resolvedKey = resolvePlayerKey(state, rawKey);
            const byName = map.get(norm) || /* @__PURE__ */ new Map();
            const row = byName.get(rawKey) || { key: rawKey, resolvedKey, sources: /* @__PURE__ */ new Set(), count: 0 };
            row.resolvedKey = resolvedKey;
            row.count += 1;
            if (source) row.sources.add(source);
            byName.set(rawKey, row);
            map.set(norm, byName);
          };
          const addTeam = (team, src) => {
            if (!team) return;
            if (team.player1) add(team.player1, team.player1YoB, src);
            if (team.player2) add(team.player2, team.player2YoB, src);
          };
          (state.teams || []).forEach((t2) => addTeam(t2, "Live: squadre"));
          (state.tournament?.teams || []).forEach((t2) => addTeam(t2, "Live: torneo"));
          (state.tournamentHistory || []).forEach((tour) => {
            (tour.teams || []).forEach((t2) => addTeam(t2, `Archivio: ${tour.name || tour.id}`));
          });
          (state.integrationsScorers || []).forEach((e) => add(e.name, e.yob, "Integrazioni: marcatori"));
          (state.hallOfFame || []).forEach((e) => {
            const pid = String(e.playerId || "").trim();
            if (!pid) return;
            const { name, yob } = getPlayerKeyLabel(pid);
            const yobNum = yob && yob !== "ND" ? parseInt(yob, 10) : void 0;
            add(name, yobNum, "Integrazioni: albo d'oro");
          });
          const groups2 = Array.from(map.entries()).map(([norm, byKey]) => {
            const profiles = Array.from(byKey.values()).map((r) => ({
              key: r.key,
              label: labelFromPlayerKey(r.key),
              resolvedKey: r.resolvedKey,
              sources: Array.from(r.sources),
              count: r.count
            }));
            if (profiles.length < 2) return null;
            const displayName = getPlayerKeyLabel(profiles[0].key).name;
            return { norm, displayName, profiles };
          }).filter(Boolean);
          groups2.sort((a, b) => a.displayName.localeCompare(b.displayName, "it", { sensitivity: "base" }));
          return groups2;
        };
        const groups = collectConflicts();
        const q = (aliasesSearch || "").trim().toLowerCase();
        const filteredGroups = !q ? groups : groups.filter((g) => g.displayName.toLowerCase().includes(q) || g.norm.includes(q));
        return /* @__PURE__ */ jsxs31("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsx31("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4", children: /* @__PURE__ */ jsxs31("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsxs31("div", { children: [
              /* @__PURE__ */ jsx31("div", { className: "font-black text-slate-900", children: "Alias (manutenzione globale)" }),
              /* @__PURE__ */ jsx31("div", { className: "text-xs text-slate-600 font-bold", children: "Qui vedi tutti i conflitti Nome+Anno (ND incluso) e puoi creare/rimuovere alias senza passare da Squadre o Marcatori." })
            ] }),
            /* @__PURE__ */ jsxs31("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx31(
                "input",
                {
                  value: aliasesSearch,
                  onChange: (e) => setAliasesSearch(e.target.value),
                  placeholder: "Cerca nome\u2026",
                  className: "border border-slate-200 rounded-lg px-3 py-2 font-bold"
                }
              ),
              /* @__PURE__ */ jsxs31("div", { className: "px-3 py-2 rounded-lg font-black border border-slate-200 bg-white text-xs", children: [
                "Conflitti: ",
                /* @__PURE__ */ jsx31("span", { className: "font-mono", children: filteredGroups.length })
              ] }),
              /* @__PURE__ */ jsxs31("div", { className: "px-3 py-2 rounded-lg font-black border border-slate-200 bg-white text-xs", children: [
                "Alias attivi: ",
                /* @__PURE__ */ jsx31("span", { className: "font-mono", children: aliases.length })
              ] })
            ] })
          ] }) }),
          aliases.length > 0 && /* @__PURE__ */ jsxs31("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden", children: [
            /* @__PURE__ */ jsxs31("div", { className: "bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between", children: [
              /* @__PURE__ */ jsx31("span", { children: "Alias attivi" }),
              /* @__PURE__ */ jsx31("span", { className: "text-xs font-mono font-bold text-white/70", children: aliases.length })
            ] }),
            /* @__PURE__ */ jsxs31("div", { className: "divide-y divide-slate-100", children: [
              aliases.slice(0, 100).map(([from, to]) => /* @__PURE__ */ jsxs31("div", { className: "px-4 py-3 flex items-center justify-between gap-3", children: [
                /* @__PURE__ */ jsxs31("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx31("div", { className: "text-xs font-bold text-slate-500", children: "Da" }),
                  /* @__PURE__ */ jsx31("div", { className: "font-black text-slate-900 truncate", children: labelFromPlayerKey(from) }),
                  /* @__PURE__ */ jsx31("div", { className: "text-xs font-bold text-slate-500 mt-2", children: "A" }),
                  /* @__PURE__ */ jsx31("div", { className: "font-black text-slate-900 truncate", children: labelFromPlayerKey(to) })
                ] }),
                /* @__PURE__ */ jsx31(
                  "button",
                  {
                    onClick: () => removeAlias2(from),
                    className: "px-3 py-2 rounded-lg font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs",
                    children: "Rimuovi"
                  }
                )
              ] }, from)),
              aliases.length > 100 && /* @__PURE__ */ jsx31("div", { className: "px-4 py-3 text-xs font-bold text-slate-500", children: "Mostro solo i primi 100 alias." })
            ] })
          ] }),
          /* @__PURE__ */ jsxs31("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden", children: [
            /* @__PURE__ */ jsxs31("div", { className: "bg-slate-50 px-4 py-2 font-black text-slate-700 flex items-center justify-between", children: [
              /* @__PURE__ */ jsx31("span", { children: "Conflitti Nome+Anno" }),
              /* @__PURE__ */ jsx31("span", { className: "font-mono text-xs text-slate-500", children: filteredGroups.length })
            ] }),
            /* @__PURE__ */ jsxs31("div", { className: "divide-y divide-slate-100", children: [
              filteredGroups.map((g) => /* @__PURE__ */ jsxs31("div", { className: "px-4 py-4", children: [
                /* @__PURE__ */ jsxs31("div", { className: "flex items-center justify-between gap-3", children: [
                  /* @__PURE__ */ jsx31("div", { className: "font-black text-slate-900", children: g.displayName }),
                  /* @__PURE__ */ jsxs31("div", { className: "text-xs font-mono font-bold text-slate-500", children: [
                    "Profili: ",
                    g.profiles.length
                  ] })
                ] }),
                /* @__PURE__ */ jsx31("div", { className: "mt-3 space-y-2", children: g.profiles.map((p) => {
                  const isAliased = !!(state.playerAliases || {})[p.key];
                  const target = (state.playerAliases || {})[p.key];
                  const resolved = resolvePlayerKey(state, p.key);
                  const targetLabel = target ? labelFromPlayerKey(target) : "";
                  const selection = aliasToolSelections[p.key] || "";
                  const options = g.profiles.filter((x) => x.key !== p.key).map((x) => ({ key: x.key, label: x.label }));
                  return /* @__PURE__ */ jsx31("div", { className: "border border-slate-200 rounded-xl p-3", children: /* @__PURE__ */ jsxs31("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
                    /* @__PURE__ */ jsxs31("div", { className: "min-w-0", children: [
                      /* @__PURE__ */ jsx31("div", { className: "font-black text-slate-900 truncate", children: p.label }),
                      /* @__PURE__ */ jsx31("div", { className: "text-[11px] font-mono text-slate-500 truncate", children: p.key }),
                      p.sources.length > 0 && /* @__PURE__ */ jsxs31("div", { className: "text-[11px] font-bold text-slate-500 mt-1", children: [
                        "Fonti: ",
                        p.sources.slice(0, 3).join(" \xB7 "),
                        p.sources.length > 3 ? " \xB7 \u2026" : ""
                      ] }),
                      /* @__PURE__ */ jsxs31("div", { className: "text-[11px] font-bold text-slate-500 mt-1", children: [
                        "Occorrenze: ",
                        /* @__PURE__ */ jsx31("span", { className: "font-mono", children: p.count }),
                        resolved !== p.key ? /* @__PURE__ */ jsxs31(Fragment14, { children: [
                          " \xB7 Risolto in: ",
                          /* @__PURE__ */ jsx31("span", { className: "font-mono", children: labelFromPlayerKey(resolved) })
                        ] }) : null
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx31("div", { className: "flex items-center gap-2", children: isAliased ? /* @__PURE__ */ jsxs31(Fragment14, { children: [
                      /* @__PURE__ */ jsx31("div", { className: "text-xs font-black text-slate-600", children: "Alias \u2192" }),
                      /* @__PURE__ */ jsx31("div", { className: "text-xs font-black text-slate-900 max-w-[220px] truncate", children: targetLabel }),
                      /* @__PURE__ */ jsx31(
                        "button",
                        {
                          onClick: () => removeAlias2(p.key),
                          className: "px-3 py-2 rounded-lg font-black border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs",
                          children: "Rimuovi"
                        }
                      )
                    ] }) : /* @__PURE__ */ jsxs31(Fragment14, { children: [
                      /* @__PURE__ */ jsxs31(
                        "select",
                        {
                          value: selection,
                          onChange: (e) => setAliasToolSelections((prev) => ({ ...prev, [p.key]: e.target.value })),
                          className: "border border-slate-200 rounded-lg px-3 py-2 font-bold text-sm",
                          children: [
                            /* @__PURE__ */ jsx31("option", { value: "", children: "Integra in\u2026" }),
                            options.map((o) => /* @__PURE__ */ jsx31("option", { value: o.key, children: o.label }, o.key))
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsx31(
                        "button",
                        {
                          disabled: !selection,
                          onClick: () => setAlias2(p.key, selection),
                          className: `px-3 py-2 rounded-lg font-black text-xs ${!selection ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-blue-700 text-white hover:bg-blue-800"}`,
                          children: "Integra"
                        }
                      )
                    ] }) })
                  ] }) }, p.key);
                }) })
              ] }, g.norm)),
              filteredGroups.length === 0 && /* @__PURE__ */ jsx31("div", { className: "p-8 text-center text-slate-400 font-bold", children: "Nessun conflitto Nome+Anno trovato." })
            ] }),
            /* @__PURE__ */ jsx31("div", { className: "px-4 py-3 text-[11px] font-bold text-slate-500 bg-slate-50", children: "Gli alias uniscono i profili a livello logico (classifiche/icone). I dati originali restano invariati." })
          ] })
        ] });
      })();
    };
  }
});

// components/admin/tabs/data/DbMigrationWizard.tsx
import React22 from "react";
import { jsx as jsx32, jsxs as jsxs32 } from "react/jsx-runtime";
var DbMigrationWizard;
var init_DbMigrationWizard = __esm({
  "components/admin/tabs/data/DbMigrationWizard.tsx"() {
    init_supabaseRest();
    init_dbDiagnostics();
    init_featureFlags();
    DbMigrationWizard = ({ state, forceOverwrite }) => {
      const [wiz, setWiz] = React22.useState({ kind: "idle" });
      const [enableDbFirst, setEnableDbFirst] = React22.useState(true);
      const [log, setLog] = React22.useState([]);
      const pushLog = (level, msg) => {
        setLog((cur) => [...cur, { at: (/* @__PURE__ */ new Date()).toISOString(), level, msg }].slice(-120));
      };
      const run = async () => {
        if (wiz.kind === "running") return;
        setLog([]);
        setWiz({ kind: "running" });
        let backupSnapshot = null;
        let backupStructured = null;
        try {
          pushLog("info", "Preflight: test connessione Supabase\u2026");
          const test = await testSupabaseConnection();
          if (!test.ok) throw new Error(test.message || "Test connessione fallito");
          pushLog("ok", test.message || "Connessione OK");
          pushLog("info", "Preflight: health checks DB\u2026");
          const health = await runDbHealthChecks();
          if (!health.ok) {
            const hasBlocking = (health.checks || []).some((c) => !c.ok && String(c.severity || "").toLowerCase() === "error");
            if (hasBlocking) throw new Error("Health check DB: errori bloccanti. Risolvi prima di migrare.");
            pushLog("warn", "Health check: warning presenti (non bloccanti).");
          } else {
            pushLog("ok", "Health check: OK");
          }
          pushLog("info", "Backup remoto: pull snapshot (workspace_state)\u2026");
          const remoteRow = await pullWorkspaceState();
          if (remoteRow?.state) {
            backupSnapshot = remoteRow.state;
            pushLog("ok", `Backup snapshot remoto acquisito (${remoteRow.updated_at || "no updated_at"}).`);
          } else {
            pushLog("info", "Nessuno snapshot remoto esistente: rollback snapshot non disponibile.");
          }
          pushLog("info", "Backup remoto: pull strutturato (best-effort)\u2026");
          try {
            const r = await pullNormalizedState();
            if (r?.state) {
              backupStructured = r.state;
              pushLog("ok", `Backup strutturato acquisito (tournaments: ${r.summary?.tournaments ?? "?"}).`);
            }
          } catch {
            pushLog("warn", "Backup strutturato non disponibile (ignoro).");
          }
          pushLog("info", "Migrazione: export strutturato + snapshot\u2026");
          await pushNormalizedFromState(state, { force: forceOverwrite });
          markDbSyncOk("structured");
          pushLog("ok", "Migrazione completata (structured + snapshot + public mirrors).");
          pushLog("info", "Post-check: health checks DB\u2026");
          const health2 = await runDbHealthChecks();
          if (!health2.ok) {
            pushLog("warn", "Post-check: warning/error presenti. Controlla DB Sync Panel.");
          } else {
            pushLog("ok", "Post-check: OK");
          }
          if (enableDbFirst) {
            try {
              localStorage.setItem(REMOTE_REPO_LS_KEY, "1");
              localStorage.setItem("flbp_public_db_read", "1");
              pushLog("ok", "DB-first abilitato (flbp_remote_repo=1) + public read ON.");
            } catch {
              pushLog("warn", "Impossibile salvare flag DB-first in localStorage (best-effort).");
            }
          }
          setWiz({ kind: "done" });
        } catch (e) {
          const msg = e?.message || String(e);
          markDbSyncError(msg);
          pushLog("error", msg);
          if (backupSnapshot || backupStructured) {
            pushLog("warn", "Rollback best-effort: ripristino dati remoti precedenti\u2026");
            try {
              const restore = backupStructured || backupSnapshot;
              if (restore) {
                await pushNormalizedFromState(restore, { force: true });
                pushLog("ok", "Rollback completato (best-effort).");
              }
            } catch (re) {
              pushLog("error", `Rollback fallito: ${re?.message || String(re)}`);
            }
          }
          setWiz({ kind: "error", message: msg });
        }
      };
      return /* @__PURE__ */ jsxs32("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
        /* @__PURE__ */ jsxs32("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs32("div", { children: [
            /* @__PURE__ */ jsx32("div", { className: "text-xs font-black", children: "Wizard migrazione Locale \u2192 DB" }),
            /* @__PURE__ */ jsx32("div", { className: "text-xs text-slate-600 mt-1", children: "Esegue: test + health check \u2192 backup remoto \u2192 export strutturato + snapshot \u2192 post-check. Rollback best-effort se esisteva un remoto precedente." })
          ] }),
          /* @__PURE__ */ jsx32("div", { className: "text-xs", children: wiz.kind === "running" ? /* @__PURE__ */ jsx32("span", { className: "px-2 py-1 rounded-lg font-black bg-blue-100 text-blue-900 border border-blue-200", children: "In corso\u2026" }) : wiz.kind === "done" ? /* @__PURE__ */ jsx32("span", { className: "px-2 py-1 rounded-lg font-black bg-emerald-100 text-emerald-900 border border-emerald-200", children: "Completato" }) : wiz.kind === "error" ? /* @__PURE__ */ jsx32("span", { className: "px-2 py-1 rounded-lg font-black bg-red-100 text-red-900 border border-red-200", children: "Errore" }) : /* @__PURE__ */ jsx32("span", { className: "px-2 py-1 rounded-lg font-black bg-slate-100 text-slate-700 border border-slate-200", children: "Pronto" }) })
        ] }),
        /* @__PURE__ */ jsxs32("div", { className: "flex items-center justify-between gap-3 flex-wrap mt-3", children: [
          /* @__PURE__ */ jsxs32("label", { className: "flex items-center gap-2 text-xs text-slate-700", children: [
            /* @__PURE__ */ jsx32(
              "input",
              {
                type: "checkbox",
                checked: enableDbFirst,
                onChange: (e) => setEnableDbFirst(e.target.checked),
                className: "accent-slate-900"
              }
            ),
            "Dopo migrazione abilita DB come sorgente primaria (DB-first)"
          ] }),
          /* @__PURE__ */ jsx32(
            "button",
            {
              disabled: wiz.kind === "running",
              onClick: run,
              className: `px-3 py-2 rounded-xl font-black border text-xs ${wiz.kind === "running" ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"}`,
              children: "Avvia migrazione"
            }
          )
        ] }),
        log.length ? /* @__PURE__ */ jsxs32("div", { className: "mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-64 overflow-auto", children: [
          /* @__PURE__ */ jsx32("div", { className: "text-[11px] font-black text-slate-600 mb-2", children: "Log" }),
          /* @__PURE__ */ jsx32("div", { className: "space-y-1", children: log.map((l, idx) => /* @__PURE__ */ jsxs32("div", { className: "text-[11px] font-mono text-slate-700 flex gap-2", children: [
            /* @__PURE__ */ jsx32("span", { className: "text-slate-400", children: l.at.slice(11, 19) }),
            /* @__PURE__ */ jsx32("span", { className: l.level === "error" ? "text-red-700 font-black" : l.level === "warn" ? "text-amber-700 font-black" : l.level === "ok" ? "text-emerald-700 font-black" : "text-slate-700", children: l.level.toUpperCase() }),
            /* @__PURE__ */ jsx32("span", { className: "break-words", children: l.msg })
          ] }, idx)) })
        ] }) : null,
        wiz.kind === "error" ? /* @__PURE__ */ jsx32("div", { className: "mt-3 text-xs text-red-700 font-bold", children: "Migrazione fallita. Controlla il log sopra e/o usa gli strumenti manuali nel DB Sync Panel." }) : null
      ] });
    };
  }
});

// components/admin/tabs/data/DbSyncPanel.tsx
import React23 from "react";
import { jsx as jsx33, jsxs as jsxs33 } from "react/jsx-runtime";
var DbSyncPanel;
var init_DbSyncPanel = __esm({
  "components/admin/tabs/data/DbSyncPanel.tsx"() {
    init_supabaseRest();
    init_dbDiagnostics();
    init_featureFlags();
    init_autoDbSync();
    init_DbMigrationWizard();
    DbSyncPanel = ({ state, setState }) => {
      const cfg = getSupabaseConfig();
      const [panel, setPanel] = React23.useState({ kind: "idle" });
      const [downloaded, setDownloaded] = React23.useState(null);
      const [downloadedStructured, setDownloadedStructured] = React23.useState(null);
      const [token, setToken] = React23.useState(getSupabaseAccessToken() || "");
      const [authEmail, setAuthEmail] = React23.useState(getSupabaseSession()?.email || "");
      const [authPassword, setAuthPassword] = React23.useState("");
      const [forceOverwrite, setForceOverwrite] = React23.useState(false);
      const [autoStructured, setAutoStructured] = React23.useState(isAutoStructuredSyncEnabled());
      const [diagTick, setDiagTick] = React23.useState(0);
      const [health, setHealth] = React23.useState(null);
      const session = React23.useMemo(() => getSupabaseSession(), [token, diagTick]);
      const remoteBaseUpdatedAt = React23.useMemo(() => getRemoteBaseUpdatedAt(), [diagTick, token]);
      const diag = React23.useMemo(() => {
        void diagTick;
        return readDbSyncDiagnostics();
      }, [diagTick]);
      React23.useEffect(() => {
        const t = window.setInterval(() => setDiagTick((v) => v + 1), 2e3);
        return () => window.clearInterval(t);
      }, []);
      const toggleAutoStructured = () => {
        const next = !autoStructured;
        setAutoStructured(next);
        try {
          if (next) localStorage.setItem(AUTO_STRUCTURED_SYNC_LS_KEY, "1");
          else localStorage.removeItem(AUTO_STRUCTURED_SYNC_LS_KEY);
        } catch {
        }
        setPanel({ kind: "ok", message: next ? "Auto-sync strutturato attivato (best-effort)." : "Auto-sync strutturato disattivato." });
      };
      const hasToken = !!token.trim();
      React23.useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const s = await ensureFreshSupabaseSession();
            if (!alive) return;
            if (s?.accessToken) {
              setToken(s.accessToken);
              if (s.email) setAuthEmail(s.email);
            }
          } catch {
          }
        })();
        return () => {
          alive = false;
        };
      }, []);
      const saveToken = () => {
        try {
          const t = token.trim();
          if (!t) {
            localStorage.removeItem(SUPABASE_ACCESS_TOKEN_LS_KEY);
          } else {
            localStorage.setItem(SUPABASE_ACCESS_TOKEN_LS_KEY, t);
          }
          setPanel({ kind: "ok", message: t ? "Token salvato. Le richieste Supabase useranno il JWT." : "Token rimosso." });
        } catch {
          setPanel({ kind: "error", message: "Impossibile salvare il token in localStorage." });
        }
      };
      const clearToken = () => {
        setToken("");
        try {
          localStorage.removeItem(SUPABASE_ACCESS_TOKEN_LS_KEY);
          clearSupabaseSession();
        } catch {
        }
      };
      const isBusy = panel.kind === "working";
      const run = async (action, fn) => {
        setPanel({ kind: "working", action });
        try {
          await fn();
        } catch (e) {
          const msg = e?.message || String(e);
          if (e?.code === "FLBP_DB_CONFLICT") {
            markDbSyncConflict(msg, { remoteUpdatedAt: e.remoteUpdatedAt, remoteBaseUpdatedAt: e.remoteBaseUpdatedAt });
          } else {
            markDbSyncError(msg);
          }
          setPanel({ kind: "error", message: msg });
        }
      };
      const onAuthLogin = () => run("Login admin", async () => {
        if (!cfg) throw new Error("Supabase non configurato");
        const s = await signInWithPassword(authEmail, authPassword);
        setToken(s.accessToken);
        setAuthPassword("");
        setPanel({ kind: "ok", message: `Login OK${s.email ? `: ${s.email}` : ""}.` });
      });
      const onAuthLogout = () => run("Logout admin", async () => {
        await signOutSupabase();
        setToken("");
        setPanel({ kind: "ok", message: "Logout eseguito. Token rimosso." });
      });
      const onTest = () => run("Test connessione", async () => {
        const r = await testSupabaseConnection();
        setPanel(r.ok ? { kind: "ok", message: r.message } : { kind: "error", message: r.message });
      });
      const onHealthCheck = () => run("Verifica DB", async () => {
        const r = await runDbHealthChecks();
        setHealth(r);
        markDbHealth(!!r.ok, { checks: r.checks?.length ?? 0 });
        setDiagTick((x) => x + 1);
        if (r.ok) {
          setPanel({ kind: "ok", message: "Verifica DB completata: nessun errore bloccante." });
        } else {
          setPanel({ kind: "error", message: "Verifica DB completata: trovati errori o warning. Vedi elenco controlli." });
        }
      });
      const onUpload = () => run("Caricamento stato", async () => {
        await pushWorkspaceState(state, { force: forceOverwrite });
        markDbSyncOk("snapshot");
        setDiagTick((x) => x + 1);
        setPanel({ kind: "ok", message: "Stato locale caricato su DB (workspace_state) + snapshot pubblico sanificato (public_workspace_state)." });
      });
      const onDownload = () => run("Download stato", async () => {
        const row = await pullWorkspaceState();
        if (!row) {
          setDownloaded(null);
          setPanel({ kind: "error", message: "Nessuno stato trovato su DB per questo workspace." });
          return;
        }
        setDownloaded({ updatedAt: row.updated_at, state: row.state });
        markRemoteVersions({ remoteUpdatedAt: row.updated_at || null, remoteBaseUpdatedAt: getRemoteBaseUpdatedAt() });
        setDiagTick((x) => x + 1);
        setPanel({ kind: "ok", message: "Stato scaricato da DB. Puoi applicarlo manualmente." });
      });
      const onDownloadStructured = () => run("Download strutturato (recovery)", async () => {
        const r = await pullNormalizedState();
        setDownloadedStructured({ updatedAt: r.remoteUpdatedAt ?? null, state: r.state, summary: r.summary });
        markRemoteVersions({ remoteUpdatedAt: r.remoteUpdatedAt || null, remoteBaseUpdatedAt: getRemoteBaseUpdatedAt() });
        setDiagTick((x) => x + 1);
        setPanel({
          kind: "ok",
          message: `Dati strutturati scaricati. Tornei: ${r.summary.tournaments}, Team: ${r.summary.teams}, Match: ${r.summary.matches}, Stats: ${r.summary.matchStats}. Puoi applicarli (recovery).`
        });
      });
      const onApply = () => {
        if (!downloaded?.state) return;
        const ok = window.confirm("Applicare lo stato scaricato dal DB? Questa azione sovrascrive lo stato locale (fallback: puoi sempre reimportare un backup JSON).");
        if (!ok) return;
        setState(downloaded.state);
        setRemoteBaseUpdatedAt(downloaded.updatedAt || null);
        markRemoteVersions({ remoteUpdatedAt: downloaded.updatedAt || null, remoteBaseUpdatedAt: downloaded.updatedAt || null });
        setDiagTick((x) => x + 1);
        setPanel({ kind: "ok", message: "Stato DB applicato localmente." });
      };
      const onApplyStructured = () => {
        if (!downloadedStructured?.state) return;
        const ok = window.confirm(
          'Applicare i dati STRUTTURATI scaricati dal DB (recovery)?\n\n- Aggiorna: Torneo live, archivio tornei, HoF, marcatori integrazioni, aliases, logo.\n- NON include la lista "Squadre" pre-struttura (state.teams): quella verr\xE0 mantenuta come nel locale attuale.\n\nProcedere?'
        );
        if (!ok) return;
        const merged = {
          ...state,
          ...downloadedStructured.state,
          // Preserve draft roster (pre-structure) to avoid data loss.
          teams: state.teams,
          matches: state.matches
        };
        setState(merged);
        setRemoteBaseUpdatedAt(downloadedStructured.updatedAt || null);
        markRemoteVersions({ remoteUpdatedAt: downloadedStructured.updatedAt || null, remoteBaseUpdatedAt: downloadedStructured.updatedAt || null });
        setDiagTick((x) => x + 1);
        setPanel({ kind: "ok", message: "Dati strutturati applicati localmente (recovery)." });
      };
      const onExportNormalized = () => run("Export strutturato", async () => {
        const ok = window.confirm(
          "Esportare i dati STRUCTURATI su DB (tabelle tournaments/* ecc.)?\n\n- Sovrascrive i dati normalizzati del workspace (tournaments, matches, stats, hall_of_fame, aliases, scorers).\n- Non cambia nulla localmente e non tocca la UI.\n\nConsiglio: assicurati di aver gi\xE0 fatto un backup JSON e/o caricato lo snapshot."
        );
        if (!ok) return;
        const summary = await pushNormalizedFromState(state, { force: forceOverwrite });
        markDbSyncOk("structured", summary);
        setDiagTick((x) => x + 1);
        setPanel({
          kind: "ok",
          message: `Export strutturato completato. Tornei: ${summary.tournaments}, Team: ${summary.teams}, Match: ${summary.matches}, Stats: ${summary.matchStats}. HoF: ${summary.hallOfFame}, Aliases: ${summary.aliases}, Marcatori: ${summary.integrationsScorers}. Leaderboard pubblica: ${summary.publicCareerPlayers}.`
        });
      });
      const onSeedSimPool = () => run("Seed pool simulazioni", async () => {
        const ok = window.confirm(
          "Seed DB pool simulazioni (200 nomi team + 400 giocatori)?\n\n- Sovrascrive sim_pool_team_names e sim_pool_people per questo workspace.\n- Non cambia nulla localmente e non tocca la UI.\n\nPuoi rifarlo quando vuoi."
        );
        if (!ok) return;
        const summary = await seedSimPool();
        setDiagTick((x) => x + 1);
        setPanel({ kind: "ok", message: `Seed pool completato. Team names: ${summary.teamNames}, Giocatori: ${summary.people}.` });
      });
      const onToggleAutoStructured = () => {
        const next = !autoStructured;
        setAutoStructured(next);
        try {
          if (next) localStorage.setItem(AUTO_STRUCTURED_SYNC_LS_KEY, "1");
          else localStorage.removeItem(AUTO_STRUCTURED_SYNC_LS_KEY);
        } catch {
        }
        setPanel({
          kind: "ok",
          message: next ? "Auto-sync strutturato attivato (best-effort, debounced). Ogni modifica allo stato tenter\xE0 di aggiornare DB normalizzato + tabelle public." : "Auto-sync strutturato disattivato."
        });
      };
      const onSyncNowStructured = () => run("Sync strutturato (auto)", async () => {
        await flushAutoStructuredSync(state);
        setDiagTick((x) => x + 1);
        setPanel({ kind: "ok", message: 'Sync strutturato richiesto (best-effort). Controlla "Ultimo sync" qui sotto.' });
      });
      const statusBadge = () => {
        if (!cfg) return /* @__PURE__ */ jsx33("span", { className: "px-2 py-1 rounded-lg text-xs font-black bg-amber-100 text-amber-900 border border-amber-200", children: "Non configurato" });
        return /* @__PURE__ */ jsx33("span", { className: "px-2 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-200", children: "Configurato" });
      };
      return /* @__PURE__ */ jsxs33("div", { className: "bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4", children: [
        /* @__PURE__ */ jsxs33("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs33("div", { children: [
            /* @__PURE__ */ jsx33("div", { className: "text-sm font-black", children: "Backup & Sync DB (beta)" }),
            /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-600 mt-1", children: [
              "Snapshot completo via ",
              /* @__PURE__ */ jsx33("span", { className: "font-mono", children: "workspace_state" }),
              " + snapshot pubblico ",
              /* @__PURE__ */ jsx33("span", { className: "font-mono", children: "public_workspace_state" }),
              " (senza YoB).",
              /* @__PURE__ */ jsx33("span", { className: "font-black", children: " Nessuna rete finch\xE9 non premi i bottoni." })
            ] })
          ] }),
          /* @__PURE__ */ jsxs33("div", { className: "flex items-center gap-2", children: [
            statusBadge(),
            cfg ? /* @__PURE__ */ jsxs33("span", { className: "text-xs text-slate-600", children: [
              "workspace: ",
              /* @__PURE__ */ jsx33("span", { className: "font-mono", children: cfg.workspaceId })
            ] }) : null
          ] })
        ] }),
        /* @__PURE__ */ jsxs33("div", { className: "bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900", children: [
          /* @__PURE__ */ jsx33("div", { className: "font-black", children: "Consiglio sicurezza" }),
          /* @__PURE__ */ jsx33("div", { className: "mt-1 font-bold", children: "Prima di usare \u201CForza sovrascrittura\u201D o \u201CApplica allo stato locale\u201D, assicurati di avere un backup JSON recente." })
        ] }),
        /* @__PURE__ */ jsxs33("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs33("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxs33("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
              /* @__PURE__ */ jsxs33("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsxs33("div", { children: [
                  /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Accesso / JWT admin (opzionale)" }),
                  /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-600 mt-1", children: [
                    "Se hai abilitato RLS in Supabase, le operazioni di scrittura/lettura richiedono un JWT autenticato.",
                    /* @__PURE__ */ jsx33("span", { className: "font-black", children: " Non usare mai la Service Role Key nel client." })
                  ] })
                ] }),
                /* @__PURE__ */ jsx33("div", { className: "text-xs", children: hasToken ? /* @__PURE__ */ jsx33("span", { className: "px-2 py-1 rounded-lg font-black bg-emerald-100 text-emerald-900 border border-emerald-200", children: "Token impostato" }) : /* @__PURE__ */ jsx33("span", { className: "px-2 py-1 rounded-lg font-black bg-slate-100 text-slate-600 border border-slate-200", children: "Nessun token" }) })
              ] }),
              /* @__PURE__ */ jsxs33("div", { className: "mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-3", children: [
                /* @__PURE__ */ jsxs33("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
                  /* @__PURE__ */ jsxs33("div", { children: [
                    /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Login admin (Supabase Auth)" }),
                    /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-600 mt-1", children: [
                      "Opzionale: effettua login con email/password e il JWT verr\xE0 salvato localmente.",
                      /* @__PURE__ */ jsx33("span", { className: "font-black", children: " L'app resta utilizzabile anche senza login." })
                    ] })
                  ] }),
                  session?.email ? /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700", children: [
                    /* @__PURE__ */ jsx33("div", { className: "font-black", children: "Autenticato" }),
                    /* @__PURE__ */ jsx33("div", { className: "font-mono", children: session.email }),
                    session.expiresAt ? /* @__PURE__ */ jsxs33("div", { className: "text-slate-600", children: [
                      "exp: ",
                      /* @__PURE__ */ jsx33("span", { className: "font-mono", children: session.expiresAt })
                    ] }) : null
                  ] }) : /* @__PURE__ */ jsx33("div", { className: "text-xs text-slate-600", children: "Non autenticato" })
                ] }),
                /* @__PURE__ */ jsxs33("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-2 mt-2", children: [
                  /* @__PURE__ */ jsx33(
                    "input",
                    {
                      value: authEmail,
                      onChange: (e) => setAuthEmail(e.target.value),
                      placeholder: "Email",
                      className: "px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    }
                  ),
                  /* @__PURE__ */ jsx33(
                    "input",
                    {
                      value: authPassword,
                      onChange: (e) => setAuthPassword(e.target.value),
                      placeholder: "Password",
                      type: "password",
                      className: "px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    }
                  ),
                  /* @__PURE__ */ jsxs33("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx33(
                      "button",
                      {
                        disabled: isBusy || !cfg || !authEmail.trim() || !authPassword,
                        onClick: onAuthLogin,
                        className: `flex-1 px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !cfg || !authEmail.trim() || !authPassword ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"}`,
                        children: "Login"
                      }
                    ),
                    /* @__PURE__ */ jsx33(
                      "button",
                      {
                        disabled: isBusy || !session?.accessToken,
                        onClick: onAuthLogout,
                        className: `px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !session?.accessToken ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                        children: "Logout"
                      }
                    )
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs33("div", { className: "flex items-center gap-2 mt-2 flex-wrap", children: [
                /* @__PURE__ */ jsx33(
                  "input",
                  {
                    value: token,
                    onChange: (e) => setToken(e.target.value),
                    placeholder: "JWT (Bearer token)",
                    className: "flex-1 min-w-[240px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: saveToken,
                    className: `px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"}`,
                    children: "Salva token"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !hasToken,
                    onClick: clearToken,
                    className: `px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !hasToken ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: "Rimuovi"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs33("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
              /* @__PURE__ */ jsxs33("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsxs33("div", { children: [
                  /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Impostazioni avanzate" }),
                  /* @__PURE__ */ jsx33("div", { className: "text-xs text-slate-600 mt-1", children: "Usa \u201CForza sovrascrittura\u201D solo se sai cosa stai facendo (pu\xF2 sovrascrivere modifiche di altri admin)." })
                ] }),
                /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-600", children: [
                  "Base remota locale: ",
                  /* @__PURE__ */ jsx33("span", { className: "font-mono", children: remoteBaseUpdatedAt || "\u2014" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs33("label", { className: "flex items-center gap-2 text-xs text-slate-700 mt-2", children: [
                /* @__PURE__ */ jsx33(
                  "input",
                  {
                    type: "checkbox",
                    checked: forceOverwrite,
                    onChange: (e) => setForceOverwrite(e.target.checked),
                    className: "accent-slate-900"
                  }
                ),
                "Forza sovrascrittura"
              ] })
            ] }),
            /* @__PURE__ */ jsxs33("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
              /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Migrazione guidata (prima configurazione)" }),
              /* @__PURE__ */ jsx33("div", { className: "text-xs text-slate-600 mt-1", children: "Percorso consigliato: test \u2192 health check \u2192 backup remoto \u2192 export strutturato + snapshot \u2192 post-check." }),
              /* @__PURE__ */ jsx33("div", { className: "mt-3", children: /* @__PURE__ */ jsx33(DbMigrationWizard, { state, forceOverwrite }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs33("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxs33("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
              /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Snapshot (workspace_state)" }),
              /* @__PURE__ */ jsx33("div", { className: "text-xs text-slate-600 mt-1", children: "Carica o scarica lo stato completo del workspace. Dopo il download puoi applicarlo manualmente in locale." }),
              /* @__PURE__ */ jsxs33("div", { className: "flex items-center gap-2 flex-wrap mt-3", children: [
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onTest,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: "Test connessione"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onHealthCheck,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    title: "Verifica presenza tabelle public e RLS/admin (se JWT presente), e controlla invarianti BYE.",
                    children: "Verifica DB"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onUpload,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-blue-700 text-white border-blue-700 hover:bg-blue-800"}`,
                    children: "Carica stato locale \u2192 DB"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onDownload,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: "Scarica stato da DB"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !downloaded?.state,
                    onClick: onApply,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !downloaded?.state ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800"}`,
                    children: "Applica allo stato locale"
                  }
                )
              ] }),
              downloaded?.updatedAt ? /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700 mt-3", children: [
                "Stato DB aggiornato: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: downloaded.updatedAt })
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxs33("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
              /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Recovery / Dati strutturati" }),
              /* @__PURE__ */ jsx33("div", { className: "text-xs text-slate-600 mt-1", children: "Recovery ricostruisce lo state dalle tabelle normalizzate (best-effort). Export strutturato scrive tabelle tournaments/* + public." }),
              /* @__PURE__ */ jsxs33("div", { className: "flex items-center gap-2 flex-wrap mt-3", children: [
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onDownloadStructured,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    title: "Recovery: ricostruisce lo state dalle tabelle normalizzate. Richiede JWT admin se RLS \xE8 attiva.",
                    children: "Scarica strutturato (recovery)"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !downloadedStructured?.state,
                    onClick: onApplyStructured,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !downloadedStructured?.state ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-emerald-900 text-white border-emerald-900 hover:bg-emerald-800"}`,
                    title: "Applica i dati strutturati scaricati (recovery). Mantiene la lista Squadre pre-struttura del locale per evitare perdita dati.",
                    children: "Applica recovery"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onExportNormalized,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-violet-700 text-white border-violet-700 hover:bg-violet-800"}`,
                    title: "Scrive anche nelle tabelle normalizzate (tournaments/*, hall_of_fame, aliases, scorers).",
                    children: "Esporta dati strutturati \u2192 DB"
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onSeedSimPool,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"}`,
                    title: "Popola il DB pool simulazioni (200 team names + 400 giocatori).",
                    children: "Seed pool simulazioni \u2192 DB"
                  }
                )
              ] }),
              downloadedStructured?.summary ? /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700 mt-3", children: [
                "Recovery strutturato: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: downloadedStructured.updatedAt || "\u2014" }),
                /* @__PURE__ */ jsx33("span", { className: "text-slate-500", children: " \u2014 " }),
                /* @__PURE__ */ jsx33("span", { className: "text-slate-600", children: `Tornei ${downloadedStructured.summary.tournaments}, Match ${downloadedStructured.summary.matches}, Stats ${downloadedStructured.summary.matchStats}` })
              ] }) : null
            ] }),
            /* @__PURE__ */ jsxs33("div", { className: "bg-white border border-slate-200 rounded-2xl p-3", children: [
              /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Auto-sync strutturato" }),
              /* @__PURE__ */ jsx33("div", { className: "text-xs text-slate-600 mt-1", children: "Se attivo e hai un JWT admin, l'app tenter\xE0 di aggiornare DB normalizzato + tabelle public dopo ogni modifica (debounced + throttle)." }),
              /* @__PURE__ */ jsxs33("div", { className: "flex items-center gap-2 flex-wrap mt-3", children: [
                /* @__PURE__ */ jsxs33(
                  "button",
                  {
                    disabled: isBusy || !cfg,
                    onClick: onToggleAutoStructured,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? "bg-slate-100 text-slate-400 border-slate-200" : autoStructured ? "bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                    children: [
                      "Auto-sync: ",
                      autoStructured ? "ON" : "OFF"
                    ]
                  }
                ),
                /* @__PURE__ */ jsx33(
                  "button",
                  {
                    disabled: isBusy || !cfg || !autoStructured,
                    onClick: onSyncNowStructured,
                    className: `px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg || !autoStructured ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-emerald-900 text-white border-emerald-900 hover:bg-emerald-800"}`,
                    title: "Forza un tentativo di sync strutturato immediato (best-effort).",
                    children: "Sync adesso"
                  }
                )
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs33("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700 bg-white border border-slate-200 rounded-2xl p-3", children: [
            /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Diagnostica sync" }),
            /* @__PURE__ */ jsxs33("div", { className: "mt-1 space-y-1", children: [
              /* @__PURE__ */ jsxs33("div", { children: [
                "Ultimo snapshot OK: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: diag.lastSnapshotOkAt || "\u2014" })
              ] }),
              /* @__PURE__ */ jsxs33("div", { children: [
                "Ultimo strutturato OK: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: diag.lastStructuredOkAt || "\u2014" })
              ] }),
              /* @__PURE__ */ jsxs33("div", { children: [
                "Ultimo remote updated_at visto: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: diag.lastRemoteUpdatedAt || downloaded?.updatedAt || "\u2014" })
              ] }),
              /* @__PURE__ */ jsxs33("div", { children: [
                "Remote base (locale): ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: remoteBaseUpdatedAt || diag.lastRemoteBaseUpdatedAt || "\u2014" })
              ] }),
              diag.lastStructuredSummary ? /* @__PURE__ */ jsxs33("div", { className: "text-slate-600", children: [
                "Ultimo summary: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: JSON.stringify(diag.lastStructuredSummary) })
              ] }) : null,
              diag.lastConflictAt || diag.lastConflictMessage ? /* @__PURE__ */ jsxs33("div", { className: "text-amber-800", children: [
                "Ultimo conflitto: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: diag.lastConflictAt || "" }),
                " ",
                diag.lastConflictMessage ? `\u2014 ${diag.lastConflictMessage}` : ""
              ] }) : null,
              diag.lastErrorAt || diag.lastErrorMessage ? /* @__PURE__ */ jsxs33("div", { className: "text-red-700", children: [
                "Ultimo errore: ",
                /* @__PURE__ */ jsx33("span", { className: "font-mono", children: diag.lastErrorAt || "" }),
                " ",
                diag.lastErrorMessage ? `\u2014 ${diag.lastErrorMessage}` : ""
              ] }) : null
            ] })
          ] }),
          /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700 bg-white border border-slate-200 rounded-2xl p-3", children: [
            /* @__PURE__ */ jsxs33("div", { className: "flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Storico sync (locale)" }),
              /* @__PURE__ */ jsx33(
                "button",
                {
                  onClick: () => {
                    clearDbSyncHistory();
                    setDiagTick((x) => x + 1);
                  },
                  className: "px-3 py-1.5 rounded-xl font-black border text-xs bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  children: "Pulisci"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs33("div", { className: "mt-2 space-y-1 max-h-48 overflow-auto", children: [
              (diag.events || []).slice().reverse().slice(0, 25).map((e, idx) => {
                const level = String(e.level || "info");
                const badge = level === "error" ? "bg-red-50 text-red-700 border-red-200" : level === "conflict" ? "bg-amber-50 text-amber-800 border-amber-200" : level === "warn" ? "bg-amber-50 text-amber-800 border-amber-200" : level === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200";
                return /* @__PURE__ */ jsxs33("div", { className: "flex items-start gap-2", children: [
                  /* @__PURE__ */ jsx33("span", { className: `px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge}`, children: String(e.kind || "sync").toUpperCase() }),
                  /* @__PURE__ */ jsxs33("div", { className: "flex-1", children: [
                    /* @__PURE__ */ jsx33("div", { className: "text-[11px] font-mono text-slate-500", children: String(e.at || "").slice(0, 19) }),
                    /* @__PURE__ */ jsx33("div", { className: "text-xs break-words", children: e.message })
                  ] }),
                  /* @__PURE__ */ jsx33("span", { className: `px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge}`, children: level.toUpperCase() })
                ] }, idx);
              }),
              !(diag.events || []).length ? /* @__PURE__ */ jsx33("div", { className: "text-slate-500", children: "Nessun evento registrato." }) : null
            ] })
          ] })
        ] }),
        health ? /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700 bg-white border border-slate-200 rounded-2xl p-3", children: [
          /* @__PURE__ */ jsxs33("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsx33("div", { className: "text-xs font-black", children: "Verifica DB" }),
            /* @__PURE__ */ jsx33("div", { className: "text-xs", children: health.ok ? /* @__PURE__ */ jsx33("span", { className: "px-2 py-1 rounded-lg font-black bg-emerald-100 text-emerald-900 border border-emerald-200", children: "OK" }) : /* @__PURE__ */ jsx33("span", { className: "px-2 py-1 rounded-lg font-black bg-amber-100 text-amber-900 border border-amber-200", children: "Attenzione" }) })
          ] }),
          /* @__PURE__ */ jsx33("div", { className: "mt-2 space-y-1", children: (health.checks || []).map((c, idx) => {
            const sev = String(c.severity || "info");
            const badge = sev === "error" ? "bg-red-50 text-red-700 border-red-200" : sev === "warn" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-50 text-slate-700 border-slate-200";
            return /* @__PURE__ */ jsxs33("div", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ jsx33("span", { className: `px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge}`, children: sev.toUpperCase() }),
              /* @__PURE__ */ jsxs33("div", { className: "flex-1", children: [
                /* @__PURE__ */ jsx33("div", { className: "font-black", children: c.name }),
                /* @__PURE__ */ jsx33("div", { className: "text-slate-600 break-words", children: c.ok ? "OK" : c.message })
              ] })
            ] }, idx);
          }) })
        ] }) : null,
        panel.kind === "working" ? /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-700", children: [
          "\u23F3 ",
          panel.action,
          "\u2026"
        ] }) : panel.kind === "error" ? /* @__PURE__ */ jsx33("div", { className: "text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2", children: panel.message }) : panel.kind === "ok" ? /* @__PURE__ */ jsx33("div", { className: "text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2", children: panel.message }) : null,
        !cfg ? /* @__PURE__ */ jsxs33("div", { className: "text-xs text-slate-600", children: [
          "Configura ",
          /* @__PURE__ */ jsx33("span", { className: "font-mono", children: "VITE_SUPABASE_URL" }),
          " e ",
          /* @__PURE__ */ jsx33("span", { className: "font-mono", children: "VITE_SUPABASE_ANON_KEY" }),
          " in ",
          /* @__PURE__ */ jsx33("span", { className: "font-mono", children: ".env.local" }),
          " (vedi ",
          /* @__PURE__ */ jsx33("span", { className: "font-mono", children: ".env.example" }),
          ")."
        ] }) : null
      ] });
    };
  }
});

// components/admin/tabs/data/IntegrationsSubTab.tsx
import { Crosshair, GitMerge, Trophy as Trophy8 } from "lucide-react";
import { jsx as jsx34, jsxs as jsxs34 } from "react/jsx-runtime";
var IntegrationsSubTab;
var init_IntegrationsSubTab = __esm({
  "components/admin/tabs/data/IntegrationsSubTab.tsx"() {
    init_IntegrationsHof();
    init_IntegrationsScorers();
    init_IntegrationsAliases();
    init_DbSyncPanel();
    init_appMode();
    IntegrationsSubTab = (props) => {
      const { integrationsSubTab, setIntegrationsSubTab } = props;
      return /* @__PURE__ */ jsxs34("div", { className: "space-y-6", children: [
        /* @__PURE__ */ jsx34("div", { className: "bg-slate-50 border border-slate-200 rounded-xl p-4", children: /* @__PURE__ */ jsxs34("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs34("div", { children: [
            /* @__PURE__ */ jsx34("div", { className: "font-black text-slate-900", children: "Integrazioni" }),
            /* @__PURE__ */ jsx34("div", { className: "text-xs text-slate-600 font-bold mt-1", children: "Albo d'Oro manuale, import marcatori e gestione alias (merge profili)." })
          ] }),
          /* @__PURE__ */ jsxs34("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsxs34(
              "button",
              {
                onClick: () => {
                  setIntegrationsSubTab("hof");
                  try {
                    sessionStorage.setItem("flbp_admin_integrations_subtab", "hof");
                  } catch {
                  }
                },
                className: `px-3 py-2 rounded-xl font-black border text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${integrationsSubTab === "hof" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                children: [
                  /* @__PURE__ */ jsx34(Trophy8, { className: "w-4 h-4" }),
                  "Albo d'Oro"
                ]
              }
            ),
            /* @__PURE__ */ jsxs34(
              "button",
              {
                onClick: () => {
                  setIntegrationsSubTab("scorers");
                  try {
                    sessionStorage.setItem("flbp_admin_integrations_subtab", "scorers");
                  } catch {
                  }
                },
                className: `px-3 py-2 rounded-xl font-black border text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${integrationsSubTab === "scorers" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                children: [
                  /* @__PURE__ */ jsx34(Crosshair, { className: "w-4 h-4" }),
                  "Marcatori"
                ]
              }
            ),
            /* @__PURE__ */ jsxs34(
              "button",
              {
                onClick: () => {
                  setIntegrationsSubTab("aliases");
                  try {
                    sessionStorage.setItem("flbp_admin_integrations_subtab", "aliases");
                  } catch {
                  }
                },
                className: `px-3 py-2 rounded-xl font-black border text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${integrationsSubTab === "aliases" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                children: [
                  /* @__PURE__ */ jsx34(GitMerge, { className: "w-4 h-4" }),
                  "Alias"
                ]
              }
            )
          ] })
        ] }) }),
        integrationsSubTab === "hof" ? /* @__PURE__ */ jsx34(IntegrationsHof, { ...props }) : integrationsSubTab === "scorers" ? /* @__PURE__ */ jsx34(IntegrationsScorers, { ...props }) : /* @__PURE__ */ jsx34(IntegrationsAliases, { ...props }),
        isTesterMode ? /* @__PURE__ */ jsxs34("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx34("div", { className: "text-xs font-black text-slate-600", children: "Backup & Sync (beta \u2014 solo tester)" }),
          /* @__PURE__ */ jsx34(DbSyncPanel, { state: props.state, setState: props.setState })
        ] }) : null
      ] });
    };
  }
});

// components/admin/tabs/data/index.ts
var init_data = __esm({
  "components/admin/tabs/data/index.ts"() {
    init_ArchiveSubTab();
    init_IntegrationsSubTab();
    init_IntegrationsHof();
    init_IntegrationsScorers();
    init_IntegrationsAliases();
  }
});

// components/admin/tabs/DataTab.tsx
import { Archive as Archive2, Link2, Settings as Settings4 } from "lucide-react";
import { jsx as jsx35, jsxs as jsxs35 } from "react/jsx-runtime";
var DataTab;
var init_DataTab = __esm({
  "components/admin/tabs/DataTab.tsx"() {
    init_data();
    DataTab = (props) => {
      const { dataSubTab, setDataSubTab } = props;
      const archiveCount = (props.state.tournamentHistory || []).length;
      const hofCount = (props.state.hallOfFame || []).length;
      const scorersCount = (props.state.integrationsScorers || []).length;
      const aliasesCount = Object.keys(props.state.playerAliases || {}).length;
      const pill = (label) => /* @__PURE__ */ jsx35("span", { className: "px-2 py-1 rounded-full text-[11px] font-black border border-slate-200 bg-slate-50 text-slate-700", children: label });
      return /* @__PURE__ */ jsxs35("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6", children: [
        /* @__PURE__ */ jsxs35("div", { className: "flex items-start justify-between gap-3 flex-wrap", children: [
          /* @__PURE__ */ jsxs35("div", { children: [
            /* @__PURE__ */ jsxs35("h3", { className: "text-xl font-black flex items-center gap-2", children: [
              /* @__PURE__ */ jsx35(Settings4, { className: "w-5 h-5" }),
              "Gestione dati"
            ] }),
            /* @__PURE__ */ jsx35("div", { className: "text-xs text-slate-600 font-bold mt-1", children: "Archivio tornei, integrazioni (Albo d'Oro, Marcatori, Alias) e strumenti di backup/sync (solo tester)." }),
            /* @__PURE__ */ jsxs35("div", { className: "flex items-center gap-2 flex-wrap mt-3", children: [
              pill(`Archivio: ${archiveCount}`),
              pill(`HoF: ${hofCount}`),
              pill(`Marcatori: ${scorersCount}`),
              pill(`Alias: ${aliasesCount}`)
            ] })
          ] }),
          /* @__PURE__ */ jsxs35("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs35(
              "button",
              {
                onClick: () => {
                  setDataSubTab("archive");
                  try {
                    sessionStorage.setItem("flbp_admin_data_subtab", "archive");
                  } catch {
                  }
                },
                className: `px-3 py-2 rounded-xl font-black border text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${dataSubTab === "archive" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                children: [
                  /* @__PURE__ */ jsx35(Archive2, { className: "w-4 h-4" }),
                  "Archivio tornei"
                ]
              }
            ),
            /* @__PURE__ */ jsxs35(
              "button",
              {
                onClick: () => {
                  setDataSubTab("integrations");
                  try {
                    sessionStorage.setItem("flbp_admin_data_subtab", "integrations");
                  } catch {
                  }
                },
                className: `px-3 py-2 rounded-xl font-black border text-sm flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${dataSubTab === "integrations" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                children: [
                  /* @__PURE__ */ jsx35(Link2, { className: "w-4 h-4" }),
                  "Integrazioni"
                ]
              }
            )
          ] })
        ] }),
        dataSubTab === "archive" ? /* @__PURE__ */ jsx35(ArchiveSubTab, { ...props }) : /* @__PURE__ */ jsx35(IntegrationsSubTab, { ...props })
      ] });
    };
  }
});

// components/AdminDashboard.tsx
var AdminDashboard_exports = {};
__export(AdminDashboard_exports, {
  AdminDashboard: () => AdminDashboard
});
import { useEffect as useEffect8, useMemo as useMemo6, useRef as useRef5, useState as useState12 } from "react";
import { Archive as Archive3, MonitorPlay as MonitorPlay4, Users as Users3, Brackets as Brackets2, ClipboardList as ClipboardList2, LayoutDashboard as LayoutDashboard4, ListChecks as ListChecks2, Trash2 as Trash24, ShieldCheck as ShieldCheck2, PlayCircle as PlayCircle2, Settings as Settings5, CheckCircle2 as CheckCircle26 } from "lucide-react";
import { Fragment as Fragment15, jsx as jsx36, jsxs as jsxs36 } from "react/jsx-runtime";
var AdminDashboard;
var init_AdminDashboard = __esm({
  "components/AdminDashboard.tsx"() {
    init_storageService();
    init_App();
    init_tournamentEngine();
    init_simulationService();
    init_matchUtils();
    init_groupStandings();
    init_imageProcessingService();
    init_supabaseRest();
    init_id();
    init_adminCsvUtils();
    init_simPool();
    init_lazyXlsx();
    init_AliasModal();
    init_MvpModal();
    init_TeamsTab();
    init_StructureTab();
    init_ReportsTab();
    init_RefereesTab();
    init_CodesTab();
    init_MonitorGroupsTab();
    init_MonitorBracketTab();
    init_DataTab();
    init_appMode();
    AdminDashboard = ({ state, setState, onEnterTv }) => {
      const { t } = useTranslation();
      const safeSessionGet = (key) => {
        try {
          return window.sessionStorage.getItem(key);
        } catch {
          return null;
        }
      };
      const safeSessionSet = (key, value) => {
        try {
          window.sessionStorage.setItem(key, value);
        } catch {
        }
      };
      const safeSessionRemove = (key) => {
        try {
          window.sessionStorage.removeItem(key);
        } catch {
        }
      };
      const [authed, setAuthed] = useState12(() => safeSessionGet("flbp_admin_authed") === "1");
      const [adminLoginPassword, setAdminLoginPassword] = useState12("");
      const [supabaseEmail, setSupabaseEmail] = useState12(() => {
        const s = getSupabaseSession();
        return s?.accessToken ? s.email || "admin" : null;
      });
      const sessionStorageWritable = useMemo6(() => {
        const key = "__flbp_ss_probe__";
        safeSessionSet(key, "1");
        const ok = safeSessionGet(key) === "1";
        safeSessionRemove(key);
        return ok;
      }, []);
      const [swDisabled, setSwDisabled] = useState12(() => {
        try {
          return localStorage.getItem("flbp_sw_disabled") === "1";
        } catch {
          return false;
        }
      });
      const bestEffortClearSwCaches = async () => {
        try {
          try {
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_CACHES" });
            }
          } catch {
          }
          try {
            if ("serviceWorker" in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
            }
          } catch {
          }
          try {
            const w = window;
            if (w.caches && typeof w.caches.keys === "function") {
              const keys = await w.caches.keys();
              await Promise.all(keys.map((k) => w.caches.delete(k)));
            }
          } catch {
          }
        } catch {
        }
      };
      useEffect8(() => {
        let lastToken = "";
        const tick = () => {
          const ss2 = getSupabaseSession();
          const token = (ss2?.accessToken || "").trim();
          const email = token ? ss2?.email || "admin" : null;
          if (token && !authed) {
            try {
              safeSessionSet("flbp_admin_authed", "1");
            } catch {
            }
            setAuthed(true);
          }
          if (token !== lastToken) {
            lastToken = token;
            setSupabaseEmail(email);
          } else {
            if (email && email != supabaseEmail) setSupabaseEmail(email);
            if (!email && supabaseEmail) setSupabaseEmail(null);
          }
        };
        tick();
        const id = window.setInterval(tick, 1e3);
        return () => window.clearInterval(id);
      }, [authed]);
      const [adminSection, setAdminSection] = useState12(() => {
        const raw2 = safeSessionGet("flbp_admin_section");
        return raw2 === "data" ? "data" : "live";
      });
      const [lastLiveTab, setLastLiveTab] = useState12(() => {
        const raw2 = safeSessionGet("flbp_admin_last_live_tab");
        const ok = raw2 === "teams" || raw2 === "structure" || raw2 === "reports" || raw2 === "referees" || raw2 === "codes" || raw2 === "monitor_groups" || raw2 === "monitor_bracket";
        return ok ? raw2 : "teams";
      });
      const [tab2, setTab] = useState12(() => {
        return adminSection === "data" ? "data" : lastLiveTab;
      });
      const [poolN, setPoolN] = useState12("20");
      const [editingId, setEditingId] = useState12(null);
      const [teamName, setTeamName] = useState12("");
      const [p1, setP1] = useState12("");
      const [p2, setP2] = useState12("");
      const [y1, setY1] = useState12("");
      const [y2, setY2] = useState12("");
      const [p1IsReferee, setP1IsReferee] = useState12(false);
      const [p2IsReferee, setP2IsReferee] = useState12(false);
      const [isReferee, setIsReferee] = useState12(false);
      const [tournMode, setTournMode] = useState12("groups_elimination");
      const [numGroups, setNumGroups] = useState12(4);
      const [advancing, setAdvancing] = useState12(2);
      const [tournName, setTournName] = useState12(`Torneo ${(/* @__PURE__ */ new Date()).toLocaleDateString("it-IT")}`);
      const [finalRrEnabled, setFinalRrEnabled] = useState12(false);
      const [finalRrTopTeams, setFinalRrTopTeams] = useState12(4);
      const playableTeamsCount = useMemo6(() => {
        return (state.teams || []).filter((t2) => !t2.isReferee && !t2.hidden && !t2.isBye).length;
      }, [state.teams]);
      useEffect8(() => {
        if (playableTeamsCount < 4 && finalRrEnabled) {
          setFinalRrEnabled(false);
        }
        if (playableTeamsCount < 8 && finalRrTopTeams === 8) {
          setFinalRrTopTeams(4);
        }
      }, [playableTeamsCount, finalRrEnabled, finalRrTopTeams]);
      const [mvpModalOpen, setMvpModalOpen] = useState12(false);
      const [mvpModalForArchive, setMvpModalForArchive] = useState12(false);
      const [mvpSearch, setMvpSearch] = useState12("");
      const [mvpSelectedIds, setMvpSelectedIds] = useState12([]);
      const [draft, setDraft] = useState12(null);
      const [dataSubTab, setDataSubTab] = useState12(() => {
        const raw2 = safeSessionGet("flbp_admin_data_subtab");
        if (raw2 === "hof" || raw2 === "integrations") return "integrations";
        return "archive";
      });
      const [integrationsSubTab, setIntegrationsSubTab] = useState12(() => {
        const raw2 = safeSessionGet("flbp_admin_integrations_subtab");
        if (raw2 === "scorers") return "scorers";
        if (raw2 === "aliases") return "aliases";
        return "hof";
      });
      const [aliasesSearch, setAliasesSearch] = useState12("");
      const [aliasToolSelections, setAliasToolSelections] = useState12({});
      const [dataSelectedTournamentId, setDataSelectedTournamentId] = useState12("");
      const [dataSelectedMatchId, setDataSelectedMatchId] = useState12("");
      const [dataScoreA, setDataScoreA] = useState12("0");
      const [dataScoreB, setDataScoreB] = useState12("0");
      const [dataStatus, setDataStatus] = useState12("finished");
      const [dataRecomputeAwards, setDataRecomputeAwards] = useState12(true);
      const [dataWinnerTeamId, setDataWinnerTeamId] = useState12("");
      const [dataTopScorerPlayerId, setDataTopScorerPlayerId] = useState12("");
      const [dataDefenderPlayerId, setDataDefenderPlayerId] = useState12("");
      const [dataMvpPlayerId, setDataMvpPlayerId] = useState12("");
      const tabBtnClass = (active) => {
        const base = "px-4 py-2 rounded-xl font-black inline-flex items-center gap-2 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
        return `${base} ${active ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`;
      };
      const [dataTopScorerU25PlayerId, setDataTopScorerU25PlayerId] = useState12("");
      const [dataDefenderU25PlayerId, setDataDefenderU25PlayerId] = useState12("");
      const [hofEditId, setHofEditId] = useState12("");
      const [hofEditTournamentId, setHofEditTournamentId] = useState12("");
      const [hofYear, setHofYear] = useState12(() => (/* @__PURE__ */ new Date()).getFullYear().toString());
      const [hofTournamentName, setHofTournamentName] = useState12("");
      const [hofType, setHofType] = useState12("winner");
      const [hofTeamName, setHofTeamName] = useState12("");
      const [hofWinnerP1, setHofWinnerP1] = useState12("");
      const [hofWinnerP2, setHofWinnerP2] = useState12("");
      const [hofPlayerName, setHofPlayerName] = useState12("");
      const [hofPlayerYoB, setHofPlayerYoB] = useState12("");
      const [hofValue, setHofValue] = useState12("");
      const [scorersImportWarnings, setScorersImportWarnings] = useState12([]);
      const [createArchiveOpen, setCreateArchiveOpen] = useState12(false);
      const [createArchiveStep, setCreateArchiveStep] = useState12("meta");
      const [createArchiveName, setCreateArchiveName] = useState12("");
      const [createArchiveDate, setCreateArchiveDate] = useState12(() => {
        const d = /* @__PURE__ */ new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      });
      const [createArchiveMode, setCreateArchiveMode] = useState12("groups_elimination");
      const [createArchiveGroups, setCreateArchiveGroups] = useState12(4);
      const [createArchiveAdvancing, setCreateArchiveAdvancing] = useState12(2);
      const [createArchiveFinalRrEnabled, setCreateArchiveFinalRrEnabled] = useState12(false);
      const [createArchiveFinalRrTopTeams, setCreateArchiveFinalRrTopTeams] = useState12(4);
      const [createArchiveTeams, setCreateArchiveTeams] = useState12([]);
      const wizardPlayableTeamsCount = useMemo6(() => {
        return (createArchiveTeams || []).filter((t2) => !t2.isReferee && !t2.hidden && !t2.isBye).length;
      }, [createArchiveTeams]);
      useEffect8(() => {
        if (wizardPlayableTeamsCount < 4 && createArchiveFinalRrEnabled) {
          setCreateArchiveFinalRrEnabled(false);
        }
        if (wizardPlayableTeamsCount < 8 && createArchiveFinalRrTopTeams === 8) {
          setCreateArchiveFinalRrTopTeams(4);
        }
        if (createArchiveMode === "round_robin" && createArchiveFinalRrEnabled) {
          setCreateArchiveFinalRrEnabled(false);
        }
      }, [wizardPlayableTeamsCount, createArchiveMode, createArchiveFinalRrEnabled, createArchiveFinalRrTopTeams]);
      const [caTeamName, setCaTeamName] = useState12("");
      const [caP1, setCaP1] = useState12("");
      const [caY1, setCaY1] = useState12("");
      const [caP2, setCaP2] = useState12("");
      const [caY2, setCaY2] = useState12("");
      const [caP1IsRef, setCaP1IsRef] = useState12(false);
      const [caP2IsRef, setCaP2IsRef] = useState12(false);
      const createArchiveFileRef = useRef5(null);
      const [aliasModalOpen, setAliasModalOpen] = useState12(false);
      const [aliasModalTitle, setAliasModalTitle] = useState12("");
      const [aliasModalConflicts, setAliasModalConflicts] = useState12([]);
      const [pendingTeamSave, setPendingTeamSave] = useState12(null);
      const [pendingScorersImport, setPendingScorersImport] = useState12(null);
      const [codesStatusFilter, setCodesStatusFilter] = useState12("all");
      const [refTables, setRefTables] = useState12(() => {
        const raw2 = localStorage.getItem("flbp_ref_tables");
        const n = raw2 ? parseInt(raw2, 10) : 8;
        return Number.isFinite(n) && n > 0 ? n : 8;
      });
      const [simBusy, setSimBusy] = useState12(false);
      const [reportMatchId, setReportMatchId] = useState12("");
      const [reportStatus, setReportStatus] = useState12("finished");
      const [reportScoreA, setReportScoreA] = useState12("0");
      const [reportScoreB, setReportScoreB] = useState12("0");
      const [reportStatsForm, setReportStatsForm] = useState12({});
      const [reportImageUrl, setReportImageUrl] = useState12("");
      const [reportImageBusy, setReportImageBusy] = useState12(false);
      const [reportOcrText, setReportOcrText] = useState12("");
      const [reportOcrBusy, setReportOcrBusy] = useState12(false);
      const reportFileRef = useRef5(null);
      const backupRef = useRef5(null);
      const fileRef = useRef5(null);
      const scorersFileRef = useRef5(null);
      const normalizeName2 = (n) => (n || "").trim().toLowerCase().replace(/\s+/g, " ");
      const normalizeCol = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const labelFromPlayerKey = (key) => {
        const { name, yob } = getPlayerKeyLabel(key);
        return `${name} (${yob})`;
      };
      const buildProfilesIndex = (excludeTeamId) => {
        const idx = /* @__PURE__ */ new Map();
        const add = (name, yob) => {
          const norm = normalizeName2(name);
          if (!norm) return;
          const rawKey = getPlayerKey(name, yob ?? "ND");
          const canon = resolvePlayerKey(state, rawKey);
          const set = idx.get(norm) || /* @__PURE__ */ new Set();
          set.add(canon);
          idx.set(norm, set);
        };
        (state.teams || []).filter((t2) => !excludeTeamId || t2.id !== excludeTeamId).forEach((t2) => {
          if (t2.player1) add(t2.player1, t2.player1YoB);
          if (t2.player2) add(t2.player2, t2.player2YoB);
        });
        (state.tournamentHistory || []).forEach((tour) => {
          (tour.teams || []).forEach((t2) => {
            if (t2.player1) add(t2.player1, t2.player1YoB);
            if (t2.player2) add(t2.player2, t2.player2YoB);
          });
        });
        (state.integrationsScorers || []).forEach((e) => add(e.name, e.yob));
        return idx;
      };
      const setAlias = (fromKey, toKey) => {
        const from = (fromKey || "").trim();
        const to = (toKey || "").trim();
        if (!from || !to || from === to) return;
        const next = { ...state.playerAliases || {}, [from]: to };
        setState({ ...state, playerAliases: next });
      };
      const removeAlias = (fromKey) => {
        const from = (fromKey || "").trim();
        if (!from) return;
        const next = { ...state.playerAliases || {} };
        delete next[from];
        setState({ ...state, playerAliases: next });
      };
      const makeAliasConflict = (name, yob, index) => {
        const norm = normalizeName2(name);
        if (!norm) return null;
        const rawKey = getPlayerKey(name, yob ?? "ND");
        const resolved = resolvePlayerKey(state, rawKey);
        if (resolved !== rawKey) return null;
        const set = (index || buildProfilesIndex()).get(norm);
        if (!set || set.size === 0) return null;
        if (set.has(resolved)) return null;
        const candidates = Array.from(set).filter((k) => k !== resolved).map((k) => ({ key: k, label: labelFromPlayerKey(k) }));
        if (candidates.length === 0) return null;
        return {
          id: uuid2(),
          sourceKey: rawKey,
          sourceName: name,
          sourceYoB: yob ? String(yob) : "ND",
          candidates,
          action: "separate"
        };
      };
      const toInt2 = (v) => {
        const raw2 = String(v ?? "").trim();
        if (!raw2) return void 0;
        const n = parseInt(raw2.replace(/[^0-9]/g, ""), 10);
        return Number.isFinite(n) ? n : void 0;
      };
      const importScorersFromFile = async (file) => {
        const XLSX = await getXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const getField = (row, candidates) => {
          const cand = new Set(candidates.map(normalizeCol));
          for (const k of Object.keys(row)) {
            if (cand.has(normalizeCol(k))) return row[k];
          }
          return "";
        };
        const profilesIndex = buildProfilesIndex();
        const entries = [];
        const warnings = [];
        rows.forEach((r, idx) => {
          const name = String(getField(r, ["Nome", "Giocatore", "Player", "CognomeNome", "Cognome Nome", "Name"])).trim();
          if (!name) return;
          const yob = toInt2(getField(r, ["Anno", "AnnoNascita", "Year", "YoB", "Nascita", "BirthYear"]));
          const games = Math.max(0, toInt2(getField(r, ["Partite", "Gare", "Games", "Played"])) || 0);
          const points = Math.max(0, toInt2(getField(r, ["Canestri", "Punti", "Points", "PT"])) || 0);
          const soffi = Math.max(0, toInt2(getField(r, ["Soffi", "SF", "Blows"])) || 0);
          const norm = normalizeName2(name);
          const yobStr = yob ? String(yob) : "ND";
          const rawKey = getPlayerKey(name, yob ?? "ND");
          const resolved = resolvePlayerKey(state, rawKey);
          const existingKeys = profilesIndex.get(norm);
          if (existingKeys && existingKeys.size > 0 && resolved === rawKey && !existingKeys.has(resolved)) {
            const list = Array.from(existingKeys).map((k) => labelFromPlayerKey(k)).join(" | ");
            warnings.push(`${name} \xB7 esistenti: ${list} \xB7 import: ${yobStr} (riga ${idx + 2})`);
          }
          entries.push({
            id: `sc_${uuid2()}`,
            name,
            yob,
            games,
            points,
            soffi,
            createdAt: Date.now(),
            source: file.name
          });
        });
        return { entries, warnings };
      };
      const resetForm = () => {
        setEditingId(null);
        setTeamName("");
        setP1("");
        setP2("");
        setY1("");
        setY2("");
        setP1IsReferee(false);
        setP2IsReferee(false);
        setIsReferee(false);
      };
      const resetCreateArchiveWizard = () => {
        setCreateArchiveOpen(false);
        setCreateArchiveStep("meta");
        setCreateArchiveName("");
        const d = /* @__PURE__ */ new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setCreateArchiveDate(`${yyyy}-${mm}-${dd}`);
        setCreateArchiveMode("groups_elimination");
        setCreateArchiveGroups(4);
        setCreateArchiveAdvancing(2);
        setCreateArchiveFinalRrEnabled(false);
        setCreateArchiveFinalRrTopTeams(4);
        setCreateArchiveTeams([]);
        setCaTeamName("");
        setCaP1("");
        setCaY1("");
        setCaP2("");
        setCaY2("");
        setCaP1IsRef(false);
        setCaP2IsRef(false);
      };
      const openCreateArchiveWizard = () => {
        setCreateArchiveOpen(true);
        setCreateArchiveStep("meta");
        if (!createArchiveName.trim()) {
          setCreateArchiveName(`Torneo ${createArchiveDate}`);
        }
      };
      const addWizardTeam = () => {
        if (!caTeamName.trim() || !caP1.trim() || !caP2.trim()) {
          alert(t("alert_fill_team_players"));
          return;
        }
        const k = caTeamName.trim().toLowerCase();
        const exists = (createArchiveTeams || []).some((tt) => (tt.name || "").trim().toLowerCase() === k);
        if (exists) {
          if (!confirm("Esiste gi\xE0 una squadra con questo nome nel wizard. Vuoi inserirne un'altra uguale?")) return;
        }
        const team = {
          id: uuid2(),
          name: caTeamName.trim(),
          player1: caP1.trim(),
          player2: caP2.trim(),
          player1YoB: caY1 ? Number(caY1) : void 0,
          player2YoB: caY2 ? Number(caY2) : void 0,
          player1IsReferee: caP1IsRef,
          player2IsReferee: caP2IsRef,
          isReferee: caP1IsRef || caP2IsRef,
          createdAt: Date.now()
        };
        setCreateArchiveTeams([...createArchiveTeams || [], team]);
        setCaTeamName("");
        setCaP1("");
        setCaY1("");
        setCaP2("");
        setCaY2("");
        setCaP1IsRef(false);
        setCaP2IsRef(false);
      };
      const removeWizardTeam = (id) => {
        setCreateArchiveTeams((createArchiveTeams || []).filter((t2) => t2.id !== id));
      };
      const copyLiveTeamsIntoWizard = () => {
        if (!(state.teams || []).length) {
          alert(t("alert_no_live_teams_copy"));
          return;
        }
        if ((createArchiveTeams || []).length) {
          if (!confirm("Sovrascrivere le squadre gi\xE0 inserite nel wizard con le squadre del live?")) return;
        }
        const copied = (state.teams || []).map((t2) => ({ ...t2, id: uuid2() }));
        setCreateArchiveTeams(copied);
        alert(`Copiate ${copied.length} squadre dal live.`);
      };
      const createArchivedTournament = () => {
        const nm = createArchiveName.trim();
        if (!nm) {
          alert(t("alert_enter_tournament_name"));
          return;
        }
        const teamsCount = (createArchiveTeams || []).length;
        if (teamsCount < 1) {
          alert("Inserisci almeno una squadra.");
          return;
        }
        const dateIso = `${createArchiveDate}T00:00:00.000Z`;
        const sameName = (state.tournamentHistory || []).some((t2) => (t2.name || "").trim().toLowerCase() === nm.toLowerCase());
        if (sameName) {
          if (!confirm("Esiste gi\xE0 un torneo archiviato con lo stesso nome. Vuoi crearne un altro comunque?")) return;
        }
        const finalRoundRobin = createArchiveMode !== "round_robin" && createArchiveFinalRrEnabled ? { enabled: true, topTeams: createArchiveFinalRrTopTeams, activated: false } : void 0;
        const newId = `arch_${uuid2()}`;
        let nextTournament;
        if (teamsCount >= 2) {
          const { tournament, matches } = generateTournamentStructure(createArchiveTeams, {
            mode: createArchiveMode,
            numGroups: createArchiveMode === "groups_elimination" ? createArchiveGroups : void 0,
            advancingPerGroup: createArchiveMode === "groups_elimination" ? createArchiveAdvancing : void 0,
            tournamentName: nm,
            finalRoundRobin
          });
          const baseAdvancing = createArchiveMode === "groups_elimination" ? createArchiveAdvancing : createArchiveMode === "round_robin" ? 0 : 2;
          nextTournament = {
            ...tournament,
            id: newId,
            name: nm,
            startDate: dateIso,
            type: createArchiveMode,
            teams: createArchiveTeams,
            matches,
            rounds: tournament.rounds,
            groups: tournament.groups,
            config: {
              advancingPerGroup: baseAdvancing,
              ...finalRoundRobin ? { finalRoundRobin } : {}
            },
            isManual: true
          };
        } else {
          nextTournament = {
            id: newId,
            name: nm,
            startDate: dateIso,
            type: createArchiveMode,
            teams: createArchiveTeams,
            matches: [],
            rounds: [],
            groups: [],
            config: { advancingPerGroup: 0 },
            isManual: true
          };
        }
        const nextHistory = [...state.tournamentHistory || [], nextTournament];
        setState({ ...state, tournamentHistory: nextHistory });
        setDataSelectedTournamentId(newId);
        setDataSelectedMatchId("");
        setDataWinnerTeamId("");
        setDataTopScorerPlayerId("");
        setDataDefenderPlayerId("");
        setDataMvpPlayerId("");
        setDataTopScorerU25PlayerId("");
        setDataDefenderU25PlayerId("");
        setCreateArchiveOpen(false);
        setCreateArchiveStep("meta");
        alert(t("alert_archived_created"));
      };
      const switchAdminSection = (next) => {
        safeSessionSet("flbp_admin_section", next);
        setAdminSection(next);
        if (next === "data") {
          if (tab2 !== "data") {
            setLastLiveTab(tab2);
            safeSessionSet("flbp_admin_last_live_tab", tab2);
          }
          setTab("data");
        } else {
          const raw2 = safeSessionGet("flbp_admin_last_live_tab");
          const ok = raw2 === "teams" || raw2 === "structure" || raw2 === "reports" || raw2 === "referees" || raw2 === "codes" || raw2 === "monitor_groups" || raw2 === "monitor_bracket";
          const nextTab = ok ? raw2 : lastLiveTab;
          setTab(nextTab);
        }
      };
      const sortedTeams = useMemo6(() => {
        return [...state.teams || []].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
      }, [state.teams]);
      const allPlayers = useMemo6(() => {
        const out = [];
        (state.teams || []).forEach((team) => {
          const p1Id = resolvePlayerKey(state, getPlayerKey(team.player1, team.player1YoB ?? "ND"));
          const p2Id = resolvePlayerKey(state, getPlayerKey(team.player2, team.player2YoB ?? "ND"));
          const y12 = team.player1YoB ? String(team.player1YoB).slice(-2) : "ND";
          const y22 = team.player2YoB ? String(team.player2YoB).slice(-2) : "ND";
          out.push({ id: p1Id, name: team.player1, label: `${team.player1} (${y12})` });
          out.push({ id: p2Id, name: team.player2, label: `${team.player2} (${y22})` });
        });
        const seen = /* @__PURE__ */ new Set();
        return out.filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      }, [state.teams]);
      const getExistingTournamentMvpIds = () => {
        if (!state.tournament) return [];
        const tid = state.tournament.id;
        const fromHof = (state.hallOfFame || []).filter((e) => e.tournamentId === tid && e.type === "mvp").map((e) => e.playerId ? resolvePlayerKey(state, e.playerId) : void 0).filter(Boolean);
        if (fromHof.length) {
          const seen = /* @__PURE__ */ new Set();
          return fromHof.filter((id) => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        }
        return [];
      };
      const openMvpModal = (forArchive) => {
        if (!state.tournament) {
          alert(t("alert_no_live_selected"));
          return;
        }
        setMvpModalForArchive(forArchive);
        setMvpSearch("");
        setMvpSelectedIds(getExistingTournamentMvpIds());
        setMvpModalOpen(true);
      };
      const applyMvpsToState = (base, selectedIds) => {
        if (!base.tournament) return base;
        const selected = (selectedIds || []).map((id) => allPlayers.find((p) => p.id === id)).filter(Boolean);
        const payload = selected.map((p) => ({ name: p.name, id: p.id }));
        return setTournamentMvps(base, base.tournament.id, base.tournament.name, payload);
      };
      const handleArchive = () => {
        if (!state.tournament) {
          alert(t("alert_no_live_active"));
          return;
        }
        if (confirm(t("confirm_archive"))) {
          openMvpModal(true);
        }
      };
      const saveTeam = () => {
        if (!teamName.trim() || !p1.trim() || !p2.trim()) {
          alert(t("alert_fill_teamname_players"));
          return;
        }
        if (!editingId) {
          const k = teamName.trim().toLowerCase();
          const exists = (state.teams || []).some((tt) => (tt.name || "").trim().toLowerCase() === k);
          if (exists) {
            if (!confirm("Esiste gi\xE0 una squadra con questo nome. Vuoi inserirne un'altra uguale?")) return;
          }
        }
        const next = {
          id: editingId ?? uuid2(),
          name: teamName.trim(),
          player1: p1.trim(),
          player2: p2.trim(),
          player1YoB: y1 ? Number(y1) : void 0,
          player2YoB: y2 ? Number(y2) : void 0,
          player1IsReferee: p1IsReferee,
          player2IsReferee: p2IsReferee,
          isReferee: p1IsReferee || p2IsReferee || isReferee,
          createdAt: Date.now()
        };
        const idxProfiles = buildProfilesIndex(editingId || void 0);
        const conflicts = [];
        const c1 = makeAliasConflict(next.player1, next.player1YoB, idxProfiles);
        if (c1) conflicts.push(c1);
        const c2 = makeAliasConflict(next.player2, next.player2YoB, idxProfiles);
        if (c2) conflicts.push(c2);
        if (conflicts.length > 0) {
          setAliasModalTitle("Possibili omonimi (YoB diverso) \u2014 Squadre");
          setAliasModalConflicts(conflicts);
          setPendingTeamSave(next);
          setPendingScorersImport(null);
          setAliasModalOpen(true);
          return;
        }
        const teams = [...state.teams || []];
        const idx = teams.findIndex((t2) => t2.id === next.id);
        if (idx >= 0) teams[idx] = { ...teams[idx], ...next };
        else teams.push(next);
        setState({ ...state, teams });
        resetForm();
      };
      const closeAliasModal = () => {
        setAliasModalOpen(false);
        setAliasModalConflicts([]);
        setPendingTeamSave(null);
        setPendingScorersImport(null);
      };
      const confirmAliasModal = () => {
        const updates = {};
        (aliasModalConflicts || []).forEach((c) => {
          if (c.action === "merge" && c.targetKey) {
            updates[c.sourceKey] = c.targetKey;
          }
        });
        const nextAliases = { ...state.playerAliases || {}, ...updates };
        let nextState = { ...state, playerAliases: nextAliases };
        if (pendingTeamSave) {
          const teams = [...nextState.teams || []];
          const idx = teams.findIndex((t2) => t2.id === pendingTeamSave.id);
          if (idx >= 0) teams[idx] = { ...teams[idx], ...pendingTeamSave };
          else teams.push(pendingTeamSave);
          nextState = { ...nextState, teams };
          resetForm();
        }
        if (pendingScorersImport) {
          nextState = {
            ...nextState,
            integrationsScorers: [...nextState.integrationsScorers || [], ...pendingScorersImport.entries || []]
          };
        }
        setState(nextState);
        closeAliasModal();
      };
      const editTeam = (id) => {
        const t2 = (state.teams || []).find((x) => x.id === id);
        if (!t2) return;
        setEditingId(t2.id);
        setTeamName(t2.name || "");
        setP1(t2.player1 || "");
        setP2(t2.player2 || "");
        setY1(t2.player1YoB ? String(t2.player1YoB) : "");
        setY2(t2.player2YoB ? String(t2.player2YoB) : "");
        setP1IsReferee(!!t2.player1IsReferee || !!t2.isReferee && !t2.player2IsReferee);
        setP2IsReferee(!!t2.player2IsReferee);
        setIsReferee(!!t2.isReferee);
        setTab("teams");
      };
      const deleteTeam = (id) => {
        const t2 = (state.teams || []).find((x) => x.id === id);
        if (!t2) return;
        if (!confirm(`Eliminare la squadra "${t2.name}"?`)) return;
        setState({ ...state, teams: (state.teams || []).filter((x) => x.id !== id) });
      };
      const clearTeams = () => {
        if (!confirm("ATTENZIONE: stai per svuotare la lista iscritti (tutte le squadre). Continuare?")) return;
        setState({ ...state, teams: [] });
      };
      const exportTeamsXlsx = async () => {
        const XLSX = await getXLSX();
        const rows = (state.teams || []).map((t2) => ({
          Squadra: t2.name,
          Giocatore1: t2.player1,
          Anno1: t2.player1YoB ?? "",
          Arbitro1: t2.player1IsReferee ? "SI" : "NO",
          Giocatore2: t2.player2 ?? "",
          Anno2: t2.player2YoB ?? "",
          Arbitro2: t2.player2IsReferee ? "SI" : "NO",
          Arbitro: t2.player1IsReferee || t2.player2IsReferee || t2.isReferee ? "SI" : "NO"
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Squadre");
        XLSX.writeFile(wb, `flbp_squadre_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`);
      };
      const exportBackupJson = () => {
        try {
          const payload = JSON.stringify(state);
          const blob = new Blob([payload], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `flbp_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {
          alert(t("alert_export_backup_fail"));
        }
      };
      const importBackupJson = async (file) => {
        try {
          const txt = await file.text();
          const parsed = JSON.parse(txt);
          if (!confirm("Ripristinare il backup? Questa operazione sovrascriver\xE0 lo stato attuale (squadre, torneo, storico, integrazioni).")) return;
          setState(coerceAppState(parsed));
          alert(t("alert_backup_restored"));
        } catch (e) {
          alert(t("alert_backup_invalid"));
        }
      };
      const openPrintWindow = (title, bodyHtml) => {
        const w = window.open("", "_blank", "noopener,noreferrer");
        if (!w) {
          alert(t("alert_popup_blocked"));
          return;
        }
        w.document.open();
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
        <style>
          body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:16px;}
          h1{font-size:18px;margin:0 0 12px 0;}
          table{width:100%;border-collapse:collapse;}
          th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;vertical-align:top;}
          th{background:#f3f4f6;text-align:left;}
          .muted{color:#666;font-size:11px;margin-top:8px;}
        </style>
        </head><body><h1>${title}</h1>${bodyHtml}<div class="muted">Generato da FLBP Manager Suite</div></body></html>`);
        w.document.close();
        w.focus();
        w.print();
      };
      const printTeams = () => {
        const rows = (state.teams || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "it", { sensitivity: "base" }));
        const html = `<table><thead><tr><th>#</th><th>Squadra</th><th>Giocatore 1</th><th>Anno</th><th>Arb1</th><th>Giocatore 2</th><th>Anno</th><th>Arb2</th></tr></thead><tbody>
          ${rows.map((t2, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(t2.name || "")}</td>
            <td>${escapeHtml(t2.player1 || "")}</td>
            <td>${t2.player1YoB ?? ""}</td>
            <td>${t2.player1IsReferee ? "SI" : "NO"}</td>
            <td>${escapeHtml(t2.player2 || "")}</td>
            <td>${t2.player2YoB ?? ""}</td>
            <td>${t2.player2IsReferee ? "SI" : "NO"}</td>
          </tr>`).join("")}
        </tbody></table>`;
        openPrintWindow(`Lista Iscritti (${rows.length})`, html);
      };
      const printCodes = () => {
        const teamMap = new Map((state.teams || []).map((t2) => [t2.id, t2.name]));
        const ms = [...state.tournamentMatches || []].filter((m) => !m.hidden).filter((m) => {
          const ids = getMatchParticipantIds(m);
          return !ids.includes("BYE");
        }).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        const visible = codesStatusFilter === "all" ? ms : ms.filter((m) => m.status === codesStatusFilter);
        const html = `<table><thead><tr><th>Codice</th><th>Fase</th><th>Match</th><th>Score</th><th>Stato</th></tr></thead><tbody>
          ${visible.map((m) => {
          const ids = getMatchParticipantIds(m);
          const names = ids.map((id) => id ? teamMap.get(id) || id : "TBD");
          const matchLabel = names.join(" vs ");
          const scoreLabel = formatMatchScoreLabel(m);
          return `<tr>
              <td><b>${escapeHtml(m.code || "-")}</b></td>
              <td>${escapeHtml(m.phase || "-")}</td>
              <td>${escapeHtml(matchLabel)}</td>
              <td>${escapeHtml(scoreLabel)}</td>
              <td>${escapeHtml(m.status)}</td>
            </tr>`;
        }).join("")}
        </tbody></table>`;
        openPrintWindow(`Lista Codici (${visible.length})`, html);
      };
      const printBracket = () => {
        const teamMap = new Map((state.teams || []).map((t2) => [t2.id, t2.name]));
        const sourceMatches = state.tournamentMatches && state.tournamentMatches.length ? state.tournamentMatches : draft?.m || [];
        const ms = [...sourceMatches].filter((m) => m.phase === "bracket").sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        if (!ms.length) {
          alert(t("alert_no_bracket_print"));
          return;
        }
        const byRound = /* @__PURE__ */ new Map();
        for (const m of ms) {
          const key = m.roundName || `Round ${m.round ?? 0}`;
          if (!byRound.has(key)) byRound.set(key, []);
          byRound.get(key).push(m);
        }
        const sections = [...byRound.entries()].map(([round, list]) => {
          const rows = list.map((m) => {
            const aName = m.teamAId ? teamMap.get(m.teamAId) || m.teamAId : "TBD";
            const bName = m.teamBId ? teamMap.get(m.teamBId) || m.teamBId : "TBD";
            return `<tr>
                  <td><b>${escapeHtml(m.code || "-")}</b></td>
                  <td>${escapeHtml(aName)} vs ${escapeHtml(bName)}</td>
                  <td>${m.scoreA ?? 0}-${m.scoreB ?? 0}</td>
                  <td>${escapeHtml(m.status)}</td>
                </tr>`;
          }).join("");
          return `<h2 style="font-size:14px;margin:16px 0 8px 0;">${escapeHtml(round)}</h2>
              <table><thead><tr><th>Codice</th><th>Match</th><th>Score</th><th>Stato</th></tr></thead><tbody>${rows}</tbody></table>`;
        }).join("");
        openPrintWindow("Tabellone (Eliminazione Diretta)", sections);
      };
      const escapeHtml = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const parseSheetToTeams = (XLSX, ws) => {
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const keys = Object.keys(data[0] || {}).map((k) => k.toLowerCase());
        const looksLikeTeamRows = keys.some((k) => k.includes("giocatore1") || k.includes("giocatore 1"));
        if (looksLikeTeamRows) {
          return data.map((r) => {
            const name = (r.Squadra ?? r.squadra ?? "").toString().trim();
            const g1 = (r.Giocatore1 ?? r["Giocatore 1"] ?? r.giocatore1 ?? "").toString().trim();
            const g2 = (r.Giocatore2 ?? r["Giocatore 2"] ?? r.giocatore2 ?? "").toString().trim();
            if (!name || !g1 || !g2) return null;
            const a1 = Number(r.Anno1 ?? r["Anno 1"] ?? r.anno1 ?? "") || void 0;
            const a2 = Number(r.Anno2 ?? r["Anno 2"] ?? r.anno2 ?? "") || void 0;
            const arbTeamRaw = (r.Arbitro ?? r.arbitro ?? "").toString().toLowerCase();
            const arbTeam = arbTeamRaw === "si" || arbTeamRaw === "s\xEC" || arbTeamRaw === "true" || arbTeamRaw === "1" || arbTeamRaw === "x";
            const arb1Raw = (r.Arbitro1 ?? r["Arbitro 1"] ?? r.arbitro1 ?? "").toString().toLowerCase();
            const arb2Raw = (r.Arbitro2 ?? r["Arbitro 2"] ?? r.arbitro2 ?? "").toString().toLowerCase();
            const arb1 = arb1Raw === "si" || arb1Raw === "s\xEC" || arb1Raw === "true" || arb1Raw === "1" || arb1Raw === "x";
            const arb2 = arb2Raw === "si" || arb2Raw === "s\xEC" || arb2Raw === "true" || arb2Raw === "1" || arb2Raw === "x";
            const hasPerPlayer = !!(arb1Raw || arb2Raw);
            const p1Ref = hasPerPlayer ? arb1 : arbTeam ? true : false;
            const p2Ref = hasPerPlayer ? arb2 : false;
            return {
              id: uuid2(),
              name,
              player1: g1,
              player2: g2,
              player1YoB: a1,
              player2YoB: a2,
              player1IsReferee: p1Ref,
              player2IsReferee: p2Ref,
              isReferee: p1Ref || p2Ref || arbTeam,
              createdAt: Date.now()
            };
          }).filter(Boolean);
        }
        const map = /* @__PURE__ */ new Map();
        for (const r of data) {
          const squadra = (r.Squadra ?? r.squadra ?? r.Team ?? r.team ?? "").toString().trim();
          const nome = (r["Cognome Nome"] ?? r.Nome ?? r.nome ?? r.Giocatore ?? r.giocatore ?? "").toString().trim();
          if (!squadra || !nome) continue;
          const yob = Number(r.anno ?? r.Anno ?? r.YoB ?? r.yob ?? "") || void 0;
          const arbRaw = (r["Arbitro?"] ?? r.Arbitro ?? r.arbitro ?? "").toString().toLowerCase();
          const arb = arbRaw === "si" || arbRaw === "s\xEC" || arbRaw === "true" || arbRaw === "1" || arbRaw === "x";
          if (!map.has(squadra)) map.set(squadra, { players: [], isReferee: false });
          const entry = map.get(squadra);
          entry.players.push({ name: nome, yob, isReferee: arb });
          entry.isReferee = entry.isReferee || arb;
        }
        const teams = [];
        for (const [name, v] of map.entries()) {
          const pA = v.players[0];
          const pB = v.players[1];
          if (!pA || !pB) continue;
          teams.push({
            id: uuid2(),
            name,
            player1: pA.name,
            player2: pB.name,
            player1YoB: pA.yob,
            player2YoB: pB.yob,
            player1IsReferee: !!v.players?.[0]?.isReferee,
            player2IsReferee: !!v.players?.[1]?.isReferee,
            isReferee: v.isReferee || (v.players || []).some((p) => p.isReferee),
            createdAt: Date.now()
          });
        }
        return teams;
      };
      const importFile = async (file) => {
        const XLSX = await getXLSX();
        const ext = file.name.toLowerCase().split(".").pop();
        try {
          let teams = [];
          if (ext === "csv") {
            const text = await decodeCsvText(file);
            const sep = detectCsvSeparator(text);
            const rows = parseCsvRows(text, sep);
            const headers = (rows[0] || []).map((h) => (h ?? "").toString().trim());
            const json = rows.slice(1).map((cols) => {
              const r = {};
              headers.forEach((h, i) => r[h] = (cols[i] ?? "").toString().trim());
              return r;
            });
            const ws = XLSX.utils.json_to_sheet(json);
            teams = parseSheetToTeams(XLSX, ws);
          } else {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const first = wb.SheetNames[0];
            const ws = wb.Sheets[first];
            teams = parseSheetToTeams(XLSX, ws);
          }
          if (!teams.length) {
            alert(t("alert_import_failed_no_team"));
            return;
          }
          const existing = new Map((state.teams || []).map((t2) => [t2.name.trim().toLowerCase(), t2]));
          const merged = [...state.teams || []];
          const seen = /* @__PURE__ */ new Set();
          for (const t2 of teams) {
            const k = t2.name.trim().toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            if (!existing.has(k)) merged.push(t2);
          }
          setState({ ...state, teams: merged });
          alert(`Import completato: ${teams.length} squadre lette (${merged.length} totali).`);
        } catch (e) {
          console.error(e);
          alert(t("alert_import_error"));
        }
      };
      const importArchiveTeamsFile = async (file) => {
        const XLSX = await getXLSX();
        const ext = file.name.toLowerCase().split(".").pop();
        try {
          let teams = [];
          if (ext === "csv") {
            const text = await decodeCsvText(file);
            const sep = detectCsvSeparator(text);
            const rows = parseCsvRows(text, sep);
            const headers = (rows[0] || []).map((h) => (h ?? "").toString().trim());
            const json = rows.slice(1).map((cols) => {
              const r = {};
              headers.forEach((h, i) => r[h] = (cols[i] ?? "").toString().trim());
              return r;
            });
            const ws = XLSX.utils.json_to_sheet(json);
            teams = parseSheetToTeams(XLSX, ws);
          } else {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const first = wb.SheetNames[0];
            const ws = wb.Sheets[first];
            teams = parseSheetToTeams(XLSX, ws);
          }
          if (!teams.length) {
            alert(t("alert_import_failed_no_team"));
            return;
          }
          const existing = new Map((createArchiveTeams || []).map((t2) => [t2.name.trim().toLowerCase(), t2]));
          const merged = [...createArchiveTeams || []];
          const seen = /* @__PURE__ */ new Set();
          for (const t2 of teams) {
            const k = t2.name.trim().toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            if (!existing.has(k)) merged.push(t2);
          }
          setCreateArchiveTeams(merged);
          alert(`Import completato: ${teams.length} squadre lette (${merged.length} nel wizard).`);
        } catch (e) {
          console.error(e);
          alert(t("alert_import_error"));
        }
      };
      const genPool = (n) => {
        const teams = generateSimPoolTeams(n, state.teams || [], uuid2);
        setState({ ...state, teams: [...state.teams || [], ...teams] });
      };
      const addHomonyms = () => {
        const baseTeamName = `OMONIMI ${(/* @__PURE__ */ new Date()).toISOString().slice(11, 19).replace(/:/g, "")}`;
        const players = [
          { name: "Mario Rossi", yob: 1998 },
          { name: "Mario Rossi", yob: 2002 },
          { name: "Mario Rossi", yob: void 0 },
          { name: "Luca Bianchi", yob: 2001 },
          { name: "Luca Bianchi", yob: void 0 }
        ];
        const homonymTeams = [];
        for (let i = 0; i < 3; i++) {
          const a = players[i * 2] ?? players[0];
          const b = players[i * 2 + 1] ?? players[1];
          homonymTeams.push({
            id: uuid2(),
            name: `${baseTeamName} #${i + 1}`,
            player1: a.name,
            player2: b.name,
            player1YoB: a.yob,
            player2YoB: b.yob,
            player1IsReferee: i === 0,
            player2IsReferee: false,
            isReferee: i === 0,
            createdAt: Date.now()
          });
        }
        setState({ ...state, teams: [...state.teams || [], ...homonymTeams] });
        alert(t("alert_added_duplicate_test"));
      };
      const handleGenerate = () => {
        const teams = state.teams || [];
        if (teams.length < 2) {
          alert(t("alert_need_2_teams_generate"));
          return;
        }
        try {
          const { tournament, matches } = generateTournamentStructure(teams, {
            mode: tournMode,
            numGroups,
            advancingPerGroup: advancing,
            tournamentName: tournName,
            finalRoundRobin: tournMode !== "round_robin" && finalRrEnabled ? { enabled: true, topTeams: finalRrTopTeams } : void 0
          });
          setDraft({ t: tournament, m: matches });
        } catch (e) {
          console.error("Generazione fallita:", e);
          alert(t("alert_generation_error"));
        }
      };
      const handleStartLive = () => {
        if (!draft) return;
        if (state.tournament) {
          if (!confirm("Esiste gi\xE0 un torneo attivo. Confermi di volerlo archiviare per avviare quello nuovo?")) {
            return;
          }
        }
        const rawPw = window.prompt("Imposta la password per l'area arbitri (valida SOLO per questo live):", "") ?? "";
        const refereesPassword = rawPw.trim();
        if (!refereesPassword) {
          alert("Password area arbitri obbligatoria. Live non avviato.");
          return;
        }
        try {
          safeSessionRemove("flbp_ref_authed");
        } catch {
        }
        let newState = { ...state };
        if (newState.tournament) {
          newState = archiveTournamentV2(newState);
        }
        newState.tournament = { ...draft.t, refereesPassword };
        newState.tournamentMatches = draft.m;
        setState(newState);
        setDraft(null);
        setTab("codes");
        alert(t("alert_live_started"));
      };
      const handleActivateFinalRoundRobin = () => {
        if (!state.tournament) {
          alert("Nessun torneo live attivo.");
          return;
        }
        const ms = state.tournamentMatches || [];
        const status = getFinalRoundRobinActivationStatus(state.tournament, ms);
        if (!status.enabled) {
          alert("Girone Finale disabilitato nella struttura.");
          return;
        }
        if (status.activated) {
          alert("Girone Finale gi\xE0 attivo.");
          return;
        }
        if (!status.canActivate) {
          const msg = status.reason === "participants_not_determined" ? "Non posso attivare il Girone Finale: i partecipanti non sono ancora determinati (TBD)." : status.reason === "bye_in_participants" ? "Non posso attivare il Girone Finale: \xE8 presente un BYE tra i partecipanti (non ammesso)." : status.reason === "no_bracket_matches" ? "Non posso attivare il Girone Finale: il torneo non ha un tabellone." : "Non posso attivare il Girone Finale: condizioni non soddisfatte.";
          alert(msg);
          return;
        }
        const top = status.topTeams || (state.tournament.config?.finalRoundRobin?.topTeams || 4);
        if (!confirm(`Attivare ora il GIRONE FINALE (Top${top})?

Verranno generati i match all'italiana del Girone Finale.`)) return;
        const { tournament, matches } = activateFinalRoundRobinStage(state.tournament, ms);
        setState({ ...state, tournament, tournamentMatches: matches });
        alert("Girone Finale attivato.");
      };
      const toggleMatchStatus = (id) => {
        if (!state.tournament) return;
        const matches = [...state.tournamentMatches || []];
        const idx = matches.findIndex((m2) => m2.id === id);
        if (idx === -1) return;
        const m = matches[idx];
        if (m.status === "finished") return;
        const next = m.status === "playing" ? "scheduled" : "playing";
        matches[idx] = { ...m, status: next };
        setState({ ...state, tournamentMatches: matches });
      };
      const handleUpdateLiveMatch = (updated) => {
        const nextMatches = (state.tournamentMatches || []).map(
          (m) => m.id === updated.id ? { ...m, ...updated } : m
        );
        const nextTournament = state.tournament ? { ...state.tournament, matches: nextMatches } : state.tournament;
        setState({ ...state, tournament: nextTournament, tournamentMatches: nextMatches });
      };
      const handleUpdateTournamentAndMatches = (tournament, matches) => {
        setState({ ...state, tournament, tournamentMatches: matches });
      };
      const getTeamFromCatalog = (id) => {
        if (!id) return void 0;
        const catalog = state.tournament?.teams && state.tournament.teams.length ? state.tournament.teams : state.teams || [];
        return catalog.find((t2) => t2.id === id);
      };
      const getTeamName = (id) => {
        if (!id) return "TBD";
        if (id === "BYE") return "BYE";
        return getTeamFromCatalog(id)?.name || id;
      };
      const buildBracketRounds = (allMatches) => {
        const rounds = [];
        if (state.tournament?.rounds && state.tournament.rounds.length) {
          state.tournament.rounds.forEach((r) => rounds.push(r));
          return rounds;
        }
        const bracketMatches = (allMatches || []).filter((m) => m.phase === "bracket");
        const map = /* @__PURE__ */ new Map();
        bracketMatches.forEach((m) => {
          const r = m.round || 1;
          if (!map.has(r)) map.set(r, []);
          map.get(r).push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach((k) => rounds.push(map.get(k).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))));
        return rounds;
      };
      const findMatchPositionInRounds = (rounds, matchId) => {
        for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
          const round = rounds[rIdx] || [];
          for (let mIdx = 0; mIdx < round.length; mIdx++) {
            if (round[mIdx]?.id === matchId) return { rIdx, mIdx };
          }
        }
        return null;
      };
      const resolveWinnerTeamId = (m) => {
        if (!m) return void 0;
        if (m.teamAId === "BYE" && m.teamBId && m.teamBId !== "BYE") {
          if (String(m.teamBId).startsWith("TBD")) return void 0;
          return m.teamBId;
        }
        if (m.teamBId === "BYE" && m.teamAId && m.teamAId !== "BYE") {
          if (String(m.teamAId).startsWith("TBD")) return void 0;
          return m.teamAId;
        }
        if (m.status !== "finished") return void 0;
        if (m.scoreA > m.scoreB) {
          if (String(m.teamAId).startsWith("TBD")) return void 0;
          return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
          if (String(m.teamBId).startsWith("TBD")) return void 0;
          return m.teamBId;
        }
        return void 0;
      };
      const applyByeAutoWin = (m) => {
        if (!m) return m;
        if (m.status === "finished") return m;
        if (m.teamAId === "BYE" && m.teamBId && m.teamBId !== "BYE" && !String(m.teamBId).startsWith("TBD")) {
          return { ...m, played: true, status: "finished", scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamBId === "BYE" && m.teamAId && m.teamAId !== "BYE" && !String(m.teamAId).startsWith("TBD")) {
          return { ...m, played: true, status: "finished", scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamAId === "BYE" && m.teamBId === "BYE") {
          return { ...m, played: true, status: "finished", scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        return m;
      };
      const buildBracketRoundsFromMatches = (allMatches) => {
        const rounds = [];
        const bracketMatches = (allMatches || []).filter((m) => m.phase === "bracket");
        const map = /* @__PURE__ */ new Map();
        bracketMatches.forEach((m) => {
          const r = m.round || 1;
          if (!map.has(r)) map.set(r, []);
          map.get(r).push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach((k) => rounds.push(map.get(k).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))));
        return rounds;
      };
      const resolveWinnerTeamIdGeneric = (m) => {
        if (!m) return void 0;
        if (m.teamAId === "BYE" && m.teamBId && m.teamBId !== "BYE") return m.teamBId;
        if (m.teamBId === "BYE" && m.teamAId && m.teamAId !== "BYE") return m.teamAId;
        if (m.status !== "finished") return void 0;
        if (m.scoreA > m.scoreB) {
          if (String(m.teamAId).startsWith("TBD")) return void 0;
          return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
          if (String(m.teamBId).startsWith("TBD")) return void 0;
          return m.teamBId;
        }
        return void 0;
      };
      const autoFixBracketFromResults = (matches) => {
        let out = matches.map((m) => ({ ...m }));
        const rounds = buildBracketRoundsFromMatches(out);
        for (let r = 1; r < rounds.length; r++) {
          const ids = new Set(rounds[r].map((m) => m.id));
          out = out.map((x) => {
            if (!ids.has(x.id)) return x;
            const base = { ...x };
            delete base.teamAId;
            delete base.teamBId;
            return base;
          });
        }
        const byId = new Map(out.map((m) => [m.id, m]));
        const upsert = (u) => {
          byId.set(u.id, u);
          out = out.map((m) => m.id === u.id ? u : m);
        };
        for (let rIdx = 0; rIdx < rounds.length - 1; rIdx++) {
          const round = rounds[rIdx] || [];
          const nextRound = rounds[rIdx + 1] || [];
          for (let mIdx = 0; mIdx < round.length; mIdx++) {
            const cur = byId.get(round[mIdx].id) || round[mIdx];
            const winner = resolveWinnerTeamIdGeneric(cur);
            if (!winner || winner === "BYE") continue;
            const nextSkel = nextRound[Math.floor(mIdx / 2)];
            if (!nextSkel) continue;
            const next = byId.get(nextSkel.id) || nextSkel;
            const slot = mIdx % 2 === 0 ? "teamAId" : "teamBId";
            upsert(applyByeAutoWin({ ...next, [slot]: winner }));
          }
        }
        const recomputed = new Map(out.map((m) => [m.id, m]));
        out = out.map((m) => {
          if (m.phase !== "bracket") return m;
          if (m.status !== "finished") return m;
          const mm = recomputed.get(m.id);
          if (mm.teamAId !== m.teamAId || mm.teamBId !== m.teamBId) {
            return { ...mm, played: false, status: "scheduled", scoreA: 0, scoreB: 0, stats: void 0 };
          }
          return m;
        });
        return autoResolveBracketByes(out);
      };
      const computeAwardsFromArchive = (tournament, matches) => {
        const year = new Date(tournament.startDate).getFullYear().toString();
        const teams = tournament.teams || [];
        const entries = [];
        const isByeTeam2 = (t2) => String(t2?.id || "").toUpperCase() === "BYE" || !!t2?.isBye || !!t2?.hidden;
        const isFinalGroupName3 = (name) => /\bfinale?\b/i.test(String(name || ""));
        const isFinalGroup3 = (g) => !!g && (g.stage === "final" || isFinalGroupName3(g.name));
        const getUniqueLeaderFromGroup2 = (groupName, groupTeams) => {
          const gMatchesAll = (matches || []).filter((m) => m.phase === "groups" && (m.groupName || "") === groupName && !m.hidden && !m.isBye);
          if (!gMatchesAll.length) return void 0;
          const base = gMatchesAll.filter((m) => !m.isTieBreak);
          if (!base.length) return void 0;
          if (!base.every((m) => m.status === "finished")) return void 0;
          if (gMatchesAll.some((m) => m.isTieBreak && m.status !== "finished")) return void 0;
          const visibleTeams = (groupTeams || []).filter((t2) => !isByeTeam2(t2) && !t2.isReferee);
          if (visibleTeams.length < 2) return void 0;
          const finished = gMatchesAll.filter((m) => m.status === "finished");
          const { rows, rankedTeams } = computeGroupStandings({ teams: visibleTeams, matches: finished });
          if (!rankedTeams.length) return void 0;
          if (rankedTeams.length < 2) return rankedTeams[0]?.id;
          const top = rankedTeams[0];
          const second = rankedTeams[1];
          if (!top || !second) return void 0;
          const key = (id) => {
            const r = rows[id] || {};
            return [r.points ?? 0, r.cupsDiff ?? 0, r.blowDiff ?? 0, r.cupsFor ?? 0];
          };
          const k1 = key(top.id);
          const k2 = key(second.id);
          const tied = k1[0] === k2[0] && k1[1] === k2[1] && k1[2] === k2[2] && k1[3] === k2[3];
          if (tied) return void 0;
          return top.id;
        };
        let winnerTeamId;
        const finalRrActivated = !!tournament.config?.finalRoundRobin?.activated;
        const finalGroup = (tournament.groups || []).find((g) => isFinalGroup3(g));
        if (finalRrActivated && finalGroup) {
          winnerTeamId = getUniqueLeaderFromGroup2(finalGroup.name, finalGroup.teams || []);
        } else if (tournament.type === "round_robin") {
          const group = (tournament.groups || [])[0];
          const groupName = group?.name || "Girone Unico";
          const groupTeams = group?.teams || (tournament.teams || []);
          winnerTeamId = getUniqueLeaderFromGroup2(groupName, groupTeams);
        }
        if (!winnerTeamId) {
          const bracket = (matches || []).filter((m) => m.phase === "bracket");
          const maxRound = bracket.reduce((acc, m) => Math.max(acc, m.round || 0), 0);
          const finalMatch = bracket.filter((m) => (m.round || 0) === maxRound).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0];
          winnerTeamId = finalMatch ? resolveWinnerTeamIdGeneric(finalMatch) : void 0;
        }
        if (winnerTeamId && winnerTeamId !== "BYE") {
          const team = teams.find((tt) => tt.id === winnerTeamId);
          entries.push({
            id: `${tournament.id}_winner`,
            year,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            type: "winner",
            teamName: team?.name || winnerTeamId,
            playerNames: team ? [team.player1, team.player2].filter(Boolean) : []
          });
        }
        const normalizeName3 = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");
        const agg = {};
        (matches || []).forEach((m) => {
          if (m.status !== "finished") return;
          if (!m.stats) return;
          m.stats.forEach((s) => {
            const team = teams.find((tt) => tt.id === s.teamId);
            const yob = team ? team.player1 === s.playerName ? team.player1YoB : team.player2YoB : void 0;
            const key = `${normalizeName3(s.playerName)}_${yob || "ND"}`;
            if (!agg[key]) agg[key] = { name: s.playerName, yob, points: 0, soffi: 0, games: 0 };
            agg[key].points += s.canestri || 0;
            agg[key].soffi += s.soffi || 0;
            agg[key].games += 1;
          });
        });
        const players = Object.values(agg).filter((p) => p.games > 0);
        const pickMax = (arr, scoreFn) => {
          return arr.slice().sort((a, b) => {
            const sa = scoreFn(a), sb = scoreFn(b);
            if (sb !== sa) return sb - sa;
            if (b.points !== a.points) return b.points - a.points;
            if (b.soffi !== a.soffi) return b.soffi - a.soffi;
            return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
          })[0];
        };
        const topScorer = pickMax(players, (p) => p.points);
        if (topScorer && topScorer.points > 0) entries.push({ id: `${tournament.id}_top_scorer`, year, tournamentId: tournament.id, tournamentName: tournament.name, type: "top_scorer", playerNames: [topScorer.name], value: topScorer.points, playerId: getPlayerKey(topScorer.name, topScorer.yob ?? "ND") });
        const defender = pickMax(players, (p) => p.soffi);
        if (defender && defender.soffi > 0) entries.push({ id: `${tournament.id}_defender`, year, tournamentId: tournament.id, tournamentName: tournament.name, type: "defender", playerNames: [defender.name], value: defender.soffi, playerId: getPlayerKey(defender.name, defender.yob ?? "ND") });
        const u25Players = players.filter((p) => isU25(p.yob));
        const topScorerU25 = pickMax(u25Players, (p) => p.points);
        if (topScorerU25 && topScorerU25.points > 0) entries.push({ id: `${tournament.id}_top_scorer_u25`, year, tournamentId: tournament.id, tournamentName: tournament.name, type: "top_scorer_u25", playerNames: [topScorerU25.name], value: topScorerU25.points, playerId: getPlayerKey(topScorerU25.name, topScorerU25.yob ?? "ND") });
        const defenderU25 = pickMax(u25Players, (p) => p.soffi);
        if (defenderU25 && defenderU25.soffi > 0) entries.push({ id: `${tournament.id}_defender_u25`, year, tournamentId: tournament.id, tournamentName: tournament.name, type: "defender_u25", playerNames: [defenderU25.name], value: defenderU25.soffi, playerId: getPlayerKey(defenderU25.name, defenderU25.yob ?? "ND") });
        return entries;
      };
      const propagateWinnerFromMatch = (finishedMatch, matches) => {
        const rounds = buildBracketRounds(matches);
        const pos = findMatchPositionInRounds(rounds, finishedMatch.id);
        if (!pos) return matches;
        let rIdx = pos.rIdx;
        let mIdx = pos.mIdx;
        let current = finishedMatch;
        let out = [...matches];
        const byId = new Map(out.map((m) => [m.id, m]));
        const upsert = (u) => {
          byId.set(u.id, u);
          out = out.map((m) => m.id === u.id ? u : m);
        };
        while (true) {
          const winner = resolveWinnerTeamId(current);
          if (!winner || winner === "BYE") break;
          const nextRound = rounds[rIdx + 1];
          if (!nextRound || nextRound.length === 0) break;
          const nextSkel = nextRound[Math.floor(mIdx / 2)];
          if (!nextSkel) break;
          const next = byId.get(nextSkel.id) || nextSkel;
          const slot = mIdx % 2 === 0 ? "teamAId" : "teamBId";
          if (next[slot]) break;
          let nextUpdated = { ...next, [slot]: winner };
          const beforeStatus = nextUpdated.status;
          nextUpdated = applyByeAutoWin(nextUpdated);
          upsert(nextUpdated);
          if (beforeStatus !== "finished" && nextUpdated.status === "finished") {
            current = nextUpdated;
            rIdx = rIdx + 1;
            mIdx = Math.floor(mIdx / 2);
            continue;
          }
          break;
        }
        return out;
      };
      const replaceMatch = (matches, updated) => {
        return matches.map((m) => m.id === updated.id ? { ...m, ...updated } : m);
      };
      const autoResolveBracketByes = (matches) => {
        let out = [...matches];
        let changed = true;
        let guard = 0;
        while (changed && guard < 2e3) {
          guard++;
          changed = false;
          for (const m of out) {
            if (m.phase !== "bracket") continue;
            if (m.status === "finished") continue;
            const after = applyByeAutoWin(m);
            const didChange = after.status !== m.status || after.scoreA !== m.scoreA || after.scoreB !== m.scoreB || after.played !== m.played;
            if (after.status === "finished" && didChange) {
              out = replaceMatch(out, after);
              out = propagateWinnerFromMatch(after, out);
              changed = true;
            }
          }
        }
        return out;
      };
      const simulateFinishMatch = (m, matches) => {
        if (m.teamIds && m.teamIds.length >= 2) {
          const ids = (m.teamIds || []).filter(Boolean);
          if (ids.includes("BYE")) return matches;
          const ts = ids.map((id) => getTeamFromCatalog(id)).filter(Boolean);
          if (ts.length < 2) return matches;
          const res2 = simulateMultiMatchResult(m, ts);
          const scores = res2.scoresByTeam || {};
          const ordered = Object.values(scores).sort((a, b) => b - a);
          const updated2 = {
            ...m,
            scoresByTeam: scores,
            // Keep legacy fields populated for any UI still expecting 1v1.
            scoreA: ordered[0] ?? 0,
            scoreB: ordered[1] ?? 0,
            stats: res2.stats,
            played: true,
            status: "finished"
          };
          let out2 = replaceMatch(matches, updated2);
          return out2;
        }
        const teamA = getTeamFromCatalog(m.teamAId);
        const teamB = getTeamFromCatalog(m.teamBId);
        if (!teamA || !teamB) return matches;
        if (m.teamAId === "BYE" || m.teamBId === "BYE") return matches;
        const res = simulateMatchResult(m, teamA, teamB);
        const updated = {
          ...m,
          scoreA: res.scoreA,
          scoreB: res.scoreB,
          stats: res.stats,
          played: true,
          status: "finished"
        };
        let out = replaceMatch(matches, updated);
        if (updated.phase === "bracket") {
          out = propagateWinnerFromMatch(updated, out);
        }
        return out;
      };
      const handleSimulateTurn = () => {
        if (!state.tournament) {
          alert(t("alert_no_live_active"));
          return;
        }
        if (simBusy) return;
        setSimBusy(true);
        try {
          let matches = autoResolveBracketByes([...state.tournamentMatches || []]);
          const groupPending = matches.filter((m) => m.phase === "groups" && m.status !== "finished").filter((m) => m.teamIds && m.teamIds.length >= 2 || !!m.teamAId && !!m.teamBId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          if (groupPending.length) {
            const picked = [];
            const seen = /* @__PURE__ */ new Set();
            for (const m of groupPending) {
              const g = m.groupName || "";
              if (seen.has(g)) continue;
              seen.add(g);
              picked.push(m);
            }
            picked.forEach((m) => {
              matches = simulateFinishMatch(m, matches);
            });
            matches = syncBracketFromGroups(state.tournament, matches);
            matches = ensureFinalTieBreakIfNeeded(state.tournament, matches);
            matches = autoResolveBracketByes(matches);
          } else {
            const bracketPending = matches.filter((m) => m.phase === "bracket" && m.status !== "finished").sort((a, b) => (a.round ?? 1) - (b.round ?? 1) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            const eligible = bracketPending.filter((m) => !!m.teamAId && !!m.teamBId);
            if (!eligible.length) {
              alert(t("alert_no_match_simulable"));
              setState({ ...state, tournamentMatches: matches });
              return;
            }
            const minRound = Math.min(...eligible.map((m) => m.round || 1));
            const roundMatches = bracketPending.filter((m) => (m.round || 1) === minRound);
            roundMatches.forEach((m) => {
              const after = applyByeAutoWin(m);
              if (after.status === "finished") {
                matches = replaceMatch(matches, after);
                matches = propagateWinnerFromMatch(after, matches);
                return;
              }
              matches = simulateFinishMatch(m, matches);
            });
            matches = autoResolveBracketByes(matches);
          }
          setState({ ...state, tournamentMatches: matches });
        } finally {
          setSimBusy(false);
        }
      };
      const handleSimulateAll = () => {
        if (!state.tournament) {
          alert(t("alert_no_live_active"));
          return;
        }
        if (simBusy) return;
        if (!confirm("Simulare tutte le partite rimanenti?")) return;
        setSimBusy(true);
        try {
          let matches = autoResolveBracketByes([...state.tournamentMatches || []]);
          const groupPending = matches.filter((m) => m.phase === "groups" && m.status !== "finished").filter((m) => m.teamIds && m.teamIds.length >= 2 || !!m.teamAId && !!m.teamBId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          groupPending.forEach((m) => {
            matches = simulateFinishMatch(m, matches);
          });
          matches = syncBracketFromGroups(state.tournament, matches);
          matches = ensureFinalTieBreakIfNeeded(state.tournament, matches);
          matches = autoResolveBracketByes(matches);
          let guard = 0;
          while (guard < 5e3) {
            guard++;
            matches = autoResolveBracketByes(matches);
            const eligible = matches.filter((m) => m.phase === "bracket" && m.status !== "finished").filter((m) => !!m.teamAId && !!m.teamBId);
            if (!eligible.length) break;
            const minRound = Math.min(...eligible.map((m) => m.round || 1));
            const roundMatches = eligible.filter((m) => (m.round || 1) === minRound).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            let progressed = false;
            for (const m of roundMatches) {
              const before = m.status;
              const after = applyByeAutoWin(m);
              if (after.status === "finished") {
                matches = replaceMatch(matches, after);
                matches = propagateWinnerFromMatch(after, matches);
                progressed = true;
                continue;
              }
              const nextMatches = simulateFinishMatch(m, matches);
              if (nextMatches !== matches || before !== "finished") progressed = true;
              matches = nextMatches;
            }
            if (!progressed) break;
          }
          matches = autoResolveBracketByes(matches);
          setState({ ...state, tournamentMatches: matches });
        } finally {
          setSimBusy(false);
        }
      };
      const initReportFormFromMatch = (m) => {
        setReportMatchId(m.id);
        setReportStatus(m.status || "finished");
        if (m.teamIds && m.teamIds.length >= 2) {
          const vals = Object.values(m.scoresByTeam || {}).sort((a, b) => b - a);
          setReportScoreA(String(vals[0] ?? 0));
          setReportScoreB(String(vals[1] ?? 0));
        } else {
          setReportScoreA(String(m.scoreA ?? 0));
          setReportScoreB(String(m.scoreB ?? 0));
        }
        const nextForm = {};
        const participantIds = m.teamIds && m.teamIds.length ? m.teamIds || [] : [m.teamAId, m.teamBId].filter(Boolean);
        const participantTeams = participantIds.filter((id) => id && id !== "BYE").map((id) => getTeamFromCatalog(id)).filter(Boolean);
        const getKey = (teamId, playerName) => `${teamId}||${playerName}`;
        const existing = /* @__PURE__ */ new Map();
        (m.stats || []).forEach((s) => {
          const k = getKey(s.teamId, s.playerName);
          existing.set(k, { canestri: s.canestri || 0, soffi: s.soffi || 0 });
        });
        const seedPlayer = (teamId, playerName) => {
          if (!teamId || !playerName) return;
          if (teamId === "BYE") return;
          const k = getKey(teamId, playerName);
          const v = existing.get(k) || { canestri: 0, soffi: 0 };
          nextForm[k] = { canestri: String(v.canestri ?? 0), soffi: String(v.soffi ?? 0) };
        };
        participantTeams.forEach((tt) => {
          seedPlayer(tt?.id, tt?.player1);
          seedPlayer(tt?.id, tt?.player2);
        });
        setReportStatsForm(nextForm);
      };
      const handlePickReportMatch = (id) => {
        const m = (state.tournamentMatches || []).find((mm) => mm.id === id);
        if (!m) return;
        initReportFormFromMatch(m);
        setReportImageUrl("");
      };
      const openReportFromCodes = (id) => {
        setTab("reports");
        handlePickReportMatch(id);
      };
      const handleReportFile = async (file) => {
        setReportImageBusy(true);
        try {
          const aligned = await preprocessRefertoToAlignedCanvas(file);
          const url = aligned.toDataURL("image/jpeg", 0.92);
          setReportImageUrl(url);
          setReportOcrText("");
          setReportOcrBusy(true);
          try {
            const text = await ocrTextFromAlignedCanvas(aligned);
            setReportOcrText(text || "");
            const cleaned = String(text || "").replace(/\r/g, "\n");
            const codeMatch = cleaned.match(/\b([GBE]\d{1,4})\b/i);
            if (codeMatch) {
              const code = codeMatch[1].toUpperCase();
              const mByCode = (state.tournamentMatches || []).find((mm) => (mm.code || "").toUpperCase() === code);
              if (mByCode) {
                initReportFormFromMatch(mByCode);
              }
            }
            const scoreMatch = cleaned.match(/\b(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/);
            if (scoreMatch) {
              setReportScoreA(scoreMatch[1]);
              setReportScoreB(scoreMatch[2]);
              setReportStatus("finished");
            }
          } finally {
            setReportOcrBusy(false);
          }
        } catch (e) {
          console.error(e);
          alert("Errore durante la preparazione immagine referto. Prova un'altra foto.");
        } finally {
          setReportImageBusy(false);
        }
      };
      const handleSaveReport = () => {
        if (!state.tournament) {
          alert(t("alert_no_live_active"));
          return;
        }
        const matches = [...state.tournamentMatches || []];
        const idx = matches.findIndex((m) => m.id === reportMatchId);
        if (idx === -1) {
          alert(t("alert_select_match"));
          return;
        }
        const base = matches[idx];
        const computeTeamScore = (team) => {
          if (!team?.id || team.id === "BYE") return 0;
          const getCan = (playerName) => {
            if (!playerName) return 0;
            const k = `${team.id}||${playerName}`;
            const f = reportStatsForm[k] || { canestri: "0", soffi: "0" };
            return Math.max(0, parseInt(f.canestri || "0", 10) || 0);
          };
          return getCan(team.player1) + getCan(team.player2);
        };
        const isMulti = base.teamIds && base.teamIds.length >= 2;
        const participantIds = isMulti ? (base.teamIds || []).filter(Boolean) : [base.teamAId, base.teamBId].filter(Boolean);
        const participantTeams = participantIds.filter((id) => id && id !== "BYE").map((id) => getTeamFromCatalog(id)).filter(Boolean);
        const scoresByTeam = {};
        participantTeams.forEach((tt) => {
          scoresByTeam[tt.id] = computeTeamScore(tt);
        });
        const isByeMatch = participantIds.includes("BYE");
        if (!isByeMatch) {
          const vals = Object.values(scoresByTeam);
          const max = vals.length ? Math.max(...vals) : 0;
          const leaders = Object.keys(scoresByTeam).filter((id) => (scoresByTeam[id] || 0) === max);
          if (leaders.length !== 1) {
            alert(t("alert_tie_not_allowed") || "Pareggio non ammesso: inserisci lo spareggio nei canestri dei giocatori.");
            return;
          }
        }
        const orderedScores = Object.values(scoresByTeam).sort((a, b) => b - a);
        const updated = {
          ...base,
          scoresByTeam: isMulti ? scoresByTeam : base.scoresByTeam,
          // Legacy fields for 1v1 UI + some older components.
          scoreA: isMulti ? orderedScores[0] ?? 0 : scoresByTeam[base.teamAId || ""] ?? 0,
          scoreB: isMulti ? orderedScores[1] ?? 0 : scoresByTeam[base.teamBId || ""] ?? 0,
          // Salvataggio referto = match concluso (ma sempre modificabile riaprendo il referto).
          status: "finished",
          played: true
        };
        const nextStats = [];
        const pushStat = (teamId, playerName) => {
          if (!teamId || !playerName) return;
          if (teamId === "BYE") return;
          const k = `${teamId}||${playerName}`;
          const f = reportStatsForm[k] || { canestri: "0", soffi: "0" };
          nextStats.push({
            teamId,
            playerName,
            canestri: Math.max(0, parseInt(f.canestri || "0", 10) || 0),
            soffi: Math.max(0, parseInt(f.soffi || "0", 10) || 0)
          });
        };
        const teamsForStats = isMulti ? participantTeams : [getTeamFromCatalog(updated.teamAId), getTeamFromCatalog(updated.teamBId)].filter(Boolean);
        if (updated.status === "finished") {
          teamsForStats.forEach((tt) => {
            pushStat(tt?.id, tt?.player1);
            pushStat(tt?.id, tt?.player2);
          });
          updated.stats = nextStats.length ? nextStats : updated.stats;
        }
        matches[idx] = updated;
        let finalMatches = matches;
        if (updated.phase === "groups" && state.tournament?.type === "groups_elimination") {
          finalMatches = syncBracketFromGroups(state.tournament, finalMatches);
          finalMatches = autoResolveBracketByes(finalMatches);
        }
        if (updated.phase === "groups" && state.tournament) {
          finalMatches = ensureFinalTieBreakIfNeeded(state.tournament, finalMatches);
        }
        if (updated.phase === "bracket" && updated.status === "finished") {
          finalMatches = propagateWinnerFromMatch(updated, finalMatches);
        }
        setState({ ...state, tournamentMatches: finalMatches });
        alert(t("alert_report_saved"));
      };
      if (!authed) {
        const doAdminLogin = () => {
          safeSessionSet("flbp_admin_authed", "1");
          setAuthed(true);
        };
        return /* @__PURE__ */ jsx36("div", { className: "animate-fade-in", children: /* @__PURE__ */ jsx36("div", { className: "min-h-[60vh] flex items-center justify-center", children: /* @__PURE__ */ jsxs36("div", { className: "w-full max-w-xl", children: [
          /* @__PURE__ */ jsxs36("div", { className: "rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-xl", children: [
            /* @__PURE__ */ jsx36("div", { className: "bg-gradient-to-r from-slate-950 to-slate-800 text-white p-6", children: /* @__PURE__ */ jsxs36("div", { className: "flex items-start gap-3", children: [
              /* @__PURE__ */ jsx36("div", { className: "p-3 rounded-2xl bg-white/10 border border-white/10", children: /* @__PURE__ */ jsx36(ShieldCheck2, { className: "w-6 h-6 text-beer-500", "aria-hidden": true }) }),
              /* @__PURE__ */ jsxs36("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsx36("div", { className: "text-xs font-black uppercase tracking-wider text-white/70", children: "FLBP Manager Suite" }),
                /* @__PURE__ */ jsx36("h2", { className: "text-2xl md:text-3xl font-black tracking-tight leading-tight", children: t("admin") }),
                /* @__PURE__ */ jsx36("p", { className: "text-sm font-semibold text-white/75 mt-1", children: "Accesso operativo per gestione live, referti e dati storici." })
              ] })
            ] }) }),
            /* @__PURE__ */ jsxs36("div", { className: "p-6 space-y-4", children: [
              /* @__PURE__ */ jsx36("p", { className: "text-slate-600 text-sm font-semibold", children: t("admin_auth_desc") }),
              !sessionStorageWritable ? /* @__PURE__ */ jsxs36("div", { className: "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900", children: [
                /* @__PURE__ */ jsx36("div", { className: "font-black", children: "\u26A0\uFE0F Storage del browser bloccato" }),
                /* @__PURE__ */ jsxs36("div", { className: "text-sm font-semibold opacity-90 mt-1", children: [
                  "Il tuo browser sembra bloccare ",
                  /* @__PURE__ */ jsx36("span", { className: "font-black", children: "sessionStorage" }),
                  ". L'accesso pu\xF2 funzionare, ma potrebbe non restare attivo dopo un refresh."
                ] })
              ] }) : null,
              supabaseEmail ? /* @__PURE__ */ jsxs36("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4", children: [
                /* @__PURE__ */ jsxs36("div", { className: "text-sm font-bold text-emerald-900", children: [
                  "Supabase attivo: ",
                  /* @__PURE__ */ jsx36("span", { className: "font-black", children: supabaseEmail || "sessione attiva" })
                ] }),
                /* @__PURE__ */ jsx36(
                  "button",
                  {
                    type: "button",
                    onClick: async () => {
                      if (!confirm("Vuoi fare logout da Supabase?")) return;
                      await signOutSupabase();
                      safeSessionRemove("flbp_admin_authed");
                      setAuthed(false);
                      window.location.reload();
                    },
                    className: "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-black border border-emerald-300 text-emerald-900 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50 focus-visible:ring-offset-2",
                    children: "Logout Supabase"
                  }
                )
              ] }) : null,
              /* @__PURE__ */ jsxs36("div", { className: "grid grid-cols-1 gap-2", children: [
                /* @__PURE__ */ jsx36("label", { className: "text-xs font-black uppercase tracking-wider text-slate-500", htmlFor: "admin-pass", children: t("admin_password_placeholder") }),
                /* @__PURE__ */ jsxs36("div", { className: "flex flex-col sm:flex-row gap-2", children: [
                  /* @__PURE__ */ jsx36(
                    "input",
                    {
                      id: "admin-pass",
                      type: "password",
                      value: adminLoginPassword,
                      onChange: (e) => setAdminLoginPassword(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === "Enter") doAdminLogin();
                      },
                      placeholder: t("admin_password_placeholder"),
                      autoComplete: "current-password",
                      className: "flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                    }
                  ),
                  /* @__PURE__ */ jsxs36(
                    "button",
                    {
                      type: "button",
                      onClick: doAdminLogin,
                      className: "inline-flex items-center justify-center gap-2 bg-blue-700 text-white px-5 py-3 rounded-xl font-black hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2",
                      children: [
                        /* @__PURE__ */ jsx36(CheckCircle26, { className: "w-5 h-5", "aria-hidden": true }),
                        t("admin_login")
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs36("div", { className: "text-xs text-slate-500 font-semibold", children: [
                  "Password al momento ",
                  /* @__PURE__ */ jsx36("span", { className: "font-black", children: "opzionale" }),
                  ". Premi \u201C",
                  t("admin_login"),
                  "\u201D per entrare."
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx36("div", { className: "mt-4 text-center text-xs text-slate-400 font-semibold", children: "Suggerimento: usa il menu (in alto a sinistra) per tornare rapidamente alle sezioni pubbliche." })
        ] }) }) });
      }
      const monitorBracketTabProps = {
        state,
        simBusy,
        handleSimulateTurn,
        handleSimulateAll,
        handleUpdateLiveMatch,
        handleUpdateTournamentAndMatches,
        getTeamName,
        openReportFromCodes,
        toggleMatchStatus,
        handleActivateFinalRoundRobin
      };
      const dataTabProps = {
        state,
        setState,
        t,
        dataSubTab,
        setDataSubTab,
        integrationsSubTab,
        setIntegrationsSubTab,
        aliasesSearch,
        setAliasesSearch,
        aliasToolSelections,
        setAliasToolSelections,
        buildProfilesIndex,
        setAlias,
        removeAlias,
        dataSelectedTournamentId,
        setDataSelectedTournamentId,
        dataSelectedMatchId,
        setDataSelectedMatchId,
        dataScoreA,
        setDataScoreA,
        dataScoreB,
        setDataScoreB,
        dataStatus,
        setDataStatus,
        dataRecomputeAwards,
        setDataRecomputeAwards,
        dataWinnerTeamId,
        setDataWinnerTeamId,
        dataTopScorerPlayerId,
        setDataTopScorerPlayerId,
        dataDefenderPlayerId,
        setDataDefenderPlayerId,
        dataMvpPlayerId,
        setDataMvpPlayerId,
        dataTopScorerU25PlayerId,
        setDataTopScorerU25PlayerId,
        dataDefenderU25PlayerId,
        setDataDefenderU25PlayerId,
        hofEditId,
        setHofEditId,
        hofEditTournamentId,
        setHofEditTournamentId,
        hofYear,
        setHofYear,
        hofTournamentName,
        setHofTournamentName,
        hofType,
        setHofType,
        hofTeamName,
        setHofTeamName,
        hofWinnerP1,
        setHofWinnerP1,
        hofWinnerP2,
        setHofWinnerP2,
        hofPlayerName,
        setHofPlayerName,
        hofPlayerYoB,
        setHofPlayerYoB,
        hofValue,
        setHofValue,
        scorersImportWarnings,
        setScorersImportWarnings,
        setPendingScorersImport,
        setAliasModalOpen,
        setAliasModalTitle,
        setAliasModalConflicts,
        scorersFileRef,
        createArchiveOpen,
        createArchiveStep,
        setCreateArchiveStep,
        createArchiveName,
        setCreateArchiveName,
        createArchiveDate,
        setCreateArchiveDate,
        createArchiveMode,
        setCreateArchiveMode,
        createArchiveGroups,
        setCreateArchiveGroups,
        createArchiveAdvancing,
        setCreateArchiveAdvancing,
        createArchiveFinalRrEnabled,
        setCreateArchiveFinalRrEnabled,
        createArchiveFinalRrTopTeams,
        setCreateArchiveFinalRrTopTeams,
        createArchiveTeams,
        createArchiveFileRef,
        caTeamName,
        setCaTeamName,
        caP1,
        setCaP1,
        caY1,
        setCaY1,
        caP2,
        setCaP2,
        caY2,
        setCaY2,
        caP1IsRef,
        setCaP1IsRef,
        caP2IsRef,
        setCaP2IsRef,
        openCreateArchiveWizard,
        resetCreateArchiveWizard,
        copyLiveTeamsIntoWizard,
        importArchiveTeamsFile,
        addWizardTeam,
        createArchivedTournament,
        removeWizardTeam,
        autoFixBracketFromResults,
        computeAwardsFromArchive
      };
      return /* @__PURE__ */ jsxs36("div", { className: "space-y-6 animate-fade-in", children: [
        /* @__PURE__ */ jsxs36("div", { className: "bg-white p-6 rounded-xl shadow-sm border border-slate-200", children: [
          /* @__PURE__ */ jsxs36("div", { className: "flex flex-col gap-4", children: [
            /* @__PURE__ */ jsxs36("div", { className: "flex flex-col md:flex-row md:items-start md:justify-between gap-3", children: [
              /* @__PURE__ */ jsxs36("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsxs36("div", { className: "flex flex-col sm:flex-row sm:items-center gap-3", children: [
                  /* @__PURE__ */ jsx36("h2", { className: "text-2xl font-black flex items-center gap-2", children: t("admin") }),
                  /* @__PURE__ */ jsxs36("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsxs36(
                      "button",
                      {
                        onClick: () => switchAdminSection("live"),
                        className: `px-4 py-2 rounded-xl font-black flex items-center gap-2 border ${adminSection === "live" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                        children: [
                          /* @__PURE__ */ jsx36(PlayCircle2, { className: "w-4 h-4" }),
                          " ",
                          t("admin_live_management")
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsxs36(
                      "button",
                      {
                        onClick: () => switchAdminSection("data"),
                        className: `px-4 py-2 rounded-xl font-black flex items-center gap-2 border ${adminSection === "data" ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`,
                        children: [
                          /* @__PURE__ */ jsx36(Settings5, { className: "w-4 h-4" }),
                          " ",
                          t("admin_data_management")
                        ]
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsx36("div", { className: "text-sm text-slate-500 font-bold", children: adminSection === "live" ? t("admin_live_desc") : t("admin_data_desc") })
              ] }),
              /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
                /* @__PURE__ */ jsx36("div", { className: "text-xs font-black px-2 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200", children: supabaseEmail ? /* @__PURE__ */ jsxs36(Fragment15, { children: [
                  "Supabase",
                  supabaseEmail ? `: ${supabaseEmail}` : ""
                ] }) : /* @__PURE__ */ jsx36(Fragment15, { children: "Locale" }) }),
                /* @__PURE__ */ jsx36(
                  "div",
                  {
                    className: `text-xs font-black px-2 py-1 rounded-full border ${swDisabled ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-blue-50 text-blue-800 border-blue-200"}`,
                    title: "Stato cache offline (service worker)",
                    children: swDisabled ? "CACHE OFF" : "CACHE ON"
                  }
                ),
                /* @__PURE__ */ jsxs36("details", { className: "relative", children: [
                  /* @__PURE__ */ jsxs36("summary", { className: "list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 text-slate-800 px-3 py-2 rounded-xl text-sm font-black border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2", children: [
                    /* @__PURE__ */ jsx36(Settings5, { className: "w-4 h-4" }),
                    " ",
                    t("admin_tools")
                  ] }),
                  /* @__PURE__ */ jsx36("div", { className: "absolute right-0 mt-2 w-[360px] max-w-[92vw] bg-white border border-slate-200 shadow-xl rounded-2xl p-3 z-20", children: /* @__PURE__ */ jsxs36("div", { className: "space-y-3", children: [
                    /* @__PURE__ */ jsxs36("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-3", children: [
                      /* @__PURE__ */ jsxs36("div", { className: "flex items-center justify-between gap-2 mb-2", children: [
                        /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide", children: "Cache offline" }),
                        /* @__PURE__ */ jsx36(
                          "div",
                          {
                            className: `text-[10px] font-black px-2 py-1 rounded-full border ${swDisabled ? "bg-white text-slate-700 border-slate-200" : "bg-blue-50 text-blue-800 border-blue-200"}`,
                            title: "Stato cache offline (service worker)",
                            children: swDisabled ? "OFF" : "ON"
                          }
                        )
                      ] }),
                      /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap gap-2", children: [
                        /* @__PURE__ */ jsx36(
                          "button",
                          {
                            onClick: async () => {
                              const next = !swDisabled;
                              const msg = next ? `Disattivare cache offline (service worker)?

Consigliato se un dispositivo (es. TV) mostra una versione vecchia.
Richiede ricarica pagina.` : `Riattivare cache offline (service worker)?

Richiede ricarica pagina.`;
                              if (!confirm(msg)) return;
                              try {
                                if (next) localStorage.setItem("flbp_sw_disabled", "1");
                                else localStorage.removeItem("flbp_sw_disabled");
                              } catch {
                              }
                              setSwDisabled(next);
                              if (next) {
                                await bestEffortClearSwCaches();
                              }
                              window.location.reload();
                            },
                            className: `text-sm font-semibold px-3 py-2 rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${swDisabled ? "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100" : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2`,
                            children: swDisabled ? "Riattiva cache" : "Disattiva cache"
                          }
                        ),
                        /* @__PURE__ */ jsxs36(
                          "button",
                          {
                            onClick: async () => {
                              if (!confirm("Svuotare cache offline (SW) e forzare un reload pulito?")) return;
                              await bestEffortClearSwCaches();
                              try {
                                localStorage.removeItem("flbp_sw_disabled");
                              } catch {
                              }
                              setSwDisabled(false);
                              window.location.reload();
                            },
                            className: "text-sm font-semibold px-3 py-2 rounded-xl border bg-white text-slate-800 border-slate-200 hover:bg-slate-50 transition-colors inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2",
                            children: [
                              /* @__PURE__ */ jsx36(Trash24, { className: "w-3 h-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2" }),
                              /* @__PURE__ */ jsx36("span", { children: "Svuota cache" })
                            ]
                          }
                        )
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs36("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-3", children: [
                      /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide mb-2", children: "Modalit\xE0" }),
                      /* @__PURE__ */ jsx36("div", { className: "flex flex-wrap gap-2", children: /* @__PURE__ */ jsx36(
                        "button",
                        {
                          onClick: () => {
                            const next = APP_MODE === "tester" ? "official" : "tester";
                            const msg = next === "tester" ? `Passare a MODALIT\xC0 TESTER?

	- Mostra simulatori e strumenti di test
	- Richiede ricarica pagina` : `Passare a MODALIT\xC0 UFFICIALE?

	- Nasconde simulatori e strumenti di test
	- Richiede ricarica pagina`;
                            if (!confirm(msg)) return;
                            setAppModeOverride(next);
                            window.location.reload();
                          },
                          className: `text-sm font-semibold px-3 py-2 rounded-xl border inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${APP_MODE === "tester" ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100" : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2`,
                          title: "Modalit\xE0 applicazione (clic per cambiare)",
                          children: APP_MODE === "tester" ? "TESTER" : "UFFICIALE"
                        }
                      ) })
                    ] }),
                    /* @__PURE__ */ jsxs36("div", { className: "rounded-xl border border-slate-200 bg-slate-50 p-3", children: [
                      /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide mb-2", children: "Sessione" }),
                      /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap gap-2", children: [
                        /* @__PURE__ */ jsx36(
                          "button",
                          {
                            onClick: () => {
                              try {
                                safeSessionRemove("flbp_admin_authed");
                              } catch {
                              }
                              setAuthed(false);
                            },
                            className: "text-sm font-semibold px-3 py-2 rounded-xl border bg-white text-slate-800 border-slate-200 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2",
                            title: "Logout Admin (locale)",
                            children: t("logout")
                          }
                        ),
                        supabaseEmail ? /* @__PURE__ */ jsx36(
                          "button",
                          {
                            onClick: async () => {
                              if (!confirm("Vuoi fare logout da Supabase?")) return;
                              await signOutSupabase();
                              try {
                                safeSessionRemove("flbp_admin_authed");
                              } catch {
                              }
                              setAuthed(false);
                              window.location.reload();
                            },
                            className: "text-sm font-semibold px-3 py-2 rounded-xl border bg-white text-slate-800 border-slate-200 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2",
                            title: "Logout Supabase",
                            children: "Logout Supabase"
                          }
                        ) : null
                      ] })
                    ] })
                  ] }) })
                ] })
              ] })
            ] }),
            adminSection === "live" ? /* @__PURE__ */ jsxs36("div", { className: "flex flex-col gap-4 md:flex-row md:items-start md:justify-between", children: [
              /* @__PURE__ */ jsxs36("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide", children: "TV" }),
                /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap gap-2", children: [
                  /* @__PURE__ */ jsxs36("button", { onClick: () => onEnterTv("groups"), className: "bg-slate-900 text-white px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-800", children: [
                    /* @__PURE__ */ jsx36(MonitorPlay4, { className: "w-4 h-4" }),
                    " ",
                    t("admin_tv_groups")
                  ] }),
                  /* @__PURE__ */ jsxs36("button", { onClick: () => onEnterTv("groups_bracket"), className: "bg-slate-900 text-white px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-800", children: [
                    /* @__PURE__ */ jsx36(MonitorPlay4, { className: "w-4 h-4" }),
                    " ",
                    t("admin_tv_groups_bracket")
                  ] }),
                  /* @__PURE__ */ jsxs36("button", { onClick: () => onEnterTv("bracket"), className: "bg-slate-900 text-white px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-800", children: [
                    /* @__PURE__ */ jsx36(MonitorPlay4, { className: "w-4 h-4" }),
                    " ",
                    t("admin_tv_bracket")
                  ] }),
                  /* @__PURE__ */ jsxs36("button", { onClick: () => onEnterTv("scorers"), className: "bg-slate-900 text-white px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-slate-800", children: [
                    /* @__PURE__ */ jsx36(MonitorPlay4, { className: "w-4 h-4" }),
                    " ",
                    t("admin_tv_scorers")
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs36("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide", children: "Torneo" }),
                /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap gap-2", children: [
                  /* @__PURE__ */ jsxs36(
                    "button",
                    {
                      onClick: () => openMvpModal(false),
                      className: "flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 font-black text-slate-700 hover:bg-slate-50",
                      title: "MVP",
                      children: [
                        /* @__PURE__ */ jsx36("span", { className: "text-base select-none", children: "\u2B50" }),
                        /* @__PURE__ */ jsx36("span", { children: t("mvp_plural") }),
                        state.tournament ? /* @__PURE__ */ jsx36("span", { className: "text-xs font-black text-slate-400", children: (() => {
                          const c = (state.hallOfFame || []).filter((e) => e.tournamentId === state.tournament.id && e.type === "mvp").length;
                          return c > 0 ? `(${c})` : "";
                        })() }) : null
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs36(
                    "button",
                    {
                      onClick: handleArchive,
                      className: "bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-red-100",
                      children: [
                        /* @__PURE__ */ jsx36(Archive3, { className: "w-4 h-4" }),
                        " ",
                        t("complete_tournament")
                      ]
                    }
                  )
                ] })
              ] })
            ] }) : /* @__PURE__ */ jsx36("div", { className: "text-sm text-slate-600 font-bold", children: t("admin_select_archived_desc") })
          ] }),
          adminSection === "live" && isTesterMode ? /* @__PURE__ */ jsxs36("div", { className: "mt-4 flex flex-wrap gap-2", children: [
            /* @__PURE__ */ jsxs36(
              "button",
              {
                onClick: handleSimulateTurn,
                disabled: simBusy,
                className: "bg-amber-500 text-white px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-amber-600 disabled:opacity-60",
                title: "Simula una fase/turno (solo modalit\xE0 tester)",
                children: [
                  /* @__PURE__ */ jsx36("span", { className: "text-base select-none", children: "\u{1F9EA}" }),
                  " Simula turno (test)"
                ]
              }
            ),
            /* @__PURE__ */ jsxs36(
              "button",
              {
                onClick: handleSimulateAll,
                disabled: simBusy,
                className: "bg-amber-600 text-white px-3 py-2 rounded-lg font-black flex items-center gap-2 hover:bg-amber-700 disabled:opacity-60",
                title: "Simula tutto il torneo (solo modalit\xE0 tester)",
                children: [
                  /* @__PURE__ */ jsx36("span", { className: "text-base select-none", children: "\u26A1" }),
                  " Simula tutto (test)"
                ]
              }
            ),
            /* @__PURE__ */ jsx36("div", { className: "text-xs font-bold text-slate-500 self-center", children: "Pulsanti di test: ti permettono di provare tutte le sezioni (Squadre/Referti/Monitor/...) senza cambiare tab." })
          ] }) : null,
          /* @__PURE__ */ jsx36("div", { className: "mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3", children: adminSection === "live" ? /* @__PURE__ */ jsxs36("nav", { "aria-label": "Admin tabs", className: "grid grid-cols-1 lg:grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxs36("div", { className: "bg-white rounded-xl border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide mb-2", children: t("admin_group_manage") }),
              /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap gap-2", children: [
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "teams" ? "page" : void 0,
                    onClick: () => {
                      setTab("teams");
                      setLastLiveTab("teams");
                      safeSessionSet("flbp_admin_last_live_tab", "teams");
                    },
                    className: tabBtnClass(tab2 === "teams"),
                    children: [
                      /* @__PURE__ */ jsx36(Users3, { className: "w-4 h-4" }),
                      " ",
                      t("teams")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "structure" ? "page" : void 0,
                    onClick: () => {
                      setTab("structure");
                      setLastLiveTab("structure");
                      safeSessionSet("flbp_admin_last_live_tab", "structure");
                    },
                    className: tabBtnClass(tab2 === "structure"),
                    children: [
                      /* @__PURE__ */ jsx36(Brackets2, { className: "w-4 h-4" }),
                      " ",
                      t("structure")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "reports" ? "page" : void 0,
                    onClick: () => {
                      setTab("reports");
                      setLastLiveTab("reports");
                      safeSessionSet("flbp_admin_last_live_tab", "reports");
                    },
                    className: tabBtnClass(tab2 === "reports"),
                    children: [
                      /* @__PURE__ */ jsx36(ClipboardList2, { className: "w-4 h-4" }),
                      " ",
                      t("reports")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "referees" ? "page" : void 0,
                    onClick: () => {
                      setTab("referees");
                      setLastLiveTab("referees");
                      safeSessionSet("flbp_admin_last_live_tab", "referees");
                    },
                    className: tabBtnClass(tab2 === "referees"),
                    children: [
                      /* @__PURE__ */ jsx36(ShieldCheck2, { className: "w-4 h-4" }),
                      " ",
                      t("referees")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "codes" ? "page" : void 0,
                    onClick: () => {
                      setTab("codes");
                      setLastLiveTab("codes");
                      safeSessionSet("flbp_admin_last_live_tab", "codes");
                    },
                    className: tabBtnClass(tab2 === "codes"),
                    children: [
                      /* @__PURE__ */ jsx36(ListChecks2, { className: "w-4 h-4" }),
                      " ",
                      t("code_list")
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs36("div", { className: "bg-white rounded-xl border border-slate-200 p-3", children: [
              /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide mb-2", children: t("admin_group_monitor") }),
              /* @__PURE__ */ jsxs36("div", { className: "flex flex-wrap gap-2", children: [
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "monitor_groups" ? "page" : void 0,
                    onClick: () => {
                      setTab("monitor_groups");
                      setLastLiveTab("monitor_groups");
                      safeSessionSet("flbp_admin_last_live_tab", "monitor_groups");
                    },
                    className: tabBtnClass(tab2 === "monitor_groups"),
                    children: [
                      /* @__PURE__ */ jsx36(LayoutDashboard4, { className: "w-4 h-4" }),
                      " ",
                      t("monitor_groups")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs36(
                  "button",
                  {
                    type: "button",
                    "aria-current": tab2 === "monitor_bracket" ? "page" : void 0,
                    onClick: () => {
                      setTab("monitor_bracket");
                      setLastLiveTab("monitor_bracket");
                      safeSessionSet("flbp_admin_last_live_tab", "monitor_bracket");
                    },
                    className: tabBtnClass(tab2 === "monitor_bracket"),
                    children: [
                      /* @__PURE__ */ jsx36(Brackets2, { className: "w-4 h-4" }),
                      " ",
                      t("monitor_bracket")
                    ]
                  }
                )
              ] })
            ] })
          ] }) : /* @__PURE__ */ jsxs36("nav", { "aria-label": "Admin tabs", className: "bg-white rounded-xl border border-slate-200 p-3", children: [
            /* @__PURE__ */ jsx36("div", { className: "text-xs font-black text-slate-500 uppercase tracking-wide mb-2", children: t("admin_group_data") }),
            /* @__PURE__ */ jsxs36(
              "button",
              {
                type: "button",
                "aria-current": tab2 === "data" ? "page" : void 0,
                onClick: () => setTab("data"),
                className: tabBtnClass(tab2 === "data"),
                children: [
                  /* @__PURE__ */ jsx36(Settings5, { className: "w-4 h-4" }),
                  " ",
                  t("data_management")
                ]
              }
            )
          ] }) })
        ] }),
        tab2 === "teams" && /* @__PURE__ */ jsx36(
          TeamsTab,
          {
            t,
            fileRef,
            backupRef,
            importFile,
            importBackupJson,
            exportTeamsXlsx,
            exportBackupJson,
            printTeams,
            editingId,
            teamName,
            setTeamName,
            p1,
            setP1,
            p2,
            setP2,
            y1,
            setY1,
            y2,
            setY2,
            p1IsReferee,
            setP1IsReferee,
            p2IsReferee,
            setP2IsReferee,
            saveTeam,
            resetForm,
            poolN,
            setPoolN,
            genPool,
            addHomonyms,
            clearTeams,
            sortedTeams,
            editTeam,
            deleteTeam
          }
        ),
        tab2 === "structure" && /* @__PURE__ */ jsx36(
          StructureTab,
          {
            state,
            draft,
            tournName,
            setTournName,
            tournMode,
            setTournMode,
            finalRrEnabled,
            setFinalRrEnabled,
            finalRrTopTeams,
            setFinalRrTopTeams,
            numGroups,
            setNumGroups,
            advancing,
            setAdvancing,
            handleGenerate,
            handleStartLive,
            printBracket
          }
        ),
        tab2 === "reports" && /* @__PURE__ */ jsx36(
          ReportsTab,
          {
            state,
            reportMatchId,
            handlePickReportMatch,
            getTeamFromCatalog,
            getTeamName,
            reportStatus,
            setReportStatus,
            reportScoreA,
            setReportScoreA,
            reportScoreB,
            setReportScoreB,
            reportStatsForm,
            setReportStatsForm,
            handleSaveReport,
            reportFileRef,
            handleReportFile,
            reportImageBusy,
            reportImageUrl,
            setReportImageUrl,
            reportOcrBusy,
            reportOcrText,
            setReportOcrText
          }
        ),
        tab2 === "referees" && /* @__PURE__ */ jsx36(
          RefereesTab,
          {
            state,
            refTables,
            setRefTables,
            getTeamName
          }
        ),
        tab2 === "codes" && /* @__PURE__ */ jsx36(
          CodesTab,
          {
            state,
            codesStatusFilter,
            setCodesStatusFilter,
            printCodes,
            toggleMatchStatus,
            openReportFromCodes
          }
        ),
        tab2 === "monitor_groups" && /* @__PURE__ */ jsx36(
          MonitorGroupsTab,
          {
            state,
            getTeamName,
            toggleMatchStatus,
            openReportFromCodes,
            handleUpdateTournamentAndMatches
          }
        ),
        tab2 === "monitor_bracket" && /* @__PURE__ */ jsx36(MonitorBracketTab, { ...monitorBracketTabProps }),
        tab2 === "data" && /* @__PURE__ */ jsx36(DataTab, { ...dataTabProps }),
        aliasModalOpen && /* @__PURE__ */ jsx36(
          AliasModal,
          {
            title: aliasModalTitle,
            conflicts: aliasModalConflicts,
            setConflicts: setAliasModalConflicts,
            onClose: closeAliasModal,
            onConfirm: confirmAliasModal
          }
        ),
        mvpModalOpen && /* @__PURE__ */ jsx36(
          MvpModal,
          {
            forArchive: mvpModalForArchive,
            allPlayers,
            search: mvpSearch,
            setSearch: setMvpSearch,
            selectedIds: mvpSelectedIds,
            setSelectedIds: setMvpSelectedIds,
            searchPlaceholder: t("search"),
            onClose: () => {
              setMvpModalOpen(false);
              setMvpModalForArchive(false);
            },
            onArchiveWithoutMvp: () => {
              const next = archiveTournamentV2(state);
              setState(next);
              setMvpModalOpen(false);
              setMvpModalForArchive(false);
            },
            onSave: () => {
              if (!state.tournament) {
                setMvpModalOpen(false);
                setMvpModalForArchive(false);
                return;
              }
              if (mvpModalForArchive) {
                let next = applyMvpsToState(state, mvpSelectedIds);
                next = archiveTournamentV2(next);
                setState(next);
                setMvpModalOpen(false);
                setMvpModalForArchive(false);
              } else {
                const next = applyMvpsToState(state, mvpSelectedIds);
                setState(next);
                setMvpModalOpen(false);
                setMvpModalForArchive(false);
                alert(t("alert_mvp_set"));
              }
            },
            saveLabel: mvpModalForArchive ? "Salva MVP e archivia" : t("admin_set")
          }
        )
      ] });
    };
  }
});

// _ssr_admin_check.tsx
init_AdminDashboard();
import ReactDOMServer from "react-dom/server";
import { jsx as jsx37 } from "react/jsx-runtime";
var MemStorage = class {
  constructor() {
    this.m = /* @__PURE__ */ new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
};
var ss = new MemStorage();
var ls = new MemStorage();
ss.setItem("flbp_admin_authed", "1");
var tab = process.env.TAB || "teams";
var section = tab === "data" ? "data" : "live";
ss.setItem("flbp_admin_section", section);
if (section === "live") ss.setItem("flbp_admin_last_live_tab", tab);
globalThis.sessionStorage = ss;
globalThis.localStorage = ls;
globalThis.window = globalThis;
try {
  globalThis.navigator.serviceWorker = void 0;
} catch {
}
var mockState = {
  teams: [],
  matches: [],
  tournament: null,
  tournamentMatches: [],
  tournamentHistory: [],
  logo: "",
  hallOfFame: [],
  integrationsScorers: [],
  playerAliases: {}
};
try {
  const html = ReactDOMServer.renderToString(
    /* @__PURE__ */ jsx37(
      AdminDashboard,
      {
        state: mockState,
        setState: () => {
        },
        onExit: () => {
        },
        onEnterTv: () => {
        }
      }
    )
  );
  console.log("SSR OK for tab:", tab, "html length:", html.length);
} catch (e) {
  console.error("SSR ERROR for tab:", tab, e?.message);
  console.error(e?.stack || e);
  process.exitCode = 1;
}
