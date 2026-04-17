import React from 'react';
import { Star } from 'lucide-react';

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
    t,
}) => {
    const tt = (key: string, fallback: string) => t?.(key) || fallback;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-300" aria-hidden />
                        {forArchive ? tt('mvp_before_archive', 'MVP (before archiving)') : 'MVP'}
                    </span>
                    <button
                        onClick={onClose}
                        className="px-3 py-2 rounded-lg font-black bg-white/10 hover:bg-white/20 text-xs"
                    >
                        {tt('close', 'Close')}
                    </button>
                </div>

                <div className="p-4 space-y-4">
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
                </div>

                <div className="bg-slate-50 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-bold text-slate-500">
                        {tt('mvp_later_hint', 'If you do not set the MVP now, you can do it later from Data Management → Integrations.')}
                    </div>

                    <div className="flex items-center gap-2">
                        {forArchive && (
                            <button
                                onClick={onArchiveWithoutMvp}
                                className="px-4 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50"
                            >
                                {tt('archive_without_mvp', 'Archive without MVP')}
                            </button>
                        )}

                        <button
                            onClick={onSave}
                            className="px-4 py-2 rounded-lg font-black text-white bg-orange-600 hover:bg-orange-700"
                        >
                            {saveLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
