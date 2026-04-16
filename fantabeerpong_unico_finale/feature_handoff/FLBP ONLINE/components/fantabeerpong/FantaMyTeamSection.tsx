import React from 'react';
import { AlertCircle, ArrowRight, Shield, Star, Trophy, Users, Wind } from 'lucide-react';
import { FANTA_MY_TEAM_MOCK } from '../../services/fantabeerpong/mockData';
import type { FantaMyTeamPlayer, FantaRosterRole } from '../../services/fantabeerpong/types';
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
  captain: { label: 'Capitano', className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: Star },
  defender: { label: 'Difensore', className: 'border-sky-200 bg-sky-50 text-sky-800', Icon: Wind },
  starter: { label: 'Titolare', className: 'border-slate-200 bg-slate-100 text-slate-700', Icon: Users },
};

const statusBadgeClass = (status: FantaMyTeamPlayer['status']) =>
  status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';
const statusLabel = (status: FantaMyTeamPlayer['status']) => status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';

export const FantaMyTeamSection: React.FC<Props> = ({ onOpenStandings, onOpenPlayers, onOpenRules, onOpenPlayerDetail, onOpenTeamBuilder }) => {
  const data = FANTA_MY_TEAM_MOCK;
  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700">
              <Shield className="h-3.5 w-3.5" />
              {data.editionLabel}
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.teamName}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.lockHint}</div>
          </div>
          {onOpenTeamBuilder && <button type="button" onClick={onOpenTeamBuilder} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">Crea / modifica squadra</button>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Giocatori selezionati" value={`${data.summary.selectedPlayers}/4`} hint="Rosa completa" />
        <MetricCard label="Capitano" value={data.summary.captainName} hint="Ruolo bonus assegnato" />
        <MetricCard label="Difensori" value={String(data.summary.defendersCount)} hint="Massimo consentito: 2" />
        <MetricCard label="Ranking attuale" value={data.summary.currentRankLabel} hint="Preview classifica generale" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className={panelClass}>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-xl font-black tracking-tight text-slate-950">Rosa fantasy</div><div className="mt-1 text-sm font-semibold text-slate-600">Card leggibili e drilldown giocatore con ritorno chiaro.</div></div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">Step operativo</div>
          </div>

          <div className="mt-4 space-y-3">
            {data.players.map((player) => {
              const role = roleMeta[player.role];
              const RoleIcon = role.Icon;
              return (
                <button key={player.id} type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-black tracking-tight text-slate-950">{player.playerName}</div>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${role.className}`}><RoleIcon className="h-3.5 w-3.5" />{role.label}</span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-600">{player.realTeamName}</div>
                      <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{player.note}</div>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Punti fantasy</div>
                      <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{player.fantasyPoints}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertCircle className="h-4.5 w-4.5" /></div>
              <div>
                <div className="text-sm font-black uppercase tracking-wide text-amber-900">Editing pronto per Codex</div>
                <div className="mt-1 text-sm font-semibold leading-6 text-amber-800">Nel package handoff trovi il builder separato, già cablato con i vincoli di ruolo e il back locale alla feature.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Vincoli di formazione</div>
            <div className="mt-4 space-y-3">
              {data.constraints.map((constraint) => (
                <div key={constraint.id} className={`rounded-2xl border px-4 py-3 ${constraint.satisfied ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'}`}>
                  <div className={`text-sm font-black ${constraint.satisfied ? 'text-emerald-900' : 'text-rose-900'}`}>{constraint.label}</div>
                  <div className={`mt-1 text-sm font-semibold ${constraint.satisfied ? 'text-emerald-800' : 'text-rose-800'}`}>{constraint.helper}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Prossime azioni</div>
            <div className="mt-4 space-y-3">
              <button type="button" onClick={onOpenPlayers} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-sm transition hover:bg-white hover:shadow-md">
                <div><div className="text-sm font-black text-slate-950">Controlla i giocatori live</div><div className="mt-1 text-sm font-semibold text-slate-600">Capisci chi sta spingendo di più nella tua rosa.</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
              </button>
              <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-sm transition hover:bg-white hover:shadow-md">
                <div><div className="text-sm font-black text-slate-950">Apri la classifica generale</div><div className="mt-1 text-sm font-semibold text-slate-600">Confronta il tuo roster con le altre squadre fantasy.</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <FantaQuickHelp topics={['roles', 'scoring']} onOpenRules={onOpenRules} compact title="Help rapido squadra" />
    </div>
  );
};
