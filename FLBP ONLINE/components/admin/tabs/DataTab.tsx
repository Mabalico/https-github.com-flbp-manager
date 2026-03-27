import React from 'react';
import { Activity, Archive, BarChart3, Database, Link2, PlusCircle, Settings, TriangleAlert } from 'lucide-react';
import type { Team, Match } from '../../../types';
import type { AppState } from '../../../services/storageService';
import { isAdminWriteOnlyDbIssue, readDbSyncDiagnostics } from '../../../services/dbDiagnostics';
import { getSupabaseAccessToken } from '../../../services/supabaseRest';
import { isRemotePersistenceLocked } from '../../../services/repository/featureFlags';
import { ArchiveSubTab, BackupSyncPanel, DbSyncPanel, IntegrationsSubTab, TrafficSubTab, ViewsSubTab } from './data';

export interface DataTabProps {
    state: AppState;
    setState: (s: AppState) => void;
    t: (key: string) => string;
    embedded?: boolean;
    exportBackupJson: () => void;
    restoreBackupJson: (file: File) => void;
    mergeBackupJson: (file: File) => void;

    dataSubTab: 'archive' | 'integrations';
    setDataSubTab: (v: 'archive' | 'integrations') => void;

    integrationsSubTab: 'hof' | 'scorers' | 'aliases' | 'players';
    setIntegrationsSubTab: (v: 'hof' | 'scorers' | 'aliases' | 'players') => void;

    // Alias globale
    aliasesSearch: string;
    setAliasesSearch: (v: string) => void;
    aliasToolSelections: Record<string, string>;
    setAliasToolSelections: (v: React.SetStateAction<Record<string, string>>) => void;
    buildProfilesIndex: (excludeTeamId?: string) => Map<string, Set<string>>;
    setAlias: (fromKey: string, toKey: string) => void;
    removeAlias: (fromKey: string) => void;

    // Archivio: edit + awards manual
    dataSelectedTournamentId: string;
    setDataSelectedTournamentId: (v: string) => void;
    dataSelectedMatchId: string;
    setDataSelectedMatchId: (v: string) => void;
    dataScoreA: string;
    setDataScoreA: (v: string) => void;
    dataScoreB: string;
    setDataScoreB: (v: string) => void;
    dataStatus: 'scheduled' | 'playing' | 'finished';
    setDataStatus: (v: 'scheduled' | 'playing' | 'finished') => void;
    dataRecomputeAwards: boolean;
    setDataRecomputeAwards: (v: boolean) => void;
    dataWinnerTeamId: string;
    setDataWinnerTeamId: (v: string) => void;
    dataTopScorerPlayerId: string;
    setDataTopScorerPlayerId: (v: string) => void;
    dataDefenderPlayerId: string;
    setDataDefenderPlayerId: (v: string) => void;
    dataMvpPlayerId: string;
    setDataMvpPlayerId: (v: string) => void;
    dataTopScorerU25PlayerId: string;
    setDataTopScorerU25PlayerId: (v: string) => void;
    dataDefenderU25PlayerId: string;
    setDataDefenderU25PlayerId: (v: string) => void;

    // Albo d'Oro manuale
    hofEditId: string;
    setHofEditId: (v: string) => void;
    hofEditTournamentId: string;
    setHofEditTournamentId: (v: string) => void;
    hofYear: string;
    setHofYear: (v: string) => void;
    hofTournamentName: string;
    setHofTournamentName: (v: string) => void;
    hofType: 'winner' | 'mvp' | 'top_scorer' | 'defender' | 'top_scorer_u25' | 'defender_u25';
    setHofType: (v: any) => void;
    hofTeamName: string;
    setHofTeamName: (v: string) => void;
    hofWinnerP1: string;
    setHofWinnerP1: (v: string) => void;
    hofWinnerP2: string;
    setHofWinnerP2: (v: string) => void;
    hofPlayerName: string;
    setHofPlayerName: (v: string) => void;
    hofPlayerYoB: string;
    setHofPlayerYoB: (v: string) => void;
    hofValue: string;
    setHofValue: (v: string) => void;

