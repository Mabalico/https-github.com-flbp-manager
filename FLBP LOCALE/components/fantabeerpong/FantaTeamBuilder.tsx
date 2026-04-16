import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Search, Shield, Star, Wind, Loader2 } from 'lucide-react';
import { fetchFantaConfig, fetchUserFantaTeam, saveFantaTeam } from '../../services/fantabeerpong/fantaSupabaseService';
import { readPlayerPresenceSnapshot } from '../../services/playerAppService';
import { loadState } from '../../services/storageService';
import type { FantaBuilderPlayerOption, FantaPlayer, FantaLineupSlot, FantaConfig } from '../../services/fantabeerpong/types';
import { FantaQuickHelp } from './FantaQuickHelp';
import { panelClass } from './_shared';

interface Props { onBack: () => void; onOpenRules: () => void; onOpenPlayerDetail?: (playerId: string) => void; }

const statusLabel = (status: FantaBuilderPlayerOption['status']) =>
  status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';
const statusBadgeClass = (status: FantaBuilderPlayerOption['status']) =>
  status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';

export const FantaTeamBuilder: React.FC<Props> = ({ onBack, onOpenRules, onOpenPlayerDetail }) => {
  const [step, setStep] = React.useState<'info' | 'selection' | 'review'>('info');
  const [activeTab, setActiveTab] = React.useState<'teams' | 'players'>('teams');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [teamName, setTeamName] = React.useState('La mia squadra');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [captainId, setCaptainId] = React.useState<string>('');
  const [defenderIds, setDefenderIds] = React.useState<string[]>([]);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [config, setConfig] = React.useState<FantaConfig | null>(null);
  const [session] = React.useState(readPlayerPresenceSnapshot());

  // Real data from AppState
  const appState = React.useMemo(() => loadState(), []);
  const tournamentPlayers = React.useMemo(() => {
    const playersMap = new Map<string, FantaBuilderPlayerOption>();
    (appState.teams || []).forEach(t => {
      if (t.player1) {
        playersMap.set(t.player1, { id: t.player1, playerName: t.player1, realTeamName: t.name, status: 'live' });
      }
      if (t.player2) {
        playersMap.set(t.player2, { id: t.player2, playerName: t.player2, realTeamName: t.name, status: 'live' });
      }
    });
    return Array.from(playersMap.values());
  }, [appState]);

  const tournamentTeams = React.useMemo(() => {
    return (appState.teams || []).map(t => ({
      id: t.id,
      teamName: t.name,
      players: [
        { id: t.player1, playerName: t.player1, realTeamName: t.name, status: 'live' },
        ...(t.player2 ? [{ id: t.player2, playerName: t.player2, realTeamName: t.name, status: 'live' }] : [])
      ] as FantaBuilderPlayerOption[]
    }));
  }, [appState]);

  React.useEffect(() => {
    async function init() {
      setLoading(true);
      const conf = await fetchFantaConfig();
      setConfig(conf);

      if (session?.accountId) {
        const existing = await fetchUserFantaTeam(session.accountId);
        if (existing) {
          setTeamName(existing.team.name);
          setSelectedIds(existing.roster.map(r => r.player_id));
          setCaptainId(existing.roster.find(r => r.role === 'captain')?.player_id || '');
          setDefenderIds(existing.roster.filter(r => r.role === 'defender').map(r => r.player_id));
        }
      }
      setLoading(false);
    }
    init();
  }, [session]);

  const flatPlayers = tournamentPlayers;
  const selectedPlayers = React.useMemo(() => flatPlayers.filter((p) => selectedIds.includes(p.id)), [flatPlayers, selectedIds]);
  const canAddMore = selectedIds.length < 4;
  const isReadOnly = config?.isLockActive || !config?.registrationOpen;

  const setInfo = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedback({ tone, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const addPlayer = (playerId: string) => {
    if (isReadOnly) return;
    if (selectedIds.includes(playerId)) return setInfo('Giocatore già in rosa.', 'error');
    if (!canAddMore) return setInfo('Massimo 4 giocatori.', 'error');
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
    if (defenderIds.includes(playerId)) return setInfo('Un difensore non può essere capitano.', 'error');
    setCaptainId(playerId);
  };

  const toggleDefender = (playerId: string) => {
    if (isReadOnly) return;
    if (captainId === playerId) return setInfo('Il capitano non può essere difensore.', 'error');
    if (!defenderIds.includes(playerId) && defenderIds.length >= 2) return setInfo('Massimo 2 difensori.', 'error');
    setDefenderIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]);
  };

  const filteredTeams = tournamentTeams
    .map((team) => ({ ...team, players: team.players.filter((player) => player.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase())) }))
    .filter((team) => team.players.length > 0);
  const filteredPlayers = flatPlayers.filter((player) => player.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase()));

  const allRulesOk = selectedIds.length === 4 && captainId !== '' && defenderIds.length > 0;

  const handleSave = async () => {
    if (!session?.accountId || !allRulesOk || isReadOnly) return;
    setSaving(true);
    try {
      const lineup = selectedPlayers.map(p => {
        let role: FantaLineupSlot['role'] = 'starter';
        if (p.id === captainId) role = 'captain';
        else if (defenderIds.includes(p.id)) role = 'defender';
        return { player: p as FantaPlayer, role };
      });

      const ok = await saveFantaTeam(session.accountId, teamName, lineup);
      if (ok) {
        setInfo('Squadra salvata con successo!');
        setTimeout(onBack, 1500);
      } else {
        setInfo('Errore durante il salvataggio. Riprova.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <Loader2 className="h-10 w-10 animate-spin text-beer-500" />
        <p className="mt-4 font-black uppercase tracking-widest text-slate-500 text-sm">Caricamento builder...</p>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />EDIZIONE LIVE</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Inizia la tua scalata fantasy</h1>
              <div className="mt-2 text-sm font-semibold text-slate-600">Costruisci il tuo roster per il torneo {appState.tournament?.name || 'Live'}</div>
            </div>
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-beer-500/20"><ArrowLeft className="h-4 w-4" />Torna al FantaBeerpong</button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-xl font-black tracking-tight text-slate-950">Informazioni e regole rapide</div>
              <div className="mt-6 space-y-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-sm font-black uppercase tracking-wide text-beer-700">Torneo</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{appState.tournament?.name || 'Caricamento...'}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">{config?.registrationOpen ? 'Iscrizioni Aperte' : 'Iscrizioni Chiuse'}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="text-sm font-black text-slate-950">Rosa</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">Scegli 4 giocatori reali del torneo.</div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="text-sm font-black text-slate-950">Ruoli</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">Affida i ruoli di Capitano e Difensore.</div>
                  </div>
                </div>
                {isReadOnly && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                    <div className="text-sm font-black text-rose-900">Mercato Bloccato</div>
                    <div className="mt-1 text-sm font-semibold text-rose-800 italic">Il torneo è iniziato o le iscrizioni sono state chiuse dagli organizzatori.</div>
                  </div>
                )}
              </div>
              <div className="mt-8">
                <button type="button" onClick={() => setStep('selection')} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-beer-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 focus:outline-none focus:ring-2 focus:ring-beer-500/40">
                  {selectedIds.length > 0 ? 'Modifica la selezione' : 'Inizia la selezione'} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-lg font-black text-slate-950">Hai dubbi?</div>
              <div className="mt-4 text-sm font-semibold leading-relaxed text-slate-600">Consulta il regolamento completo per capire moltiplicatori e bonus.</div>
              <button type="button" onClick={onOpenRules} className="mt-5 inline-flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">Apri regolamento <ArrowRight className="h-4 w-4 text-slate-400" /></button>
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
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Riepilogo e conferma</h1>
              <div className="text-sm font-semibold text-slate-600">Controlla la tua rosa prima del salvataggio.</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-xl font-black tracking-tight text-slate-950">La tua rosa fantasy</div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {selectedPlayers.map((player) => {
                  const isCaptain = captainId === player.id;
                  const isDefender = defenderIds.includes(player.id);
                  return (
                    <div key={player.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                      <div className="text-base font-black text-slate-950 truncate">{player.playerName}</div>
                      <div className="text-sm font-bold text-slate-500 truncate">{player.realTeamName}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {isCaptain && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700"><Star className="h-3 w-3" />Capitano</span>}
                        {isDefender && <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase text-sky-700"><Wind className="h-3 w-3" />Difensore</span>}
                        {!isCaptain && !isDefender && <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">Titolare</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={panelClass}>
              <div className="text-xl font-black tracking-tight text-slate-950">Dettagli finali</div>
              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="teamName" className="text-xs font-black uppercase tracking-wider text-slate-500">Nome della squadra</label>
                  <input type="text" id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:ring-2 focus:ring-beer-500/40 disabled:opacity-60" />
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-sm font-semibold text-slate-600 leading-relaxed italic">
                  "Salvando la squadra, accetti il regolamento. La rosa non potrà essere modificata dopo l'inizio del torneo."
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-lg font-black text-slate-950">Check validità</div>
              <div className="mt-4 space-y-3">
                <div className={`flex items-center gap-2 text-sm font-bold ${selectedIds.length === 4 ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> 4 giocatori selezionati</div>
                <div className={`flex items-center gap-2 text-sm font-bold ${captainId ? 'text-emerald-700' : 'text-rose-600'}`}><CheckCircle2 className="h-4 w-4" /> Capitano assegnato</div>
                <div className={`flex items-center gap-2 text-sm font-bold ${defenderIds.length > 0 ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> Almeno 1 Difensore</div>
              </div>
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={!allRulesOk || isReadOnly || saving} 
                className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-beer-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 disabled:opacity-50 disabled:grayscale"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Conferma e Salva'}
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
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />EDIZIONE LIVE</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Crea / modifica squadra fantasy</h1>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">Fase di {config?.isLockActive ? 'Blocco' : 'Mercato'} - Tournament {appState.tournament?.name}</div>
          </div>
          <button type="button" onClick={() => setStep('info')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>

      {feedback && <div className={`fixed bottom-6 right-6 z-50 rounded-2xl border px-6 py-4 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-bottom-4 ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-5 text-pretty">
          <div className={panelClass}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActiveTab('teams')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition-all ${activeTab === 'teams' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Per squadre reali</button>
              <button type="button" onClick={() => setActiveTab('players')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition-all ${activeTab === 'players' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Lista completa</button>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca giocatore..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-beer-500/20" />
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
                            <button type="button" disabled={isReadOnly || selectedIds.includes(player.id) || !canAddMore} onClick={() => addPlayer(player.id)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-beer-500 px-4 text-[11px] font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">Aggiungi</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredPlayers.map((player) => (
                  <div key={player.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700 truncate block w-full">{player.playerName}</button>
                    <div className="mt-1 text-xs font-black text-slate-500 uppercase tracking-tight truncate">{player.realTeamName}</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
                      <button type="button" disabled={isReadOnly || selectedIds.includes(player.id) || !canAddMore} onClick={() => addPlayer(player.id)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-beer-500 px-4 text-[11px] font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">Aggiungi</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FantaQuickHelp topics={['roles', 'scoring']} onOpenRules={onOpenRules} compact title="Help rapido builder" />
        </div>

        <div className="space-y-5 text-pretty">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xl font-black tracking-tight text-slate-950">Rosa provvisoria</div>
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
                          <button type="button" onClick={() => assignCaptain(player.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${isCaptain ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Star className="h-3.5 w-3.5" />Capitano</button>
                          <button type="button" onClick={() => toggleDefender(player.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${isDefender ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Wind className="h-3.5 w-3.5" />Difensore</button>
                        </div>
                      </div>
                      <button type="button" onClick={() => removePlayer(player.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:text-rose-600 hover:ring-rose-200 shrink-0"><ArrowLeft className="h-4 w-4 rotate-45" /></button>
                    </div>
                  </div>
                );
              })}
              {selectedPlayers.length === 0 && <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/50 px-4 py-10 text-center text-sm font-bold text-slate-400 italic">Nessun giocatore selezionato.</div>}
            </div>
          </div>
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Prossimo step</div>
            <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">Scegli 4 giocatori, assegna i ruoli e conferma.</div>
            <button type="button" disabled={!allRulesOk || isReadOnly} onClick={() => setStep('review')} className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50 disabled:grayscale disabled:shadow-none">Vai al riepilogo <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
