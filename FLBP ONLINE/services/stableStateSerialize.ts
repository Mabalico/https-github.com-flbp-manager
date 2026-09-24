/**
 * Compare persisted JSON content without depending on object key insertion order.
 * Supabase jsonb can return the same fields in a different order. Array order is
 * retained, including positional player identities and ordered tournament data.
 */
export const stableStateSerialize = (value: unknown): string => JSON.stringify(
  value,
  (_key, current) => current && typeof current === 'object' && !Array.isArray(current)
    ? Object.fromEntries(Object.keys(current).sort().map((key) => [key, current[key]]))
    : current
) ?? 'undefined';
