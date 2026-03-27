/**
 * Local Admin gate removed.
 *
 * The Admin area is now unlocked only through a real Supabase Auth session,
 * with remote authorization delegated to public.admin_users / flbp_is_admin().
 * This file is kept only as a compatibility tombstone for repository history.
 */
export const LOCAL_ADMIN_GATE_REMOVED = true;
