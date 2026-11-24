import React from 'react';
import { ClipboardList, MoreHorizontal, Printer, Search } from 'lucide-react';
import type { CodesStatusFilter } from './tabs/CodesTab';

export type LiveMatchesView = 'codes' | 'monitor_groups' | 'monitor_bracket' | 'reports';

interface Props {
    view: LiveMatchesView;
    showGroups: boolean;
    showBracket: boolean;
    query: string;
    status: CodesStatusFilter;
    setQuery: (value: string) => void;
    setStatus: (value: CodesStatusFilter) => void;
    selectView: (view: LiveMatchesView) => void;
    printCodes: () => void;
    t: (key: string) => string;
}

const statuses = [
    ['all', 'admin_matches_all'],
    ['scheduled', 'match_status_scheduled'],
    ['playing', 'match_status_playing'],
    ['finished', 'match_status_finished_plural'],
] as const;

export const LiveMatchesToolbar: React.FC<Props> = ({ view, showGroups, showBracket, query, status, setQuery, setStatus, selectView, printCodes, t }) => {
    const views: { view: LiveMatchesView; label: string }[] = [
        { view: 'codes', label: 'admin_matches_list' },
        ...(showGroups ? [{ view: 'monitor_groups' as const, label: 'groups_label' }] : []),
        ...(showBracket ? [{ view: 'monitor_bracket' as const, label: 'bracket_word' }] : []),
    ];
    const buttonClass = (selected: boolean) => `inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'}`;

    return (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label={t('matches_label')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-black text-slate-950">{t('matches_label')}</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={buttonClass(view === 'reports')} aria-pressed={view === 'reports'} onClick={() => selectView('reports')}>
                        <ClipboardList className="h-4 w-4" aria-hidden="true" />{t('admin_matches_enter_report')}
                    </button>
                    <details className="relative">
                        <summary aria-label={t('admin_tools')} className={buttonClass(false) + ' cursor-pointer list-none [&::-webkit-details-marker]:hidden'}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </summary>
                        <div className="absolute end-0 z-10 mt-1 min-w-max rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                            <button type="button" className={buttonClass(false)} onClick={event => {
                                event.currentTarget.closest('details')?.removeAttribute('open');
                                printCodes();
                            }}><Printer className="h-4 w-4" aria-hidden="true" />{t('print_code_list')}</button>
                        </div>
                    </details>
                </div>
            </div>
            {view !== 'reports' && (
                <div className="space-y-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('codes_search_aria')} placeholder={t('codes_search_placeholder')} className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white ps-9 pe-3 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" />
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('admin_matches_status')}>
                            {statuses.map(([id, label]) => <button key={id} type="button" className={buttonClass(status === id)} aria-pressed={status === id} onClick={() => setStatus(id)}>{t(label)}</button>)}
                        </div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('admin_matches_view')}>
                            {views.map(item => <button key={item.view} type="button" className={buttonClass(view === item.view)} aria-pressed={view === item.view} onClick={() => selectView(item.view)}>{t(item.label)}</button>)}
                        </div>
                    </div>
                </div>
            )}
            {view === 'reports' && <button type="button" className={buttonClass(false)} onClick={() => selectView('codes')}>{t('admin_matches_list')}</button>}
        </section>
    );
};
