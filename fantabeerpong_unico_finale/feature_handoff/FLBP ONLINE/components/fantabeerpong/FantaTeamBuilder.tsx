import React from 'react';
import { ArrowLeft, CheckCircle2, Search, Shield, Star, Users, Wind } from 'lucide-react';
import { FANTA_TEAM_BUILDER_MOCK } from '../../services/fantabeerpong/mockData';
import type { FantaBuilderPlayerOption } from '../../services/fantabeerpong/types';
import { FantaQuickHelp } from './FantaQuickHelp';
import { panelClass } from './_shared';

interface Props { onBack: () => void; onOpenRules: () => void; onOpenPlayerDetail?: (playerId: string) => void; }

const statusLabel = (status: FantaBuilderPlayerOption['status']) => status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';
const statusBadgeClass = (status: FantaBuilderPlayerOption['status']) => status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';

export const FantaTeamBuilder: React.FC<Props> = ({ onBack, onOpenRules, onOpenPlayerDetail }) => {
  const data = FANTA_TEAM_BUILDER_MOCK;
  const [activeTab, setActiveTab] = React.useState<'teams' | 'players'>('teams');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>(data.initialSelectedIds);
  const [captainId, setCaptainId] = React.useState<string>(data.initialCaptainId);
  const [defenderIds, setDefenderIds] = React.useState<string[]>(data.initialDefenderIds);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const flatPlayers = React.useMemo(() => data.teams.flatMap((team) => team.players), [data.teams]);
  const selectedPlayers = flatPlayers.filter((p) => selectedIds.includes(p.id));
  const canAddMore = selectedIds.length < 4;
  const isReadOnly = data.isReadOnly;

  const setInfo = (message: string, tone: 'success' | 'error' = 'success') => setFeedback({ tone, message });

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

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[30px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Shield className="h-3.5 w-3.5" />{data.editionLabel}</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Crea / modifica squadra fantasy</h1>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{data.buildWindowHint}</div>
          </div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back</button>
        </div>
      </div>

      {feedback && <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-5">
          <div className={panelClass}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActiveTab('teams')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${activeTab === 'teams' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Per squadre</button>
              <button type="button" onClick={() => setActiveTab('players')} className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${activeTab === 'players' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Per giocatori</button>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca giocatore" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2" />
            </div>

            {activeTab === 'teams' ? (
              <div className="mt-4 space-y-4">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-sm font-black uppercase tracking-wide text-slate-500">{team.teamName}</div>
                    <div className="mt-3 space-y-3">
                      {team.players.map((player) => (
                        <div key={player.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700">{player.playerName}</button>
                              <div className="mt-1 text-sm font-semibold text-slate-600">{player.note}</div>
                              <div className="mt-2"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span></div>
                            </div>
                            <button type="button" disabled={isReadOnly || selectedIds.includes(player.id) || !canAddMore} onClick={() => addPlayer(player.id)} className="inline-flex items-center gap-2 rounded-xl bg-beer-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Aggiungi</button>
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
                    <div className="mt-1 text-sm font-bold text-slate-600">{player.realTeamName}</div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{player.note}</div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusBadgeClass(player.status)}`}>{statusLabel(player.status)}</span>
                      <button type="button" disabled={isReadOnly || selectedIds.includes(player.id) || !canAddMore} onClick={() => addPlayer(player.id)} className="inline-flex items-center gap-2 rounded-xl bg-beer-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Aggiungi</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FantaQuickHelp topics={['roles', 'scoring', 'bonus_scia']} onOpenRules={onOpenRules} compact title="Help rapido builder" />
        </div>

        <div className="space-y-5">
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Rosa provvisoria</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">Massimo 4 giocatori. Il builder previene i vincoli errati prima del salvataggio.</div>
            <div className="mt-4 space-y-3">
              {selectedPlayers.map((player) => {
                const isCaptain = captainId === player.id;
                const isDefender = defenderIds.includes(player.id);
                return (
                  <div key={player.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <button type="button" onClick={() => onOpenPlayerDetail?.(player.id)} className="text-left text-sm font-black text-slate-950 transition hover:text-beer-700">{player.playerName}</button>
                        <div className="mt-1 text-sm font-bold text-slate-600">{player.realTeamName}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => assignCaptain(player.id)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${isCaptain ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'}`}><Star className="h-3.5 w-3.5" />Capitano</button>
                          <button type="button" onClick={() => toggleDefender(player.id)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${isDefender ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700'}`}><Wind className="h-3.5 w-3.5" />Difensore</button>
                        </div>
                      </div>
                      <button type="button" onClick={() => removePlayer(player.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-700">Rimuovi</button>
                    </div>
                  </div>
                );
              })}
              {selectedPlayers.length === 0 && <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">Nessun giocatore selezionato.</div>}
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />Builder pronto per essere collegato a persistenza reale e validazioni server-side.</div>
          </div>
          <div className={panelClass}>
            <div className="text-xl font-black tracking-tight text-slate-950">Vincoli builder</div>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-700">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Giocatori selezionati: <span className="font-black">{selectedIds.length}/4</span></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Capitano assegnato: <span className="font-black">{captainId ? 'Sì' : 'No'}</span></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Difensori selezionati: <span className="font-black">{defenderIds.length}/2</span></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Capitano e Difensori separati: <span className="font-black">{captainId && !defenderIds.includes(captainId) ? 'OK' : 'Check'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
