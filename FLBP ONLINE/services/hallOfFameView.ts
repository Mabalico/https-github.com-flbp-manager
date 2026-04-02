import type { HallOfFameEntry } from '../types';
import type { AppState } from './storageService';
import { getPlayerKeyLabel } from './playerIdentity';
import { getHallOfFamePlayerRefs } from './playerDataProvenance';
import { normalizeNameLower } from './textUtils';

export type TitledHallOfFamePlayerRow = {
  key: string;
  name: string;
  breakdown: Record<HallOfFameEntry['type'], number>;
  total: number;
  win: number;
  mvp: number;
  ts: number;
  def: number;
  ts25: number;
  def25: number;
  u25Total: number;
};

const normalize = (value: string) => normalizeNameLower(value || '');

const preferredDisplayName = (key: string, fallback: string) => {
  const fallbackName = String(fallback || '').trim();
  if (fallbackName) return fallbackName;
  const label = getPlayerKeyLabel(key);
  return String(label.name || key).trim() || key;
};

const buildFallbackRefs = (entry: HallOfFameEntry) =>
  (entry.playerNames || [])
    .map((playerName, index) => {
      const normalized = normalize(playerName);
      if (!normalized) return null;
      return {
        key: normalized,
        displayName: String(playerName || '').trim(),
        slotIndex: index,
      };
    })
    .filter(Boolean) as Array<{ key: string; displayName: string; slotIndex: number }>;

export const buildTitledHallOfFameRows = (
  state: Pick<AppState, 'tournament' | 'tournamentHistory' | 'playerAliases'>,
  entries: HallOfFameEntry[]
): TitledHallOfFamePlayerRow[] => {
  const playerCounts: Record<string, { name: string; breakdown: Record<HallOfFameEntry['type'], number> }> = {};

  const add = (key: string, name: string, type: HallOfFameEntry['type']) => {
    if (!key) return;
    if (!playerCounts[key]) playerCounts[key] = { name, breakdown: {} as Record<HallOfFameEntry['type'], number> };
    if (!playerCounts[key].name || playerCounts[key].name === key) {
      playerCounts[key].name = name || key;
    }
    playerCounts[key].breakdown[type] = (playerCounts[key].breakdown[type] || 0) + 1;
  };

  (entries || []).forEach((entry) => {
    const refs = getHallOfFamePlayerRefs(state as AppState, entry);
    if (refs.length) {
      refs.forEach((ref) => {
        add(ref.playerId || ref.rawPlayerId || normalize(ref.playerName), preferredDisplayName(ref.playerId || ref.rawPlayerId, ref.playerName), entry.type);
      });
      return;
    }

    buildFallbackRefs(entry).forEach((ref) => {
      add(ref.key, ref.displayName, entry.type);
    });
  });

  return Object.entries(playerCounts).map(([key, player]) => {
    const win = player.breakdown.winner || 0;
    const mvp = player.breakdown.mvp || 0;
    const ts = player.breakdown.top_scorer || 0;
    const def = player.breakdown.defender || 0;
    const ts25 = player.breakdown.top_scorer_u25 || 0;
    const def25 = player.breakdown.defender_u25 || 0;
    const total = win + mvp + ts + def;
    const u25Total = ts25 + def25;
    return {
      key,
      name: player.name,
      breakdown: player.breakdown,
      total,
      win,
      mvp,
      ts,
      def,
      ts25,
      def25,
      u25Total,
    };
  });
};
