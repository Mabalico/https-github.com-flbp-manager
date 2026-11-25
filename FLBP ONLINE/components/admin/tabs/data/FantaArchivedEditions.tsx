import React from 'react';
import { Trash2 } from 'lucide-react';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';
import type { FantaTournamentDataSummary } from '../../../../services/supabaseRest';

interface FantaArchivedEditionsProps {
    rows: FantaTournamentDataSummary[];
    busyId: string | null;
    formatDate: (value?: string | null) => string;
    onDelete: (row: FantaTournamentDataSummary) => void;
    t: (key: string) => string;
}

/** Fanta editions of archived tournaments: removing one leaves the tournament untouched. */
export const FantaArchivedEditions: React.FC<FantaArchivedEditionsProps> = ({ rows, busyId, formatDate, onDelete, t }) => {
    const [target, setTarget] = React.useState<FantaTournamentDataSummary | null>(null);
    const [acknowledged, setAcknowledged] = React.useState(false);
    const close = React.useCallback(() => setTarget(null), []);
    const names = (row: FantaTournamentDataSummary) => (row.sampleTeamNames || []).join(' · ');

    if (!rows.length) return null;
    return (
        <>
            <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-black text-slate-900">
                    {t('fanta_archived_title')} ({rows.length})
                </summary>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{t('fanta_archived_help')}</p>
                <ul className="mt-3 space-y-3">
                    {rows.map(row => (
                        <li key={row.tournamentId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <div className="break-words text-sm font-black text-slate-950">{row.tournamentName}</div>
                                <div className="mt-1 break-words text-xs font-bold text-slate-600">
                                    {formatDate(row.startDate)} · {t('teams')}: {Math.max(row.fantaTeams, row.archivedStandings)} · {t('players')}: {row.archivedPlayers}
                                </div>
                                {names(row) ? <div className="mt-1 break-words text-xs text-slate-600">{t('fanta_archived_names')}: {names(row)}</div> : null}
                            </div>
                            <button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => { setAcknowledged(false); setTarget(row); }}
                                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 font-black text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                {t('fanta_archived_delete')}
                            </button>
                        </li>
                    ))}
                </ul>
            </details>
            <AdminDataConfirmModal
                open={!!target}
                tone="danger"
                title={t('fanta_archived_confirm').replace('{name}', () => target?.tournamentName || '')}
                description={t('fanta_archived_confirm_text')}
                summaryItems={target ? [
                    { label: t('teams'), value: Math.max(target.fantaTeams, target.archivedStandings) },
                    { label: t('players'), value: target.archivedPlayers },
                    ...(names(target) ? [{ label: t('fanta_archived_names'), value: names(target) }] : []),
                ] : []}
                confirmLabel={t('archive_delete_confirm_label')}
                cancelLabel={t('cancel')}
                confirmDisabled={!acknowledged}
                onConfirm={() => { if (!target) return; onDelete(target); close(); }}
                onClose={close}
            >
                <label className="flex min-h-[44px] items-center gap-3 font-bold text-slate-900">
                    <input type="checkbox" className="h-5 w-5 shrink-0" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
                    {t('fanta_archived_ack')}
                </label>
            </AdminDataConfirmModal>
        </>
    );
};
