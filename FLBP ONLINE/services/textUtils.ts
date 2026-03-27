// Shared pure text helpers (no side-effects).
// Keep these functions tiny and stable: they are used across Admin import flows.

export const normalizeCol = (s: string): string =>
  (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Normalize a person/team name for matching/deduplication.
// - Collapses whitespace
// - Trims
// - Lowercases
export const normalizeNameLower = (name: string): string =>
  (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Normalize a person/team name while preserving case (useful for UI input).
// - Collapses whitespace
// - Trims
export const normalizeNamePreserveCase = (name: string): string =>
  (name || '').trim().replace(/\s+/g, ' ');
