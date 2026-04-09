import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, archiveTournamentV2, setTournamentMvps, getPlayerKey, isU25, resolvePlayerKey, getPlayerKeyLabel, coerceAppState, syncArchivedHistoryToHallOfFame } from '../services/storageService';
import { deriveYoBFromBirthDate, formatBirthDateDisplay, normalizeBirthDateInput, pickPlayerIdentityValue } from '../services/playerIdentity';
import { Team, TvProjection, TournamentData, Match, IntegrationScorerEntry } from '../types';
import { useTranslation } from '../App';
import { Archive, MonitorPlay, Users, Brackets, ClipboardList, LayoutDashboard, ListChecks, Upload, Download, Trash2, Plus, ShieldCheck, PlayCircle, Settings, CheckCircle2, ChevronDown } from 'lucide-react';
import { generateTournamentStructure, syncBracketFromGroups, getFinalRoundRobinActivationStatus, activateFinalRoundRobinStage, ensureFinalTieBreakIfNeeded } from '../services/tournamentEngine';
import { simulateMatchResult, simulateMultiMatchResult } from '../services/simulationService';
import { getMatchParticipantIds, formatMatchScoreLabel } from '../services/matchUtils';
import { isPlaceholderTeamId } from '../services/matchUtils';
import { buildCanonicalPlayerNameFromParts, normalizeCol, normalizeNameLower, splitCanonicalPlayerName } from '../services/textUtils';
import { TournamentBracket } from './TournamentBracket';
import { loadImageProcessingService } from '../services/lazyImageProcessing';
import { SUPABASE_AUTH_STATE_CHANGE_EVENT, clearSupabaseSession, ensureFreshPlayerSupabaseSession, ensureSupabaseAdminAccess, getConfiguredAdminEmail, getPlayerSupabaseSession, getSupabaseConfig, getSupabaseSession, playerSignOutSupabase, pullAdminPlayerAccounts, pullAdminUserRoles, setPlayerSupabaseSession, setSupabaseSession, signInWithPassword, signOutSupabase } from '../services/supabaseRest';

import { uuid } from '../services/id';
import { downloadBlob } from '../services/adminDownloadUtils';
import { decodeCsvText, detectCsvSeparator, parseCsvRows } from '../services/adminCsvUtils';
import { generateSimPoolTeams } from '../services/simPool';
import { getXLSX, type XLSXRuntime } from '../services/lazyXlsx';
import { buildUnifiedBackupJsonExport, inspectBackupJsonState, mergeBackupJsonState, parseBackupJsonState } from '../services/backupJsonService';
import { describeTeamImportLayout, detectTeamImportLayout, isTeamImportCoherentWithProfile, loadTeamImportProfile, normalizeTeamImportHeader, saveTeamImportProfile, type TeamImportLayout } from '../services/teamImportProfile';
import { updatePlayerProfileIdentity } from '../services/playerProfileAdmin';

import { AliasModal, type AliasConflict } from './admin/modals/AliasModal';
import { MvpModal } from './admin/modals/MvpModal';
import { APP_MODE, isAppModeLockedForPublicDeploy, isTesterMode, setAppModeOverride } from '../config/appMode';
import { readAdminSyncState, subscribeAdminSyncState, type AdminSyncState } from '../services/adminSyncState';


const loadTeamsTabModule = () => import('./admin/tabs/TeamsTab');
const loadStructureTabModule = () => import('./admin/tabs/StructureTab');
const loadReportsTabModule = () => import('./admin/tabs/ReportsTab');
const loadRefereesTabModule = () => import('./admin/tabs/RefereesTab');
const loadCodesTabModule = () => import('./admin/tabs/CodesTab');
const loadMonitorGroupsTabModule = () => import('./admin/tabs/MonitorGroupsTab');
const loadMonitorBracketTabModule = () => import('./admin/tabs/MonitorBracketTab');
const loadDataTabModule = () => import('./admin/tabs/DataTab');
const loadTournamentEditorTabModule = () => import('./admin/tabs/TournamentEditorTab');

const TeamsTabLazy = React.lazy(() =>
    loadTeamsTabModule().then((m) => ({ default: m.TeamsTab }))
);
const StructureTabLazy = React.lazy(() =>
    loadStructureTabModule().then((m) => ({ default: m.StructureTab }))
);
const ReportsTabLazy = React.lazy(() =>
    loadReportsTabModule().then((m) => ({ default: m.ReportsTab }))
);
const RefereesTabLazy = React.lazy(() =>
    loadRefereesTabModule().then((m) => ({ default: m.RefereesTab }))
);
const CodesTabLazy = React.lazy(() =>
    loadCodesTabModule().then((m) => ({ default: m.CodesTab }))
);
const MonitorGroupsTabLazy = React.lazy(() =>
    loadMonitorGroupsTabModule().then((m) => ({ default: m.MonitorGroupsTab }))
);
const MonitorBracketTabLazy = React.lazy(() =>
    loadMonitorBracketTabModule().then((m) => ({ default: m.MonitorBracketTab }))
);
const DataTabLazy = React.lazy(() =>
    loadDataTabModule().then((m) => ({ default: m.DataTab }))
);
const TournamentEditorTabLazy = React.lazy(() =>
    loadTournamentEditorTabModule().then((m) => ({ default: m.TournamentEditorTab }))
);

// --- Admin-only render recovery ---
// Goal: unblock Admin access if an edge-case in Admin render paths triggers
// a crash (e.g., stale persisted tab/subtab). In healthy cases this never runs.
// No new dependencies; only clears Admin session keys + returns to Live→Teams.
const clearAdminSessionNavKeys = () => {
    const keys = [
        'flbp_admin_section',
        'flbp_admin_last_live_tab',
        'flbp_admin_data_main_section',
        'flbp_admin_data_subtab',
        'flbp_admin_integrations_subtab',
    ];
    try {
        keys.forEach((k) => {
            try { sessionStorage.removeItem(k); } catch { /* ignore */ }
        });
    } catch {
        // ignore
    }
};

const ADMIN_LEGACY_AUTH_LS_KEY = 'flbp_admin_legacy_authed';
const ADMIN_LEGACY_BOOTSTRAP_PASSWORD = 'Giobotta@flbp';

const getTodayInputDate = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

type AdminRenderRecoveryBoundaryProps = {
    nav: { adminSection: string; tab: string; dataSubTab: string; integrationsSubTab: string };
    onRecover: () => void;
    labels?: {
        errorTitle?: string;
        errorDesc?: string;
        restoreButton?: string;
    };
    children: React.ReactNode;
};

type AdminRenderRecoveryBoundaryState = {
    hasError: boolean;
    didAutoRecover: boolean;
    lastErrorMsg: string;
    retryKey: number;
};

class AdminRenderRecoveryBoundary extends React.Component<
    AdminRenderRecoveryBoundaryProps,
    AdminRenderRecoveryBoundaryState
> {
    declare props: Readonly<AdminRenderRecoveryBoundaryProps>;
    declare setState: (
        state:
            | AdminRenderRecoveryBoundaryState
            | Partial<AdminRenderRecoveryBoundaryState>
            | ((
                  prevState: Readonly<AdminRenderRecoveryBoundaryState>,
                  props: Readonly<AdminRenderRecoveryBoundaryProps>
              ) => AdminRenderRecoveryBoundaryState | Partial<AdminRenderRecoveryBoundaryState> | null)
            | null,
        callback?: () => void
    ) => void;

    state: AdminRenderRecoveryBoundaryState = {
        hasError: false,
        didAutoRecover: false,
        lastErrorMsg: '',
        retryKey: 0,
    };

    static getDerivedStateFromError(err: any) {
        return { hasError: true, lastErrorMsg: String(err?.message || err || '') };
    }

    componentDidCatch(error: any, info: any) {
        // Keep it very explicit in console: we need a readable stack to locate the root cause.
        try {
            console.error('[FLBP][Admin] Render crash caught', { nav: this.props.nav, error, info });
        } catch {
            // ignore
        }

        if (!this.state.didAutoRecover) {
            // Best-effort: clear persisted Admin navigation keys to avoid crash loops.
            clearAdminSessionNavKeys();
            try { this.props.onRecover(); } catch { /* ignore */ }
            // Remount the subtree once to try a safe landing.
            this.setState((s) => ({ hasError: false, didAutoRecover: true, retryKey: s.retryKey + 1 }));
        }
    }

    private handleManualReset = () => {
        clearAdminSessionNavKeys();
        try { this.props.onRecover(); } catch { /* ignore */ }
        this.setState((s) => ({ hasError: false, retryKey: s.retryKey + 1 }));
    };

    render() {
        if (this.state.hasError) {
            const safeLabels = {
                errorTitle: this.props.labels?.errorTitle || 'Admin area render error',
                errorDesc: this.props.labels?.errorDesc || 'I am trying to recover the Admin area without losing the current state.',
                restoreButton: this.props.labels?.restoreButton || 'Try again',
            };
            return (
                <div className="min-h-[50vh] flex items-center justify-center p-6">
                    <div className="max-w-xl w-full bg-white border border-red-200 rounded-2xl p-4">
                        <div className="font-black text-red-800">{safeLabels.errorTitle}</div>
                        <div className="text-xs text-slate-700 font-bold mt-2">
                            {safeLabels.errorDesc}
                        </div>
                        {this.state.lastErrorMsg ? (
                            <div className="mt-3 text-[11px] font-mono text-red-700 bg-red-50 border border-red-100 rounded-xl p-2">
                                {this.state.lastErrorMsg}
                            </div>
                        ) : null}
                        <div className="mt-4 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={this.handleManualReset}
                                className="px-3 py-2 rounded-xl font-black border text-xs bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                            >
                                {safeLabels.restoreButton}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
    }
}


const AdminChunkFallback: React.FC<{ label: string; description: string }> = ({ label, description }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 220);
        return () => window.clearTimeout(timer);
    }, []);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-[92px]" aria-live="polite" aria-busy="true">
            <div className="sr-only">{label}. {description}</div>
            {!visible ? (
                <div className="h-[56px]" aria-hidden />
            ) : (
                <div className="animate-pulse space-y-3" aria-hidden>
                    <div className="h-4 w-40 rounded-full bg-slate-200" />
                    <div className="h-3 w-full max-w-xs rounded-full bg-slate-100" />
                    <div className="h-3 w-5/6 max-w-sm rounded-full bg-slate-100" />
                </div>
            )}
        </div>
    );
};

interface AdminDashboardProps {
    state: AppState;
    setState: (s: AppState) => void;
    onEnterTv: (mode: TvProjection) => void;
}

type LiveAdminTab = 'teams'|'structure'|'reports'|'referees'|'codes'|'monitor_groups'|'monitor_bracket';
type AdminSection = 'live' | 'editor' | 'data';
type AdminTab = LiveAdminTab | 'editor' | 'data';

type AdminChunkTarget = LiveAdminTab | Extract<AdminSection, 'data' | 'editor'>;

const preloadAdminContentChunk = (target: AdminChunkTarget) => {
    switch (target) {
        case 'teams':
            return loadTeamsTabModule();
        case 'structure':
            return loadStructureTabModule();
        case 'reports':
            return loadReportsTabModule();
        case 'referees':
            return loadRefereesTabModule();
        case 'codes':
            return loadCodesTabModule();
        case 'monitor_groups':
            return loadMonitorGroupsTabModule();
        case 'monitor_bracket':
            return loadMonitorBracketTabModule();
        case 'data':
            return loadDataTabModule();
        case 'editor':
            return loadTournamentEditorTabModule();
        default:
            return Promise.resolve(null);
    }
};