    // Import marcatori warnings
    scorersImportWarnings: string[];
    setScorersImportWarnings: (v: string[]) => void;
    setPendingScorersImport: (v: any) => void;
    setAliasModalOpen: (v: boolean) => void;
    setAliasModalTitle: (v: string) => void;
    setAliasModalConflicts: (v: any) => void;

    scorersFileRef: React.RefObject<HTMLInputElement | null>;

    // Wizard torneo archiviato
    createArchiveOpen: boolean;
    createArchiveStep: 'meta' | 'teams' | 'structure';
    setCreateArchiveStep: (v: 'meta' | 'teams' | 'structure') => void;
    createArchiveName: string;
    setCreateArchiveName: (v: string) => void;
    createArchiveDate: string;
    setCreateArchiveDate: (v: string) => void;
    createArchiveMode: 'elimination' | 'groups_elimination' | 'round_robin';
    setCreateArchiveMode: (v: any) => void;
    createArchiveGroups: number;
    setCreateArchiveGroups: (v: number) => void;
    createArchiveAdvancing: number;
    setCreateArchiveAdvancing: (v: number) => void;

    // Wizard: optional "Girone Finale" (solo per tornei con tabellone)
    createArchiveFinalRrEnabled: boolean;
    setCreateArchiveFinalRrEnabled: (v: boolean) => void;
    createArchiveFinalRrTopTeams: 4 | 8;
    setCreateArchiveFinalRrTopTeams: (v: 4 | 8) => void;
    createArchiveTeams: Team[];
    createArchiveFileRef: React.RefObject<HTMLInputElement | null>;

    caTeamName: string;
    setCaTeamName: (v: string) => void;
    caP1: string;
    setCaP1: (v: string) => void;
    caY1: string;
    setCaY1: (v: string) => void;
    caP2: string;
    setCaP2: (v: string) => void;
    caY2: string;
    setCaY2: (v: string) => void;
    caP1IsRef: boolean;
    setCaP1IsRef: (v: boolean) => void;
    caP2IsRef: boolean;
    setCaP2IsRef: (v: boolean) => void;

    openCreateArchiveWizard: () => void;
    resetCreateArchiveWizard: () => void;
    copyLiveTeamsIntoWizard: () => void;
    importArchiveTeamsFile: (file: File) => void;
    addWizardTeam: () => void;
    removeWizardTeam: (id: string) => void;
    createArchivedTournament: () => void;

    // Helpers condivisi (logica invariata da AdminDashboard)
    autoFixBracketFromResults: (matches: Match[]) => Match[];
}

