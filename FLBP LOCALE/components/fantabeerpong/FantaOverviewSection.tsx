import React from 'react';
import { useTranslation } from '../../App';
import { ArrowRight, BarChart3, Clock3, History, Shield, Users, Loader2 } from 'lucide-react';
import { fetchFantaConfig, fetchFantaStandings, fetchFantaPlayerStandings, fetchUserFantaTeam } from '../../services/fantabeerpong/fantaSupabaseService';
import { FANTA_APP_CHANGE_EVENT, PLAYER_APP_CHANGE_EVENT, readPlayerPresenceSnapshot } from '../../services/playerAppService';
import type { FantaOverviewQuickAction, FantaConfig } from '../../services/fantabeerpong/types';
import { FantaQuickHelp } from './FantaQuickHelp';
import { MetricCard, panelClass } from './_shared';

interface Props {
  onOpenMyTeam: () => void;
  onOpenStandings: () => void;
  onOpenPlayers: () => void;
  onOpenRules: () => void;
  onOpenHistory: () => void;
  onOpenTeamBuilder: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  my_team: Shield,
  general_standings: BarChart3,
  players_standings: Users,
  rules: Shield,
  history: History,
  team_builder: Shield,
};

export const FantaOverviewSection: React.FC<Props> = ({
  onOpenMyTeam, onOpenStandings, onOpenPlayers, onOpenRules, onOpenHistory, onOpenTeamBuilder,
}) => {
  const { t } = useTranslation();
  const [config, setConfig] = React.useState<FantaConfig | null>(null);
  const [standings, setStandings] = React.useState<any[]>([]);
  const [players, setPlayers] = React.useState<any[]>([]);
  const [userTeam, setUserTeam] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState(readPlayerPresenceSnapshot);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const refresh = () => {
      setSession(readPlayerPresenceSnapshot());
      setRefreshKey((current) => current + 1);
    };
    window.addEventListener('storage', refresh);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, refresh as EventListener);
    window.addEventListener(FANTA_APP_CHANGE_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, refresh as EventListener);
      window.removeEventListener(FANTA_APP_CHANGE_EVENT, refresh as EventListener);
    };
  }, []);

  const resolveAction = (target: string) => {
    if (target === 'my_team') return onOpenMyTeam;
    if (target === 'general_standings') return onOpenStandings;
    if (target === 'players_standings') return onOpenPlayers;
    if (target === 'rules') return onOpenRules;
    if (target === 'history') return onOpenHistory;
    return onOpenTeamBuilder;
  };

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [cfg, stds, plyrs, team] = await Promise.all([
          fetchFantaConfig(),
          fetchFantaStandings(),
          fetchFantaPlayerStandings(),
          session?.accountId ? fetchUserFantaTeam(session.accountId) : Promise.resolve(null)
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setStandings(stds || []);
        setPlayers(plyrs || []);
        setUserTeam(team);
      } catch (err) {
        if (!cancelled) console.error('Error loading fanta overview:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session?.accountId, refreshKey]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">{t('fanta_loading_overview')}</p>
      </div>
    );
  }

  // Aggregate metrics
  const uniqueTeamsCount = new Set(standings.map(s => s.team_id)).size;
  const totalPoints = standings.reduce((acc, s) => acc + (s.total_points || 0), 0);

  const teamMap: Record<string, { rank: number; name: string; points: number; isMine: boolean }> = {};
  standings.forEach(s => {
    if (!teamMap[s.team_id]) {
      teamMap[s.team_id] = { rank: 0, name: s.team_name, points: 0, isMine: s.user_id === session?.accountId };
    }
    teamMap[s.team_id].points = s.total_points || 0;
  });
  const sortedTeams = Object.values(teamMap).sort((a,b) => b.points - a.points);
  const topTeams = sortedTeams.slice(0, 3).map((t, idx) => ({ ...t, rank: idx + 1 }));

  // Top players
  const topPlayers = [...players].sort((a,b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 3);
  const hasActiveTournament = Boolean(config?.activeTournamentId);
  const resultsOnlyTournament = Boolean(config?.activeTournamentResultsOnly);
  const hasFantaTournament = hasActiveTournament && !resultsOnlyTournament;
  const registrationOpen = hasFantaTournament && Boolean(config?.registrationOpen);

  const quickActions: FantaOverviewQuickAction[] = [
    { id: 'qa1', title: t('fanta_shell_my_team'), description: t('fanta_shell_my_team_helper'), target: 'my_team' },
    { id: 'qa2', title: t('fanta_shell_standings'), description: t('fanta_shell_standings_helper'), target: 'general_standings' },
    { id: 'qa3', title: t('fanta_shell_players'), description: t('fanta_shell_players_helper'), target: 'players_standings' },
    { id: 'qa4', title: t('fanta_shell_history'), description: t('fanta_shell_history_helper'), target: 'history' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
              <Clock3 className="h-3.5 w-3.5" />
              {!hasActiveTournament ? t('fanta_no_live_tournament') : resultsOnlyTournament ? t('fanta_live_results_only_tournament') : registrationOpen ? t('fanta_registration_open') : t('fanta_tournament_running')}
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">FantaBeerpong</div>
            <div className="mt-1 text-lg font-black tracking-tight text-slate-800">{hasActiveTournament ? config?.activeTournamentName || t('fanta_live_edition') : t('fanta_waiting_next_tournament')}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {!hasActiveTournament
                ? t('fanta_waiting_desc')
                : resultsOnlyTournament
                  ? t('fanta_results_only_desc')
                  : registrationOpen
                  ? t('fanta_create_before_start')
                  : t('fanta_market_closed_desc')}
            </div>
          </div>
          <button type="button" onClick={hasFantaTournament ? onOpenTeamBuilder : onOpenHistory} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">
            <Shield className="h-4 w-4" />
            {!hasFantaTournament ? t('fanta_view_archive') : userTeam ? t('fanta_edit_team') : t('fanta_create_team')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t('fanta_registered_teams')} value={uniqueTeamsCount.toString()} hint={t('fanta_total_fanta_teams')} />
        <MetricCard label={t('fanta_total_points_metric')} value={totalPoints.toString()} hint={t('fanta_points_gen_desc')} />
        <MetricCard label={t('fanta_market_metric')} value={!hasFantaTournament ? t('fanta_not_active') : registrationOpen ? t('fanta_open') : t('fanta_closed')} hint={!hasActiveTournament ? t('fanta_no_live_tournament') : resultsOnlyTournament ? t('fanta_live_results_only_tournament') : registrationOpen ? t('fanta_roster') : t('admin_sync_ok')} />
        <MetricCard label={t('fanta_prizes_metric')} value="TOP 3" hint={t('fanta_prizes_desc')} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_team_state')}</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">
              {!hasActiveTournament ? t('fanta_waiting_desc') : resultsOnlyTournament ? t('fanta_results_only_desc') : userTeam ? t('fanta_roster_ready') : t('fanta_no_team_created')}
            </div>
            {userTeam ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_shell_my_team_short')}</div><div className="mt-1 text-base font-black text-slate-950 truncate">{userTeam.team.name}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_shell_players_short')}</div><div className="mt-1 text-base font-black text-slate-950">{userTeam.roster.length}/4</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_captain')}</div><div className="mt-1 text-base font-black text-slate-950 truncate">{userTeam.roster.find((r: any) => r.role === 'captain')?.player_name || '-'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_defenders')}</div><div className="mt-1 text-base font-black text-slate-950">{userTeam.roster.filter((r: any) => r.role === 'defender').length}/2</div></div>
              </div>
            ) : (
              <div className="mt-4">
                <button type="button" onClick={hasFantaTournament ? onOpenTeamBuilder : onOpenHistory} className="w-full rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center transition hover:border-beer-300 hover:bg-slate-50">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Shield className="h-6 w-6" /></div>
                  <div className="mt-3 text-sm font-black text-slate-900 uppercase tracking-wide">{hasFantaTournament ? t('fanta_click_to_start') : t('fanta_go_to_history')}</div>
                </button>
              </div>
            )}
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_quick_access')}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = iconMap[action.target];
                return (
                  <button key={action.id} type="button" onClick={resolveAction(action.target)} className="group rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-sm transition hover:bg-white hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-100"><Icon className="h-4 w-4" /></div>
                      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </div>
                    <div className="mt-4 text-base font-black tracking-tight text-slate-950">{action.title}</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{action.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_standings_preview')}</div>
            <div className="mt-4 space-y-3">
              {topTeams.map((row) => (
                <button key={row.name} type="button" onClick={onOpenStandings} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${row.isMine ? 'border-beer-200 bg-beer-50/60' : 'border-slate-200 bg-white'}`}>
                  <div><div className="text-sm font-black text-slate-950">#{row.rank} · {row.name}</div><div className="text-xs font-bold text-slate-500">{row.isMine ? t('fanta_your_team') : t('fanta_running')}</div></div>
                  <div className="text-lg font-black text-slate-950">{row.points}</div>
                </button>
              ))}
              {topTeams.length === 0 && <div className="py-4 text-center text-xs font-bold text-slate-400 italic">{t('fanta_no_scores_yet')}</div>}
            </div>
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_top_players_live')}</div>
            <div className="mt-4 space-y-3">
              {topPlayers.map((row) => (
                <button key={row.player_key} type="button" onClick={onOpenPlayers} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-white hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-slate-950">{row.player_name}</div><div className="truncate text-xs font-bold text-slate-500">{row.real_team_name}</div></div>
                    <div className="text-lg font-black text-slate-950">{row.total_points || 0}</div>
                  </div>
                </button>
              ))}
              {topPlayers.length === 0 && <div className="py-4 text-center text-xs font-bold text-slate-400 italic">{t('fanta_no_players_data')}</div>}
            </div>
          </div>
        </div>
      </div>

      <FantaQuickHelp topics={['roles', 'scoring', 'bonus_scia']} onOpenRules={onOpenRules} compact title={t('fanta_quick_help_overview')} />
    </div>
  );
};