export const AdminDashboard: React.FC<AdminDashboardProps> = ({ state, setState, onEnterTv }) => {
    const { t } = useTranslation();
    const commitLiveMatches = (matches: Match[], tournamentOverride?: TournamentData | null) => {
        const nextTournamentBase = tournamentOverride === undefined ? state.tournament : tournamentOverride;
        const nextTournament = nextTournamentBase
            ? { ...nextTournamentBase, matches }
            : nextTournamentBase;
        setState({ ...state, tournament: nextTournament, tournamentMatches: matches });
    };
    const liveOpsSummary = useMemo(() => {
        const matches = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
        const visible = matches.filter((m: any) => !(m as any)?.hidden && !(m as any)?.isBye);
        const playing = visible.find(m => m.status === 'playing');
        const scheduled = visible.find(m => m.status === 'scheduled');
        const current = playing || scheduled || visible[0] || null;
        return {
            total: visible.length,
            playingCount: visible.filter(m => m.status === 'playing').length,
            scheduledCount: visible.filter(m => m.status === 'scheduled').length,
            finishedCount: visible.filter(m => m.status === 'finished').length,
            current,
        };
    }, [state.tournamentMatches]);

    const safeSessionGet = (key: string): string | null => {
        try { return window.sessionStorage.getItem(key); } catch { return null; }
    };
    const safeSessionSet = (key: string, value: string) => {
        try { window.sessionStorage.setItem(key, value); } catch {}
    };
    const safeSessionRemove = (key: string) => {
        try { window.sessionStorage.removeItem(key); } catch {}
    };

    const initialSupabaseSession = useMemo(() => getSupabaseSession(), []);
    const supabaseConfig = useMemo(() => getSupabaseConfig(), []);
    const adminToolsMenuRef = useRef<HTMLDetailsElement | null>(null);
    const [authed, setAuthed] = useState<boolean>(false);
    const [adminAuthMode, setAdminAuthMode] = useState<'none' | 'supabase' | 'legacy' | 'player'>(() => {
        return safeSessionGet(ADMIN_LEGACY_AUTH_LS_KEY) === '1' ? 'legacy' : 'none';
    });
    const [adminAuthEmailInput, setAdminAuthEmailInput] = useState<string>(() => initialSupabaseSession?.email || getConfiguredAdminEmail());
    const [adminAuthPasswordInput, setAdminAuthPasswordInput] = useState<string>('');
    const [supabaseEmail, setSupabaseEmail] = useState<string | null>(() => {
        const s = initialSupabaseSession;
        return (s?.accessToken ? (s.email || getConfiguredAdminEmail()) : null);
    });

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            const menu = adminToolsMenuRef.current;
            const target = event.target as Node | null;
            if (!menu || !menu.hasAttribute('open') || !target) return;
            if (menu.contains(target)) return;
            menu.removeAttribute('open');
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, []);
    const closeAdminToolsMenu = React.useCallback(() => {
        adminToolsMenuRef.current?.removeAttribute('open');
    }, []);
    const [adminAuthError, setAdminAuthError] = useState<string>('');
    const [loginBusy, setLoginBusy] = useState<boolean>(false);
    const [adminSessionChecking, setAdminSessionChecking] = useState<boolean>(() => !!initialSupabaseSession?.accessToken);
    const [adminSyncState, setAdminSyncState] = useState<AdminSyncState>(() => readAdminSyncState());
    const playerBootstrapDeniedKeyRef = useRef<string | null>(null);

    const sessionStorageWritable = useMemo(() => {
        // Best-effort probe: never crash if storage is blocked.
        const key = '__flbp_ss_probe__';
        safeSessionSet(key, '1');
        const ok = safeSessionGet(key) === '1';
        safeSessionRemove(key);
        return ok;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isAppModeLockedForPublicDeploy) return;
        if (!sessionStorageWritable) return;

        const bootKey = 'flbp_admin_mode_bootstrapped';
        if (safeSessionGet(bootKey) === '1') return;
        safeSessionSet(bootKey, '1');

        if (APP_MODE !== 'official') {
            setAppModeOverride('official');
            window.location.reload();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStorageWritable]);

    // Offline/cache controls (service worker)
    const [swDisabled, setSwDisabled] = useState<boolean>(() => {
        try { return localStorage.getItem('flbp_sw_disabled') === '1'; } catch { return false; }
    });

    const bestEffortClearSwCaches = async () => {
        try {
            // Tell SW (if controlling) to clear its caches.
            try {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' });
                }
            } catch {}
            // Unregister all SW registrations.
            try {
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister().catch(() => false)));
                }
            } catch {}
            // Also clear caches from window context (same-origin only).
            try {
                const w = window as any;
                if (w.caches && typeof w.caches.keys === 'function') {
                    const keys = await w.caches.keys();
                    await Promise.all(keys.map((k: string) => w.caches.delete(k)));
                }
            } catch {}
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        return subscribeAdminSyncState(setAdminSyncState);
    }, []);

    const isFatalAdminAccessFailure = React.useCallback((reason: string | null | undefined) => {
        const normalized = String(reason || '').trim();
        return normalized === 'Sessione admin assente o scaduta.'
            || normalized === 'Impossibile determinare l’utente autenticato.'
            || normalized === 'Questo account autenticato non ha ruolo admin in Supabase.';
    }, []);

    const applyAdminAuthState = React.useCallback((email: string, preferLegacy: boolean) => {
        setAuthed(true);
        setAdminAuthError('');
        setSupabaseEmail(email);
        setAdminAuthEmailInput(email);
        setAdminSessionChecking(false);
        if (preferLegacy) {
            setAdminAuthMode('legacy');
            safeSessionSet(ADMIN_LEGACY_AUTH_LS_KEY, '1');
        } else {
            setAdminAuthMode('supabase');
            safeSessionRemove(ADMIN_LEGACY_AUTH_LS_KEY);
        }
    }, []);

    const sessionPrincipalKey = React.useCallback((session?: { email?: string | null; userId?: string | null } | null) => {
        const userId = String(session?.userId || '').trim();
        if (userId) return `uid:${userId}`;
        const email = String(session?.email || '').trim().toLowerCase();
        return email ? `email:${email}` : '';
    }, []);

    const playerBootstrapKey = React.useCallback((session?: { accessToken?: string | null; email?: string | null; userId?: string | null } | null) => {
        const principal = sessionPrincipalKey(session);
        const token = String(session?.accessToken || '').trim();
        if (!principal && !token) return '';
        return `${principal}|${token.slice(0, 24)}`;
    }, [sessionPrincipalKey]);

    const mirrorAdminSessionToPlayer = React.useCallback((session: { accessToken: string; refreshToken?: string | null; expiresAt?: string | null; email?: string | null; userId?: string | null } | null) => {
        if (!session?.accessToken) return;
        const currentPlayerSession = getPlayerSupabaseSession();
        const adminPrincipal = sessionPrincipalKey(session);
        const playerPrincipal = sessionPrincipalKey(currentPlayerSession);
        if (currentPlayerSession?.accessToken && adminPrincipal && playerPrincipal && adminPrincipal !== playerPrincipal) {
            return;
        }
        setPlayerSupabaseSession({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken || null,
            expiresAt: session.expiresAt || null,
            email: session.email || null,
            userId: session.userId || null,
            flowType: 'session',
        });
    }, [sessionPrincipalKey]);

    const adminSessionMatchesPlayer = React.useCallback((adminSession?: { accessToken?: string | null; email?: string | null; userId?: string | null } | null) => {
        const playerSession = getPlayerSupabaseSession();
        if (!adminSession?.accessToken || !playerSession?.accessToken) return false;
        if (adminSession.userId && playerSession.userId && adminSession.userId === playerSession.userId) return true;
        const adminEmail = String(adminSession.email || '').trim().toLowerCase();
        const playerEmail = String(playerSession.email || '').trim().toLowerCase();
        return !!adminEmail && !!playerEmail && adminEmail === playerEmail;
    }, []);

    const tryBootstrapLegacySupabaseSession = React.useCallback(async (): Promise<boolean> => {
        if (!supabaseConfig) return false;
        const configuredEmail = getConfiguredAdminEmail().trim();
        if (!configuredEmail) return false;
        try {
            const result = await signInWithPassword(configuredEmail, ADMIN_LEGACY_BOOTSTRAP_PASSWORD);
            const access = await ensureSupabaseAdminAccess();
            if (!access.ok) {
                await signOutSupabase();
                return false;
            }
            const resolvedEmail = access.email || result.email || configuredEmail;
            mirrorAdminSessionToPlayer({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken || null,
                expiresAt: result.expiresAt || null,
                email: resolvedEmail,
                userId: result.userId || null,
            });
            applyAdminAuthState(resolvedEmail, true);
            return true;
        } catch {
            return false;
        }
    }, [applyAdminAuthState, mirrorAdminSessionToPlayer, supabaseConfig]);

    const tryBootstrapPlayerSupabaseSession = React.useCallback(async (): Promise<boolean> => {
        if (!supabaseConfig) return false;
        const playerSession = await ensureFreshPlayerSupabaseSession();
        if (!playerSession?.accessToken || playerSession.flowType === 'recovery') {
            playerBootstrapDeniedKeyRef.current = null;
            return false;
        }
        const bootstrapKey = playerBootstrapKey(playerSession);
        if (bootstrapKey && playerBootstrapDeniedKeyRef.current === bootstrapKey) {
            return false;
        }
        try {
            setSupabaseSession({
                accessToken: playerSession.accessToken,
                refreshToken: playerSession.refreshToken || null,
                expiresAt: playerSession.expiresAt || null,
                email: playerSession.email || null,
                userId: playerSession.userId || null,
            });
            const access = await ensureSupabaseAdminAccess();
            if (!access.ok) {
                playerBootstrapDeniedKeyRef.current = bootstrapKey || null;
                clearSupabaseSession();
                return false;
            }
            playerBootstrapDeniedKeyRef.current = null;
            const resolvedEmail = access.email || playerSession.email || getConfiguredAdminEmail();
            setAuthed(true);
            setAdminAuthMode('player');
            safeSessionRemove(ADMIN_LEGACY_AUTH_LS_KEY);
            setAdminAuthError('');
            setSupabaseEmail(resolvedEmail);
            setAdminAuthEmailInput(resolvedEmail);
            setAdminSessionChecking(false);
            return true;
        } catch {
            clearSupabaseSession();
            return false;
        }
    }, [playerBootstrapKey, supabaseConfig]);

    useEffect(() => {
        let alive = true;

        const syncSupabaseSessionMeta = async () => {
            const currentAdminAuthMode =
                adminAuthMode === 'legacy' && safeSessionGet(ADMIN_LEGACY_AUTH_LS_KEY) !== '1'
                    ? 'none'
                    : adminAuthMode;

            if (currentAdminAuthMode !== adminAuthMode) {
                setAdminAuthMode(currentAdminAuthMode);
            }

            let session = getSupabaseSession();

            if (currentAdminAuthMode !== 'legacy' && !session?.accessToken) {
                const playerSession = getPlayerSupabaseSession();
                if (playerSession?.accessToken && playerSession.flowType !== 'recovery') {
                    setAdminSessionChecking(true);
                    const bootstrappedFromPlayer = await tryBootstrapPlayerSupabaseSession();
                    if (!alive) return;
                    if (bootstrappedFromPlayer) {
                        return;
                    }
                    session = getSupabaseSession();
                } else {
                    playerBootstrapDeniedKeyRef.current = null;
                }
            }

            const nextEmail = session?.accessToken ? (session.email || getConfiguredAdminEmail()) : null;

            if (!alive) return;
            setSupabaseEmail(nextEmail);
            if (nextEmail) {
                setAdminAuthEmailInput((prev) => prev.trim() ? prev : nextEmail);
            }

            if (!session?.accessToken) {
                if (currentAdminAuthMode === 'legacy') {
                    setAdminSessionChecking(true);
                    const bootstrapped = await tryBootstrapLegacySupabaseSession();
                    if (!alive) return;
                    if (bootstrapped) {
                        return;
                    }
                    setAuthed(true);
                    setAdminAuthError('');
                    setSupabaseEmail(getConfiguredAdminEmail());
                    setAdminAuthEmailInput((prev) => prev.trim() || getConfiguredAdminEmail());
                    setAdminSessionChecking(false);
                    return;
                }
                setAuthed(false);
                setAdminSessionChecking(false);
                return;
            }

            setAdminSessionChecking(true);

            try {
                const access = await ensureSupabaseAdminAccess();
                if (!alive) return;
                if (access.ok) {
                    const resolvedEmail = access.email || nextEmail || getConfiguredAdminEmail();
                    mirrorAdminSessionToPlayer({
                        accessToken: session.accessToken,
                        refreshToken: session.refreshToken || null,
                        expiresAt: session.expiresAt || null,
                        email: resolvedEmail,
                        userId: session.userId || null,
                    });
                    applyAdminAuthState(resolvedEmail, currentAdminAuthMode === 'legacy');
                    return;
                }

                if (isFatalAdminAccessFailure(access.reason)) {
                    if (currentAdminAuthMode === 'player' || adminSessionMatchesPlayer(session)) {
                        clearSupabaseSession();
                    } else {
                        await signOutSupabase();
                    }
                    if (!alive) return;
                    if (currentAdminAuthMode === 'legacy') {
                        setAuthed(true);
                        setSupabaseEmail(getConfiguredAdminEmail());
                        setAdminAuthError('');
                    } else if (currentAdminAuthMode === 'player') {
                        setAuthed(false);
                        setSupabaseEmail(null);
                        setAdminAuthError('');
                    } else {
                        setAuthed(false);
                        setSupabaseEmail(null);
                        setAdminAuthError(access.reason || 'Accesso admin non autorizzato.');
                    }
                }
            } catch {
                // Keep the last known auth state if the network is temporarily unavailable.
            } finally {
                if (alive) setAdminSessionChecking(false);
            }
        };

        void syncSupabaseSessionMeta();
        const onFocus = () => { void syncSupabaseSessionMeta(); };
        const onAuthStateChange = () => { void syncSupabaseSessionMeta(); };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') void syncSupabaseSessionMeta();
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', onAuthStateChange);
        window.addEventListener(SUPABASE_AUTH_STATE_CHANGE_EVENT, onAuthStateChange as EventListener);
        document.addEventListener('visibilitychange', onVisibilityChange);
        const id = window.setInterval(() => { void syncSupabaseSessionMeta(); }, 60000);
        return () => {
            alive = false;
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', onAuthStateChange);
            window.removeEventListener(SUPABASE_AUTH_STATE_CHANGE_EVENT, onAuthStateChange as EventListener);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.clearInterval(id);
        };
    }, [adminAuthMode, adminSessionMatchesPlayer, applyAdminAuthState, isFatalAdminAccessFailure, mirrorAdminSessionToPlayer, tryBootstrapLegacySupabaseSession, tryBootstrapPlayerSupabaseSession]);
    // Macro-sezioni Admin (richiesto: 2 finestre principali)
    const [adminSection, setAdminSection] = useState<AdminSection>(() => {
        const raw = safeSessionGet('flbp_admin_section');
        return raw === 'data' || raw === 'editor' ? raw : 'live';
    });
    const [lastLiveTab, setLastLiveTab] = useState<'teams'|'structure'|'reports'|'referees'|'codes'|'monitor_groups'|'monitor_bracket'>(() => {
        const raw = safeSessionGet('flbp_admin_last_live_tab');
        const ok = raw === 'teams' || raw === 'structure' || raw === 'reports' || raw === 'referees' || raw === 'codes' || raw === 'monitor_groups' || raw === 'monitor_bracket';
        return ok ? (raw as any) : 'teams';
    });
    const [tab, setTab] = useState<AdminTab>(() => {
        if (adminSection === 'data') return 'data';
        if (adminSection === 'editor') return 'editor';
        return lastLiveTab;
    });
    const [editorInitialView, setEditorInitialView] = useState<'groups' | 'bracket'>('groups');
    const [monitorMenuOpen, setMonitorMenuOpen] = useState(false);
    const monitorMenuButtonRef = useRef<HTMLButtonElement | null>(null);
    const [monitorMenuPosition, setMonitorMenuPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const adminNavigationRequestRef = useRef(0);

    const resolveStoredLiveTab = React.useCallback((): LiveAdminTab => {
        const raw = safeSessionGet('flbp_admin_last_live_tab');
        const ok = raw === 'teams' || raw === 'structure' || raw === 'reports' || raw === 'referees' || raw === 'codes' || raw === 'monitor_groups' || raw === 'monitor_bracket';
        return ok ? (raw as LiveAdminTab) : lastLiveTab;
    }, [lastLiveTab]);

    const primeAdminContentChunk = React.useCallback((target: AdminChunkTarget) => {
        void preloadAdminContentChunk(target);
    }, []);

    const openLiveTab = React.useCallback(async (next: LiveAdminTab) => {
        if (adminSection === 'live' && tab === next) return;
        const requestId = ++adminNavigationRequestRef.current;
        try {
            await preloadAdminContentChunk(next);
        } catch {
            // let Suspense/ErrorBoundary handle the actual render failure if the chunk is broken
        }
        if (requestId !== adminNavigationRequestRef.current) return;
        if (adminSection !== 'live') {
            safeSessionSet('flbp_admin_section', 'live');
            setAdminSection('live');
        }
        setTab(next);
        setLastLiveTab(next);
        safeSessionSet('flbp_admin_last_live_tab', next);
    }, [adminSection, tab]);

    const showGroupsMonitor = useMemo(() => {
        const tournamentType = state.tournament?.type;
        if (tournamentType !== 'groups_elimination' && tournamentType !== 'round_robin') return false;
        const hasGroups = (state.tournament?.groups?.length || 0) > 0;
        const hasGroupMatches = (state.tournamentMatches || []).some(m => m.phase === 'groups' && !m.hidden && !m.isBye);
        return hasGroups || hasGroupMatches;
    }, [state.tournament, state.tournamentMatches]);

    const showBracketMonitor = useMemo(() => {
        const tournamentType = state.tournament?.type;
        if (tournamentType !== 'groups_elimination' && tournamentType !== 'elimination') return false;
        const hasRounds = (state.tournament?.rounds?.length || 0) > 0;
        const hasBracketMatches = (state.tournamentMatches || []).some(m => m.phase === 'bracket');
        return hasRounds || hasBracketMatches;
    }, [state.tournament, state.tournamentMatches]);

    const fallbackLiveTab: LiveAdminTab = useMemo(() => {
        if (liveOpsSummary.playingCount > 0) return 'reports';
        if (liveOpsSummary.scheduledCount > 0) return 'codes';
        return 'teams';
    }, [liveOpsSummary.playingCount, liveOpsSummary.scheduledCount]);

    // Pool simulator
    const [poolN, setPoolN] = useState<string>('20');

    // Team form
    const [editingId, setEditingId] = useState<string | null>(null);
    const [teamName, setTeamName] = useState('');
    const [p1, setP1] = useState('');
    const [p2, setP2] = useState('');
    const [y1, setY1] = useState<string>('');
    const [y2, setY2] = useState<string>('');
    const [p1IsReferee, setP1IsReferee] = useState(false);
    const [p2IsReferee, setP2IsReferee] = useState(false);
    const [isReferee, setIsReferee] = useState(false);

    // Structure Config
    const [tournMode, setTournMode] = useState<'elimination'|'groups_elimination'|'round_robin'>('groups_elimination');
    const [numGroups, setNumGroups] = useState(4);
    const [advancing, setAdvancing] = useState(2);
    const [tournName, setTournName] = useState(`${t('admin_tournament_prefix')} ${new Date().toLocaleDateString('it-IT')}`);
    const [tournDate, setTournDate] = useState<string>(() => getTodayInputDate());

    // Optional final round-robin stage (activated at runtime)
    const [finalRrEnabled, setFinalRrEnabled] = useState<boolean>(false);
    const [finalRrTopTeams, setFinalRrTopTeams] = useState<4|8>(4);

    const playableTeamsCount = useMemo(() => {
        // NOTE: Referee teams are still real teams for structure/brackets.
        // Exclude only BYE/hidden (backward-compatible with historical snapshots).
        return (state.teams || []).filter(t => !t.hidden && !t.isBye).length;
    }, [state.teams]);

    // UX guardrails: if the teams list changes and makes the current selection invalid,
    // auto-clamp it to a safe state (no crashes, no confusing disabled-but-selected values).
    useEffect(() => {
        if (playableTeamsCount < 4 && finalRrEnabled) {
            setFinalRrEnabled(false);
        }
        if (playableTeamsCount < 8 && finalRrTopTeams === 8) {
            setFinalRrTopTeams(4);
        }
    }, [playableTeamsCount, finalRrEnabled, finalRrTopTeams]);

    // MVP manual selection (supports ties)
    const [mvpModalOpen, setMvpModalOpen] = useState<boolean>(false);
    const [mvpModalForArchive, setMvpModalForArchive] = useState<boolean>(false);
    const [mvpSearch, setMvpSearch] = useState<string>('');
    const [mvpSelectedIds, setMvpSelectedIds] = useState<string[]>([]);
    const [archiveIncludeU25Awards, setArchiveIncludeU25Awards] = useState<boolean>(true);
    
    // Draft
    const [draft, setDraft] = useState<{t: TournamentData, m: Match[]} | null>(null);

    // Gestione dati (Archivio + Integrazioni)
    const [dataSubTab, setDataSubTab] = useState<'archive'|'integrations'>(() => {
        const raw = safeSessionGet('flbp_admin_data_subtab');
        // backward compat: "hof" era il vecchio nome del tab
        if (raw === 'hof' || raw === 'integrations') return 'integrations';
        return 'archive';
    });

    // Dentro "Integrazioni": Albo d'Oro (manuale) + Marcatori (import) + Alias (manutenzione)
    const [integrationsSubTab, setIntegrationsSubTab] = useState<'hof'|'scorers'|'aliases'|'players'>(() => {
        const raw = safeSessionGet('flbp_admin_integrations_subtab');
        if (raw === 'scorers') return 'scorers';
        if (raw === 'aliases') return 'aliases';
        if (raw === 'players') return 'players';
        return 'hof';
    });

    // Alias globale (manutenzione)
    const [aliasesSearch, setAliasesSearch] = useState<string>('');
    const [aliasToolSelections, setAliasToolSelections] = useState<Record<string, string>>({});

    const [dataSelectedTournamentId, setDataSelectedTournamentId] = useState<string>('');
    const [dataSelectedMatchId, setDataSelectedMatchId] = useState<string>('');
    const [dataScoreA, setDataScoreA] = useState<string>('0');
    const [dataScoreB, setDataScoreB] = useState<string>('0');
    const [dataStatus, setDataStatus] = useState<'scheduled'|'playing'|'finished'>('finished');
    const [dataRecomputeAwards, setDataRecomputeAwards] = useState<boolean>(true);
    const [dataWinnerTeamId, setDataWinnerTeamId] = useState<string>('');
    const [dataTopScorerPlayerId, setDataTopScorerPlayerId] = useState<string>('');
    const [dataDefenderPlayerId, setDataDefenderPlayerId] = useState<string>('');
    const [dataMvpPlayerId, setDataMvpPlayerId] = useState<string>('');

    // UI helpers (Admin tabs)
    const tabBtnClass = (active: boolean) => {
        const base = 'px-4 py-2.5 rounded-xl font-black inline-flex items-center gap-2 border transition-all duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2';
        return `${base} ${active ? 'bg-blue-700/95 backdrop-blur-md text-white border-blue-600 shadow-[0_4px_12px_-2px_rgba(29,78,216,0.3)] transform -translate-y-0.5' : 'bg-white/90 backdrop-blur-sm text-slate-700 border-slate-200/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-white'}`;
    };
    const liveTabMeta: Record<LiveAdminTab, { title: string; helper: string }> = {
        teams: {
            title: t('teams'),
            helper: t('admin_tab_teams_helper'),
        },
        structure: {
            title: t('structure'),
            helper: t('admin_tab_structure_helper'),
        },
        reports: {
            title: t('reports'),
            helper: t('admin_tab_reports_helper'),
        },
        referees: {
            title: t('referees'),
            helper: t('admin_tab_referees_helper'),
        },
        codes: {
            title: t('code_list'),
            helper: t('admin_tab_codes_helper'),
        },
        monitor_groups: {
            title: t('monitor_groups'),
            helper: t('admin_tab_monitor_groups_helper'),
        },
        monitor_bracket: {
            title: t('monitor_bracket'),
            helper: t('admin_tab_monitor_bracket_helper'),
        },
    };
    const currentLiveTab = adminSection === 'live' && tab !== 'data' && tab !== 'editor' ? tab as LiveAdminTab : null;

    useEffect(() => {
        if (adminSection !== 'live') return;
        if (tab === 'monitor_groups' && !showGroupsMonitor) {
            openLiveTab(showBracketMonitor ? 'monitor_bracket' : fallbackLiveTab);
            return;
        }
        if (tab === 'monitor_bracket' && !showBracketMonitor) {
            openLiveTab(showGroupsMonitor ? 'monitor_groups' : fallbackLiveTab);
        }
    }, [adminSection, fallbackLiveTab, showBracketMonitor, showGroupsMonitor, tab]);

    useEffect(() => {
        if (!showGroupsMonitor && !showBracketMonitor) {
            setMonitorMenuOpen(false);
            return;
        }
        if (adminSection !== 'live') {
            setMonitorMenuOpen(false);
        }
    }, [adminSection, showBracketMonitor, showGroupsMonitor]);

    const updateMonitorMenuPosition = React.useCallback(() => {
        const button = monitorMenuButtonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const menuWidth = 240;
        const viewportPadding = 12;
        const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
        setMonitorMenuPosition({
            left: Math.min(Math.max(rect.left, viewportPadding), maxLeft),
            top: rect.bottom + 8,
        });
    }, []);

    useEffect(() => {
        if (!monitorMenuOpen) return;
        updateMonitorMenuPosition();
        const handleWindowUpdate = () => updateMonitorMenuPosition();
        window.addEventListener('resize', handleWindowUpdate);
        window.addEventListener('scroll', handleWindowUpdate, true);
        return () => {
            window.removeEventListener('resize', handleWindowUpdate);
            window.removeEventListener('scroll', handleWindowUpdate, true);
        };
    }, [monitorMenuOpen, updateMonitorMenuPosition]);
    const [dataTopScorerU25PlayerId, setDataTopScorerU25PlayerId] = useState<string>('');
    const [dataDefenderU25PlayerId, setDataDefenderU25PlayerId] = useState<string>('');

    // Albo d'Oro (manuale, senza torneo in archivio)
    const [hofEditId, setHofEditId] = useState<string>('');
    const [hofEditTournamentId, setHofEditTournamentId] = useState<string>('');
    const [hofYear, setHofYear] = useState<string>(() => new Date().getFullYear().toString());
    const [hofTournamentName, setHofTournamentName] = useState<string>('');
    const [hofType, setHofType] = useState<'winner'|'mvp'|'top_scorer'|'defender'|'top_scorer_u25'|'defender_u25'>('winner');
    const [hofTeamName, setHofTeamName] = useState<string>('');
    const [hofWinnerP1, setHofWinnerP1] = useState<string>('');
    const [hofWinnerP2, setHofWinnerP2] = useState<string>('');
    const [hofPlayerName, setHofPlayerName] = useState<string>('');
    const [hofPlayerYoB, setHofPlayerYoB] = useState<string>('');
    const [hofValue, setHofValue] = useState<string>('');

    // Integrazioni marcatori: warning per possibili omonimi / data diversa
    const [scorersImportWarnings, setScorersImportWarnings] = useState<string[]>([]);

    // STEP 10 — Creazione manuale di un torneo archiviato (wizard minimale)
    const [createArchiveOpen, setCreateArchiveOpen] = useState<boolean>(false);
    const [createArchiveStep, setCreateArchiveStep] = useState<'meta'|'teams'|'structure'>('meta');
    const [createArchiveName, setCreateArchiveName] = useState<string>('');
    const [createArchiveDate, setCreateArchiveDate] = useState<string>(() => getTodayInputDate());
    const [createArchiveMode, setCreateArchiveMode] = useState<'elimination'|'groups_elimination'|'round_robin'>('groups_elimination');
    const [createArchiveGroups, setCreateArchiveGroups] = useState<number>(4);
    const [createArchiveAdvancing, setCreateArchiveAdvancing] = useState<number>(2);
    const [createArchiveFinalRrEnabled, setCreateArchiveFinalRrEnabled] = useState<boolean>(false);
    const [createArchiveFinalRrTopTeams, setCreateArchiveFinalRrTopTeams] = useState<4|8>(4);
    const [createArchiveTeams, setCreateArchiveTeams] = useState<Team[]>([]);

    const wizardPlayableTeamsCount = useMemo(() => {
        // NOTE: Referee teams are still real teams for structure/brackets.
        // Exclude only BYE/hidden (backward-compatible with historical snapshots).
        return (createArchiveTeams || []).filter(t => !t.hidden && !t.isBye).length;
    }, [createArchiveTeams]);

    // UX guardrails (wizard): keep selections sane when teams/mode change.
    useEffect(() => {
        if (wizardPlayableTeamsCount < 4 && createArchiveFinalRrEnabled) {
            setCreateArchiveFinalRrEnabled(false);
        }
        if (wizardPlayableTeamsCount < 8 && createArchiveFinalRrTopTeams === 8) {
            setCreateArchiveFinalRrTopTeams(4);
        }
        // Final stage only makes sense for tournaments with bracket.
        if (createArchiveMode === 'round_robin' && createArchiveFinalRrEnabled) {
            setCreateArchiveFinalRrEnabled(false);
        }
    }, [wizardPlayableTeamsCount, createArchiveMode, createArchiveFinalRrEnabled, createArchiveFinalRrTopTeams]);

    // Form team dentro wizard (indipendente dal live)
    const [caTeamName, setCaTeamName] = useState<string>('');
    const [caP1, setCaP1] = useState<string>('');
    const [caY1, setCaY1] = useState<string>('');
    const [caP2, setCaP2] = useState<string>('');
    const [caY2, setCaY2] = useState<string>('');
    const [caP1IsRef, setCaP1IsRef] = useState<boolean>(false);
    const [caP2IsRef, setCaP2IsRef] = useState<boolean>(false);
    const createArchiveFileRef = useRef<HTMLInputElement | null>(null);


const [aliasModalOpen, setAliasModalOpen] = useState<boolean>(false);
const [aliasModalTitle, setAliasModalTitle] = useState<string>('');
const [aliasModalConflicts, setAliasModalConflicts] = useState<AliasConflict[]>([]);
const [pendingTeamSave, setPendingTeamSave] = useState<Team | null>(null);
const [pendingScorersImport, setPendingScorersImport] = useState<{ entries: IntegrationScorerEntry[]; warnings: string[] } | null>(null);


    // Lista Codici filter
    const [codesStatusFilter, setCodesStatusFilter] = useState<'all'|'scheduled'|'playing'|'finished'>('all');

    // Arbitri (turni tavoli)
    // Source of truth (when live tournament exists): tournament.config.refTables (optional, persisted).
    // Fallback: localStorage flbp_ref_tables (legacy per-device).
    const [refTables, setRefTables] = useState<number>(() => {
        const rawFromTournament = (state.tournament && (state.tournament.config as any)?.refTables) ?? undefined;
        const fromTournament = typeof rawFromTournament === 'number' && Number.isFinite(rawFromTournament)
            ? rawFromTournament
            : parseInt(String(rawFromTournament || ''), 10);
        if (Number.isFinite(fromTournament) && fromTournament > 0) return Math.floor(fromTournament);

        const raw = localStorage.getItem('flbp_ref_tables');
        const n = raw ? parseInt(raw, 10) : 8;
        return Number.isFinite(n) && n > 0 ? n : 8;
    });

    // Keep refTables aligned when switching/starting a live tournament (persisted config wins).
    useEffect(() => {
        if (!state.tournament) return;
        const raw = (state.tournament.config as any)?.refTables;
        const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : parseInt(String(raw || ''), 10);
        if (!Number.isFinite(n) || n <= 0) return;
        const next = Math.floor(n);
        if (next !== refTables) setRefTables(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.tournament?.id]);

    // Persist the admin "tavoli" value into the live tournament config (optional; backward-compatible).
    useEffect(() => {
        if (!state.tournament) return;
        const n = Math.max(1, Math.floor(refTables || 1));
        const cur = (state.tournament.config as any)?.refTables;
        if (cur === n) return;
        const nextTournament = {
            ...state.tournament,
            config: {
                ...state.tournament.config,
                refTables: n
            }
        };
        setState({ ...state, tournament: nextTournament });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refTables, state.tournament?.id]);


    // Simulazioni
    const [simBusy, setSimBusy] = useState<boolean>(false);

    // Referti (manual + immagine allineata)
    const [reportMatchId, setReportMatchId] = useState<string>('');
    const [reportStatus, setReportStatus] = useState<'scheduled'|'playing'|'finished'>('finished');
    const [reportScoreA, setReportScoreA] = useState<string>('0');
    const [reportScoreB, setReportScoreB] = useState<string>('0');
    const [reportStatsForm, setReportStatsForm] = useState<Record<string, { canestri: string; soffi: string }>>({});
    const [reportImageUrl, setReportImageUrl] = useState<string>('');
    const [reportImageBusy, setReportImageBusy] = useState<boolean>(false);
    const [reportOcrText, setReportOcrText] = useState<string>('');
    const [reportOcrBusy, setReportOcrBusy] = useState<boolean>(false);
    const reportFileRef = useRef<HTMLInputElement | null>(null);
    const backupRef = useRef<HTMLInputElement | null>(null);

    const fileRef = useRef<HTMLInputElement | null>(null);

    const scorersFileRef = useRef<HTMLInputElement | null>(null);

    const normalizeName = (n: string) => normalizeNameLower(n);

const labelFromPlayerKey = (key: string) => {
    const { name, yob } = getPlayerKeyLabel(key);
    return `${name} (${yob})`;
};

const buildProfilesIndex = (excludeTeamId?: string) => {
    const idx = new Map<string, Set<string>>();

    const add = (name: string, yob?: number, birthDate?: string) => {
        const norm = normalizeName(name);
        if (!norm) return;

        const rawKey = getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob));
        const canon = resolvePlayerKey(state, rawKey);

        const set = idx.get(norm) || new Set<string>();
        set.add(canon);
        idx.set(norm, set);
    };

    // roster live (tournament teams)
    (state.teams || [])
        .filter(t => !excludeTeamId || t.id !== excludeTeamId)
        .forEach(t => {
            if (t.player1) add(t.player1, t.player1YoB, (t as any).player1BirthDate);
            if (t.player2) add(t.player2, t.player2YoB, (t as any).player2BirthDate);
        });

    // roster archiviati
    (state.tournamentHistory || []).forEach(tour => {
        (tour.teams || []).forEach(t => {
            if (t.player1) add(t.player1, t.player1YoB, (t as any).player1BirthDate);
            if (t.player2) add(t.player2, t.player2YoB, (t as any).player2BirthDate);
        });
    });

    // integrazioni marcatori
    (state.integrationsScorers || []).forEach(e => add(e.name, e.yob, (e as any).birthDate));

    return idx;
};