export const DataTab: React.FC<DataTabProps> = (props) => {
    const { dataSubTab, setDataSubTab, t } = props;
    const safeSessionGet = (key: string): string | null => {
        try { return window.sessionStorage.getItem(key); } catch { return null; }
    };
    const safeSessionSet = (key: string, value: string) => {
        try { window.sessionStorage.setItem(key, value); } catch {}
    };
    const [mainSection, setMainSection] = React.useState<'integrations' | 'views' | 'traffic' | 'persistence' | null>(() => {
        const raw = safeSessionGet('flbp_admin_data_main_section');
        return raw === 'integrations' || raw === 'views' || raw === 'traffic' || raw === 'persistence' ? raw : null;
    });
    const embedded = !!props.embedded;

    const archiveCount = (props.state.tournamentHistory || []).length;
    const hofCount = (props.state.hallOfFame || []).length;
    const scorersCount = (props.state.integrationsScorers || []).length;
    const aliasesCount = Object.keys(props.state.playerAliases || {}).length;
    const activeSectionLabel = dataSubTab === 'archive' ? t('data_active_edit') : t('data_active_add');
    const dbDiag = readDbSyncDiagnostics();
    const hasAdminWriteSession = !!getSupabaseAccessToken();
    const remotePersistenceLocked = isRemotePersistenceLocked();

    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const tabBtnBase = `px-3 py-2.5 rounded-xl font-black border text-sm inline-flex items-center gap-2 ${ring}`;
    const tabBtnActive = 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800';
    const tabBtnInactive = 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';
    const entryBtnBase = `group relative overflow-hidden text-left rounded-3xl border p-5 transition-all duration-200 ${ring}`;

    const entryBtnClass = (section: 'integrations' | 'views' | 'traffic' | 'persistence') => {
        const isActive = mainSection === section;
        if (section === 'integrations') {
            return `${entryBtnBase} ${
                isActive
                    ? 'border-blue-300 bg-gradient-to-br from-blue-50 via-indigo-50 to-white shadow-md shadow-blue-100'
                    : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm'
            }`;
        }
        if (section === 'views') {
            return `${entryBtnBase} ${
                isActive
                    ? 'border-sky-300 bg-gradient-to-br from-sky-50 via-blue-50 to-white shadow-md shadow-sky-100'
                    : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40 hover:shadow-sm'
            }`;
        }
        if (section === 'traffic') {
            return `${entryBtnBase} ${
                isActive
                    ? 'border-violet-300 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-white shadow-md shadow-violet-100'
                    : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-sm'
            }`;
        }
        return `${entryBtnBase} ${
            isActive
                ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-cyan-50 to-white shadow-md shadow-emerald-100'
                : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-sm'
        }`;
    };

    const pill = (label: string) => (
        <span className="px-2 py-1 rounded-full text-[11px] font-black border border-slate-200 bg-slate-50 text-slate-700">
            {label}
        </span>
    );

    const dbIssueInfo = React.useMemo(() => {
        const conflictMessage = String(dbDiag.lastConflictMessage || '').trim();
        const errorMessage = String(dbDiag.lastErrorMessage || '').trim();
        const hideAdminWriteOnlyIssue = !hasAdminWriteSession && isAdminWriteOnlyDbIssue(errorMessage);

        if (conflictMessage) {
            return {
                tone: 'amber',
                title: t('data_db_conflict_title'),
                description: t('data_db_conflict_desc'),
                action: t('data_db_conflict_action')
            } as const;
        }

        if (errorMessage && !hideAdminWriteOnlyIssue) {
            const lower = errorMessage.toLowerCase();
            if (lower.includes('offline') || lower.includes('timeout') || lower.includes('fetch') || lower.includes('network')) {
                return {
                    tone: 'amber',
                    title: t('data_db_connection_title'),
                    description: t('data_db_connection_desc'),
                    action: remotePersistenceLocked
                        ? t('data_db_connection_action_public')
                        : t('data_db_connection_action_local')
                } as const;
            }
            if (lower.includes('autoriz') || lower.includes('jwt') || lower.includes('token') || lower.includes('forbidden') || lower.includes('401') || lower.includes('403') || lower.includes('rls')) {
                return {
                    tone: 'amber',
                    title: t('data_db_access_title'),
                    description: t('data_db_access_desc'),
                    action: remotePersistenceLocked
                        ? t('data_db_access_action_public')
                        : t('data_db_access_action_local')
                } as const;
            }
            return {
                tone: 'amber',
                title: t('data_db_sync_error_title'),
                description: t('data_db_sync_error_desc'),
                action: t('data_db_sync_error_action')
            } as const;
        }

        return null;
    }, [dbDiag.lastConflictMessage, dbDiag.lastErrorMessage, hasAdminWriteSession, remotePersistenceLocked]);

    React.useEffect(() => {
        if (!mainSection) {
            try { window.sessionStorage.removeItem('flbp_admin_data_main_section'); } catch {}
            return;
        }
        safeSessionSet('flbp_admin_data_main_section', mainSection);
    }, [mainSection]);

    React.useEffect(() => {
        const onOpenPersistence = () => setMainSection('persistence');
        const onOpenViews = () => setMainSection('views');
        const onOpenTraffic = () => setMainSection('traffic');
        window.addEventListener('flbp:open-data-persistence', onOpenPersistence as EventListener);
        window.addEventListener('flbp:open-data-views', onOpenViews as EventListener);
        window.addEventListener('flbp:open-data-traffic', onOpenTraffic as EventListener);
        return () => {
            window.removeEventListener('flbp:open-data-persistence', onOpenPersistence as EventListener);
            window.removeEventListener('flbp:open-data-views', onOpenViews as EventListener);
            window.removeEventListener('flbp:open-data-traffic', onOpenTraffic as EventListener);
        };
    }, []);

    return (
        <div className={embedded ? 'space-y-6' : 'bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6'}>
            {!embedded ? (
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="text-xl font-black flex items-center gap-2">
                            <Settings className="w-5 h-5" />
                            {t('data_management')}
                        </h3>
                        {remotePersistenceLocked ? (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-900">
                                {t('data_public_deploy_persistence')}
                            </div>
                        ) : null}
                        <div className="text-xs text-slate-600 font-bold mt-1">
                            {t('data_management_intro')}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                <button
                    type="button"
                    onClick={() => setMainSection('integrations')}
                    className={entryBtnClass('integrations')}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-blue-600 text-white shadow-sm mb-3">
                                <Link2 className="w-5 h-5" />
                            </div>
                            <div className="text-base font-black text-slate-900 flex items-center gap-2">
                                {t('data_integrations_title')}
                            </div>
                            <div className="text-sm text-slate-600 font-bold mt-1 max-w-[34ch]">
                                {t('data_integrations_desc')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end text-xs font-bold max-w-[46%]">
                            {pill(t('data_pill_history').replace('{count}', String(archiveCount)))}
                            {pill(t('data_pill_hof').replace('{count}', String(hofCount)))}
                            {pill(t('data_pill_scorers').replace('{count}', String(scorersCount)))}
                            {pill(t('data_pill_aliases').replace('{count}', String(aliasesCount)))}
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setMainSection('views')}
                    className={entryBtnClass('views')}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-sky-600 text-white shadow-sm mb-3">
                                <BarChart3 className="w-5 h-5" />
                            </div>
                            <div className="text-base font-black text-slate-900 flex items-center gap-2">
                                {t('data_views_title')}
                            </div>
                            <div className="text-sm text-slate-600 font-bold mt-1 max-w-[34ch]">
                                {t('data_views_desc')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end text-xs font-bold max-w-[42%]">
                            {pill(t('data_pill_counter'))}
                            {pill(t('data_pill_chart'))}
                            {pill(t('data_pill_range'))}
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setMainSection('traffic')}
                    className={entryBtnClass('traffic')}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-violet-600 text-white shadow-sm mb-3">
                                <Activity className="w-5 h-5" />
                            </div>
                            <div className="text-base font-black text-slate-900 flex items-center gap-2">
                                {t('data_traffic_title')}
                            </div>
                            <div className="text-sm text-slate-600 font-bold mt-1 max-w-[34ch]">
                                {t('data_traffic_desc')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end text-xs font-bold max-w-[42%]">
                            {pill(t('data_pill_bytes'))}
                            {pill(t('data_pill_requests'))}
                            {pill(t('data_pill_range'))}
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setMainSection('persistence')}
                    className={entryBtnClass('persistence')}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-600 text-white shadow-sm mb-3">
                                <Database className="w-5 h-5" />
                            </div>
                            <div className="text-base font-black text-slate-900 flex items-center gap-2">
                                {t('data_persistence_title')}
                            </div>
                            <div className="text-sm text-slate-600 font-bold mt-1 max-w-[36ch]">
                                {t('data_persistence_desc')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end text-xs font-bold max-w-[42%]">
                            {pill(t('data_pill_backup_file'))}
                            {pill(t('data_pill_sync_online'))}
                        </div>
                    </div>
                </button>
            </div>

            {mainSection ? <div className="border-t border-slate-200 pt-5" /> : null}

            {mainSection === 'integrations' ? (
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                                <Link2 className="w-4 h-4" />
                                {t('data_integrations_title')}
                            </div>
                            <div className="text-xs text-slate-600 font-bold mt-1">
                                {t('data_integrations_helper')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                            {pill(t('data_pill_history').replace('{count}', String(archiveCount)))}
                            {pill(t('data_pill_hof').replace('{count}', String(hofCount)))}
                            {pill(t('data_pill_scorers').replace('{count}', String(scorersCount)))}
                            {pill(t('data_pill_aliases').replace('{count}', String(aliasesCount)))}
                            <span className="px-2 py-1 rounded-full text-[11px] font-black border border-blue-200 bg-blue-50 text-blue-800">
                                {activeSectionLabel}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label={t('data_integrations_subsections_aria')}>
                        <button type="button"
                            onClick={() => {
                                setDataSubTab('archive');
                                try { sessionStorage.setItem('flbp_admin_data_subtab', 'archive'); } catch {}
                            }}
                            className={`${tabBtnBase} ${dataSubTab === 'archive' ? tabBtnActive : tabBtnInactive}`}
                        >
                            <Archive className="w-4 h-4" />
                            {t('edit')}
                        </button>
                        <button type="button"
                            onClick={() => {
                                setDataSubTab('integrations');
                                try { sessionStorage.setItem('flbp_admin_data_subtab', 'integrations'); } catch {}
                            }}
                            className={`${tabBtnBase} ${dataSubTab === 'integrations' ? tabBtnActive : tabBtnInactive}`}
                        >
                            <PlusCircle className="w-4 h-4" />
                            {t('data_add')}
                        </button>
                    </div>

                    {dataSubTab === 'archive' ? (
                        <ArchiveSubTab {...props} />
                    ) : (
                        <IntegrationsSubTab {...props} />
                    )}
                </div>
            ) : null}

            {mainSection === 'views' ? (
                <ViewsSubTab onBack={() => setMainSection(null)} t={t} />
            ) : null}

            {mainSection === 'traffic' ? (
                <TrafficSubTab onBack={() => setMainSection(null)} t={t} />
            ) : null}

            {mainSection === 'persistence' ? (
                <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                                <Database className="w-4 h-4" />
                                {t('data_persistence_title')}
                            </div>
                            <div className="text-xs text-slate-600 font-bold mt-1">
                                {t('data_persistence_helper')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
                            {pill(t('data_pill_backup_file'))}
                            {pill(t('data_pill_sync_online'))}
                        </div>
                    </div>

                    {dbIssueInfo ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start gap-3">
                                <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 shrink-0">
                                    <TriangleAlert className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-black text-amber-900">{dbIssueInfo.title}</div>
                                    <div className="text-sm text-amber-900/90 font-bold mt-1">
                                        {dbIssueInfo.description}
                                    </div>
                                    <div className="text-xs text-amber-900/80 font-bold mt-2">
                                        {dbIssueInfo.action}
                                    </div>
                                    {dbDiag.lastConflictMessage || dbDiag.lastErrorMessage ? (
                                        <div className="mt-3 text-[11px] font-mono text-amber-900/80 bg-white/60 border border-amber-200 rounded-xl px-3 py-2 break-words">
                                            {dbDiag.lastConflictMessage || dbDiag.lastErrorMessage}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <BackupSyncPanel
                        exportBackupJson={props.exportBackupJson}
                        restoreBackupJson={props.restoreBackupJson}
                        mergeBackupJson={props.mergeBackupJson}
                    />
                    <DbSyncPanel state={props.state} setState={props.setState} />
                </div>
            ) : null}
        </div>
    );
};
