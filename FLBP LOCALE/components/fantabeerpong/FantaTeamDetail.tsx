import React from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Shield, Target, Users, Wind, Trophy, Zap, Loader2, Star } from 'lucide-react';
import { fetchFantaTeamDetail } from '../../services/fantabeerpong/fantaSupabaseService';
import { getPlayerKeyLabel } from '../../services/playerIdentity';
import { loadState } from '../../services/storageService';
import { useTranslation } from '../../App';
import { MetricCard, panelClass } from './_shared';

const statusBadgeClass = (status: 'live' | 'eliminated' | 'waiting') =>
  status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700';
const statusLabel = (t: (key: string) => string, status: 'live' | 'eliminated' | 'waiting') =>
  status === 'eliminated' ? t('fanta_players_status_eliminated') : t('fanta_players_status_live');

const formatOwnerLabel = (row: any) => {
  const ownerName = String(row?.owner_name || '').trim().replace(/\s+/g, ' ');
  if (ownerName) return `Proprietario squadra: ${ownerName}`;
  const fallbackCode = String(row?.user_id || '').trim().slice(0, 8).toUpperCase();
  return fallbackCode ? `Proprietario squadra: ${fallbackCode}` : '';
};

interface Props {
  teamId: string;
  onBack: () => void;
  onOpenPlayerDetail?: (playerId: string) => void;
  onOpenMyTeam?: () => void;
  onOpenStandings?: () => void;
  onOpenPlayers?: () => void;
}

