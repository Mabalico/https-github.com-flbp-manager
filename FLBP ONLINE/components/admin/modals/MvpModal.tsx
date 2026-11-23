import React from 'react';
import { Star } from 'lucide-react';
import type { HallOfFameEntry } from '../../../types';

export type MvpPlayerOption = { id: string; name: string; label: string };

interface MvpModalProps {
    forArchive: boolean;
    allPlayers: MvpPlayerOption[];
    search: string;
    setSearch: (v: string) => void;
    selectedIds: string[];
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
    searchPlaceholder: string;
    onClose: () => void;
    onArchiveWithoutMvp?: () => void;
    onSave: () => void;
    saveLabel: string;
    assignU25Awards?: boolean;
    setAssignU25Awards?: (value: boolean) => void;
    archive?: {
        awards: HallOfFameEntry[];
        pendingFinalMatches?: string[];
        committed: boolean;
        busy: boolean;
        done: boolean;
        error: string;
        email?: { href: string; text: string } | null;
    };
    t?: (key: string) => string;
}

export const MvpModal: React.FC<MvpModalProps> = ({
    forArchive,
    allPlayers,
    search,
    setSearch,
    selectedIds,
    setSelectedIds,
    searchPlaceholder,
    onClose,
    onArchiveWithoutMvp,
    onSave,
    saveLabel,
    assignU25Awards,
    setAssignU25Awards,
    archive,
    t,
}) => {
    const [copyFeedback, setCopyFeedback] = React.useState('');
    const tt = (key: string, fallback: string) => t?.(key) || fallback;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="archive-mvp-title" className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto bg-white rounded-2xl shadow-xl">
                <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center justify-between">
                    <span id="archive-mvp-title" className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-300" aria-hidden />
                        {forArchive ? tt('mvp_before_archive', 'MVP (before archiving)') : 'MVP'}
                    </span>
                    <button
                        type="button"
                        disabled={archive?.busy}
                        onClick={onClose}
                        className="px-3 py-2 rounded-lg font-black bg-white/10 hover:bg-white/20 text-xs"
                    >
                        {tt('close', 'Close')}
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {archive && (
                        <section aria-label={tt('archive_awards_summary', 'Awards summary')} className="rounded-xl border border-slate-200 p-3">
                            <h3 className="mb-2 font-black">{tt('archive_awards_summary', 'Awards summary')}</h3>
                            {!!archive.pendingFinalMatches?.length && (
                                <p role="status" className="mb-3 rounded-lg bg-amber-50 p-2 text-sm font-bold text-amber-900">
                                    {tt('archive_final_group_pending', 'Final group matches still to play')} · {archive.pendingFinalMatches.join(', ')}
                                </p>
                            )}
                            {archive.awards.length ? (
                                <dl className="space-y-1 text-sm">
                                    {archive.awards.map(award => (
                                        <div key={award.id} className="flex flex-wrap justify-between gap-x-3">
                                            <dt className="font-bold">{tt('edition_award_' + award.type, award.type)}</dt>
                                            <dd>{award.type === 'winner' ? award.teamName : award.playerNames?.join(', ') || award.teamName}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : <p className="text-sm text-slate-500">{tt('archive_no_awards', 'No awards')}</p>}
                        </section>
                    )}
                    {archive?.busy && <p role="status">{tt('admin_syncing', 'Saving…')}</p>}
                    {archive?.error && (
                        <div role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">
                            <p className="font-bold">{tt('data_db_sync_error_title', 'Synchronization error')}</p>
                            <p className="break-words text-sm">{archive.error}</p>
                        </div>
                    )}
                    {archive?.done && <p role="status" className="font-bold text-emerald-800">{tt('alert_tournament_ended', 'Tournament archived')}</p>}
                    {archive?.email && (
                        <div className="rounded-xl border border-slate-200 p-3">
                            <textarea readOnly value={archive.email.text} aria-label={tt('referees_counter_title', 'Referee summary')} className="w-full rounded-lg border p-2 text-sm" />
                            <div className="mt-2 flex flex-wrap gap-2">
                                <a href={archive.email.href} className="rounded-lg border px-3 py-2 font-bold">{tt('archive_email', 'Prepare referee summary email')}</a>
                                <button type="button" className="rounded-lg border px-3 py-2 font-bold" onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(archive.email!.text);
                                        setCopyFeedback(tt('archive_copied', 'Text copied'));
                                    } catch {
                                        setCopyFeedback(tt('archive_copy_failed', 'Select and copy the text manually.'));
                                    }
                                }}>{tt('archive_copy', 'Copy text')}</button>
                            </div>
                            {copyFeedback && <p role="status" className="mt-2 text-sm">{copyFeedback}</p>}
                        </div>
                    )}

                    {!archive?.committed && (
                    <fieldset disabled={archive?.busy} className="space-y-4">
                    <div className="text-sm font-bold text-slate-700">
                        {tt('mvp_select_desc_prefix', 'Select the MVP')} {tt('mvp_select_desc_suffix', '(or co-MVPs). You can select')} <span className="font-black">{tt('multiple_players', 'multiple players')}</span>.
                    </div>

                    {forArchive && setAssignU25Awards ? (
                        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <input
                                type="checkbox"
                                checked={assignU25Awards !== false}
                                onChange={(e) => setAssignU25Awards(e.target.checked)}
                                className="mt-1"
                            />
                            <div>
                                <div className="text-sm font-black text-slate-900">{tt('assign_under25_awards', 'Assign Under 25 awards too')}</div>
                                <div className="text-xs font-semibold text-slate-500">
                                    {tt('assign_under25_awards_desc', 'This choice is saved in the archived tournament and also controls Hall of Fame and derived leaderboards.')}
                                </div>
                            </div>
                        </label>
                    ) : null}

                    <div className="flex items-center gap-2">
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 font-bold"
                        />
                        <button
                            onClick={() => setSelectedIds([])}
                            className="px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm"
                        >
                            {tt('clear_selection', 'Clear')}
                        </button>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="max-h-[360px] overflow-auto divide-y divide-slate-100">
                            {allPlayers
                                .filter(p => {
                                    const q = (search || '').trim().toLowerCase();
                                    if (!q) return true;
                                    return (p.label || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q);
                                })
                                .sort((a, b) => a.label.localeCompare(b.label, 'it', { sensitivity: 'base' }))
                                .map(p => {
                                    const checked = selectedIds.includes(p.id);
                                    return (
                                        <label key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    setSelectedIds(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(p.id)) next.delete(p.id);
                                                        else next.add(p.id);
                                                        return Array.from(next);
                                                    });
                                                }}
                                            />
                                            <div className="font-black text-slate-800">{p.label}</div>
                                        </label>
                                    );
                                })}
                            {allPlayers.length === 0 && (
                                <div className="p-8 text-center text-slate-400 font-bold">
                                    {tt('no_players_available', 'No players available.')}
                                </div>
                            )}
                        </div>
                    </div>
                    </fieldset>
                    )}
                </div>

                {!archive?.done && <div className="bg-slate-50 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-bold text-slate-500">
                        {tt('mvp_later_hint', 'If you do not set the MVP now, you can do it later from Data Management → Integrations.')}
                    </div>

                    <div className="flex items-center gap-2">
                        {forArchive && !archive?.committed && (
                            <button
                                type="button"
                                disabled={archive?.busy}
                                onClick={onArchiveWithoutMvp}
                                className="px-4 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50"
                            >
                                {tt('archive_without_mvp', 'Archive without MVP')}
                            </button>
                        )}

                        <button
                            type="button"
                            disabled={archive?.busy}
                            onClick={onSave}
                            className="px-4 py-2 rounded-lg font-black text-white bg-orange-600 hover:bg-orange-700"
                        >
                            {archive?.committed ? tt('archive_retry', 'Retry publication') : saveLabel}
                        </button>
                    </div>
                </div>}
            </div>
        </div>
    );
};
