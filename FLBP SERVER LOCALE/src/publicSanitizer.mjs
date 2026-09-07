const normalizedDate = value => {
  const raw = String(value || '');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const parsed = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : '';
};
const under26 = (birth, reference) => {
  const dob = normalizedDate(birth);
  if (!dob) return false;
  if (reference === undefined) { const age = new Date().getFullYear() - Number(dob.slice(0, 4)); return age >= 0 && age < 26; }
  const date = normalizedDate(String(reference || '').slice(0, 10));
  if (!date) return false;
  const age = Number(date.slice(0, 4)) - Number(dob.slice(0, 4)) - Number(date.slice(5) < dob.slice(5));
  return age >= 0 && age < 26;
};
const sanitizeTeam = (team, tournamentDate) => {
  if (!team || typeof team !== 'object' || Array.isArray(team)) return team;
  const out = { ...team };
  for (const slot of [1, 2]) {
    const birth = out[`player${slot}BirthDate`];
    if (birth) { out[`player${slot}U25`] = under26(birth, tournamentDate || ''); out[`player${slot}CareerU25`] = under26(birth); }
  }
  delete out.player1YoB;
  delete out.player2YoB;
  delete out.player1BirthDate;
  delete out.player2BirthDate;
  return out;
};

const sanitizeTournament = (tournament) => {
  if (!tournament || typeof tournament !== 'object' || Array.isArray(tournament)) return tournament;
  const out = { ...tournament };
  delete out.refereesPassword;
  out.teams = (Array.isArray(out.teams) ? out.teams : []).map(team => sanitizeTeam(team, out.startDate));
  out.groups = (Array.isArray(out.groups) ? out.groups : []).map((group) => ({
    ...group,
    teams: (Array.isArray(group?.teams) ? group.teams : []).map(team => sanitizeTeam(team, out.startDate)),
  }));
  return out;
};

export const sanitizeAppStateForPublic = (state) => {
  const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const safe = { ...source };
  safe.teams = (Array.isArray(source.teams) ? source.teams : []).map(team => sanitizeTeam(team, source.tournament?.startDate));
  safe.tournament = source.tournament ? sanitizeTournament(source.tournament) : null;
  safe.tournamentHistory = (Array.isArray(source.tournamentHistory) ? source.tournamentHistory : []).map(sanitizeTournament);
  safe.integrationsScorers = (Array.isArray(source.integrationsScorers) ? source.integrationsScorers : []).map((scorer) => {
    const { yob: _yob, birthDate: _birthDate, ...rest } = scorer || {};
    const date = [source.tournament, ...(source.tournamentHistory || [])].find(t => t?.id === scorer?.sourceTournamentId)?.startDate
      || (source.hallOfFame || []).find(entry => entry.tournamentId === scorer?.sourceTournamentId)?.sourceTournamentDate || scorer?.sourceTournamentDate || '';
    return { ...rest, ...(_birthDate ? { tournamentU25: under26(_birthDate, date), careerU25: under26(_birthDate) } : {}) };
  });
  safe.hallOfFame = (Array.isArray(source.hallOfFame) ? source.hallOfFame : []).map((entry) => {
    const { playerId: _playerId, playerBirthDate: _playerBirthDate, playerIds: _playerIds, playerBirthDates: _playerBirthDates, ...rest } = entry || {};
    return rest;
  });
  delete safe.playerAliases;
  delete safe.playerAccountAliasIgnores;
  return safe;
};

export const buildPublicWorkspaceLiveState = (publicState) => {
  const safe = publicState && typeof publicState === 'object' && !Array.isArray(publicState) ? publicState : {};
  const live = {
    __schemaVersion: safe.__schemaVersion ?? 1,
    teams: (Array.isArray(safe.teams) ? safe.teams : []).map(team => sanitizeTeam(team)),
    tournament: safe.tournament ? sanitizeTournament(safe.tournament) : null,
    tournamentMatches: Array.isArray(safe.tournamentMatches) ? safe.tournamentMatches : [],
  };
  if (safe.fantaSettings && typeof safe.fantaSettings === 'object' && !Array.isArray(safe.fantaSettings)) {
    live.fantaSettings = safe.fantaSettings;
  }
  return live;
};
