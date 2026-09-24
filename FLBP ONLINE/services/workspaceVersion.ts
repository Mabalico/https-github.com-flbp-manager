/**
 * Parse the optimistic-concurrency cursor used by SQLite/Supabase.
 *
 * `Number(null)` and `Number('')` are both 0, which is a valid workspace
 * version. Accepting those coercions can silently turn a missing cursor into
 * version zero and corrupt the provenance of a recovered browser draft.
 */
export const normalizeWorkspaceVersion = (value: unknown): number | null => {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'string' && !value.trim()) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
