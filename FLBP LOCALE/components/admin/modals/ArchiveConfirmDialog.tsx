import React from 'react';
import type { Match } from '../../../types';
import { AdminDataConfirmModal } from '../tabs/data/AdminDataConfirmModal';

interface ArchiveConfirmDialogProps {
    open: boolean;
    tournamentName: string;
    champion?: string;
    mvpNames: string[];
    unplayed: Match[];
    onConfirm: () => void;
    onClose: () => void;
    t: (key: string) => string;
}

const MAX_LISTED_CODES = 10;

/** Last step before an archive: an incomplete tournament needs an explicit acknowledgement. */
export const ArchiveConfirmDialog: React.FC<ArchiveConfirmDialogProps> = ({
    open,
    tournamentName,
    champion,
    mvpNames,
    unplayed,
    onConfirm,
    onClose,
    t,
}) => {
    const incomplete = unplayed.length > 0 || !champion;
    const [acknowledged, setAcknowledged] = React.useState(false);
    // A report saved elsewhere while the dialog is open changes what is being accepted.
    React.useEffect(() => setAcknowledged(false), [open, unplayed.length, champion]);
    const codes = unplayed.slice(0, MAX_LISTED_CODES).map(match => match.code || match.id);

    return (
        <AdminDataConfirmModal
            open={open}
            tone={incomplete ? 'danger' : 'info'}
            title={t('archive_confirm_title').replace('{name}', () => tournamentName)}
            description={t('archive_confirm_hint')}
            confirmLabel={t('complete_tournament')}
            cancelLabel={t('cancel')}
            confirmDisabled={incomplete && !acknowledged}
            onConfirm={onConfirm}
            onClose={onClose}
        >
            <dl className="space-y-1">
                <div className="flex flex-wrap justify-between gap-x-3">
                    <dt>{t('edition_award_winner')}</dt>
                    <dd className="min-w-0 break-words font-bold text-slate-950">{champion || '—'}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3">
                    <dt>{t('edition_award_mvp')}</dt>
                    <dd className="min-w-0 break-words font-bold text-slate-950">{mvpNames.join(', ') || '—'}</dd>
                </div>
            </dl>
            {incomplete && (
                <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
                    {unplayed.length > 0 && (
                        <p className="font-bold">
                            {t('admin_closing_unplayed')}: {unplayed.length}
                            <span className="block break-words font-mono text-xs">
                                {codes.join(' · ')}{unplayed.length > codes.length && ` · +${unplayed.length - codes.length}`}
                            </span>
                        </p>
                    )}
                    {!champion && <p className="font-bold">{t('archive_confirm_no_winner')}</p>}
                    <label className="flex items-start gap-2 font-bold">
                        <input type="checkbox" className="mt-1" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
                        <span>{t('archive_confirm_anyway')}</span>
                    </label>
                </div>
            )}
        </AdminDataConfirmModal>
    );
};
