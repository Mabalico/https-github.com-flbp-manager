import React from 'react';
import { saveState, type AppState } from '../../../../services/storageService';
import {
    SUPABASE_ACCESS_TOKEN_LS_KEY,
    getSupabaseAccessToken,
    getSupabaseConfig,
    getSupabaseSession,
    getRemoteBaseUpdatedAt,
    setRemoteBaseUpdatedAt,
    pullWorkspaceState,
    pullNormalizedState,
    pushWorkspaceState,
    testSupabaseConnection,
    runDbHealthChecks,
    pushNormalizedFromState,
    seedSimPool,
    signInWithPassword,
    signOutSupabase,
    ensureFreshSupabaseSession,
    clearSupabaseSession,
    ensureSupabaseAdminAccess,
    getConfiguredAdminEmail
} from '../../../../services/supabaseRest';
import { readDbSyncDiagnostics, markDbSyncConflict, markDbSyncError, markDbSyncOk, markRemoteVersions, clearDbSyncHistory, clearDbSyncCurrentIssue, markDbHealth, isAdminWriteOnlyDbIssue } from '../../../../services/dbDiagnostics';
import {
    clearLocalAppStateCaches,
    getDataPersistenceMode,
    isRemotePersistenceLocked,
    isAutoStructuredSyncEnabled,
    LOCAL_STATE_UPDATED_AT_LS_KEY,
    setAutoStructuredSyncEnabled,
    setDataPersistenceMode
} from '../../../../services/repository/featureFlags';
import { clearRemoteDraftCache } from '../../../../services/repository/remoteDraftCache';
import { flushAutoStructuredSync } from '../../../../services/autoDbSync';
import { DbMigrationWizard } from './DbMigrationWizard';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../../../App';

type PanelState =
    | { kind: 'idle' }
    | { kind: 'working'; action: string }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; message: string };

