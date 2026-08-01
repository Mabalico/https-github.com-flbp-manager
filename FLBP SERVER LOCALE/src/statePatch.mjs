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
