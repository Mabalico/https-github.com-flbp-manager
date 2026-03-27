/**
 * App mode feature-flag.
 *
 * - tester: enables testing tools like simulations / sim-pool
 * - official: hides testing tools from the UI (production release)
 *
 * Configure via Vite env var: VITE_APP_MODE=tester|official
 */

export type AppMode = 'tester' | 'official';

/**
 * Runtime override key.
 *
 * - If set, takes precedence over build-time VITE_APP_MODE.
 * - Used only to switch UI gating (sim tools etc.) and requires a page reload.
 */
export const APP_MODE_OVERRIDE_KEY = 'flbp_app_mode_override';

const raw = (import.meta as any)?.env?.VITE_APP_MODE;
const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
const remoteRepoRaw = (import.meta as any)?.env?.VITE_REMOTE_REPO;
const allowLocalOnlyRaw = (import.meta as any)?.env?.VITE_ALLOW_LOCAL_ONLY;
const remoteRepoEnabled = String(remoteRepoRaw || '').trim() === '1';
const allowLocalOnly = String(allowLocalOnlyRaw || '').trim() === '1';
const isProdBuild = !!((import.meta as any)?.env?.PROD);

export const isAppModeLockedForPublicDeploy = isProdBuild && remoteRepoEnabled && !allowLocalOnly;

const envMode: AppMode = isAppModeLockedForPublicDeploy
    ? 'official'
    : (normalized === 'official' ? 'official' : 'tester');

const safeReadOverride = (): AppMode | null => {
    try {
        if (typeof window === 'undefined') return null;
        const v = window.localStorage?.getItem(APP_MODE_OVERRIDE_KEY);
        const n = typeof v === 'string' ? v.trim().toLowerCase() : '';
        if (n === 'tester' || n === 'official') return n;
        return null;
    } catch {
        return null;
    }
};

export const setAppModeOverride = (mode: AppMode | null) => {
    try {
        if (typeof window === 'undefined') return;
        if (!window.localStorage) return;
        if (!mode) window.localStorage.removeItem(APP_MODE_OVERRIDE_KEY);
        else window.localStorage.setItem(APP_MODE_OVERRIDE_KEY, mode);
    } catch {
        // ignore
    }
};

export const clearAppModeOverride = () => setAppModeOverride(null);

const overrideMode = isAppModeLockedForPublicDeploy ? null : safeReadOverride();

export const APP_MODE: AppMode = overrideMode || envMode;

export const isTesterMode = APP_MODE === 'tester';
export const isOfficialMode = APP_MODE === 'official';
