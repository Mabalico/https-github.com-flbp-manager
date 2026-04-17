import React from 'react';
import { ArrowDown, ArrowUpDown, Loader2, Search, Shield, Users, X } from 'lucide-react';
import { useTranslation } from '../../App';
import { fetchFantaPlayerStandings, fetchUserFantaTeam } from '../../services/fantabeerpong/fantaSupabaseService';
import { readPlayerPresenceSnapshot } from '../../services/playerAppService';
import type { FantaPlayersStandingsRow } from '../../services/fantabeerpong/types';
import { panelClass } from './_shared';

interface Props {
  onOpenMyTeam: () => void;
  onOpenStandings: () => void;
  onOpenPlayerDetail?: (playerId: string) => void;
}

type SortField = 'rank' | 'fantasyPoints' | 'livePoints' | 'selectedByTeams' | 'goals' | 'blows' | 'wins' | 'bonusScia';
const stickyTh = 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';
const thPad = 'px-3 py-3 md:px-4';
const tdPad = 'px-3 py-3 md:px-4';

const statusBadgeClass = (status: FantaPlayersStandingsRow['status']) =>
  status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';
const statusLabel = (t: (k: string) => string, status: FantaPlayersStandingsRow['status']) =>
  status === 'live' ? t('fanta_players_status_live') : status === 'eliminated' ? t('fanta_players_status_eliminated') : t('fanta_players_status_waiting');

