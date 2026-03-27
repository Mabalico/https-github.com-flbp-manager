import type { HallOfFameEntry, PlayerStats } from '../types';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const PUBLIC_VIEW_CACHE_TTL_MS = 90 * 1000;

let careerLeaderboardCache: CacheEntry<PlayerStats[]> | null = null;
let hallOfFameCache: CacheEntry<HallOfFameEntry[]> | null = null;

const readCache = <T,>(entry: CacheEntry<T> | null): T | null => {
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.value;
};

const writeCache = <T,>(value: T): CacheEntry<T> => ({
  value,
  expiresAt: Date.now() + PUBLIC_VIEW_CACHE_TTL_MS,
});

export const readCachedPublicCareerLeaderboard = (): PlayerStats[] | null =>
  readCache(careerLeaderboardCache);

export const writeCachedPublicCareerLeaderboard = (rows: PlayerStats[]): void => {
  careerLeaderboardCache = writeCache(rows);
};

export const readCachedPublicHallOfFameEntries = (): HallOfFameEntry[] | null =>
  readCache(hallOfFameCache);

export const writeCachedPublicHallOfFameEntries = (rows: HallOfFameEntry[]): void => {
  hallOfFameCache = writeCache(rows);
};
