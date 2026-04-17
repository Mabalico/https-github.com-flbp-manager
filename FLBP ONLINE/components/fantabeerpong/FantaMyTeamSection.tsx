import React from 'react';
import { AlertCircle, ArrowRight, Shield, Star, Users, Wind, Target, Zap, Trophy, History, Loader2, LogIn } from 'lucide-react';
import { fetchFantaStandings, fetchFantaTeamDetail, fetchUserFantaTeam } from '../../services/fantabeerpong/fantaSupabaseService';
import { readPlayerPresenceSnapshot } from '../../services/playerAppService';
import { loadState } from '../../services/storageService';
import { getPlayerKeyLabel } from '../../services/playerIdentity';
import type { FantaMyTeamPlayer, FantaRosterRole, FantaMyTeam } from '../../services/fantabeerpong/types';
import { FantaQuickHelp } from './FantaQuickHelp';
import { MetricCard, panelClass } from './_shared';

interface Props {
  onOpenStandings: () => void;
  onOpenPlayers: () => void;
  onOpenRules: () => void;
  onOpenPlayerDetail?: (playerId: string) => void;
  onOpenTeamBuilder?: () => void;
}

const roleMeta: Record<FantaRosterRole, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  captain:  { label: 'Capitano', className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: Star },
  defender: { label: 'Difensore', className: 'border-sky-200 bg-sky-50 text-sky-800', Icon: Wind },
  starter:  { label: 'Titolare', className: 'border-slate-200 bg-slate-100 text-slate-700', Icon: Users },
};

const statusBadgeClass = (status: FantaMyTeamPlayer['status']) =>
  status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';
const statusLabel = (status: FantaMyTeamPlayer['status']) => status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';