const setAlias = (fromKey: string, toKey: string) => {
    const from = (fromKey || '').trim();
    const to = (toKey || '').trim();
    if (!from || !to || from === to) return;
    const next = { ...(state.playerAliases || {}), [from]: to };
    setState({ ...state, playerAliases: next });
};

const removeAlias = (fromKey: string) => {
    const from = (fromKey || '').trim();
    if (!from) return;
    const next = { ...(state.playerAliases || {}) };
    delete next[from];
    setState({ ...state, playerAliases: next });
};

const makeAliasConflict = (name: string, yob?: number, index?: Map<string, Set<string>>, birthDate?: string): AliasConflict | null => {
    const norm = normalizeName(name);
    if (!norm) return null;

    const rawKey = getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob));
    const resolved = resolvePlayerKey(state, rawKey);

    // già integrato altrove
    if (resolved !== rawKey) return null;

    const set = (index || buildProfilesIndex()).get(norm);
    if (!set || set.size === 0) return null;

    // se esiste già lo stesso profilo (stesso PlayerKey), non è un "anno diverso" → nessun prompt
    if (set.has(resolved)) return null;

    const candidates = Array.from(set)
        .filter(k => k !== resolved)
        .map(k => ({ key: k, label: labelFromPlayerKey(k) }));

    if (candidates.length === 0) return null;

    return {
        id: uuid(),
        sourceKey: rawKey,
        sourceName: name,
        sourceYoB: formatBirthDateDisplay(birthDate) || (yob ? String(yob) : 'ND'),
        candidates,
        action: 'separate'
    };
};

    const toInt = (v: any): number | undefined => {
        const raw = String(v ?? '').trim();
        if (!raw) return undefined;
        const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : undefined;
    };

    const importScorersFromFile = async (file: File): Promise<{ entries: IntegrationScorerEntry[]; warnings: string[] }> => {
        const XLSX = await getXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        const getField = (row: Record<string, any>, candidates: string[]) => {
            const cand = new Set(candidates.map(normalizeCol));
            for (const k of Object.keys(row)) {
                if (cand.has(normalizeCol(k))) return row[k];
            }
            return '';
        };

        const profilesIndex = buildProfilesIndex();


        const entries: IntegrationScorerEntry[] = [];
        const warnings: string[] = [];

        rows.forEach((r, idx) => {
            const name = String(getField(r, ['Nome', 'Giocatore', 'Player', 'CognomeNome', 'Cognome Nome', 'Name'])).trim();
            if (!name) return;

            const birthDate = normalizeBirthDateInput(String(getField(r, ['DataNascita', 'Data di nascita', 'BirthDate', 'DOB', 'NascitaCompleta']) || ''));
            const yob = deriveYoBFromBirthDate(birthDate);
            const games = Math.max(0, toInt(getField(r, ['Partite', 'Gare', 'Games', 'Played'])) || 0);
            const points = Math.max(0, toInt(getField(r, ['Canestri', 'Punti', 'Points', 'PT'])) || 0);
            const soffi = Math.max(0, toInt(getField(r, ['Soffi', 'SF', 'Blows'])) || 0);

            const norm = normalizeName(name);
            const yobStr = formatBirthDateDisplay(birthDate) || 'ND';
            const rawKey = getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob));
            const resolved = resolvePlayerKey(state, rawKey);
            const existingKeys = profilesIndex.get(norm);
            if (existingKeys && existingKeys.size > 0 && resolved === rawKey && !existingKeys.has(resolved)) {
                const list = Array.from(existingKeys).map(k => labelFromPlayerKey(k)).join(' | ');
                warnings.push(`${name} · esistenti: ${list} · import: ${yobStr} (riga ${idx + 2})`);
            }

            entries.push({
                id: `sc_${uuid()}`,
                name,
                yob,
                birthDate,
                games,
                points,
                soffi,
                createdAt: Date.now(),
                source: file.name
            });
        });

        return { entries, warnings };
    };

    const resetForm = () => {
        setEditingId(null);
        setTeamName('');
        setP1('');
        setP2('');
        setY1('');
        setY2('');
        setP1IsReferee(false);
        setP2IsReferee(false);
        setIsReferee(false);
    };

    // STEP 10 — reset wizard "Nuovo torneo archiviato"
    const resetCreateArchiveWizard = () => {
        setCreateArchiveOpen(false);
        setCreateArchiveStep('meta');
        setCreateArchiveName('');
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setCreateArchiveDate(`${yyyy}-${mm}-${dd}`);
        setCreateArchiveMode('groups_elimination');
        setCreateArchiveGroups(4);
        setCreateArchiveAdvancing(2);
        setCreateArchiveFinalRrEnabled(false);
        setCreateArchiveFinalRrTopTeams(4);
        setCreateArchiveTeams([]);
        setCaTeamName('');
        setCaP1('');
        setCaY1('');
        setCaP2('');
        setCaY2('');
        setCaP1IsRef(false);
        setCaP2IsRef(false);
    };

    const openCreateArchiveWizard = () => {
        setCreateArchiveOpen(true);
        setCreateArchiveStep('meta');
        if (!createArchiveName.trim()) {
            setCreateArchiveName(`${t('admin_tournament_prefix')} ${createArchiveDate}`);
        }
    };

    const addWizardTeam = () => {
        if (!caTeamName.trim() || !caP1.trim() || !caP2.trim()) {
            alert(t('alert_fill_team_players'));
            return;
        }
        const player1BirthDate = normalizeBirthDateInput(caY1);
        const player2BirthDate = normalizeBirthDateInput(caY2);
        if (caY1.trim() && !player1BirthDate) {
            alert(t('birthdate_invalid'));
            return;
        }
        if (caY2.trim() && !player2BirthDate) {
            alert(t('birthdate_invalid'));
            return;
        }
        const k = caTeamName.trim().toLowerCase();
        const exists = (createArchiveTeams || []).some(tt => (tt.name || '').trim().toLowerCase() === k);
        if (exists) {
            if (!confirm(t('admin_wizard_duplicate_team_confirm'))) return;
        }
        const team: Team = {
            id: uuid(),
            name: caTeamName.trim(),
            player1: caP1.trim(),
            player2: caP2.trim(),
            player1YoB: deriveYoBFromBirthDate(player1BirthDate),
            player2YoB: deriveYoBFromBirthDate(player2BirthDate),
            player1BirthDate,
            player2BirthDate,
            player1IsReferee: caP1IsRef,
            player2IsReferee: caP2IsRef,
            isReferee: (caP1IsRef || caP2IsRef),
            createdAt: Date.now()
        };
        setCreateArchiveTeams([...(createArchiveTeams || []), team]);
        setCaTeamName('');
        setCaP1('');
        setCaY1('');
        setCaP2('');
        setCaY2('');
        setCaP1IsRef(false);
        setCaP2IsRef(false);
    };

    const removeWizardTeam = (id: string) => {
        setCreateArchiveTeams((createArchiveTeams || []).filter(t => t.id !== id));
    };

    const copyLiveTeamsIntoWizard = () => {
        if (!(state.teams || []).length) {
            alert(t('alert_no_live_teams_copy'));
            return;
        }
        if ((createArchiveTeams || []).length) {
            if (!confirm(t('admin_wizard_overwrite_live_confirm'))) return;
        }
        // copia profonda con nuovi id per evitare collisioni
        const copied = (state.teams || []).map(t => ({ ...t, id: uuid() }));
        setCreateArchiveTeams(copied);
        alert(`${t('admin_live_teams_copied')}: ${copied.length}`);
    };

    const createArchivedTournament = () => {
        const nm = createArchiveName.trim();
        if (!nm) {
            alert(t('alert_enter_tournament_name'));
            return;
        }
        const teamsCount = (createArchiveTeams || []).length;
        if (teamsCount < 1) {
            alert(t('alert_min_1_team'));
            return;
        }
        // data
        const dateIso = `${createArchiveDate}T00:00:00.000Z`;
        // dup name
        const sameName = (state.tournamentHistory || []).some(t => (t.name || '').trim().toLowerCase() === nm.toLowerCase());
        if (sameName) {
            if (!confirm(t('admin_archive_duplicate_name_confirm'))) return;
        }

        const finalRoundRobin = (createArchiveMode !== 'round_robin' && createArchiveFinalRrEnabled)
            ? { enabled: true, topTeams: createArchiveFinalRrTopTeams, activated: false }
            : undefined;

        const newId = `arch_${uuid()}`;

        let nextTournament: TournamentData;

        if (teamsCount >= 2) {
            const { tournament, matches } = generateTournamentStructure(createArchiveTeams, {
                mode: createArchiveMode,
                numGroups: createArchiveMode === 'groups_elimination' ? createArchiveGroups : undefined,
                advancingPerGroup: createArchiveMode === 'groups_elimination' ? createArchiveAdvancing : undefined,
                tournamentName: nm,
                finalRoundRobin,
            });

            const baseAdvancing = createArchiveMode === 'groups_elimination'
                ? createArchiveAdvancing
                : (createArchiveMode === 'round_robin' ? 0 : 2);

            nextTournament = {
                ...tournament,
                id: newId,
                name: nm,
                startDate: dateIso,
                type: createArchiveMode,
                teams: createArchiveTeams,
                matches,
                rounds: tournament.rounds,
                groups: tournament.groups,
                config: {
                    advancingPerGroup: baseAdvancing,
                    ...(finalRoundRobin ? { finalRoundRobin } : {}),
                },
                isManual: true
            };
        } else {
            // Archivio "incompleto": consente inserimento di un solo team/singolo e soli riconoscimenti (senza struttura).
            nextTournament = {
                id: newId,
                name: nm,
                startDate: dateIso,
                type: createArchiveMode,
                teams: createArchiveTeams,
                matches: [],
                rounds: [],
                groups: [],
                config: { advancingPerGroup: 0 },
                isManual: true
            };
        }

        const nextHistory = [...(state.tournamentHistory || []), nextTournament];
        const nextHallOfFame = syncArchivedHistoryToHallOfFame({
            ...state,
            tournamentHistory: nextHistory,
            hallOfFame: state.hallOfFame || [],
        });
        setState({ ...state, tournamentHistory: nextHistory, hallOfFame: nextHallOfFame });

        // seleziona subito il torneo creato
        setDataSelectedTournamentId(newId);
        setDataSelectedMatchId('');
        setDataWinnerTeamId('');
        setDataTopScorerPlayerId('');
        setDataDefenderPlayerId('');
        setDataMvpPlayerId('');
        setDataTopScorerU25PlayerId('');
        setDataDefenderU25PlayerId('');

        setCreateArchiveOpen(false);
        setCreateArchiveStep('meta');
        alert(t('alert_archived_created'));
    };

    const switchAdminSection = React.useCallback(async (next: AdminSection) => {
        const targetChunk: AdminChunkTarget = next === 'live' ? resolveStoredLiveTab() : next;
        const requestId = ++adminNavigationRequestRef.current;
        try {
            await preloadAdminContentChunk(targetChunk);
        } catch {
            // let Suspense/ErrorBoundary handle the actual render failure if the chunk is broken
        }
        if (requestId !== adminNavigationRequestRef.current) return;
        safeSessionSet('flbp_admin_section', next);
        setAdminSection(next);
        if (next === 'data' || next === 'editor') {
            // memorizza tab live corrente
            if (tab !== 'data' && tab !== 'editor') {
                setLastLiveTab(tab);
                safeSessionSet('flbp_admin_last_live_tab', tab);
            }
            setTab(next);
        } else {
            const nextTab = resolveStoredLiveTab();
            setTab(nextTab);
        }
    }, [resolveStoredLiveTab, tab]);

    const openTournamentEditor = React.useCallback((view: 'groups' | 'bracket' = 'groups') => {
        setEditorInitialView(view);
        void void switchAdminSection('editor');
    }, [switchAdminSection]);


    useEffect(() => {
        let cancelled = false;
        let idleId: number | null = null;
        let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

        const targets = new Set<AdminChunkTarget>();
        if (adminSection === 'live') {
            targets.add(tab === 'reports' ? 'reports' : 'teams');
            targets.add('reports');
            targets.add('codes');
            if (showGroupsMonitor) targets.add('monitor_groups');
            if (showBracketMonitor) targets.add('monitor_bracket');
        } else if (adminSection === 'data') {
            targets.add('data');
        } else if (adminSection === 'editor') {
            targets.add('editor');
        }

        const warmup = async () => {
            for (const target of targets) {
                if (cancelled) return;
                try {
                    await preloadAdminContentChunk(target);
                } catch {
                    // ignore preload failures: the actual tab still has its own boundary/fallback
                }
            }
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            idleId = window.requestIdleCallback(() => {
                void warmup();
            }, { timeout: import.meta.env.DEV ? 2200 : 1200 }) as unknown as number;
        } else {
            timeoutId = globalThis.setTimeout(() => {
                void warmup();
            }, import.meta.env.DEV ? 900 : 180);
        }

        return () => {
            cancelled = true;
            if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(idleId as unknown as number);
            }
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId);
            }
        };
    }, [adminSection, showBracketMonitor, showGroupsMonitor, tab]);

    useEffect(() => {
        const onOpenDataPersistence = () => {
            safeSessionSet('flbp_admin_data_main_section', 'persistence');
            void switchAdminSection('data');
        };
        const onOpenDataViews = () => {
            safeSessionSet('flbp_admin_data_main_section', 'views');
            void switchAdminSection('data');
        };
        window.addEventListener('flbp:open-data-persistence', onOpenDataPersistence as EventListener);
        window.addEventListener('flbp:open-data-views', onOpenDataViews as EventListener);
        return () => {
            window.removeEventListener('flbp:open-data-persistence', onOpenDataPersistence as EventListener);
            window.removeEventListener('flbp:open-data-views', onOpenDataViews as EventListener);
        };
    }, []);

    const sortedTeams = useMemo(() => {
        return [...(state.teams || [])];
    }, [state.teams]);

    // When a live tournament is active, keep its roster (tournament.teams) in sync with the global catalog (state.teams).
    // This allows late-added teams (after the live started) to be selectable in bracket/groups tools and to resolve names.
    const mergeIntoLiveTournamentTeams = (tournament: TournamentData | undefined, globalTeams: Team[]): TournamentData | undefined => {
        if (!tournament) return tournament;
        const liveTeams = Array.isArray(tournament.teams) ? tournament.teams : [];
        const globals = Array.isArray(globalTeams) ? globalTeams : [];

        const globalById = new Map<string, Team>();
        for (const gt of globals) globalById.set(gt.id, gt);

        const liveById = new Map<string, Team>();
        for (const lt of liveTeams) liveById.set(lt.id, lt);

        let changed = false;
        const nextLiveTeams: Team[] = liveTeams.map((lt) => {
            const gt = globalById.get(lt.id);
            if (!gt) return lt;
            const merged = { ...lt, ...gt };
            // mark changed only on key fields we show in UI
            if (
                lt.name !== merged.name ||
                lt.player1 !== merged.player1 ||
                lt.player2 !== merged.player2 ||
                lt.player1YoB !== merged.player1YoB ||
                lt.player2YoB !== merged.player2YoB ||
                (lt as any).player1IsReferee !== (merged as any).player1IsReferee ||
                (lt as any).player2IsReferee !== (merged as any).player2IsReferee ||
                (lt as any).isReferee !== (merged as any).isReferee
            ) {
                changed = true;
            }
            return merged;
        });

        for (const gt of globals) {
            if (!liveById.has(gt.id)) {
                nextLiveTeams.push(gt);
                changed = true;
            }
        }

        if (!changed) return tournament;
        return { ...tournament, teams: nextLiveTeams };
    };

    const allPlayers = useMemo(() => {
        const out: { id: string; name: string; label: string }[] = [];
        (state.teams || []).forEach(team => {
            const p1Id = resolvePlayerKey(state, getPlayerKey(team.player1, (team as any).player1BirthDate || 'ND'));
            const p2Id = resolvePlayerKey(state, getPlayerKey(team.player2, (team as any).player2BirthDate || 'ND'));
            const y1 = formatBirthDateDisplay((team as any).player1BirthDate) || 'ND';
            const y2 = formatBirthDateDisplay((team as any).player2BirthDate) || 'ND';
            out.push({ id: p1Id, name: team.player1, label: `${team.player1} (${y1})` });
            out.push({ id: p2Id, name: team.player2, label: `${team.player2} (${y2})` });
        });
        // unique by id
        const seen = new Set<string>();
        return out.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    }, [state.teams]);

    const getExistingTournamentMvpIds = () => {
        if (!state.tournament) return [] as string[];
        const tid = state.tournament.id;
        const fromHof = (state.hallOfFame || [])
            .filter(e => e.tournamentId === tid && e.type === 'mvp')
            .map(e => e.playerId ? resolvePlayerKey(state, e.playerId) : undefined)
            .filter(Boolean) as string[];
        // Fallback: if some MVPs were stored without playerId, try to match by unique name.
        if (fromHof.length) {
            const seen = new Set<string>();
            return fromHof.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
        }
        return [];
    };

    const openMvpModal = (forArchive: boolean) => {
        if (!state.tournament) {
            alert(t('alert_no_live_selected'));
            return;
        }
        setMvpModalForArchive(forArchive);
        if (forArchive) setArchiveIncludeU25Awards(true);
        setMvpSearch('');
        setMvpSelectedIds(getExistingTournamentMvpIds());
        setMvpModalOpen(true);
    };

    const applyMvpsToState = (base: AppState, selectedIds: string[]) => {
        if (!base.tournament) return base;
        const selected = (selectedIds || []).map(id => allPlayers.find(p => p.id === id)).filter(Boolean) as any[];
        const payload = selected.map(p => ({ name: p.name, id: p.id }));
        return setTournamentMvps(base, base.tournament.id, base.tournament.name, payload);
    };

    const handleArchive = () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }
        if (confirm(t('confirm_archive'))) {
            // As requested: on tournament conclusion we ask to indicate MVP (supports ties).
            openMvpModal(true);
        }
    };

    const handleDeleteLiveTournament = () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }

        const tournamentName = state.tournament.name?.trim() || t('admin_delete_live_tournament_fallback_name');
        if (!confirm(t('admin_delete_live_tournament_confirm').replace('{name}', tournamentName))) {
            return;
        }
        if (!confirm(t('admin_delete_live_tournament_confirm_second').replace('{name}', tournamentName))) {
            return;
        }

        recoverToSafeAdmin();
        setState({
            ...state,
            tournament: null,
            tournamentMatches: [],
        });
        alert(t('admin_delete_live_tournament_done').replace('{name}', tournamentName));
    };

    const saveTeam = () => {
        if (!teamName.trim() || !p1.trim() || !p2.trim()) {
            alert(t('alert_fill_teamname_players'));
            return;
        }
        const player1Parts = splitCanonicalPlayerName(p1);
        const player2Parts = splitCanonicalPlayerName(p2);
        if (!player1Parts.firstName || !player1Parts.lastName || !player2Parts.firstName || !player2Parts.lastName) {
            alert(t('alert_fill_teamname_players'));
            return;
        }

        const player1BirthDate = normalizeBirthDateInput(y1);
        const player2BirthDate = normalizeBirthDateInput(y2);
        if (y1.trim() && !player1BirthDate) {
            alert(t('birthdate_invalid'));
            return;
        }
        if (y2.trim() && !player2BirthDate) {
            alert(t('birthdate_invalid'));
            return;
        }

        // Evita duplicati accidentali: se non stai modificando una squadra esistente e il nome esiste già,
        // chiedi conferma prima di inserirla.
        if (!editingId) {
            const k = teamName.trim().toLowerCase();
            const exists = (state.teams || []).some(tt => (tt.name || '').trim().toLowerCase() === k);
            if (exists) {
                if (!confirm(t('admin_duplicate_team_confirm'))) return;
            }
        }
        const next: Team = {
            id: editingId ?? uuid(),
            name: teamName.trim(),
            player1: p1.trim(),
            player2: p2.trim(),
            player1YoB: deriveYoBFromBirthDate(player1BirthDate),
            player2YoB: deriveYoBFromBirthDate(player2BirthDate),
            player1BirthDate,
            player2BirthDate,
            player1IsReferee: p1IsReferee,
            player2IsReferee: p2IsReferee,
            isReferee: (p1IsReferee || p2IsReferee || isReferee),
            createdAt: Date.now()
        };


// Conflitti Nome+data di nascita. Se il nome esiste già con data diversa o mancante,
// permetti di "integrare" (alias) o mantenere separato.
const idxProfiles = buildProfilesIndex(editingId || undefined);
const conflicts: AliasConflict[] = [];
const c1 = makeAliasConflict(next.player1, next.player1YoB, idxProfiles, (next as any).player1BirthDate);
if (c1) conflicts.push(c1);
const c2 = makeAliasConflict(next.player2, next.player2YoB, idxProfiles, (next as any).player2BirthDate);
if (c2) conflicts.push(c2);

if (conflicts.length > 0) {
    setAliasModalTitle(`${t('possible_homonyms_birthdate')} — ${t('teams')}`);
    setAliasModalConflicts(conflicts);
    setPendingTeamSave(next);
    setPendingScorersImport(null);
    setAliasModalOpen(true);
    return;
}


        const teams = [...(state.teams || [])];
        let nextState = state;
        const idx = teams.findIndex(t => t.id === next.id);
        const currentTeam = idx >= 0 ? teams[idx] : null;
        if (currentTeam) {
            const playerCorrections = [
                {
                    previousName: String(currentTeam.player1 || '').trim(),
                    previousBirthDate: normalizeBirthDateInput((currentTeam as any).player1BirthDate) || undefined,
                    previousYoB: currentTeam.player1YoB,
                    nextName: next.player1,
                    nextBirthDate: next.player1BirthDate,
                },
                {
                    previousName: String(currentTeam.player2 || '').trim(),
                    previousBirthDate: normalizeBirthDateInput((currentTeam as any).player2BirthDate) || undefined,
                    previousYoB: currentTeam.player2YoB,
                    nextName: next.player2 || '',
                    nextBirthDate: next.player2BirthDate,
                },
            ].filter((row) => {
                if (!row.previousName || !row.nextName) return false;
                return row.previousName !== row.nextName || (row.previousBirthDate || '') !== (row.nextBirthDate || '');
            });

            playerCorrections.forEach((row) => {
                const currentPlayerId = resolvePlayerKey(
                    nextState,
                    getPlayerKey(row.previousName, pickPlayerIdentityValue(row.previousBirthDate, row.previousYoB))
                );
                nextState = updatePlayerProfileIdentity(nextState, {
                    currentPlayerId,
                    nextPlayerName: row.nextName,
                    nextBirthDate: row.nextBirthDate,
                });
            });
        }

        const nextTeams = [...(nextState.teams || [])];
        const nextIdx = nextTeams.findIndex(t => t.id === next.id);
        if (nextIdx >= 0) nextTeams[nextIdx] = { ...nextTeams[nextIdx], ...next };
        else nextTeams.push(next);

        const nextTournament = mergeIntoLiveTournamentTeams(nextState.tournament, nextTeams);
        setState({ ...nextState, teams: nextTeams, tournament: nextTournament });
        resetForm();
    };


