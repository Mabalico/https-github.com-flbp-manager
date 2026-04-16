import React from 'react';
import { ArrowDown, ArrowUpDown, Search, Shield, Users, X } from 'lucide-react';
import { FANTA_PLAYERS_STANDINGS_MOCK } from '../../services/fantabeerpong/mockData';
import type { FantaPlayersStandingsRow } from '../../services/fantabeerpong/types';
import { panelClass } from './_shared';

interface Props {
  onOpenMyTeam: () => void;
  onOpenStandings: () => void;
  onOpenPlayerDetail?: (playerId: string) => void;
}

type SortField = 'rank' | 'fantasyPoints' | 'livePoints' | 'selectedByTeams';
const stickyTh = 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';
const thPad = 'px-3 py-3 md:px-4';
const tdPad = 'px-3 py-3 md:px-4';
const statusBadgeClass = (status: FantaPlayersStandingsRow['status']) => status === 'live' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'eliminated' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-100 text-slate-600';
const statusLabel = (status: FantaPlayersStandingsRow['status']) => status === 'live' ? 'In gioco' : status === 'eliminated' ? 'Eliminato' : 'In attesa';

export const FantaPlayersStandingsSection: React.FC<Props> = ({ onOpenMyTeam, onOpenStandings, onOpenPlayerDetail }) => {
  const data = FANTA_PLAYERS_STANDINGS_MOCK;
  const [searchTerm, setSearchTerm] = React.useState('');
  const [onlyLive, setOnlyLive] = React.useState(false);
  const [onlyMyPlayers, setOnlyMyPlayers] = React.useState(false);
  const [sortField, setSortField] = React.useState<SortField>('fantasyPoints');
  const featuredPlayer = data.rows.find((row) => row.id === data.featuredPlayerId) || data.rows[0];

  const filteredRows = data.rows
    .filter((row) => row.playerName.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    .filter((row) => !onlyLive || row.status === 'live')
    .filter((row) => !onlyMyPlayers || row.isInMyTeam)
    .sort((left, right) => {
      const primary = sortField === 'rank' ? left.rank - right.rank : right[sortField] - left[sortField];
      return primary !== 0 ? primary : left.playerName.localeCompare(right.playerName, 'it', { sensitivity: 'base' });
    });

  const SortTh: React.FC<{ field: SortField; label: string }> = ({ field, label }) => (
    <th className={`${thPad} ${stickyTh} text-center`}>
      <button type="button" onClick={() => setSortField(field)} className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-black uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ${sortField === field ? 'text-beer-700' : 'text-slate-500 hover:text-beer-600'}`}>
        <span>{label}</span>{sortField === field ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700"><Users className="h-3.5 w-3.5" />{data.editionLabel}</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Classifica giocatori fantasy</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">Ranking player-by-player con stato live, punti fantasy e focus sui giocatori già presenti nella tua rosa.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpenMyTeam} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-700 transition hover:bg-slate-50"><Shield className="h-4 w-4" />Vai alla mia squadra</button>
            <button type="button" onClick={onOpenStandings} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 transition hover:bg-beer-600">Apri classifica generale</button>
          </div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">Giocatore fantasy in evidenza</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Giocatore</div><div className="mt-1 text-base font-black text-slate-950">{featuredPlayer.playerName}</div><div className="mt-1 text-xs font-bold text-slate-500">{featuredPlayer.realTeamName}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Ruolo fantasy</div><div className="mt-1 text-base font-black text-slate-950">{featuredPlayer.roleLabel}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Live points</div><div className="mt-1 text-xl font-black text-slate-950">{featuredPlayer.livePoints}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Selezionato da</div><div className="mt-1 text-xl font-black text-slate-950">{featuredPlayer.selectedByTeams}</div></div>
        </div>
      </div>

      <div role="toolbar" className="flex flex-col gap-4 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca un giocatore" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-10 text-sm font-bold text-slate-700 outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2" />
          {searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOnlyLive((v) => !v)} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition ${onlyLive ? 'bg-beer-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Solo live</button>
          <button type="button" onClick={() => setOnlyMyPlayers((v) => !v)} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide transition ${onlyMyPlayers ? 'bg-beer-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Solo mia rosa</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className={`${thPad} ${stickyTh} w-20 text-center`}>Rank</th>
                <th className={`${thPad} ${stickyTh}`}>Giocatore</th>
                <th className={`${thPad} ${stickyTh} text-center`}>Squadra reale</th>
                <SortTh field="fantasyPoints" label="Punti" />
                <SortTh field="livePoints" label="Live" />
                <th className={`${thPad} ${stickyTh} text-center`}>Ruolo</th>
                <SortTh field="selectedByTeams" label="Scelto da" />
                <th className={`${thPad} ${stickyTh} text-center`}>Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRows.map((row) => (
                <tr key={row.id} className={row.isInMyTeam ? 'bg-beer-50/40' : 'bg-white'}>
                  <td className={`${tdPad} text-center`}><span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black ${row.rank === 1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{row.rank}</span></td>
                  <td className={tdPad}>
                    <button type="button" onClick={() => onOpenPlayerDetail?.(row.id)} className="w-full rounded-xl text-left transition hover:text-beer-700">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0"><div className="truncate text-base font-black text-slate-950">{row.playerName}</div><div className="text-xs font-bold text-slate-500">{row.note}</div></div>
                        {row.isInMyTeam && <span className="inline-flex rounded-full border border-beer-200 bg-beer-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-beer-700">Tua rosa</span>}
                      </div>
                    </button>
                  </td>
                  <td className={`${tdPad} text-center font-black text-slate-900`}>{row.realTeamName}</td>
                  <td className={`${tdPad} text-center font-black text-lg text-slate-950`}>{row.fantasyPoints}</td>
                  <td className={`${tdPad} text-center font-black text-lg text-slate-950`}>{row.livePoints}</td>
                  <td className={`${tdPad} text-center font-black text-slate-900`}>{row.roleLabel}</td>
                  <td className={`${tdPad} text-center font-black text-slate-900`}>{row.selectedByTeams}</td>
                  <td className={`${tdPad} text-center`}><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panelClass}><div className="text-xl font-black tracking-tight text-slate-950">Nota integrazione</div><div className="mt-2 text-sm font-semibold leading-6 text-slate-600">Il dettaglio live del giocatore fantasy è separato e torna sempre al percorso FantaBeerpong.</div></div>
    </div>
  );
};
