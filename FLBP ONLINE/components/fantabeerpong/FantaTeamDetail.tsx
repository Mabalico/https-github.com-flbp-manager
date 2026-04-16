import React from 'react';
import { ArrowLeft, Shield, Target, Wind, Trophy, Zap } from 'lucide-react';
import { getFantaTeamDetail } from '../../services/fantabeerpong/mockData';
import { MetricCard, panelClass } from './_shared';

interface Props { teamId: string; onBack: () => void; onOpenPlayerDetail?: (playerId: string) => void; }

export const FantaTeamDetail: React.FC<Props> = ({ teamId, onBack, onOpenPlayerDetail }) => {
  const data = getFantaTeamDetail(teamId);
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />Dettaglio squadra fantasy</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{data.teamName}</h1>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.note}</div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.summaryCards.map((card) => <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} />)}</div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Breakdown Punteggi</div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Target className="h-3 w-3" />Canestri</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.goals}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Wind className="h-3 w-3" />Soffi</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.blows}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Trophy className="h-3 w-3" />Vittorie</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.wins}</div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-600"><Zap className="h-3 w-3" />Bonus Scia</div>
            <div className="mt-1 text-2xl font-black text-indigo-700">{data.pointsBreakdown.bonusScia}</div>
          </div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Rosa fantasy</div>
        <div className="mt-6 space-y-4">
          {data.lineup.map((row) => (
            <button key={row.id} type="button" onClick={() => onOpenPlayerDetail?.(row.playerId)} className="group w-full rounded-[26px] border border-slate-200 bg-slate-50 p-1 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-xl">
              <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-black tracking-tight text-slate-950 group-hover:text-beer-700 transition-colors">{row.playerName}</div>
                  <div className="mt-0.5 text-sm font-bold text-slate-500 uppercase tracking-tight">{row.realTeamName} · {row.roleLabel}</div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                    <div className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{row.goals} <span className="text-slate-400 font-bold uppercase tracking-tighter">G</span></span></div>
                    <div className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{row.blows} <span className="text-slate-400 font-bold uppercase tracking-tighter">S</span></span></div>
                    <div className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{row.wins} <span className="text-slate-400 font-bold uppercase tracking-tighter">W</span></span></div>
                    <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-indigo-500" /><span className="text-xs font-black text-indigo-700">{row.bonusScia} <span className="text-indigo-400 font-bold uppercase tracking-tighter">B</span></span></div>
                  </div>
                </div>
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm group-hover:border-beer-200 group-hover:bg-beer-50/30 transition-colors">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Punti</div>
                  <div className="mt-1 text-3xl font-black tracking-tighter text-slate-950">{row.fantasyPoints}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
