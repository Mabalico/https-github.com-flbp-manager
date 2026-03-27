import type { Match, Team, TournamentData } from '../types';
import type { SupabasePublicWorkspaceStateRow } from './supabaseRest';

type CacheEntry<T> = {
  value: T;
  cachedAt: number;
};

const valueCache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();

const WORKSPACE_KEY = 'public_workspace_state';
const TOURNAMENTS_LIST_KEY = 'public_tournaments_list';
const TOURNAMENT_BUNDLE_KEY_PREFIX = 'public_tournament_bundle:';

export type PublicTournamentsListPayload = {
  liveTournament: TournamentData | null;
  history: TournamentData[];
};

export type PublicTournamentBundlePayload = {
  data: TournamentData;
  teams: Team[];
  matches: Match[];
};

const bundleKey = (tournamentId: string) => `${TOURNAMENT_BUNDLE_KEY_PREFIX}${String(tournamentId || '').trim()}`;

export const readCachedPublicData = <T,>(key: string, maxAgeMs: number): T | null => {
  if (maxAgeMs <= 0) return null;
  const cached = valueCache.get(key) as CacheEntry<T> | undefined;
  if (!cached) return null;
  if ((Date.now() - cached.cachedAt) > maxAgeMs) return null;
  return cached.value;
};

export const writeCachedPublicData = <T,>(key: string, value: T): T => {
  valueCache.set(key, { value, cachedAt: Date.now() });
  return value;
};

export const getOrFetchCachedPublicData = async <T,>(key: string, maxAgeMs: number, fetcher: () => Promise<T>): Promise<T> => {
  const cached = readCachedPublicData<T>(key, maxAgeMs);
  if (cached != null) return cached;

  const pending = inFlightCache.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const nextPromise = (async () => {
    try {
      const next = await fetcher();
      return writeCachedPublicData(key, next);
    } finally {
      inFlightCache.delete(key);
    }
  })();

  inFlightCache.set(key, nextPromise as Promise<unknown>);
  return nextPromise;
};

export const readCachedPublicWorkspaceState = (maxAgeMs: number): SupabasePublicWorkspaceStateRow | null =>
  readCachedPublicData<SupabasePublicWorkspaceStateRow>(WORKSPACE_KEY, maxAgeMs);

export const writeCachedPublicWorkspaceState = (value: SupabasePublicWorkspaceStateRow): SupabasePublicWorkspaceStateRow =>
  writeCachedPublicData(WORKSPACE_KEY, value);

export const getOrFetchPublicWorkspaceStateCached = (maxAgeMs: number, fetcher: () => Promise<SupabasePublicWorkspaceStateRow | null>) =>
  getOrFetchCachedPublicData<SupabasePublicWorkspaceStateRow | null>(WORKSPACE_KEY, maxAgeMs, fetcher);

export const readCachedPublicTournamentsList = (maxAgeMs: number): PublicTournamentsListPayload | null =>
  readCachedPublicData<PublicTournamentsListPayload>(TOURNAMENTS_LIST_KEY, maxAgeMs);

export const writeCachedPublicTournamentsList = (value: PublicTournamentsListPayload): PublicTournamentsListPayload =>
  writeCachedPublicData(TOURNAMENTS_LIST_KEY, value);

export const getOrFetchPublicTournamentsListCached = (maxAgeMs: number, fetcher: () => Promise<PublicTournamentsListPayload>) =>
  getOrFetchCachedPublicData<PublicTournamentsListPayload>(TOURNAMENTS_LIST_KEY, maxAgeMs, fetcher);

export const readCachedPublicTournamentBundle = (tournamentId: string, maxAgeMs: number): PublicTournamentBundlePayload | null =>
  readCachedPublicData<PublicTournamentBundlePayload>(bundleKey(tournamentId), maxAgeMs);

export const writeCachedPublicTournamentBundle = (tournamentId: string, value: PublicTournamentBundlePayload): PublicTournamentBundlePayload =>
  writeCachedPublicData(bundleKey(tournamentId), value);

export const getOrFetchPublicTournamentBundleCached = (tournamentId: string, maxAgeMs: number, fetcher: () => Promise<PublicTournamentBundlePayload | null>) =>
  getOrFetchCachedPublicData<PublicTournamentBundlePayload | null>(bundleKey(tournamentId), maxAgeMs, fetcher);
