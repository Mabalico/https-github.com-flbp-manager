import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { Home } from './components/Home';
import { PublicBrandStack } from './components/PublicBrandStack';
import { coerceAppState, type AppState } from './services/storageService';
import { getAppStateRepository } from './services/repository/getRepository';
import { getRemoteBaseUpdatedAt, getSupabaseAccessToken, getSupabaseConfig, setRemoteBaseUpdatedAt } from './services/supabaseSession';
import { setDevRequestPerfContext } from './services/devRequestPerf';
import { acknowledgePlayerAppCall, clearPlayerSupabaseSession, ensureFreshPlayerSupabaseSession, getPlayerSupabaseSession, hasPlayerSupabaseAuthPayloadInUrl, pullPlayerAppCalls, pullWorkspaceState, playerSignOutSupabase, signOutSupabase, clearSupabaseSession } from './services/supabaseRest';
import { PLAYER_APP_CHANGE_EVENT, mapSupabaseCallRowToPlayerCallRequest, readPlayerPresenceSnapshot, readPlayerPreviewSession, type PlayerCallRequest, type PlayerPresenceSnapshot, clearPlayerPresenceSnapshot, signOutPlayerPreviewSession } from './services/playerAppService';
import { TV_PROJECTIONS, TvProjection, TournamentData } from './types';
import { DEFAULT_LANGUAGE, getTranslationValue, loadTranslationDictionary, translations, Language, LANGUAGES, type TranslationDictionary } from './services/i18nService';
import { isAdminWriteOnlyDbIssue, readDbSyncDiagnostics } from './services/dbDiagnostics';
import { isAutoStructuredSyncEnabled, isLocalOnlyMode } from './services/repository/featureFlags';
import { hasRemoteDraftCache } from './services/repository/remoteDraftCache';
import { readVitePublicDbRead } from './services/viteEnv';
import {
    writeCachedPublicWorkspaceState
} from './services/publicDataCache';
import { BadgeCheck, BellRing, Menu, X, Settings, Home as HomeIcon, BarChart3, Trophy, Swords, Gavel, ChevronDown, TriangleAlert, UserRound, LogOut } from 'lucide-react';

type UiErrorBoundaryProps = {
    title: string;
    onReset?: () => void;
    children: React.ReactNode;
};

type UiErrorBoundaryState = { hasError: boolean; errorMsg: string };

class UiErrorBoundary extends React.Component<UiErrorBoundaryProps, UiErrorBoundaryState> {
    declare props: Readonly<UiErrorBoundaryProps>;
    declare setState: (
        state:
            | UiErrorBoundaryState
            | Partial<UiErrorBoundaryState>
            | ((
                  prevState: Readonly<UiErrorBoundaryState>,
                  props: Readonly<UiErrorBoundaryProps>
              ) => UiErrorBoundaryState | Partial<UiErrorBoundaryState> | null)
            | null,
        callback?: () => void
    ) => void;

    state: UiErrorBoundaryState = { hasError: false, errorMsg: '' };

    static getDerivedStateFromError(err: any) {
        return { hasError: true, errorMsg: String(err?.message || err || 'Errore sconosciuto') };
    }

    componentDidCatch(err: any) {
        // eslint-disable-next-line no-console
        console.error('[UI ErrorBoundary]', err);

        const msg = String(err?.message || err || '');
        if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
            window.location.reload();
        }
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-2xl">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                        <TriangleAlert className="w-5 h-5 text-amber-700" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <div className="font-black text-slate-900 text-lg">{this.props.title}</div>
                        <div className="text-sm text-slate-600 font-semibold mt-1">
                            Si è verificato un errore di rendering. Non dovresti vedere una schermata bianca.
                        </div>
                        <div className="mt-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 overflow-auto">
                            {this.state.errorMsg}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {this.props.onReset ? (
                                <button
                                    type="button"
                                    onClick={() => this.props.onReset?.()}
                                    className="px-4 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50"
                                >
                                    Torna alla Home
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 rounded-xl font-black border border-blue-700 bg-blue-700 text-white hover:bg-blue-800"
                            >
                                Ricarica pagina
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

// Lazy-loaded: public secondary views stay out of the initial bundle.
const loadLeaderboardModule = () => import('./components/Leaderboard');
const loadHallOfFameModule = () => import('./components/HallOfFame');
const loadPublicTournamentsModule = () => import('./components/PublicTournaments');
const loadPublicTournamentDetailModule = () => import('./components/PublicTournamentDetail');
const loadRefereesAreaModule = () => import('./components/RefereesArea');
const loadPlayerAreaModule = () => import('./components/PlayerArea');
const loadHelpGuideModule = () => import('./components/HelpGuide');
const loadFantaBeerpongModule = () => import('./components/FantaBeerpong');

const loadSupabasePublicModule = () => import('./services/supabasePublic');
const loadAutoDbSyncModule = () => import('./services/autoDbSync');


const getSupabasePublicOps = async () => {
    const module = await loadSupabasePublicModule();
    return {
        pullPublicWorkspaceState: module.pullPublicWorkspaceState,
        trackPublicSiteView: module.trackPublicSiteView
    };
};

const LeaderboardLazy = React.lazy(() =>
    loadLeaderboardModule().then((m) => ({ default: m.Leaderboard }))
);

const HallOfFameLazy = React.lazy(() =>
    loadHallOfFameModule().then((m) => ({ default: m.HallOfFame }))
);

const PublicTournamentsLazy = React.lazy(() =>
    loadPublicTournamentsModule().then((m) => ({ default: m.PublicTournaments }))
);

const PublicTournamentDetailLazy = React.lazy(() =>
    loadPublicTournamentDetailModule().then((m) => ({ default: m.PublicTournamentDetail }))
);

const RefereesAreaLazy = React.lazy(() =>
    loadRefereesAreaModule().then((m) => ({ default: m.RefereesArea }))
);

const PlayerAreaLazy = React.lazy(() =>
    loadPlayerAreaModule().then((m) => ({ default: m.PlayerArea }))
);

const HelpGuideLazy = React.lazy(() =>
    loadHelpGuideModule().then((m) => ({ default: m.HelpGuide }))
);

const FantaBeerpongLazy = React.lazy(() =>
    loadFantaBeerpongModule().then((m) => ({ default: m.FantaBeerpong }))
);

// Lazy-loaded: keeps initial bundle light (Admin pulls in heavy deps like xlsx)
const loadAdminDashboardModule = () => import('./components/AdminDashboard');
const AdminDashboardLazy = React.lazy(() =>
    loadAdminDashboardModule().then((m) => ({ default: m.AdminDashboard }))
);

// Lazy-loaded: TV mode is used occasionally and pulls in multiple TV components
const loadTvViewModule = () => import('./components/TvView');
const TvViewLazy = React.lazy(() =>
    loadTvViewModule().then((m) => ({ default: m.TvView }))
);

const RouteViewFallback: React.FC = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 250);
        return () => window.clearTimeout(timer);
    }, []);

    if (!visible) {
        return <div className="p-6 min-h-[96px]" aria-hidden />;
    }

    return (
        <div className="p-6" aria-live="polite" aria-busy="true">
            <div className="max-w-3xl rounded-3xl border border-slate-200 bg-white/95 shadow-sm p-5 md:p-6">
                <div className="animate-pulse space-y-3">
                    <div className="h-4 w-28 rounded-full bg-slate-200" />
                    <div className="h-8 w-56 rounded-2xl bg-slate-200" />
                    <div className="h-4 w-full max-w-xl rounded-full bg-slate-100" />
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="h-24 rounded-2xl bg-slate-100" />
                        <div className="h-24 rounded-2xl bg-slate-100" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);
export const TranslationDictionariesContext = createContext<Partial<Record<Language, TranslationDictionary>>>(translations);

export const useTranslation = () => {
    const lang = useContext(LanguageContext);
    const dictionaries = useContext(TranslationDictionariesContext);
    const t = useCallback((key: string) => getTranslationValue(dictionaries, lang, key), [dictionaries, lang]);
    return {
        t,
        lang
    };
};

const GLOBAL_PLAYER_CALL_DISMISSED_KEY = 'flbp_global_player_call_dismissed_v1';

const readDismissedGlobalPlayerCallId = () => {
    try {
        return sessionStorage.getItem(GLOBAL_PLAYER_CALL_DISMISSED_KEY) || '';
    } catch {
        return '';
    }
};

const writeDismissedGlobalPlayerCallId = (callId: string) => {
    try {
        sessionStorage.setItem(GLOBAL_PLAYER_CALL_DISMISSED_KEY, callId);
    } catch {
        // ignore
    }
};

