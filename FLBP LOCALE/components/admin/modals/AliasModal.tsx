import React from 'react';

export type AliasConflict = {
    id: string;
    sourceKey: string;
    sourceName: string;
    sourceYoB: string;
    candidates: { key: string; label: string }[];
    action: 'separate' | 'merge';
    targetKey?: string;
};

interface AliasModalProps {
    title?: string;
    conflicts: AliasConflict[];
    setConflicts: React.Dispatch<React.SetStateAction<AliasConflict[]>>;
    onClose: () => void;
    onConfirm: () => void;
    t?: (key: string) => string;
}

export const AliasModal: React.FC<AliasModalProps> = ({ title, conflicts, setConflicts, onClose, onConfirm, t }) => {
    const hasInvalidMerge = (conflicts || []).some(c => c.action === 'merge' && !c.targetKey);
    const tt = (key: string, fallback: string) => t?.(key) || fallback;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center justify-between">
                    <span>{title || tt('possible_homonyms_birthdate', 'Possible homonyms (different birth date)')}</span>
                    <button
                        onClick={onClose}
                        className="px-3 py-2 rounded-lg font-black bg-white/10 hover:bg-white/20 text-xs"
                    >
                        {tt('close', 'Close')}
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="text-sm font-bold text-slate-700">
                        {tt('alias_modal_birthdate_desc', 'The same name is already present with a different birth date.')} <span className="font-black">{tt('option_a', 'Option A')}:</span> {tt('alias_modal_nd_desc', 'ND is treated like any other value.')}
                    </div>

                    {conflicts.map((c) => (
                        <div key={c.id} className="border border-slate-200 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{c.sourceName} <span className="text-slate-500">({c.sourceYoB})</span></div>
                                    <div className="text-[11px] font-mono text-slate-500 whitespace-normal break-all leading-tight">{c.sourceKey}</div>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                                <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                                    <input
                                        type="radio"
                                        checked={c.action === 'separate'}
                                        onChange={() => setConflicts(prev => prev.map(x => x.id === c.id ? ({ ...x, action: 'separate', targetKey: undefined }) : x))}
                                    />
                                    {tt('keep_separate', 'Keep separate')}
                                </label>

                                <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                                    <input
                                        type="radio"
                                        checked={c.action === 'merge'}
                                        onChange={() => setConflicts(prev => prev.map(x => x.id === c.id ? ({ ...x, action: 'merge' }) : x))}
                                    />
                                    {tt('merge_into', 'Merge into')}
                                </label>

                                <select
                                    value={c.targetKey || ''}
                                    onChange={(e) => setConflicts(prev => prev.map(x => x.id === c.id ? ({ ...x, action: 'merge', targetKey: e.target.value || undefined }) : x))}
                                    disabled={c.action !== 'merge'}
                                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 font-bold ${c.action !== 'merge' ? 'bg-slate-100 text-slate-400' : ''}`}
                                >
                                    <option value="">{tt('select_profile', 'Select profile…')}</option>
                                    {c.candidates.map(opt => (
                                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-3 text-[11px] font-bold text-slate-500">
                                {tt('alias_merge_note', 'If you choose merge, points/statistics are summed in the overall leaderboard, while original records remain separate in the data.')}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-slate-50 px-4 py-3 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50"
                    >
                        {tt('referees_add_cancel', 'Cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={hasInvalidMerge}
                        className={`px-4 py-2 rounded-lg font-black text-white ${hasInvalidMerge ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800'}`}
                    >
                        {tt('confirm', 'Confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};
