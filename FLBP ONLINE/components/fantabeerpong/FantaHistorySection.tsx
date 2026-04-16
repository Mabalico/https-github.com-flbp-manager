import React from 'react';
import { ArrowRight, History, Trophy } from 'lucide-react';
import { FANTA_HISTORY_MOCK } from '../../services/fantabeerpong/mockData';
import { panelClass } from './_shared';

interface Props { onOpenRules: () => void; onOpenStandings: () => void; onOpenEditionDetail?: (editionId: string) => void; }

export const FantaHistorySection: React.FC<Props> = ({ onOpenRules, onOpenStandings, onOpenEditionDetail }) => {
  const data = FANTA_HISTORY_MOCK;
  const featuredEdition = data.editions.find((row) => row.id === data.featuredEditionId) || data.editions[0];
  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><History className="h-3.5 w-3.5" />Storico FantaBeerpong</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.title}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.intro}</div>
          </div>
          <button type="button" onClick={onOpenStandings} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600"><Trophy className="h-4 w-4" />Torna alla classifica</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Edizioni</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{data.totalEditionsLabel}</div></div>
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Best score</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{data.bestScoreLabel}</div></div>
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Campione in carica</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{data.reigningChampionLabel}</div></div>
      </div>

      <div className={panelClass}>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700"><Trophy className="h-3.5 w-3.5" />Edizione in evidenza</div>
        <div className="mt-4 text-2xl font-black tracking-tight text-slate-950">{featuredEdition.editionLabel}</div>
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{featuredEdition.note}</div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Edizioni archiviate</div>
        <div className="mt-4 space-y-3">
          {data.editions.map((edition) => (
            <button key={edition.id} type="button" onClick={() => onOpenEditionDetail?.(edition.id)} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><div className="text-base font-black tracking-tight text-slate-950">{edition.editionLabel}</div><span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">{edition.statusLabel}</span></div>
                  <div className="mt-1 text-sm font-bold text-slate-600">{edition.seasonLabel}</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{edition.note}</div>
                </div>
                <div className="grid shrink-0 gap-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Vincitore</div><div className="mt-1 text-sm font-black text-slate-950">{edition.winnerTeamName}</div></div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Punti</div><div className="mt-1 text-lg font-black text-slate-950">{edition.winnerPoints}</div></div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Roster</div><div className="mt-1 text-sm font-black text-slate-950">{edition.completedTeams}</div></div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Prossime destinazioni</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={onOpenRules} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left"><div><div className="text-sm font-black text-slate-950">Rivedi il regolamento</div><div className="mt-1 text-sm font-semibold text-slate-600">Controlla punteggi, vincoli e bonus.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
          <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left"><div><div className="text-sm font-black text-slate-950">Torna alla classifica generale</div><div className="mt-1 text-sm font-semibold text-slate-600">Riconfronta la tua squadra con il ranking fantasy attuale.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
        </div>
      </div>
    </div>
  );
};