export const DbSyncPanel: React.FC<{ state: AppState; setState: (s: AppState) => void; }> = ({ state, setState }) => {
    const { t } = useTranslation();
    const tx = React.useCallback((key: string, values?: Record<string, string | number | null | undefined>) => {
        let label = t(key);
        Object.entries(values || {}).forEach(([name, value]) => {
            label = label.replaceAll(`{${name}}`, String(value ?? ''));
        });
        return label;
    }, [t]);
    const cfg = getSupabaseConfig();
    const [panel, setPanel] = React.useState<PanelState>({ kind: 'idle' });
    const [downloaded, setDownloaded] = React.useState<{ updatedAt?: string; state?: AppState } | null>(null);
    const [downloadedStructured, setDownloadedStructured] = React.useState<{ updatedAt?: string | null; state?: AppState; summary?: any } | null>(null);
    const [token, setToken] = React.useState<string>(getSupabaseAccessToken() || '');
    const [authEmail, setAuthEmail] = React.useState<string>(getSupabaseSession()?.email || getConfiguredAdminEmail());
    const [authPassword, setAuthPassword] = React.useState<string>('');
    const [showAuthPassword, setShowAuthPassword] = React.useState<boolean>(false);
    const [forceOverwrite, setForceOverwrite] = React.useState<boolean>(false);
    const [autoStructured, setAutoStructured] = React.useState<boolean>(isAutoStructuredSyncEnabled());
    const [dataMode, setDataMode] = React.useState<'remote' | 'local_only'>(getDataPersistenceMode());
    const remotePersistenceLocked = React.useMemo(() => isRemotePersistenceLocked(), []);
    const [diagTick, setDiagTick] = React.useState<number>(0);
    const [health, setHealth] = React.useState<null | { ok: boolean; checks: Array<{ name: string; ok: boolean; severity: string; message: string }> }>(null);

    const session = React.useMemo(() => getSupabaseSession(), [token, diagTick]);
    const remoteBaseUpdatedAt = React.useMemo(() => getRemoteBaseUpdatedAt(), [diagTick, token]);

    const diag = React.useMemo(() => {
        // force refresh when we update tick
        void diagTick;
        return readDbSyncDiagnostics();
    }, [diagTick]);

    // Refresh diagnostics periodically (captures background sync via Repository).
    React.useEffect(() => {
        const t = window.setInterval(() => setDiagTick(v => v + 1), 2000);
        return () => window.clearInterval(t);
    }, []);

    const hasToken = !!token.trim();
    const hasAdminSession = !!session?.accessToken;
    const isDbPrimaryMode = dataMode === 'remote';
    const visibleLastErrorMessage = React.useMemo(() => {
        const raw = String(diag.lastErrorMessage || '').trim();
        if (!raw) return '';
        if (!session?.accessToken && isDbPrimaryMode && isAdminWriteOnlyDbIssue(raw)) return '';
        return raw;
    }, [diag.lastErrorMessage, session?.accessToken, isDbPrimaryMode]);

    // Best-effort refresh of auth session (keeps UX unchanged).
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const s = await ensureFreshSupabaseSession();
                if (!alive) return;
                if (s?.accessToken) {
                    setToken(s.accessToken);
                    if (s.email) setAuthEmail(s.email);
                }
            } catch {
                // ignore
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const saveToken = () => {
        try {
            const trimmedToken = token.trim();
            if (!trimmedToken) {
                localStorage.removeItem(SUPABASE_ACCESS_TOKEN_LS_KEY);
            } else {
                localStorage.setItem(SUPABASE_ACCESS_TOKEN_LS_KEY, trimmedToken);
            }
            setPanel({ kind: 'ok', message: trimmedToken ? t('db_token_saved') : t('db_token_removed') });
        } catch {
            setPanel({ kind: 'error', message: t('db_token_save_error') });
        }
    };

    const clearToken = () => {
        setToken('');
        try {
            localStorage.removeItem(SUPABASE_ACCESS_TOKEN_LS_KEY);
            // Also clear refresh/expiry/email keys if present.
            clearSupabaseSession();
        } catch {
            // ignore
        }
        window.setTimeout(() => window.location.reload(), 120);
    };

    const isBusy = panel.kind === 'working';

    const run = async (action: string, fn: () => Promise<void>) => {
        setPanel({ kind: 'working', action });
        try {
            await fn();
        } catch (e: any) {
            const msg = e?.message || String(e);
            if (e?.code === 'FLBP_DB_CONFLICT') {
                markDbSyncConflict(msg, { remoteUpdatedAt: e.remoteUpdatedAt, remoteBaseUpdatedAt: e.remoteBaseUpdatedAt });
            } else {
                markDbSyncError(msg);
            }
            setPanel({ kind: 'error', message: msg });
        }
    };

    const onAuthLogin = () => run(t('db_login_admin'), async () => {
        if (!cfg) throw new Error(t('db_supabase_not_configured'));
        const s = await signInWithPassword(authEmail, authPassword);
        const access = await ensureSupabaseAdminAccess();
        if (!access.ok) {
            await signOutSupabase();
            throw new Error(access.reason || t('db_account_not_admin'));
        }
        setToken(s.accessToken);
        setAuthPassword('');
        setPanel({ kind: 'ok', message: `${t('db_login_ok')}${access.email ? `: ${access.email}` : (s.email ? `: ${s.email}` : '')}.` });
    });

    const onAuthLogout = () => run(t('db_logout_admin'), async () => {
        await signOutSupabase();
        setToken('');
        setPanel({ kind: 'ok', message: t('db_logout_done') });
        window.setTimeout(() => window.location.reload(), 120);
    });

    const onTest = () => run(t('db_test_connection'), async () => {
        const r = await testSupabaseConnection();
        setPanel(r.ok ? { kind: 'ok', message: r.message } : { kind: 'error', message: r.message });
    });

    const onHealthCheck = () => run(t('db_verify'), async () => {
        const r = await runDbHealthChecks();
        setHealth(r);
        markDbHealth(!!r.ok, { checks: r.checks?.length ?? 0 });
        setDiagTick((x) => x + 1);
        if (r.ok) {
            setPanel({ kind: 'ok', message: t('db_verify_ok') });
        } else {
            setPanel({ kind: 'error', message: t('db_verify_warn') });
        }
    });

 

    const onUpload = () => run(t('db_upload_state'), async () => {
        await pushWorkspaceState(state, { force: forceOverwrite });
        markDbSyncOk('snapshot');
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_upload_done') });
    });

    const onDownload = () => run(t('db_download_state'), async () => {
        const row = await pullWorkspaceState();
        if (!row) {
            setDownloaded(null);
            setPanel({ kind: 'error', message: t('db_no_state_found') });
            return;
        }
        setDownloaded({ updatedAt: row.updated_at, state: row.state as AppState });
        markRemoteVersions({ remoteUpdatedAt: row.updated_at || null, remoteBaseUpdatedAt: getRemoteBaseUpdatedAt() });
        clearDbSyncCurrentIssue();
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_download_done') });
    });

    const onDownloadStructured = () => run(t('db_download_structured'), async () => {
        const r = await pullNormalizedState();
        setDownloadedStructured({ updatedAt: r.remoteUpdatedAt ?? null, state: r.state, summary: r.summary });
        markRemoteVersions({ remoteUpdatedAt: r.remoteUpdatedAt || null, remoteBaseUpdatedAt: getRemoteBaseUpdatedAt() });
        clearDbSyncCurrentIssue();
        setDiagTick((x) => x + 1);
        setPanel({
            kind: 'ok',
            message: tx('db_structured_download_done', {
                tournaments: r.summary.tournaments,
                teams: r.summary.teams,
                matches: r.summary.matches,
                stats: r.summary.matchStats,
            })
        });
    });

    const onApply = () => {
        if (!downloaded?.state) return;
        const ok = window.confirm(t('db_apply_download_confirm'));
        if (!ok) return;
        clearRemoteDraftCache();
        setState(downloaded.state);
        setRemoteBaseUpdatedAt(downloaded.updatedAt || null);
        markRemoteVersions({ remoteUpdatedAt: downloaded.updatedAt || null, remoteBaseUpdatedAt: downloaded.updatedAt || null });
        clearDbSyncCurrentIssue();
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_apply_download_done') });
    };

    const onApplyStructured = () => {
        if (!downloadedStructured?.state) return;
        const ok = window.confirm(t('db_apply_structured_confirm'));
        if (!ok) return;

        const merged: AppState = {
            ...state,
            ...downloadedStructured.state,
            // Preserve draft roster (pre-structure) to avoid data loss.
            teams: state.teams,
            matches: state.matches,
        };
        clearRemoteDraftCache();
        setState(merged);
        setRemoteBaseUpdatedAt(downloadedStructured.updatedAt || null);
        markRemoteVersions({ remoteUpdatedAt: downloadedStructured.updatedAt || null, remoteBaseUpdatedAt: downloadedStructured.updatedAt || null });
        clearDbSyncCurrentIssue();
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_apply_structured_done') });
    };

    const onExportNormalized = () => run(t('db_export_structured_action'), async () => {
        const ok = window.confirm(t('db_export_structured_confirm'));
        if (!ok) return;
        const summary = await pushNormalizedFromState(state, { force: forceOverwrite });
        markDbSyncOk('structured', summary);
        setDiagTick((x) => x + 1);
        setPanel({
            kind: 'ok',
            message: tx('db_export_structured_done', {
                tournaments: summary.tournaments,
                teams: summary.teams,
                matches: summary.matches,
                stats: summary.matchStats,
                hof: summary.hallOfFame,
                aliases: summary.aliases,
                scorers: summary.integrationsScorers,
                leaderboard: summary.publicCareerPlayers,
            })
        });
    });

    const onSeedSimPool = () => run(t('db_seed_pool_action'), async () => {
        const ok = window.confirm(t('db_seed_pool_confirm'));
        if (!ok) return;
        const summary = await seedSimPool(state);
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: tx('db_seed_pool_done', { teamNames: summary.teamNames, people: summary.people }) });
    });

    const onToggleAutoStructured = () => {
        const next = !autoStructured;
        setAutoStructured(next);
        setAutoStructuredSyncEnabled(next);
        setPanel({
            kind: 'ok',
            message: next
                ? t('db_auto_structured_enabled')
                : t('db_auto_structured_disabled')
        });
    };

    const onActivateDbPrimary = () => run(t('db_activate_online_action'), async () => {
        if (!cfg) throw new Error(t('db_supabase_not_configured'));
        const test = await testSupabaseConnection();
        if (!test.ok) throw new Error(test.message || t('db_connection_unavailable'));

        setDataPersistenceMode('remote');
        clearLocalAppStateCaches();
        setAutoStructuredSyncEnabled(true);
        setAutoStructured(true);
        setDataMode('remote');
        try {
            localStorage.setItem('flbp_public_db_read', '1');
        } catch {
            // ignore
        }
        clearDbSyncCurrentIssue();
        setPanel({ kind: 'ok', message: t('db_online_mode_enabled_reload') });
        window.setTimeout(() => window.location.reload(), 250);
    });

    const onActivateLocalOnly = () => {
        if (remotePersistenceLocked) {
            setPanel({ kind: 'error', message: t('db_local_only_locked') });
            return;
        }
        const ok = window.confirm(t('db_local_only_confirm'));
        if (!ok) return;

        saveState(state);
        try {
            localStorage.setItem(LOCAL_STATE_UPDATED_AT_LS_KEY, new Date().toISOString());
            localStorage.removeItem('flbp_public_db_read');
        } catch {
            // ignore
        }
        setAutoStructuredSyncEnabled(false);
        setAutoStructured(false);
        setDataPersistenceMode('local_only');
        setDataMode('local_only');
        clearDbSyncCurrentIssue();
        setPanel({ kind: 'ok', message: t('db_local_only_enabled_reload') });
        window.setTimeout(() => window.location.reload(), 250);
    };

    const onSyncNowStructured = () => run(t('db_sync_structured_action'), async () => {
        await flushAutoStructuredSync(state);
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_sync_structured_done') });
    });

    const statusBadge = () => {
        if (!cfg) return <span className="px-2 py-1 rounded-lg text-xs font-black bg-amber-100 text-amber-900 border border-amber-200">{t('db_status_not_configured')}</span>;
        return <span className="px-2 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-200">{t('db_status_configured')}</span>;
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-black">{t('db_persistence_title')}</div>
                    <div className="text-xs text-slate-600 mt-1">
                        {t('db_persistence_desc')}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {statusBadge()}
                    {cfg ? (
                        <span className="text-xs text-slate-600">{t('db_workspace_label')}: <span className="font-mono">{cfg.workspaceId}</span></span>
                    ) : null}
                </div>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-xs text-sky-900">
                <div className="font-black">{t('db_normal_use_title')}</div>
                <div className="mt-2 flex flex-wrap gap-2 font-black">
                    <span className="px-2 py-1 rounded-full border border-sky-200 bg-white text-sky-900">{t('db_mode_online')}</span>
                    <span className="px-2 py-1 rounded-full border border-sky-200 bg-white text-sky-900">{t('db_login_admin')}</span>
                    <span className="px-2 py-1 rounded-full border border-sky-200 bg-white text-sky-900">{t('db_auto_pull')}</span>
                    <span className="px-2 py-1 rounded-full border border-sky-200 bg-white text-sky-900">{t('db_auto_sync_online_step')}</span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-sky-800">
                    {t('db_manual_tools_setup_only')}
                </div>
            </div>

            {remotePersistenceLocked ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-900">
                    <div className="font-black">{t('db_public_deploy_locked')}</div>
                    <div className="mt-1 font-bold">
                        {t('db_public_deploy_locked_desc_prefix')} <span className="font-mono">VITE_REMOTE_REPO=1</span> {t('db_public_deploy_locked_desc_mid')} <span className="font-black">{t('db_online_title')}</span> {t('db_public_deploy_locked_desc_suffix')}
                    </div>
                </div>
            ) : null}

            <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="text-xs font-black">{t('db_data_mode_title')}</div>
                        <div className="text-xs text-slate-600 mt-1">
                            {t('db_data_mode_desc')}
                        </div>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-black border ${isDbPrimaryMode ? 'bg-emerald-100 text-emerald-900 border-emerald-200' : 'bg-amber-100 text-amber-900 border-amber-200'}`}>
                        {isDbPrimaryMode ? t('db_online_active') : t('db_local_only_title')}
                    </span>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                        type="button"
                        disabled={isBusy || !cfg}
                        onClick={onActivateDbPrimary}
                        className={`px-3 py-3 rounded-2xl border text-left transition ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : isDbPrimaryMode ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <div className="text-sm font-black">{t('db_online_title')}</div>
                        <div className="text-xs mt-1 opacity-80">{t('db_online_desc')}</div>
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || remotePersistenceLocked}
                        onClick={onActivateLocalOnly}
                        className={`px-3 py-3 rounded-2xl border text-left transition ${isBusy || remotePersistenceLocked ? 'bg-slate-100 text-slate-400 border-slate-200' : !isDbPrimaryMode ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <div className="text-sm font-black">{t('db_local_only_title')}</div>
                        <div className="text-xs mt-1 opacity-80">
                            {remotePersistenceLocked
                                ? t('db_local_only_desc_locked')
                                : t('db_local_only_desc')}
                        </div>
                    </button>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900">
                <div className="font-black">{t('db_safety_advice_title')}</div>
                <div className="mt-1 font-bold">
                    {t('db_safety_advice_desc')}
                </div>
            </div>

            {diag.lastConflictAt || diag.lastConflictMessage ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
                    <div className="font-black">{t('db_conflict_detected')}</div>
                    <div className="mt-2 space-y-1 font-semibold leading-6">
                        <div>
                            {t('db_conflict_last')}: <span className="font-mono">{diag.lastConflictAt || '—'}</span>
                        </div>
                        {diag.lastConflictMessage ? (
                            <div className="font-mono text-xs break-words">{diag.lastConflictMessage}</div>
                        ) : null}
                        <div>
                            {t('db_conflict_recommended_path_prefix')}: <span className="font-black">{t('db_conflict_recommended_path')}</span>.
                            {t('db_conflict_force_note_prefix')} <span className="font-black">{t('db_force_overwrite')}</span> {t('db_conflict_force_note_suffix')}
                        </div>
                        <div className="text-xs text-amber-800">
                            {t('db_conflict_note_accounts')}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <div className="text-xs font-black">{t('db_admin_session_title')}</div>
                                <div className="text-xs text-slate-600 mt-1">
                                    {t('db_admin_session_desc')}
                                </div>
                            </div>
                            <div className="text-xs">
                                {hasToken ? (
                                    <span className="px-2 py-1 rounded-lg font-black bg-emerald-100 text-emerald-900 border border-emerald-200">{t('db_session_available')}</span>
                                ) : (
                                    <span className="px-2 py-1 rounded-lg font-black bg-slate-100 text-slate-600 border border-slate-200">{t('db_no_session')}</span>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <div className="text-xs font-black">{t('db_login_admin_auth')}</div>
                                    <div className="text-xs text-slate-600 mt-1">
                                        {t('db_admin_login_desc_1')} <span className="font-mono">public.admin_users</span>.
                                        <span className="font-black"> {t('db_admin_login_desc_1_strong')}</span>
                                    </div>
                                    <div className="text-xs text-slate-600 mt-2">
                                        {t('db_admin_login_desc_2')} <span className="font-mono">flbp_is_admin()</span>.
                                    </div>
                                </div>
                                {session?.email ? (
                                    <div className="text-xs text-slate-700">
                                        <div className="font-black">{t('db_authenticated')}</div>
                                        <div className="font-mono">{session.email}</div>
                                        {session.expiresAt ? <div className="text-slate-600">{t('db_exp_label')}: <span className="font-mono">{session.expiresAt}</span></div> : null}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-600">{t('db_not_authenticated')}</div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                                <input
                                    value={authEmail}
                                    onChange={(e) => setAuthEmail(e.target.value)}
                                    placeholder={getConfiguredAdminEmail()}
                                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs"
                                />
                                <div className="relative">
                                    <input
                                        value={authPassword}
                                        onChange={(e) => setAuthPassword(e.target.value)}
                                        placeholder="Password"
                                        type={showAuthPassword ? 'text' : 'password'}
                                        className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAuthPassword((v) => !v)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 rounded-lg p-1"
                                        aria-label={showAuthPassword ? t('hide_password') : t('show_password')}
                                        title={showAuthPassword ? t('hide_password') : t('show_password')}
                                    >
                                        {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={isBusy || !cfg || !authEmail.trim() || !authPassword}
                                        onClick={onAuthLogin}
                                        className={`flex-1 px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !cfg || !authEmail.trim() || !authPassword ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'}`}
                                    >
                                        Login
                                    </button>
                                    <button
                                        disabled={isBusy || !session?.accessToken}
                                        onClick={onAuthLogout}
                                        className={`px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !session?.accessToken ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </div>

                        {remotePersistenceLocked ? (
                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-900">
                                {t('db_public_no_manual_jwt')}
                            </div>
                        ) : (
                            <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <summary className="cursor-pointer list-none text-xs font-black text-slate-700">
                                    Token manuale (avanzato)
                                </summary>
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                    <input
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        placeholder="JWT (Bearer token)"
                                        className="flex-1 min-w-[240px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                                    />
                                    <button
                                        disabled={isBusy || !cfg}
                                        onClick={saveToken}
                                        className={`px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'}`}
                                    >
                                        {t('db_save_token')}
                                    </button>
                                    <button
                                        disabled={isBusy || !hasToken}
                                        onClick={clearToken}
                                        className={`px-3 py-2 rounded-xl font-black border text-xs ${isBusy || !hasToken ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        {t('remove')}
                                    </button>
                                </div>
                                <div className="mt-2 text-[11px] font-bold text-slate-500">
                                    {t('db_manual_token_hint')}
                                </div>
                            </details>
                        )}
                    </div>

                    <details className="bg-white border border-slate-200 rounded-2xl p-3">
                        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <div className="text-xs font-black">{t('db_advanced_tools_title')}</div>
                                <div className="text-xs text-slate-600 mt-1">
                                    {t('db_advanced_tools_desc')}
                                </div>
                            </div>
                            <div className="text-xs text-slate-600">
                                {t('db_remote_base_local')}: <span className="font-mono">{remoteBaseUpdatedAt || '—'}</span>
                            </div>
                        </summary>
                        <div className="mt-3 space-y-3">
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                <div className="font-black">{t('db_force_overwrite')}</div>
                                <div className="mt-1">
                                    {t('db_force_overwrite_desc_prefix')} <span className="font-black">{t('db_snapshot_short')}</span> {t('db_force_overwrite_desc_suffix')}
                                </div>
                                <div className="mt-1 text-slate-500">
                                    {t('db_current_status')}: <span className="font-black">{forceOverwrite ? t('db_active') : t('db_inactive')}</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                                <div className="text-xs font-black">{t('db_migration_first_setup')}</div>
                                <div className="text-xs text-slate-600 mt-1">
                                    {t('db_migration_full_path')}
                                </div>
                                <div className="mt-3">
                                    <DbMigrationWizard state={state} forceOverwrite={forceOverwrite} />
                                </div>
                            </div>
                        </div>
                    </details>
                </div>

                <div className="space-y-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-3">
                        <div className="text-xs font-black">{t('db_snapshot_title')}</div>
                        <div className="text-xs text-slate-600 mt-1">
                            {t('db_snapshot_desc')}
                        </div>
                        <label className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                            <input
                                type="checkbox"
                                checked={forceOverwrite}
                                onChange={(e) => setForceOverwrite(e.target.checked)}
                                className="mt-0.5 accent-slate-900"
                            />
                            <span className="leading-5">
                                <span className="block font-black">{t('db_force_overwrite_db')}</span>
                                {t('db_force_overwrite_db_desc')}
                            </span>
                        </label>
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                            <button
                                disabled={isBusy || !cfg}
                                onClick={onTest}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                            >
                                {t('db_test_connection')}
                            </button>
                            <button
                                disabled={isBusy || !cfg}
                                onClick={onHealthCheck}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                title={t('db_verify_tooltip')}
                            >
                                {t('db_verify')}
                            </button>
                            <button
                                disabled={isBusy || !cfg || !hasAdminSession}
                                onClick={onUpload}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg || !hasAdminSession ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'}`}
                            >
                                {t('db_publish_state')}
                            </button>
                            <button
                                disabled={isBusy || !cfg}
                                onClick={onDownload}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                            >
                                {t('db_reload_from_db')}
                            </button>
                            <button
                                disabled={isBusy || !downloaded?.state}
                                onClick={onApply}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !downloaded?.state ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'}`}
                            >
                                {t('db_apply_this_download')}
                            </button>
                        </div>
                        {downloaded?.updatedAt ? (
                            <div className="text-xs text-slate-700 mt-3">
                                {t('db_db_updated_at')}: <span className="font-mono">{downloaded.updatedAt}</span>
                            </div>
                        ) : null}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-3">
                        <div className="text-xs font-black">{t('db_structured_recovery_title')}</div>
                        <div className="text-xs text-slate-600 mt-1">
                            {t('db_structured_recovery_desc')}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                            <button
                                disabled={isBusy || !cfg}
                                onClick={onDownloadStructured}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                title={t('db_download_structured_tooltip')}
                            >
                                {t('db_download_structured_recovery')}
                            </button>
                            <button
                                disabled={isBusy || !downloadedStructured?.state}
                                onClick={onApplyStructured}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !downloadedStructured?.state ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-900 text-white border-emerald-900 hover:bg-emerald-800'}`}
                                title={t('db_apply_recovery_tooltip')}
                            >
                                {t('db_apply_recovery_device')}
                            </button>
                            <button
                                disabled={isBusy || !cfg || !hasAdminSession}
                                onClick={onExportNormalized}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg || !hasAdminSession ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-violet-700 text-white border-violet-700 hover:bg-violet-800'}`}
                                title={t('db_export_structured_tooltip')}
                            >
                                {t('db_export_structured')}
                            </button>
                            <button
                                disabled={isBusy || !cfg || !hasAdminSession}
                                onClick={onSeedSimPool}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg || !hasAdminSession ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'}`}
                                title={t('db_seed_pool_tooltip')}
                            >
                                {t('db_seed_pool_json')}
                            </button>
                        </div>
                        {downloadedStructured?.summary ? (
                            <div className="text-xs text-slate-700 mt-3">
                                {t('db_structured_recovery_status')}: <span className="font-mono">{downloadedStructured.updatedAt || '—'}</span>
                                <span className="text-slate-500"> — </span>
                                <span className="text-slate-600">{tx('db_structured_recovery_summary', {
                                    tournaments: downloadedStructured.summary.tournaments,
                                    matches: downloadedStructured.summary.matches,
                                    stats: downloadedStructured.summary.matchStats,
                                })}</span>
                            </div>
                        ) : null}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-3">
                        <div className="text-xs font-black">{t('db_auto_structured_title')}</div>
                        <div className="text-xs text-slate-600 mt-1">
                            {t('db_auto_structured_desc')}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                            <button
                                disabled={isBusy || !cfg}
                                onClick={onToggleAutoStructured}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg ? 'bg-slate-100 text-slate-400 border-slate-200' : autoStructured ? 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                            >
                                {t('db_auto_sync_label')}: {autoStructured ? 'ON' : 'OFF'}
                            </button>
                            <button
                                disabled={isBusy || !cfg || !autoStructured || !hasAdminSession}
                                onClick={onSyncNowStructured}
                                className={`px-3 py-2 rounded-xl font-black border text-sm ${isBusy || !cfg || !autoStructured || !hasAdminSession ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-900 text-white border-emerald-900 hover:bg-emerald-800'}`}
                                title={t('db_sync_now_tooltip')}
                            >
                                {t('db_sync_now')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <details className="bg-white border border-slate-200 rounded-2xl p-3">
                <summary className="cursor-pointer list-none text-xs font-black text-slate-700">
                    {t('db_diagnostics_title')}
                </summary>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                    <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                        <div className="text-xs font-black">{t('db_sync_diagnostics')}</div>
                        <div className="mt-1 space-y-1">
                            <div>{t('db_last_snapshot_ok')}: <span className="font-mono">{diag.lastSnapshotOkAt || '—'}</span></div>
                            <div>{t('db_last_structured_ok')}: <span className="font-mono">{diag.lastStructuredOkAt || '—'}</span></div>
                            <div>{t('db_last_remote_updated_seen')}: <span className="font-mono">{diag.lastRemoteUpdatedAt || downloaded?.updatedAt || '—'}</span></div>
                            <div>{t('db_remote_base_local')}: <span className="font-mono">{remoteBaseUpdatedAt || diag.lastRemoteBaseUpdatedAt || '—'}</span></div>
                            {diag.lastStructuredSummary ? (
                                <div className="text-slate-600">{t('db_last_summary')}: <span className="font-mono">{JSON.stringify(diag.lastStructuredSummary)}</span></div>
                            ) : null}
                            {diag.lastConflictAt || diag.lastConflictMessage ? (
                                <div className="space-y-1">
                                    <div className="text-amber-800">{t('db_conflict_last')}: <span className="font-mono">{diag.lastConflictAt || ''}</span> {diag.lastConflictMessage ? `— ${diag.lastConflictMessage}` : ''}</div>
                                    <div className="text-amber-700">
                                        {t('db_pending_local_changes_note')}
                                    </div>
                                </div>
                            ) : null}
                            {visibleLastErrorMessage ? (
                                <div className="text-red-700">{t('db_last_error')}: <span className="font-mono">{diag.lastErrorAt || ''}</span> {visibleLastErrorMessage ? `— ${visibleLastErrorMessage}` : ''}</div>
                            ) : null}
                            {!visibleLastErrorMessage && diag.lastErrorMessage && !session?.accessToken && isDbPrimaryMode && isAdminWriteOnlyDbIssue(diag.lastErrorMessage) ? (
                                <div className="text-sky-700">
                                    {t('db_snapshot_jwt_note')}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-black">{t('db_sync_history')}</div>
                            <button
                                onClick={() => { clearDbSyncHistory(); setDiagTick((x) => x + 1); }}
                                className="px-3 py-1.5 rounded-xl font-black border text-xs bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            >
                                {t('db_clear')}
                            </button>
                        </div>
                        <div className="mt-2 space-y-1 max-h-48 overflow-auto">
                            {(diag.events || []).slice().reverse().slice(0, 25).map((e: any, idx: number) => {
                                const level = String(e.level || 'info');
                                const badge =
                                    level === 'error'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : level === 'conflict'
                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                            : level === 'warn'
                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                : level === 'ok'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200';
                                return (
                                    <div key={idx} className="flex items-start gap-2">
                                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge}`}>{String(e.kind || 'sync').toUpperCase()}</span>
                                        <div className="flex-1">
                                            <div className="text-[11px] font-mono text-slate-500">{String(e.at || '').slice(0, 19)}</div>
                                            <div className="text-xs break-words">{e.message}</div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge}`}>{level.toUpperCase()}</span>
                                    </div>
                                );
                            })}
                            {!(diag.events || []).length ? <div className="text-slate-500">{t('db_no_events')}</div> : null}
                        </div>
                    </div>
                </div>

                {health ? (
                    <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-3 mt-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="text-xs font-black">{t('db_verify')}</div>
                            <div className="text-xs">
                                {health.ok ? (
                                    <span className="px-2 py-1 rounded-lg font-black bg-emerald-100 text-emerald-900 border border-emerald-200">OK</span>
                                ) : (
                                    <span className="px-2 py-1 rounded-lg font-black bg-amber-100 text-amber-900 border border-amber-200">{t('warning')}</span>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 space-y-1">
                            {(health.checks || []).map((c: any, idx: number) => {
                                const sev = String(c.severity || 'info');
                                const badge =
                                    sev === 'error'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : sev === 'warn'
                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                            : 'bg-slate-50 text-slate-700 border-slate-200';
                                return (
                                    <div key={idx} className="flex items-start gap-2">
                                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black ${badge}`}>{sev.toUpperCase()}</span>
                                        <div className="flex-1">
                                            <div className="font-black">{c.name}</div>
                                            <div className="text-slate-600 break-words">{c.ok ? 'OK' : c.message}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </details>

            {panel.kind === 'working' ? (
                <div className="text-xs text-slate-700">{t('db_working_prefix')} {panel.action}…</div>
            ) : panel.kind === 'error' ? (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2">{panel.message}</div>
            ) : panel.kind === 'ok' ? (
                <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2">{panel.message}</div>
            ) : null}

            {!cfg ? (
                <div className="text-xs text-slate-600">
                    {t('db_env_config_hint_prefix')} <span className="font-mono">VITE_SUPABASE_URL</span> {t('and')} <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> {t('db_env_config_hint_suffix')} <span className="font-mono">.env.local</span> (<span className="font-mono">.env.example</span>).
                </div>
            ) : null}
        </div>
    );
};
