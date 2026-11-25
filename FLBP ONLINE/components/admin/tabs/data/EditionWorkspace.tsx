import React from 'react';
import { CalendarRange, Crosshair, Users } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import { EditionEditor } from './EditionEditor';
import { IntegrationsScorers } from './IntegrationsScorers';
import { IntegrationsAliases } from './IntegrationsAliases';
import { PlayersSubTab } from './PlayersSubTab';
import { listEditions } from '../../../../services/editionData';
import type { PlayerProfileSnapshot } from '../../../../types';
import { buildPlayerProfileSnapshots } from '../../../../services/playerDataProvenance';
import { IntegrationsTournaments } from './IntegrationsTournaments';
import { ArchiveSubTab } from './ArchiveSubTab';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';
import { useEditionNavigationGuard } from './useEditionNavigationGuard';
import { requestDraftNavigation } from '../../../../services/draftNavigationGuard';

export const IntegrationsSubTab: React.FC<DataTabProps> = (props) => {
    const { integrationsSubTab, setIntegrationsSubTab, t } = props;
    const active = integrationsSubTab === 'hof' || integrationsSubTab === 'fanta' ? 'tournaments' : integrationsSubTab === 'aliases' ? 'players' : integrationsSubTab;
    const [editionId, setEditionId] = React.useState<string | undefined>();
    const [mode, setMode] = React.useState<'list' | 'editor' | 'archive'>('list');
    const [newEdition, setNewEdition] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [importing, setImporting] = React.useState(false);
    const leave = useEditionNavigationGuard(dirty, saving || importing);
    const [feedback, setFeedback] = React.useState('');
    const [showAliases, setShowAliases] = React.useState(false);
    const [aliasTarget, setAliasTarget] = React.useState<PlayerProfileSnapshot>();
    const editions = React.useMemo(() => listEditions(props.state).filter(edition => !edition.live), [props.state]);
    const profiles = React.useMemo(() => buildPlayerProfileSnapshots(props.state), [props.state]);
    const extraStatsCount = (props.state.integrationsScorers || []).filter(entry => !entry.sourceTournamentId).length;
    const aliasCount = Object.keys(props.state.playerAliases || {}).length;
    const navigate = (action: () => void) => { void requestDraftNavigation(action); };
    const open = (id?: string) => { setFeedback(''); setEditionId(id); setMode('editor'); setDirty(false); };
    const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 hover:bg-slate-50';
    const selectTab = (tab: DataTabProps['integrationsSubTab']) => navigate(() => {
        setIntegrationsSubTab(tab); setMode('list'); setDirty(false); setFeedback(''); setShowAliases(false); setAliasTarget(undefined);
        try { sessionStorage.setItem('flbp_admin_integrations_subtab', tab); } catch {}
    });
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-slate-50 p-3">
            <nav className="flex flex-wrap gap-2" aria-label={t('integrations_toolbar')}>
                {([{ key: 'tournaments', label: 'edition_list', icon: CalendarRange, count: editions.length }, { key: 'players', label: 'players', icon: Users, count: profiles.length }, { key: 'scorers', label: 'edition_extra_stats', icon: Crosshair, count: extraStatsCount }] as const).map(tab => <button type="button" key={tab.key} disabled={saving} aria-current={active === tab.key ? 'page' : undefined} className={`${button} ${active === tab.key ? '!bg-slate-900 !text-white' : ''}`} onClick={() => selectTab(tab.key)}><tab.icon size={16} />{t(tab.label)} ({tab.count})</button>)}
            </nav>
        </div>
        {feedback && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{feedback}</p>}
        {active === 'tournaments' && <>
            {mode === 'list' && <IntegrationsTournaments {...props} onOpen={id => open(id)} onAdd={() => setNewEdition(true)} />}
            {mode === 'editor' && <>
                {!!editionId && props.state.tournamentHistory?.some(row => row.id === editionId) && <button type="button" disabled={saving} className={button} onClick={() => navigate(() => { props.setDataSelectedTournamentId(editionId); setMode('archive'); setDirty(false); })}>{t('edition_results')}</button>}
                <EditionEditor key={editionId || 'new'} state={props.state} setState={props.setState} commitAdminStateDurably={props.commitAdminStateDurably} t={t} editionId={editionId} onDirtyChange={setDirty} onSavingChange={setSaving} onImportingChange={setImporting}
                    onBack={() => navigate(() => { setMode('list'); setDirty(false); })}
                    onSaved={id => { setDirty(false); setMode('list'); setEditionId(id); setFeedback(t('record_updated')); }} />
            </>}
            {mode === 'archive' && <>
                <button type="button" className={button} onClick={() => { props.resetCreateArchiveWizard(); setMode('list'); }}>{t('edition_list')}</button>
                <ArchiveSubTab {...props} onEditAwards={id => open(id)} />
            </>}
        </>}
        {active === 'scorers' && <IntegrationsScorers {...props} />}
        {active === 'players' && <>
            <div className={showAliases ? 'hidden' : undefined}>
                <PlayersSubTab {...props} profiles={profiles}
                    aliasesLink={<button type="button" className={button} onClick={() => setShowAliases(true)}>{t('edition_all_aliases').replace('{count}', String(aliasCount))}</button>}
                    onLinkName={player => { setAliasTarget(player); setShowAliases(true); }}
                    onOpenEdition={id => navigate(() => { setIntegrationsSubTab('tournaments'); open(id); })} />
            </div>
            {showAliases && <div className="space-y-4">
                <button type="button" className={button} onClick={() => setShowAliases(false)}>← {t('players')}</button>
                <IntegrationsAliases {...props} targetPlayer={aliasTarget} profiles={profiles} />
            </div>}
        </>}
        <AdminDataConfirmModal open={newEdition} tone="info" title={t('edition_new')} description={t('edition_choose_kind')} confirmLabel={t('edition_titles_only')} cancelLabel={t('cancel')} onClose={() => setNewEdition(false)} onConfirm={() => { setNewEdition(false); setFeedback(''); open(); }}>
            <button type="button" className={`${button} w-full`} onClick={() => { setNewEdition(false); setMode('archive'); props.openCreateArchiveWizard(); }}>{t('edition_complete')}</button>
            <p className="mt-2 text-sm text-slate-600">{t('edition_complete_hint')}</p>
        </AdminDataConfirmModal>
        <AdminDataConfirmModal open={leave.open} tone="warning" title={t('edition_unsaved')} description={t('edition_unsaved_hint')} confirmLabel={t('edition_discard')} cancelLabel={t('cancel')} confirmDisabled={saving || importing} onClose={leave.cancel} onConfirm={leave.discard} />
    </div>;
};
