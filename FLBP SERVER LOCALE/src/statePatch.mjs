const clone = (value) => structuredClone(value);

const findMatch = (state, matchId) => {
  const id = String(matchId || '');
  const flat = Array.isArray(state?.tournamentMatches) ? state.tournamentMatches : [];
  const tournamentFlat = Array.isArray(state?.tournament?.matches) ? state.tournament.matches : [];
  const rounds = Array.isArray(state?.tournament?.rounds) ? state.tournament.rounds : [];
  return flat.find((match) => String(match?.id || '') === id)
    || tournamentFlat.find((match) => String(match?.id || '') === id)
    || rounds.flatMap((round) => Array.isArray(round) ? round : []).find((match) => String(match?.id || '') === id)
    || null;
};

const patchArray = (items, match) => {
  if (!Array.isArray(items)) return { items, found: false };
  let found = false;
  const next = items.map((current) => {
    if (String(current?.id || '') !== String(match?.id || '')) return current;
    found = true;
    return clone(match);
  });
  return { items: next, found };
};

const patchStateMatch = (state, match) => {
  const next = clone(state || {});
  let found = false;

  if (Array.isArray(next.tournamentMatches)) {
    const patched = patchArray(next.tournamentMatches, match);
    next.tournamentMatches = patched.items;
    found ||= patched.found;
  }
  if (Array.isArray(next.tournament?.matches)) {
    const patched = patchArray(next.tournament.matches, match);
    next.tournament.matches = patched.items;
    found ||= patched.found;
  }
  if (Array.isArray(next.tournament?.rounds)) {
    next.tournament.rounds = next.tournament.rounds.map((round) => {
      const patched = patchArray(round, match);
      found ||= patched.found;
      return patched.items;
    });
  }

  if (!found) throw new Error(`Match ${String(match?.id || '')} non trovato nello snapshot live`);
  return next;
};

