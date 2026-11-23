import React from 'react';
import { reportTieState } from '../../services/reportEntry';

export const ReportScoreCards = ({ scores, tieMessage }: {
    scores: { id: string; name: string; score: number }[];
    tieMessage: string;
}) => {
    const { tied, leaderIndex } = reportTieState(scores.map(team => team.score));
    const multi = scores.length > 2;
    return (
        <div className="space-y-2">
            <div className={multi ? 'grid gap-2' : 'grid grid-cols-2 gap-2'}>
                {scores.map(({ id, name, score }, index) => (
                    <div key={id} className={`min-w-0 rounded-xl border p-3 ${multi ? 'flex items-center justify-between gap-3' : 'text-center'} ${index === leaderIndex ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="break-words text-sm font-bold text-slate-800">{name}</div>
                        <div className={multi ? 'text-2xl font-black' : 'mt-1 text-4xl font-black'}>{score}</div>
                    </div>
                ))}
            </div>
            {tied && <p role="status" className="text-sm font-bold text-red-700">{tieMessage}</p>}
        </div>
    );
};

export const useReportSaveFeedback = (closeLabel: string) => {
    const [message, show] = React.useState('');
    React.useEffect(() => {
        if (!message) return;
        const timer = window.setTimeout(() => show(''), 4000);
        return () => window.clearTimeout(timer);
    }, [message]);
    const notice = message ? (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
            <span>{message}</span>
            <button type="button" onClick={() => show('')} aria-label={closeLabel} className="rounded-lg border border-emerald-300 px-3 py-1">×</button>
        </div>
    ) : null;
    return { show, notice };
};
