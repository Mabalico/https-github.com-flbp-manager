import React from 'react';
import { ArrowRight, History, Trophy } from 'lucide-react';
import { getAppStateRepository } from '../../services/repository/getRepository';
import { panelClass } from './_shared';

interface Props { onOpenRules: () => void; onOpenStandings: () => void; onOpenEditionDetail?: (editionId: string) => void; }

export const FantaHistorySection: React.FC<Props> = ({ onOpenRules, onOpenStandings, onOpenEditionDetail }) => {
  const repo = React.useMemo(() => getAppStateRepository(), []);
  const state = repo.load();
  const history = state.tournamentHistory || [];
  
  // Latest real tournament is the "Reigning Champion"
  const reigningChampion = history[0] || null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><History className="h-3.5 w-3.5" />Storico FantaBeerpong</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Pionieri del Fantasy</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Ripercorri i vincitori dei tornei FLBP e le future leggende del FantaBeerpong.
            </div>
          </div>
          <button type="button" onClick={onOpenStandings} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600"><Trophy className="h-4 w-4" />Torna alla classifica</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Tornei Hist.</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{history.length}</div></div>
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Debutto Fanta</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950">2026</div></div>
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100"><div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Campione FLBP</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950 truncate">{reigningChampion?.winnerName || 'N/D'}</div></div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Edizioni archiviate</div>
        <p className="mt-1 mb-6 text-sm font-semibold text-slate-500">I tornei passati mostrano i vincitori reali. Le prossime edizioni includeranno la classifica fantasy.</p>
        <div className="space-y-3">
          {history.length > 0 ? history.map((edition) => (
            <button key={edition.id} type="button" onClick={() => onOpenEditionDetail?.(edition.id)} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-black tracking-tight text-slate-950">{edition.tournamentName}</div>
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">PRE-FANTA</span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-400 font-mono">{edition.id}</div>
                </div>
                <div className="grid shrink-0 gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Vincitore</div><div className="mt-1 text-sm font-black text-slate-950">{edition.winnerName}</div></div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Secondo</div><div className="mt-1 text-sm font-black text-slate-950">{edition.runnerUpName}</div></div>
                </div>
              </div>
            </button>
          )) : (
            <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest text-xs">Nessuna edizione trovata.</div>
          )}
        </div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Prossime destinazioni</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={onOpenRules} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-white hover:shadow-md transition-all font-semibold"><div><div className="text-sm font-black text-slate-950">Rivedi il regolamento</div><div className="mt-1 text-sm font-semibold text-slate-600">Controlla punteggi, vincoli e bonus.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
          <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:bg-white hover:shadow-md transition-all font-semibold"><div><div className="text-sm font-black text-slate-950">Torna alla classifica generale</div><div className="mt-1 text-sm font-semibold text-slate-600">Riconfronta la tua squadra con il ranking fantasy attuale.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
        </div>
      </div>
    </div>
  );
};