export const FantaMyTeamSection: React.FC<Props> = ({ onOpenStandings, onOpenPlayers, onOpenRules, onOpenPlayerDetail, onOpenTeamBuilder }) => {
  const [data, setData] = React.useState<FantaMyTeam | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState(readPlayerPresenceSnapshot());

  React.useEffect(() => {
    async function load() {
      if (!session?.accountId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await fetchUserFantaTeam(session.accountId);
        if (result) {
          const [liveStats, standings] = await Promise.all([
            fetchFantaTeamDetail(result.team.id),
            fetchFantaStandings(),
          ]);
          const appState = loadState();
          
          let totalGoalPoints = 0, totalBlowPoints = 0, totalWinPoints = 0, totalBonusScia = 0, totalFantasyPoints = 0;
          
          const players = result.roster.map(r => {
             const stat = liveStats.find((s: any) => s.player_id === r.player_id) || {};
             const label = getPlayerKeyLabel(r.player_id);
             
             let realTeamName = stat.real_team_name || r.real_team_name || 'In gara';
             for (const t of appState.teams || []) {
                if (!stat.real_team_name && (t.player1 === label.name || t.player2 === label.name)) {
                   realTeamName = t.name;
                   break;
                }
             }

             const goals = stat.raw_goals || 0;
             const blows = stat.raw_blows || 0;
             const wins = stat.raw_wins || 0;
             const bonusScia = stat.bonus_scia || 0;
             const fp = stat.total_points || 0;
             
             totalGoalPoints += stat.points_from_goals || goals;
             totalBlowPoints += stat.points_from_blows || blows * 2;
             totalWinPoints += stat.points_from_wins || wins * 7;
             totalBonusScia += bonusScia;
             totalFantasyPoints += fp;

             return {
                id: r.player_id,
                playerName: stat.player_name || r.player_name || label.name,
                realTeamName,
                role: r.role as FantaRosterRole,
                status: stat.status || 'waiting',
                note: stat.status === 'eliminated' && stat.eliminated_by_team_name
                  ? `Eliminato da ${stat.eliminated_by_team_name}.`
                  : 'Punteggio sincronizzato dal torneo live.',
                goals,
                blows,
                wins,
                bonusScia,
                fantasyPoints: fp
             };
          });

          const rank = standings.findIndex((row) => row.team_id === result.team.id) + 1;
          const teamsToFollow = liveStats
            .filter((row: any) => row.status === 'eliminated' && row.eliminated_by_team_name)
            .map((row: any) => ({
              id: `${row.player_id}-${row.eliminated_by_team_id || row.eliminated_by_team_name}`,
              teamName: row.eliminated_by_team_name,
              followingFor: row.player_name || getPlayerKeyLabel(row.player_id).name,
            }));

          const mapped: FantaMyTeam = {
            id: result.team.id,
            teamName: result.team.name,
            editionLabel: 'EDIZIONE LIVE',
            buildStatus: 'ready',
            buildStatusLabel: 'Confermata',
            lockLabel: 'Rosa live',
            lockHint: 'Squadra sincronizzata con Supabase.',
            summary: {
              selectedPlayers: players.length,
              currentRankLabel: rank > 0 ? `#${rank}` : '-',
              captainName: players.find(p => p.role === 'captain')?.playerName || 'N/A',
              defendersCount: players.filter(p => p.role === 'defender').length,
              totalPoints: totalFantasyPoints
            },
            pointsBreakdown: { goals: totalGoalPoints, blows: totalBlowPoints, wins: totalWinPoints, bonusScia: totalBonusScia },
            players,
            teamsToFollow,
            constraints: [
              { id: 'players', label: '4 giocatori selezionati', satisfied: players.length === 4, helper: `${players.length}/4 giocatori in rosa.` },
              { id: 'captain', label: '1 capitano assegnato', satisfied: players.filter(p => p.role === 'captain').length === 1, helper: players.find(p => p.role === 'captain')?.playerName || 'Capitano mancante.' },
              { id: 'defenders', label: '2 difensori obbligatori', satisfied: players.filter(p => p.role === 'defender').length === 2, helper: `${players.filter(p => p.role === 'defender').length}/2 difensori.` },
            ],
            notes: ['I punteggi arrivano dal torneo live e rispettano i ruoli FantaBeerpong.']
          };
          setData(mapped);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500">Recupero squadra Fanta...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border border-slate-200 border-dashed text-center px-6">
        <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-6">
          <LogIn className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-2xl font-black text-slate-900">Accesso richiesto</h3>
        <p className="mt-2 text-slate-600 max-w-sm font-semibold">Devi essere loggato con il tuo account giocatore per creare o visualizzare la tua squadra Fanta.</p>
        <button type="button" onClick={() => (window as any).flbpOpenPlayerArea?.()} className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-slate-800">Accedi ora</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border border-slate-200 border-dashed text-center px-6">
        <div className="h-16 w-16 bg-beer-50 rounded-full flex items-center justify-center mb-6">
          <Shield className="h-8 w-8 text-beer-500" />
        </div>
        <h3 className="text-2xl font-black text-slate-900">Nessuna squadra trovata</h3>
        <p className="mt-2 text-slate-600 max-w-sm font-semibold">Non hai ancora creato una squadra per questa edizione live. Partecipa ora!</p>
        {onOpenTeamBuilder && <button type="button" onClick={onOpenTeamBuilder} className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-beer-500 px-8 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-xl transition hover:bg-beer-600">Crea la tua squadra</button>}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700">
              <Shield className="h-3.5 w-3.5" />
              {data.editionLabel}
            </div>
            <div className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{data.teamName}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.lockHint}</div>
          </div>
          {onOpenTeamBuilder && <button type="button" onClick={onOpenTeamBuilder} className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl bg-beer-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 focus:outline-none focus:ring-2 focus:ring-beer-500/40">Crea / modifica squadra</button>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ranking attuale" value={data.summary.currentRankLabel} hint="Preview classifica generale" />
        <MetricCard label="Capitano" value={data.summary.captainName} hint="Punti raddoppiati x2" />
        <MetricCard label="Difensori" value={`${data.summary.defendersCount}/2`} hint="Soffi raddoppiati x2" />
        <MetricCard label="Punti Totali" value={String(data.summary.totalPoints || 0)} hint="Snapshot live" />
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Breakdown Punteggi Squadra</div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Target className="h-3 w-3" />Canestri</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.goals}</div>
            <div className="text-[10px] font-bold text-slate-400">1 pt cad.</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Wind className="h-3 w-3" />Soffi</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.blows}</div>
            <div className="text-[10px] font-bold text-slate-400">2 pt cad.</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Trophy className="h-3 w-3" />Vittorie</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{data.pointsBreakdown.wins}</div>
            <div className="text-[10px] font-bold text-slate-400">7 pt cad.</div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-600"><Zap className="h-3 w-3" />Bonus Scia</div>
            <div className="mt-1 text-2xl font-black text-indigo-700">{data.pointsBreakdown.bonusScia}</div>
            <div className="text-[10px] font-bold text-indigo-400">5 pt vitt. avv.</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xl font-black tracking-tight text-slate-950">Rosa Fanta</div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">{data.players.length}/4 Giocatori</div>
            </div>

            <div className="mt-6 space-y-4">
              {data.players.map((player) => {
                const role = roleMeta[player.role];
                const RoleIcon = role.Icon;
                return (
                  <button key={player.id} type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="group w-full rounded-[26px] border border-slate-200 bg-slate-50 p-1 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-xl">
                    <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-black tracking-tight text-slate-950 group-hover:text-beer-700 transition-colors">{player.playerName}</div>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${role.className}`}><RoleIcon className="h-3 w-3" />{role.label}</span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-500 uppercase tracking-tight">{player.realTeamName}</div>
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                          <div className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{player.goals} <span className="text-slate-400 font-bold uppercase tracking-tighter">G</span></span></div>
                          <div className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{player.blows} <span className="text-slate-400 font-bold uppercase tracking-tighter">S</span></span></div>
                          <div className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-black text-slate-700">{player.wins} <span className="text-slate-400 font-bold uppercase tracking-tighter">W</span></span></div>
                          {player.status === 'eliminated' && <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-indigo-500" /><span className="text-xs font-black text-indigo-700">{player.bonusScia} <span className="text-indigo-400 font-bold uppercase tracking-tighter">B</span></span></div>}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm group-hover:border-beer-200 group-hover:bg-beer-50/30 transition-colors">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Punti</div>
                        <div className="mt-1 text-3xl font-black tracking-tighter text-slate-950">{player.fantasyPoints}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className={panelClass}>
            <div className="flex items-center gap-2 text-lg font-black text-indigo-950"><History className="h-5 w-5 text-indigo-600" />Bonus Scia Attivo</div>
            <div className="mt-4 text-sm font-semibold text-slate-600 leading-relaxed italic">Segui queste squadre reali per ottenere 5 punti extra in caso di loro vittoria:</div>
            <div className="mt-4 space-y-3">
              {data.teamsToFollow.map((t) => (
                <div key={t.id} className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm">
                  <div className="text-sm font-black text-indigo-950">{t.teamName}</div>
                  <div className="mt-1 text-xs font-bold text-indigo-700 uppercase tracking-tighter">Motivo: {t.followingFor}</div>
                </div>
              ))}
              {data.teamsToFollow.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400 italic">Nessun bonus scia attivo al momento.</div>}
            </div>
          </div>

          <div className={panelClass}>
            <div className="text-lg font-black text-slate-950">Prossime azioni</div>
            <div className="mt-4 space-y-3">
              <button type="button" onClick={onOpenPlayers} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50">
                <div><div className="text-sm font-black text-slate-950">Statistiche live giocatori</div><div className="mt-0.5 text-xs font-semibold text-slate-500">Analizza le performance di tutti.</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
              <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50">
                <div><div className="text-sm font-black text-slate-950">Classifica generale</div><div className="mt-0.5 text-xs font-semibold text-slate-500">Confronta il tuo punteggio.</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <FantaQuickHelp topics={['roles', 'scoring']} onOpenRules={onOpenRules} compact title="Ti serve aiuto?" />
    </div>
  );
};
