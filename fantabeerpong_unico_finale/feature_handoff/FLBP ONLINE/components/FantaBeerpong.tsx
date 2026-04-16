import React from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { PublicBrandStack } from './PublicBrandStack';
import type { FantaShellSectionKey } from '../services/fantabeerpong/types';
import { FANTA_SHELL_SECTIONS } from './fantabeerpong/fantaShellSections';
import { FantaOverviewSection } from './fantabeerpong/FantaOverviewSection';
import { FantaMyTeamSection } from './fantabeerpong/FantaMyTeamSection';
import { FantaGeneralStandingsSection } from './fantabeerpong/FantaGeneralStandingsSection';
import { FantaPlayersStandingsSection } from './fantabeerpong/FantaPlayersStandingsSection';
import { FantaRulesSection } from './fantabeerpong/FantaRulesSection';
import { FantaHistorySection } from './fantabeerpong/FantaHistorySection';
import { FantaTeamDetail } from './fantabeerpong/FantaTeamDetail';
import { FantaPlayerDetail } from './fantabeerpong/FantaPlayerDetail';
import { FantaHistoryEditionDetail } from './fantabeerpong/FantaHistoryEditionDetail';
import { FantaTeamBuilder } from './fantabeerpong/FantaTeamBuilder';

interface Props { onBack: () => void; }

export const FantaBeerpong: React.FC<Props> = ({ onBack }) => {
  const [activeSection, setActiveSection] = React.useState<FantaShellSectionKey>('overview');
  const [selectedFantasyTeamId, setSelectedFantasyTeamId] = React.useState<string | null>(null);
  const [selectedFantasyPlayerId, setSelectedFantasyPlayerId] = React.useState<string | null>(null);
  const [selectedHistoryEditionId, setSelectedHistoryEditionId] = React.useState<string | null>(null);
  const [teamBuilderOpen, setTeamBuilderOpen] = React.useState(false);

  const openPlayerDetail = (playerId: string) => setSelectedFantasyPlayerId(playerId);

  if (teamBuilderOpen) {
    return (
      <FantaTeamBuilder
        onBack={() => setTeamBuilderOpen(false)}
        onOpenRules={() => { setTeamBuilderOpen(false); setActiveSection('rules'); }}
        onOpenPlayerDetail={(playerId) => openPlayerDetail(playerId)}
      />
    );
  }

  if (selectedFantasyTeamId) {
    return <FantaTeamDetail teamId={selectedFantasyTeamId} onBack={() => setSelectedFantasyTeamId(null)} onOpenPlayerDetail={openPlayerDetail} />;
  }

  if (selectedFantasyPlayerId) {
    return (
      <FantaPlayerDetail
        playerId={selectedFantasyPlayerId}
        onBack={() => setSelectedFantasyPlayerId(null)}
        onOpenMyTeam={() => { setSelectedFantasyPlayerId(null); setActiveSection('my_team'); }}
      />
    );
  }

  if (selectedHistoryEditionId) {
    return <FantaHistoryEditionDetail editionId={selectedHistoryEditionId} onBack={() => setSelectedHistoryEditionId(null)} />;
  }

  const currentSection = FANTA_SHELL_SECTIONS.find((section) => section.key === activeSection) || FANTA_SHELL_SECTIONS[0];

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'overview':
        return <FantaOverviewSection onOpenMyTeam={() => setActiveSection('my_team')} onOpenStandings={() => setActiveSection('general_standings')} onOpenPlayers={() => setActiveSection('players_standings')} onOpenRules={() => setActiveSection('rules')} onOpenHistory={() => setActiveSection('history')} onOpenTeamBuilder={() => setTeamBuilderOpen(true)} />;
      case 'my_team':
        return <FantaMyTeamSection onOpenStandings={() => setActiveSection('general_standings')} onOpenPlayers={() => setActiveSection('players_standings')} onOpenRules={() => setActiveSection('rules')} onOpenPlayerDetail={openPlayerDetail} onOpenTeamBuilder={() => setTeamBuilderOpen(true)} />;
      case 'general_standings':
        return <FantaGeneralStandingsSection onOpenMyTeam={() => setActiveSection('my_team')} onOpenPlayers={() => setActiveSection('players_standings')} onOpenTeamDetail={(teamId) => setSelectedFantasyTeamId(teamId)} />;
      case 'players_standings':
        return <FantaPlayersStandingsSection onOpenMyTeam={() => setActiveSection('my_team')} onOpenStandings={() => setActiveSection('general_standings')} onOpenPlayerDetail={openPlayerDetail} />;
      case 'rules':
        return <FantaRulesSection onOpenMyTeam={() => setActiveSection('my_team')} onOpenStandings={() => setActiveSection('general_standings')} onOpenHistory={() => setActiveSection('history')} />;
      case 'history':
      default:
        return <FantaHistorySection onOpenRules={() => setActiveSection('rules')} onOpenStandings={() => setActiveSection('general_standings')} onOpenEditionDetail={(editionId) => setSelectedHistoryEditionId(editionId)} />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-slate-900 p-5 text-white shadow-xl md:p-7">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-beer-500/20 to-transparent" />
          <div className="absolute -left-8 -top-10 h-36 w-36 rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <PublicBrandStack className="mb-3" />
              <div className="inline-flex items-center gap-2 rounded-full border border-beer-400/25 bg-beer-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-100">
                <Trophy className="h-3.5 w-3.5" />
                FantaBeerpong
              </div>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">FantaBeerpong</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/75">Shell finale della feature fantasy, costruita sui pattern reali dell'app: navigazione interna semplice, card coerenti e drilldown con ritorni chiari.</p>
            </div>
            <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-black uppercase tracking-wide text-white transition hover:bg-white/20">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-white/70">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">Entry feature</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">Mobile-first</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">UI coerente con app</span>
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex max-w-full flex-nowrap gap-2 overflow-x-auto" role="toolbar" aria-label="Sezioni FantaBeerpong">
          {FANTA_SHELL_SECTIONS.map((section) => {
            const Icon = section.icon;
            const active = section.key === activeSection;
            return (
              <button key={section.key} type="button" onClick={() => setActiveSection(section.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wide transition ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                <Icon className="h-4 w-4" />
                {section.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Sezione attiva</div>
        <div className="mt-1 text-xl font-black tracking-tight text-slate-950">{currentSection.label}</div>
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{currentSection.helper}</div>
      </div>

      {renderSectionContent()}
    </div>
  );
};
