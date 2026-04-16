import React from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import { getFantaPlayerDetail } from '../../services/fantabeerpong/mockData';
import { MetricCard, panelClass } from './_shared';

interface Props { playerId: string; onBack: () => void; onOpenMyTeam?: () => void; }

export const FantaPlayerDetail: React.FC<Props> = ({ playerId, onBack, onOpenMyTeam }) => {
  const data = getFantaPlayerDetail(playerId);
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700"><UserRound className="h-3.5 w-3.5" />Dettaglio giocatore fantasy</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.playerName}</h1>
            <div className="mt-1 text-sm font-bold text-slate-600">{data.realTeamName} · {data.roleLabel} · {data.availabilityLabel}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.note}</div>
          </div>
          <div className="flex gap-2">
            {onOpenMyTeam && <button type="button" onClick={onOpenMyTeam} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">La mia squadra</button>}
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back</button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.summaryCards.map((card) => <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} />)}</div>
      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Breakdown contributi</div>
        <div className="mt-4 space-y-3">
          {data.contributionRows.map((row) => (
            <div key={row.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-black text-slate-950">{row.label}</div><div className="mt-1 text-sm font-semibold leading-6 text-slate-600">{row.helper}</div></div>
                <div className="text-2xl font-black text-slate-950">{row.valueLabel}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
