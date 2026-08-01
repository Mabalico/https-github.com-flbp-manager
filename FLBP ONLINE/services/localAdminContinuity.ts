import { ensureLocalAdminToken, resolveDataPlane } from './dataPlaneClient';

type AdminSessionLike = {
  accessToken?: string | null;
  userId?: string | null;
  email?: string | null;
};

type VerifiedAdminProof = {
  principal: string;
  verifiedAt: string;
};

const VERIFIED_ADMIN_PROOF_LS_KEY = 'flbp_verified_admin_proof_v1';
const VERIFIED_ADMIN_PROOF_MAX_AGE_MS = 36 * 60 * 60 * 1000;

const principalFor = (session?: AdminSessionLike | null): string => {
  const userId = String(session?.userId || '').trim();
  if (userId) return `uid:${userId}`;
  const email = String(session?.email || '').trim().toLowerCase();
  return email ? `email:${email}` : '';
};

export const rememberVerifiedAdminSession = (session?: AdminSessionLike | null): void => {
  const principal = principalFor(session);
  if (!principal || !session?.accessToken) return;
  try {
    const proof: VerifiedAdminProof = { principal, verifiedAt: new Date().toISOString() };
    localStorage.setItem(VERIFIED_ADMIN_PROOF_LS_KEY, JSON.stringify(proof));
  } catch {
    // A live verified session continues to work even if storage is unavailable.
  }
};

export const clearVerifiedAdminSession = (): void => {
  try { localStorage.removeItem(VERIFIED_ADMIN_PROOF_LS_KEY); } catch { /* ignore */ }
};

export const hasRecentVerifiedAdminSession = (session?: AdminSessionLike | null): boolean => {
  if (!session?.accessToken) return false;
  const principal = principalFor(session);
  if (!principal) return false;
  try {
    const proof = JSON.parse(localStorage.getItem(VERIFIED_ADMIN_PROOF_LS_KEY) || 'null') as VerifiedAdminProof | null;
    const verifiedAt = Date.parse(String(proof?.verifiedAt || ''));
    return proof?.principal === principal
      && Number.isFinite(verifiedAt)
      && Date.now() - verifiedAt <= VERIFIED_ADMIN_PROOF_MAX_AGE_MS;
  } catch {
    return false;
  }
};

export const canContinueVerifiedAdminOnLocalNode = async (session?: AdminSessionLike | null): Promise<boolean> => {
  if (!hasRecentVerifiedAdminSession(session)) return false;
  const route = await resolveDataPlane({ force: true });
  if (route.mode !== 'local') return false;
  return !!(await ensureLocalAdminToken(route));
};
