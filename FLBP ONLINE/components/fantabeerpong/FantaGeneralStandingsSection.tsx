import React from 'react';
import { ArrowDown, ArrowUpDown, BarChart3, Search, Trophy, X, Loader2 } from 'lucide-react';
import { fetchFantaStandings } from '../../services/fantabeerpong/fantaSupabaseService';
import { readPlayerPresenceSnapshot } from '../../services/playerAppService';
import type { FantaGeneralStandingsRow } from '../../services/fantabeerpong/types';
import { panelClass } from './_shared';

interface Props {
  onOpenMyTeam: () => void;
  onOpenPlayers: () => void;
  onOpenTeamDetail?: (teamId: string) => void;
}

type SortField = 'rank' | 'totalPoints' | 'livePoints' | 'gapFromLeader' | 'goals' | 'blows' | 'wins' | 'bonusScia' | 'playersInGame';
const stickyTh = 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';
const thPad = 'px-3 py-3 md:px-4';
const tdPad = 'px-3 py-3 md:px-4';

const trendBadgeClass = (trend: FantaGeneralStandingsRow['trend']) =>
  trend === 'up' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : trend === 'down' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';
const trendLabel = (trend: FantaGeneralStandingsRow['trend']) =>
  trend === 'up' ? 'In salita' : trend === 'down' ? 'In calo' : 'Stabile';

