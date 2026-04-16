import React from 'react';
import { ArrowLeft, Trophy, History } from 'lucide-react';
import { getAppStateRepository } from '../../services/repository/getRepository';
import { MetricCard, panelClass } from './_shared';

interface Props { editionId: string; onBack: () => void; }

export const FantaHistoryEditionDetail: React.FC<Props> = ({ editionId, onBack }) => {
  const repo = React.useMemo(() => getAppStateRepository(), []);
  const state = repo.load();
  const edition = (state.tournamentHistory || []).find((h) => h.id === editionId);

  if (!edition) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <Trophy className="mx-auto h-12 w-12 text-slate-200" />
        <p className="mt-4 text-slate-500 font-bold italic">Edizione non trovata.</p>
        <button onClick={onBack} className="mt-4 text-beer-600 font-black uppercase tracking-widest text-xs underline underline-offset-4">Torna allo storico</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700"><Trophy className="h-3.5 w-3.5" />Dettaglio edizione storica</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{edition.tournamentName}</h1>
            <div className="mt-1 text-sm font-bold text-slate-600 font-mono">ID: {edition.id}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Archiviata come edizione Pre-Fanta. I risultati mostrano i vincitori reali del torneo FLBP.
            </div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label="Campione FLBP" value={edition.winnerName || 'N/D'} hint="Vincitore finale" />
        <MetricCard label="Runner up" value={edition.runnerUpName || 'N/D'} hint="Secondo classificato" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">Informazioni torneo</div>
          <div className="mt-4 space-y-3">
             <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
               Questa edizione si è conclusa prima dell'introduzione ufficiale del FantaBeerpong.
             </div>
             <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
               Risultati basati sul tabellone ufficiale del torneo {edition.tournamentName}.
             </div>
          </div>
        </div>

        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">Podio Ufficiale</div>
          <div className="mt-4 space-y-3">
            <div className="rounded-[22px] border border-amber-200 bg-amber-50/50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-black text-amber-900">#1 · {edition.winnerName}</div>
                  <div className="mt-1 text-sm font-bold text-amber-700 uppercase tracking-tighter">Winner</div>
                </div>
                <Trophy className="h-6 w-6 text-amber-500" />
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-black text-slate-950">#2 · {edition.runnerUpName}</div>
                  <div className="mt-1 text-sm font-bold text-slate-500 uppercase tracking-tighter">Runner Up</div>
                </div>
                <div className="h-6 w-6 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 text-[10px] font-black">2</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