export const FantaPlayersStandingsSection: React.FC<Props> = ({ onOpenMyTeam, onOpenStandings, onOpenPlayerDetail }) => {
  const { t } = useTranslation();
  const [rows, setRows] = React.useState<FantaPlayersStandingsRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [onlyLive, setOnlyLive] = React.useState(false);
  const [onlyMyPlayers, setOnlyMyPlayers] = React.useState(false);
  const [sortField, setSortField] = React.useState<SortField>('fantasyPoints');
  const [session] = React.useState(readPlayerPresenceSnapshot());

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      const [rawRows, userTeam] = await Promise.all([
        fetchFantaPlayerStandings(),
        session?.accountId ? fetchUserFantaTeam(session.accountId) : Promise.resolve(null)
      ]);

      const myPlayerIds = userTeam?.roster.map(r => r.player_id) || [];

      const ordered = [...rawRows].sort((left, right) => {
        if ((right.total_points || 0) !== (left.total_points || 0)) return (right.total_points || 0) - (left.total_points || 0);
        if ((right.points_from_wins || 0) !== (left.points_from_wins || 0)) return (right.points_from_wins || 0) - (left.points_from_wins || 0);
        return (right.points_from_goals || 0) - (left.points_from_goals || 0);
      });
      const mapped = ordered.map((r, idx): FantaPlayersStandingsRow => ({
        id: r.player_key,
        rank: idx + 1,
        playerName: r.player_name,
        realTeamName: r.real_team_name || 'N/D',
        fantasyPoints: r.total_points || 0,
        livePoints: r.live_points || r.total_points || 0,
        selectedByTeams: r.selected_by_teams || 0,
        goals: r.points_from_goals || 0,
        blows: r.points_from_blows || 0,
        wins: r.points_from_wins || 0,
        bonusScia: r.bonus_scia || 0,
        status: r.status || 'waiting',
        roleLabel: t('fanta_players_label_player'),
        note: r.status === 'eliminated' && r.eliminated_by_team_name
          ? t('fanta_eliminated_by').replace('{name}', r.eliminated_by_team_name)
          : t('fanta_sync_note'),
        isInMyTeam: myPlayerIds.includes(r.player_key)
      }));
      setRows(mapped);
      setLoading(false);
    }
    load();
  }, [session]);

  const featuredPlayer = rows.length > 0 ? rows.sort((a,b) => b.fantasyPoints - a.fantasyPoints)[0] : null;

  const filteredRows = rows
    .filter((row) => row.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase()) || row.realTeamName.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    .filter((row) => !onlyLive || row.status === 'live')
    .filter((row) => !onlyMyPlayers || row.isInMyTeam)
    .sort((left, right) => {
      const primary = sortField === 'rank' ? left.rank - right.rank : (right[sortField as keyof FantaPlayersStandingsRow] as number) - (left[sortField as keyof FantaPlayersStandingsRow] as number);
      return primary !== 0 ? primary : left.playerName.localeCompare(right.playerName, 'it', { sensitivity: 'base' });
    });

  const SortTh: React.FC<{ field: SortField; label: string }> = ({ field, label }) => (
    <th className={`${thPad} ${stickyTh} text-center`}>
      <button type="button" onClick={() => setSortField(field)} className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-black uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ${sortField === field ? 'text-beer-700' : 'text-slate-500 hover:text-beer-600'}`}>
        <span>{label}</span>{sortField === field ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
      </button>
    </th>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">{t('fanta_players_loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Users className="h-3.5 w-3.5" />{t('fanta_standings_edition_live')}</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{t('fanta_players_title')}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t('fanta_players_subtitle')}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpenMyTeam} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-700 transition hover:bg-slate-50"><Shield className="h-4 w-4" />{t('fanta_standings_goto_myteam')}</button>
            <button type="button" onClick={onOpenStandings} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 transition hover:bg-beer-600">{t('fanta_players_goto_standings')}</button>
          </div>
        </div>
      </div>

      {featuredPlayer && (
        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_players_best_perf_title')}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm hover:shadow-md transition-shadow"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_players_label_player')}</div><div className="mt-1 text-base font-black text-slate-950 truncate">{featuredPlayer.playerName}</div><div className="mt-1 text-xs font-bold text-slate-500 truncate">{featuredPlayer.realTeamName}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm hover:shadow-md transition-shadow"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_players_label_status')}</div><div className="mt-1 text-base font-black text-slate-950">{statusLabel(t, featuredPlayer.status)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm hover:shadow-md transition-shadow"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_players_label_points')}</div><div className="mt-1 text-xl font-black text-slate-950">{featuredPlayer.fantasyPoints}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm hover:shadow-md transition-shadow"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_players_label_selected')}</div><div className="mt-1 text-xl font-black text-slate-950">{featuredPlayer.selectedByTeams} {t('fanta_history_teams_label')}</div></div>
          </div>
        </div>
      )}

      <div role="toolbar" className="flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('fanta_players_search_placeholder')} className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-10 text-sm font-bold text-slate-700 outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2" />
          {searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOnlyLive((v) => !v)} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition ${onlyLive ? 'bg-beer-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t('fanta_players_filter_live')}</button>
          <button type="button" onClick={() => setOnlyMyPlayers((v) => !v)} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition ${onlyMyPlayers ? 'bg-beer-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t('fanta_players_filter_myteam')}</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className={`${thPad} ${stickyTh} w-20 text-center`}>{t('fanta_standings_rank')}</th>
                <th className={`${thPad} ${stickyTh} min-w-[200px]`}>{t('fanta_players_label_player')}</th>
                <th className={`${thPad} ${stickyTh} text-center`}>{t('fanta_players_real_team')}</th>
                <SortTh field="fantasyPoints" label={t('fanta_standings_points')} />
                <SortTh field="goals" label={t('fanta_standings_goals')} />
                <SortTh field="blows" label={t('fanta_standings_blows')} />
                <SortTh field="wins" label={t('fanta_standings_wins')} />
                <SortTh field="bonusScia" label={t('fanta_standings_scia')} />
                <SortTh field="selectedByTeams" label={t('fanta_players_chosen_count')} />
                <th className={`${thPad} ${stickyTh} text-center`}>{t('fanta_players_label_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRows.map((row) => (
                <tr key={row.id} className={row.isInMyTeam ? 'bg-beer-50/40 hover:bg-beer-50/60 transition-colors' : 'bg-white hover:bg-slate-50/50 transition-colors'}>
                  <td className={`${tdPad} text-center`}><span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black shadow-sm ${row.rank === 1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{row.rank}</span></td>
                  <td className={tdPad}>
                    <button type="button" onClick={() => onOpenPlayerDetail?.(row.id)} className="w-full rounded-xl text-left transition hover:text-beer-700">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1"><div className="truncate text-base font-black text-slate-950">{row.playerName}</div></div>
                        {row.isInMyTeam && <span className="inline-flex rounded-md border border-beer-200 bg-beer-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-beer-700">{t('fanta_players_mine_badge')}</span>}
                      </div>
                    </button>
                  </td>
                  <td className={`${tdPad} text-center font-black text-slate-900 truncate max-w-[150px]`}>{row.realTeamName}</td>
                  <td className={`${tdPad} text-center font-black text-lg text-slate-950`}>{row.fantasyPoints}</td>
                  <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.goals}</td>
                  <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.blows}</td>
                  <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.wins}</td>
                  <td className={`${tdPad} text-center font-bold text-slate-600`}>{row.bonusScia}</td>
                  <td className={`${tdPad} text-center font-black text-slate-900`}>{row.selectedByTeams}</td>
                  <td className={`${tdPad} text-center`}><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusBadgeClass(row.status)}`}>{statusLabel(t, row.status)}</span></td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-20 text-center text-sm font-bold text-slate-400 italic">{t('fanta_players_not_found')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