export const FantaTeamDetail: React.FC<Props> = ({ teamId, onBack, onOpenPlayerDetail, onOpenMyTeam, onOpenStandings, onOpenPlayers }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      const rows = await fetchFantaTeamDetail(teamId);
      if (rows && rows.length > 0) {
        const teamName = rows[0].team_name;
        const totalGoalPoints = rows.reduce((acc: number, r: any) => acc + (r.points_from_goals || 0), 0);
        const totalBlowPoints = rows.reduce((acc: number, r: any) => acc + (r.points_from_blows || 0), 0);
        const totalWinPoints = rows.reduce((acc: number, r: any) => acc + (r.points_from_wins || 0), 0);
        const totalAwardPoints = rows.reduce((acc: number, r: any) => acc + (r.points_from_awards || 0), 0);
        const totalBonusScia = rows.reduce((acc: number, r: any) => acc + (r.bonus_scia || 0), 0);
        const totalPoints = rows.reduce((acc: number, r: any) => acc + (r.total_points || 0), 0);
        
        const appState = loadState();
        
        setData({
          teamName,
          ownerLabel: formatOwnerLabel(rows[0]),
          note: t('fanta_team_detail_note').replace('{name}', teamName),
          summaryCards: [
            { id: 'c1', label: t('fanta_players_label_points'), value: totalPoints.toString(), hint: t('fanta_team_detail_roles_hint') },
            { id: 'c2', label: t('fanta_standings_goals'), value: totalGoalPoints.toString(), hint: t('fanta_player_detail_goals_hint') },
            { id: 'c3', label: t('fanta_standings_blows'), value: totalBlowPoints.toString(), hint: t('fanta_player_detail_blows_hint') },
            { id: 'c4', label: t('fanta_players_label_player'), value: rows.length.toString(), hint: t('fanta_team_detail_roster_hint') },
          ],
          pointsBreakdown: { goals: totalGoalPoints, blows: totalBlowPoints, wins: totalWinPoints, awardBonus: totalAwardPoints, bonusScia: totalBonusScia },
          lineup: rows.map((r: any) => {
              const label = getPlayerKeyLabel(r.player_id);
              let realTeamName = r.real_team_name || t('fanta_status_live');
              for (const t of appState.teams || []) {
                 if (!r.real_team_name && (t.player1 === label.name || t.player2 === label.name)) {
                    realTeamName = t.name;
                    break;
                 }
             }
             return {
                 id: r.player_id,
                 playerId: r.player_id,
                 playerName: r.player_name || label.name,
                 realTeamName,
                 roleLabel: r.role.toUpperCase(),
                 status: r.status || 'waiting',
                 note: r.status === 'eliminated' && r.eliminated_by_team_name ? t('fanta_eliminated_by').replace('{name}', r.eliminated_by_team_name) : t('fanta_sync_note'),
                 goals: r.raw_goals || 0,
                 blows: r.raw_blows || 0,
                 wins: r.raw_wins || 0,
                 awardBonus: r.points_from_awards || 0,
                 bonusScia: r.bonus_scia || 0,
                 fantasyPoints: r.total_points || 0
              };
          })
        });
      }
      setLoading(false);
    }
    load();
  }, [teamId, t]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">{t('fanta_team_detail_loading')}</p>
      </div>
    );
  }

  if (!data) return (
    <div className="py-20 text-center">
      <p className="text-slate-500 font-bold italic">{t('fanta_team_detail_not_found')}</p>
      <button onClick={onBack} className="mt-4 text-beer-600 font-black uppercase tracking-widest text-xs underline underline-offset-4">{t('back')}</button>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm md:rounded-[30px] md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />{t('fanta_team_detail_badge')}</div>
            <h1 className="mt-3 truncate text-2xl font-black tracking-tight text-slate-950 sm:text-3xl md:max-w-xl md:text-4xl">{data.teamName}</h1>
            {data.ownerLabel && <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">{data.ownerLabel}</div>}
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.note}</div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 md:w-auto"><ArrowLeft className="h-4 w-4" />{t('back')}</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.summaryCards.map((card: any) => <MetricCard key={card.id} label={card.label} value={card.value} hint={card.hint} />)}</div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_team_detail_breakdown')}</div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Target className="h-3 w-3" />{t('fanta_standings_goals')}</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.goals}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Wind className="h-3 w-3" />{t('fanta_standings_blows')}</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.blows}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Trophy className="h-3 w-3" />{t('fanta_standings_wins')}</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.wins}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-700"><Star className="h-3 w-3" />{t('fanta_final_awards')}</div>
            <div className="mt-1 text-2xl font-black text-amber-800">{data.pointsBreakdown.awardBonus}</div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-600"><Zap className="h-3 w-3" />{t('fanta_bonus_scia')}</div>
            <div className="mt-1 text-2xl font-black text-indigo-700">{data.pointsBreakdown.bonusScia}</div>
          </div>
        </div>
      </div>

      {(onOpenMyTeam || onOpenStandings || onOpenPlayers) && (
        <div className={panelClass}>
          <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_rules_destinations_title')}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {onOpenMyTeam && (
              <button type="button" onClick={onOpenMyTeam} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
                <div className="flex items-center gap-3 min-w-0"><Shield className="h-4 w-4 shrink-0 text-beer-600" /><div className="text-sm font-black text-slate-950 truncate">{t('fanta_shell_my_team')}</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
            {onOpenStandings && (
              <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
                <div className="flex items-center gap-3 min-w-0"><BarChart3 className="h-4 w-4 shrink-0 text-beer-600" /><div className="text-sm font-black text-slate-950 truncate">{t('fanta_shell_standings')}</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
            {onOpenPlayers && (
              <button type="button" onClick={onOpenPlayers} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
                <div className="flex items-center gap-3 min-w-0"><Users className="h-4 w-4 shrink-0 text-beer-600" /><div className="text-sm font-black text-slate-950 truncate">{t('fanta_shell_players')}</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_roster_fanta')}</div>
        <div className="mt-4 space-y-3 md:mt-6 md:space-y-4">
          {data.lineup.map((row: any) => (
            <button key={row.id} type="button" onClick={() => onOpenPlayerDetail?.(row.playerId)} className="group w-full rounded-[22px] border border-slate-200 bg-slate-50 p-1 text-left transition active:scale-[0.99] hover:border-slate-300 hover:bg-white hover:shadow-xl md:rounded-[26px]">
              <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-black uppercase tracking-tight text-slate-950 transition-colors group-hover:text-beer-700 md:text-lg">{row.playerName}</div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusBadgeClass(row.status || 'live')}`}>{statusLabel(t, row.status || 'live')}</span>
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-slate-500 uppercase tracking-tight">{row.realTeamName} · {row.roleLabel}</div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                    <div className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{row.goals} <span className="text-slate-400 font-bold uppercase tracking-tighter">C</span></span></div>
                    <div className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{row.blows} <span className="text-slate-400 font-bold uppercase tracking-tighter">S</span></span></div>
                    <div className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{row.wins} <span className="text-slate-400 font-bold uppercase tracking-tighter">W</span></span></div>
                    <div className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500" /><span className="text-xs font-black text-amber-700">{row.awardBonus} <span className="text-amber-400 font-bold uppercase tracking-tighter">P</span></span></div>
                    <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-indigo-500" /><span className="text-xs font-black text-indigo-700">{row.bonusScia} <span className="text-indigo-400 font-bold uppercase tracking-tighter">B</span></span></div>
                  </div>
                </div>
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm group-hover:border-beer-200 group-hover:bg-beer-50/30 transition-colors">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('fanta_points_label')}</div>
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
