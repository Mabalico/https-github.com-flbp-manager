import React from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { getFantaHistoryEditionDetail } from '../../services/fantabeerpong/mockData';
import { MetricCard, panelClass } from './_shared';

interface Props { editionId: string; onBack: () => void; }

export const FantaHistoryEditionDetail: React.FC<Props> = ({ editionId, onBack }) => {
  const data = getFantaHistoryEditionDetail(editionId);
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700"><Trophy className="h-3.5 w-3.5" />Dettaglio edizione storica</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.editionLabel}</h1>
            <div className="mt-1 text-sm font-bold text-slate-600">{data.seasonLabel}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.intro}</div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.summaryCards.map((card) => <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} />)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">Highlights edizione</div>
          <div className="mt-4 space-y-3">{data.highlights.map((item) => <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">{item}</div>)}</div>
        </div>
        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">Podio</div>
          <div className="mt-4 space-y-3">{data.podium.map((row) => <div key={row.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-center justify-between gap-3"><div><div className="text-base font-black text-slate-950">{row.rankLabel} · {row.teamName}</div><div className="mt-1 text-sm font-bold text-slate-600">{row.ownerLabel}</div></div><div className="text-lg font-black text-slate-950">{row.pointsLabel}</div></div></div>)}</div>
        </div>
      </div>
    </div>
  );
};
