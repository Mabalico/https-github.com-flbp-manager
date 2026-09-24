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
    recoverWorkspaceFromLocalState,
    testSupabaseConnection,
    runDbHealthChecks,
    pushLiveTournamentIncremental,
    pushNormalizedFromState,
    seedSimPool,
    signInWithPassword,
    signOutSupabase,
    ensureFreshSupabaseSession,
    clearSupabaseSession,
    ensureSupabaseAdminAccess,
    getConfiguredAdminEmail,
    forceCloudDataPlaneFailover
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
import { clearRemoteDraftCache, discardRestorableRemoteDrafts, readCurrentRemoteDraftCache } from '../../../../services/repository/remoteDraftCache';
import { flushAutoStructuredSync } from '../../../../services/autoDbSync';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';
import { DbMigrationWizard } from './DbMigrationWizard';
import { Cloud, CloudUpload, Eye, EyeOff, HardDrive, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from '../../../../App';
import { DATA_PLANE_CHANGE_LS_KEY, resolveDataPlane, type DataPlaneRoute } from '../../../../services/dataPlaneClient';
import type { AdminCommitOptions } from '../../../../services/repository/AppStateRepository';
import { applyDraftIntegrationChanges, listDraftIntegrationChanges } from '../../../../services/draftIntegrationRecovery';

type PanelState =
    | { kind: 'idle' }
    | { kind: 'working'; action: string }
    | { kind: 'error'; message: string }
    | { kind: 'warning'; message: string }
    | { kind: 'ok'; message: string };

type RecoverySummary = {
    teams: number;
    matches: number;
    finished: number;
    tournament: string;
    titles: number;
    editions: number;
    scorers: number;
};

type RecoveryDataPlane = DataPlaneRoute & { mode: 'local' | 'cloud' };

type ForceRecoveryPreview = {
    dataPlane: RecoveryDataPlane;
    candidate: {
        state: AppState;
        savedAt: string;
        draftOperationId?: string | null;
    };
    remote: {
        state: AppState;
        updatedAt: string | null;
        version: number | null;
    };
    localSummary: RecoverySummary;
    remoteSummary: RecoverySummary;
};

const FORCE_RECOVERY_CONFIRMATION_TEXT = 'SOVRASCRIVI';

const databaseLabel = (route?: DataPlaneRoute | null) => route?.mode === 'local'
    ? 'database del PC server'
    : route?.mode === 'cloud' ? 'Supabase' : 'database principale';

const assertComparisonDataPlane = (expected: RecoveryDataPlane, actual: DataPlaneRoute) => {
    if (actual.mode !== expected.mode
        || actual.epoch !== expected.epoch
        || (expected.mode === 'local' && actual.baseUrl !== expected.baseUrl)) {
        throw new Error('Il database principale è cambiato dopo il confronto. Confronta di nuovo prima di scegliere: nessun dato è stato sostituito.');
    }
};

export const DbSyncPanel: React.FC<{
    state: AppState;
    setState: (s: AppState) => void;
    commitAdminStateDurably?: (state: AppState, source: string, options?: AdminCommitOptions) => Promise<AppState>;
}> = ({ state, setState, commitAdminStateDurably }) => {
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
    const [downloaded, setDownloaded] = React.useState<{
        updatedAt?: string;
        version?: number | null;
        state?: AppState;
        dataPlane: RecoveryDataPlane;
    } | null>(null);
    const [downloadedStructured, setDownloadedStructured] = React.useState<{ updatedAt?: string | null; state?: AppState; summary?: any } | null>(null);
    const [localRecoveryCandidate, setLocalRecoveryCandidate] = React.useState<{
        state: AppState;
        savedAt: string;
        draftOperationId?: string | null;
    } | null>(null);
    const [selectedRecoveryKeys, setSelectedRecoveryKeys] = React.useState<string[]>([]);
    const [token, setToken] = React.useState<string>(getSupabaseAccessToken() || '');
    const [authEmail, setAuthEmail] = React.useState<string>(getSupabaseSession()?.email || getConfiguredAdminEmail());
    const [authPassword, setAuthPassword] = React.useState<string>('');
    const [showAuthPassword, setShowAuthPassword] = React.useState<boolean>(false);
    const [forceRecoveryPreview, setForceRecoveryPreview] = React.useState<ForceRecoveryPreview | null>(null);
    const [forceRecoveryAccepted, setForceRecoveryAccepted] = React.useState<boolean>(false);
    const [forceRecoveryPhrase, setForceRecoveryPhrase] = React.useState<string>('');
    const [autoStructured, setAutoStructured] = React.useState<boolean>(isAutoStructuredSyncEnabled());
    const [dataMode, setDataMode] = React.useState<'remote' | 'local_only'>(getDataPersistenceMode());
    const remotePersistenceLocked = React.useMemo(() => isRemotePersistenceLocked(), []);
    const [diagTick, setDiagTick] = React.useState<number>(0);
    const [health, setHealth] = React.useState<null | { ok: boolean; checks: Array<{ name: string; ok: boolean; severity: string; message: string }> }>(null);
    const [dataPlane, setDataPlane] = React.useState<DataPlaneRoute | null>(null);
    const authEmailId = React.useId();
    const authPasswordId = React.useId();
    const forcePhraseId = React.useId();
    const isServerPcOrigin = React.useMemo(() => {
        try {
            return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        } catch {
            return false;
        }
    }, []);
    const healthHasWarnings = React.useMemo(() => {
        return !!health?.checks?.some((c) => !c.ok || String(c.severity || 'info') !== 'info');
    }, [health]);

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

    React.useEffect(() => {
        let alive = true;
        const refreshDataPlane = async (force = false) => {
            try {
                const route = await resolveDataPlane({ force });
                if (alive) setDataPlane(route);
            } catch {
                // The normal repository diagnostics report connectivity errors.
            }
        };
        void refreshDataPlane(true);
        const timer = window.setInterval(() => void refreshDataPlane(true), 10_000);
        return () => {
            alive = false;
            window.clearInterval(timer);
        };
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

    const onForceCloudFailover = () => {
        if (dataPlane?.mode !== 'recovery' || dataPlane.epoch == null) return;
        const confirmed = window.confirm(
            'FAILOVER DI EMERGENZA\n\nUsalo solo se il PC del torneo non è recuperabile. Supabase tornerà scrivibile dall’ultimo backup disponibile; le modifiche rimaste soltanto sul disco del PC potrebbero mancare. Continuare?'
        );
        if (!confirmed) return;
        void run('Failover di emergenza verso Supabase', async () => {
            const out = await forceCloudDataPlaneFailover(Number(dataPlane.epoch));
            try {
                localStorage.setItem('flbp_normalized_sync_required_v1', '1');
                localStorage.setItem(DATA_PLANE_CHANGE_LS_KEY, String(Date.now()));
            } catch {
                // This tab still refreshes its in-memory route below.
            }
            const nextRoute = await resolveDataPlane({ force: true });
            setDataPlane(nextRoute);
            setPanel({
                kind: 'ok',
                message: `Failover completato: Supabase è primario (epoch ${out.epoch}). Verifica l’ultimo backup prima di riprendere le modifiche.`,
            });
        });
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
        await pushWorkspaceState(state);
        markDbSyncOk('snapshot');
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_upload_done') });
    });

    const resolveRecoveryDataPlane = async (): Promise<RecoveryDataPlane> => {
        const route = await resolveDataPlane({ force: true });
        setDataPlane(route);
        if (route.mode === 'recovery') {
            throw new Error('Le scritture sono sospese. Risolvi prima la transizione dal pannello server.');
        }
        if (!hasAdminSession) throw new Error('Accedi come Admin prima di confrontare o recuperare le due versioni.');
        return route as RecoveryDataPlane;
    };

    const downloadCurrentDatabaseState = async () => {
        // Never leave an earlier comparison actionable while a fresh pull is
        // pending or has failed.
        setDownloaded(null);
        setSelectedRecoveryKeys([]);
        closeForceRecoveryPreview();
        const route = await resolveRecoveryDataPlane();
        const draft = await readCurrentRemoteDraftCache();
        setLocalRecoveryCandidate({
            state: structuredClone(draft?.state || state),
            savedAt: draft?.savedAt || new Date().toISOString(),
            draftOperationId: draft?.operationId || null,
        });
        const row = await pullWorkspaceState();
        if (!row) {
            setDownloaded(null);
            setPanel({ kind: 'error', message: t('db_no_state_found') });
            return;
        }
        assertComparisonDataPlane(route, await resolveRecoveryDataPlane());
        setDownloaded({
            updatedAt: row.updated_at,
            version: row.version ?? null,
            state: row.state as AppState,
            dataPlane: route,
        });
        markRemoteVersions({ remoteUpdatedAt: row.updated_at || null, remoteBaseUpdatedAt: getRemoteBaseUpdatedAt() });
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_download_done') });
    };

    const onDownload = () => run(t('db_download_state'), downloadCurrentDatabaseState);

    const onCompareWithDatabase = () => run('Confronto con il database principale', downloadCurrentDatabaseState);

    const onRecoverSelectedChanges = () => run('Recupero delle modifiche selezionate', async () => {
        const comparison = downloaded;
        const candidate = localRecoveryCandidate;
        if (!comparison?.state || !candidate || !commitAdminStateDurably) {
            throw new Error('Ripeti il confronto prima di recuperare le modifiche.');
        }
        assertComparisonDataPlane(comparison.dataPlane, await resolveRecoveryDataPlane());
        const next = applyDraftIntegrationChanges(candidate.state, comparison.state, selectedRecoveryKeys);
        const confirmed = await commitAdminStateDurably(next, 'recover-selected-integrations', {
            reviewedDraft: {
                baseState: comparison.state,
                baseUpdatedAt: comparison.updatedAt || null,
                baseVersion: comparison.version ?? null,
                expectedDraftState: candidate.state,
                expectedDraftOperationId: candidate.draftOperationId,
                dataPlane: comparison.dataPlane,
            },
        });
        setState(confirmed);
        setDownloaded(null);
        setLocalRecoveryCandidate(null);
        setSelectedRecoveryKeys([]);
        clearDbSyncCurrentIssue();
        setDiagTick(tick => tick + 1);
        setPanel({ kind: 'ok', message: 'Modifiche selezionate salvate nel database principale. Le altre informazioni sono rimaste come nel database.' });
    });

    const summarizeRecoveryState = (candidate: AppState): RecoverySummary => {
        const liveMatches = Array.isArray(candidate.tournamentMatches) ? candidate.tournamentMatches : [];
        const liveTeams = Array.isArray(candidate.tournament?.teams) ? candidate.tournament.teams : [];
        return {
            teams: liveTeams.length,
            matches: liveMatches.length,
            finished: liveMatches.filter((match) => match?.played || match?.status === 'finished').length,
            tournament: candidate.tournament?.name || 'nessun torneo live',
            titles: (candidate.hallOfFame || []).length,
            editions: (candidate.tournamentHistory || []).length,
            scorers: (candidate.integrationsScorers || []).length,
        };
    };

    const formatRecoveryDate = (value?: string | null) => {
        if (!value) return 'data non disponibile';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
    };

    const closeForceRecoveryPreview = React.useCallback(() => {
        setForceRecoveryPreview(null);
        setForceRecoveryAccepted(false);
        setForceRecoveryPhrase('');
    }, []);

    const onPrepareKeepLocalVersion = () => run('Confronto con il database principale', async () => {
        closeForceRecoveryPreview();
        setDownloaded(null);
        setSelectedRecoveryKeys([]);
        if (!cfg) throw new Error('Supabase non è configurato.');
        const route = await resolveRecoveryDataPlane();
        const draft = await readCurrentRemoteDraftCache();
        const candidate = draft?.state ? {
            state: structuredClone(draft.state),
            savedAt: draft.savedAt,
            draftOperationId: draft.operationId,
        } : {
            state: structuredClone(state),
            savedAt: new Date().toISOString(),
            draftOperationId: null,
        };
        const currentDb = await pullWorkspaceState();
        if (!currentDb?.state) throw new Error('Versione del DB non disponibile: il recupero locale resta bloccato.');
        assertComparisonDataPlane(route, await resolveRecoveryDataPlane());
        if (route.mode === 'local' && (!Number.isSafeInteger(currentDb.version) || Number(currentDb.version) < 1)) {
            throw new Error('Versione del database locale non verificabile: ripeti il confronto prima di recuperare la bozza.');
        }
        setDownloaded({
            updatedAt: currentDb.updated_at,
            version: currentDb.version ?? null,
            state: currentDb.state as AppState,
            dataPlane: route,
        });
        const localSummary = summarizeRecoveryState(candidate.state);
        const dbSummary = summarizeRecoveryState(currentDb.state as AppState);
        setLocalRecoveryCandidate(candidate);
        const localTournamentId = String(candidate.state.tournament?.id || '').trim();
        const remoteTournamentId = String((currentDb.state as AppState).tournament?.id || '').trim();
        if (localTournamentId !== remoteTournamentId) {
            throw new Error('I due snapshot appartengono a tornei live diversi. La sovrascrittura automatica è bloccata per non scollegare o cancellare squadre e rose Fanta: riconcilia prima il torneo dalla sezione avanzata.');
        }
        setForceRecoveryAccepted(false);
        setForceRecoveryPhrase('');
        setForceRecoveryPreview({
            dataPlane: route,
            candidate,
            remote: {
                state: currentDb.state as AppState,
                updatedAt: currentDb.updated_at || null,
                version: currentDb.version ?? null,
            },
            localSummary,
            remoteSummary: dbSummary,
        });
        setPanel({ kind: 'ok', message: 'Confronto pronto. Controlla i riepiloghi prima di confermare.' });
    });

    const onConfirmKeepLocalVersion = () => {
        const preview = forceRecoveryPreview;
        if (!preview || !forceRecoveryAccepted || forceRecoveryPhrase.trim().toUpperCase() !== FORCE_RECOVERY_CONFIRMATION_TEXT) return;
        if (String(preview.candidate.state.tournament?.id || '').trim() !== String(preview.remote.state.tournament?.id || '').trim()) {
            setPanel({ kind: 'error', message: 'Operazione bloccata: i due snapshot appartengono a tornei live diversi e richiedono una riconciliazione Fanta esplicita.' });
            return;
        }
        closeForceRecoveryPreview();
        void run(`Recupero della bozza: ${databaseLabel(preview.dataPlane)}`, async () => {
            assertComparisonDataPlane(preview.dataPlane, await resolveRecoveryDataPlane());
            const recovered = await recoverWorkspaceFromLocalState(preview.candidate.state, {
                expectedRemoteUpdatedAt: preview.remote.updatedAt,
                expectedRemoteVersion: preview.remote.version,
                requiredDataPlane: preview.dataPlane.mode,
            });
            const recoveredState = recovered.state as AppState;
            let normalizedSyncWarning = '';
            const recoveredTournamentId = String(recoveredState.tournament?.id || '').trim();
            const isLocalRecovery = preview.dataPlane.mode === 'local';
            const normalizedSyncMessage = isLocalRecovery
                ? 'Il server gestisce la sincronizzazione con Supabase.'
                : recoveredTournamentId
                ? 'Viste live e Fanta del torneo sono state riallineate.'
                : 'Non essendoci un torneo live nella copia locale, account e dati Fanta sono rimasti invariati.';

            // Acknowledge the canonical recovery before the slower projection
            // export. This prevents a later setState from replacing edits made
            // elsewhere in the Admin while normalized rows are being updated.
            window.dispatchEvent(new CustomEvent('flbp:live-state-committed', {
                detail: {
                    state: recoveredState,
                    skipRepositoryPersist: true,
                    skipStructuredSync: true,
                    committedUpdatedAt: recovered.updated_at || null,
                    committedVersion: recovered.version ?? null,
                    // Close only this window's conflicted draft. The server uses
                    // a fresh idempotency key for the recovery commit itself.
                    committedOperationId: preview.candidate.draftOperationId || recovered.operation_id || null,
                },
            }));
            setState(recoveredState);
            setRemoteBaseUpdatedAt(recovered.updated_at || null);
            markRemoteVersions({
                remoteUpdatedAt: recovered.updated_at || null,
                remoteBaseUpdatedAt: recovered.updated_at || null,
            });
            setLocalRecoveryCandidate(null);
            setDownloaded(null);

            try {
                // Fanta and the public tournament pages read normalized tables,
                // not only the workspace snapshot. Rebuild them before reporting
                // a fully green recovery. Use the incremental live projection:
                // unlike the full/manual export it never prunes another tournament
                // parent, so Fanta teams and rosters cannot cascade-delete when the
                // local and cloud tournament ids differ. Its preliminary snapshot
                // write still uses compare-and-swap.
                if (!isLocalRecovery && recoveredTournamentId) {
                    await pushLiveTournamentIncremental(recoveredState, {
                        force: false,
                        baseUpdatedAt: recovered.updated_at || null,
                        strictPublicMirror: true,
                    });
                }
                if (!isLocalRecovery) {
                    try { localStorage.removeItem('flbp_normalized_sync_required_v1'); } catch {}
                }
                try { window.dispatchEvent(new CustomEvent('flbp-fanta-change')); } catch {}
            } catch (error: any) {
                normalizedSyncWarning = error?.message || String(error);
                try { localStorage.setItem('flbp_normalized_sync_required_v1', '1'); } catch {}
            }
            markDbSyncOk('snapshot', {
                recovery: 'local',
                previousVersion: recovered.previous_version ?? null,
                version: recovered.version ?? null,
                preservedRefereeReports: recovered.preserved_referee_match_ids?.length || 0,
                normalizedProjection: isLocalRecovery ? 'server_managed' : normalizedSyncWarning ? 'pending' : (recoveredTournamentId ? 'synced' : 'not_applicable'),
            });
            setLocalRecoveryCandidate(null);
            setDownloaded(null);
            setDiagTick((x) => x + 1);
            if (normalizedSyncWarning) {
                markDbSyncError(`Snapshot salvato; riallineamento Fanta incompleto: ${normalizedSyncWarning}`);
                setPanel({
                    kind: 'warning',
                    message: 'La versione locale è stata salvata su Supabase, ma il riallineamento delle viste Fanta/live non è terminato. La richiesta resta segnalata: verifica la connessione, confronta di nuovo e ripeti l’operazione.',
                });
            } else {
                setPanel({
                    kind: 'ok',
                    message: `${isLocalRecovery ? 'Il database del PC server' : 'Supabase'} ora usa la bozza come nuova versione ${recovered.version ?? 'N/D'}. ${normalizedSyncMessage}` +
                        (recovered.preserved_referee_match_ids?.length
                            ? ` Conservati ${recovered.preserved_referee_match_ids.length} referti più recenti del DB.`
                            : ''),
                });
            }
        });
    };

    const onExportPendingDraft = async () => {
        const draft = await readCurrentRemoteDraftCache();
        if (!draft) {
            setPanel({ kind: 'error', message: 'Nessuna bozza locale da esportare in questa finestra.' });
            return;
        }
        const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.download = `flbp-bozza-${draft.workspaceId}-${draft.operationId}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(href);
        setPanel({ kind: 'ok', message: 'Bozza esportata. Il checkpoint originale resta conservato nel browser.' });
    };

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

    const onApply = () => run('Uso della versione del database su questo PC', async () => {
        const compared = downloaded;
        if (!compared?.state) return;
        const ok = window.confirm(t('db_apply_download_confirm'));
        if (!ok) { setPanel({ kind: 'idle' }); return; }
        assertComparisonDataPlane(compared.dataPlane, await resolveRecoveryDataPlane());
        const current = await pullWorkspaceState();
        if (!current?.state || (current.updated_at || null) !== (compared.updatedAt || null)
            || (current.version ?? null) !== (compared.version ?? null)) {
            setDownloaded(null);
            throw new Error('Il database è cambiato dopo il confronto. Confronta di nuovo prima di sostituire la bozza di questo PC.');
        }
        assertComparisonDataPlane(compared.dataPlane, await resolveRecoveryDataPlane());
        const currentDraft = await readCurrentRemoteDraftCache();
        const discardedOperationId = currentDraft?.operationId || localRecoveryCandidate?.draftOperationId || null;
        if (discardedOperationId) {
            // Await the IndexedDB tombstone before hydrating React. Otherwise a
            // fast app close can leave the checkpoint pending and resurrect it
            // at the next startup.
            const discarded = await discardRestorableRemoteDrafts(discardedOperationId);
            if (!discarded) {
                setPanel({
                    kind: 'error',
                    message: 'La bozza non è stata chiusa in modo durevole. Nessun dato è stato sostituito: riprova prima di chiudere l’app.',
                });
                return;
            }
        }
        clearRemoteDraftCache();
        // Applying an authoritative download is a hydration, not a new Admin
        // edit. Acknowledge its cursor before React updates the app state so
        // the normal persistence effect cannot recreate the discarded draft
        // or send a redundant full-workspace commit.
        window.dispatchEvent(new CustomEvent('flbp:live-state-committed', {
            detail: {
                state: compared.state,
                skipRepositoryPersist: true,
                skipStructuredSync: true,
                committedUpdatedAt: compared.updatedAt || null,
                committedVersion: compared.version ?? null,
                committedOperationId: discardedOperationId,
                discardPendingDraft: true,
            },
        }));
        setState(compared.state);
        setRemoteBaseUpdatedAt(compared.updatedAt || null);
        markRemoteVersions({ remoteUpdatedAt: compared.updatedAt || null, remoteBaseUpdatedAt: compared.updatedAt || null });
        clearDbSyncCurrentIssue();
        setLocalRecoveryCandidate(null);
        setDownloaded(null);
        setDiagTick((x) => x + 1);
        setPanel({ kind: 'ok', message: t('db_apply_download_done') });
    });

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
        const summary = await pushNormalizedFromState(state, { force: false });
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

        try {
            saveState(state);
        } catch (error) {
            setPanel({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
            return;
        }
        try {
            localStorage.setItem(LOCAL_STATE_UPDATED_AT_LS_KEY, new Date().toISOString());
            localStorage.removeItem('flbp_public_db_read');
        } catch {
            // ignore
        }
        setAutoStructuredSyncEnabled(false);
        setAutoStructured(false);
        setDataPersistenceMode('local_only');
        if (getDataPersistenceMode() !== 'local_only') {
            setPanel({ kind: 'error', message: 'Il browser non ha memorizzato la modalità locale. Mantieni aperta la pagina e scarica un backup.' });
            return;
        }
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

    const hasConflict = !!(diag.lastConflictAt || diag.lastConflictMessage);
    const isCloudDataPlane = dataPlane?.mode === 'cloud';
    const hasRecoveryDataPlane = isCloudDataPlane || dataPlane?.mode === 'local';
    const currentDatabaseLabel = databaseLabel(dataPlane);
    const comparedDatabaseLabel = databaseLabel(downloaded?.dataPlane || dataPlane);
    const keepDraftLabel = dataPlane?.mode === 'local'
        ? 'Recupera la bozza nel database del PC server'
        : 'Sovrascrivi Supabase con questa versione locale';
    const comparedLocalTournamentId = String((localRecoveryCandidate?.state || state).tournament?.id || '').trim();
    const comparedRemoteTournamentId = String(downloaded?.state?.tournament?.id || '').trim();
    const comparisonTournamentMismatch = !!downloaded?.state && comparedLocalTournamentId !== comparedRemoteTournamentId;
    const forceRecoveryDisabled = isBusy || !cfg || !hasAdminSession || !hasRecoveryDataPlane || comparisonTournamentMismatch;
    const forceRecoveryReason = !cfg
        ? 'Configura prima Supabase.'
        : !hasAdminSession
            ? 'Accedi come Admin per usare questa operazione.'
            : dataPlane?.mode === 'recovery'
                    ? 'Le scritture sono sospese: risolvi prima la transizione dal pannello server.'
                    : comparisonTournamentMismatch
                        ? 'I due snapshot appartengono a tornei live diversi: la sovrascrittura è bloccata per proteggere squadre e rose Fanta.'
                    : !dataPlane
                        ? 'Attendi la verifica del database principale.'
                        : '';
    const friendlyStatus = dataPlane?.mode === 'recovery'
        ? {
            title: 'Scritture sospese',
            description: 'La transizione tra PC locale e Supabase non è conclusa. Risolvila dal pannello server prima di modificare i dati.',
            badge: 'INTERVENTO RICHIESTO',
            classes: 'border-red-200 bg-red-50 text-red-950',
            badgeClasses: 'border-red-200 bg-white text-red-800',
            Icon: TriangleAlert,
        }
        : hasConflict
            ? {
                title: 'Conflitto da risolvere',
                description: `La bozza di questa finestra è al sicuro. Confrontala con ${currentDatabaseLabel} e scegli quale versione usare.`,
                badge: 'CONFRONTO RICHIESTO',
                classes: 'border-amber-200 bg-amber-50 text-amber-950',
                badgeClasses: 'border-amber-200 bg-white text-amber-800',
                Icon: TriangleAlert,
            }
            : dataPlane?.mode === 'local'
                ? {
                    title: 'Salvataggio sul PC del torneo',
                    description: 'Le modifiche operative vengono salvate in SQLite e nella copia sul disco secondario. Supabase viene riallineato dal server.',
                    badge: 'LOCALE ATTIVO',
                    classes: 'border-violet-200 bg-violet-50 text-violet-950',
                    badgeClasses: 'border-violet-200 bg-white text-violet-800',
                    Icon: HardDrive,
                }
                : dataPlane?.mode === 'cloud'
                    ? {
                        title: 'Salvataggio su Supabase',
                        description: 'Supabase è il database principale. Le modifiche vengono protette da controllo versione e sessione Admin.',
                        badge: 'PRONTO',
                        classes: 'border-emerald-200 bg-emerald-50 text-emerald-950',
                        badgeClasses: 'border-emerald-200 bg-white text-emerald-800',
                        Icon: Cloud,
                    }
                    : {
                        title: 'Verifica del salvataggio in corso',
                        description: 'Sto controllando se il database principale è il PC locale o Supabase.',
                        badge: 'VERIFICA',
                        classes: 'border-slate-200 bg-white text-slate-900',
                        badgeClasses: 'border-slate-200 bg-slate-50 text-slate-700',
                        Icon: RefreshCw,
                    };
    const FriendlyStatusIcon = friendlyStatus.Icon;
    const comparisonLocalState = localRecoveryCandidate?.state || state;
    const comparisonLocalSummary = summarizeRecoveryState(comparisonLocalState);
    const integrationRecoveryChanges = downloaded?.state && localRecoveryCandidate
        ? listDraftIntegrationChanges(localRecoveryCandidate.state, downloaded.state)
        : [];
    const comparisonRemoteSummary = downloaded?.state ? summarizeRecoveryState(downloaded.state) : null;

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-black">Salvataggio e sincronizzazione</div>
                    <div className="text-xs text-slate-600 mt-1">
                        Controlla dove vengono salvati i dati e risolvi eventuali differenze tra la bozza di questa finestra e il database principale.
                    </div>
                </div>
                <div className="flex items-center gap-2">{statusBadge()}</div>
            </div>

            <div className={`rounded-2xl border p-4 ${friendlyStatus.classes}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-white/80">
                            <FriendlyStatusIcon className={`h-5 w-5 ${!dataPlane ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-black">{friendlyStatus.title}</div>
                            <div className="mt-1 max-w-3xl text-xs font-semibold leading-5 opacity-85">{friendlyStatus.description}</div>
                        </div>
                    </div>
                    <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-black ${friendlyStatus.badgeClasses}`}>{friendlyStatus.badge}</span>
                </div>
                {(dataPlane?.mode === 'local' || dataPlane?.mode === 'recovery') ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-3">
                        <div className="text-[11px] font-bold opacity-80">
                            Gestisci attivazione, chiusura e transizioni dal pannello del PC server.
                        </div>
                        {isServerPcOrigin ? (
                            <a
                                href={`${window.location.origin}/`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white hover:bg-violet-800"
                            >
                                Apri pannello server
                            </a>
                        ) : (
                            <span className="rounded-xl border border-current/15 bg-white/80 px-3 py-2 text-xs font-black">Disponibile sul PC server</span>
                        )}
                    </div>
                ) : null}
                {dataPlane?.mode === 'recovery' ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white/75 p-3">
                        <div className="max-w-2xl text-[11px] font-bold">
                            Usa il failover soltanto se il PC e il suo disco non sono più recuperabili.
                        </div>
                        <button
                            type="button"
                            disabled={isBusy || !hasAdminSession}
                            onClick={onForceCloudFailover}
                            className="min-h-11 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-100 disabled:text-red-400"
                        >
                            Failover emergenza a Supabase
                        </button>
                    </div>
                ) : null}
            </div>

            {!hasAdminSession ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-black text-slate-900">Accedi per le operazioni protette</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">Serve l’account Admin Supabase per pubblicare o sovrascrivere dati online.</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                        <label htmlFor={authEmailId} className="min-w-0 text-xs font-black text-slate-700">
                            Email Admin
                            <input
                                id={authEmailId}
                                name="admin-email"
                                autoComplete="email"
                                value={authEmail}
                                onChange={(e) => setAuthEmail(e.target.value)}
                                placeholder={getConfiguredAdminEmail()}
                                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                            />
                        </label>
                        <label htmlFor={authPasswordId} className="min-w-0 text-xs font-black text-slate-700">
                            Password
                            <span className="relative mt-1 block">
                                <input
                                    id={authPasswordId}
                                    name="admin-password"
                                    autoComplete="current-password"
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    type={showAuthPassword ? 'text' : 'password'}
                                    className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 pr-11 text-sm font-semibold"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowAuthPassword((value) => !value)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                    aria-label={showAuthPassword ? t('hide_password') : t('show_password')}
                                >
                                    {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </span>
                        </label>
                        <button
                            type="button"
                            disabled={isBusy || !cfg || !authEmail.trim() || !authPassword}
                            onClick={onAuthLogin}
                            className="min-h-11 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                            Accedi
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                    <div className="inline-flex min-w-0 items-center gap-2 font-black">
                        <ShieldCheck className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 break-all">Admin connesso{session?.email ? `: ${session.email}` : ''}</span>
                    </div>
                    <button type="button" disabled={isBusy} onClick={onAuthLogout} className="min-h-11 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">
                        Esci
                    </button>
                </div>
            )}

            {hasConflict ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <div className="flex items-start gap-3">
                        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                        <div className="min-w-0">
                            <div className="font-black">La bozza di questo PC non è stata persa</div>
                            <div className="mt-1 text-xs font-semibold leading-5">Confrontala con {currentDatabaseLabel} prima di scegliere. Puoi anche esportarla in un file senza modificare il database.</div>
                            <button type="button" disabled={isBusy || !cfg || !hasAdminSession || !hasRecoveryDataPlane} onClick={onCompareWithDatabase} className="mr-2 mt-3 min-h-11 rounded-xl border border-blue-700 bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-800 disabled:opacity-50">
                                Confronta con il database principale
                            </button>
                            <button type="button" onClick={onExportPendingDraft} className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-950 hover:bg-amber-100">
                                Esporta la bozza locale
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-900">Azioni rapide</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">Le operazioni di ogni giorno sono qui. Nessuna sovrascrittura parte senza un confronto e due conferme.</div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <button
                        type="button"
                        disabled={isBusy || !cfg}
                        onClick={onTest}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        Verifica connessione
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || !cfg || !hasAdminSession || !hasRecoveryDataPlane}
                        onClick={onCompareWithDatabase}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-700 bg-blue-700 px-3 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Confronta con il database principale
                    </button>
                    <button
                        type="button"
                        disabled={forceRecoveryDisabled}
                        onClick={onPrepareKeepLocalVersion}
                        title={forceRecoveryReason || undefined}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-600 bg-amber-600 px-3 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <CloudUpload className="h-4 w-4" />
                        {keepDraftLabel}
                    </button>
                </div>
                {forceRecoveryReason ? <div className="mt-2 text-xs font-bold text-slate-600">{forceRecoveryReason}</div> : null}
            </div>

            {panel.kind === 'working' ? (
                <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">{t('db_working_prefix')} {panel.action}…</div>
            ) : panel.kind === 'error' ? (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{panel.message}</div>
            ) : panel.kind === 'warning' ? (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">{panel.message}</div>
            ) : panel.kind === 'ok' ? (
                <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{panel.message}</div>
            ) : null}

            {downloaded?.state && comparisonRemoteSummary ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                    <div className="text-sm font-black text-slate-950">Confronto pronto</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">Controlla le differenze e scegli quali modifiche recuperare.</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-amber-200 bg-white p-4">
                            <div className="text-xs font-black uppercase tracking-wide text-amber-700">Bozza di questa finestra</div>
                            <div className="mt-1 text-base font-black text-slate-950">{comparisonLocalSummary.tournament}</div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Squadre</span><strong>{comparisonLocalSummary.teams}</strong></div>
                                <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Partite concluse</span><strong>{comparisonLocalSummary.finished}/{comparisonLocalSummary.matches}</strong></div>
                            </div>
                            <div className="mt-2 text-xs font-semibold text-slate-700">{comparisonLocalSummary.titles} titoli · {comparisonLocalSummary.editions} tornei archiviati · {comparisonLocalSummary.scorers} integrazioni marcatori</div>
                            <div className="mt-2 break-all text-[11px] font-semibold text-slate-500">Copia locale: {formatRecoveryDate(localRecoveryCandidate?.savedAt)}</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                            <div className="text-xs font-black uppercase tracking-wide text-emerald-700">{comparedDatabaseLabel}</div>
                            <div className="mt-1 text-base font-black text-slate-950">{comparisonRemoteSummary.tournament}</div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Squadre</span><strong>{comparisonRemoteSummary.teams}</strong></div>
                                <div className="rounded-xl bg-slate-50 p-2"><span className="block text-slate-500">Partite concluse</span><strong>{comparisonRemoteSummary.finished}/{comparisonRemoteSummary.matches}</strong></div>
                            </div>
                            <div className="mt-2 text-xs font-semibold text-slate-700">{comparisonRemoteSummary.titles} titoli · {comparisonRemoteSummary.editions} tornei archiviati · {comparisonRemoteSummary.scorers} integrazioni marcatori</div>
                            <div className="mt-2 break-all text-[11px] font-semibold text-slate-500">Versione {downloaded.version ?? 'N/D'} · {formatRecoveryDate(downloaded.updatedAt)}</div>
                        </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-blue-200 bg-white p-4">
                        <div className="text-sm font-black text-slate-950">Recupera titoli e rinomine dalla bozza</div>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Seleziona i nuovi titoli manuali e i nomi delle edizioni da salvare. Risultati, referti e tutte le altre differenze resteranno come nel database. Non serve esportare un file.</p>
                        {integrationRecoveryChanges.length ? <div className="mt-3 space-y-2">
                            {integrationRecoveryChanges.map(change => <label key={change.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-blue-50">
                                <input type="checkbox" disabled={isBusy} className="mt-1 h-4 w-4 shrink-0" checked={selectedRecoveryKeys.includes(change.key)} onChange={event => {
                                    setSelectedRecoveryKeys(keys => event.target.checked ? [...keys, change.key] : keys.filter(key => key !== change.key));
                                }} />
                                <span className="min-w-0 text-sm text-slate-800">
                                    {change.kind === 'add-title' ? <>
                                        <strong className="block">Aggiungi titolo: {change.entry.tournamentName}</strong>
                                        <span className="mt-1 block text-xs">{t(`edition_award_${change.entry.type}`)} · {change.entry.teamName || (change.entry.playerNames || []).join(', ')} · {change.entry.sourceTournamentDate || change.entry.year}</span>
                                        {change.entry.teamName && change.entry.playerNames?.length ? <span className="mt-1 block text-xs">{change.entry.playerNames.join(', ')}</span> : null}
                                    </> : <>
                                        <strong className="block">Rinomina edizione: {change.nextName}</strong>
                                        <span className="mt-1 block text-xs">Nel database: {change.previousName}</span>
                                        <span className="mt-1 block text-xs">Il nome verrà aggiornato anche nei titoli e nelle integrazioni collegate.</span>
                                    </>}
                                </span>
                            </label>)}
                            <button type="button" disabled={isBusy || !hasRecoveryDataPlane || !hasAdminSession || !commitAdminStateDurably || !selectedRecoveryKeys.length} onClick={onRecoverSelectedChanges} className="min-h-11 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50">Salva modifiche selezionate ({selectedRecoveryKeys.length})</button>
                        </div> : <p className="mt-2 text-xs text-slate-600">Non ci sono nuovi titoli manuali o rinomine da recuperare. Per altre differenze puoi confrontare ed eventualmente scegliere un’intera versione.</p>}
                    </div>
                    <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold text-slate-600">Scegli un’intera versione</summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button type="button" disabled={isBusy || !hasRecoveryDataPlane} onClick={onApply} className="min-h-11 rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50">
                            Usa la versione del database in questa finestra
                        </button>
                        <button type="button" disabled={forceRecoveryDisabled} onClick={onPrepareKeepLocalVersion} className="min-h-11 rounded-xl border border-amber-600 bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
                            {keepDraftLabel}
                        </button>
                    </div>
                    </details>
                </div>
            ) : null}

            <details className="rounded-2xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer list-none rounded-lg px-1 py-1 text-sm font-black text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                    Strumenti avanzati e diagnostica
                    <span className="ml-2 text-xs font-semibold text-slate-500">Configurazione, migrazione e controlli tecnici</span>
                </summary>
                <div className="mt-4 space-y-4">

            <div className={`border rounded-2xl p-3 text-xs ${dataPlane?.mode === 'local' ? 'bg-violet-50 border-violet-200 text-violet-950' : dataPlane?.mode === 'recovery' ? 'bg-red-50 border-red-200 text-red-950' : 'bg-white border-slate-200 text-slate-800'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="font-black">Nodo dati del torneo</div>
                        <div className="mt-1 font-bold">
                            {dataPlane?.mode === 'local'
                                ? 'SERVER LOCALE PRIMARIO — tutte le letture live e le scritture critiche passano dal PC del torneo.'
                                : dataPlane?.mode === 'recovery'
                                    ? 'RECUPERO — scritture sospese per evitare due database primari contemporaneamente.'
                                    : 'SUPABASE PRIMARIO — il server locale è in standby.'}
                        </div>
                    </div>
                    <span className="px-2 py-1 rounded-lg border bg-white font-black">
                        {String(dataPlane?.mode || 'verifica').toUpperCase()}{dataPlane?.epoch ? ` · epoch ${dataPlane.epoch}` : ''}
                    </span>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[240px] text-[11px] font-semibold opacity-80">
                        L’autorizzazione locale viene rilasciata automaticamente solo alla web app aperta sul PC server. Il token principale non va copiato in browser remoti.
                    </div>
                    {isServerPcOrigin ? (
                    <a
                        href={`${window.location.origin}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl bg-violet-700 text-white text-center font-black"
                    >
                        Pannello server / switch
                    </a>
                    ) : (
                        <span className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-black">
                            Switch disponibile sul PC server
                        </span>
                    )}
                </div>
                {dataPlane?.mode === 'recovery' ? (
                    <div className="mt-3 border-t border-red-200 pt-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-[11px] font-bold max-w-2xl">
                            Se il PC può essere riacceso, non usare il failover: riavvia server e tunnel e lascia sincronizzare l’outbox. Questa azione serve solo per un PC definitivamente non recuperabile.
                        </div>
                        <button
                            type="button"
                            disabled={isBusy || !hasAdminSession}
                            onClick={onForceCloudFailover}
                            className={`px-3 py-2 rounded-xl font-black ${isBusy || !hasAdminSession ? 'bg-red-100 text-red-300' : 'bg-red-700 text-white hover:bg-red-800'}`}
                        >
                            Failover emergenza a Supabase
                        </button>
                    </div>
                ) : null}
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
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                <div className="font-black">Sovrascrittura controllata</div>
                                <div className="mt-1">Il comando one-shot è in “Azioni rapide” e richiede sempre confronto, spunta e parola di conferma.</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                                <div className="text-xs font-black">{t('db_migration_first_setup')}</div>
                                <div className="text-xs text-slate-600 mt-1">
                                    {t('db_migration_full_path')}
                                </div>
                                <div className="mt-3">
                                    <DbMigrationWizard state={state} />
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
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                <div>
                                    {t('db_db_updated_at')}: <span className="font-mono">{downloaded.updatedAt}</span>
                                    {' · '}versione <span className="font-mono">{downloaded.version ?? 'N/D'}</span>
                                </div>
                                {localRecoveryCandidate ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-slate-600">
                                            Scegli quale stato deve diventare quello di riferimento:
                                        </span>
                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={onApply}
                                            className="rounded-xl bg-emerald-700 px-3 py-2 font-black text-white disabled:opacity-50"
                                        >
                                            Usa versione DB
                                        </button>
                                        <button
                                            type="button"
                                            disabled={forceRecoveryDisabled}
                                            onClick={onPrepareKeepLocalVersion}
                                            className="rounded-xl bg-amber-700 px-3 py-2 font-black text-white disabled:opacity-50"
                                        >
                                            {keepDraftLabel}
                                        </button>
                                    </div>
                                ) : null}
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
                                {!healthHasWarnings ? (
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
                                            <div className="text-slate-600 break-words">{c.message || (c.ok ? 'OK' : '')}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </details>
                </div>
            </details>

            <AdminDataConfirmModal
                open={!!forceRecoveryPreview}
                tone="danger"
                title={forceRecoveryPreview?.dataPlane.mode === 'local' ? 'Recuperare la bozza nel database del PC server?' : 'Sovrascrivere Supabase con questa versione locale?'}
                description={forceRecoveryPreview?.dataPlane.mode === 'local'
                    ? 'L’intera bozza di questa finestra diventerà la nuova versione del database del PC server. La versione precedente resta nella cronologia e viene verificata la copia sul disco secondario. Il server sincronizza poi Supabase.'
                    : 'I dati del torneo presenti su questo PC diventeranno la nuova versione online. La versione precedente resterà nella cronologia Supabase. Account, profili e squadre Fanta non vengono modificati.'}
                confirmLabel={forceRecoveryPreview?.dataPlane.mode === 'local' ? 'Sì, recupera nel database del PC server' : 'Sì, sovrascrivi Supabase'}
                confirmDisabled={isBusy || !hasRecoveryDataPlane || !forceRecoveryAccepted || forceRecoveryPhrase.trim().toUpperCase() !== FORCE_RECOVERY_CONFIRMATION_TEXT}
                onConfirm={onConfirmKeepLocalVersion}
                onClose={closeForceRecoveryPreview}
            >
                {forceRecoveryPreview ? (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <div className="text-xs font-black uppercase tracking-wide text-amber-800">Bozza di questa finestra — verrà usata</div>
                                <div className="mt-1 font-black text-slate-950">{forceRecoveryPreview.localSummary.tournament}</div>
                                <div className="mt-2 text-xs font-semibold text-slate-700">
                                    {forceRecoveryPreview.localSummary.teams} squadre · {forceRecoveryPreview.localSummary.finished}/{forceRecoveryPreview.localSummary.matches} partite concluse
                                </div>
                                <div className="mt-2 text-xs font-semibold text-slate-700">{forceRecoveryPreview.localSummary.titles} titoli · {forceRecoveryPreview.localSummary.editions} tornei archiviati · {forceRecoveryPreview.localSummary.scorers} integrazioni marcatori</div>
                                <div className="mt-1 break-all text-[11px] text-slate-500">{formatRecoveryDate(forceRecoveryPreview.candidate.savedAt)}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="text-xs font-black uppercase tracking-wide text-slate-600">{databaseLabel(forceRecoveryPreview.dataPlane)} — verrà sostituito</div>
                                <div className="mt-1 font-black text-slate-950">{forceRecoveryPreview.remoteSummary.tournament}</div>
                                <div className="mt-2 text-xs font-semibold text-slate-700">
                                    {forceRecoveryPreview.remoteSummary.teams} squadre · {forceRecoveryPreview.remoteSummary.finished}/{forceRecoveryPreview.remoteSummary.matches} partite concluse
                                </div>
                                <div className="mt-2 text-xs font-semibold text-slate-700">{forceRecoveryPreview.remoteSummary.titles} titoli · {forceRecoveryPreview.remoteSummary.editions} tornei archiviati · {forceRecoveryPreview.remoteSummary.scorers} integrazioni marcatori</div>
                                <div className="mt-1 break-all text-[11px] text-slate-500">Versione {forceRecoveryPreview.remote.version ?? 'N/D'} · {formatRecoveryDate(forceRecoveryPreview.remote.updatedAt)}</div>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-950">
                            I referti arbitro più recenti già presenti nel database vengono conservati. Se il database o la sua versione cambiano dopo questo confronto, il salvataggio si blocca e ti chiede di confrontare di nuovo.
                        </div>
                        <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 font-bold text-amber-950">
                            <input
                                type="checkbox"
                                checked={forceRecoveryAccepted}
                                onChange={(event) => setForceRecoveryAccepted(event.target.checked)}
                                className="mt-1 h-4 w-4 accent-amber-700"
                            />
                            <span>Ho confrontato i due riepiloghi e confermo che l’intera bozza di questa finestra è quella corretta.</span>
                        </label>
                        <label htmlFor={forcePhraseId} className="block text-sm font-black text-slate-800">
                            Per la seconda conferma scrivi <span className="font-mono text-rose-700">{FORCE_RECOVERY_CONFIRMATION_TEXT}</span>
                            <input
                                id={forcePhraseId}
                                value={forceRecoveryPhrase}
                                onChange={(event) => setForceRecoveryPhrase(event.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                                className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-base font-black uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                            />
                        </label>
                    </>
                ) : null}
            </AdminDataConfirmModal>

            {!cfg ? (
                <div className="text-xs text-slate-600">
                    {t('db_env_config_hint_prefix')} <span className="font-mono">VITE_SUPABASE_URL</span> {t('and')} <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> {t('db_env_config_hint_suffix')} <span className="font-mono">.env.local</span> (<span className="font-mono">.env.example</span>).
                </div>
            ) : null}
        </div>
    );
};
