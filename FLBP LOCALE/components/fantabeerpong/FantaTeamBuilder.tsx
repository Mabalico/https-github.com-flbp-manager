import React from 'react';
import { useTranslation } from '../../App';
import { ArrowLeft, ArrowRight, CheckCircle2, Search, Shield, Star, Wind, Loader2 } from 'lucide-react';
import { fetchFantaConfig, fetchFantaTournamentTeams, fetchUserFantaTeam, saveFantaTeamWithResult } from '../../services/fantabeerpong/fantaSupabaseService';
import { emitFantaAppChange, readPlayerPresenceSnapshot, PLAYER_APP_CHANGE_EVENT } from '../../services/playerAppService';
import type { FantaBuilderPlayerOption, FantaBuilderTeamGroup, FantaPlayer, FantaLineupSlot, FantaConfig } from '../../services/fantabeerpong/types';
import { FantaQuickHelp } from './FantaQuickHelp';
import { panelClass } from './_shared';

interface Props { onBack: () => void; onOpenRules: () => void; onOpenPlayerDetail?: (playerId: string) => void; }

export const FantaTeamBuilder: React.FC<Props> = ({ onBack, onOpenRules, onOpenPlayerDetail }) => {
  const { t } = useTranslation();

  const statusLabel = (status: FantaBuilderPlayerOption['status']) =>
    status === 'eliminated' ? t('fanta_status_eliminated') : t('fanta_status_live');
  const statusBadgeClass = (status: FantaBuilderPlayerOption['status']) =>
    status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const [step, setStep] = React.useState<'info' | 'selection' | 'review'>('info');
  const [activeTab, setActiveTab] = React.useState<'teams' | 'players'>('teams');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [teamName, setTeamName] = React.useState(t('fanta_my_team_default_name'));
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [captainId, setCaptainId] = React.useState<string>('');
  const [defenderIds, setDefenderIds] = React.useState<string[]>([]);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [config, setConfig] = React.useState<FantaConfig | null>(null);
  const [availableTeams, setAvailableTeams] = React.useState<FantaBuilderTeamGroup[]>([]);
  const [session, setSession] = React.useState(readPlayerPresenceSnapshot);

  // Keep session reactive: re-read whenever a player logs in/out.
  React.useEffect(() => {
    const refresh = () => setSession(readPlayerPresenceSnapshot());
    window.addEventListener('storage', refresh);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, refresh as EventListener);
    };
  }, []);

  const tournamentPlayers = React.useMemo(() => {
    const playersMap = new Map<string, FantaBuilderPlayerOption>();
    availableTeams.forEach((team) => team.players.forEach((player) => playersMap.set(player.id, player)));
    return Array.from(playersMap.values());
  }, [availableTeams]);

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      const conf = await fetchFantaConfig();
      if (cancelled) return;
      setConfig(conf);
      const teams = conf?.activeTournamentId ? await fetchFantaTournamentTeams(conf.activeTournamentId) : [];
      if (cancelled) return;
      setAvailableTeams(teams);

      if (session?.accountId) {
        const existing = await fetchUserFantaTeam(session.accountId);
        if (cancelled) return;
        if (existing) {
          setTeamName(existing.team.name);
          setSelectedIds(existing.roster.map(r => r.player_id));
          setCaptainId(existing.roster.find(r => r.role === 'captain')?.player_id || '');
          setDefenderIds(existing.roster.filter(r => r.role === 'defender').map(r => r.player_id));
        } else {
          setTeamName(t('fanta_my_team_default_name'));
          setSelectedIds([]);
          setCaptainId('');
          setDefenderIds([]);
        }
      } else {
        setTeamName(t('fanta_my_team_default_name'));
        setSelectedIds([]);
        setCaptainId('');
        setDefenderIds([]);
      }
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [session]);

  const flatPlayers = tournamentPlayers;
  const selectedPlayers = React.useMemo(() => flatPlayers.filter((p) => selectedIds.includes(p.id)), [flatPlayers, selectedIds]);
  const canAddMore = selectedIds.length < 4;
  const hasActiveTournament = Boolean(config?.activeTournamentId);
  const resultsOnlyTournament = Boolean(config?.activeTournamentResultsOnly);
  const registrationOpen = hasActiveTournament && !resultsOnlyTournament && Boolean(config?.registrationOpen);
  const isReadOnly = !hasActiveTournament || !registrationOpen;
  const activeTournamentName = config?.activeTournamentName || t('fanta_no_live_tournament');
  const lockMessage = !config?.activeTournamentId
    ? t('fanta_builder_lock_no_tournament')
    : resultsOnlyTournament
      ? t('fanta_builder_lock_results_only')
    : config.tournamentStarted
      ? t('fanta_builder_lock_started')
      : t('fanta_builder_lock_open');

  const setInfo = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedback({ tone, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const addPlayer = (playerId: string) => {
    if (isReadOnly) return;
    if (selectedIds.includes(playerId)) return setInfo(t('fanta_player_already_in_roster'), 'error');
    if (!canAddMore) return setInfo(t('fanta_max_players_reached'), 'error');
    setSelectedIds((current) => [...current, playerId]);
  };

  const removePlayer = (playerId: string) => {
    if (isReadOnly) return;
    setSelectedIds((current) => current.filter((id) => id !== playerId));
    if (captainId === playerId) setCaptainId('');
    setDefenderIds((current) => current.filter((id) => id !== playerId));
  };

  const assignCaptain = (playerId: string) => {
    if (isReadOnly) return;
    if (defenderIds.includes(playerId)) return setInfo(t('fanta_defender_cannot_be_captain'), 'error');
    setCaptainId(playerId);
  };

  const toggleDefender = (playerId: string) => {
    if (isReadOnly) return;
    if (captainId === playerId) return setInfo(t('fanta_captain_cannot_be_defender'), 'error');
    if (!defenderIds.includes(playerId) && defenderIds.length >= 2) return setInfo(t('fanta_must_have_2_defenders'), 'error');
    setDefenderIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]);
  };

  const filteredTeams = availableTeams
    .map((team) => ({ ...team, players: team.players.filter((player) => player.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase())) }))
    .filter((team) => team.players.length > 0);
  const filteredPlayers = flatPlayers.filter((player) => player.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase()));

  const allRulesOk = selectedIds.length === 4 && captainId !== '' && defenderIds.length === 2;

  const handleSave = async () => {
    if (!allRulesOk || isReadOnly) return;
    if (!session?.accountId) {
      setInfo(t('fanta_login_required_save'), 'error');
      return;
    }
    setSaving(true);
    try {
      const lineup = selectedPlayers.map(p => {
        let role: FantaLineupSlot['role'] = 'starter';
        if (p.id === captainId) role = 'captain';
        else if (defenderIds.includes(p.id)) role = 'defender';
        return { player: p as FantaPlayer, role };
      });

      const result = await saveFantaTeamWithResult(session.accountId, teamName, lineup);
      if (result.ok) {
        emitFantaAppChange();
        setInfo(t('fanta_save_success'));
        setTimeout(onBack, 1500);
      } else {
        setInfo(result.message || t('fanta_save_error'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">{t('fanta_loading_builder')}</p>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700">
                <Shield className="h-3.5 w-3.5" />
                {t('fanta_live_edition')}
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{t('fanta_builder_title')}</h1>
              <div className="mt-2 text-sm font-semibold text-slate-600">
                {t('fanta_builder_subtitle').replace('{{name}}', activeTournamentName).replace('{name}', activeTournamentName)}
              </div>
            </div>
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-beer-500/20"><ArrowLeft className="h-4 w-4" />{t('fanta_builder_back_to_fanta')}</button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_quick_info_rules')}</div>
              <div className="mt-6 space-y-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-sm font-black uppercase tracking-wide text-beer-700">{t('fanta_builder_tournament_label')}</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{activeTournamentName}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    {!hasActiveTournament ? t('fanta_no_live_tournament') : resultsOnlyTournament ? t('fanta_live_results_only_tournament') : registrationOpen ? t('fanta_registration_open') : t('fanta_tournament_running')}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="text-sm font-black text-slate-950">{t('fanta_roster')}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">{t('fanta_choose_4_players')}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="text-sm font-black text-slate-950">{t('fanta_roles')}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">{t('fanta_assign_roles')}</div>
                  </div>
                </div>
                {isReadOnly && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                    <div className="text-sm font-black text-rose-900">{t('fanta_market_locked')}</div>
                    <div className="mt-1 text-sm font-semibold text-rose-800 italic">{lockMessage}</div>
                  </div>
                )}
              </div>
              <div className="mt-8">
                <button type="button" disabled={isReadOnly} onClick={() => setStep('selection')} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-beer-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 focus:outline-none focus:ring-2 focus:ring-beer-500/40 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">
                  {isReadOnly ? t('fanta_not_active') : selectedIds.length > 0 ? t('fanta_builder_edit_selection') : t('fanta_builder_start_selection')} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-lg font-black text-slate-950">{t('fanta_need_help')}</div>
              <div className="mt-4 text-sm font-semibold leading-relaxed text-slate-600">{t('fanta_builder_rules_desc')}</div>
              <button type="button" onClick={onOpenRules} className="mt-5 inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">{t('fanta_builder_open_rules')} <ArrowRight className="h-4 w-4 text-slate-400" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setStep('selection')} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">{t('fanta_go_to_review')}</h1>
              <div className="text-sm font-semibold text-slate-600">{t('fanta_builder_review_desc')}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_roster_fanta')}</div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {selectedPlayers.map((player) => {
                  const isCaptain = captainId === player.id;
                  const isDefender = defenderIds.includes(player.id);
                  return (
                    <div key={player.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                      <div className="text-base font-black text-slate-950 truncate">{player.playerName}</div>
                      <div className="text-sm font-bold text-slate-500 truncate">{player.realTeamName}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isCaptain && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700"><Star className="h-3 w-3" />{t('fanta_role_captain')}</span>}
                        {isDefender && <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase text-sky-700"><Wind className="h-3 w-3" />{t('fanta_role_defender')}</span>}
                        {!isCaptain && !isDefender && <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">{t('fanta_role_starter')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={panelClass}>
              <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_next_actions')}</div>
              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="teamName" className="text-xs font-black uppercase tracking-wider text-slate-500">{t('fanta_builder_team_name_label')}</label>
                  <input type="text" id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:ring-2 focus:ring-beer-500/40 disabled:opacity-60" />
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-sm font-semibold text-slate-600 leading-relaxed italic">
                  {t('fanta_builder_disclaimer')}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-lg font-black text-slate-950">{t('fanta_builder_validity_check')}</div>
              <div className="mt-4 space-y-3">
                <div className={`flex items-center gap-2 text-sm font-bold ${selectedIds.length === 4 ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> {t('fanta_builder_check_4_players')}</div>
                <div className={`flex items-center gap-2 text-sm font-bold ${captainId ? 'text-emerald-700' : 'text-rose-600'}`}><CheckCircle2 className="h-4 w-4" /> {t('fanta_builder_check_captain')}</div>
                <div className={`flex items-center gap-2 text-sm font-bold ${defenderIds.length === 2 ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> {t('fanta_builder_check_defenders')}</div>
                {!session?.accountId && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-800">
                    {t('fanta_builder_login_warning')}
                  </div>
                )}
              </div>
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={!allRulesOk || isReadOnly || saving} 
                className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-beer-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 disabled:opacity-50 disabled:grayscale"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : t('fanta_builder_save_button')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4 text-pretty">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />{t('fanta_live_edition')}</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{t('fanta_create_team')}</h1>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t('fanta_builder_phase_label')} {registrationOpen ? t('fanta_market_metric') : t('fanta_closed')} - {activeTournamentName}</div>
          </div>
          <button type="button" onClick={() => setStep('info')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition"><ArrowLeft className="h-4 w-4" />{t('fanta_back_to_fanta')}</button>
        </div>
      </div>

      {feedback && <div className={`fixed bottom-6 right-6 z-50 rounded-2xl border px-6 py-4 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-bottom-4 ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-5 text-pretty">
          <div className={panelClass}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActiveTab('teams')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition-all ${activeTab === 'teams' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t('fanta_per_real_teams')}</button>
              <button type="button" onClick={() => setActiveTab('players')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition-all ${activeTab === 'players' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t('fanta_full_list')}</button>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('fanta_search_player')} className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-beer-500/20" />
            </div>

            {activeTab === 'teams' ? (
              <div className="mt-4 space-y-4">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-500 truncate">{team.teamName}</div>
                    <div className="mt-3 space-y-3">
                      {team.players.map((player) => (
                        <div key={player.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300">
                          <div className="flex items-center justify-between gap-3 text-pretty">
                            <div className="min-w-0">
                              <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700 truncate">{player.playerName}</button>
                            </div>
                            <button type="button" disabled={isReadOnly || selectedIds.includes(player.id) || !canAddMore} onClick={() => addPlayer(player.id)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-beer-500 px-4 text-[11px] font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">{t('fanta_add')}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredTeams.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm font-bold text-slate-500">
                    {t('fanta_no_teams_avail')}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredPlayers.map((player) => (
                  <div key={player.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700 truncate block w-full">{player.playerName}</button>
                    <div className="mt-1 text-xs font-black text-slate-500 uppercase tracking-tight truncate">{player.realTeamName}</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
                      <button type="button" disabled={isReadOnly || selectedIds.includes(player.id) || !canAddMore} onClick={() => addPlayer(player.id)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-beer-500 px-4 text-[11px] font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">{t('fanta_add')}</button>
                    </div>
                  </div>
                ))}
                {filteredPlayers.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm font-bold text-slate-500 md:col-span-2">
                    {t('fanta_no_players_avail')}
                  </div>
                )}
              </div>
            )}
          </div>

          <FantaQuickHelp topics={['roles', 'scoring']} onOpenRules={onOpenRules} compact title={t('fanta_help_builder')} />
        </div>

        <div className="space-y-5 text-pretty">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_provisional_roster')}</div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">{selectedIds.length}/4</div>
            </div>
            <div className="mt-4 space-y-3">
              {selectedPlayers.map((player) => {
                const isCaptain = captainId === player.id;
                const isDefender = defenderIds.includes(player.id);
                return (
                  <div key={player.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 transition-all hover:bg-white hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700 truncate block w-full">{player.playerName}</button>
                        <div className="mt-0.5 text-xs font-bold text-slate-500 truncate">{player.realTeamName}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => assignCaptain(player.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${isCaptain ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Star className="h-3.5 w-3.5" />{t('fanta_role_captain')}</button>
                          <button type="button" onClick={() => toggleDefender(player.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${isDefender ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Wind className="h-3.5 w-3.5" />{t('fanta_role_defender')}</button>
                        </div>
                      </div>
                      <button type="button" onClick={() => removePlayer(player.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:text-rose-600 hover:ring-rose-200 shrink-0"><ArrowLeft className="h-4 w-4 rotate-45" /></button>
                    </div>
                  </div>
                );
              })}
              {selectedPlayers.length === 0 && <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/50 px-4 py-10 text-center text-sm font-bold text-slate-400 italic">{t('fanta_no_selected_player')}</div>}
            </div>
          </div>
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_next_step')}</div>
            <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{t('fanta_builder_hint')}</div>
            <button type="button" disabled={!allRulesOk || isReadOnly} onClick={() => setStep('review')} className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50 disabled:grayscale disabled:shadow-none">{t('fanta_go_to_review')} <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
