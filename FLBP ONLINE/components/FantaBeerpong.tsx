import React from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useTranslation } from '../App';
import { PublicBrandStack } from './PublicBrandStack';
import type { FantaConfig, FantaShellSectionKey } from '../services/fantabeerpong/types';
import { fetchFantaConfig, fetchPendingFantaRosterChangeNotices, invalidateFantaConfigCache, markFantaRosterChangeNoticesSeen } from '../services/fantabeerpong/fantaSupabaseService';
import { FANTA_APP_CHANGE_EVENT, PLAYER_APP_CHANGE_EVENT, readPlayerPresenceSnapshot } from '../services/playerAppService';
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
import { panelClass } from './fantabeerpong/_shared';
import type { FantaRosterChangeNotice } from '../services/fantabeerpong/types';

interface Props { onBack: () => void; }

export const FantaBeerpong: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = React.useState<FantaShellSectionKey>('overview');
  const [selectedFantasyTeamId, setSelectedFantasyTeamId] = React.useState<string | null>(null);
  const [selectedFantasyPlayerId, setSelectedFantasyPlayerId] = React.useState<string | null>(null);
  const [selectedHistoryEditionId, setSelectedHistoryEditionId] = React.useState<string | null>(null);
  const [teamBuilderOpen, setTeamBuilderOpen] = React.useState(false);
  const [shellConfig, setShellConfig] = React.useState<FantaConfig | null>(null);
  const [shellConfigLoaded, setShellConfigLoaded] = React.useState(false);
  const [preTournamentInfoOpen, setPreTournamentInfoOpen] = React.useState(false);
  const [rosterChangeNotices, setRosterChangeNotices] = React.useState<FantaRosterChangeNotice[]>([]);

  const openPlayerDetail = (playerId: string) => setSelectedFantasyPlayerId(playerId);
  const shellResultsOnly = Boolean(shellConfig?.activeTournamentResultsOnly);
  const shellPreTournament = Boolean(shellConfig?.isPreTournament);

  React.useEffect(() => {
    let active = true;

    const loadShellConfig = async (opts?: { force?: boolean; showLoading?: boolean }) => {
      if (opts?.showLoading) setShellConfigLoaded(false);
      if (opts?.force) invalidateFantaConfigCache();
      try {
        const config = await fetchFantaConfig({ force: opts?.force });
        if (!active) return;
        setShellConfig(config);
      } catch {
        if (!active) return;
        setShellConfig(null);
      } finally {
        if (!active) return;
        setShellConfigLoaded(true);
      }
    };

    const refreshShellConfig = () => {
      void loadShellConfig({ force: true });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshShellConfig();
    };

    void loadShellConfig({ force: true, showLoading: true });
    window.addEventListener(FANTA_APP_CHANGE_EVENT, refreshShellConfig as EventListener);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, refreshShellConfig as EventListener);
    window.addEventListener('flbp:live-state-committed', refreshShellConfig as EventListener);
    window.addEventListener('focus', refreshShellConfig);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      window.removeEventListener(FANTA_APP_CHANGE_EVENT, refreshShellConfig as EventListener);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, refreshShellConfig as EventListener);
      window.removeEventListener('flbp:live-state-committed', refreshShellConfig as EventListener);
      window.removeEventListener('focus', refreshShellConfig);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  React.useEffect(() => {
    if (!shellConfigLoaded || !shellPreTournament) return;
    try {
      if (localStorage.getItem('flbp_fanta_pretournament_info_seen_v1') === '1') return;
    } catch {
      // If storage is unavailable, still show the explanation once for this session.
    }
    setPreTournamentInfoOpen(true);
  }, [shellConfigLoaded, shellPreTournament]);

  React.useEffect(() => {
    let active = true;
    const loadNotices = async () => {
      const session = readPlayerPresenceSnapshot();
      if (!session?.accountId) {
        if (active) setRosterChangeNotices([]);
        return;
      }
      const notices = await fetchPendingFantaRosterChangeNotices();
      if (active) setRosterChangeNotices(notices);
    };

    void loadNotices();
    const loadWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadNotices();
    };
    window.addEventListener(FANTA_APP_CHANGE_EVENT, loadNotices as EventListener);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, loadNotices as EventListener);
    window.addEventListener('focus', loadNotices);
    document.addEventListener('visibilitychange', loadWhenVisible);
    return () => {
      active = false;
      window.removeEventListener(FANTA_APP_CHANGE_EVENT, loadNotices as EventListener);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, loadNotices as EventListener);
      window.removeEventListener('focus', loadNotices);
      document.removeEventListener('visibilitychange', loadWhenVisible);
    };
  }, []);

  const closePreTournamentInfo = () => {
    try {
      localStorage.setItem('flbp_fanta_pretournament_info_seen_v1', '1');
    } catch {
      // ignore
    }
    setPreTournamentInfoOpen(false);
  };

  const acknowledgeRosterChangeNotices = async () => {
    const ids = rosterChangeNotices.map((notice) => notice.id);
    setRosterChangeNotices([]);
    await markFantaRosterChangeNoticesSeen(ids);
  };

  const renderShellHero = () => (
    <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-slate-900 p-4 text-white shadow-xl md:rounded-[30px] md:p-7">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-beer-500/20 to-transparent" />
        <div className="absolute -left-8 -top-10 h-36 w-36 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <PublicBrandStack className="mb-2 scale-90 origin-left md:mb-3 md:scale-100" />
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-400/25 bg-beer-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-100">
              <Trophy className="h-3.5 w-3.5" />
              FantaBeerpong
            </div>
            <h1 className="mt-3 max-w-[14rem] truncate text-3xl font-black uppercase tracking-tight text-white sm:max-w-none sm:text-4xl">{t('fanta_shell_title')}</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/75 md:text-base">{t('fanta_shell_subtitle')}</p>
            {shellResultsOnly && (
              <p className="mt-3 max-w-2xl rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-black leading-6 text-amber-50">
                {t('fanta_results_only_desc')}
              </p>
            )}
            {shellPreTournament && (
              <p className="mt-3 max-w-2xl rounded-2xl border border-beer-300/25 bg-beer-300/10 px-4 py-3 text-sm font-black leading-6 text-beer-50">
                Fase Pretorneo: puoi creare la squadra Fanta usando i giocatori già inseriti in Area Admin. Quando verrà generato il tabellone, questa edizione prenderà il nome del torneo reale.
              </p>
            )}
          </div>
          <button type="button" onClick={onBack} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:bg-white/20 md:min-h-[44px] md:px-4 md:text-sm">
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </button>
        </div>
      </div>
    </div>
  );

  if (!shellConfigLoaded || shellResultsOnly) {
    return (
      <div className="space-y-6 animate-fade-in">
        {renderShellHero()}

        <div className={`rounded-[30px] border p-5 shadow-sm md:p-7 ${shellResultsOnly ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-700'}`}>
          {shellResultsOnly ? (
            <>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
                {t('fanta_live_results_only_tournament')}
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{t('fanta_not_active')}</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-700">{t('fanta_results_only_desc')}</p>
            </>
          ) : (
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" aria-label="FantaBeerpong" />
          )}
        </div>
      </div>
    );
  }

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
    return (
      <FantaTeamDetail
        teamId={selectedFantasyTeamId}
        onBack={() => setSelectedFantasyTeamId(null)}
        onOpenPlayerDetail={openPlayerDetail}
        onOpenMyTeam={() => { setSelectedFantasyTeamId(null); setActiveSection('my_team'); }}
        onOpenStandings={() => { setSelectedFantasyTeamId(null); setActiveSection('general_standings'); }}
        onOpenPlayers={() => { setSelectedFantasyTeamId(null); setActiveSection('players_standings'); }}
      />
    );
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
      {renderShellHero()}

      {preTournamentInfoOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl shadow-slate-950/30">
            <div className="inline-flex rounded-full border border-beer-200 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-800">Pretorneo Fanta</div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Puoi iniziare prima del tabellone</h2>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-600">
              In questa fase scegli tra i giocatori già caricati in Area Admin. Se una squadra cambia giocatore, il nuovo giocatore prende quello slot. Se una squadra viene rimossa, il sistema assegna un sostituto casuale appena il pool è sufficiente.
            </p>
            <button type="button" onClick={closePreTournamentInfo} className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-slate-800">
              Ok, ho capito
            </button>
          </div>
        </div>
      )}

      {rosterChangeNotices.length > 0 && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/60 px-4 py-6">
          <div className="w-full max-w-lg rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl shadow-slate-950/30">
            <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-800">Rosa aggiornata</div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Abbiamo sostituito un giocatore</h2>
            <div className="mt-4 space-y-3">
              {rosterChangeNotices.map((notice) => (
                <div key={notice.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-black text-slate-950">{notice.oldPlayerName}</div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">sostituito da</div>
                  <div className="text-sm font-black text-emerald-700">{notice.newPlayerName}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm font-bold leading-6 text-slate-600">
              La tua squadra Fanta resta valida: la sostituzione è stata registrata automaticamente.
            </p>
            <button type="button" onClick={() => void acknowledgeRosterChangeNotices()} className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-slate-800">
              Ok
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-2 z-30 rounded-[22px] border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur md:rounded-[26px] md:p-3">
        <div className="flex max-w-full snap-x flex-nowrap gap-2 overflow-x-auto pb-1" role="toolbar" aria-label={t('fanta_shell_title')}>
          {FANTA_SHELL_SECTIONS.map((section) => {
            const Icon = section.icon;
            const active = section.key === activeSection;
            return (
              <button key={section.key} type="button" aria-current={active ? 'page' : undefined} onClick={() => setActiveSection(section.key)} className={`inline-flex min-h-[46px] snap-start shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-wide transition md:text-sm ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                <Icon className="h-4 w-4" />
                {t(section.shortLabelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${panelClass} hidden sm:block`}>
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{t('fanta_shell_active_section')}</div>
        <div className="mt-1 text-xl font-black tracking-tight text-slate-950">{t(currentSection.labelKey)}</div>
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t(currentSection.helperKey)}</div>
      </div>

      {renderSectionContent()}
    </div>
  );
};