const GlobalPlayerCallNotice: React.FC<{
    playerPresence: PlayerPresenceSnapshot | null;
    onOpenPlayerArea: () => void;
}> = ({ playerPresence, onOpenPlayerArea }) => {
    const { t } = useTranslation();
    const [activeCall, setActiveCall] = useState<PlayerCallRequest | null>(null);
    const [dismissedCallId, setDismissedCallId] = useState(() => readDismissedGlobalPlayerCallId());
    const [ackBusy, setAckBusy] = useState(false);

    useEffect(() => {
        if (playerPresence?.mode !== 'live') {
            setActiveCall(null);
            return;
        }

        let cancelled = false;
        const refresh = async () => {
            try {
                const session = await ensureFreshPlayerSupabaseSession();
                if (!session?.accessToken) {
                    if (!cancelled) setActiveCall(null);
                    return;
                }
                const rows = await pullPlayerAppCalls();
                const nextCall = rows
                    .map(mapSupabaseCallRowToPlayerCallRequest)
                    .filter((call) => call.status === 'ringing' || call.status === 'acknowledged')
                    .sort((a, b) => b.requestedAt - a.requestedAt)[0] || null;
                if (!cancelled) setActiveCall(nextCall);
            } catch (error) {
                console.warn('FLBP global player call refresh failed', error);
                if (!cancelled) setActiveCall(null);
            }
        };

        const refreshNow = () => { void refresh(); };
        refreshNow();
        const intervalId = window.setInterval(refreshNow, 12000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refreshNow();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', refreshNow);
        window.addEventListener(PLAYER_APP_CHANGE_EVENT, refreshNow as EventListener);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', refreshNow);
            window.removeEventListener(PLAYER_APP_CHANGE_EVENT, refreshNow as EventListener);
        };
    }, [playerPresence?.accountId, playerPresence?.mode]);

    if (!activeCall || activeCall.id === dismissedCallId) return null;

    const dismiss = () => {
        writeDismissedGlobalPlayerCallId(activeCall.id);
        setDismissedCallId(activeCall.id);
    };

    const openPlayerArea = () => {
        dismiss();
        onOpenPlayerArea();
    };

    const acknowledge = async () => {
        if (!activeCall?.id || ackBusy) return;
        setAckBusy(true);
        try {
            await acknowledgePlayerAppCall(activeCall.id);
            setActiveCall({
                ...activeCall,
                status: 'acknowledged',
                acknowledgedAt: Date.now(),
            });
            window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
        } catch (error) {
            console.warn('FLBP global player call acknowledge failed', error);
        } finally {
            setAckBusy(false);
        }
    };

    const teamName = activeCall.teamName || 'la tua squadra';
    const alreadyAcknowledged = activeCall.status === 'acknowledged';
    const callBody = t('global_player_call_body').replace('{team}', teamName);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="global-player-call-title">
            <div className="w-full max-w-lg overflow-hidden rounded-[30px] border border-amber-200/40 bg-white shadow-2xl shadow-slate-950/30">
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 px-6 py-6 text-white">
                    <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-400/20 blur-2xl" aria-hidden />
                    <div className="relative flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/50 bg-amber-400/20 text-amber-200">
                            <BellRing className="h-7 w-7" />
                        </div>
                        <div className="min-w-0">
                            <div id="global-player-call-title" className="text-2xl font-black tracking-tight">{t('global_player_call_title')}</div>
                            <p className="mt-2 text-sm font-semibold leading-6 text-white/80">
                                {callBody}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="space-y-4 px-6 py-5">
                    {alreadyAcknowledged ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            <BadgeCheck className="h-4 w-4" />
                            {t('global_player_call_confirmed')}
                        </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={acknowledge}
                            disabled={ackBusy || alreadyAcknowledged}
                            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 shadow-sm transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <BadgeCheck className="h-4 w-4" />
                            {ackBusy ? t('global_player_call_confirming') : alreadyAcknowledged ? t('global_player_call_confirmed_button') : t('global_player_call_confirm')}
                        </button>
                        <button
                            type="button"
                            onClick={openPlayerArea}
                            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
                        >
                            {t('global_player_call_open_area')}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={dismiss}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-100"
                    >
                        {t('global_player_call_close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const assertTvProjectionSafe = (val: string | null | undefined): TvProjection => {
    if (!val) return 'scorers';
    return TV_PROJECTIONS.includes(val as TvProjection) ? (val as TvProjection) : 'scorers';
};

const coerceLoadedAppState = async (raw: unknown): Promise<AppState> => coerceAppState(raw);

const App: React.FC = () => {
    const repo = React.useMemo(() => getAppStateRepository(), []);
    const readPlayerPresenceState = useCallback((): PlayerPresenceSnapshot | null => {
        const cached = readPlayerPresenceSnapshot();
        if (cached?.accountId) return cached;

        const liveSession = getPlayerSupabaseSession();
        if (liveSession?.userId || liveSession?.email) {
            const email = String(liveSession.email || '').trim();
            const fallbackName = email.split('@')[0]?.trim() || 'Profilo';
            return {
                accountId: String(liveSession.userId || email || 'player-live'),
                mode: 'live',
                email,
                firstName: fallbackName,
                displayName: fallbackName,
                lastActiveAt: Date.now(),
            };
        }

        const previewSession = readPlayerPreviewSession();
        if (previewSession?.accountId) {
            const email = String(previewSession.username || '').trim();
            const fallbackName = email.split('@')[0]?.trim() || 'Profilo';
            return {
                accountId: previewSession.accountId,
                mode: 'preview',
                email,
                firstName: fallbackName,
                displayName: fallbackName,
                lastActiveAt: previewSession.lastActiveAt || Date.now(),
            };
        }

        return null;
    }, []);

    const [state, setState] = useState<AppState>(() => repo.load());
    const remoteAppliedRef = useRef(false);
    const remoteBootstrapRanRef = useRef(false);
    const remoteBootstrapActiveRef = useRef(false);
    const skipNextPersistRef = useRef(false);
    const lastRemoteUpdatedAtRef = useRef<string | null>(null);
    const [remoteBootstrapStatus, setRemoteBootstrapStatus] = useState<'idle' | 'booting' | 'ready'>('idle');
    const [publicDbState, setPublicDbState] = useState<AppState | null>(null);
    const [publicDbUpdatedAt, setPublicDbUpdatedAt] = useState<string | null>(null);
    const VIEW_KEY = 'flbp_view';
    const POST_RELOAD_VIEW_KEY = 'flbp_post_reload_view';
    const LANG_KEY = 'flbp_lang';
    const SELECTED_TOURNAMENT_KEY = 'flbp_selected_tournament';
    const PUBLIC_DB_READ_LS_KEY = 'flbp_public_db_read';
    const SITE_VISIT_SESSION_KEY = 'flbp_site_visit_tracked_v1';
    const SITE_VISIT_DAY_KEY = 'flbp_site_visit_tracked_day_v1';
    const SITE_VISIT_PENDING_KEY = 'flbp_site_visit_pending_v1';

    const safeView = (v: string | null | undefined) => {
        if (!v) return 'home';
        if (['home', 'leaderboard', 'hof', 'tournament', 'tournament_detail', 'player_area', 'admin', 'referees_area', 'fantabeerpong'].includes(v)) return v;
        return 'home';
    };

    const safeLanguage = (v: string | null | undefined) => {
        if (!v) return 'it' as Language;
        const found = LANGUAGES.find(l => l.code === v);
        return (found ? found.code : 'it') as Language;
    };

    const todayVisitKey = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [view, setView] = useState(() => {
        if (hasPlayerSupabaseAuthPayloadInUrl()) return 'player_area';
        try {
            const postReloadView = sessionStorage.getItem(POST_RELOAD_VIEW_KEY);
            if (postReloadView) return safeView(postReloadView);
        } catch {
            // ignore
        }
        return 'home';
    });
    const [tvMode, setTvMode] = useState<TvProjection | null>(() => {
        const stored = localStorage.getItem('flbp_tv_mode');
        return stored ? assertTvProjectionSafe(stored) : null;
    });
    const [language, setLanguage] = useState<Language>(() => safeLanguage(localStorage.getItem(LANG_KEY)));
    const [translationDictionaries, setTranslationDictionaries] = useState<Partial<Record<Language, TranslationDictionary>>>(() => translations);
    const [selectedTournament, setSelectedTournament] = useState<{ data: TournamentData, isLive: boolean } | null>(null);
    const [helpGuideReady, setHelpGuideReady] = useState(false);
    const [playerPresence, setPlayerPresence] = useState<PlayerPresenceSnapshot | null>(() => readPlayerPresenceState());

    const routeNavigationRequestRef = useRef(0);

    useEffect(() => {
        const handler = () => setPlayerPresence(readPlayerPresenceState());
        window.addEventListener('storage', handler);
        window.addEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
        return () => {
            window.removeEventListener('storage', handler);
            window.removeEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
        };
    }, [readPlayerPresenceState]);

    const preloadViewChunk = useCallback((nextViewRaw: string) => {
        const nextView = safeView(nextViewRaw);
        switch (nextView) {
            case 'leaderboard':
                return loadLeaderboardModule();
            case 'hof':
                return loadHallOfFameModule();
            case 'tournament':
                return loadPublicTournamentsModule();
            case 'tournament_detail':
                return loadPublicTournamentDetailModule();
            case 'referees_area':
                return loadRefereesAreaModule();
            case 'player_area':
                return loadPlayerAreaModule();
            case 'fantabeerpong':
                return loadFantaBeerpongModule();
            case 'admin':
                return loadAdminDashboardModule();
            default:
                return Promise.resolve(null);
        }
    }, []);

    const navigateToView = useCallback(async (nextViewRaw: string, options?: { closeMenu?: boolean }) => {
        const nextView = safeView(nextViewRaw);
        if (options?.closeMenu) {
            setMenuOpen(false);
        }
        if (nextView === view) return;

        const requestId = ++routeNavigationRequestRef.current;
        try {
            await preloadViewChunk(nextView);
        } catch {
            // If preload fails, keep default route rendering fallback behavior.
        }
        if (routeNavigationRequestRef.current != requestId) return;
        setView(nextView);
    }, [preloadViewChunk, view]);

    const primeViewChunk = useCallback((nextViewRaw: string) => {
        void preloadViewChunk(nextViewRaw).catch(() => {
            // Warmup is best effort only.
        });
    }, [preloadViewChunk]);

    useEffect(() => {
        setDevRequestPerfContext({ view, tvMode });
    }, [view, tvMode]);

    useEffect(() => {
        if (view !== 'admin') return;
        if (repo.source !== 'remote') return;
        void repo.refresh?.();
    }, [view, repo]);

    useEffect(() => {
        if (tvMode) {
            setHelpGuideReady(false);
            return;
        }

        let cancelled = false;
        let idleId: number | null = null;
        let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

        const activate = () => {
            if (cancelled) return;
            setHelpGuideReady(true);
            void loadHelpGuideModule().catch(() => {
                // Best effort only.
            });
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleWindow = window as Window & {
                requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback: (handle: number) => void;
            };
            idleId = idleWindow.requestIdleCallback(() => activate(), { timeout: 1500 });
        } else {
            timeoutId = globalThis.setTimeout(() => activate(), 900);
        }

        return () => {
            cancelled = true;
            if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
                (window as Window & { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(idleId);
            }
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId);
            }
        };
    }, [tvMode]);

    useEffect(() => {
        if (tvMode) return;

        let cancelled = false;
        let idleId: number | null = null;
        let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
        let secondaryTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

        const preloadPrimaryRouteChunks = () => {
            if (cancelled) return;
            void loadPublicTournamentsModule();
            void loadLeaderboardModule();
        };

        const preloadSecondaryRouteChunks = () => {
            if (cancelled) return;
            void loadHallOfFameModule();
            void loadPublicTournamentDetailModule();
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleWindow = window as Window & {
                requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback: (handle: number) => void;
            };
            idleId = idleWindow.requestIdleCallback(() => {
                preloadPrimaryRouteChunks();
                secondaryTimeoutId = globalThis.setTimeout(preloadSecondaryRouteChunks, import.meta.env.DEV ? 1800 : 900);
            }, { timeout: import.meta.env.DEV ? 2000 : 1200 });
        } else {
            timeoutId = globalThis.setTimeout(() => {
                preloadPrimaryRouteChunks();
                secondaryTimeoutId = globalThis.setTimeout(preloadSecondaryRouteChunks, import.meta.env.DEV ? 1800 : 900);
            }, import.meta.env.DEV ? 900 : 180);
        }

        return () => {
            cancelled = true;
            if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
                (window as Window & { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(idleId);
            }
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId);
            }
            if (secondaryTimeoutId !== null) {
                globalThis.clearTimeout(secondaryTimeoutId);
            }
        };
    }, [tvMode]);

    // Header UI helpers
    const langMenuRef = useRef<HTMLDetailsElement | null>(null);
    const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
    const primeLanguageDictionary = useCallback((code: Language) => {
        if (translationDictionaries[code]) return;
        void loadTranslationDictionary(code)
            .then((dictionary) => {
                setTranslationDictionaries((prev) => (prev[code] ? prev : { ...prev, [code]: dictionary }));
            })
            .catch(() => {
                // Warmup is best effort only.
            });
    }, [translationDictionaries]);

    const setLanguageAndClose = (code: Language) => {
        primeLanguageDictionary(code);
        setLanguage(code);
        try {
            if (langMenuRef.current) langMenuRef.current.open = false;
        } catch {
            // ignore
        }
    };

    // Optional: read-only public/TV DB snapshot (sanitized) for multi-device displays.
    // Default OFF to avoid any behavior change.
    const publicDbReadEnabled = () => {
        if (isLocalOnlyMode()) return false;
        // If DB is the primary repository, public reads should be enabled by default
        // to keep multi-device public/TV views coherent.
        if (repo.source === 'remote') return true;
        try {
            const v = String(readVitePublicDbRead() ?? '').trim().toLowerCase();
            if (v === '1' || v === 'true' || v === 'yes') return true;
        } catch {
            // ignore
        }
        try {
            return (localStorage.getItem(PUBLIC_DB_READ_LS_KEY) || '').trim() === '1';
        } catch {
            return false;
        }
    };

    const stateForPublicViews = React.useMemo<AppState>(() => {
        if (!publicDbState) return state;

        const remoteBaseUpdatedAt = getRemoteBaseUpdatedAt();
        const publicDbTs = Date.parse(String(publicDbUpdatedAt || ''));
        const remoteBaseTs = Date.parse(String(remoteBaseUpdatedAt || ''));
        const publicSnapshotIsStale =
            Number.isFinite(remoteBaseTs)
            && (!Number.isFinite(publicDbTs) || remoteBaseTs > publicDbTs);

        if (publicSnapshotIsStale) {
            return state;
        }

        const publicHistory = Array.isArray(publicDbState.tournamentHistory) ? publicDbState.tournamentHistory : [];
        const localHistory = Array.isArray(state.tournamentHistory) ? state.tournamentHistory : [];
        const publicHall = Array.isArray(publicDbState.hallOfFame) ? publicDbState.hallOfFame : [];
        const localHall = Array.isArray(state.hallOfFame) ? state.hallOfFame : [];
        const publicScorers = Array.isArray(publicDbState.integrationsScorers) ? publicDbState.integrationsScorers : [];
        const localScorers = Array.isArray(state.integrationsScorers) ? state.integrationsScorers : [];
        const publicAliases = publicDbState.playerAliases && Object.keys(publicDbState.playerAliases).length
            ? publicDbState.playerAliases
            : state.playerAliases;

        return {
            ...state,
            ...publicDbState,
            tournament: publicDbState.tournament ?? state.tournament,
            tournamentMatches: (publicDbState.tournamentMatches && publicDbState.tournamentMatches.length)
                ? publicDbState.tournamentMatches
                : state.tournamentMatches,
            tournamentHistory: publicHistory.length ? publicHistory : localHistory,
            hallOfFame: publicHall.length ? publicHall : localHall,
            integrationsScorers: publicScorers.length ? publicScorers : localScorers,
            playerAliases: publicAliases || {},
            logo: publicDbState.logo || state.logo || '',
        };
    }, [publicDbState, publicDbUpdatedAt, state]);

    // Lightweight, informative banner for ops (non-blocking).
    const dbPrimaryActive = repo.source === 'remote';
    const dbDiag = (() => {
        try { return readDbSyncDiagnostics(); } catch { return {}; }
    })();
    const dbLastErrorMessage = String((dbDiag as any)?.lastErrorMessage || '').trim();
    const hasVisibleDbError = !!((dbDiag as any)?.lastErrorAt) && !(repo.source === 'remote' && !getSupabaseAccessToken() && isAdminWriteOnlyDbIssue(dbLastErrorMessage));
    const hasDbConflict = !!(dbDiag as any)?.lastConflictAt;
    const structuredAutoSyncOn = (() => {
        try { return isAutoStructuredSyncEnabled(); } catch { return false; }
    })();

    // ----------------------------
    // Remote DB-first bootstrap
    // ----------------------------
    // When RemoteRepository is enabled and Supabase is configured,
    // we perform a short, best-effort DB pull BEFORE rendering the interactive UI.
    // This avoids an admin working on stale local state when the DB is newer.
    //
    // Safety:
    // - Only runs when repo.source is 'remote'
    // - Skips TV mode (to keep TV ultra-stable)
    // - Has a short timeout and silently falls back to local
    useEffect(() => {
        if (remoteBootstrapRanRef.current) return;
        if (tvMode) return;
        if (repo.source !== 'remote') return;

        const cfg = getSupabaseConfig();
        if (!cfg) return;

        if (hasRemoteDraftCache()) {
            remoteBootstrapRanRef.current = true;
            remoteBootstrapActiveRef.current = false;
            setRemoteBootstrapStatus('ready');
            return;
        }

        remoteBootstrapRanRef.current = true;
        remoteBootstrapActiveRef.current = true;
        setRemoteBootstrapStatus('booting');

        let cancelled = false;
        let released = false;
        const timeoutMs = 1800;
        const releaseBootstrap = () => {
            if (released) return;
            released = true;
            remoteBootstrapActiveRef.current = false;
            if (!cancelled) setRemoteBootstrapStatus('ready');
        };
        const hardReleaseTimer = window.setTimeout(() => {
            releaseBootstrap();
        }, 2600);
        const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T | null> => {
            return await Promise.race([
                p,
                new Promise<null>((resolve) => {
                    window.setTimeout(() => resolve(null), ms);
                })
            ]);
        };

        (async () => {
            try {
                const row = await withTimeout(pullWorkspaceState(), timeoutMs);
                if (cancelled) return;
                if (!row?.state) return;

                // Apply DB snapshot as our initial state.
                const next = await coerceLoadedAppState(row.state);
                skipNextPersistRef.current = true;
                remoteAppliedRef.current = true;
                lastRemoteUpdatedAtRef.current = row.updated_at || null;
                setState(next);

                try {
                    if (row.updated_at) setRemoteBaseUpdatedAt(row.updated_at);
                } catch {
                    // ignore
                }
            } catch {
                // Silent fallback to local state
            }
        })().finally(() => {
            window.clearTimeout(hardReleaseTimer);
            releaseBootstrap();
        });

        return () => {
            cancelled = true;
            window.clearTimeout(hardReleaseTimer);
        };
    }, [repo, tvMode]);

    // If RemoteRepository is enabled and can pull a newer snapshot,
    // apply it to the live state too, not only to a cache for the next reload.
    // This keeps multiple devices aligned on the same online state.
    useEffect(() => {
        if (!repo.subscribe) return;
        const unsub = repo.subscribe((next, meta) => {
            const updatedAt = meta?.updatedAt || null;
            if (updatedAt && lastRemoteUpdatedAtRef.current === updatedAt) {
                return;
            }
            skipNextPersistRef.current = true;
            remoteAppliedRef.current = true;
            lastRemoteUpdatedAtRef.current = updatedAt;
            try {
                setRemoteBaseUpdatedAt(updatedAt);
            } catch {
                // ignore
            }
            try {
                localStorage.removeItem('flbp_remote_update_available');
            } catch {
                // ignore
            }
            setState(next);
        });
        return () => {
            try { unsub && unsub(); } catch {}
        };
    }, [repo]);

    useEffect(() => {
        if (!publicDbReadEnabled()) {
            setPublicDbState(null);
            setPublicDbUpdatedAt(null);
            return;
        }

        // If Supabase isn't configured we silently fall back to local state.
        if (!getSupabaseConfig()) return;

        // Public views always refresh once on enter; continuous polling stays only where it adds value.
        const shouldLoad = tvMode != null || view !== 'admin';
        if (!shouldLoad) return;

        let cancelled = false;
        const shouldPollNow = () => {
            try {
                return document.visibilityState === 'visible';
            } catch {
                return true;
            }
        };
        const hydratePublicRow = (row: Awaited<ReturnType<Awaited<ReturnType<typeof getSupabasePublicOps>>['pullPublicWorkspaceState']>>) => {
            if (!row?.state) return false;
            void coerceLoadedAppState(row.state).then((next) => {
                if (!cancelled) setPublicDbState(next);
            }).catch(() => {
                // silent fallback to local state
            });
            setPublicDbUpdatedAt(row.updated_at || null);
            return true;
        };

        const pullOnce = async () => {
            if (!shouldPollNow()) return;
            try {
                const row = await (await getSupabasePublicOps()).pullPublicWorkspaceState({ kind: 'polling', source: 'App.publicWorkspacePoll' });
                if (cancelled) return;
                if (!row?.state) return;
                writeCachedPublicWorkspaceState(row);
                hydratePublicRow(row);
            } catch {
                // silent fallback to local state
            }
        };

        void pullOnce();
        const onVisible = () => {
            if (!shouldPollNow()) return;
            void pullOnce();
        };
        document.addEventListener('visibilitychange', onVisible);

        const shouldKeepPolling = tvMode != null
            || view === 'tournament'
            || (view === 'tournament_detail' && !!selectedTournament?.isLive);

        if (!shouldKeepPolling) {
            return () => {
                cancelled = true;
                document.removeEventListener('visibilitychange', onVisible);
            };
        }

        const intervalMs = tvMode != null ? 5000 : (view === 'tournament_detail' ? 15000 : 60000);
        const id = window.setInterval(() => { void pullOnce(); }, intervalMs);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            window.clearInterval(id);
        };
    }, [tvMode, view, selectedTournament?.isLive]);

    useEffect(() => {
        if (translationDictionaries[language]) return;

        let cancelled = false;
        void loadTranslationDictionary(language)
            .then((dictionary) => {
                if (cancelled) return;
                setTranslationDictionaries((prev) => (prev[language] ? prev : { ...prev, [language]: dictionary }));
            })
            .catch(() => {
                // Fall back to the built-in IT/EN dictionaries without blocking the UI.
            });

        return () => {
            cancelled = true;
        };
    }, [language, translationDictionaries]);

    const t = useCallback((key: string) => getTranslationValue(translationDictionaries, language, key), [translationDictionaries, language]);
    const [menuOpen, setMenuOpen] = useState(false);

    // Debounced persistence: reduces localStorage writes on rapid state updates (mobile-friendly)
    const saveTimeoutRef = useRef<number | null>(null);
    const latestStateRef = useRef<AppState>(state);

    useEffect(() => {
        latestStateRef.current = state;
    }, [state]);

    useEffect(() => {
        // During the remote DB-first bootstrap we avoid persisting any intermediate local snapshot
        // that could accidentally overwrite a newer DB state.
        if (remoteBootstrapActiveRef.current) return;

        // When we just hydrated from DB, avoid immediately writing the same snapshot back.
        if (skipNextPersistRef.current) {
            skipNextPersistRef.current = false;
            return;
        }

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
            saveTimeoutRef.current = null;
            repo.save(latestStateRef.current);

            // Optional: keep DB normalised/public mirrors updated.
            // Default OFF; best-effort; never blocks UI.
            void loadAutoDbSyncModule().then(({ scheduleAutoStructuredSync }) => {
                scheduleAutoStructuredSync(latestStateRef.current);
            }).catch(() => {
                // ignore best-effort background sync loader errors
            });
        }, 200);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [state]);

    useEffect(() => {
        const flush = () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            repo.save(latestStateRef.current);

            // On lifecycle flush we attempt a best-effort immediate DB sync when enabled.
            // (Scheduling a debounced sync here risks being cancelled by pagehide/unload.)
            void loadAutoDbSyncModule().then(({ flushAutoStructuredSync }) => {
                return flushAutoStructuredSync(latestStateRef.current, { force: true });
            }).catch(() => {
                // ignore best-effort background sync loader errors
            });
        };

        // Ensure we don't lose the last updates on refresh/close (especially important on mobile)
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);

        const onVis = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            window.removeEventListener('beforeunload', flush);
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    useEffect(() => {
        const warnOnUnsyncedChanges = (e: BeforeUnloadEvent) => {
            if (!hasRemoteDraftCache()) return;
            e.preventDefault();
            e.returnValue = '';
        };

        window.addEventListener('beforeunload', warnOnUnsyncedChanges);
        return () => {
            window.removeEventListener('beforeunload', warnOnUnsyncedChanges);
        };
    }, []);

    useEffect(() => {
        try { localStorage.removeItem(VIEW_KEY); } catch {}
    }, []);

    useEffect(() => {
        try { sessionStorage.removeItem(POST_RELOAD_VIEW_KEY); } catch {}
    }, []);

    useEffect(() => {
        try { localStorage.setItem(LANG_KEY, language); } catch {}
    }, [language]);

    useEffect(() => {
        if (repo.source !== 'local') return;
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'beer_pong_app_state') {
                setState(repo.load());
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [repo]);

    useEffect(() => {
        const bestEffortDisableSWForTv = async () => {
            try {
                if (!('serviceWorker' in navigator)) return;
                // If offline, do not purge caches: TV requires network anyway, but we avoid
                // breaking an already-loaded offline session.
                if (navigator.onLine === false) return;
                // Ask the SW (if controlling) to clear its caches.
                try { navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' }); } catch {}
                // Unregister all SW registrations for this origin.
                try {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister().catch(() => false)));
                } catch {}
                // Clear caches from window context (same-origin only).
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

        if (tvMode) {
            localStorage.setItem('flbp_tv_mode', tvMode);
            // TV mode is sacred: keep it as "fresh" as possible.
            // Best-effort: unregister SW and clear caches to avoid stale builds.
            void bestEffortDisableSWForTv();
        } else {
            localStorage.removeItem('flbp_tv_mode');
        }
    }, [tvMode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
             if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

             if (!tvMode) return;

             // TV is read-only: keyboard-only navigation is allowed, but we keep the UI clean.
             // (Controls are documented in docs/manuale_utente.md)
             if (e.key === 'Escape') {
                 setTvMode(null);
                 return;
             }

             if (e.key === '1') setTvMode('groups');
             if (e.key === '2') setTvMode('groups_bracket');
             if (e.key === '3') setTvMode('bracket');
             if (e.key === '4') setTvMode('scorers');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tvMode]);
    const handleEnterTv = (mode: TvProjection) => {
        setTvMode(mode);
    };

    const handleViewTournament = (t: TournamentData, isLive: boolean) => {
        setSelectedTournament({ data: t, isLive });
        try {
            localStorage.setItem(SELECTED_TOURNAMENT_KEY, JSON.stringify({ id: t.id, isLive }));
        } catch {}
        void navigateToView('tournament_detail');
    };

    useEffect(() => {
        if (tvMode) return;
        if (!['home', 'leaderboard', 'hof', 'tournament', 'tournament_detail'].includes(view)) return;
        if (isLocalOnlyMode()) return;
        if (!getSupabaseConfig()) return;

        let cancelled = false;
        let idleId: number | null = null;
        let timeoutId: number | null = null;

        const schedule = (cb: () => void) => {
            if (typeof window === 'undefined') return;
            const anyWindow = window as Window & { requestIdleCallback?: (callback: () => void, opts?: { timeout?: number }) => number };
            if (typeof anyWindow.requestIdleCallback === 'function') {
                idleId = anyWindow.requestIdleCallback(() => {
                    idleId = null;
                    cb();
                }, { timeout: 1600 });
                return;
            }
            timeoutId = window.setTimeout(() => {
                timeoutId = null;
                cb();
            }, 900);
        };

        schedule(() => {
            if (cancelled) return;
            const today = todayVisitKey();
            const nowTs = Date.now();
            const pendingWindowMs = 15_000;

            try {
                if (window.sessionStorage.getItem(SITE_VISIT_SESSION_KEY) === '1') return;
            } catch {
                // If sessionStorage is blocked, continue with best effort localStorage checks.
            }

            try {
                if (window.localStorage.getItem(SITE_VISIT_DAY_KEY) === today) {
                    try { window.sessionStorage.setItem(SITE_VISIT_SESSION_KEY, '1'); } catch {}
                    return;
                }
                const pendingRaw = window.localStorage.getItem(SITE_VISIT_PENDING_KEY);
                const pendingTs = pendingRaw ? Number(pendingRaw) : 0;
                if (Number.isFinite(pendingTs) && pendingTs > 0 && (nowTs - pendingTs) < pendingWindowMs) {
                    return;
                }
                window.localStorage.setItem(SITE_VISIT_PENDING_KEY, String(nowTs));
            } catch {
                // localStorage may be unavailable; continue with best effort request.
            }

            try {
                window.sessionStorage.setItem(SITE_VISIT_SESSION_KEY, '1');
            } catch {
                // sessionStorage may be unavailable; keep best effort request active.
            }

            void getSupabasePublicOps().then(({ trackPublicSiteView }) => trackPublicSiteView(today))
                .then((result) => {
                    if (cancelled) return;
                    const trackedDay = String(result?.view_date || today || '').trim() || today;
                    try {
                        window.localStorage.setItem(SITE_VISIT_DAY_KEY, trackedDay);
                        window.localStorage.removeItem(SITE_VISIT_PENDING_KEY);
                    } catch {}
                })
                .catch(() => {
                    try {
                        window.sessionStorage.removeItem(SITE_VISIT_SESSION_KEY);
                        window.localStorage.removeItem(SITE_VISIT_PENDING_KEY);
                    } catch {}
                });
        });

        return () => {
            cancelled = true;
            if (idleId !== null) {
                const anyWindow = window as Window & { cancelIdleCallback?: (handle: number) => void };
                if (typeof anyWindow.cancelIdleCallback === 'function') {
                    anyWindow.cancelIdleCallback(idleId);
                }
            }
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
    }, [SITE_VISIT_DAY_KEY, SITE_VISIT_PENDING_KEY, SITE_VISIT_SESSION_KEY, tvMode, view]);

    useEffect(() => {
        if (view !== 'tournament_detail') return;
        if (selectedTournament) return;
        try {
            const raw = localStorage.getItem(SELECTED_TOURNAMENT_KEY);
            if (!raw) {
                try { localStorage.removeItem(SELECTED_TOURNAMENT_KEY); } catch {}
                setView('tournament');
                return;
            }
            const parsed = JSON.parse(raw);
            const isLive = !!parsed.isLive;
            const id = String(parsed.id || '').trim();
            const base = stateForPublicViews;

            const fromSnapshot = isLive ? base.tournament : (base.tournamentHistory || []).find(t => t.id === id);
            const data = fromSnapshot;
            if (data) setSelectedTournament({ data, isLive });
            else {
                try { localStorage.removeItem(SELECTED_TOURNAMENT_KEY); } catch {}
                setView('tournament');
            }
        } catch {
            try { localStorage.removeItem(SELECTED_TOURNAMENT_KEY); } catch {}
            setView('tournament');
        }
    }, [view, selectedTournament, stateForPublicViews]);

    if (tvMode) {
        return (
            <LanguageContext.Provider value={language}>
                <TranslationDictionariesContext.Provider value={translationDictionaries}>
                <React.Suspense
                    fallback={
                        <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
                            <div className="text-center">
                                <div className="text-2xl md:text-3xl font-black tracking-tight">{t('loading_tv')}</div>
                                <div className="text-sm md:text-base opacity-80 mt-2">{t('broadcast_mode')}</div>
                            </div>
                        </div>
                    }
                >
                    <UiErrorBoundary
                        title={t('tv_signal_title')}
                        onReset={() => setTvMode(null)}
                    >
                        <TvViewLazy 
                            state={stateForPublicViews} 
                            mode={tvMode} 
                            onExit={() => setTvMode(null)} 
                        />
                    </UiErrorBoundary>
                </React.Suspense>
                </TranslationDictionariesContext.Provider>
            </LanguageContext.Provider>
        );
    }

    const renderView = () => {
        switch(view) {
            case 'home':
                return <Home onNavigate={(nextView) => { void navigateToView(nextView); }} tournamentActive={!!stateForPublicViews.tournament} />;
            case 'leaderboard':
                return (
                    <React.Suspense fallback={<RouteViewFallback /> }>
                        <LeaderboardLazy stateOverride={stateForPublicViews} />
                    </React.Suspense>
                );
            case 'hof':
                return (
                    <React.Suspense fallback={<RouteViewFallback /> }>
                        <HallOfFameLazy stateOverride={stateForPublicViews} />
                    </React.Suspense>
                );
            case 'tournament':
                {
                    const liveTournament = stateForPublicViews.tournament || null;
                    const history = stateForPublicViews.tournamentHistory || [];
                    return (
                        <React.Suspense fallback={<RouteViewFallback /> }>
                            <PublicTournamentsLazy
                                liveTournament={liveTournament}
                                history={history}
                                liveMatches={stateForPublicViews.tournamentMatches || []}
                                liveTeams={(stateForPublicViews.tournament?.teams && stateForPublicViews.tournament.teams.length) ? stateForPublicViews.tournament.teams : (stateForPublicViews.teams || [])}
                                onViewTournament={handleViewTournament}
                            />
                        </React.Suspense>
                    );
                }
            case 'tournament_detail':
                if (!selectedTournament) return <RouteViewFallback />;
                {
                    const id = selectedTournament.data.id;
                    const snapshotTournament = selectedTournament.isLive
                        ? stateForPublicViews.tournament
                        : (stateForPublicViews.tournamentHistory || []).find(t => t.id === id);

                    const data = snapshotTournament || selectedTournament.data;

                    const snapshotMatches = snapshotTournament?.matches || (snapshotTournament?.rounds ? snapshotTournament.rounds.flat() : []);
                    const matches = (selectedTournament.isLive ? stateForPublicViews.tournamentMatches : (snapshotMatches || selectedTournament.data.matches || [])) || [];

                    const teams = (selectedTournament.isLive ? stateForPublicViews.teams : (snapshotTournament?.teams || selectedTournament.data.teams || [])) || [];

                    return (
                        <React.Suspense fallback={<RouteViewFallback /> }>
                            <PublicTournamentDetailLazy
                                initialData={data}
                                initialMatches={matches}
                                teams={teams}
                                isLive={selectedTournament.isLive}
                                onBack={() => { void navigateToView('tournament'); }}
                                logo={stateForPublicViews.logo}
                                hallOfFame={stateForPublicViews.hallOfFame}
                                playerAliases={stateForPublicViews.playerAliases}
                                publicState={stateForPublicViews}
                            />
                        </React.Suspense>
                    );
                }
            case 'admin':
                return (
                    <React.Suspense
                        fallback={<RouteViewFallback />}
                    >
                        <UiErrorBoundary
                            title={t('admin_ui_error_title')}
                            onReset={() => {
                                // Best-effort: clear admin session + last-view state to avoid crash loops
                                try { sessionStorage.removeItem('flbp_admin_section'); } catch {}
                                try { sessionStorage.removeItem('flbp_admin_last_live_tab'); } catch {}
                                try { sessionStorage.removeItem('flbp_admin_data_subtab'); } catch {}
                                try { sessionStorage.removeItem('flbp_admin_integrations_subtab'); } catch {}
                                try { sessionStorage.removeItem('flbp_monitor_bracket_zoom'); } catch {}
                                void navigateToView('home');
                            }}
                        >
                            <AdminDashboardLazy state={state} setState={setState} onEnterTv={handleEnterTv} />
                        </UiErrorBoundary>
                    </React.Suspense>
                );
            case 'referees_area': {
                const refereesState = state.tournament
                    ? state
                    : (publicDbState?.tournament ? publicDbState : state);
                return (
                    <React.Suspense fallback={<RouteViewFallback /> }>
                        <RefereesAreaLazy
                            state={refereesState}
                            setState={setState}
                            onBack={() => { void navigateToView('home'); }}
                        />
                    </React.Suspense>
                );
            }
            case 'fantabeerpong':
                return (
                    <React.Suspense fallback={<RouteViewFallback /> }>
                        <FantaBeerpongLazy onBack={() => { void navigateToView('player_area'); }} />
                    </React.Suspense>
                );
            case 'player_area':
                return (
                    <React.Suspense fallback={<RouteViewFallback /> }>
                        <UiErrorBoundary
                            title={t('player_area')}
                            onReset={() => {
                                try { localStorage.removeItem(VIEW_KEY); } catch {}
                                try { localStorage.removeItem('flbp_player_preview_accounts_v1'); } catch {}
                                try { localStorage.removeItem('flbp_player_preview_session_v1'); } catch {}
                                try { localStorage.removeItem('flbp_player_preview_profiles_v1'); } catch {}
                                try { localStorage.removeItem('flbp_player_preview_calls_v1'); } catch {}
                                clearPlayerSupabaseSession();
                                void navigateToView('home');
                            }}
                        >
                            <PlayerAreaLazy
                                state={state}
                                onOpenReferees={() => { void navigateToView('referees_area'); }}
                                onOpenTournament={(tournamentId) => {
                                    const liveTournament = stateForPublicViews.tournament;
                                    if (liveTournament?.id === tournamentId) {
                                        handleViewTournament(liveTournament, true);
                                        return;
                                    }
                                    const archivedTournament = (stateForPublicViews.tournamentHistory || [])
                                        .find((tournament) => tournament.id === tournamentId);
                                    if (archivedTournament) {
                                        handleViewTournament(archivedTournament, false);
                                    }
                                }}
                            />
                        </UiErrorBoundary>
                    </React.Suspense>
                );
            default:
                return <Home onNavigate={(nextView) => { void navigateToView(nextView); }} tournamentActive={!!state.tournament} />;
        }
    };

        const isPublicView = ['home','leaderboard','hof','tournament','tournament_detail'].includes(view);
    const isToolsView = view === 'admin' || view === 'referees_area' || view === 'player_area';

    const hasDbIssue = !!((dbDiag as any)?.lastConflictAt || hasVisibleDbError);
    const dbIssueTitle = (dbDiag as any)?.lastConflictAt
        ? t('db_conflict_detected')
        : (hasVisibleDbError ? t('db_issue') : t('open_data_management'));

    const openDbPersistence = () => {
        try { window.sessionStorage.setItem('flbp_admin_section', 'data'); } catch {}
        try { window.sessionStorage.setItem('flbp_admin_data_main_section', 'persistence'); } catch {}
        void navigateToView('admin');
        try {
            window.dispatchEvent(new CustomEvent('flbp:open-data-persistence'));
        } catch {
            // ignore
        }
    };

    const openDataViews = () => {
        try { window.sessionStorage.setItem('flbp_admin_section', 'data'); } catch {}
        try { window.sessionStorage.setItem('flbp_admin_data_main_section', 'views'); } catch {}
        void navigateToView('admin');
        try {
            window.dispatchEvent(new CustomEvent('flbp:open-data-views'));
        } catch {
            // ignore
        }
    };

    const menuItemClass = (active: boolean) => {
        return `w-full text-left px-4 py-3 rounded-xl font-black transition flex items-center gap-3 border focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50 ${active
            ? 'bg-beer-100/60 text-slate-900 border-beer-300'
            : 'text-slate-800 border-transparent hover:bg-slate-50'}`;
    };

    const publicNavItemClass = (active: boolean) => {
        return `inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-black transition border focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 ${active
            ? 'bg-white/10 text-white border-white/20'
            : 'text-white/80 border-transparent hover:bg-white/5 hover:text-white'}`;
    };
    const mobileBottomNavItemClass = (_active: boolean) =>
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-black uppercase tracking-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60';
    const mobileBottomNavIconClass = (active: boolean) =>
        `flex h-7 w-7 items-center justify-center rounded-xl transition ${
            active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500'
        }`;
    const mobileBottomNavLabelClass = (active: boolean) =>
        active ? 'text-slate-950' : 'text-slate-500';

    const handleGlobalSignOut = async () => {
        if (!playerPresence) return;
        if (!window.confirm(t('logout_confirm') || 'Sei sicuro di voler uscire?')) return;

        clearPlayerPresenceSnapshot();
        if (playerPresence.mode === 'live') {
            const playerSignOutTask = playerSignOutSupabase().catch(() => {});
            const adminSignOutTask = signOutSupabase().catch(() => {});
            await Promise.allSettled([playerSignOutTask, adminSignOutTask]);
            window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
            return;
        }
        signOutPlayerPreviewSession();
        try { sessionStorage.removeItem('flbp_admin_legacy_auth'); } catch {}
        clearSupabaseSession();
        window.dispatchEvent(new CustomEvent(PLAYER_APP_CHANGE_EVENT));
    };



    const showMobileBottomNav = ['home', 'leaderboard', 'hof', 'tournament', 'tournament_detail', 'player_area'].includes(view);

    return (
        <LanguageContext.Provider value={language}>
            <TranslationDictionariesContext.Provider value={translationDictionaries}>
            <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
                <GlobalPlayerCallNotice
                    playerPresence={playerPresence}
                    onOpenPlayerArea={() => { void navigateToView('player_area'); }}
                />
                {/* Sidebar Menu */}
                <div className={`fixed inset-y-0 left-0 bg-white w-64 shadow-2xl z-40 transform transition-transform duration-300 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="p-6 flex justify-between items-start border-b border-slate-100">
                        <div className="min-w-0">
                            <PublicBrandStack tone="onLight" className="mb-2" />
                            <h2 className="font-black text-xl uppercase tracking-tighter text-slate-800">{t('menu')}</h2>
                        </div>
                        <button aria-label={t('close_menu')} onClick={() => setMenuOpen(false)} className="hover:bg-slate-100 p-2 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50"><X className="w-6 h-6"/></button>
                    </div>
                    <nav className="p-4 space-y-2">
                        <div className="px-2 pt-1 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{t('public_section')}</div>
                        <button
                            aria-current={view === 'home' ? 'page' : undefined}
                            onClick={() => { void navigateToView('home', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('home')}
                            onFocus={() => primeViewChunk('home')}
                            className={menuItemClass(view === 'home')}
                        >
                            <HomeIcon className="w-5 h-5 text-slate-500" />
                            <span>{t('dashboard')}</span>
                        </button>
                        <button
                            aria-current={view === 'leaderboard' ? 'page' : undefined}
                            onClick={() => { void navigateToView('leaderboard', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('leaderboard')}
                            onFocus={() => primeViewChunk('leaderboard')}
                            className={menuItemClass(view === 'leaderboard')}
                        >
                            <BarChart3 className="w-5 h-5 text-slate-500" />
                            <span>{t('historical')}</span>
                        </button>
                        <button
                            aria-current={view === 'hof' ? 'page' : undefined}
                            onClick={() => { void navigateToView('hof', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('hof')}
                            onFocus={() => primeViewChunk('hof')}
                            className={menuItemClass(view === 'hof')}
                        >
                            <Trophy className="w-5 h-5 text-slate-500" />
                            <span>{t('hof')}</span>
                        </button>
                        <button
                            aria-current={view === 'tournament' ? 'page' : undefined}
                            onClick={() => { void navigateToView('tournament', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('tournament')}
                            onFocus={() => primeViewChunk('tournament')}
                            className={menuItemClass(view === 'tournament')}
                        >
                            <Swords className="w-5 h-5 text-slate-500" />
                            <span>{t('tournaments')}</span>
                        </button>

                        <hr className="border-slate-100 my-3" />

                        <div className="px-2 pt-1 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{t('account_section')}</div>
                        <button
                            aria-current={view === 'player_area' ? 'page' : undefined}
                            onClick={() => { void navigateToView('player_area', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('player_area')}
                            onFocus={() => primeViewChunk('player_area')}
                            className={menuItemClass(view === 'player_area')}
                        >
                            <UserRound className="w-5 h-5 text-slate-500" />
                            <span>{t('player_area')}</span>
                        </button>

                        <hr className="border-slate-100 my-3" />

                        <div className="px-2 pt-1 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{t('tools_section')}</div>
                        <button
                            aria-current={view === 'referees_area' ? 'page' : undefined}
                            onClick={() => { void navigateToView('referees_area', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('referees_area')}
                            onFocus={() => primeViewChunk('referees_area')}
                            className={menuItemClass(view === 'referees_area')}
                        >
                            <Gavel className="w-5 h-5 text-slate-500" />
                            <span>{t('referees_area')}</span>
                        </button>
                        <button
                            aria-current={view === 'admin' ? 'page' : undefined}
                            onClick={() => { void navigateToView('admin', { closeMenu: true }); }}
                            onMouseEnter={() => primeViewChunk('admin')}
                            onFocus={() => primeViewChunk('admin')}
                            className={menuItemClass(view === 'admin')}
                        >
                            <Settings className="w-5 h-5 text-slate-500" />
                            <span>{t('admin')}</span>
                        </button>
                    </nav>
                </div>
                {/* Overlay for menu */}
                {menuOpen && <div className="fixed inset-0 bg-black/20 z-30 backdrop-blur-sm" onClick={() => setMenuOpen(false)}></div>}

                {/* Main Layout */}
                <div className="pb-24">
                    {/* Top Bar */}
                    <header className={isPublicView
                        ? "sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md text-white border-b border-white/10 shadow-sm"
                        : "sticky top-0 z-20 bg-slate-50/70 backdrop-blur-md border-b border-slate-200/60 shadow-sm"}>
                        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <button
                                    aria-label={t('open_menu')}
                                    onClick={() => setMenuOpen(true)}
                                    className={isPublicView
                                        ? "bg-white/10 p-3 rounded-xl border border-white/10 hover:bg-white/15 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60"
                                        : "bg-white p-3 rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50"}
                                >
                                    <Menu className={isPublicView ? "w-6 h-6 text-white" : "w-6 h-6 text-slate-700"} />
                                </button>

                                {isPublicView ? (
                                    <button
                                        onClick={() => { void navigateToView('home'); }}
                                        onMouseEnter={() => primeViewChunk('home')}
                                        onFocus={() => primeViewChunk('home')}
                                        className="flex items-center lg:items-start gap-2.5 min-w-0 hover:opacity-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 rounded-xl px-2 py-1"
                                        aria-label={t('go_home')}
                                    >
                                        <img
                                            src="/flbp_logo.svg"
                                            alt="FLBP"
                                            className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_10px_24px_rgba(2,6,23,0.24)]"
                                        />
                                        <div className="min-w-0 flex flex-col leading-none">
                                            <div className="font-black text-xl md:text-2xl uppercase tracking-tight text-beer-500 truncate">FLBP</div>
                                            <PublicBrandStack responsiveClassName="hidden lg:block" className="mt-1" />
                                        </div>
                                    </button>
                                ) : (
                                    <div className="hidden sm:flex items-center gap-2">
                                        <div className="font-black text-lg md:text-xl uppercase tracking-tight text-slate-800">
                                            FLBP
                                        </div>
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-slate-200 bg-white text-slate-700">
                                            {view === 'admin' ? t('admin') : view === 'referees_area' ? t('referees_area') : t('player_area')}
                                        </span>
                                    </div>
                                )}

                                {isPublicView && stateForPublicViews.tournament ? (
                                    <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border border-red-400/20 bg-red-500/15 text-red-100">
                                        {t('live_badge')}
                                    </span>
                                ) : null}
                            </div>

                            {isPublicView ? (
                                <nav className="hidden md:flex items-center gap-1" aria-label={t('public_nav')}>
                                    <button
                                        aria-current={view === 'home' ? 'page' : undefined}
                                        onClick={() => { void navigateToView('home'); }}
                                        onMouseEnter={() => primeViewChunk('home')}
                                        onFocus={() => primeViewChunk('home')}
                                        className={publicNavItemClass(view === 'home')}
                                    >
                                        <HomeIcon className="w-4 h-4" />
                                        <span>{t('dashboard')}</span>
                                    </button>
                                    <button
                                        aria-current={view === 'tournament' || view === 'tournament_detail' ? 'page' : undefined}
                                        onClick={() => { void navigateToView('tournament'); }}
                                        onMouseEnter={() => primeViewChunk('tournament')}
                                        onFocus={() => primeViewChunk('tournament')}
                                        className={publicNavItemClass(view === 'tournament' || view === 'tournament_detail')}
                                    >
                                        <Swords className="w-4 h-4" />
                                        <span>{t('tournaments')}</span>
                                    </button>
                                    <button
                                        aria-current={view === 'leaderboard' ? 'page' : undefined}
                                        onClick={() => { void navigateToView('leaderboard'); }}
                                        onMouseEnter={() => primeViewChunk('leaderboard')}
                                        onFocus={() => primeViewChunk('leaderboard')}
                                        className={publicNavItemClass(view === 'leaderboard')}
                                    >
                                        <BarChart3 className="w-4 h-4" />
                                        <span>{t('historical')}</span>
                                    </button>
                                    <button
                                        aria-current={view === 'hof' ? 'page' : undefined}
                                        onClick={() => { void navigateToView('hof'); }}
                                        onMouseEnter={() => primeViewChunk('hof')}
                                        onFocus={() => primeViewChunk('hof')}
                                        className={publicNavItemClass(view === 'hof')}
                                    >
                                        <Trophy className="w-4 h-4" />
                                        <span>{t('hof')}</span>
                                    </button>
                                </nav>
                            ) : null}

                            <div className="flex items-center gap-2">
                                {playerPresence ? (
                                    <div className={isPublicView
                                        ? "flex items-stretch rounded-xl border border-white/10 bg-white/10 text-white shadow-sm overflow-hidden"
                                        : "flex items-stretch rounded-[14px] border border-slate-200 bg-white text-slate-700 shadow-sm overflow-hidden"}>
                                        <button
                                            type="button"
                                            onClick={() => { void navigateToView('player_area'); }}
                                            onMouseEnter={() => primeViewChunk('player_area')}
                                            onFocus={() => primeViewChunk('player_area')}
                                            className={isPublicView
                                                ? "inline-flex items-center gap-2 px-3 py-2 text-sm font-black hover:bg-white/15 transition focus:outline-none focus:bg-white/15 border-r border-white/10"
                                                : "inline-flex items-center gap-2 px-3 py-2 text-sm font-black hover:bg-slate-50 transition focus:outline-none focus:bg-slate-50 border-r border-slate-200"}
                                            title={t('player_area')}
                                        >
                                            <UserRound className="w-4 h-4" aria-hidden />
                                            <span className="max-w-[28vw] truncate">{playerPresence.firstName || playerPresence.displayName || 'Account'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGlobalSignOut}
                                            title={t('logout') || 'Esci'}
                                            className={isPublicView
                                                ? "inline-flex items-center gap-2 px-3 py-2 text-sm font-black text-red-100 hover:bg-red-500/20 hover:text-white transition focus:outline-none focus:bg-red-500/20"
                                                : "inline-flex items-center gap-2 px-3 py-2 text-sm font-black text-red-600 hover:bg-red-50 hover:text-red-700 transition focus:outline-none focus:bg-red-50"}
                                        >
                                            <span className="hidden sm:inline">{t('logout') || 'Esci'}</span>
                                            <LogOut className="w-4 h-4 ml-1 sm:ml-0" aria-hidden />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { void navigateToView('player_area'); }}
                                        onMouseEnter={() => primeViewChunk('player_area')}
                                        onFocus={() => primeViewChunk('player_area')}
                                        className={isPublicView
                                            ? "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-black border border-white/10 bg-white/10 text-white hover:bg-white/15 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60"
                                            : "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50"}
                                        title={t('player_area')}
                                    >
                                        <UserRound className="w-4 h-4" aria-hidden />
                                        <span className="max-w-[42vw] truncate">{t('player_area_sign_in')}</span>
                                    </button>
                                )}

                                {isToolsView ? (
                                    <button
                                        type="button"
                                        onClick={() => { void navigateToView('home'); }}
                                        onMouseEnter={() => primeViewChunk('home')}
                                        onFocus={() => primeViewChunk('home')}
                                        title={t('back_to_public')}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50"
                                    >
                                        <HomeIcon className="w-4 h-4" aria-hidden />
                                        <span className="hidden sm:inline">{t('public_label')}</span>
                                    </button>
                                ) : null}

                                {view === 'admin' ? (
                                    <button
                                        type="button"
                                        onClick={openDataViews}
                                        title={t('open_views')}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-black border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50"
                                    >
                                        <BarChart3 className="w-4 h-4" aria-hidden />
                                        <span className="hidden sm:inline">{t('views')}</span>
                                    </button>
                                ) : null}

                                {isToolsView && hasDbIssue ? (
                                    <button
                                        type="button"
                                        onClick={openDbPersistence}
                                        title={dbIssueTitle}
                                        className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50"
                                    >
                                        <TriangleAlert className="w-5 h-5" aria-hidden />
                                    </button>
                                ) : null}
<details
                                    ref={langMenuRef}
                                    className={isPublicView
                                        ? "relative bg-white/10 px-3 py-2 rounded-xl border border-white/10"
                                        : "relative bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-200"}
                                >
                                    <summary
                                        className={isPublicView
                                            ? "list-none flex items-center gap-2 cursor-pointer select-none text-sm font-black text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 rounded-lg"
                                            : "list-none flex items-center gap-2 cursor-pointer select-none text-sm font-bold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/50 rounded-lg"}
                                    >
                                        <span
                                            className={isPublicView ? "text-base leading-none" : "text-base leading-none"}
                                            aria-hidden
                                            title={currentLang.label}
                                        >
                                            {currentLang.flag}
                                        </span>
                                        <span className={isPublicView ? "hidden lg:inline" : "hidden md:inline"}>{currentLang.label}</span>
                                        <ChevronDown className={isPublicView ? "w-4 h-4 text-white/70" : "w-4 h-4 text-slate-400"} aria-hidden />
                                    </summary>

                                    <div
                                        className={isPublicView
                                            ? "absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-950 text-white shadow-2xl overflow-hidden"
                                            : "absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl overflow-hidden"}
                                    >
                                        <div className={isPublicView ? "px-3 pt-3 pb-2 text-[11px] font-black uppercase tracking-wide text-white/70" : "px-3 pt-3 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-500"}>
                                            {t('language')}
                                        </div>
                                        <div className={isPublicView ? "p-1" : "p-1"}>
                                            {LANGUAGES.map(l => {
                                                const active = l.code === language;
                                                return (
                                                    <button
                                                        key={l.code}
                                                        type="button"
                                                        onClick={() => setLanguageAndClose(l.code as Language)}
                                                        onMouseEnter={() => primeLanguageDictionary(l.code as Language)}
                                                        onFocus={() => primeLanguageDictionary(l.code as Language)}
                                                        className={active
                                                            ? (isPublicView
                                                                ? "w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white/10 border border-white/10 font-black"
                                                                : "w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-black")
                                                            : (isPublicView
                                                                ? "w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 font-bold"
                                                                : "w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 font-bold")}
                                                    >
                                                        <span className="text-lg" aria-hidden>{l.flag}</span>
                                                        <span className="min-w-0 whitespace-normal break-words text-left leading-tight">{l.label}</span>
                                                        {active ? <span className={isPublicView ? "ml-auto text-[10px] font-black uppercase text-white/70" : "ml-auto text-[10px] font-black uppercase text-slate-500"}>ON</span> : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </div>
                    </header>

                    <div className="max-w-7xl mx-auto p-4 md:p-6">
                        {renderView()}

                        {/* Help Guide */}
                        {helpGuideReady ? (
                            <React.Suspense fallback={null}>
                                <HelpGuideLazy view={view} />
                            </React.Suspense>
                        ) : null}
                    </div>
                </div>
                {showMobileBottomNav ? (
                    <nav
                        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 shadow-[0_-18px_40px_-28px_rgba(15,23,42,0.8)] backdrop-blur md:hidden"
                        aria-label={t('public_nav')}
                    >
                        <div className="mx-auto flex max-w-lg items-center gap-1">
                            <button
                                type="button"
                                aria-current={view === 'home' ? 'page' : undefined}
                                onClick={() => { void navigateToView('home'); }}
                                onMouseEnter={() => primeViewChunk('home')}
                                onFocus={() => primeViewChunk('home')}
                                className={mobileBottomNavItemClass(view === 'home')}
                            >
                                <span className={mobileBottomNavIconClass(view === 'home')}><HomeIcon className="h-5 w-5" /></span>
                                <span className={`truncate ${mobileBottomNavLabelClass(view === 'home')}`}>{t('dashboard')}</span>
                            </button>
                            <button
                                type="button"
                                aria-current={view === 'tournament' || view === 'tournament_detail' ? 'page' : undefined}
                                onClick={() => { void navigateToView('tournament'); }}
                                onMouseEnter={() => primeViewChunk('tournament')}
                                onFocus={() => primeViewChunk('tournament')}
                                className={mobileBottomNavItemClass(view === 'tournament' || view === 'tournament_detail')}
                            >
                                <span className={mobileBottomNavIconClass(view === 'tournament' || view === 'tournament_detail')}><Swords className="h-5 w-5" /></span>
                                <span className={`truncate ${mobileBottomNavLabelClass(view === 'tournament' || view === 'tournament_detail')}`}>{t('tournaments')}</span>
                            </button>
                            <button
                                type="button"
                                aria-current={view === 'leaderboard' ? 'page' : undefined}
                                onClick={() => { void navigateToView('leaderboard'); }}
                                onMouseEnter={() => primeViewChunk('leaderboard')}
                                onFocus={() => primeViewChunk('leaderboard')}
                                className={mobileBottomNavItemClass(view === 'leaderboard')}
                            >
                                <span className={mobileBottomNavIconClass(view === 'leaderboard')}><BarChart3 className="h-5 w-5" /></span>
                                <span className={`truncate ${mobileBottomNavLabelClass(view === 'leaderboard')}`}>{t('historical')}</span>
                            </button>
                            <button
                                type="button"
                                aria-current={view === 'hof' ? 'page' : undefined}
                                onClick={() => { void navigateToView('hof'); }}
                                onMouseEnter={() => primeViewChunk('hof')}
                                onFocus={() => primeViewChunk('hof')}
                                className={mobileBottomNavItemClass(view === 'hof')}
                            >
                                <span className={mobileBottomNavIconClass(view === 'hof')}><Trophy className="h-5 w-5" /></span>
                                <span className={`truncate ${mobileBottomNavLabelClass(view === 'hof')}`}>{t('hof')}</span>
                            </button>
                            <button
                                type="button"
                                aria-current={view === 'player_area' ? 'page' : undefined}
                                onClick={() => { void navigateToView('player_area'); }}
                                onMouseEnter={() => primeViewChunk('player_area')}
                                onFocus={() => primeViewChunk('player_area')}
                                className={mobileBottomNavItemClass(view === 'player_area')}
                            >
                                <span className={mobileBottomNavIconClass(view === 'player_area')}><UserRound className="h-5 w-5" /></span>
                                <span className={`truncate ${mobileBottomNavLabelClass(view === 'player_area')}`}>{t('player_area')}</span>
                            </button>
                        </div>
                    </nav>
                ) : null}
            </div>
            </TranslationDictionariesContext.Provider>
        </LanguageContext.Provider>
    );
};

export default App;