const closeAliasModal = () => {
    setAliasModalOpen(false);
    setAliasModalConflicts([]);
    setPendingTeamSave(null);
    setPendingScorersImport(null);
};

const confirmAliasModal = () => {
    const updates: Record<string, string> = {};
    (aliasModalConflicts || []).forEach(c => {
        if (c.action === 'merge' && c.targetKey) {
            updates[c.sourceKey] = c.targetKey;
        }
    });

    const nextAliases = { ...(state.playerAliases || {}), ...updates };
    let nextState: AppState = { ...state, playerAliases: nextAliases };

    if (pendingTeamSave) {
        const teams = [...(nextState.teams || [])];
        const idx = teams.findIndex(t => t.id === pendingTeamSave.id);
        if (idx >= 0) teams[idx] = { ...teams[idx], ...pendingTeamSave };
        else teams.push(pendingTeamSave);
        nextState = { ...nextState, teams };
        resetForm();
    }

    if (pendingScorersImport) {
        nextState = {
            ...nextState,
            integrationsScorers: [...(nextState.integrationsScorers || []), ...(pendingScorersImport.entries || [])]
        };
    }

    setState(nextState);
    closeAliasModal();
};


    const editTeam = (id: string) => {
        const t = (state.teams || []).find(x => x.id === id);
        if (!t) return;
        setEditingId(t.id);
        setTeamName(t.name || '');
        setP1(t.player1 || '');
        setP2(t.player2 || '');
        setY1(formatBirthDateDisplay((t as any).player1BirthDate) || '');
        setY2(formatBirthDateDisplay((t as any).player2BirthDate) || '');
        setP1IsReferee(!!(t as any).player1IsReferee || (!!t.isReferee && !(t as any).player2IsReferee));
        setP2IsReferee(!!(t as any).player2IsReferee);
        setIsReferee(!!t.isReferee);
        setTab('teams');
    };

    const deleteTeam = (id: string) => {
        const t = (state.teams || []).find(x => x.id === id);
        if (!t) return;
        if (!confirm(`${t('admin_delete_team_confirm_prefix')} "${t.name}"?`)) return;
        setState({ ...state, teams: (state.teams || []).filter(x => x.id !== id) });
    };

    const clearTeams = () => {
        if (!confirm(t('admin_clear_teams_confirm'))) return;
        setState({ ...state, teams: [] });
    };

    const exportTeamsXlsx = async () => {
        const XLSX = await getXLSX();
        const rows = (state.teams || []).map(t => {
            const player1Parts = splitCanonicalPlayerName(t.player1 || '');
            const player2Parts = splitCanonicalPlayerName(t.player2 || '');
            return {
                Squadra: t.name,
                Nome1: player1Parts.firstName,
                Cognome1: player1Parts.lastName,
                DataNascita1: formatBirthDateDisplay((t as any).player1BirthDate) || '',
                Arbitro1: (t as any).player1IsReferee ? 'SI' : 'NO',
                Nome2: player2Parts.firstName,
                Cognome2: player2Parts.lastName,
                DataNascita2: formatBirthDateDisplay((t as any).player2BirthDate) || '',
                Arbitro2: (t as any).player2IsReferee ? 'SI' : 'NO',
                Arbitro: ((t as any).player1IsReferee || (t as any).player2IsReferee || t.isReferee) ? 'SI' : 'NO'
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Squadre');
        XLSX.writeFile(wb, `flbp_squadre_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const exportBackupJson = async () => {
        try {
            let liveAccountsExport: { accounts: Awaited<ReturnType<typeof pullAdminPlayerAccounts>>; adminUsers: Awaited<ReturnType<typeof pullAdminUserRoles>> } | null = null;
            let liveAccountsError = '';
            try {
                const [accounts, adminUsers] = await Promise.all([
                    pullAdminPlayerAccounts(),
                    pullAdminUserRoles(),
                ]);
                liveAccountsExport = { accounts, adminUsers };
            } catch (error: any) {
                liveAccountsError = String(error?.message || error || '').trim();
            }

            const payload = JSON.stringify(
                buildUnifiedBackupJsonExport(state, { playerAccounts: liveAccountsExport }),
                null,
                2
            );
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flbp_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            if (!liveAccountsExport && liveAccountsError) {
                alert(
                    `${t('alert_export_backup_accounts_partial')}\n\n${liveAccountsError}`
                );
            }
        } catch (e) {
            alert(t('alert_export_backup_fail'));
        }
    };

    const restoreBackupJson = async (file: File) => {
        try {
            const txt = await file.text();
            const raw = JSON.parse(txt);
            const report = inspectBackupJsonState(raw);
            if (!report.isValid) {
                alert(`${t('alert_backup_invalid')}\n\n- ${report.blockers.join('\n- ')}`);
                return;
            }

            const parsed = parseBackupJsonState(raw);
            const warningText = report.warnings.length
                ? `\n\n${t('admin_notes')}:\n- ${report.warnings.join('\n- ')}`
                : '';
            const summaryText =
                `${t('teams')}: ${report.summary.teams}\n` +
                `${t('reports')}: ${report.summary.matches}\n` +
                `${t('tournaments')}: ${report.summary.tournamentHistory}${report.summary.hasLiveTournament ? ' + live' : ''}\n` +
                `${t('hof')}: ${report.summary.hallOfFame}\n` +
                `${t('admin_scorers_integrations')}: ${report.summary.integrationsScorers}\n` +
                `${t('aliases_label')}: ${report.summary.aliases}\n` +
                `${t('admin_yob_legacy_summary')}: ${t('admin_yob_live_teams')}: ${report.summary.liveTeamsWithLegacyYoB}, ${t('admin_yob_live_tournament')}: ${report.summary.liveTournamentTeamsWithLegacyYoB}, ${t('historical')}: ${report.summary.historyTeamsWithLegacyYoB}, ${t('scorers')}: ${report.summary.scorerEntriesWithLegacyYoB}`;

            if (!confirm(`${t('admin_restore_backup_confirm')}\n\n${summaryText}${warningText}`)) return;
            setState(parsed);
            alert(t('alert_backup_restored'));
        } catch (e) {
            alert(t('alert_backup_invalid'));
        }
    };

    const mergeBackupJson = async (file: File) => {
        try {
            const txt = await file.text();
            const parsed = JSON.parse(txt);
            const report = inspectBackupJsonState(parsed);
            if (!report.isValid) {
                alert(`${t('alert_backup_invalid')}\n\n- ${report.blockers.join('\n- ')}`);
                return;
            }

            const preflightWarnings = report.warnings.length
                ? `\n\n${t('admin_notes')}:\n- ${report.warnings.join('\n- ')}`
                : '';
            const preflightSummary =
                `${t('teams')}: ${report.summary.teams}\n` +
                `${t('reports')}: ${report.summary.matches}\n` +
                `${t('tournaments')}: ${report.summary.tournamentHistory}${report.summary.hasLiveTournament ? ' + live' : ''}\n` +
                `${t('hof')}: ${report.summary.hallOfFame}\n` +
                `${t('admin_scorers_integrations')}: ${report.summary.integrationsScorers}\n` +
                `${t('aliases_label')}: ${report.summary.aliases}\n` +
                `${t('admin_yob_legacy_summary')}: ${t('admin_yob_live_teams')}: ${report.summary.liveTeamsWithLegacyYoB}, ${t('admin_yob_live_tournament')}: ${report.summary.liveTournamentTeamsWithLegacyYoB}, ${t('historical')}: ${report.summary.historyTeamsWithLegacyYoB}, ${t('scorers')}: ${report.summary.scorerEntriesWithLegacyYoB}`;

            if (!confirm(`${t('admin_merge_backup_confirm')}\n\n${preflightSummary}${preflightWarnings}`)) return;

            const merged = mergeBackupJsonState(state, parsed);
            setState(merged.state);

            const combinedWarnings = [...report.warnings, ...merged.warnings];
            const warningText = combinedWarnings.length
                ? `\n\n${t('admin_notes')}:\n- ${combinedWarnings.join('\n- ')}`
                : '';
            alert(
                `${t('admin_backup_integrated')}\n\n` +
                `${t('teams')}: ${merged.summary.teams}\n` +
                `${t('tournaments')}: ${merged.summary.tournamentHistory}\n` +
                `${t('hof')}: ${merged.summary.hallOfFame}\n` +
                `${t('admin_scorers_integrations')}: ${merged.summary.integrationsScorers}\n` +
                `${t('aliases_label')}: ${merged.summary.aliases}` +
                warningText
            );
        } catch (e) {
            alert(t('alert_backup_invalid'));
        }
    };

    const openPrintWindow = (title: string, bodyHtml: string) => {
        // No popups: print via hidden iframe to avoid browser popup blockers.
        try {
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';
            iframe.setAttribute('aria-hidden', 'true');

            const safeTitle = escapeHtml(title);
            const fullHtml = `<!doctype html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
        <style>
          body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:16px;}
          h1{font-size:18px;margin:0 0 12px 0;}
          table{width:100%;border-collapse:collapse;}
          th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;vertical-align:top;}
          th{background:#f3f4f6;text-align:left;}
          .muted{color:#666;font-size:11px;margin-top:8px;}
        </style>
        </head><body><h1>${safeTitle}</h1>${bodyHtml}<div class="muted">${t('generated_by_flbp')}</div></body></html>`;

            const cleanup = () => {
                try { iframe.remove(); } catch { /* noop */ }
            };

            iframe.onload = () => {
                const win = iframe.contentWindow;
                if (!win) {
                    cleanup();
                    alert(t('print_not_supported_browser'));
                    return;
                }
                try {
                    try { win.addEventListener('afterprint', cleanup, { once: true } as any); } catch { /* noop */ }
                    win.focus();
                    setTimeout(() => {
                        try { win.print(); } catch { cleanup(); }
                    }, 50);
                } catch {
                    cleanup();
                    alert(t('print_not_supported_browser'));
                }
            };

            iframe.srcdoc = fullHtml;
            document.body.appendChild(iframe);
        } catch {
            alert(t('print_not_supported_browser'));
        }
    };

    const printTeams = () => {
        const rows = (state.teams || []).slice().sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'it', { sensitivity: 'base' }));
        const html = `<table><thead><tr><th>#</th><th>Squadra</th><th>Giocatore 1</th><th>Anno</th><th>Arb1</th><th>Giocatore 2</th><th>Anno</th><th>Arb2</th></tr></thead><tbody>
          ${rows.map((t, i) => `<tr>
            <td>${i+1}</td>
            <td>${escapeHtml(t.name || '')}</td>
            <td>${escapeHtml(t.player1 || '')}</td>
            <td>${formatBirthDateDisplay((t as any).player1BirthDate) || ''}</td>
            <td>${(t as any).player1IsReferee ? 'SI' : 'NO'}</td>
            <td>${escapeHtml(t.player2 || '')}</td>
            <td>${formatBirthDateDisplay((t as any).player2BirthDate) || ''}</td>
            <td>${(t as any).player2IsReferee ? 'SI' : 'NO'}</td>
          </tr>`).join('')}
        </tbody></table>`;
        openPrintWindow(`${t('admin_print_registrations_title')} (${rows.length})`, html);
    };

    const printCodes = () => {
        const teamMap = new Map<string, string>((state.teams || []).map(t => [t.id, t.name] as [string, string]));
        const ms = [...(state.tournamentMatches || [])]
                                    .filter(m => !(m as any).hidden)
                                    .filter(m => {
                                        const ids = getMatchParticipantIds(m);
                                        return !ids.includes('BYE');
                                    })
                                    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        const visible = codesStatusFilter === 'all' ? ms : ms.filter(m => m.status === codesStatusFilter);
        const html = `<table><thead><tr><th>Codice</th><th>Fase</th><th>Match</th><th>Score</th><th>Stato</th></tr></thead><tbody>
          ${visible.map(m => {
            const ids = getMatchParticipantIds(m);
            const names = ids.map(id => id ? (teamMap.get(id) || id) : 'TBD');
            const matchLabel = names.join(' vs ');
            const scoreLabel = formatMatchScoreLabel(m);
            return `<tr>
              <td><b>${escapeHtml(m.code || '-')}</b></td>
              <td>${escapeHtml(m.phase || '-')}</td>
              <td>${escapeHtml(matchLabel)}</td>
              <td>${escapeHtml(scoreLabel)}</td>
              <td>${escapeHtml(m.status)}</td>
            </tr>`;
          }).join('')}
        </tbody></table>`;
        openPrintWindow(`${t('admin_print_codes_title')} (${visible.length})`, html);
    };

    const printBracket = () => {
        const teamMap = new Map<string, string>((state.teams || []).map(t => [t.id, t.name] as [string, string]));
        const sourceMatches = (state.tournamentMatches && state.tournamentMatches.length)
            ? state.tournamentMatches
            : (draft?.m || []);
        const ms = [...sourceMatches]
            .filter(m => m.phase === 'bracket')
            .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        if (!ms.length) {
            alert(t('alert_no_bracket_print'));
            return;
        }

        const byRound = new Map<string, Match[]>();
        for (const m of ms) {
            const key = m.roundName || `${t('round')} ${m.round ?? 0}`;
            if (!byRound.has(key)) byRound.set(key, []);
            byRound.get(key)!.push(m);
        }

        const sections = [...byRound.entries()].map(([round, list]) => {
            const rows = list.map(m => {
                const aName = m.teamAId ? (teamMap.get(m.teamAId) || m.teamAId) : 'TBD';
                const bName = m.teamBId ? (teamMap.get(m.teamBId) || m.teamBId) : 'TBD';
                return `<tr>
                  <td><b>${escapeHtml(m.code || '-')}</b></td>
                  <td>${escapeHtml(aName)} vs ${escapeHtml(bName)}</td>
                  <td>${(m.scoreA ?? 0)}-${(m.scoreB ?? 0)}</td>
                  <td>${escapeHtml(m.status)}</td>
                </tr>`;
            }).join('');
            return `<h2 style="font-size:14px;margin:16px 0 8px 0;">${escapeHtml(round)}</h2>
              <table><thead><tr><th>Codice</th><th>Match</th><th>Score</th><th>Stato</th></tr></thead><tbody>${rows}</tbody></table>`;
        }).join('');

        openPrintWindow(t('admin_print_bracket_title'), sections);
    };

    const escapeHtml = (s: string) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');


    interface WorkbookImportCandidate {
        sheetName: string;
        parsed: { teams: Team[]; headersNormalized: string[]; detectedLayout: TeamImportLayout | null };
        coherentWithProfile: boolean;
        score: number;
    }

    const buildWorkbookImportCandidates = (
        XLSX: XLSXRuntime,
        wb: any,
        importProfile: ReturnType<typeof loadTeamImportProfile>,
    ): WorkbookImportCandidate[] => {
        return (Array.isArray(wb?.SheetNames) ? wb.SheetNames : [])
            .map((sheetName: string) => {
                const ws = wb?.Sheets?.[sheetName];
                const parsed = parseSheetToTeams(XLSX, ws, { preferredLayout: importProfile?.layout || null });
                const coherentWithProfile = isTeamImportCoherentWithProfile(importProfile, parsed.headersNormalized, parsed.detectedLayout);
                const score = [
                    parsed.teams.length > 0 ? 1000 : 0,
                    coherentWithProfile ? 200 : 0,
                    parsed.detectedLayout === importProfile?.layout ? 100 : 0,
                    parsed.detectedLayout ? 20 : 0,
                    Math.min(parsed.teams.length, 100),
                ].reduce((sum, value) => sum + value, 0);
                return { sheetName, parsed, coherentWithProfile, score };
            })
            .sort((a, b) => b.score - a.score || a.sheetName.localeCompare(b.sheetName, 'it', { sensitivity: 'base' }));
    };

    const getAlternativeWorkbookSheets = (candidates: WorkbookImportCandidate[], selectedSheetName: string) => (
        candidates.filter(candidate => candidate.sheetName !== selectedSheetName)
    );

    const formatImportProfileMismatch = (
        importProfile: ReturnType<typeof loadTeamImportProfile>,
        candidate: WorkbookImportCandidate | { parsed: { headersNormalized: string[]; detectedLayout: TeamImportLayout | null }; sheetName?: string } | null,
        alternatives: WorkbookImportCandidate[] = [],
    ) => {
        const foundLayout = describeTeamImportLayout(candidate?.parsed?.detectedLayout ?? null);
        const expectedLayout = describeTeamImportLayout(importProfile?.layout ?? null);
        const sheetLabel = candidate?.sheetName ? `
${t('admin_import_sheet_read')}: ${candidate.sheetName}` : '';
        const headerPreview = (candidate?.parsed?.headersNormalized || []).slice(0, 8).join(', ');
        const alternativesText = alternatives.length
            ? `
${t('admin_import_other_sheets_checked')}:
- ${alternatives.slice(0, 3).map(alt => `${alt.sheetName}: ${describeTeamImportLayout(alt.parsed.detectedLayout)} · squadre ${alt.parsed.teams.length}`).join('\n- ')}`
            : '';
        return `${t('alert_import_error')}

${t('admin_import_profile_mismatch')}
${t('admin_import_expected_label')}: ${expectedLayout}
${t('admin_import_found_label')}: ${foundLayout}${sheetLabel}${headerPreview ? `
${t('admin_import_columns_read')}: ${headerPreview}` : ''}${alternativesText}`;
    };
    const parseSheetToTeams = (
        XLSX: XLSXRuntime,
        ws: any,
        opts?: { preferredLayout?: TeamImportLayout | null }
    ): { teams: Team[]; headersNormalized: string[]; detectedLayout: TeamImportLayout | null } => {
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        const rawHeaders = Object.keys(data[0] || {});
        const headersNormalized = rawHeaders.map(normalizeTeamImportHeader).filter(Boolean);
        const detectedLayout = detectTeamImportLayout(rawHeaders);
        const activeLayout = opts?.preferredLayout || detectedLayout;

        const getField = (row: Record<string, any>, aliases: string[]) => {
            const normalizedAliases = aliases.map(normalizeTeamImportHeader);
            for (const [key, value] of Object.entries(row || {})) {
                if (normalizedAliases.includes(normalizeTeamImportHeader(key))) return value;
            }
            return '';
        };

        const parseFlag = (value: unknown) => {
            const raw = String(value ?? '').trim().toLowerCase();
            return raw === 'si' || raw === 'sì' || raw === 'true' || raw === '1' || raw === 'x';
        };

        if (activeLayout === 'team_rows') {
            const teams = data
                .map((row) => {
                    const name = String(getField(row, ['Squadra', 'Team']) || '').trim();
                    const g1 = buildCanonicalPlayerNameFromParts(
                        String(getField(row, ['Nome1', 'Nome 1', 'FirstName1', 'First Name 1']) || '').trim(),
                        String(getField(row, ['Cognome1', 'Cognome 1', 'LastName1', 'Last Name 1', 'Surname1', 'Surname 1']) || '').trim(),
                    ) || String(getField(row, ['Giocatore1', 'Giocatore 1', 'Player1', 'Player 1']) || '').trim();
                    const g2 = buildCanonicalPlayerNameFromParts(
                        String(getField(row, ['Nome2', 'Nome 2', 'FirstName2', 'First Name 2']) || '').trim(),
                        String(getField(row, ['Cognome2', 'Cognome 2', 'LastName2', 'Last Name 2', 'Surname2', 'Surname 2']) || '').trim(),
                    ) || String(getField(row, ['Giocatore2', 'Giocatore 2', 'Player2', 'Player 2']) || '').trim();
                    if (!name || !g1 || !g2) return null;

                    const birthDate1 = normalizeBirthDateInput(String(getField(row, ['DataNascita1', 'DataNascita 1', 'Data nascita 1', 'BirthDate1', 'Birth Date 1', 'DOB1']) || '').trim());
                    const birthDate2 = normalizeBirthDateInput(String(getField(row, ['DataNascita2', 'DataNascita 2', 'Data nascita 2', 'BirthDate2', 'Birth Date 2', 'DOB2']) || '').trim());
                    const a1 = deriveYoBFromBirthDate(birthDate1);
                    const a2 = deriveYoBFromBirthDate(birthDate2);

                    const arbTeamRaw = getField(row, ['Arbitro', 'Referee']);
                    const arb1Raw = getField(row, ['Arbitro1', 'Arbitro 1', 'Referee1', 'Referee 1']);
                    const arb2Raw = getField(row, ['Arbitro2', 'Arbitro 2', 'Referee2', 'Referee 2']);
                    const arbTeam = parseFlag(arbTeamRaw);
                    const arb1 = parseFlag(arb1Raw);
                    const arb2 = parseFlag(arb2Raw);
                    const hasPerPlayer = String(arb1Raw ?? '').trim() !== '' || String(arb2Raw ?? '').trim() !== '';
                    const p1Ref = hasPerPlayer ? arb1 : arbTeam;
                    const p2Ref = hasPerPlayer ? arb2 : false;

                    return {
                        id: uuid(),
                        name,
                        player1: g1,
                        player2: g2,
                        player1YoB: a1,
                        player2YoB: a2,
                        player1BirthDate: birthDate1,
                        player2BirthDate: birthDate2,
                        player1IsReferee: p1Ref,
                        player2IsReferee: p2Ref,
                        isReferee: (p1Ref || p2Ref || arbTeam),
                        createdAt: Date.now()
                    } as Team;
                })
                .filter(Boolean) as Team[];
            return { teams, headersNormalized, detectedLayout };
        }

        if (activeLayout === 'player_rows') {
            const grouped = new Map<string, { players: { name: string; yob?: number; birthDate?: string; isReferee?: boolean }[]; isReferee: boolean }>();
            for (const row of data) {
                const squadra = String(getField(row, ['Squadra', 'Team']) || '').trim();
                const nome = buildCanonicalPlayerNameFromParts(
                    String(getField(row, ['Nome', 'FirstName', 'First Name']) || '').trim(),
                    String(getField(row, ['Cognome', 'LastName', 'Last Name', 'Surname']) || '').trim(),
                ) || String(getField(row, ['Cognome Nome', 'Nome', 'Giocatore', 'Player']) || '').trim();
                if (!squadra || !nome) continue;
                const birthDate = normalizeBirthDateInput(String(getField(row, ['DataNascita', 'Data di nascita', 'BirthDate', 'Birth Date', 'DOB', 'NascitaCompleta']) || '').trim());
                const yob = deriveYoBFromBirthDate(birthDate);
                const isReferee = parseFlag(getField(row, ['Arbitro?', 'Arbitro', 'Referee?', 'Referee']));
                if (!grouped.has(squadra)) grouped.set(squadra, { players: [], isReferee: false });
                const entry = grouped.get(squadra)!;
                entry.players.push({ name: nome, yob, birthDate, isReferee });
                entry.isReferee = entry.isReferee || isReferee;
            }

            const teams: Team[] = [];
            for (const [name, entry] of grouped.entries()) {
                const pA = entry.players[0];
                const pB = entry.players[1];
                if (!pA || !pB) continue;
                teams.push({
                    id: uuid(),
                    name,
                    player1: pA.name,
                    player2: pB.name,
                    player1YoB: pA.yob,
                    player2YoB: pB.yob,
                    player1BirthDate: pA.birthDate,
                    player2BirthDate: pB.birthDate,
                    player1IsReferee: !!(entry.players?.[0] as any)?.isReferee,
                    player2IsReferee: !!(entry.players?.[1] as any)?.isReferee,
                    isReferee: (entry.isReferee || (entry.players || []).some((player: any) => player.isReferee)),
                    createdAt: Date.now()
                });
            }
            return { teams, headersNormalized, detectedLayout };
        }

        return { teams: [], headersNormalized, detectedLayout };
    };

    const importFile = async (file: File) => {
        const XLSX = await getXLSX();
        const ext = file.name.toLowerCase().split('.').pop();
        try {
            const importProfile = loadTeamImportProfile();
            let parsed: { teams: Team[]; headersNormalized: string[]; detectedLayout: TeamImportLayout | null } = {
                teams: [],
                headersNormalized: [],
                detectedLayout: null,
            };
            let selectedSheetName = '';
            let selectedCandidate: WorkbookImportCandidate | null = null;
            let candidates: WorkbookImportCandidate[] = [];

            if (ext === 'csv') {
                const text = await decodeCsvText(file);
                const sep = detectCsvSeparator(text);
                const rows = parseCsvRows(text, sep);
                const headers = (rows[0] || []).map(h => (h ?? '').toString().trim());
                const json = rows.slice(1).map(cols => {
                    const r: Record<string, any> = {};
                    headers.forEach((h, i) => (r[h] = (cols[i] ?? '').toString().trim()));
                    return r;
                });
                const ws = XLSX.utils.json_to_sheet(json);
                parsed = parseSheetToTeams(XLSX, ws, { preferredLayout: importProfile?.layout || null });
            } else {
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                candidates = buildWorkbookImportCandidates(XLSX, wb, importProfile);
                selectedCandidate = candidates[0] || null;
                selectedSheetName = selectedCandidate?.sheetName || '';
                parsed = selectedCandidate?.parsed || parsed;
            }

            if (importProfile && !isTeamImportCoherentWithProfile(importProfile, parsed.headersNormalized, parsed.detectedLayout)) {
                alert(formatImportProfileMismatch(importProfile, selectedCandidate || { parsed, sheetName: selectedSheetName }, getAlternativeWorkbookSheets(candidates, selectedSheetName)));
                return;
            }

            if (!parsed.teams.length) {
                alert(ext === 'xlsx' && selectedSheetName
                    ? `${t('alert_import_failed_no_team')}

${t('admin_import_no_valid_team_in_sheet').replace('{sheet}', selectedSheetName)}${getAlternativeWorkbookSheets(candidates, selectedSheetName).length > 0 ? `\n${t('admin_import_other_sheets_checked')}: ${getAlternativeWorkbookSheets(candidates, selectedSheetName).slice(0, 4).map(candidate => candidate.sheetName).join(', ')}` : ''}`
                    : t('alert_import_failed_no_team'));
                return;
            }

            if (!importProfile && ext === 'xlsx' && parsed.detectedLayout) {
                saveTeamImportProfile({
                    version: 1,
                    createdAt: Date.now(),
                    sourceExt: 'xlsx',
                    layout: parsed.detectedLayout,
                    headersNormalized: parsed.headersNormalized,
                });
            }

            const teams = parsed.teams;
            // merge (append) evitando duplicati per nome squadra (case-insensitive)
            const existing = new Map((state.teams || []).map(t => [t.name.trim().toLowerCase(), t]));
            const merged = [...(state.teams || [])];
            const seen = new Set<string>();
            for (const t of teams) {
                const k = t.name.trim().toLowerCase();
                if (seen.has(k)) continue;
                seen.add(k);
                if (!existing.has(k)) merged.push(t);
            }
            const nextTournament = mergeIntoLiveTournamentTeams(state.tournament, merged);
            setState({ ...state, teams: merged, tournament: nextTournament });
            alert(`${t('admin_import_completed')}: ${teams.length} · ${t('admin_total_label')}: ${merged.length}`);
        } catch (e) {
            console.error(e);
            alert(t('alert_import_error'));
        }
    };

    // STEP 10 — import squadre dentro wizard "Nuovo torneo archiviato" (non tocca il live)
    const importArchiveTeamsFile = async (file: File) => {
        const XLSX = await getXLSX();
        const ext = file.name.toLowerCase().split('.').pop();
        try {
            const importProfile = loadTeamImportProfile();
            let parsed: { teams: Team[]; headersNormalized: string[]; detectedLayout: TeamImportLayout | null } = {
                teams: [],
                headersNormalized: [],
                detectedLayout: null,
            };
            let selectedSheetName = '';
            let selectedCandidate: WorkbookImportCandidate | null = null;
            let candidates: WorkbookImportCandidate[] = [];
            if (ext === 'csv') {
                const text = await decodeCsvText(file);
                const sep = detectCsvSeparator(text);
                const rows = parseCsvRows(text, sep);
                const headers = (rows[0] || []).map(h => (h ?? '').toString().trim());
                const json = rows.slice(1).map(cols => {
                    const r: Record<string, any> = {};
                    headers.forEach((h, i) => (r[h] = (cols[i] ?? '').toString().trim()));
                    return r;
                });
                const ws = XLSX.utils.json_to_sheet(json);
                parsed = parseSheetToTeams(XLSX, ws, { preferredLayout: importProfile?.layout || null });
            } else {
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                candidates = buildWorkbookImportCandidates(XLSX, wb, importProfile);
                selectedCandidate = candidates[0] || null;
                selectedSheetName = selectedCandidate?.sheetName || '';
                parsed = selectedCandidate?.parsed || parsed;
            }

            if (importProfile && !isTeamImportCoherentWithProfile(importProfile, parsed.headersNormalized, parsed.detectedLayout)) {
                alert(formatImportProfileMismatch(importProfile, selectedCandidate || { parsed, sheetName: selectedSheetName }, getAlternativeWorkbookSheets(candidates, selectedSheetName)));
                return;
            }

            if (!parsed.teams.length) {
                alert(ext === 'xlsx' && selectedSheetName
                    ? `${t('alert_import_failed_no_team')}

${t('admin_import_no_valid_team_in_sheet').replace('{sheet}', selectedSheetName)}${getAlternativeWorkbookSheets(candidates, selectedSheetName).length > 0 ? `\n${t('admin_import_other_sheets_checked')}: ${getAlternativeWorkbookSheets(candidates, selectedSheetName).slice(0, 4).map(candidate => candidate.sheetName).join(', ')}` : ''}`
                    : t('alert_import_failed_no_team'));
                return;
            }

            if (!importProfile && ext === 'xlsx' && parsed.detectedLayout) {
                saveTeamImportProfile({
                    version: 1,
                    createdAt: Date.now(),
                    sourceExt: 'xlsx',
                    layout: parsed.detectedLayout,
                    headersNormalized: parsed.headersNormalized,
                });
            }

            const teams = parsed.teams;
            // merge evitando duplicati per nome squadra (case-insensitive)
            const existing = new Map((createArchiveTeams || []).map(t => [t.name.trim().toLowerCase(), t]));
            const merged = [...(createArchiveTeams || [])];
            const seen = new Set<string>();
            for (const t of teams) {
                const k = t.name.trim().toLowerCase();
                if (seen.has(k)) continue;
                seen.add(k);
                if (!existing.has(k)) merged.push(t);
            }
            setCreateArchiveTeams(merged);
            alert(`${t('admin_import_completed')}: ${teams.length} · ${t('admin_in_wizard_label')}: ${merged.length}`);
        } catch (e) {
            console.error(e);
            alert(t('alert_import_error'));
        }
    };

    const genPool = (n: number) => {
        const teams = generateSimPoolTeams(n, state.teams || [], uuid);
        const merged = [...(state.teams || []), ...teams];
        const nextTournament = mergeIntoLiveTournamentTeams(state.tournament, merged);
        setState({ ...state, teams: merged, tournament: nextTournament });
    };

    const addHomonyms = () => {
        const baseTeamName = `OMONIMI ${new Date().toISOString().slice(11,19).replace(/:/g,'')}`;
        const homonymGroups = [
            { teamLabel: 'Rossi Giulia', playerName: 'Rossi Giulia' },
            { teamLabel: 'Bianchi Luca', playerName: 'Bianchi Luca' },
            { teamLabel: 'Ferrari Marco', playerName: 'Ferrari Marco' },
        ];
        const buildBirthDate = (year: number, index: number) => {
            const month = String((index % 12) + 1).padStart(2, '0');
            const day = String((index % 28) + 1).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const homonymTeams: Team[] = [];
        homonymGroups.forEach((group, groupIndex) => {
            const players = Array.from({ length: 10 }, (_, idx) => {
                const yob = 1987 + ((groupIndex * 10 + idx) % 18);
                return {
                    name: group.playerName,
                    yob,
                    birthDate: buildBirthDate(yob, groupIndex * 10 + idx),
                };
            });

            for (let i = 0; i < players.length; i += 2) {
                const a = players[i];
                const b = players[i + 1];
                homonymTeams.push({
                    id: uuid(),
                    name: `${baseTeamName} ${group.teamLabel} #${(i / 2) + 1}`,
                    player1: a.name,
                    player2: b.name,
                    player1YoB: a.yob,
                    player2YoB: b.yob,
                    player1BirthDate: a.birthDate,
                    player2BirthDate: b.birthDate,
                    player1IsReferee: groupIndex === 0 && i === 0,
                    player2IsReferee: false,
                    isReferee: groupIndex === 0 && i === 0,
                    createdAt: Date.now()
                });
            }
        });
        const merged = [...(state.teams || []), ...homonymTeams];
        const nextTournament = mergeIntoLiveTournamentTeams(state.tournament, merged);
        setState({ ...state, teams: merged, tournament: nextTournament });
        alert(t('alert_added_duplicate_test'));
    };

    const handleGenerate = () => {
        const teams = (state.teams || []).filter(team => !team.hidden && !team.isBye);
        if (teams.length < 2) {
            alert(t('alert_need_2_teams_generate'));
            return;
        }
        
        try {
            const { tournament, matches } = generateTournamentStructure(teams, {
                mode: tournMode,
                numGroups,
                advancingPerGroup: advancing,
                tournamentName: tournName,
                startDate: tournDate,
                finalRoundRobin: (tournMode !== 'round_robin' && finalRrEnabled) ? { enabled: true, topTeams: finalRrTopTeams } : undefined,
            });
            setDraft({ t: tournament, m: matches });
        } catch (e) {
            console.error('Generazione fallita:', e);
            alert(t('alert_generation_error'));
        }
    };

    const handleStartLive = () => {
        if (!draft) return;
        
        if (state.tournament) {
            if (!confirm(t('admin_archive_active_before_start_confirm'))) {
                return;
            }
        }

        // Each live must have its own referees password.
        // If the admin cancels or leaves it empty, do not start the live.
        const rawPw = window.prompt(t('enable_referees_password_prompt'), '') ?? '';
        const refereesPassword = rawPw.trim();
        if (!refereesPassword) {
            alert(t('referees_password_required'));
            return;
        }
        const refereesAuthVersion = new Date().toISOString();
        try { safeSessionRemove('flbp_ref_authed'); } catch { /* ignore */ }
        try { safeSessionRemove('flbp_ref_authed_for'); } catch { /* ignore */ }
        try { safeSessionRemove('flbp_ref_authed_ver'); } catch { /* ignore */ }
        
        let newState = { ...state };
        if (newState.tournament) {
            newState = archiveTournamentV2(newState);
        }
        
        newState.tournament = { ...draft.t, refereesPassword, refereesAuthVersion };
        newState.tournamentMatches = draft.m;
        
        setState(newState);
        setDraft(null);
        setTab('codes');
        alert(t('alert_live_started'));
    };

    const updateLiveRefereesPassword = (rawPassword: string): { ok: boolean; message: string } => {
        const nextPassword = (rawPassword || '').trim();
        if (!state.tournament) {
            return { ok: false, message: t('alert_no_live_active') };
        }
        if (!nextPassword) {
            return { ok: false, message: t('admin_enter_valid_password') };
        }

        const nextTournament: TournamentData = {
            ...state.tournament,
            refereesPassword: nextPassword,
            refereesAuthVersion: new Date().toISOString()
        };

        try { safeSessionRemove('flbp_ref_authed'); } catch { /* ignore */ }
        try { safeSessionRemove('flbp_ref_authed_for'); } catch { /* ignore */ }
        try { safeSessionRemove('flbp_ref_authed_ver'); } catch { /* ignore */ }

        setState({ ...state, tournament: nextTournament });
        return { ok: true, message: t('admin_referees_password_updated') };
    };

    const handleActivateFinalRoundRobin = () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }
        const ms = state.tournamentMatches || [];
        const status = getFinalRoundRobinActivationStatus(state.tournament, ms);
        if (!status.enabled) {
            alert(t('final_group_disabled'));
            return;
        }
        if (status.activated) {
            alert(t('final_group_already_active'));
            return;
        }
        if (!status.canActivate) {
            const msg = status.reason === 'participants_not_determined'
                ? t('final_group_reason_tbd')
                : status.reason === 'bye_in_participants'
                    ? t('final_group_reason_bye')
                    : status.reason === 'no_bracket_matches'
                        ? t('final_group_reason_no_bracket')
                        : t('final_group_reason_generic');
            alert(msg);
            return;
        }

        const top = status.topTeams || (state.tournament.config?.finalRoundRobin?.topTeams || 4);
        if (!confirm(`${t('final_group_activate_confirm_prefix')} Top${top}?\n\n${t('final_group_activate_confirm_body')}`)) return;

        const { tournament, matches } = activateFinalRoundRobinStage(state.tournament, ms);
        setState({ ...state, tournament, tournamentMatches: matches });
        alert(t('final_group_activated'));
    };

    const toggleMatchStatus = (id: string) => {
        if (!state.tournament) return;
        const matches = [...(state.tournamentMatches || [])];
        const idx = matches.findIndex(m => m.id === id);
        if (idx === -1) return;
        
        const m = matches[idx];
        if (m.status === 'finished') return; // Cannot toggle finished matches

        const next = m.status === 'playing' ? 'scheduled' : 'playing';
        matches[idx] = { ...m, status: next };
        commitLiveMatches(matches);
    };

    const handleUpdateLiveMatch = (updated: Match) => {
        const nextMatches = (state.tournamentMatches || []).map(m =>
            m.id === updated.id ? { ...m, ...updated } : m
        );
        // Keep tournament.matches in sync for parts of the app that read from the tournament object.
        const nextTournament = state.tournament
            ? { ...state.tournament, matches: nextMatches }
            : state.tournament;
        setState({ ...state, tournament: nextTournament, tournamentMatches: nextMatches });
    };

    const handleUpdateTournamentAndMatches = (tournament: TournamentData, matches: Match[]) => {
        commitLiveMatches(matches, tournament);
    };

    const getTeamFromCatalog = (id?: string) => {
        if (!id) return undefined;
        const live = (state.tournament?.teams || []) as Team[];
        const fromLive = live.find(t => t.id === id);
        if (fromLive) return fromLive;
        return (state.teams || []).find(t => t.id === id);
    };

    const getTeamName = (id?: string) => {
        if (!id) return 'TBD';
        if (id === 'BYE') return 'BYE';
        return getTeamFromCatalog(id)?.name || id;
    };

    const buildBracketRounds = (allMatches: Match[]): Match[][] => {
        const rounds: Match[][] = [];
        if (state.tournament?.rounds && state.tournament.rounds.length) {
            state.tournament.rounds.forEach(r => rounds.push(r));
            return rounds;
        }
        const bracketMatches = (allMatches || []).filter(m => m.phase === 'bracket');
        const map = new Map<number, Match[]>();
        bracketMatches.forEach(m => {
            const r = m.round || 1;
            if (!map.has(r)) map.set(r, []);
            map.get(r)!.push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach(k => rounds.push(map.get(k)!.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))));
        return rounds;
    };

    const findMatchPositionInRounds = (rounds: Match[][], matchId: string): { rIdx: number; mIdx: number } | null => {
        for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
            const round = rounds[rIdx] || [];
            for (let mIdx = 0; mIdx < round.length; mIdx++) {
                if (round[mIdx]?.id === matchId) return { rIdx, mIdx };
            }
        }
        return null;
    };

    const resolveWinnerTeamId = (m: Match) => {
        if (!m) return undefined;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE') {
            if (String(m.teamBId).startsWith('TBD')) return undefined;
            return m.teamBId;
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE') {
            if (String(m.teamAId).startsWith('TBD')) return undefined;
            return m.teamAId;
        }
        if (m.status !== 'finished') return undefined;
        if (m.scoreA > m.scoreB) {
            if (String(m.teamAId).startsWith('TBD')) return undefined;
            return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
            if (String(m.teamBId).startsWith('TBD')) return undefined;
            return m.teamBId;
        }
        return undefined;
    };

    const applyByeAutoWin = (m: Match): Match => {
        if (!m) return m;
        if (m.status === 'finished') return m;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE' && !String(m.teamBId).startsWith('TBD')) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE' && !String(m.teamAId).startsWith('TBD')) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamAId === 'BYE' && m.teamBId === 'BYE') {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        return m;
    };

    // === Retroattività su Archivio (editing risultati) ===
    const buildBracketRoundsFromMatches = (allMatches: Match[]): Match[][] => {
        const rounds: Match[][] = [];
        const bracketMatches = (allMatches || []).filter(m => m.phase === 'bracket');
        const map = new Map<number, Match[]>();
        bracketMatches.forEach(m => {
            const r = m.round || 1;
            if (!map.has(r)) map.set(r, []);
            map.get(r)!.push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach(k => rounds.push(map.get(k)!.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))));
        return rounds;
    };

    const resolveWinnerTeamIdGeneric = (m: Match) => {
        if (!m) return undefined;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE') return m.teamBId;
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE') return m.teamAId;
        if (m.status !== 'finished') return undefined;
        if (m.scoreA > m.scoreB) {
            if (String(m.teamAId).startsWith('TBD')) return undefined;
            return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
            if (String(m.teamBId).startsWith('TBD')) return undefined;
            return m.teamBId;
        }
        return undefined;
    };

    const autoFixBracketFromResults = (matches: Match[]): Match[] => {
        let out = matches.map(m => ({ ...m }));
        const rounds = buildBracketRoundsFromMatches(out);

        // Reset participants for rounds > 1 (they will be re-filled from winners).
        for (let r = 1; r < rounds.length; r++) {
            const ids = new Set(rounds[r].map(m => m.id));
            out = out.map(x => {
                if (!ids.has(x.id)) return x;
                const base: Match = { ...x };
                delete (base as any).teamAId;
                delete (base as any).teamBId;
                return base;
            });
        }

        const byId = new Map(out.map(m => [m.id, m]));
        const upsert = (u: Match) => {
            byId.set(u.id, u);
            out = out.map(m => (m.id === u.id ? u : m));
        };

        for (let rIdx = 0; rIdx < rounds.length - 1; rIdx++) {
            const round = rounds[rIdx] || [];
            const nextRound = rounds[rIdx + 1] || [];
            for (let mIdx = 0; mIdx < round.length; mIdx++) {
                const cur = byId.get(round[mIdx].id) || round[mIdx];
                const winner = resolveWinnerTeamIdGeneric(cur);
                if (!winner || winner === 'BYE') continue;
                const nextSkel = nextRound[Math.floor(mIdx / 2)];
                if (!nextSkel) continue;
                const next = byId.get(nextSkel.id) || nextSkel;
                const slot: 'teamAId'|'teamBId' = (mIdx % 2 === 0) ? 'teamAId' : 'teamBId';
                upsert(applyByeAutoWin({ ...next, [slot]: winner } as any));
            }
        }

        // Reset finished matches whose participants changed due to retro-propagation
        const recomputed = new Map(out.map(m => [m.id, m]));
        out = out.map(m => {
            if (m.phase !== 'bracket') return m;
            if (m.status !== 'finished') return m;
            const mm = recomputed.get(m.id)!;
            if (mm.teamAId !== m.teamAId || mm.teamBId !== m.teamBId) {
                return { ...mm, played: false, status: 'scheduled', scoreA: 0, scoreB: 0, stats: undefined };
            }
            return m;
        });

        return autoResolveBracketByes(out);
    };

    const propagateWinnerFromMatch = (finishedMatch: Match, matches: Match[]) => {
        const rounds = buildBracketRounds(matches);
        const pos = findMatchPositionInRounds(rounds, finishedMatch.id);
        if (!pos) return matches;

        let rIdx = pos.rIdx;
        let mIdx = pos.mIdx;
        let current = finishedMatch;

        let out = [...matches];
        const byId = new Map(out.map(m => [m.id, m]));
        const upsert = (u: Match) => {
            byId.set(u.id, u);
            out = out.map(m => (m.id === u.id ? u : m));
        };

        while (true) {
            const winner = resolveWinnerTeamId(current);
            if (!winner || winner === 'BYE') break;

            const nextRound = rounds[rIdx + 1];
            if (!nextRound || nextRound.length === 0) break;

            const nextSkel = nextRound[Math.floor(mIdx / 2)];
            if (!nextSkel) break;

            const next = byId.get(nextSkel.id) || nextSkel;
            const slot: 'teamAId' | 'teamBId' = (mIdx % 2 === 0) ? 'teamAId' : 'teamBId';
            if ((next as any)[slot]) break;

            let nextUpdated: Match = { ...next, [slot]: winner } as any;
            const beforeStatus = nextUpdated.status;
            nextUpdated = applyByeAutoWin(nextUpdated);
            upsert(nextUpdated);

            // If the newly updated match auto-finished due to a BYE, continue propagating.
            if (beforeStatus !== 'finished' && nextUpdated.status === 'finished') {
                current = nextUpdated;
                rIdx = rIdx + 1;
                mIdx = Math.floor(mIdx / 2);
                continue;
            }
            break;
        }

        return out;
    };

    const replaceMatch = (matches: Match[], updated: Match) => {
        return matches.map(m => (m.id === updated.id ? { ...m, ...updated } : m));
    };

    const autoResolveBracketByes = (matches: Match[]) => {
        let out = [...matches];
        let changed = true;
        let guard = 0;
        while (changed && guard < 2000) {
            guard++;
            changed = false;
            for (const m of out) {
                if (m.phase !== 'bracket') continue;
                if (m.status === 'finished') continue;
                const after = applyByeAutoWin(m);
                const didChange = (after.status !== m.status) || (after.scoreA !== m.scoreA) || (after.scoreB !== m.scoreB) || (after.played !== m.played);
                if (after.status === 'finished' && didChange) {
                    out = replaceMatch(out, after);
                    out = propagateWinnerFromMatch(after, out);
                    changed = true;
                }
            }
        }
        return out;
    };

    const simulateFinishMatch = (m: Match, matches: Match[]) => {
        // Multi-team match (used for group tie-breaks): A vs B vs C ...
        if ((m.teamIds && m.teamIds.length >= 2)) {
            const ids = (m.teamIds || []).filter(Boolean);
            if (ids.includes('BYE')) return matches;
            const ts = ids.map(id => getTeamFromCatalog(id)).filter(Boolean) as Team[];
            if (ts.length < 2) return matches;

            const res = simulateMultiMatchResult(m, ts);
            const scores = res.scoresByTeam || {};
            const ordered = Object.values(scores).sort((a, b) => b - a);

            const updated: Match = {
                ...m,
                scoresByTeam: scores,
                // Keep legacy fields populated for any UI still expecting 1v1.
                scoreA: ordered[0] ?? 0,
                scoreB: ordered[1] ?? 0,
                stats: res.stats,
                played: true,
                status: 'finished'
            };

            let out = replaceMatch(matches, updated);
            // No bracket propagation here: multi-team is only for group tie-breaks.
            return out;
        }

        const teamA = getTeamFromCatalog(m.teamAId);
        const teamB = getTeamFromCatalog(m.teamBId);
        if (!teamA || !teamB) return matches;
        if (m.teamAId === 'BYE' || m.teamBId === 'BYE') return matches;

        const res = simulateMatchResult(m, teamA, teamB);
        const updated: Match = {
            ...m,
            scoreA: res.scoreA,
            scoreB: res.scoreB,
            stats: res.stats,
            played: true,
            status: 'finished'
        };

        let out = replaceMatch(matches, updated);
        if (updated.phase === 'bracket') {
            out = propagateWinnerFromMatch(updated, out);
        }
        return out;
    };

    const handleSimulateTurn = () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }
        if (simBusy) return;
        setSimBusy(true);
        try {
            let matches = autoResolveBracketByes([...(state.tournamentMatches || [])]);

            const groupPending = matches
                .filter(m => m.phase === 'groups' && m.status !== 'finished')
                .filter(m => ((m.teamIds && m.teamIds.length >= 2) || (!!m.teamAId && !!m.teamBId)))
                .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

            if (groupPending.length) {
                // One match per group
                const picked: Match[] = [];
                const seen = new Set<string>();
                for (const m of groupPending) {
                    const g = m.groupName || '';
                    if (seen.has(g)) continue;
                    seen.add(g);
                    picked.push(m);
                }
                picked.forEach(m => {
                    matches = simulateFinishMatch(m, matches);
                });

                // IMPORTANT: after simulating group matches we must propagate completed-group standings
                // into the bracket (resolve TBD-* placeholders). Otherwise bracket simulation can stall.
                matches = syncBracketFromGroups(state.tournament, matches);
                matches = ensureFinalTieBreakIfNeeded(state.tournament, matches);
                matches = autoResolveBracketByes(matches);
            } else {
                const bracketPending = matches
                    .filter(m => m.phase === 'bracket' && m.status !== 'finished')
                    .sort((a, b) => (a.round ?? 1) - (b.round ?? 1) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

                const eligible = bracketPending.filter(m => !!m.teamAId && !!m.teamBId);
                if (!eligible.length) {
                    alert(t('alert_no_match_simulable'));
                    commitLiveMatches(matches);
                    return;
                }
                const minRound = Math.min(...eligible.map(m => m.round || 1));
                const roundMatches = bracketPending.filter(m => (m.round || 1) === minRound);

                roundMatches.forEach(m => {
                    // First resolve possible BYEs
                    const after = applyByeAutoWin(m);
                    if (after.status === 'finished') {
                        matches = replaceMatch(matches, after);
                        matches = propagateWinnerFromMatch(after, matches);
                        return;
                    }
                    matches = simulateFinishMatch(m, matches);
                });
                matches = autoResolveBracketByes(matches);
            }

            commitLiveMatches(matches);
        } finally {
            setSimBusy(false);
        }
    };

    const handleSimulateAll = () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }
        if (simBusy) return;
        if (!confirm(t('admin_simulate_all_confirm'))) return;
        setSimBusy(true);
        try {
            let matches = autoResolveBracketByes([...(state.tournamentMatches || [])]);

            // Simulate all group matches first (orderIndex already keeps them earlier)
            const groupPending = matches
                .filter(m => m.phase === 'groups' && m.status !== 'finished')
                .filter(m => ((m.teamIds && m.teamIds.length >= 2) || (!!m.teamAId && !!m.teamBId)))
                .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            groupPending.forEach(m => {
                matches = simulateFinishMatch(m, matches);
            });

            // IMPORTANT: resolve TBD placeholders from completed groups before starting bracket simulation.
            matches = syncBracketFromGroups(state.tournament, matches);
            matches = ensureFinalTieBreakIfNeeded(state.tournament, matches);
            matches = autoResolveBracketByes(matches);

            // Simulate bracket matches iteratively as winners populate next rounds
            // Simulate bracket matches progressively (round by round) to avoid UI freezes on big brackets
let guard = 0;
while (guard < 5000) {
    guard++;
    matches = autoResolveBracketByes(matches);

    const eligible = matches
        .filter(m => m.phase === 'bracket' && m.status !== 'finished')
        .filter(m => !!m.teamAId && !!m.teamBId);

    if (!eligible.length) break;

    const minRound = Math.min(...eligible.map(m => m.round || 1));
    const roundMatches = eligible
        .filter(m => (m.round || 1) === minRound)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    let progressed = false;
    for (const m of roundMatches) {
        const before = m.status;

        const after = applyByeAutoWin(m);
        if (after.status === 'finished') {
            matches = replaceMatch(matches, after);
            matches = propagateWinnerFromMatch(after, matches);
            progressed = true;
            continue;
        }

        const nextMatches = simulateFinishMatch(m, matches);
        if (nextMatches !== matches || before !== 'finished') progressed = true;
        matches = nextMatches;
    }

    if (!progressed) break;
}


            matches = autoResolveBracketByes(matches);
            commitLiveMatches(matches);
        } finally {
            setSimBusy(false);
        }
    };

    const isReportableMatch = (m: Match) => {
        const ids = getMatchParticipantIds(m).filter(Boolean);
        if (ids.length < 2) return false;
        if (ids.some(isPlaceholderTeamId)) return false;
        return true;
    };

    const initReportFormFromMatch = (m: Match) => {
        setReportMatchId(m.id);
        setReportStatus(m.status || 'finished');
        // For multi-team matches, reportScoreA/B are only legacy placeholders for UI.
        if (m.teamIds && m.teamIds.length >= 2) {
            const vals = Object.values(m.scoresByTeam || {}).sort((a, b) => b - a);
            setReportScoreA(String(vals[0] ?? 0));
            setReportScoreB(String(vals[1] ?? 0));
        } else {
            setReportScoreA(String(m.scoreA ?? 0));
            setReportScoreB(String(m.scoreB ?? 0));
        }

        const nextForm: Record<string, { canestri: string; soffi: string }> = {};
        const participantIds = (m.teamIds && m.teamIds.length)
            ? (m.teamIds || [])
            : [m.teamAId, m.teamBId].filter(Boolean) as string[];
        const participantTeams = participantIds
            .filter(id => id && id !== 'BYE')
            .map(id => getTeamFromCatalog(id))
            .filter(Boolean) as Team[];

        const getKey = (teamId: string, playerName: string) => `${teamId}||${playerName}`;

        const existing = new Map<string, { canestri: number; soffi: number }>();
        (m.stats || []).forEach(s => {
            const k = getKey(s.teamId, s.playerName);
            existing.set(k, { canestri: s.canestri || 0, soffi: s.soffi || 0 });
        });

        const seedPlayer = (teamId?: string, playerName?: string) => {
            if (!teamId || !playerName) return;
            if (teamId === 'BYE') return;
            const k = getKey(teamId, playerName);
            const v = existing.get(k) || { canestri: 0, soffi: 0 };
            nextForm[k] = { canestri: String(v.canestri ?? 0), soffi: String(v.soffi ?? 0) };
        };

        participantTeams.forEach(tt => {
            seedPlayer(tt?.id, tt?.player1);
            seedPlayer(tt?.id, tt?.player2);
        });

        setReportStatsForm(nextForm);
    };

    const handlePickReportMatch = (id: string) => {
        const m = (state.tournamentMatches || []).find(mm => mm.id === id);
        if (!m) return;
        if (!isReportableMatch(m)) {
            alert(t('report_unavailable_placeholder'));
            return;
        }
        initReportFormFromMatch(m);
        setReportImageUrl('');
    };

    const openReportFromCodes = (id: string) => {
        const m = (state.tournamentMatches || []).find(mm => mm.id === id);
        if (!m) return;
        if (!isReportableMatch(m)) {
            alert(t('report_unavailable_placeholder'));
            return;
        }
        setTab('reports');
        handlePickReportMatch(id);
    };

    const handleReportFile = async (file: File) => {
        setReportImageBusy(true);
        try {
            const {
                preprocessRefertoToAlignedCanvas,
                ocrTextFromAlignedCanvas,
            } = await loadImageProcessingService();
            const aligned = await preprocessRefertoToAlignedCanvas(file);
            const url = aligned.toDataURL('image/jpeg', 0.92);
            setReportImageUrl(url);
            // OCR (beta): extract raw text and try to prefill match code + score
            setReportOcrText('');
            setReportOcrBusy(true);
            try {
                const text = await ocrTextFromAlignedCanvas(aligned);
                setReportOcrText(text || '');

                const cleaned = String(text || '').replace(/\r/g, '\n');
                const codeMatch = cleaned.match(/\b([GBE]\d{1,4})\b/i);
                if (codeMatch) {
                    const code = codeMatch[1].toUpperCase();
                    const mByCode = (state.tournamentMatches || []).find(mm => (mm.code || '').toUpperCase() === code);
                    if (mByCode) {
                        initReportFormFromMatch(mByCode);
                    }
                }

                // Score pattern: 10-8, 10 : 8, 10–8
                const scoreMatch = cleaned.match(/\b(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/);
                if (scoreMatch) {
                    setReportScoreA(scoreMatch[1]);
                    setReportScoreB(scoreMatch[2]);
                    setReportStatus('finished');
                }
            } finally {
                setReportOcrBusy(false);
            }
        } catch (e) {
            console.error(e);
            alert(t('admin_report_image_prep_error'));
        } finally {
            setReportImageBusy(false);
        }
    };

    const handleSaveReport = () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }
        const matches = [...(state.tournamentMatches || [])];
        const idx = matches.findIndex(m => m.id === reportMatchId);
        if (idx === -1) {
            alert(t('alert_select_match'));
            return;
        }
        const base = matches[idx];
        if (!isReportableMatch(base)) {
            alert(t('report_unavailable_placeholder'));
            return;
        }
        // Score is derived from the sum of players' baskets (canestri), not manually inserted.
        const computeTeamScore = (team: Team | undefined) => {
            if (!team?.id || team.id === 'BYE') return 0;
            const getCan = (playerName?: string) => {
                if (!playerName) return 0;
                const k = `${team.id}||${playerName}`;
                const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
                return Math.max(0, parseInt(f.canestri || '0', 10) || 0);
            };
            return getCan(team.player1) + getCan(team.player2);
        };

        const isMulti = (base.teamIds && base.teamIds.length >= 2);
        const participantIds = isMulti
            ? (base.teamIds || []).filter(Boolean)
            : ([base.teamAId, base.teamBId].filter(Boolean) as string[]);

        const participantTeams = participantIds
            .filter(id => id && id !== 'BYE')
            .map(id => getTeamFromCatalog(id))
            .filter(Boolean) as Team[];

        const scoresByTeam: Record<string, number> = {};
        participantTeams.forEach(tt => { scoresByTeam[tt.id] = computeTeamScore(tt); });

        // Prevent saving ties: there must be a unique winner.
        const isByeMatch = participantIds.includes('BYE');
        if (!isByeMatch) {
            const vals = Object.values(scoresByTeam);
            const max = vals.length ? Math.max(...vals) : 0;
            const leaders = Object.keys(scoresByTeam).filter(id => (scoresByTeam[id] || 0) === max);
            if (leaders.length !== 1) {
                alert(t('alert_tie_not_allowed'));
                return;
            }
        }

        const orderedScores = Object.values(scoresByTeam).sort((a, b) => b - a);
        const updated: Match = {
            ...base,
            scoresByTeam: isMulti ? scoresByTeam : base.scoresByTeam,
            // Legacy fields for 1v1 UI + some older components.
            scoreA: isMulti ? (orderedScores[0] ?? 0) : (scoresByTeam[base.teamAId || ''] ?? 0),
            scoreB: isMulti ? (orderedScores[1] ?? 0) : (scoresByTeam[base.teamBId || ''] ?? 0),
            // Salvataggio referto = match concluso (ma sempre modificabile riaprendo il referto).
            status: 'finished',
            played: true
        };

        // Build stats (only for real teams, not BYE)
        const nextStats: any[] = [];
        const pushStat = (teamId?: string, playerName?: string) => {
            if (!teamId || !playerName) return;
            if (teamId === 'BYE') return;
            const k = `${teamId}||${playerName}`;
            const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
            nextStats.push({
                teamId,
                playerName,
                canestri: Math.max(0, parseInt(f.canestri || '0', 10) || 0),
                soffi: Math.max(0, parseInt(f.soffi || '0', 10) || 0),
            });
        };

        const teamsForStats: Team[] = isMulti
            ? participantTeams
            : ([getTeamFromCatalog(updated.teamAId), getTeamFromCatalog(updated.teamBId)].filter(Boolean) as Team[]);

        if (updated.status === 'finished') {
            teamsForStats.forEach(tt => {
                pushStat(tt?.id, tt?.player1);
                pushStat(tt?.id, tt?.player2);
            });
            updated.stats = nextStats.length ? nextStats : updated.stats;
        }

        matches[idx] = updated;

        // Sync bracket from groups when in groups+elimination mode (fills placeholders / reseeds when groups are complete).
        let finalMatches = matches;
        if (updated.phase === 'groups' && state.tournament?.type === 'groups_elimination') {
            finalMatches = syncBracketFromGroups(state.tournament, finalMatches);
            finalMatches = autoResolveBracketByes(finalMatches);
        }

        // Final stage: if the final round-robin is activated and completed, auto-create FTB* if needed.
        if (updated.phase === 'groups' && state.tournament) {
            finalMatches = ensureFinalTieBreakIfNeeded(state.tournament, finalMatches);
        }

        // Propagate winner in bracket (and auto-win BYEs) when a bracket match is finished.
        if (updated.phase === 'bracket' && updated.status === 'finished') {
            finalMatches = propagateWinnerFromMatch(updated, finalMatches);
        }

        commitLiveMatches(finalMatches);
        alert(t('alert_report_saved'));
    };

    // Known-safe Admin landing (used only when recovering from a render crash).
    // Minimal: reset internal nav state + clear persisted Admin navigation keys.
    const recoverToSafeAdmin = () => {
        clearAdminSessionNavKeys();
        setAdminSection('live');
        setLastLiveTab('teams');
        setTab('teams');
        setDataSubTab('archive');
        setIntegrationsSubTab('hof');
    };

    const performAdminLogout = async (reload: boolean = true) => {
        await Promise.allSettled([
            signOutSupabase(),
            playerSignOutSupabase(),
        ]);
        safeSessionRemove(ADMIN_LEGACY_AUTH_LS_KEY);
        setAuthed(false);
        setAdminAuthMode('none');
        setSupabaseEmail(null);
        setAdminAuthError('');
        setAdminAuthPasswordInput('');
        setAdminSessionChecking(false);
        if (reload) window.location.reload();
    };

    if (!authed) {
        const doAdminLogin = async () => {
            setLoginBusy(true);
            setAdminAuthError('');

            try {
                if (!adminAuthEmailInput.trim()) {
                    throw new Error(t('admin_supabase_email_label'));
                }
                if (!adminAuthPasswordInput.trim()) {
                    throw new Error(t('admin_enter_valid_password'));
                }

                const normalizedEmail = adminAuthEmailInput.trim().toLowerCase();
                const configuredEmail = getConfiguredAdminEmail().trim().toLowerCase();
                const legacyBootstrapMatch =
                    normalizedEmail === configuredEmail && adminAuthPasswordInput === ADMIN_LEGACY_BOOTSTRAP_PASSWORD;

                if (supabaseConfig) {
                    try {
                        const result = await signInWithPassword(adminAuthEmailInput, adminAuthPasswordInput);
                        const access = await ensureSupabaseAdminAccess();
                        if (!access.ok) {
                            await signOutSupabase();
                            const reason = access.reason || t('admin_access_not_authorized');
                            throw new Error(`${reason} ${t('admin_access_denied_hint')} public.admin_users.`);
                        }
                        const resolvedEmail = access.email || result.email || adminAuthEmailInput.trim();
                        mirrorAdminSessionToPlayer({
                            accessToken: result.accessToken,
                            refreshToken: result.refreshToken || null,
                            expiresAt: result.expiresAt || null,
                            email: resolvedEmail,
                            userId: result.userId || null,
                        });
                        applyAdminAuthState(resolvedEmail, legacyBootstrapMatch);
                        setAdminAuthPasswordInput('');
                        return;
                    } catch (err: any) {
                        if (!legacyBootstrapMatch) {
                            throw err;
                        }
                    }
                }

                if (legacyBootstrapMatch) {
                    applyAdminAuthState(getConfiguredAdminEmail(), true);
                    setAdminAuthPasswordInput('');
                    return;
                }

                throw new Error(!supabaseConfig ? t('db_supabase_not_configured') : t('admin_access_not_authorized'));
            } catch (err: any) {
                setAuthed(false);
                setAdminAuthMode('none');
                safeSessionRemove(ADMIN_LEGACY_AUTH_LS_KEY);
                setSupabaseEmail(null);
                setAdminAuthError(String(err?.message || err || t('admin_access_not_authorized')));
            } finally {
                setLoginBusy(false);
            }
        };

        return (
            <div className="animate-fade-in">
                <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="w-full max-w-xl">
                        <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-xl">
                            <div className="bg-gradient-to-r from-slate-950 to-slate-800 text-white p-6">
                                <div className="flex items-start gap-3">
                                    <div className="p-3 rounded-2xl bg-white/10 border border-white/10">
                                        <ShieldCheck className="w-6 h-6 text-beer-500" aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-black uppercase tracking-wider text-white/70">FLBP Manager</div>
                                        <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
                                            {t('admin')}
                                        </h2>
                                        <p className="text-sm font-semibold text-white/75 mt-1">
                                            {t('admin_auth_desc')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-4">
                                <p className="text-slate-600 text-sm font-semibold">
                                    {t('admin_login_note')}
                                </p>

                                {!supabaseConfig ? (
                                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
                                        <div className="font-black">{t('admin_login_failed')}</div>
                                        <div className="text-sm font-semibold mt-1">{t('db_supabase_not_configured')}</div>
                                    </div>
                                ) : null}

                                {adminSessionChecking && supabaseEmail ? (
                                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
                                        <div className="font-black">{t('admin_supabase_session_detected')}</div>
                                        <div className="text-sm font-semibold mt-1">
                                            {supabaseEmail}
                                        </div>
                                    </div>
                                ) : null}

                                {!sessionStorageWritable ? (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                                        <div className="font-black">{t('admin_storage_warning_title')}</div>
                                        <div className="text-sm font-semibold opacity-90 mt-1">
                                            {t('admin_storage_warning_desc')}
                                        </div>
                                    </div>
                                ) : null}

                                {adminAuthError ? (
                                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
                                        <div className="font-black">{t('admin_login_failed')}</div>
                                        <div className="text-sm font-semibold mt-1">{adminAuthError}</div>
                                    </div>
                                ) : null}

                                <div className="grid grid-cols-1 gap-2">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-500" htmlFor="admin-access-email">
                                        {t('admin_supabase_email_label')}
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                                        <div>
                                            <input
                                                id="admin-access-email"
                                                type="email"
                                                value={adminAuthEmailInput}
                                                onChange={(e) => setAdminAuthEmailInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !loginBusy) void doAdminLogin();
                                                }}
                                                placeholder={getConfiguredAdminEmail()}
                                                autoComplete="email"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                            />
                                        </div>
                                        <div>
                                            <input
                                                id="admin-access-password"
                                                type="password"
                                                value={adminAuthPasswordInput}
                                                onChange={(e) => setAdminAuthPasswordInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !loginBusy) void doAdminLogin();
                                                }}
                                                placeholder={t('admin_password_placeholder')}
                                                autoComplete="current-password"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { void doAdminLogin(); }}
                                            disabled={loginBusy || !supabaseConfig || !adminAuthEmailInput.trim() || !adminAuthPasswordInput.trim()}
                                            className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${loginBusy || !supabaseConfig || !adminAuthEmailInput.trim() || !adminAuthPasswordInput.trim() ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-blue-700 text-white hover:bg-blue-800 border border-blue-700'}`}
                                        >
                                            <CheckCircle2 className="w-5 h-5" aria-hidden />
                                            {loginBusy ? t('admin_login_busy') : t('admin_login')}
                                        </button>
                                    </div>
                                    <div className="text-xs text-slate-500 font-semibold">
                                        {t('admin_recommended_email')}: <span className="font-black">{getConfiguredAdminEmail()}</span>.
                                    </div>
                                    <div className="text-xs text-slate-500 font-semibold">
                                        {t('admin_password_server_only')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 text-center text-xs text-slate-400 font-semibold">
                            {t('admin_internal_access_hint')}
                        </div>
                    </div>
                </div>
            </div>
        );
    }


    // --- TAB COMPONENTS (estratti per manutenibilità, logica invariata) ---
    // Tutti i tab Admin ora sono in file separati (./admin/tabs/*).

    const monitorBracketTabProps = {
        state,
        simBusy,
        handleSimulateTurn,
        handleSimulateAll,
        handleUpdateLiveMatch,
        handleUpdateTournamentAndMatches,
        getTeamName,
        openReportFromCodes,
        toggleMatchStatus,
        handleActivateFinalRoundRobin,
        openTournamentEditor,
    };

    const dataTabProps = {
        state,
        setState,
        t,
        exportBackupJson,
        restoreBackupJson,
        mergeBackupJson,
        dataSubTab,
        setDataSubTab,
        integrationsSubTab,
        setIntegrationsSubTab,
        aliasesSearch,
        setAliasesSearch,
        aliasToolSelections,
        setAliasToolSelections,
        buildProfilesIndex,
        setAlias,
        removeAlias,
        dataSelectedTournamentId,
        setDataSelectedTournamentId,
        dataSelectedMatchId,
        setDataSelectedMatchId,
        dataScoreA,
        setDataScoreA,
        dataScoreB,
        setDataScoreB,
        dataStatus,
        setDataStatus,
        dataRecomputeAwards,
        setDataRecomputeAwards,
        dataWinnerTeamId,
        setDataWinnerTeamId,
        dataTopScorerPlayerId,
        setDataTopScorerPlayerId,
        dataDefenderPlayerId,
        setDataDefenderPlayerId,
        dataMvpPlayerId,
        setDataMvpPlayerId,
        dataTopScorerU25PlayerId,
        setDataTopScorerU25PlayerId,
        dataDefenderU25PlayerId,
        setDataDefenderU25PlayerId,
        hofEditId,
        setHofEditId,
        hofEditTournamentId,
        setHofEditTournamentId,
        hofYear,
        setHofYear,
        hofTournamentName,
        setHofTournamentName,
        hofType,
        setHofType,
        hofTeamName,
        setHofTeamName,
        hofWinnerP1,
        setHofWinnerP1,
        hofWinnerP2,
        setHofWinnerP2,
        hofPlayerName,
        setHofPlayerName,
        hofPlayerYoB,
        setHofPlayerYoB,
        hofValue,
        setHofValue,
        scorersImportWarnings,
        setScorersImportWarnings,
        setPendingScorersImport,
        setAliasModalOpen,
        setAliasModalTitle,
        setAliasModalConflicts,
        scorersFileRef,
        createArchiveOpen,
        createArchiveStep,
        setCreateArchiveStep,
        createArchiveName,
        setCreateArchiveName,
        createArchiveDate,
        setCreateArchiveDate,
        createArchiveMode,
        setCreateArchiveMode,
        createArchiveGroups,
        setCreateArchiveGroups,
        createArchiveAdvancing,
        setCreateArchiveAdvancing,
        createArchiveFinalRrEnabled,
        setCreateArchiveFinalRrEnabled,
        createArchiveFinalRrTopTeams,
        setCreateArchiveFinalRrTopTeams,
        createArchiveTeams,
        createArchiveFileRef,
        caTeamName,
        setCaTeamName,
        caP1,
        setCaP1,
        caY1,
        setCaY1,
        caP2,
        setCaP2,
        caY2,
        setCaY2,
        caP1IsRef,
        setCaP1IsRef,
        caP2IsRef,
        setCaP2IsRef,
        openCreateArchiveWizard,
        resetCreateArchiveWizard,
        copyLiveTeamsIntoWizard,
        importArchiveTeamsFile,
        addWizardTeam,
        createArchivedTournament,
        removeWizardTeam,
        autoFixBracketFromResults,
    };

    const tournamentEditorTabProps = {
        state,
        setState,
        handleUpdateTournamentAndMatches,
        initialView: editorInitialView,
    };

	    return (
        <AdminRenderRecoveryBoundary
            nav={{ adminSection, tab, dataSubTab, integrationsSubTab }}
            onRecover={recoverToSafeAdmin}
            labels={{
                errorTitle: t('admin_render_error_title'),
                errorDesc: t('admin_render_error_desc'),
                restoreButton: t('editor_reload_current_state'),
            }}
        >
	        <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-200">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                                <h2 className="text-2xl font-black flex items-center gap-2 shrink-0">
                                    {t('admin')}
                                </h2>
                                <nav role="tablist" aria-label={t('admin_sections_aria')} className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl bg-slate-50 border border-slate-200 p-1 whitespace-nowrap">
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={adminSection==='live'}
                                        onMouseEnter={() => primeAdminContentChunk(resolveStoredLiveTab())}
                                        onFocus={() => primeAdminContentChunk(resolveStoredLiveTab())}
                                        onClick={() => { void switchAdminSection('live'); }}
                                        className={`shrink-0 whitespace-nowrap px-3 py-2.5 rounded-xl text-sm font-black inline-flex items-center gap-2 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${adminSection==='live' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <PlayCircle className="w-4 h-4" aria-hidden /> {t('admin_live_management')}
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={adminSection==='data'}
                                        onMouseEnter={() => primeAdminContentChunk('data')}
                                        onFocus={() => primeAdminContentChunk('data')}
                                        onClick={() => { void switchAdminSection('data'); }}
                                        className={`shrink-0 whitespace-nowrap px-3 py-2.5 rounded-xl text-sm font-black inline-flex items-center gap-2 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${adminSection==='data' ? 'bg-blue-700 text-white border-blue-700 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <Settings className="w-4 h-4" aria-hidden /> {t('admin_data_management')}
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={adminSection==='editor'}
                                        onMouseEnter={() => primeAdminContentChunk('editor')}
                                        onFocus={() => primeAdminContentChunk('editor')}
                                        onClick={() => { void switchAdminSection('editor'); }}
                                        className={`shrink-0 whitespace-nowrap px-3 py-2.5 rounded-xl text-sm font-black inline-flex items-center gap-2 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${adminSection==='editor' ? 'bg-blue-700 text-white border-blue-700 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <Brackets className="w-4 h-4" aria-hidden /> {t('admin_structural_editor')}
                                    </button>
                                </nav>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2 min-w-0">
                                {adminSection === 'live' ? (
                                    <>
                                        <div className="text-sm text-slate-500 font-bold">
                                            {t('admin_live_desc')}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200">
                                                {t('live_badge')}
                                            </span>
                                        </div>
                                    </>
                                ) : adminSection === 'editor' ? (
                                    <>
                                        <div className="text-sm text-slate-500 font-bold">
                                            {t('admin_editor_desc')}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide border bg-blue-50 text-blue-800 border-blue-200">
                                                {t('admin_structural_editor')}
                                            </span>
                                        </div>
                                    </>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">
                                <div className="max-w-full sm:max-w-[240px] text-xs font-black px-2 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200 truncate" title={supabaseEmail ? `${t('admin_supabase_label')}: ${supabaseEmail}` : t('admin_session_active')}>
                                    {supabaseEmail ? (<>{t('admin_supabase_label')}: {supabaseEmail}</>) : (<>{t('admin_session_active')}</>)}
                                </div>
                                <div
                                    className={`text-xs font-black px-2 py-1 rounded-full border ${adminSyncState.phase === 'synced'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : adminSyncState.phase === 'syncing'
                                            ? 'bg-sky-50 text-sky-800 border-sky-200'
                                            : adminSyncState.phase === 'pending'
                                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                                : adminSyncState.phase === 'error' || adminSyncState.phase === 'conflict'
                                                    ? 'bg-red-50 text-red-800 border-red-200'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                                    title={`${adminSyncState.message}${adminSyncState.lastSuccessAt ? ` · ${t('admin_last_ok')}: ${new Date(adminSyncState.lastSuccessAt).toLocaleString()}` : ''}`}
                                >
                                    {adminSyncState.phase === 'synced'
                                        ? t('admin_sync_ok')
                                        : adminSyncState.phase === 'syncing'
                                            ? t('admin_syncing')
                                            : adminSyncState.phase === 'pending'
                                                ? t('admin_pending')
                                                : adminSyncState.phase === 'error'
                                                    ? t('admin_sync_err')
                                                    : adminSyncState.phase === 'conflict'
                                                        ? t('admin_sync_conflict')
                                                        : t('admin_autosave')}
                                </div>
                                <div
                                    className={`text-xs font-black px-2 py-1 rounded-full border ${swDisabled
                                        ? 'bg-slate-50 text-slate-700 border-slate-200'
                                        : 'bg-blue-50 text-blue-800 border-blue-200'}`}
                                    title={t('admin_cache_status_title')}
                                >
                                    {swDisabled ? t('admin_cache_off') : t('admin_cache_on')}
                                </div>

                                <details ref={adminToolsMenuRef} className="group relative">
                                <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 text-slate-800 px-3 py-2 rounded-xl text-sm font-black border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2">
                                    <Settings className="w-4 h-4" /> {t('admin_tools')}
                                </summary>
                                <button
                                    type="button"
                                    aria-label={t('close')}
                                    onClick={closeAdminToolsMenu}
                                    className="fixed inset-0 z-10 hidden bg-slate-950/25 group-open:block sm:hidden"
                                />
                                <div className="fixed inset-x-4 top-24 bottom-4 z-20 hidden overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl group-open:block sm:absolute sm:right-0 sm:top-full sm:bottom-auto sm:mt-2 sm:w-[360px] sm:max-w-[92vw] sm:rounded-2xl sm:p-3">
                                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 sm:hidden">
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-wide text-slate-500">{t('admin_tools')}</div>
                                            <div className="text-sm font-bold text-slate-700">{t('admin_cache_status_title')}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={closeAdminToolsMenu}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                        >
                                            {t('close')}
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="text-xs font-black text-slate-500 uppercase tracking-wide">{t('admin_offline_cache')}</div>
                                                <div
                                                    className={`text-[10px] font-black px-2 py-1 rounded-full border ${swDisabled
                                                        ? 'bg-white text-slate-700 border-slate-200'
                                                        : 'bg-blue-50 text-blue-800 border-blue-200'}`}
                                                    title={t('admin_cache_status_title')}
                                                >
                                                    {swDisabled ? t('admin_cache_off') : t('admin_cache_on')}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
<button
                                                    onClick={async () => {
                                                        const next = !swDisabled;
                                                        const msg = next
                                                            ? t('admin_disable_cache_confirm')
                                                            : t('admin_enable_cache_confirm');
                                                        if (!confirm(msg)) return;
                                                        try {
                                                            if (next) localStorage.setItem('flbp_sw_disabled', '1');
                                                            else localStorage.removeItem('flbp_sw_disabled');
                                                        } catch {}
                                                        setSwDisabled(next);
                                                        if (next) {
                                                            await bestEffortClearSwCaches();
                                                        }
                                                        window.location.reload();
                                                    }}
                                                    className={`text-sm font-semibold px-3 py-2 rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${swDisabled
                                                        ? 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                                                        : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2`}
                                                >
                                                    {swDisabled ? t('admin_enable_cache') : t('admin_disable_cache')}
                                                </button>
<button
                                                    onClick={async () => {
                                                        if (!confirm(t('admin_clear_cache_confirm'))) return;
                                                        await bestEffortClearSwCaches();
                                                        try { localStorage.removeItem('flbp_sw_disabled'); } catch {}
                                                        setSwDisabled(false);
                                                        window.location.reload();
                                                    }}
                                                    className="text-sm font-semibold px-3 py-2 rounded-xl border bg-white text-slate-800 border-slate-200 hover:bg-slate-50 transition-colors inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                                >
                                                    <Trash2 className="w-3 h-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2" />
                                                    <span>{t('admin_clear_cache')}</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">{t('admin_mode')}</div>
                                            {isAppModeLockedForPublicDeploy ? (
                                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                                                    {t('admin_public_build_locked')}: <span className="font-black">{t('admin_official_mode')}</span>.
                                                    {t('admin_public_build_hidden_tester')}
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
<button
                                                onClick={() => {
                                                    const next = (APP_MODE === 'tester') ? 'official' : 'tester';
	                                                    const msg = next === 'tester'
	                                                        ? t('admin_switch_to_tester_confirm')
	                                                        : t('admin_switch_to_official_confirm');
                                                    if (!confirm(msg)) return;
                                                    setAppModeOverride(next);
                                                    window.location.reload();
                                                }}
                                                className={`text-sm font-semibold px-3 py-2 rounded-xl border inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${APP_MODE === 'tester'
                                                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2`}
                                                title={t('admin_app_mode_title')}
                                            >
                                                {APP_MODE === 'tester' ? t('admin_tester_mode') : t('admin_official_mode')}
                                            </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">{t('admin_session')}</div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(t('admin_supabase_logout_confirm'))) return;
                                                        await performAdminLogout();
                                                    }}
                                                    className="text-sm font-semibold px-3 py-2 rounded-xl border bg-white text-slate-800 border-slate-200 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                                    title={t('admin_logout')}
                                                >
                                                    {t('admin_logout')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                </div>

                    {adminSection === 'live' ? (
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <div className="text-xs font-black text-slate-500 uppercase tracking-wide">{t('admin_tv_label')}</div>
                                <details className="relative">
                                    <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 bg-slate-900 text-white px-3.5 py-2.5 rounded-xl font-black hover:bg-slate-800 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2">
                                        <MonitorPlay className="w-4 h-4" /> {t('admin_open_tv')}
                                        <ChevronDown className="w-4 h-4 opacity-80" />
                                    </summary>
                                    <div className="absolute left-0 mt-2 min-w-[280px] max-w-[92vw] bg-white border border-slate-200 shadow-xl rounded-2xl p-2 z-20">
                                        <div className="grid gap-2">
                                            <button type="button" onClick={() => onEnterTv('groups')} className="w-full text-left bg-white text-slate-900 px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2">
                                                <MonitorPlay className="w-4 h-4"/> {t('admin_tv_groups')}
                                            </button>
                                            <button type="button" onClick={() => onEnterTv('groups_bracket')} className="w-full text-left bg-white text-slate-900 px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2">
                                                <MonitorPlay className="w-4 h-4"/> {t('admin_tv_groups_bracket')}
                                            </button>
                                            <button type="button" onClick={() => onEnterTv('bracket')} className="w-full text-left bg-white text-slate-900 px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2">
                                                <MonitorPlay className="w-4 h-4"/> {t('admin_tv_bracket')}
                                            </button>
                                            <button type="button" onClick={() => onEnterTv('scorers')} className="w-full text-left bg-white text-slate-900 px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2">
                                                <MonitorPlay className="w-4 h-4"/> {t('admin_tv_scorers')}
                                            </button>
                                        </div>
                                    </div>
                                </details>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-black text-slate-500 uppercase tracking-wide">{t('admin_tournament_label')}</div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openMvpModal(false)}
                                        className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 font-black text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                        title={t('mvp_plural')}
                                    >
                                        <span className="text-base select-none">⭐</span>
                                        <span>{t('mvp_plural')}</span>
                                        {state.tournament ? (
                                            <span className="text-xs font-black text-slate-400">
                                                {(() => {
                                                    const c = (state.hallOfFame || []).filter(e => e.tournamentId === state.tournament!.id && e.type === 'mvp').length;
                                                    return c > 0 ? `(${c})` : '';
                                                })()}
                                            </span>
                                        ) : null}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleArchive}
                                        className="bg-red-50 text-red-700 border border-red-200 px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                    >
                                        <Archive className="w-4 h-4" /> {t('complete_tournament')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {adminSection === 'live' && isTesterMode ? (
                    <details className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                        <summary className="cursor-pointer list-none font-black text-sm text-amber-900 inline-flex items-center gap-2">
                            <ChevronDown className="w-4 h-4 opacity-80" />
                            {t('admin_tester_tools')}
                        </summary>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleSimulateTurn}
                                disabled={simBusy}
                                className="bg-amber-500 text-white px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-amber-600 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                title={t('admin_simulate_turn_title')}
                            >
                                <span className="text-base select-none">🧪</span> {t('admin_simulate_turn_button')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSimulateAll}
                                disabled={simBusy}
                                className="bg-amber-600 text-white px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-amber-700 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                title={t('admin_simulate_all_title')}
                            >
                                <span className="text-base select-none">⚡</span> {t('admin_simulate_all_button')}
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteLiveTournament}
                                disabled={!state.tournament}
                                className="bg-red-600 text-white px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                title={t('admin_delete_live_tournament_title')}
                            >
                                <Trash2 className="w-4 h-4" /> {t('delete')} {t('monitor_live_tournament_label')}
                            </button>
                        </div>
                        <div className="mt-2 text-xs font-bold text-amber-900/80">
                            {t('admin_tester_tools_hint')}
                        </div>
                    </details>
                ) : null}


                <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/90 p-3 shadow-sm">
                    {adminSection === 'live' ? (
                        <nav aria-label={t('admin_tabs_aria')} className="bg-white rounded-xl border border-slate-200 p-3">
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">{t('admin_ops_hub')}</span>
                                    <div className="text-sm font-black text-blue-800 bg-blue-50 border border-blue-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_area_label')}: <span className="font-black">{liveTabMeta[tab as LiveAdminTab]?.title || '-'}</span>
                                    </div>
                                    <div className="text-sm font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_guiding_match')}:  <span className="font-mono">{liveOpsSummary.current?.code || '-'}</span>
                                    </div>
                                    <div className="text-sm font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_to_play')}:  <span className="font-black">{liveOpsSummary.scheduledCount}</span>
                                    </div>
                                    <div className="text-sm font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_playing_count_label')}:  <span className="font-black">{liveOpsSummary.playingCount}</span>
                                    </div>
                                    <div className="text-sm font-black text-rose-800 bg-rose-50 border border-rose-200 rounded-full px-3.5 py-1.5 shadow-sm">
                                        {t('admin_finished_count_label')}:  <span className="font-black">{liveOpsSummary.finishedCount}</span>
                                    </div>
                                </div>

                                <div className="relative border-t border-slate-100 pt-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            aria-current={tab === 'teams' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('teams')}
                                            onFocus={() => primeAdminContentChunk('teams')}
                                            onClick={() => { void openLiveTab('teams'); }}
                                            className={tabBtnClass(tab === 'teams')}
                                        >
                                            <Users className="w-4 h-4" /> {t('teams')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'structure' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('structure')}
                                            onFocus={() => primeAdminContentChunk('structure')}
                                            onClick={() => { void openLiveTab('structure'); }}
                                            className={tabBtnClass(tab === 'structure')}
                                        >
                                            <Brackets className="w-4 h-4" /> {t('structure')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'reports' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('reports')}
                                            onFocus={() => primeAdminContentChunk('reports')}
                                            onClick={() => { void openLiveTab('reports'); }}
                                            className={tabBtnClass(tab === 'reports')}
                                        >
                                            <ClipboardList className="w-4 h-4" /> {t('reports')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'referees' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('referees')}
                                            onFocus={() => primeAdminContentChunk('referees')}
                                            onClick={() => { void openLiveTab('referees'); }}
                                            className={tabBtnClass(tab === 'referees')}
                                        >
                                            <ShieldCheck className="w-4 h-4" /> {t('referees')}
                                        </button>
                                        <button
                                            type="button"
                                            aria-current={tab === 'codes' ? 'page' : undefined}
                                            onMouseEnter={() => primeAdminContentChunk('codes')}
                                            onFocus={() => primeAdminContentChunk('codes')}
                                            onClick={() => { void openLiveTab('codes'); }}
                                            className={tabBtnClass(tab === 'codes')}
                                        >
                                            <ListChecks className="w-4 h-4" /> {t('code_list')}
                                        </button>
                                        {(showGroupsMonitor && showBracketMonitor) ? (
                                            <button
                                                type="button"
                                                ref={monitorMenuButtonRef}
                                                aria-expanded={monitorMenuOpen}
                                                onClick={() => setMonitorMenuOpen(v => !v)}
                                                className={tabBtnClass(tab === 'monitor_groups' || tab === 'monitor_bracket')}
                                            >
                                                <LayoutDashboard className="w-4 h-4" /> {t('admin_monitor_label')}
                                                <ChevronDown className={`w-4 h-4 opacity-80 transition-transform ${monitorMenuOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                        ) : null}
                                        {showGroupsMonitor && !showBracketMonitor ? (
                                            <button
                                                type="button"
                                                aria-current={tab === 'monitor_groups' ? 'page' : undefined}
                                                onMouseEnter={() => primeAdminContentChunk('monitor_groups')}
                                                onFocus={() => primeAdminContentChunk('monitor_groups')}
                                                onClick={() => { void openLiveTab('monitor_groups'); }}
                                                className={tabBtnClass(tab === 'monitor_groups')}
                                            >
                                                <LayoutDashboard className="w-4 h-4" /> {t('monitor_groups')}
                                            </button>
                                        ) : null}
                                        {!showGroupsMonitor && showBracketMonitor ? (
                                            <button
                                                type="button"
                                                aria-current={tab === 'monitor_bracket' ? 'page' : undefined}
                                                onMouseEnter={() => primeAdminContentChunk('monitor_bracket')}
                                                onFocus={() => primeAdminContentChunk('monitor_bracket')}
                                                onClick={() => { void openLiveTab('monitor_bracket'); }}
                                                className={tabBtnClass(tab === 'monitor_bracket')}
                                            >
                                                <Brackets className="w-4 h-4" /> {t('monitor_bracket')}
                                            </button>
                                        ) : null}
                                    </div>

                                    {(showGroupsMonitor && showBracketMonitor && monitorMenuOpen) ? (
                                        <div
                                            className="fixed min-w-[240px] max-w-[92vw] bg-white border border-slate-200 shadow-xl rounded-2xl p-2 z-[60]"
                                            style={{ left: `${monitorMenuPosition.left}px`, top: `${monitorMenuPosition.top}px` }}
                                        >
                                            <div className="grid gap-2">
                                                <button
                                                    type="button"
                                                    onMouseEnter={() => primeAdminContentChunk('monitor_groups')}
                                                    onFocus={() => primeAdminContentChunk('monitor_groups')}
                                                    onClick={() => {
                                                        void openLiveTab('monitor_groups');
                                                        setMonitorMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${tab === 'monitor_groups' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 hover:bg-slate-50'}`}
                                                >
                                                    <LayoutDashboard className="w-4 h-4" /> {t('monitor_groups')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onMouseEnter={() => primeAdminContentChunk('monitor_bracket')}
                                                    onFocus={() => primeAdminContentChunk('monitor_bracket')}
                                                    onClick={() => {
                                                        void openLiveTab('monitor_bracket');
                                                        setMonitorMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl font-black inline-flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2 ${tab === 'monitor_bracket' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 hover:bg-slate-50'}`}
                                                >
                                                    <Brackets className="w-4 h-4" /> {t('monitor_bracket')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </nav>
                    ) : adminSection === 'data' ? (
                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_data_section')} description={t('admin_loading_non_blocking')} />}>
                            <DataTabLazy {...dataTabProps} embedded />
                        </React.Suspense>
                    ) : adminSection === 'editor' ? (
                        <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_tournament_editor')} description={t('admin_loading_non_blocking')} />}>
                            <TournamentEditorTabLazy {...tournamentEditorTabProps} />
                        </React.Suspense>
                    ) : null}
                </div>
            </div>

            {/* TAB CONTENT */}
            <React.Suspense fallback={<AdminChunkFallback label={t('admin_loading_admin_tab')} description={t('admin_loading_non_blocking')} />}>
            {tab === 'teams' && (
                <TeamsTabLazy
                    t={t}
                    fileRef={fileRef}
                    backupRef={backupRef}
                    importFile={importFile}
                    importBackupJson={restoreBackupJson}
                    exportTeamsXlsx={exportTeamsXlsx}
                    exportBackupJson={exportBackupJson}
                    printTeams={printTeams}
                    editingId={editingId}
                    teamName={teamName}
                    setTeamName={setTeamName}
                    p1={p1}
                    setP1={setP1}
                    p2={p2}
                    setP2={setP2}
                    y1={y1}
                    setY1={setY1}
                    y2={y2}
                    setY2={setY2}
                    p1IsReferee={p1IsReferee}
                    setP1IsReferee={setP1IsReferee}
                    p2IsReferee={p2IsReferee}
                    setP2IsReferee={setP2IsReferee}
                    saveTeam={saveTeam}
                    resetForm={resetForm}
                    poolN={poolN}
                    setPoolN={setPoolN}
                    genPool={genPool}
                    addHomonyms={addHomonyms}
                    clearTeams={clearTeams}
                    sortedTeams={sortedTeams}
                    editTeam={editTeam}
                    deleteTeam={deleteTeam}
                    state={state}
                    setState={setState}
                />
            )}


            {tab === 'structure' && (
                <StructureTabLazy
                    state={state}
                    draft={draft}
                    tournName={tournName}
                    setTournName={setTournName}
                    tournDate={tournDate}
                    setTournDate={setTournDate}
                    tournMode={tournMode}
                    setTournMode={setTournMode}
                    finalRrEnabled={finalRrEnabled}
                    setFinalRrEnabled={setFinalRrEnabled}
                    finalRrTopTeams={finalRrTopTeams}
                    setFinalRrTopTeams={setFinalRrTopTeams}
                    numGroups={numGroups}
                    setNumGroups={setNumGroups}
                    advancing={advancing}
                    setAdvancing={setAdvancing}
                    handleGenerate={handleGenerate}
                    handleStartLive={handleStartLive}
                    printBracket={printBracket}
                />
            )}

            {tab === 'reports' && (
                <ReportsTabLazy
                    state={state}
                    reportMatchId={reportMatchId}
                    handlePickReportMatch={handlePickReportMatch}
                    getTeamFromCatalog={getTeamFromCatalog}
                    getTeamName={getTeamName}
                    reportStatus={reportStatus}
                    setReportStatus={setReportStatus}
                    reportScoreA={reportScoreA}
                    setReportScoreA={setReportScoreA}
                    reportScoreB={reportScoreB}
                    setReportScoreB={setReportScoreB}
                    reportStatsForm={reportStatsForm}
                    setReportStatsForm={setReportStatsForm}
                    handleSaveReport={handleSaveReport}
                    reportFileRef={reportFileRef}
                    handleReportFile={handleReportFile}
                    reportImageBusy={reportImageBusy}
                    reportImageUrl={reportImageUrl}
                    setReportImageUrl={setReportImageUrl}
                    reportOcrBusy={reportOcrBusy}
                    reportOcrText={reportOcrText}
                    setReportOcrText={setReportOcrText}
                />
            )}



            {tab === 'referees' && (
                <RefereesTabLazy
                    state={state}
                    refTables={refTables}
                    setRefTables={setRefTables}
                    getTeamName={getTeamName}
                    updateLiveRefereesPassword={updateLiveRefereesPassword}
                />
            )}


            {tab === 'codes' && (
                <CodesTabLazy
                    state={state}
                    codesStatusFilter={codesStatusFilter}
                    setCodesStatusFilter={setCodesStatusFilter}
                    printCodes={printCodes}
                    toggleMatchStatus={toggleMatchStatus}
                    openReportFromCodes={openReportFromCodes}
                />
            )}


            

            {tab === 'monitor_groups' && (
                <MonitorGroupsTabLazy
                    state={state}
                    getTeamName={getTeamName}
                    toggleMatchStatus={toggleMatchStatus}
                    openReportFromCodes={openReportFromCodes}
                    handleUpdateTournamentAndMatches={handleUpdateTournamentAndMatches}
                    openTournamentEditor={openTournamentEditor}
                />
            )}

            {tab === 'monitor_bracket' && <MonitorBracketTabLazy {...monitorBracketTabProps} />}
            </React.Suspense>
{aliasModalOpen && (
    <AliasModal
        title={aliasModalTitle}
        conflicts={aliasModalConflicts}
        setConflicts={setAliasModalConflicts}
        onClose={closeAliasModal}
        onConfirm={confirmAliasModal}
        t={t}
    />
)}

{mvpModalOpen && (
    <MvpModal
        forArchive={mvpModalForArchive}
        allPlayers={allPlayers}
        search={mvpSearch}
        setSearch={setMvpSearch}
        selectedIds={mvpSelectedIds}
        setSelectedIds={setMvpSelectedIds}
        searchPlaceholder={t('search')}
        t={t}
        onClose={() => { setMvpModalOpen(false); setMvpModalForArchive(false); setArchiveIncludeU25Awards(true); }}
        onArchiveWithoutMvp={() => {
            // Archivia anche senza MVP (premi automatici = campioni + classifica marcatori).
            const next = archiveTournamentV2(state, { includeU25Awards: archiveIncludeU25Awards });
            setState(next);
            setMvpModalOpen(false);
            setMvpModalForArchive(false);
        }}
        onSave={() => {
            if (!state.tournament) {
                setMvpModalOpen(false);
                setMvpModalForArchive(false);
                return;
            }
            if (mvpModalForArchive) {
                let next = applyMvpsToState(state, mvpSelectedIds);
                next = archiveTournamentV2(next, { includeU25Awards: archiveIncludeU25Awards });
                setState(next);
                setMvpModalOpen(false);
                setMvpModalForArchive(false);
                alert(t('alert_tournament_ended'));
            } else {
                const next = applyMvpsToState(state, mvpSelectedIds);
                setState(next);
                setMvpModalOpen(false);
                setMvpModalForArchive(false);
                alert(t('alert_mvp_set'));
            }
        }}
        saveLabel={mvpModalForArchive ? t('save_mvp_and_archive') : t('admin_set')}
        assignU25Awards={archiveIncludeU25Awards}
        setAssignU25Awards={mvpModalForArchive ? setArchiveIncludeU25Awards : undefined}
    />
)}


	        </div>
	        </AdminRenderRecoveryBoundary>
    );
};
