import React from 'react';
import { requestDraftNavigation } from '../../../services/draftNavigationGuard';
import { Archive, ChevronDown, Database, Settings, Users } from 'lucide-react';
import type { Team, Match } from '../../../types';
import type { AppState } from '../../../services/storageService';
import { isRemotePersistenceLocked } from '../../../services/repository/featureFlags';
import { DbMigrationWizard } from './data/DbMigrationWizard';
import { IntegrationsFantaCleanup } from './data/IntegrationsFantaCleanup';
import { listEditions } from '../../../services/editionData';
import { AccountsSubTab, BackupSyncPanel, DbSyncPanel, IntegrationsSubTab, TrafficSubTab, ViewsSubTab } from './data';

export interface DataTabProps {
    state: AppState;
    setState: (s: AppState) => void;
    t: (key: string) => string;
    embedded?: boolean;
    exportBackupJson: () => void;
    restoreBackupJson: (file: File) => void;
    mergeBackupJson: (file: File) => void;
    exportFullDatabaseBackupJson: () => void;
    restoreFullDatabaseBackupJson: (file: File) => void;

    dataSubTab: 'archive' | 'integrations';
    setDataSubTab: (v: 'archive' | 'integrations') => void;

    integrationsSubTab: 'tournaments' | 'hof' | 'scorers' | 'aliases' | 'players' | 'fanta';
    setIntegrationsSubTab: (v: 'tournaments' | 'hof' | 'scorers' | 'aliases' | 'players' | 'fanta') => void;
    renameTournamentEdition: (tournamentId: string, nextName: string) => Promise<void>;

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
    setCreateArchiveMode: (v: 'elimination' | 'groups_elimination' | 'round_robin') => void;
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
    createArchiveLateTeamIds: string[];
    setCreateArchiveLateTeamIds: (ids: string[]) => void;
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

type DataSection = 'integrations' | 'accounts' | 'persistence' | 'views' | 'traffic' | 'sync' | 'migration' | 'fanta';

const SECTION_KEY = 'flbp_admin_data_main_section';
const technicalSections: { id: DataSection; label: string }[] = [
    { id: 'views', label: 'data_views_title' },
    { id: 'traffic', label: 'data_traffic_title' },
    { id: 'sync', label: 'data_section_sync' },
    { id: 'migration', label: 'data_section_migration' },
    { id: 'fanta', label: 'edition_fanta_maintenance' },
];

const restoreSection = (): DataSection => {
    try {
        const saved = window.sessionStorage.getItem(SECTION_KEY);
        if (saved === 'accounts' || saved === 'persistence') return saved;
        return technicalSections.find(section => section.id === saved)?.id || 'integrations';
    } catch { return 'integrations'; }
};

export const DataTab: React.FC<DataTabProps> = (props) => {
    const { t, state, embedded } = props;
    const [forceOverwrite, setForceOverwrite] = React.useState(false);
    const [mainSection, setMainSection] = React.useState(restoreSection);
    const [technicalOpen, setTechnicalOpen] = React.useState(() => technicalSections.some(section => section.id === mainSection));
    const navigateSection = React.useCallback((section: DataSection) => {
        if (section === mainSection) return;
        void requestDraftNavigation(() => {
            setMainSection(section);
            if (technicalSections.some(item => item.id === section)) setTechnicalOpen(true);
        });
    }, [mainSection]);

    React.useEffect(() => {
        try { window.sessionStorage.setItem(SECTION_KEY, mainSection); } catch {}
    }, [mainSection]);

    React.useEffect(() => {
        const openPersistence = () => navigateSection('sync');
        const openViews = () => navigateSection('views');
        const openTraffic = () => navigateSection('traffic');
        window.addEventListener('flbp:open-data-persistence', openPersistence);
        window.addEventListener('flbp:open-data-views', openViews);
        window.addEventListener('flbp:open-data-traffic', openTraffic);
        return () => {
            window.removeEventListener('flbp:open-data-persistence', openPersistence);
            window.removeEventListener('flbp:open-data-views', openViews);
            window.removeEventListener('flbp:open-data-traffic', openTraffic);
        };
    }, [navigateSection]);

    // Same count as "Tornei passati": title-only editions are past tournaments too.
    const archiveCount = React.useMemo(() => listEditions(state).filter(edition => !edition.live).length, [state]);
    const renderEntry = (id: DataSection, label: string, icon?: React.ReactNode, detail?: string) => (
        <button key={id} type="button" aria-current={mainSection === id ? 'page' : undefined} onClick={() => navigateSection(id)}
            className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-beer-600 ${mainSection === id ? 'border-blue-300 bg-blue-50 text-blue-950' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}>
            {icon}
            <span className="min-w-0">
                <span className="block">{label}</span>
                {detail && <span className="block text-xs font-medium text-slate-600">{detail}</span>}
            </span>
        </button>
    );

    return (
        <div className={embedded ? 'space-y-4' : 'space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-5'}>
            {!embedded && (
                <header className="flex flex-wrap items-center gap-2">
                    <h3 className="flex items-center gap-2 text-xl font-black"><Settings className="h-5 w-5" aria-hidden="true" />{t('data_management')}</h3>
                    {isRemotePersistenceLocked() && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900">{t('data_public_deploy_persistence')}</span>}
                </header>
            )}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)]">
                <nav aria-label={t('data_management')} className="flex flex-wrap items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 lg:grid">
                    {renderEntry('integrations', t('data_section_archive_players'), <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />, t(archiveCount === 1 ? 'data_archive_one' : 'data_archive_count').replace('{count}', String(archiveCount)))}
                    {renderEntry('accounts', t('data_accounts_title'), <Users className="h-4 w-4 shrink-0" aria-hidden="true" />)}
                    {renderEntry('persistence', t('data_section_backup'), <Database className="h-4 w-4 shrink-0" aria-hidden="true" />)}
                    <button type="button" aria-expanded={technicalOpen} aria-controls="data-technical-nav" onClick={() => setTechnicalOpen(open => !open)} className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-start text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-beer-600">
                        {t('data_section_technical')} <ChevronDown className={`h-4 w-4 ${technicalOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    <div id="data-technical-nav" hidden={!technicalOpen} className={technicalOpen ? 'flex w-full flex-wrap gap-2 border-t border-slate-200 pt-2 lg:grid' : undefined}>
                        {technicalSections.map(({ id, label }) => renderEntry(id, t(label)))}
                    </div>
                </nav>
                <div className="min-w-0">
                    {mainSection === 'integrations' && <IntegrationsSubTab {...props} />}
                    {mainSection === 'accounts' && <AccountsSubTab state={state} setState={props.setState} t={t} />}
                    {mainSection === 'views' && <ViewsSubTab onBack={() => navigateSection('integrations')} t={t} />}
                    {mainSection === 'traffic' && <TrafficSubTab onBack={() => navigateSection('integrations')} t={t} />}
                    {mainSection === 'persistence' && (
                        <BackupSyncPanel
                            exportBackupJson={props.exportBackupJson}
                            restoreBackupJson={props.restoreBackupJson}
                            mergeBackupJson={props.mergeBackupJson}
                            exportFullDatabaseBackup={props.exportFullDatabaseBackupJson}
                            restoreFullDatabaseBackup={props.restoreFullDatabaseBackupJson}
                        />
                    )}
                    {mainSection === 'sync' && <DbSyncPanel state={state} setState={props.setState} />}
                    {mainSection === 'migration' && (
                        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                            <h3 className="font-black text-slate-900">{t('db_migration_first_setup')}</h3>
                            <p className="text-sm text-slate-600">{t('db_migration_full_path')}</p>
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <input type="checkbox" checked={forceOverwrite} onChange={event => setForceOverwrite(event.target.checked)} />
                                {t('db_force_overwrite')}
                            </label>
                            <DbMigrationWizard state={state} forceOverwrite={forceOverwrite} />
                        </section>
                    )}
                    {mainSection === 'fanta' && <IntegrationsFantaCleanup {...props} />}
                </div>
            </div>
        </div>
    );
};
