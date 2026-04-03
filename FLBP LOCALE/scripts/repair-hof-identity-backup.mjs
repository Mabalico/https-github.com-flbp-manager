import fs from 'node:fs';
import path from 'node:path';

const [, , inputArg, outputArg, reportArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/repair-hof-identity-backup.mjs <input.json> <output.json> [report.json]');
  process.exit(1);
}

const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeBirthDate = (value) => {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const getPlayerKey = (name, identity = 'ND') => {
  const base = String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
  return `${base}_${identity || 'ND'}`;
};

const extractState = (raw) => {
  if (raw && typeof raw === 'object' && raw.state && typeof raw.state === 'object') return raw.state;
  return raw;
};

const collectTournaments = (state) => [
  ...((Array.isArray(state.tournamentHistory) ? state.tournamentHistory : [])),
  ...(state.tournament ? [state.tournament] : []),
];

const findTournament = (state, tournamentId) =>
  collectTournaments(state).find((tournament) => String(tournament?.id || '').trim() === String(tournamentId || '').trim()) || null;

const findWinnerTeam = (state, entry) => {
  const tournament = findTournament(state, entry.tournamentId);
  if (!tournament || !entry.teamName) return null;
  return (Array.isArray(tournament.teams) ? tournament.teams : []).find((team) => normalizeName(team?.name) === normalizeName(entry.teamName)) || null;
};

const addCandidate = (map, playerName, birthDate, source) => {
  const normalized = normalizeName(playerName);
  if (!normalized) return;
  const identity = normalizeBirthDate(birthDate) || 'ND';
  const playerId = getPlayerKey(playerName, identity);
  if (!map.has(normalized)) {
    map.set(normalized, {
      displayNames: new Map(),
      datedIds: new Set(),
      undatedIds: new Set(),
      rawIds: new Set(),
      sources: [],
    });
  }
  const bucket = map.get(normalized);
  bucket.displayNames.set(playerId, String(playerName || '').trim());
  bucket.rawIds.add(playerId);
  if (identity === 'ND') bucket.undatedIds.add(playerId);
  else bucket.datedIds.add(playerId);
  bucket.sources.push(source);
};

const buildIdentityBuckets = (state) => {
  const buckets = new Map();
  const tournaments = collectTournaments(state);

  tournaments.forEach((tournament) => {
    const teams = Array.isArray(tournament.teams) ? tournament.teams : [];
    const teamById = new Map(teams.map((team) => [team.id, team]));
    teams.forEach((team) => {
      addCandidate(buckets, team.player1, team.player1BirthDate, { kind: 'team', tournamentId: tournament.id, teamId: team.id, slot: 1 });
      addCandidate(buckets, team.player2, team.player2BirthDate, { kind: 'team', tournamentId: tournament.id, teamId: team.id, slot: 2 });
    });

    const matches = Array.isArray(tournament.matches) && tournament.matches.length
      ? tournament.matches
      : (Array.isArray(tournament.rounds) ? tournament.rounds.flat() : []);
    matches.forEach((match) => {
      (Array.isArray(match?.stats) ? match.stats : []).forEach((row) => {
        const team = teamById.get(row.teamId);
        const birthDate = team && team.player1 === row.playerName
          ? team.player1BirthDate
          : team && team.player2 === row.playerName
            ? team.player2BirthDate
            : '';
        addCandidate(buckets, row.playerName, birthDate, { kind: 'match_stat', tournamentId: tournament.id, matchId: match.id, teamId: row.teamId });
      });
    });
  });

  (Array.isArray(state.integrationsScorers) ? state.integrationsScorers : []).forEach((entry) => {
    addCandidate(buckets, entry.name, entry.birthDate, { kind: 'integration', id: entry.id });
  });

  (Array.isArray(state.hallOfFame) ? state.hallOfFame : []).forEach((entry) => {
    if (entry.type === 'winner') {
      const team = findWinnerTeam(state, entry);
      if (team) {
        addCandidate(buckets, team.player1, team.player1BirthDate, { kind: 'hof_winner', id: entry.id, slot: 1 });
        addCandidate(buckets, team.player2, team.player2BirthDate, { kind: 'hof_winner', id: entry.id, slot: 2 });
      } else {
        (Array.isArray(entry.playerNames) ? entry.playerNames : []).forEach((playerName, index) => {
          addCandidate(buckets, playerName, '', { kind: 'hof_winner_name', id: entry.id, slot: index + 1 });
        });
      }
      return;
    }

    addCandidate(buckets, entry.playerNames?.[0], entry.playerBirthDate || '', { kind: 'hof_individual', id: entry.id, type: entry.type });
  });

  return buckets;
};

const chooseCanonicalIdentity = (bucket) => {
  if (bucket.datedIds.size === 1) {
    const playerId = Array.from(bucket.datedIds)[0];
    return {
      playerId,
      displayName: bucket.displayNames.get(playerId) || playerId,
      birthDate: playerId.match(/_(\d{4}-\d{2}-\d{2})$/)?.[1] || '',
      safe: true,
    };
  }

  if (bucket.datedIds.size === 0 && bucket.undatedIds.size === 1) {
    const playerId = Array.from(bucket.undatedIds)[0];
    return {
      playerId,
      displayName: bucket.displayNames.get(playerId) || playerId,
      birthDate: '',
      safe: true,
    };
  }

  return null;
};

const detectLegacySplitBuckets = (state, hallOfFame) => {
  const legacyKeysByName = new Map();

  (Array.isArray(hallOfFame) ? hallOfFame : []).forEach((entry) => {
    const names = Array.isArray(entry.playerNames) ? entry.playerNames : [];
    names.forEach((name) => {
      const normalized = normalizeName(name);
      if (!normalized) return;
      const legacyKey = entry.playerId && names.length === 1 ? entry.playerId : normalized;
      if (!legacyKeysByName.has(normalized)) legacyKeysByName.set(normalized, new Set());
      legacyKeysByName.get(normalized).add(legacyKey);
    });
  });

  const buckets = buildIdentityBuckets(state);
  return Array.from(legacyKeysByName.entries())
    .map(([normalized, keys]) => {
      const canonical = chooseCanonicalIdentity(buckets.get(normalized) || { datedIds: new Set(), undatedIds: new Set(), displayNames: new Map() });
      return {
        normalizedName: normalized,
        legacyKeys: Array.from(keys),
        canonicalPlayerId: canonical?.playerId || null,
      };
    })
    .filter((row) => row.legacyKeys.length > 1);
};

const raw = JSON.parse(fs.readFileSync(inputArg, 'utf8'));
const state = extractState(raw);
const nextState = JSON.parse(JSON.stringify(state));
nextState.playerAliases = nextState.playerAliases && typeof nextState.playerAliases === 'object' ? nextState.playerAliases : {};

const buckets = buildIdentityBuckets(nextState);
const aliasRepairs = [];
const hallRepairs = [];
const ambiguousNames = [];
const splitCandidatesBefore = detectLegacySplitBuckets(state, state.hallOfFame);
const splitNamesBefore = new Set(splitCandidatesBefore.map((row) => row.normalizedName));

for (const [normalized, bucket] of buckets.entries()) {
  const canonical = chooseCanonicalIdentity(bucket);
  if (!canonical) {
    ambiguousNames.push({
      normalizedName: normalized,
      datedIds: Array.from(bucket.datedIds),
      undatedIds: Array.from(bucket.undatedIds),
    });
    continue;
  }

  for (const rawId of bucket.rawIds) {
    if (!rawId || rawId === canonical.playerId) continue;
    if (nextState.playerAliases[rawId] === canonical.playerId) continue;
    nextState.playerAliases[rawId] = canonical.playerId;
    aliasRepairs.push({ from: rawId, to: canonical.playerId, normalizedName: normalized });
  }
}

(Array.isArray(nextState.hallOfFame) ? nextState.hallOfFame : []).forEach((entry) => {
  if (entry.type === 'winner') {
    const winnerTeam = findWinnerTeam(nextState, entry);
    if (!winnerTeam) return;
    const nextNames = [winnerTeam.player1, winnerTeam.player2].filter(Boolean);
    const currentNames = Array.isArray(entry.playerNames) ? entry.playerNames.filter(Boolean) : [];
    if (JSON.stringify(currentNames) !== JSON.stringify(nextNames)) {
      hallRepairs.push({
        entryId: entry.id,
        type: entry.type,
        action: 'winner_names_aligned_to_team_roster',
        before: currentNames,
        after: nextNames,
      });
      entry.playerNames = nextNames;
    }
    return;
  }

  const currentName = String(entry.playerNames?.[0] || '').trim();
  const normalized = normalizeName(currentName);
  const canonical = chooseCanonicalIdentity(buckets.get(normalized) || { datedIds: new Set(), undatedIds: new Set(), displayNames: new Map() });
  if (!canonical) return;

  const before = {
    playerId: entry.playerId || null,
    playerBirthDate: entry.playerBirthDate || null,
    playerName: currentName,
  };

  let changed = false;
  if (splitNamesBefore.has(normalized)) {
    if (entry.playerId !== undefined) {
      delete entry.playerId;
      changed = true;
    }
    if (entry.playerBirthDate !== undefined) {
      delete entry.playerBirthDate;
      changed = true;
    }
  }
  if (currentName !== canonical.displayName) {
    entry.playerNames = [canonical.displayName];
    changed = true;
  }

  if (changed) {
    hallRepairs.push({
      entryId: entry.id,
      type: entry.type,
      action: splitNamesBefore.has(normalized) ? 'individual_award_legacy_grouping_aligned' : 'individual_award_name_aligned',
      before,
      after: {
        playerId: entry.playerId || null,
        playerBirthDate: entry.playerBirthDate || null,
        playerName: entry.playerNames?.[0] || '',
      },
    });
  }
});

const splitCandidatesAfter = detectLegacySplitBuckets(nextState, nextState.hallOfFame);

fs.mkdirSync(path.dirname(outputArg), { recursive: true });
fs.writeFileSync(outputArg, JSON.stringify(nextState, null, 2));

if (reportArg) {
  fs.mkdirSync(path.dirname(reportArg), { recursive: true });
  fs.writeFileSync(reportArg, JSON.stringify({
    input: inputArg,
    output: outputArg,
    aliasRepairs,
    hallRepairs,
    ambiguousNames,
    splitCandidatesBefore,
    splitCandidatesAfter,
  }, null, 2));
}