const savedAtMs = (match) => {
  const parsed = Date.parse(String(match?.refereeReportSavedAt || ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const hasFinalRefereeReport = (match) => !!(
  String(match?.refereeReportFinalId || '').trim()
  || String(match?.refereeReportSavedAt || '').trim()
);

const collectMatchesById = (state) => {
  const out = new Map();
  const add = (items) => {
    if (!Array.isArray(items)) return;
    for (const match of items) {
      const id = String(match?.id || '').trim();
      if (id && !out.has(id)) out.set(id, match);
    }
  };
  add(state?.matches);
  add(state?.tournamentMatches);
  add(state?.tournament?.matches);
  if (Array.isArray(state?.tournament?.rounds)) {
    for (const round of state.tournament.rounds) add(round);
  }
  return out;
};

const replaceMatchesById = (state, replacements) => {
  const next = clone(state || {});
  const replace = (items) => Array.isArray(items)
    ? items.map((match) => replacements.has(String(match?.id || ''))
      ? clone(replacements.get(String(match?.id || '')))
      : match)
    : items;
  next.matches = replace(next.matches);
  next.tournamentMatches = replace(next.tournamentMatches);
  if (next.tournament && typeof next.tournament === 'object') {
    next.tournament.matches = replace(next.tournament.matches);
    if (Array.isArray(next.tournament.rounds)) {
      next.tournament.rounds = next.tournament.rounds.map(replace);
    }
  }
  return next;
};

/**
 * A local recovery intentionally rebases a browser draft on the newest SQLite
 * version. It may replace ordinary Admin fields, but it must never erase a
 * referee report that reached the authoritative database after that draft.
 *
 * Newer protected matches are copied as a whole. If the draft removed such a
 * match entirely, recovery is rejected because silently re-inserting it could
 * create an invalid bracket; the operator can then export and reconcile the
 * draft explicitly.
 */
export const preserveAuthoritativeRefereeReports = ({ currentState, incomingState }) => {
  const currentTournamentId = String(currentState?.tournament?.id || '').trim();
  const incomingTournamentId = String(incomingState?.tournament?.id || '').trim();
  if (!currentTournamentId || currentTournamentId !== incomingTournamentId) {
    return { state: clone(incomingState || {}), preservedMatchIds: [] };
  }

  const currentMatches = collectMatchesById(currentState);
  const incomingMatches = collectMatchesById(incomingState);
  const replacements = new Map();

  for (const [id, currentMatch] of currentMatches) {
    if (!hasFinalRefereeReport(currentMatch)) continue;
    const incomingMatch = incomingMatches.get(id);
    if (!incomingMatch) {
      const error = new Error(`La versione locale non contiene il referto autorevole della partita ${id}`);
      error.statusCode = 409;
      error.code = 'FLBP_LOCAL_RECOVERY_REQUIRES_RECONCILIATION';
      error.matchId = id;
      throw error;
    }

    const currentSavedAt = savedAtMs(currentMatch);
    const incomingSavedAt = savedAtMs(incomingMatch);
    const currentFinalId = String(currentMatch?.refereeReportFinalId || '').trim();
    const incomingFinalId = String(incomingMatch?.refereeReportFinalId || '').trim();
    const currentIsNewer = currentSavedAt != null
      ? incomingSavedAt == null || currentSavedAt > incomingSavedAt
      : !!currentFinalId && currentFinalId !== incomingFinalId;
    if (currentIsNewer) replacements.set(id, currentMatch);
  }

  return {
    state: replacements.size ? replaceMatchesById(incomingState, replacements) : clone(incomingState || {}),
    preservedMatchIds: [...replacements.keys()],
  };
};

const rejectNewMatch = (detail) => Object.assign(
  new Error(`Creazione partita non autorizzata: ${detail}`),
  { statusCode: 400, code: 'FLBP_INVALID_TIE_BREAK' },
);

const TIE_BREAK_FIELDS = ['teamAId', 'teamBId', 'teamIds', 'scoresByTeam', 'scoreA', 'scoreB', 'played', 'status',
  'phase', 'groupName', 'orderIndex', 'isTieBreak'];

const isAbsentOr = (value, allowed) => value === undefined || value === allowed;

/**
 * Same rule as public.flbp_report_validate_new_tiebreak (Supabase): a report
 * save may create the tie-break it makes necessary, and nothing else. The
 * match must be an empty scheduled tie-break of an existing group (the final
 * group only while the final round robin runs), between two or more distinct
 * visible teams of that group, once every other match of the group is finished
 * (counting this patch) and no other tie-break of the group is left to play,
 * with the next code of its prefix as numbered by the app.
 */
export const validateNewTieBreakMatch = (state, incoming, match) => {
  const id = String(match?.id || '').trim();
  if (!match || typeof match !== 'object' || Array.isArray(match) || typeof match.id !== 'string' || !id || id.length > 200) {
    throw rejectNewMatch('identificatore non valido');
  }
  const existing = [...collectMatchesById(state).values()];
  if (existing.some((current) => String(current?.id || '') === id)) throw rejectNewMatch('partita già presente');

  if (match.isTieBreak !== true || match.phase !== 'groups' || match.status !== 'scheduled'
    || !isAbsentOr(match.played, false) || !isAbsentOr(match.scoreA, 0) || !isAbsentOr(match.scoreB, 0)
    || !isAbsentOr(match.targetScore, 1) || !isAbsentOr(match.hidden, false) || !isAbsentOr(match.isBye, false)
    || match.refereeReportSavedAt !== undefined || match.refereeReportFinalId !== undefined || match.refereeReportAudit !== undefined
    || (match.stats !== undefined && !(Array.isArray(match.stats) && match.stats.length === 0))) {
    throw rejectNewMatch('lo spareggio deve essere da giocare');
  }

  const groupName = typeof match.groupName === 'string' ? match.groupName : '';
  const groups = Array.isArray(state?.tournament?.groups) ? state.tournament.groups : [];
  const group = groupName ? groups.find((candidate) => candidate?.name === groupName) : null;
  if (!group) throw rejectNewMatch('girone inesistente');
  const finalStage = group.stage === 'final' || /\bfinale?\b/i.test(String(group.name || ''));
  const finalConfig = state?.tournament?.config?.finalRoundRobin;
  if (finalStage && (finalConfig?.enabled !== true || finalConfig?.activated !== true)) {
    throw rejectNewMatch('girone finale non attivo');
  }

  let participants;
  if (Array.isArray(match.teamIds)) {
    if (match.teamIds.some((teamId) => typeof teamId !== 'string')) throw rejectNewMatch('partecipanti non validi');
    participants = match.teamIds;
    // The final-group FTB keeps legacy 1v1 fields: they must name participants.
    for (const key of ['teamAId', 'teamBId']) {
      const value = match[key];
      if (value !== undefined && value !== null && value !== '' && !participants.includes(value)) {
        throw rejectNewMatch('partecipanti incoerenti');
      }
    }
  } else {
    if (typeof match.teamAId !== 'string' || typeof match.teamBId !== 'string') throw rejectNewMatch('partecipanti non validi');
    participants = [match.teamAId, match.teamBId];
  }
  if (participants.length < 2 || participants.some((teamId) => !teamId) || new Set(participants).size !== participants.length) {
    throw rejectNewMatch('partecipanti non validi');
  }
  const groupTeams = Array.isArray(group.teams) ? group.teams : [];
  for (const teamId of participants) {
    const upper = teamId.toUpperCase();
    const member = groupTeams.some((team) => team?.id === teamId && isAbsentOr(team?.hidden, false) && isAbsentOr(team?.isBye, false));
    if (upper.startsWith('BYE') || upper.startsWith('TBD') || !member) throw rejectNewMatch('squadra estranea al girone');
  }
  if (match.scoresByTeam !== undefined) {
    const scores = match.scoresByTeam;
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)
      || Object.entries(scores).some(([teamId, value]) => !participants.includes(teamId) || value !== 0)) {
      throw rejectNewMatch('punteggi dello spareggio non validi');
    }
  }

  // The group letter is the last character of a renamed group's name
  // ("Girone Nord" gives dTB1, "Girone 1" gives 1TB1), so case is kept.
  const code = typeof match.code === 'string' ? match.code : '';
  const codeParts = code.match(/^([^]{1,3}TB)([1-9][0-9]{0,3})$/);
  if (!codeParts) throw rejectNewMatch('codice spareggio non valido');
  const prefix = codeParts[1];
  const highest = existing.reduce((max, current) => {
    const other = String(current?.code ?? '');
    const digits = other.startsWith(prefix) ? other.slice(prefix.length) : '';
    return /^[0-9]{1,9}$/.test(digits) ? Math.max(max, Number(digits)) : max;
  }, 0);
  if (Number(codeParts[2]) !== highest + 1) throw rejectNewMatch('codice spareggio non coerente');

  const updates = new Map(incoming.map((item) => [String(item?.id || ''), item]));
  const groupMatches = existing
    .map((current) => updates.get(String(current?.id || '')) || current)
    .filter((current) => current?.phase === 'groups' && current?.groupName === groupName);
  const baseMatches = groupMatches.filter((current) => current?.isTieBreak !== true);
  if (!baseMatches.length || baseMatches.some((current) => current?.hidden !== true && current?.isBye !== true && current?.status !== 'finished')) {
    throw rejectNewMatch('il girone non è ancora concluso');
  }
  if (groupMatches.some((current) => current?.isTieBreak === true && current?.status !== 'finished')) {
    throw rejectNewMatch("c'è già uno spareggio da giocare in questo girone");
  }

  const clean = Object.fromEntries(TIE_BREAK_FIELDS.filter((key) => match[key] !== undefined).map((key) => [key, clone(match[key])]));
  return { ...clean, id, code, targetScore: 1 };
};

const appendNewMatches = (state, newMatches) => {
  if (!newMatches.length) return state;
  const next = state;
  const append = (items) => [
    ...items,
    ...newMatches.filter((match) => !items.some((item) => String(item?.id || '') === match.id)).map(clone),
  ];
  const hasFlat = Array.isArray(next.tournamentMatches);
  const hasTournament = Array.isArray(next.tournament?.matches);
  if (hasFlat || !hasTournament) next.tournamentMatches = append(hasFlat ? next.tournamentMatches : []);
  if (hasTournament) next.tournament.matches = append(next.tournament.matches);
  return next;
};

export const applyMatchResultPatch = ({ state, publicState, tournamentId, matchId, matches }) => {
  if (!state || !publicState) throw new Error('Snapshot locale non inizializzato');
  if (String(state?.tournament?.id || '') !== String(tournamentId || '')) {
    throw new Error('Torneo live non corrispondente');
  }
  const incoming = Array.isArray(matches) ? matches : [];
  if (!incoming.length) throw new Error('Nessun match nella patch referto');
  if (!incoming.some((match) => String(match?.id || '') === String(matchId || ''))) {
    throw new Error(`La patch referto non contiene il match principale ${String(matchId || '')}`);
  }

  const newMatches = [];
  const newGroups = new Set();
  for (const match of incoming) {
    if (!String(match?.id || '').trim()) throw new Error('Match senza id nella patch referto');
    const current = findMatch(state, match.id);
    if (!current) {
      // A report save may create the tie-break it makes necessary (group TB or
      // final FTB). The reported match itself must already exist.
      const id = String(match.id).trim();
      if (id === String(matchId || '').trim() || newMatches.some((created) => created.id === id)) {
        throw new Error(`Match ${String(match.id)} non trovato nello snapshot live`);
      }
      const created = validateNewTieBreakMatch(state, incoming, match);
      if (newGroups.has(created.groupName)) throw rejectNewMatch('un solo spareggio nuovo per girone');
      newGroups.add(created.groupName);
      newMatches.push(created);
      continue;
    }
    const currentSavedAt = savedAtMs(current);
    const incomingSavedAt = savedAtMs(match);
    if (currentSavedAt != null && (incomingSavedAt == null || currentSavedAt > incomingSavedAt)) {
      const error = new Error('Il server locale contiene un referto più recente per questa partita');
      error.code = 'FLBP_DB_CONFLICT';
      error.matchId = match.id;
      throw error;
    }
  }

  let nextState = appendNewMatches(clone(state), newMatches);
  let nextPublicState = appendNewMatches(clone(publicState), newMatches);
  const createdById = new Map(newMatches.map((created) => [created.id, created]));
  for (const match of incoming) {
    // Write the validated copy of a new tie-break, never the caller's extra fields.
    const effective = createdById.get(String(match.id).trim()) || match;
    nextState = patchStateMatch(nextState, effective);
    nextPublicState = patchStateMatch(nextPublicState, effective);
  }
  return { state: nextState, publicState: nextPublicState };
};

export const resolveRefereeSecret = (state, configuredFallback = '') => {
  return String(state?.tournament?.refereesPassword || configuredFallback || '').trim();
};
