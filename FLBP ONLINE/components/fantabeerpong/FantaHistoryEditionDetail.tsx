import React from 'react';
import { ArrowLeft, Loader2, Star, Target, Trophy, Wind, Zap } from 'lucide-react';
import { fetchFantaArchivedEditionDetail } from '../../services/fantabeerpong/fantaSupabaseService';
import type { FantaArchivedEditionDetail } from '../../services/fantabeerpong/types';
import { MetricCard, panelClass } from './_shared';

interface Props {
  editionId: string;
  onBack: () => void;
}

export const FantaHistoryEditionDetail: React.FC<Props> = ({ editionId, onBack }) => {
  const [data, setData] = React.useState<FantaArchivedEditionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const result = await fetchFantaArchivedEditionDetail(editionId);
        if (alive) setData(result);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [editionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 text-sm font-black uppercase tracking-widest text-slate-500">Caricamento edizione Fanta...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <Trophy className="mx-auto h-12 w-12 text-slate-200" />
        <p className="mt-4 font-bold italic text-slate-500">Edizione Fanta non trovata o senza squadre iscritte.</p>
        <button onClick={onBack} className="mt-4 text-xs font-black uppercase tracking-widest text-beer-600 underline underline-offset-4">Torna allo storico</button>
      </div>
    );
  }

  const podium = data.standings.slice(0, 3);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">
              <Trophy className="h-3.5 w-3.5" />
              Edizione Fanta archiviata
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.edition.tournamentName}</h1>
            <div className="mt-1 text-sm font-bold text-slate-600">{data.edition.dateLabel}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Classifica finale FantaBeerpong salvata alla chiusura del torneo live.
            </div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Torna allo storico
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Vincitore Fanta" value={data.edition.winnerTeamName} hint="Squadra prima classificata" />
        <MetricCard label="Punteggio vincente" value={String(data.edition.winnerPoints)} hint="Punti finali" />
        <MetricCard label="Squadre iscritte" value={String(data.edition.teamsCount)} hint="Partecipanti Fanta" />
        <MetricCard label="Top giocatori" value={String(data.topPlayers.length)} hint="Giocatori in evidenza" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">Classifica finale</div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-center">Pos.</th>
                  <th className="px-4 py-3">Squadra Fanta</th>
                  <th className="px-4 py-3 text-center">Punti</th>
                  <th className="px-4 py-3 text-center">Canestri</th>
                  <th className="px-4 py-3 text-center">Soffi</th>
                  <th className="px-4 py-3 text-center">Vittorie</th>
                  <th className="px-4 py-3 text-center">Scia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.standings.map((row) => (
                  <tr key={row.teamId} className="bg-white">
                    <td className="px-4 py-3 text-center font-black text-slate-700">#{row.rank}</td>
                    <td className="px-4 py-3 font-black text-slate-950">{row.teamName}</td>
                    <td className="px-4 py-3 text-center text-lg font-black text-slate-950">{row.totalPoints}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{row.goals}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{row.blows}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-600">{row.wins}</td>
                    <td className="px-4 py-3 text-center font-bold text-indigo-700">{row.bonusScia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">Podio Fanta</div>
          <div className="mt-4 space-y-3">
            {podium.map((row) => (
              <div key={row.teamId} className={`rounded-[22px] border px-4 py-4 ${row.rank === 1 ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-slate-950">#{row.rank} · {row.teamName}</div>
                    <div className="mt-1 text-sm font-bold uppercase tracking-tight text-slate-500">{row.totalPoints} punti</div>
                  </div>
                  {row.rank === 1 ? <Trophy className="h-6 w-6 text-amber-500" /> : <Star className="h-5 w-5 text-slate-300" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Top giocatori Fanta</div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.topPlayers.map((row) => (
            <div key={row.playerId} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-black text-slate-950">#{row.rank} · {row.playerName}</div>
                  <div className="mt-1 truncate text-xs font-bold uppercase tracking-tight text-slate-500">{row.realTeamName}</div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-black text-slate-600">
                    <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5 text-slate-400" />{row.goals}</span>
                    <span className="inline-flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-slate-400" />{row.blows}</span>
                    <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-slate-400" />{row.wins}</span>
                    <span className="inline-flex items-center gap-1 text-indigo-700"><Zap className="h-3.5 w-3.5 text-indigo-500" />{row.bonusScia}</span>
                  </div>
                </div>
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Punti</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{row.totalPoints}</div>
                </div>
              </div>
            </div>
          ))}
          {data.topPlayers.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-400">
              Nessun dato giocatore disponibile per questa edizione.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
