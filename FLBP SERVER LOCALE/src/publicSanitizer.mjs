const sanitizeTeam = (team) => {
  if (!team || typeof team !== 'object' || Array.isArray(team)) return team;
  const out = { ...team };
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
  out.teams = (Array.isArray(out.teams) ? out.teams : []).map(sanitizeTeam);
  out.groups = (Array.isArray(out.groups) ? out.groups : []).map((group) => ({
    ...group,
    teams: (Array.isArray(group?.teams) ? group.teams : []).map(sanitizeTeam),
  }));
  return out;
};

export const sanitizeAppStateForPublic = (state) => {
  const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const safe = { ...source };
  safe.teams = (Array.isArray(source.teams) ? source.teams : []).map(sanitizeTeam);
  safe.tournament = source.tournament ? sanitizeTournament(source.tournament) : null;
  safe.tournamentHistory = (Array.isArray(source.tournamentHistory) ? source.tournamentHistory : []).map(sanitizeTournament);
  safe.integrationsScorers = (Array.isArray(source.integrationsScorers) ? source.integrationsScorers : []).map((scorer) => {
    const { yob: _yob, birthDate: _birthDate, ...rest } = scorer || {};
    return rest;
  });
  safe.hallOfFame = (Array.isArray(source.hallOfFame) ? source.hallOfFame : []).map((entry) => {
    const { playerId: _playerId, playerBirthDate: _playerBirthDate, ...rest } = entry || {};
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
    teams: (Array.isArray(safe.teams) ? safe.teams : []).map(sanitizeTeam),
    tournament: safe.tournament ? sanitizeTournament(safe.tournament) : null,
    tournamentMatches: Array.isArray(safe.tournamentMatches) ? safe.tournamentMatches : [],
  };
  if (safe.fantaSettings && typeof safe.fantaSettings === 'object' && !Array.isArray(safe.fantaSettings)) {
    live.fantaSettings = safe.fantaSettings;
  }
  return live;
};
