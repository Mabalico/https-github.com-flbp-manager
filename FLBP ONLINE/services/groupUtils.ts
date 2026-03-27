/**
 * Group-related helpers shared across admin/storage/engine.
 *
 * Hard constraints:
 * - Pure helpers only (no side-effects)
 * - Safe for missing/legacy data (undefined/null)
 * - Keep behavior identical to previous inline implementations
 */

/** Detects whether a group name refers to a Final/Finale stage. */
export const isFinalGroupName = (name?: string) => /\bfinale?\b/i.test(String(name || ''));

/** Detects whether a group is a Final stage group (by stage flag or by name). */
export const isFinalGroup = (g?: any) => !!g && ((g.stage === 'final') || isFinalGroupName(g.name));
