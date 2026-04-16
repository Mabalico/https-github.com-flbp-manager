import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { getFantaTeamDetail } from '../../services/fantabeerpong/mockData';
import { MetricCard, panelClass } from './_shared';

interface Props { teamId: string; onBack: () => void; onOpenPlayerDetail?: (playerId: string) => void; }

export const FantaTeamDetail: React.FC<Props> = ({ teamId, onBack, onOpenPlayerDetail }) => {
  const data = getFantaTeamDetail(teamId);
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />Dettaglio squadra fantasy</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.teamName}</h1>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.note}</div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.summaryCards.map((card) => <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} />)}</div>
      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Lineup fantasy</div>
        <div className="mt-4 space-y-3">
          {data.lineup.map((row) => (
            <button key={row.id} type="button" onClick={() => onOpenPlayerDetail?.(row.playerId)} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-base font-black text-slate-950">{row.playerName}</div><div className="mt-1 text-sm font-bold text-slate-600">{row.realTeamName} · {row.roleLabel}</div><div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{row.note}</div></div>
                <div className="text-right"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Fantasy</div><div className="mt-1 text-2xl font-black text-slate-950">{row.fantasyPoints}</div></div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
