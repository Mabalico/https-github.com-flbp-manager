import React from 'react';
import { ArrowLeft, CheckCircle2, Search, Shield, Star, Wind } from 'lucide-react';
import { FANTA_TEAM_BUILDER_MOCK } from '../../services/fantabeerpong/mockData';
import type { FantaBuilderPlayerOption } from '../../services/fantabeerpong/types';
import { FantaQuickHelp } from './FantaQuickHelp';
import { panelClass } from './_shared';

interface Props { onBack: () => void; onOpenRules: () => void; onOpenPlayerDetail?: (playerId: string) => void; }

const statusLabel = (status: FantaBuilderPlayerOption['status']) =>
  status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';
const statusBadgeClass = (status: FantaBuilderPlayerOption['status']) =>
  status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';

export const FantaTeamBuilder: React.FC<Props> = ({ onBack, onOpenRules, onOpenPlayerDetail }) => {
  const data = FANTA_TEAM_BUILDER_MOCK;
  const [step, setStep] = React.useState<'info' | 'selection' | 'review'>('info');
  const [activeTab, setActiveTab] = React.useState<'teams' | 'players'>('teams');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [teamName, setTeamName] = React.useState('La mia squadra'); // Default
  const [selectedIds, setSelectedIds] = React.useState<string[]>(data.initialSelectedIds);
  const [captainId, setCaptainId] = React.useState<string>(data.initialCaptainId);
  const [defenderIds, setDefenderIds] = React.useState<string[]>(data.initialDefenderIds);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const flatPlayers = React.useMemo(() => data.teams.flatMap((team) => team.players), [data.teams]);
  const selectedPlayers = flatPlayers.filter((p) => selectedIds.includes(p.id));
  const canAddMore = selectedIds.length < 4;
  const isReadOnly = data.isReadOnly;

  const setInfo = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedback({ tone, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const addPlayer = (playerId: string) => {
    if (isReadOnly) return;
    if (selectedIds.includes(playerId)) return setInfo('Questo giocatore è già nella rosa provvisoria.', 'error');
    if (!canAddMore) return setInfo('Hai già selezionato 4 giocatori.', 'error');
    setSelectedIds((current) => [...current, playerId]);
    setInfo('Giocatore aggiunto alla rosa provvisoria.');
  };

  const removePlayer = (playerId: string) => {
    if (isReadOnly) return;
    setSelectedIds((current) => current.filter((id) => id !== playerId));
    if (captainId === playerId) setCaptainId('');
    setDefenderIds((current) => current.filter((id) => id !== playerId));
    setInfo('Giocatore rimosso dalla rosa provvisoria.');
  };

  const assignCaptain = (playerId: string) => {
    if (isReadOnly) return;
    if (defenderIds.includes(playerId)) return setInfo('Un Difensore non può diventare anche Capitano.', 'error');
    setCaptainId(playerId);
    setInfo('Capitano aggiornato.');
  };

  const toggleDefender = (playerId: string) => {
    if (isReadOnly) return;
    if (captainId === playerId) return setInfo('Il Capitano non può essere anche Difensore.', 'error');
    if (!defenderIds.includes(playerId) && defenderIds.length >= 2) return setInfo('Puoi avere al massimo 2 Difensori.', 'error');
    setDefenderIds((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]);
    setInfo('Ruolo difensore aggiornato.');
  };

  const filteredTeams = data.teams
    .map((team) => ({ ...team, players: team.players.filter((player) => player.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase())) }))
    .filter((team) => team.players.length > 0);
  const filteredPlayers = flatPlayers.filter((player) => player.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase()));

  const allRulesOk = selectedIds.length === 4 && captainId !== '' && !defenderIds.includes(captainId);

  if (step === 'info') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />{data.editionLabel}</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Inizia la tua scalata fantasy</h1>
              <div className="mt-2 text-sm font-semibold text-slate-600">Costruisci il tuo roster per il torneo {data.tournamentName}</div>
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
                  <div className="mt-1 text-lg font-black text-slate-950">{data.tournamentName}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">{data.registrationStatus}</div>
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
                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                  <div className="text-sm font-black text-amber-900">Nota sui Ruoli</div>
                  <div className="mt-1 text-sm font-semibold text-amber-800">Un Capitano non può essere Difensore e viceversa. Scegli ruoli distinti per massimizzare i bonus.</div>
                </div>
              </div>
              <div className="mt-8">
                <button type="button" onClick={() => setStep('selection')} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-beer-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 focus:outline-none focus:ring-2 focus:ring-beer-500/40">Inizia la selezione <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className={panelClass}>
              <div className="text-lg font-black text-slate-950">Hai dubbi?</div>
              <div className="mt-4 text-sm font-semibold leading-relaxed text-slate-600">Consulta il regolamento completo per capire come funzionano il Bonus Scia e i moltiplicatori dei ruoli.</div>
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
              <div className="text-sm font-semibold text-slate-600">Controlla la tua rosa prima di scendere in campo</div>
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
                      <div className="text-base font-black text-slate-950">{player.playerName}</div>
                      <div className="text-sm font-bold text-slate-500">{player.realTeamName}</div>
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
                  <input type="text" id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:ring-2 focus:ring-beer-500/40" />
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-sm font-semibold text-slate-600 leading-relaxed italic">
                  "Confermando la squadra, accetti il regolamento del FantaBeerpong. La rosa sarà bloccata all'inizio del torneo."
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
              <button type="button" onClick={() => { setInfo('Squadra salvata con successo!'); setTimeout(onBack, 1500); }} disabled={!allRulesOk} className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-beer-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-md transition hover:bg-beer-600 disabled:opacity-50 disabled:grayscale">Conferma squadra</button>
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
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />{data.editionLabel}</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Crea / modifica squadra fantasy</h1>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.buildWindowHint}</div>
          </div>
          <button type="button" onClick={() => setStep('info')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 transition"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>

      {feedback && <div className={`fixed bottom-6 right-6 z-50 rounded-2xl border px-6 py-4 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-bottom-4 ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-5 text-pretty">
          <div className={panelClass}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActiveTab('teams')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition-all ${activeTab === 'teams' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Per squadre</button>
              <button type="button" onClick={() => setActiveTab('players')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition-all ${activeTab === 'players' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Per giocatori</button>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca giocatore" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-beer-500/20" />
            </div>

            {activeTab === 'teams' ? (
              <div className="mt-4 space-y-4">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-500">{team.teamName}</div>
                    <div className="mt-3 space-y-3">
                      {team.players.map((player) => (
                        <div key={player.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300">
                          <div className="flex items-center justify-between gap-3 text-pretty">
                            <div className="min-w-0">
                              <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700">{player.playerName}</button>
                              <div className="mt-0.5 text-xs font-semibold text-slate-500">{statusLabel(player.status)}</div>
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
                    <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700">{player.playerName}</button>
                    <div className="mt-1 text-xs font-black text-slate-500 uppercase tracking-tight">{player.realTeamName}</div>
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
                      <div className="min-w-0">
                        <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700">{player.playerName}</button>
                        <div className="mt-0.5 text-xs font-bold text-slate-500">{player.realTeamName}</div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => assignCaptain(player.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${isCaptain ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Star className="h-3.5 w-3.5" />Capitano</button>
                          <button type="button" onClick={() => toggleDefender(player.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${isDefender ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Wind className="h-3.5 w-3.5" />Difensore</button>
                        </div>
                      </div>
                      <button type="button" onClick={() => removePlayer(player.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:text-rose-600 hover:ring-rose-200"><ArrowLeft className="h-4 w-4 rotate-45" /></button>
                    </div>
                  </div>
                );
              })}
              {selectedPlayers.length === 0 && <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nessun giocatore selezionato.</div>}
            </div>
          </div>
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Prossimo step</div>
            <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">Completa la rosa con 4 giocatori, un capitano e almeno un difensore per procedere al riepilogo finale.</div>
            <button type="button" disabled={!allRulesOk} onClick={() => setStep('review')} className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50 disabled:grayscale disabled:shadow-none">Continua al riepilogo <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