export const FantaGeneralStandingsSection: React.FC<Props> = ({ onOpenMyTeam, onOpenPlayers, onOpenTeamDetail }) => {
  const [rows, setRows] = React.useState<FantaGeneralStandingsRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [onlyMineWindow, setOnlyMineWindow] = React.useState(false);
  const [sortField, setSortField] = React.useState<SortField>('totalPoints');

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchFantaStandings();
        const session = readPlayerPresenceSnapshot();
        const ordered = [...data].sort((left, right) => {
          if ((right.total_points || 0) !== (left.total_points || 0)) return (right.total_points || 0) - (left.total_points || 0);
          if ((right.players_in_game || 0) !== (left.players_in_game || 0)) return (right.players_in_game || 0) - (left.players_in_game || 0);
          if ((right.points_from_wins || 0) !== (left.points_from_wins || 0)) return (right.points_from_wins || 0) - (left.points_from_wins || 0);
          return (right.points_from_goals || 0) - (left.points_from_goals || 0);
        });
        const leaderPoints = ordered[0]?.total_points || 0;
        const mapped: FantaGeneralStandingsRow[] = ordered.map((item, index) => ({
          id: item.team_id,
          rank: index + 1,
          teamName: item.team_name,
          ownerLabel: item.user_id?.slice(0, 8) || 'Utente',
          totalPoints: item.total_points || 0,
          livePoints: item.live_points || item.total_points || 0,
          gapFromLeader: Math.max(0, leaderPoints - (item.total_points || 0)),
          goals: item.points_from_goals || 0,
          blows: item.points_from_blows || 0,
          wins: item.points_from_wins || 0,
          bonusScia: item.bonus_scia || 0,
          playersInGame: item.players_in_game || 0,
          captainName: item.captain_name || 'N/D',
          defendersCount: item.defenders_count || 0,
          statusLabel: item.status_label || 'Live',
          trend: 'steady',
          isMine: item.user_id === session?.accountId,
        }));
        setRows(mapped);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const myTeam = React.useMemo(() => rows.find((r) => r.isMine) || null, [rows]);

  const filteredRows = React.useMemo(() => {
    return rows
      .filter((row) => row.teamName.toLowerCase().includes(searchTerm.trim().toLowerCase()))
      .filter((row) => !onlyMineWindow || !myTeam || Math.abs(row.rank - myTeam.rank) <= 2 || row.isMine)
      .sort((left, right) => {
        let primary = 0;
        if (sortField === 'rank') primary = left.rank - right.rank;
        else if (sortField === 'gapFromLeader') primary = left.gapFromLeader - right.gapFromLeader;
        else primary = (right[sortField] || 0) - (left[sortField] || 0);

        if (primary !== 0) return primary;

        if (left.totalPoints !== right.totalPoints) return right.totalPoints - left.totalPoints;
        if (left.playersInGame !== right.playersInGame) return right.playersInGame - left.playersInGame;
        if (left.wins !== right.wins) return right.wins - left.wins;
        if (left.goals !== right.goals) return right.goals - left.goals;

        return left.teamName.localeCompare(right.teamName, 'it', { sensitivity: 'base' });
      });
  }, [rows, myTeam, onlyMineWindow, searchTerm, sortField]);

  const SortTh: React.FC<{ field: SortField; label: string; minW?: string }> = ({ field, label, minW }) => (
    <th className={`${thPad} ${stickyTh} text-center ${minW || ''}`}>
      <button type="button" onClick={() => setSortField(field)} className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-black uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ${sortField === field ? 'text-beer-700' : 'text-slate-500 hover:text-beer-600'}`}>
        <span>{label}</span>{sortField === field ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><BarChart3 className="h-3.5 w-3.5" />EDIZIONE LIVE</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Classifica Fanta squadre</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">Dati sincronizzati in tempo reale con il database Supabase.</div>
          </div>
          <button type="button" onClick={onOpenMyTeam} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2"><Trophy className="h-4 w-4" />Vai alla mia squadra</button>
        </div>
      </div>

      <div role="toolbar" className="flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca una squadra Fanta" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-10 text-sm font-bold text-slate-700 outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2" />
          {searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOnlyMineWindow((v) => !v)} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition ${onlyMineWindow ? 'bg-beer-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Focus sulla mia zona</button>
          <button type="button" onClick={onOpenPlayers} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black uppercase tracking-wide text-slate-700 transition hover:bg-slate-50">Apri classifica giocatori</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-beer-500" />
            <p className="mt-4 text-sm font-bold text-slate-500">Sincronizzazione dati Fanta...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className={`${thPad} ${stickyTh} w-20 text-center`}>Rank</th>
                  <th className={`${thPad} ${stickyTh} min-w-[200px]`}>Squadra Fanta</th>
                  <SortTh field="totalPoints" label="Punti" />
                  <SortTh field="playersInGame" label="Vivi" />
                  <SortTh field="goals" label="Canestri" />
                  <SortTh field="blows" label="Soffi" />
                  <SortTh field="wins" label="Vittorie" />
                  <SortTh field="bonusScia" label="Scia" />
                  <th className={`${thPad} ${stickyTh} text-center`}>Capitano</th>
                  <th className={`${thPad} ${stickyTh} text-center`}>Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRows.map((row) => (
                  <tr key={row.id} className={row.isMine ? 'bg-beer-50/40' : 'bg-white hover:bg-slate-50/50 transition-colors'}>
                    <td className={`${tdPad} text-center`}><span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black shadow-sm ${row.rank === 1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{row.rank}</span></td>
                    <td className={tdPad}>
                      <button type="button" onClick={() => onOpenTeamDetail?.(row.id)} className="w-full rounded-xl text-left transition hover:text-beer-700">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0"><div className="truncate text-base font-black text-slate-950">{row.teamName}</div><div className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{row.ownerLabel}</div></div>
                          {row.isMine && <span className="inline-flex rounded-md border border-beer-200 bg-beer-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-beer-700">MIA</span>}
                        </div>
                      </button>
                    </td>
                    <td className={`${tdPad} text-center font-black text-lg text-slate-950`}>{row.totalPoints}</td>
                    <td className={`${tdPad} text-center font-bold text-slate-700`}>{row.playersInGame}/4</td>
                    <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.goals}</td>
                    <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.blows}</td>
                    <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.wins}</td>
                    <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.bonusScia}</td>
                    <td className={`${tdPad} text-center text-xs font-black text-slate-900`}>{row.captainName}</td>
                    <td className={`${tdPad} text-center`}><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${trendBadgeClass(row.trend)}`}>{trendLabel(row.trend)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={panelClass}><div className="text-xl font-black tracking-tight text-slate-950">Nota live</div><div className="mt-2 text-sm font-semibold leading-6 text-slate-600">I dati mostrati sono derivati direttamente dai report arbitrali salvati in Supabase.</div></div>
    </div>
  );
};
