import React from 'react';
import { ArrowRight, BarChart3, Clock3, History, Shield, Users } from 'lucide-react';
import { FANTA_OVERVIEW_MOCK } from '../../services/fantabeerpong/mockData';
import type { FantaOverviewQuickAction } from '../../services/fantabeerpong/types';
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

const iconMap: Record<FantaOverviewQuickAction['target'], React.ComponentType<{ className?: string }>> = {
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
  const data = FANTA_OVERVIEW_MOCK;
  const resolveAction = (target: FantaOverviewQuickAction['target']) => {
    if (target === 'my_team') return onOpenMyTeam;
    if (target === 'general_standings') return onOpenStandings;
    if (target === 'players_standings') return onOpenPlayers;
    if (target === 'rules') return onOpenRules;
    if (target === 'history') return onOpenHistory;
    return onOpenTeamBuilder;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
              <Clock3 className="h-3.5 w-3.5" />
              {data.liveLabel}
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.editionLabel}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.liveHint}</div>
          </div>
          <button type="button" onClick={onOpenTeamBuilder} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">
            <Shield className="h-4 w-4" />
            Crea / modifica squadra
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((m) => <MetricCard key={m.id} label={m.label} value={m.value} hint={m.hint} />)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Stato squadra fantasy</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">{data.teamBuildStatusHint}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Squadra</div><div className="mt-1 text-base font-black text-slate-950">{data.teamName}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Giocatori</div><div className="mt-1 text-base font-black text-slate-950">{data.lineupSummary.selectedPlayers}/4</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Capitano</div><div className="mt-1 text-base font-black text-slate-950">{data.lineupSummary.captainName}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Difensori</div><div className="mt-1 text-base font-black text-slate-950">{data.lineupSummary.defendersCount}</div></div>
            </div>
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Accessi rapidi</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data.quickActions.map((action) => {
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
              {data.standingsPreview.map((row) => (
                <button key={row.id} type="button" onClick={onOpenStandings} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${row.isMine ? 'border-beer-200 bg-beer-50/60' : 'border-slate-200 bg-white'}`}>
                  <div><div className="text-sm font-black text-slate-950">#{row.rank} · {row.teamName}</div><div className="text-xs font-bold text-slate-500">{row.gapLabel}</div></div>
                  <div className="text-lg font-black text-slate-950">{row.points}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Preview giocatori live</div>
            <div className="mt-4 space-y-3">
              {data.livePlayersPreview.map((row) => (
                <button key={row.id} type="button" onClick={onOpenPlayers} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="text-sm font-black text-slate-950">{row.playerName}</div><div className="text-xs font-bold text-slate-500">{row.teamName} · {row.roleLabel}</div></div>
                    <div className="text-lg font-black text-slate-950">{row.fantasyPoints}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <FantaQuickHelp topics={['roles', 'scoring', 'bonus_scia']} onOpenRules={onOpenRules} compact title="Help rapido panoramica" />
    </div>
  );
};
