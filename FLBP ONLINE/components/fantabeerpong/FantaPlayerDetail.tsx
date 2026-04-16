import React from 'react';
import { ArrowLeft, UserRound, Loader2, Target, Wind, Trophy } from 'lucide-react';
import { fetchFantaPlayerContributions } from '../../services/fantabeerpong/fantaSupabaseService';
import { getPlayerKeyLabel } from '../../services/playerIdentity';
import { MetricCard, panelClass } from './_shared';

interface Props { playerId: string; onBack: () => void; onOpenMyTeam?: () => void; }

export const FantaPlayerDetail: React.FC<Props> = ({ playerId, onBack, onOpenMyTeam }) => {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      const contributions = await fetchFantaPlayerContributions(playerId);
      
      const totalGoals = contributions.reduce((acc, c) => acc + (c.canestri || 0), 0);
      const totalBlows = contributions.reduce((acc, c) => acc + (c.soffi || 0), 0);
      
      const label = getPlayerKeyLabel(playerId);
      
      setData({
        playerName: contributions[0]?.player_name || label.name, // Real name from stats or derived from key
        realTeamName: contributions[0]?.team_name || 'In gara',
        roleLabel: 'Giocatore',
        availabilityLabel: 'Disponibile',
        note: `Analisi delle performance live per ${label.name}. Dati estratti dai referti ufficiali del torneo.`,
        summaryCards: [
          { id: 's1', label: 'Canestri Totali', value: totalGoals.toString(), hint: 'In tutto il torneo' },
          { id: 's2', label: 'Soffi Totali', value: totalBlows.toString(), hint: 'In tutto il torneo' },
          { id: 's3', label: 'Partite Giocate', value: contributions.length.toString(), hint: 'Match refertati' },
          { id: 's4', label: 'Media Punti', value: contributions.length ? (totalGoals / contributions.length).toFixed(1) : '0', hint: 'Canestri / match' }
        ],
        contributionRows: contributions.map((c: any) => ({
          id: c.id,
          label: `Match vs ${c.tournament_matches?.team_a_id === c.team_id ? (c.tournament_matches?.team_b_id || 'BYE') : (c.tournament_matches?.team_a_id || 'BYE')}`,
          helper: `Round: ${c.tournament_matches?.round || 'N/D'} · Score: ${c.tournament_matches?.score_a || 0}-${c.tournament_matches?.score_b || 0}`,
          valueLabel: `+${c.canestri || 0} G / +${c.soffi || 0} S`
        }))
      });
      setLoading(false);
    }
    load();
  }, [playerId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">Caricamento contributi...</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700"><UserRound className="h-3.5 w-3.5" />Dettaglio giocatore fantasy</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl uppercase font-mono">{data.playerName}</h1>
            <div className="mt-1 text-sm font-bold text-slate-600">{data.realTeamName} · {data.roleLabel} · {data.availabilityLabel}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.note}</div>
          </div>
          <div className="flex gap-2">
            {onOpenMyTeam && <button type="button" onClick={onOpenMyTeam} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition">La mia squadra</button>}
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition"><ArrowLeft className="h-4 w-4" />Back</button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.summaryCards.map((card: any) => <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} />)}</div>
      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Breakdown contributi</div>
        <div className="mt-4 space-y-3">
          {data.contributionRows.map((row: any) => (
            <div key={row.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 hover:bg-white hover:shadow-md transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-3.5 w-3.5 text-slate-400" />
                    <div className="text-sm font-black text-slate-950 truncate">{row.label}</div>
                  </div>
                  <div className="mt-1 text-xs font-bold leading-6 text-slate-500 uppercase tracking-tight">{row.helper}</div>
                </div>
                <div className="text-xl font-black text-slate-950 tabular-nums">{row.valueLabel}</div>
              </div>
            </div>
          ))}
          {data.contributionRows.length === 0 && (
            <div className="py-10 text-center text-sm font-bold text-slate-400 italic">Nessun contributo refertato per questo giocatore.</div>
          )}
        </div>
      </div>
    </div>
  );
};
