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

  for (const match of incoming) {
    if (!String(match?.id || '').trim()) throw new Error('Match senza id nella patch referto');
    const current = findMatch(state, match.id);
    if (!current) throw new Error(`Match ${String(match.id)} non trovato nello snapshot live`);
    const currentSavedAt = savedAtMs(current);
    const incomingSavedAt = savedAtMs(match);
    if (currentSavedAt != null && (incomingSavedAt == null || currentSavedAt > incomingSavedAt)) {
      const error = new Error('Il server locale contiene un referto più recente per questa partita');
      error.code = 'FLBP_DB_CONFLICT';
      error.matchId = match.id;
      throw error;
    }
  }

  let nextState = clone(state);
  let nextPublicState = clone(publicState);
  for (const match of incoming) {
    nextState = patchStateMatch(nextState, match);
    nextPublicState = patchStateMatch(nextPublicState, match);
  }
  return { state: nextState, publicState: nextPublicState };
};

export const resolveRefereeSecret = (state, configuredFallback = '') => {
  return String(state?.tournament?.refereesPassword || configuredFallback || '').trim();
};
