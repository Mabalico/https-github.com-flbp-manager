import React from 'react';
import { ArrowRight, BarChart3, Clock3, History, Shield, Users, Loader2 } from 'lucide-react';
import { fetchFantaConfig, fetchFantaStandings, fetchFantaPlayerStandings, fetchUserFantaTeam } from '../../services/fantabeerpong/fantaSupabaseService';
import { readPlayerPresenceSnapshot } from '../../services/playerAppService';
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
  const [config, setConfig] = React.useState<FantaConfig | null>(null);
  const [standings, setStandings] = React.useState<any[]>([]);
  const [players, setPlayers] = React.useState<any[]>([]);
  const [userTeam, setUserTeam] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [session] = React.useState(readPlayerPresenceSnapshot());

  const resolveAction = (target: string) => {
    if (target === 'my_team') return onOpenMyTeam;
    if (target === 'general_standings') return onOpenStandings;
    if (target === 'players_standings') return onOpenPlayers;
    if (target === 'rules') return onOpenRules;
    if (target === 'history') return onOpenHistory;
    return onOpenTeamBuilder;
  };

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cfg, stds, plyrs, team] = await Promise.all([
          fetchFantaConfig(),
          fetchFantaStandings(),
          fetchFantaPlayerStandings(),
          session?.accountId ? fetchUserFantaTeam(session.accountId) : Promise.resolve(null)
        ]);
        setConfig(cfg);
        setStandings(stds || []);
        setPlayers(plyrs || []);
        setUserTeam(team);
      } catch (err) {
        console.error('Error loading fanta overview:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">Preparazione panoramica...</p>
      </div>
    );
  }

  // Aggregate metrics
  const uniqueTeamsCount = new Set(standings.map(s => s.team_id)).size;
  const totalPoints = standings.reduce((acc, s) => acc + (s.weighted_goals || 0), 0);

  // Standings grouping logic to get top 3 teams
  const teamMap: Record<string, { rank: number; name: string; points: number; isMine: boolean }> = {};
  standings.forEach(s => {
    if (!teamMap[s.team_id]) {
      teamMap[s.team_id] = { rank: 0, name: s.team_name, points: 0, isMine: s.user_id === session?.accountId };
    }
    teamMap[s.team_id].points += s.weighted_goals || 0;
  });
  const sortedTeams = Object.values(teamMap).sort((a,b) => b.points - a.points);
  const topTeams = sortedTeams.slice(0, 3).map((t, idx) => ({ ...t, rank: idx + 1 }));

  // Top players
  const topPlayers = [...players].sort((a,b) => b.live_points - a.live_points).slice(0, 3);

  const quickActions: FantaOverviewQuickAction[] = [
    { id: 'qa1', title: 'La mia squadra', description: 'Gestisci la tua formazione e vedi i punti live.', target: 'my_team' },
    { id: 'qa2', title: 'Classifica generale', description: 'Guarda chi sta dominando il torneo fantasy.', target: 'general_standings' },
    { id: 'qa3', title: 'Ranking giocatori', description: 'Analizza le performance dei singoli giocatori.', target: 'players_standings' },
    { id: 'qa4', title: 'Storico edizioni', description: 'Ripercorri i vincitori dei tornei passati.', target: 'history' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
              <Clock3 className="h-3.5 w-3.5" />
              {config?.registrationOpen ? 'ISCRIZIONI APERTE' : 'TORNEO IN CORSO'}
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">FantaBeerpong {new Date().getFullYear()}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {config?.isLockActive ? 'Il mercato è chiuso. Segui l\'andamento dei tuoi giocatori!' : 'Crea la tua squadra prima dell\'inizio del torneo.'}
            </div>
          </div>
          <button type="button" onClick={onOpenTeamBuilder} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">
            <Shield className="h-4 w-4" />
            {userTeam ? 'Modifica squadra' : 'Crea squadra'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Squadre iscritte" value={uniqueTeamsCount.toString()} hint="Team fantasy totali" />
        <MetricCard label="Punti totali" value={totalPoints.toString()} hint="Generati dai giocatori" />
        <MetricCard label="Mercato" value={config?.isLockActive ? 'Chiuso' : 'Aperto'} hint={config?.isLockActive ? 'Statistiche live' : 'Creazione rosa'} />
        <MetricCard label="Premi" value="TOP 3" hint="Gadget FLBP & Gloria" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Stato squadra fantasy</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">
              {userTeam ? 'La tua rosa è pronta per la competizione.' : 'Non hai ancora creato una squadra per questa edizione.'}
            </div>
            {userTeam ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Squadra</div><div className="mt-1 text-base font-black text-slate-950 truncate">{userTeam.team.name}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Giocatori</div><div className="mt-1 text-base font-black text-slate-950">{userTeam.roster.length}/4</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Capitano</div><div className="mt-1 text-base font-black text-slate-950 truncate">{userTeam.roster.find((r: any) => r.role === 'captain')?.player_id || '-'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Bonus</div><div className="mt-1 text-base font-black text-slate-950">Attivo</div></div>
              </div>
            ) : (
              <div className="mt-4">
                <button type="button" onClick={onOpenTeamBuilder} className="w-full rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center transition hover:border-beer-300 hover:bg-slate-50">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Shield className="h-6 w-6" /></div>
                  <div className="mt-3 text-sm font-black text-slate-900 uppercase tracking-wide">Clicca qui per iniziare</div>
                </button>
              </div>
            )}
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Accessi rapidi</div>
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
            <div className="text-xl font-black tracking-tight text-slate-950">Preview classifica</div>
            <div className="mt-4 space-y-3">
              {topTeams.map((row) => (
                <button key={row.name} type="button" onClick={onOpenStandings} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${row.isMine ? 'border-beer-200 bg-beer-50/60' : 'border-slate-200 bg-white'}`}>
                  <div><div className="text-sm font-black text-slate-950">#{row.rank} · {row.name}</div><div className="text-xs font-bold text-slate-500">{row.isMine ? 'Tua squadra' : 'In corsa'}</div></div>
                  <div className="text-lg font-black text-slate-950">{row.points}</div>
                </button>
              ))}
              {topTeams.length === 0 && <div className="py-4 text-center text-xs font-bold text-slate-400 italic">Nessun punteggio ancora.</div>}
            </div>
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Top players live</div>
            <div className="mt-4 space-y-3">
              {topPlayers.map((row) => (
                <button key={row.player_key} type="button" onClick={onOpenPlayers} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-white hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-slate-950">{row.player_name}</div><div className="truncate text-xs font-bold text-slate-500">{row.real_team_name}</div></div>
                    <div className="text-lg font-black text-slate-950">{row.live_points}</div>
                  </div>
                </button>
              ))}
              {topPlayers.length === 0 && <div className="py-4 text-center text-xs font-bold text-slate-400 italic">Nessun dato giocatori.</div>}
            </div>
          </div>
        </div>
      </div>

      <FantaQuickHelp topics={['roles', 'scoring', 'bonus_scia']} onOpenRules={onOpenRules} compact title="Help rapido panoramica" />
    </div>
  );
};
