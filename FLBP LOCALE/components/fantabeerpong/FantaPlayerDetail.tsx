import React from 'react';
import { ArrowLeft, UserRound, Loader2, Target, Wind, Trophy } from 'lucide-react';
import { fetchFantaPlayerContributions, fetchFantaPlayerStandings } from '../../services/fantabeerpong/fantaSupabaseService';
import { getPlayerKeyLabel } from '../../services/playerIdentity';
import { loadState } from '../../services/storageService';
import { MetricCard, panelClass } from './_shared';

const statusBadgeClass = (status: 'live' | 'eliminated' | 'waiting') =>
  status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';
const statusLabel = (status: 'live' | 'eliminated' | 'waiting') =>
  status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';

interface Props { playerId: string; onBack: () => void; onOpenMyTeam?: () => void; }

export const FantaPlayerDetail: React.FC<Props> = ({ playerId, onBack, onOpenMyTeam }) => {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      const contributions = await fetchFantaPlayerContributions(playerId);
      const standings = await fetchFantaPlayerStandings();
      const appState = loadState();

      const sortedStandings = [...standings].sort((a,b) => (b.total_points || 0) - (a.total_points || 0));
      const rankIndex = sortedStandings.findIndex(s => s.player_key === playerId);
      const rank = rankIndex !== -1 ? rankIndex + 1 : '-';
      const playerStanding = standings.find(s => s.player_key === playerId);

      const totalGoals = playerStanding?.points_from_goals || contributions.reduce((acc, c) => acc + (c.canestri || 0), 0);
      const totalBlows = playerStanding?.points_from_blows || contributions.reduce((acc, c) => acc + ((c.soffi || 0) * 2), 0);
      const totalWins = playerStanding?.points_from_wins || 0;
      const totalScia = playerStanding?.bonus_scia || 0;
      const totalPoints = playerStanding?.total_points || 0;

      const label = getPlayerKeyLabel(playerId);
      
      let realTeamName = playerStanding?.real_team_name || 'In gara';
      if (realTeamName === 'In gara') {
         for (const t of appState.teams || []) {
            if (t.player1 === label.name || t.player2 === label.name) {
               realTeamName = t.name;
               break;
            }
         }
      }

      const status = playerStanding?.status || 'waiting';
      
      setData({
        playerName: playerStanding?.player_name || label.name, 
        realTeamName,
        roleLabel: 'Giocatore',
        rank,
        status,
        note: playerStanding?.status === 'eliminated' && playerStanding?.eliminated_by_team_name
          ? `Eliminato da ${playerStanding.eliminated_by_team_name}. Il Bonus Scia considera le vittorie successive di quella squadra.`
          : `Analisi delle performance live per ${label.name}. Dati estratti dai referti ufficiali del torneo.`,
        summaryCards: [
          { id: 's1', label: 'Punti Totali Fanta', value: totalPoints.toString(), hint: `Rank #${rank}` },
          { id: 's2', label: 'Canestri', value: totalGoals.toString(), hint: 'Punti da canestri' },
          { id: 's3', label: 'Soffi', value: totalBlows.toString(), hint: 'Punti da soffi' },
          { id: 's4', label: 'Vittorie', value: totalWins.toString(), hint: 'Punti vittorie squadra' },
          { id: 's5', label: 'Bonus Scia', value: totalScia.toString(), hint: 'Post eliminazione' },
          { id: 's6', label: 'Partite Refertate', value: contributions.length.toString(), hint: 'Match giocati' },
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
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700"><UserRound className="h-3.5 w-3.5" />Dettaglio giocatore Fanta</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl uppercase font-mono">{data.playerName}</h1>
            <div className="mt-1 flex items-center gap-2">
               <span className="text-sm font-bold text-slate-600">{data.realTeamName} · {data.roleLabel}</span>
               <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusBadgeClass(data.status)}`}>{statusLabel(data.status)}</span>
            </div>
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
      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Accessi profondi</div>
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">Esplora altre sezioni per questo giocatore.</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => (window as any).flbpOpenPlayerArea?.()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-wider text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-beer-500/50"><UserRound className="h-4 w-4" /> Profilo Storico Giocatore</button>
          <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-wider text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-beer-500/50"><Trophy className="h-4 w-4" /> Statistiche Torneo Reale</button>
        </div>
      </div>
    </div>
  );
};
