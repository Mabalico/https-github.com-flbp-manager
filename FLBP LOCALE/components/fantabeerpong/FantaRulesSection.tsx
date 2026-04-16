import React from 'react';
import { ArrowRight, ChevronDown, ChevronUp, ScrollText, Shield, Sparkles, Trophy } from 'lucide-react';
import { FANTA_RULES_MOCK } from '../../services/fantabeerpong/mockData';
import { panelClass } from './_shared';

interface Props { onOpenMyTeam: () => void; onOpenStandings: () => void; onOpenHistory: () => void; }

export const FantaRulesSection: React.FC<Props> = ({ onOpenMyTeam, onOpenStandings, onOpenHistory }) => {
  const data = FANTA_RULES_MOCK;
  const [openFaqId, setOpenFaqId] = React.useState<string>(data.faqs[0]?.id || '');
  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><ScrollText className="h-3.5 w-3.5" />Regolamento FantaBeerpong</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.title}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.intro}</div>
          </div>
          <button type="button" onClick={onOpenMyTeam} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600"><Shield className="h-4 w-4" />Controlla la mia squadra</button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-beer-600" /><div className="text-xl font-black tracking-tight text-slate-950">Punteggi ufficiali</div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data.scoringRows.map((row) => (
                <div key={row.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{row.label}</div>
                  <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{row.valueLabel}</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{row.helper}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={panelClass}>
            <div className="flex items-center gap-3"><Shield className="h-5 w-5 text-sky-600" /><div className="text-xl font-black tracking-tight text-slate-950">Ruoli Speciali</div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[22px] border border-amber-200 bg-amber-50/50 px-4 py-4">
                <div className="text-sm font-black uppercase tracking-wide text-amber-900">Capitano</div>
                <div className="mt-1 text-lg font-black text-slate-950">Punti raddoppiati (x2)</div>
                <div className="mt-2 text-sm font-semibold leading-6 text-slate-700">Raddoppia TUTTI i punti ottenuti dal giocatore (Canestri, Soffi, Vittorie).</div>
              </div>
              <div className="rounded-[22px] border border-sky-200 bg-sky-50/50 px-4 py-4">
                <div className="text-sm font-black uppercase tracking-wide text-sky-900">Difensore</div>
                <div className="mt-1 text-lg font-black text-slate-950">Soffi raddoppiati (x2)</div>
                <div className="mt-2 text-sm font-semibold leading-6 text-slate-700">Raddoppia solo il valore dei soffi registrati dal giocatore.</div>
              </div>
            </div>
          </div>
          <div className={panelClass}>
            <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-indigo-600" /><div className="text-xl font-black tracking-tight text-slate-950">Meccanica Bonus Scia</div></div>
            <div className="mt-4 rounded-[22px] border border-indigo-100 bg-indigo-50/30 p-5">
              <div className="text-sm font-semibold leading-7 text-slate-700">
                Quando un tuo giocatore viene eliminato dal torneo, continua a farti guadagnare punti "in scia":
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Guadagni <span className="font-black text-indigo-700">5 punti</span> per ogni vittoria successiva della squadra che lo ha eliminato.</li>
                  <li>La partita dell'eliminazione non assegna bonus.</li>
                  <li>La scia si interrompe alla prima sconfitta della squadra eliminatrice.</li>
                </ul>
                <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Esempio pratico</div>
                  <div className="mt-1 text-sm font-medium italic text-slate-600">
                    Se il tuo giocatore viene eliminato dai Wolves ai quarti: non prendi bonus nei quarti. Se i Wolves vincono la semifinale, prendi 5 punti. Se poi perdono la finale, la scia si interrompe.
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={panelClass}>
            <div className="flex items-center gap-3"><Trophy className="h-5 w-5 text-amber-500" /><div className="text-xl font-black tracking-tight text-slate-950">Vincoli e Bonus</div></div>
            <div className="mt-4 space-y-3">
              {data.constraints.map((c) => <div key={c.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"><div className="text-sm font-black text-slate-950">{c.label}</div><div className="mt-1 text-sm font-semibold leading-6 text-slate-600">{c.helper}</div></div>)}
              {data.notes.map((n) => <div key={n} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">{n}</div>)}
            </div>
          </div>
        </div>
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">FAQ rapida</div>
            <div className="mt-4 space-y-3">
              {data.faqs.map((faq) => {
                const open = faq.id === openFaqId;
                return (
                  <div key={faq.id} className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
                    <button type="button" onClick={() => setOpenFaqId((current) => current === faq.id ? '' : faq.id)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                      <div className="text-sm font-black text-slate-950">{faq.question}</div>
                      {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
                    </button>
                    {open && <div className="border-t border-slate-200 bg-white px-4 py-4 text-sm font-semibold leading-6 text-slate-600">{faq.answer}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Prossime destinazioni</div>
            <div className="mt-4 space-y-3">
              <button type="button" onClick={onOpenMyTeam} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left"><div><div className="text-sm font-black text-slate-950">Verifica la tua rosa</div><div className="mt-1 text-sm font-semibold text-slate-600">Controlla capitano, difensori e lock squadra.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
              <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left"><div><div className="text-sm font-black text-slate-950">Apri la classifica generale</div><div className="mt-1 text-sm font-semibold text-slate-600">Confronta subito i punteggi fantasy delle squadre.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
              <button type="button" onClick={onOpenHistory} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left"><div><div className="text-sm font-black text-slate-950">Vai allo storico</div><div className="mt-1 text-sm font-semibold text-slate-600">Rivedi edizioni e vincitori del FantaBeerpong.</div></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
