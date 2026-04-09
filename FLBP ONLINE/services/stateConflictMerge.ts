import type { AppState } from './storageService';
import { coerceAppState } from './storageService';
import { buildBracketRoundsFromMatches } from './tournamentStructureSelectors';
import type { Group, HallOfFameEntry, IntegrationScorerEntry, Match, Team, TournamentData } from '../types';
import { normalizeNameLower } from './textUtils';

type MergeFailure = { ok: false; reason: string };
type MergeSuccess<T> = { ok: true; value: T; changed: boolean };

export type StateConflictMergeResult =
  | { ok: true; state: AppState; mergedSlices: string[] }
  | { ok: false; reason: string };

const stableSerialize = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
};

const sameValue = (a: unknown, b: unknown) => stableSerialize(a) === stableSerialize(b);

const cloneValue = <T,>(value: T): T => {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalize = (value: string) => normalizeNameLower(value || '');

const teamKey = (team?: Team | null): string => {
  const id = String(team?.id || '').trim();
  if (id && id !== 'BYE') return `id:${id}`;
  return `sem:${normalize(team?.name || '')}|${normalize(team?.player1 || '')}|${normalize(team?.player2 || '')}`;
};

const matchKey = (match?: Match | null): string => {
  const id = String(match?.id || '').trim();
  if (id) return `id:${id}`;
  return `sem:${String(match?.code || '').trim()}|${String(match?.phase || '').trim()}|${match?.round ?? ''}|${match?.orderIndex ?? ''}`;
};

const tournamentKey = (tournament?: TournamentData | null): string => {
  if (!tournament) return '';
  const id = String(tournament.id || '').trim();
  if (id) return `id:${id}`;
  return `sem:${normalize(tournament.name || '')}|${String(tournament.startDate || '').trim()}|${String(tournament.type || '').trim()}`;
};

const groupKey = (group?: Group | null): string => {
  const id = String(group?.id || '').trim();
  if (id) return `id:${id}`;
  return `sem:${normalize(group?.name || '')}|${String(group?.stage || '').trim()}`;
};

const hallOfFameKey = (entry?: HallOfFameEntry | null): string => {
  const id = String(entry?.id || '').trim();
  if (id) return `id:${id}`;
  return `sem:${entry?.tournamentId || ''}|${entry?.type || ''}|${entry?.playerId || ''}|${normalize(entry?.teamName || '')}|${(entry?.playerNames || []).map(normalize).join('|')}`;
};

const scorerKey = (entry?: IntegrationScorerEntry | null): string => {
  const id = String(entry?.id || '').trim();
  if (id) return `id:${id}`;
  return `sem:${normalize(entry?.name || '')}|${entry?.birthDate || entry?.yob || 'ND'}|${normalize(entry?.source || '')}`;
};

const keyedArrayToMap = <T,>(values: T[], keyOf: (value: T) => string) => {
  const map = new Map<string, T>();
  for (const value of values || []) {
    const key = keyOf(value);
    if (!key) continue;
    map.set(key, value);
  }
  return map;
};

const mergeScalar = <T,>(base: T, local: T, remote: T): MergeSuccess<T> | MergeFailure => {
  if (sameValue(local, remote)) return { ok: true, value: cloneValue(local), changed: !sameValue(local, base) };
  if (sameValue(local, base)) return { ok: true, value: cloneValue(remote), changed: !sameValue(remote, base) };
  if (sameValue(remote, base)) return { ok: true, value: cloneValue(local), changed: !sameValue(local, base) };
  return { ok: false, reason: 'same-field-changed-differently' };
};

const mergeObjectFields = <T extends Record<string, any>>(
  base: T,
  local: T,
  remote: T,
  fields: Array<keyof T>
): MergeSuccess<T> | MergeFailure => {
  const next = { ...cloneValue(remote) } as T;
  let changed = false;
  for (const field of fields) {
    const merged = mergeScalar(base?.[field], local?.[field], remote?.[field]);
    if (!merged.ok) return merged;
    next[field] = merged.value;
    changed = changed || merged.changed;
  }
  return { ok: true, value: next, changed };
};

const mergeKeyedArray = <T,>(
  baseValues: T[],
  localValues: T[],
  remoteValues: T[],
  keyOf: (value: T) => string
): MergeSuccess<T[]> | MergeFailure => {
  const baseMap = keyedArrayToMap(baseValues || [], keyOf);
  const localMap = keyedArrayToMap(localValues || [], keyOf);
  const remoteMap = keyedArrayToMap(remoteValues || [], keyOf);
  const orderedKeys = Array.from(new Set([
    ...(remoteValues || []).map(keyOf),
    ...(localValues || []).map(keyOf),
    ...(baseValues || []).map(keyOf),
  ].filter(Boolean)));

  const next: T[] = [];
  let changed = false;

  for (const key of orderedKeys) {
    const baseValue = baseMap.get(key);
    const localValue = localMap.get(key);
    const remoteValue = remoteMap.get(key);

    if (sameValue(localValue, remoteValue)) {
      if (localValue !== undefined) next.push(cloneValue(localValue));
      changed = changed || !sameValue(localValue, baseValue);
      continue;
    }
    if (sameValue(localValue, baseValue)) {
      if (remoteValue !== undefined) next.push(cloneValue(remoteValue));
      changed = changed || !sameValue(remoteValue, baseValue);
      continue;
    }
    if (sameValue(remoteValue, baseValue)) {
      if (localValue !== undefined) next.push(cloneValue(localValue));
      changed = changed || !sameValue(localValue, baseValue);
      continue;
    }
    return { ok: false, reason: `overlap:${key}` };
  }

  return { ok: true, value: next, changed };
};

const mergeAliases = (
  baseAliases: Record<string, string>,
  localAliases: Record<string, string>,
  remoteAliases: Record<string, string>
): MergeSuccess<Record<string, string>> | MergeFailure => {
  const keys = Array.from(new Set([
    ...Object.keys(baseAliases || {}),
    ...Object.keys(localAliases || {}),
    ...Object.keys(remoteAliases || {}),
  ]));
  const next: Record<string, string> = {};
  let changed = false;

  for (const key of keys) {
    const merged = mergeScalar(
      baseAliases?.[key] ?? null,
      localAliases?.[key] ?? null,
      remoteAliases?.[key] ?? null
    );
    if (!merged.ok) return merged;
    const value = String(merged.value || '').trim();
    if (value) next[key] = value;
    changed = changed || merged.changed;
  }

  return { ok: true, value: next, changed };
};

const mergeAliasIgnoreMap = (
  baseIgnores: Record<string, number>,
  localIgnores: Record<string, number>,
  remoteIgnores: Record<string, number>
): MergeSuccess<Record<string, number>> | MergeFailure => {
  const keys = Array.from(new Set([
    ...Object.keys(baseIgnores || {}),
    ...Object.keys(localIgnores || {}),
    ...Object.keys(remoteIgnores || {}),
  ]));
  const next: Record<string, number> = {};
  let changed = false;

  for (const key of keys) {
    const merged = mergeScalar(
      baseIgnores?.[key] ?? null,
      localIgnores?.[key] ?? null,
      remoteIgnores?.[key] ?? null
    );
    if (!merged.ok) return merged;
    const value = Number(merged.value);
    if (Number.isFinite(value) && value > 0) next[key] = value;
    changed = changed || merged.changed;
  }

  return { ok: true, value: next, changed };
};

const getTournamentMatches = (state: AppState): Match[] => {
  if (Array.isArray(state.tournamentMatches)) return state.tournamentMatches;
  if (Array.isArray(state.tournament?.matches)) return state.tournament.matches || [];
  return [];
};

const mergeLiveTournament = (
  baseState: AppState,
  localState: AppState,
  remoteState: AppState
): MergeSuccess<{ tournament: TournamentData | null; tournamentMatches: Match[] }> | MergeFailure => {
  const baseTournament = baseState.tournament;
  const localTournament = localState.tournament;
  const remoteTournament = remoteState.tournament;

  if (sameValue(localTournament, remoteTournament) && sameValue(getTournamentMatches(localState), getTournamentMatches(remoteState))) {
    return {
      ok: true,
      value: {
        tournament: cloneValue(localTournament),
        tournamentMatches: cloneValue(getTournamentMatches(localState)),
      },
      changed: !sameValue(localTournament, baseTournament) || !sameValue(getTournamentMatches(localState), getTournamentMatches(baseState)),
    };
  }

  if (sameValue(localTournament, baseTournament) && sameValue(getTournamentMatches(localState), getTournamentMatches(baseState))) {
    return {
      ok: true,
      value: {
        tournament: cloneValue(remoteTournament),
        tournamentMatches: cloneValue(getTournamentMatches(remoteState)),
      },
      changed: !sameValue(remoteTournament, baseTournament) || !sameValue(getTournamentMatches(remoteState), getTournamentMatches(baseState)),
    };
  }

  if (sameValue(remoteTournament, baseTournament) && sameValue(getTournamentMatches(remoteState), getTournamentMatches(baseState))) {
    return {
      ok: true,
      value: {
        tournament: cloneValue(localTournament),
        tournamentMatches: cloneValue(getTournamentMatches(localState)),
      },
      changed: !sameValue(localTournament, baseTournament) || !sameValue(getTournamentMatches(localState), getTournamentMatches(baseState)),
    };
  }

  if (!localTournament || !remoteTournament) {
    return { ok: false, reason: 'live-tournament-presence-conflict' };
  }

  if (tournamentKey(localTournament) !== tournamentKey(remoteTournament)) {
    return { ok: false, reason: 'live-tournament-changed' };
  }

  const baseTournamentSafe = baseTournament && tournamentKey(baseTournament) === tournamentKey(localTournament)
    ? baseTournament
    : ({
        ...localTournament,
        teams: [],
        groups: [],
        matches: [],
        rounds: [],
      } as TournamentData);

  const mergedMeta = mergeObjectFields(
    baseTournamentSafe as TournamentData,
    localTournament,
    remoteTournament,
    ['id', 'name', 'type', 'startDate', 'config', 'refereesRoster', 'refereesPassword', 'refereesAuthVersion', 'isManual', 'includeU25Awards']
  );
  if (!mergedMeta.ok) return { ok: false, reason: `live-meta:${mergedMeta.reason}` };

  const mergedTeams = mergeKeyedArray(
    baseTournamentSafe.teams || [],
    localTournament.teams || [],
    remoteTournament.teams || [],
    teamKey
  );
  if (!mergedTeams.ok) return { ok: false, reason: `live-teams:${mergedTeams.reason}` };

  const mergedGroups = mergeKeyedArray(
    baseTournamentSafe.groups || [],
    localTournament.groups || [],
    remoteTournament.groups || [],
    groupKey
  );
  if (!mergedGroups.ok) return { ok: false, reason: `live-groups:${mergedGroups.reason}` };

  const mergedMatches = mergeKeyedArray(
    getTournamentMatches(baseState),
    getTournamentMatches(localState),
    getTournamentMatches(remoteState),
    matchKey
  );
  if (!mergedMatches.ok) return { ok: false, reason: `live-matches:${mergedMatches.reason}` };

  const nextTournament: TournamentData = {
    ...mergedMeta.value,
    teams: mergedTeams.value,
    groups: mergedGroups.value,
    matches: mergedMatches.value,
    rounds: buildBracketRoundsFromMatches(mergedMatches.value),
  };

  return {
    ok: true,
    value: {
      tournament: nextTournament,
      tournamentMatches: mergedMatches.value,
    },
    changed: mergedMeta.changed || mergedTeams.changed || mergedGroups.changed || mergedMatches.changed,
  };
};

export const tryMergeRemoteStateConflict = (input: {
  baseState: AppState | null;
  localState: AppState;
  remoteState: AppState;
}): StateConflictMergeResult => {
  if (!input.baseState) {
    return { ok: false, reason: 'base-state-missing' };
  }

  const baseState = coerceAppState(input.baseState);
  const localState = coerceAppState(input.localState);
  const remoteState = coerceAppState(input.remoteState);

  const mergedSlices: string[] = [];

  const mergedTeams = mergeKeyedArray(baseState.teams || [], localState.teams || [], remoteState.teams || [], teamKey);
  if (!mergedTeams.ok) return { ok: false, reason: `teams:${mergedTeams.reason}` };
  if (mergedTeams.changed) mergedSlices.push('teams');

  const mergedMatches = mergeKeyedArray(baseState.matches || [], localState.matches || [], remoteState.matches || [], matchKey);
  if (!mergedMatches.ok) return { ok: false, reason: `matches:${mergedMatches.reason}` };
  if (mergedMatches.changed) mergedSlices.push('matches');

  const mergedLiveTournament = mergeLiveTournament(baseState, localState, remoteState);
  if (!mergedLiveTournament.ok) return { ok: false, reason: mergedLiveTournament.reason };
  if (mergedLiveTournament.changed) mergedSlices.push('liveTournament');

  const mergedHistory = mergeKeyedArray(
    baseState.tournamentHistory || [],
    localState.tournamentHistory || [],
    remoteState.tournamentHistory || [],
    tournamentKey
  );
  if (!mergedHistory.ok) return { ok: false, reason: `history:${mergedHistory.reason}` };
  if (mergedHistory.changed) mergedSlices.push('tournamentHistory');

  const mergedHall = mergeKeyedArray(
    baseState.hallOfFame || [],
    localState.hallOfFame || [],
    remoteState.hallOfFame || [],
    hallOfFameKey
  );
  if (!mergedHall.ok) return { ok: false, reason: `hallOfFame:${mergedHall.reason}` };
  if (mergedHall.changed) mergedSlices.push('hallOfFame');

  const mergedScorers = mergeKeyedArray(
    baseState.integrationsScorers || [],
    localState.integrationsScorers || [],
    remoteState.integrationsScorers || [],
    scorerKey
  );
  if (!mergedScorers.ok) return { ok: false, reason: `integrationsScorers:${mergedScorers.reason}` };
  if (mergedScorers.changed) mergedSlices.push('integrationsScorers');

  const mergedAliases = mergeAliases(
    baseState.playerAliases || {},
    localState.playerAliases || {},
    remoteState.playerAliases || {}
  );
  if (!mergedAliases.ok) return { ok: false, reason: `playerAliases:${mergedAliases.reason}` };
  if (mergedAliases.changed) mergedSlices.push('playerAliases');

  const mergedAliasIgnores = mergeAliasIgnoreMap(
    baseState.playerAccountAliasIgnores || {},
    localState.playerAccountAliasIgnores || {},
    remoteState.playerAccountAliasIgnores || {}
  );
  if (!mergedAliasIgnores.ok) return { ok: false, reason: `playerAccountAliasIgnores:${mergedAliasIgnores.reason}` };
  if (mergedAliasIgnores.changed) mergedSlices.push('playerAccountAliasIgnores');

  const mergedLogo = mergeScalar(baseState.logo || '', localState.logo || '', remoteState.logo || '');
  if (!mergedLogo.ok) return { ok: false, reason: `logo:${mergedLogo.reason}` };
  if (mergedLogo.changed) mergedSlices.push('logo');

  return {
    ok: true,
    state: coerceAppState({
      ...remoteState,
      teams: mergedTeams.value,
      matches: mergedMatches.value,
      tournament: mergedLiveTournament.value.tournament,
      tournamentMatches: mergedLiveTournament.value.tournamentMatches,
      tournamentHistory: mergedHistory.value,
      hallOfFame: mergedHall.value,
      integrationsScorers: mergedScorers.value,
      playerAliases: mergedAliases.value,
      playerAccountAliasIgnores: mergedAliasIgnores.value,
      logo: mergedLogo.value,
    }),
    mergedSlices,
  };
};
