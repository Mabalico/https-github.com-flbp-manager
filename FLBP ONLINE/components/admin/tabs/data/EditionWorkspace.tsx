import React from 'react';
import { CalendarRange, Crosshair, Plus, Users } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import { EditionEditor } from './EditionEditor';
import { IntegrationsScorers } from './IntegrationsScorers';
import { IntegrationsAliases } from './IntegrationsAliases';
import { PlayersSubTab } from './PlayersSubTab';
import { IntegrationsFantaCleanup } from './IntegrationsFantaCleanup';
import { IntegrationsTournaments } from './IntegrationsTournaments';
import { ArchiveSubTab } from './ArchiveSubTab';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';

export const IntegrationsSubTab: React.FC<DataTabProps> = (props) => {
    const { integrationsSubTab, setIntegrationsSubTab, t } = props;
    const active = integrationsSubTab === 'hof' ? 'tournaments' : integrationsSubTab === 'aliases' ? 'players' : integrationsSubTab;
    const [editionId, setEditionId] = React.useState<string | undefined>();
    const [mode, setMode] = React.useState<'list' | 'editor' | 'archive'>('list');
    const [newEdition, setNewEdition] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [leave, setLeave] = React.useState<(() => void) | null>(null);
    const [feedback, setFeedback] = React.useState('');
    const navigate = (action: () => void) => { if (dirty) setLeave(() => action); else action(); };
    const open = (id?: string) => { setFeedback(''); setEditionId(id); setMode('editor'); setDirty(false); };
    const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 hover:bg-slate-50';
    const selectTab = (tab: DataTabProps['integrationsSubTab']) => navigate(() => {
        setIntegrationsSubTab(tab); setMode('list'); setDirty(false); setFeedback('');
        try { sessionStorage.setItem('flbp_admin_integrations_subtab', tab); } catch {}
    });
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-slate-50 p-3">
            <nav className="flex flex-wrap gap-2" aria-label={t('integrations_toolbar')}>
                {([{ key: 'tournaments', label: 'edition_list', icon: CalendarRange }, { key: 'scorers', label: 'scorers_label', icon: Crosshair }, { key: 'players', label: 'players', icon: Users }] as const).map(tab => <button type="button" key={tab.key} aria-current={active === tab.key ? 'page' : undefined} className={`${button} ${active === tab.key ? '!bg-slate-900 !text-white' : ''}`} onClick={() => selectTab(tab.key)}><tab.icon size={16} />{t(tab.label)}</button>)}
            </nav>
            <button type="button" className="rounded-lg px-2 py-2 text-xs font-bold text-slate-600 hover:underline" onClick={() => selectTab('fanta')}>{t('edition_fanta_maintenance')}</button>
        </div>
        {feedback && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{feedback}</p>}
        {active === 'tournaments' && <>
            {mode === 'list' && <>
                <button type="button" className={`${button} !bg-blue-700 !text-white`} onClick={() => setNewEdition(true)}><Plus size={16} />{t('edition_new')}</button>
                <IntegrationsTournaments {...props} onOpen={id => open(id)} />
            </>}
            {mode === 'editor' && <>
                {!!editionId && props.state.tournamentHistory?.some(row => row.id === editionId) && <button type="button" className={button} onClick={() => navigate(() => { props.setDataSelectedTournamentId(editionId); setMode('archive'); setDirty(false); })}>{t('edition_results')}</button>}
                <EditionEditor key={editionId || 'new'} state={props.state} setState={props.setState} t={t} editionId={editionId} onDirtyChange={setDirty}
                    onBack={() => navigate(() => { setMode('list'); setDirty(false); })}
                    onSaved={id => { setDirty(false); setMode('list'); setEditionId(id); setFeedback(t('record_updated')); }} />
            </>}
            {mode === 'archive' && <>
                <button type="button" className={button} onClick={() => { props.resetCreateArchiveWizard(); setMode('list'); }}>{t('edition_list')}</button>
                <ArchiveSubTab {...props} onEditAwards={id => open(id)} />
            </>}
        </>}
        {active === 'scorers' && <IntegrationsScorers {...props} />}
        {active === 'players' && <><PlayersSubTab {...props} /><details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">{t('edition_merge_profiles')}</summary><div className="pt-4"><IntegrationsAliases {...props} /></div></details></>}
        {active === 'fanta' && <IntegrationsFantaCleanup {...props} />}
        <AdminDataConfirmModal open={newEdition} tone="info" title={t('edition_new')} description={t('edition_choose_kind')} confirmLabel={t('edition_titles_only')} cancelLabel={t('cancel')} onClose={() => setNewEdition(false)} onConfirm={() => { setNewEdition(false); setFeedback(''); open(); }}>
            <button type="button" className={`${button} w-full`} onClick={() => { setNewEdition(false); setMode('archive'); props.openCreateArchiveWizard(); }}>{t('edition_complete')}</button>
            <p className="mt-2 text-sm text-slate-600">{t('edition_complete_hint')}</p>
        </AdminDataConfirmModal>
        <AdminDataConfirmModal open={!!leave} tone="warning" title={t('edition_unsaved')} description={t('edition_unsaved_hint')} confirmLabel={t('edition_discard')} cancelLabel={t('cancel')} onClose={() => setLeave(null)} onConfirm={() => { const action = leave; setLeave(null); setDirty(false); action?.(); }} />
    </div>;
};
