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

const SURNAME_PARTICLES = new Set([
  'da',
  'dal',
  'dalla',
  'de',
  'dei',
  'degli',
  'del',
  'della',
  'dello',
  'di',
  'du',
  'la',
  'le',
  'lo',
  'van',
  'von',
]);

export const buildCanonicalPlayerNameFromParts = (firstName: string, lastName: string): string =>
  normalizeNamePreserveCase([lastName, firstName].filter(Boolean).join(' '));

export const splitCanonicalPlayerName = (fullName: string): { firstName: string; lastName: string } => {
  const tokens = normalizeNamePreserveCase(fullName).split(' ').filter(Boolean);
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '' };
  if (tokens.length === 2) return { firstName: tokens[1], lastName: tokens[0] };

  const lowered = tokens.map((token) => token.toLowerCase());
  let surnameTokenCount = 1;

  if (SURNAME_PARTICLES.has(lowered[0]) && tokens.length >= 3) {
    surnameTokenCount = 2;
  } else if (SURNAME_PARTICLES.has(lowered[1]) && tokens.length >= 4) {
    surnameTokenCount = 3;
  }

  return {
    firstName: tokens.slice(surnameTokenCount).join(' '),
    lastName: tokens.slice(0, surnameTokenCount).join(' '),
  };
};
