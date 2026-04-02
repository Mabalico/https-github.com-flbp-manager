import React, { useState, useEffect } from 'react';
import { AppState, loadState } from '../services/storageService';
import { HallOfFameEntry } from '../types';
import { useTranslation } from '../App';
import { getSupabaseConfig, pullPublicHallOfFameEntries } from '../services/supabasePublic';
import { isLocalOnlyMode } from '../services/repository/featureFlags';
import { Search, Trophy, Star, Wind, Medal, X } from 'lucide-react';
import { PlasticCupIcon } from './icons/PlasticCupIcon';
import { PublicBrandStack } from './PublicBrandStack';
import { readVitePublicDbRead } from '../services/viteEnv';
import { readCachedPublicHallOfFameEntries, writeCachedPublicHallOfFameEntries } from '../services/publicViewCache';
import { buildTitledHallOfFameRows } from '../services/hallOfFameView';

type HallOfFameProps = {
  stateOverride?: AppState;
};

export const HallOfFame: React.FC<HallOfFameProps> = ({ stateOverride }) => {
  const { t } = useTranslation();
  const [localStateSnapshot] = useState<AppState | null>(() => (stateOverride ? null : loadState()));
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [activeTab, setActiveTab] = useState<
    'winner' | 'top_scorer' | 'top_scorer_u25' | 'defender' | 'defender_u25' | 'mvp' | 'titled'
  >('winner');
  const [titledSort, setTitledSort] = useState<
    'total' | 'winner' | 'top_scorer' | 'defender' | 'mvp' | 'top_scorer_u25' | 'defender_u25'
  >('total');
  const [searchTerm, setSearchTerm] = useState('');
  const stickyTh = 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';

  const yearsCount = React.useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      const y = String((e as any)?.year ?? '').trim();
      if (y) set.add(y);
    });
    return set.size;
  }, [entries]);

  const activeTabLabel = React.useMemo(() => {
    if (activeTab === 'winner') return t('winner_plural');
    if (activeTab === 'top_scorer') return t('top_scorers_plural');
    if (activeTab === 'top_scorer_u25') return `${t('top_scorers_plural')} (U25)`;
    if (activeTab === 'defender') return t('defenders_plural');
    if (activeTab === 'defender_u25') return `${t('defenders_plural')} (U25)`;
    if (activeTab === 'mvp') return t('mvp_plural');
    return t('titled_players_plural');
  }, [activeTab, t]);

  // Avoid fading the left edge of the first tab button ("Vincitori/Campioni"):
  // show the left gradient only when the tab row has been scrolled.
  const tabListRef = React.useRef<HTMLDivElement | null>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const safeDateLabel = React.useCallback((value?: string) => {
    const ts = Date.parse(String(value || ''));
    if (!Number.isFinite(ts)) return '';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(ts));
  }, []);

  const extractIsoDateFromKey = React.useCallback((value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    const match = raw.match(/(^|_)(\d{4}-\d{2}-\d{2})(_|$)/);
    if (!match?.[2]) return undefined;
    const iso = match[2];
    return Number.isFinite(Date.parse(iso)) ? iso : undefined;
  }, []);

  const tournamentDateById = React.useMemo(() => {
    const sourceState = stateOverride || localStateSnapshot || { tournamentHistory: [] } as AppState;
    const map = new Map<string, string>();
    (sourceState.tournamentHistory || []).forEach((tournament) => {
      const id = String(tournament?.id || '').trim();
      const startDate = String(tournament?.startDate || '').trim();
      if (id && startDate) map.set(id, startDate);
    });
    return map;
  }, [localStateSnapshot, stateOverride]);

  const getTournamentStartDate = React.useCallback((entry: HallOfFameEntry) => {
    const manualDate = String(entry.sourceTournamentDate || '').trim();
    return tournamentDateById.get(String(entry.tournamentId || '').trim())
      || tournamentDateById.get(String(entry.sourceTournamentId || '').trim())
      || (Number.isFinite(Date.parse(manualDate)) ? manualDate : undefined)
      || extractIsoDateFromKey(entry.tournamentId)
      || extractIsoDateFromKey(entry.sourceTournamentId)
      || extractIsoDateFromKey(entry.id);
  }, [extractIsoDateFromKey, tournamentDateById]);

  const getHallOfFameSortValue = React.useCallback((entry: HallOfFameEntry) => {
    const directStartDate = getTournamentStartDate(entry);
    const ts = Date.parse(String(directStartDate || ''));
    if (Number.isFinite(ts)) return ts;
    const yearNum = parseInt(String(entry.year || '0'), 10) || 0;
    return yearNum > 0 ? Date.UTC(yearNum, 0, 1) : 0;
  }, [getTournamentStartDate]);

  const sortHallOfFameEntries = React.useCallback((list: HallOfFameEntry[]) => {
    return list.slice().sort((a, b) => {
      const byDate = getHallOfFameSortValue(b) - getHallOfFameSortValue(a);
      if (byDate !== 0) return byDate;

      const byYear = (parseInt(String(b.year || '0'), 10) || 0) - (parseInt(String(a.year || '0'), 10) || 0);
      if (byYear !== 0) return byYear;

      const byTournament = String(b.tournamentName || '').localeCompare(String(a.tournamentName || ''), 'it', { sensitivity: 'base' });
      if (byTournament !== 0) return byTournament;

      return String(b.id || '').localeCompare(String(a.id || ''), 'it', { sensitivity: 'base' });
    });
  }, [getHallOfFameSortValue]);

  const getTournamentDateLabel = React.useCallback((entry: HallOfFameEntry) => {
    const directStartDate = getTournamentStartDate(entry);
    return safeDateLabel(directStartDate) || String(entry.year || '').trim() || '—';
  }, [getTournamentStartDate, safeDateLabel]);

  const updateTabFades = React.useCallback(() => {
    const el = tabListRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 1);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateTabFades();
    window.addEventListener('resize', updateTabFades);
    return () => window.removeEventListener('resize', updateTabFades);
  }, [updateTabFades]);

  const PUBLIC_DB_READ_LS_KEY = 'flbp_public_db_read';
  const publicDbReadEnabled = () => {
    if (isLocalOnlyMode()) return false;
    try {
      const v = String(readVitePublicDbRead() ?? '').trim().toLowerCase();
      if (v === '1' || v === 'true' || v === 'yes') return true;
    } catch {
      // ignore
    }
    try {
      return (localStorage.getItem(PUBLIC_DB_READ_LS_KEY) || '').trim() === '1';
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (stateOverride) {
      const list = Array.isArray(stateOverride.hallOfFame) ? stateOverride.hallOfFame : [];
      const sorted = sortHallOfFameEntries(list);
      setEntries(sorted);
      return;
    }

    let cancelled = false;
    const load = async () => {
      // Default: local snapshot (invariant behavior)
      const fallback = () => {
        const state = localStateSnapshot || ({ hallOfFame: [] } as AppState);
        const list = Array.isArray(state.hallOfFame) ? state.hallOfFame : [];
        const sorted = sortHallOfFameEntries(list);
        if (!cancelled) setEntries(sorted);
      };

      // If public DB read is enabled and Supabase is configured, try DB first.
      if (publicDbReadEnabled() && getSupabaseConfig()) {
        try {
          const cached = readCachedPublicHallOfFameEntries();
          if (cached?.length) {
            const sortedCached = sortHallOfFameEntries(cached);
            if (!cancelled) setEntries(sortedCached);
            return;
          }

          const rows = await pullPublicHallOfFameEntries();
          if (!cancelled) {
            const sorted = sortHallOfFameEntries(rows || []);
            writeCachedPublicHallOfFameEntries(sorted);
            setEntries(sorted);
          }
          return;
        } catch {
          // fall back
        }
      }
      fallback();
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [localStateSnapshot, sortHallOfFameEntries, stateOverride]);

  const TabButton = ({
    id,
    label,
    icon,
    badge,
  }: {
    id: 'winner' | 'top_scorer' | 'top_scorer_u25' | 'defender' | 'defender_u25' | 'mvp' | 'titled';
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }) => {
    const isActive = activeTab === id;
    return (
      <button
        type="button"
        role="tab"
        id={`hof-tab-${id}`}
        aria-controls={`hof-panel-${id}`}
        aria-selected={isActive}
        aria-label={label}
        onClick={() => setActiveTab(id)}
        className={`inline-flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl font-black text-sm transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${
          isActive
            ? 'bg-beer-500 text-white shadow-md ring-1 ring-beer-200'
            : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        {badge && (
          <span className="inline-flex items-center rounded-full bg-slate-900/10 px-2 py-0.5 text-[10px] font-black text-slate-700">
            {badge}
          </span>
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  const renderContent = () => {
    const q = (searchTerm || '').trim().toLowerCase();

    if (activeTab === 'titled') {
      const titledState = (stateOverride || localStateSnapshot || {
        tournament: null,
        tournamentHistory: [],
        playerAliases: {},
      }) as Pick<AppState, 'tournament' | 'tournamentHistory' | 'playerAliases'>;
      const players = buildTitledHallOfFameRows(titledState, entries);

      const sortedPlayers = players.sort((a, b) => {
        const primary = (p: typeof a) => {
          if (titledSort === 'winner') return p.win;
          if (titledSort === 'top_scorer') return p.ts;
          if (titledSort === 'defender') return p.def;
          if (titledSort === 'mvp') return p.mvp;
          if (titledSort === 'top_scorer_u25') return p.ts25;
          if (titledSort === 'defender_u25') return p.def25;
          return p.total;
        };

        // 1) Primary sort: selected title type (or Total)
        const a1 = primary(a);
        const b1 = primary(b);
        if (b1 !== a1) return b1 - a1;

        // 2) Tie-breaks: keep the original hierarchy for stability/scannability
        if (titledSort !== 'total') {
          // If sorting by an U25 title, keep U25 tie-breaks first (then main titles)
          if (titledSort === 'top_scorer_u25' || titledSort === 'defender_u25') {
            if (b.u25Total !== a.u25Total) return b.u25Total - a.u25Total;
            if (b.ts25 !== a.ts25) return b.ts25 - a.ts25;
            if (b.def25 !== a.def25) return b.def25 - a.def25;
          }

          if (b.total !== a.total) return b.total - a.total;
          if (b.win !== a.win) return b.win - a.win;
          if (b.ts !== a.ts) return b.ts - a.ts;
          if (b.def !== a.def) return b.def - a.def;
          if (b.mvp !== a.mvp) return b.mvp - a.mvp;
        }

        // Original behavior when sorting by Total
        if (b.total !== a.total) return b.total - a.total;
        if (b.win !== a.win) return b.win - a.win;
        // Tie-break hierarchy per prompt: Campioni -> Capocannoniere -> Difensore -> MVP
        if (b.ts !== a.ts) return b.ts - a.ts;
        if (b.def !== a.def) return b.def - a.def;
        if (b.mvp !== a.mvp) return b.mvp - a.mvp;

        // U25 titles are worth less than all others: they only break ties after all main titles.
        if (b.u25Total !== a.u25Total) return b.u25Total - a.u25Total;
        if (b.ts25 !== a.ts25) return b.ts25 - a.ts25;
        if (b.def25 !== a.def25) return b.def25 - a.def25;

        return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
      });

      const searchedPlayers = q
        ? sortedPlayers.filter(p => (p.name || '').toLowerCase().includes(q))
        : sortedPlayers;

      const colCount = 9;

      const headerButtonClass = (active: boolean) =>
        `inline-flex items-center justify-center w-full gap-1.5 rounded-lg px-1 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${
          active ? 'text-beer-600' : 'text-slate-500 hover:text-slate-700'
        }`;

      return (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="max-h-[68vh] overflow-auto overscroll-contain">
            <table className="w-full text-left" style={{ minWidth: 840 }}>
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className={`py-3 px-3 sm:p-4 w-16 text-center ${stickyTh}`}>#</th>
                  <th className={`py-3 px-3 sm:p-4 ${stickyTh}`}>{t('players')}</th>
                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('total')}
                      className={headerButtonClass(titledSort === 'total')}
                      title={t('titles_total')}
                      aria-label={t('titles_total')}
                    >
                      <Medal className="w-4 h-4" aria-hidden />
                      <span className="hidden sm:inline">{t('titles_total')}</span>
                    </button>
                  </th>

                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`} title={t('tournament_winner')}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('winner')}
                      className={headerButtonClass(titledSort === 'winner')}
                      aria-label={t('tournament_winner')}
                    >
                      <Trophy className="w-4 h-4" aria-hidden />
                    </button>
                  </th>
                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`} title={t('tournament_top_scorer')}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('top_scorer')}
                      className={headerButtonClass(titledSort === 'top_scorer')}
                      aria-label={t('tournament_top_scorer')}
                    >
                      <PlasticCupIcon className="w-4 h-4" />
                    </button>
                  </th>
                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`} title={t('tournament_defender')}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('defender')}
                      className={headerButtonClass(titledSort === 'defender')}
                      aria-label={t('tournament_defender')}
                    >
                      <Wind className="w-4 h-4" aria-hidden />
                    </button>
                  </th>
                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`} title={t('tournament_mvp')}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('mvp')}
                      className={headerButtonClass(titledSort === 'mvp')}
                      aria-label={t('tournament_mvp')}
                    >
                      <Star className="w-4 h-4" aria-hidden />
                    </button>
                  </th>
                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`} title={t('tournament_top_scorer_u25')}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('top_scorer_u25')}
                      className={headerButtonClass(titledSort === 'top_scorer_u25')}
                      aria-label={t('tournament_top_scorer_u25')}
                    >
                      <PlasticCupIcon className="w-4 h-4" />
                      <span className="text-[10px] font-black opacity-70">U25</span>
                    </button>
                  </th>
                  <th className={`py-3 px-3 sm:p-4 text-center ${stickyTh}`} title={t('tournament_defender_u25')}>
                    <button
                      type="button"
                      onClick={() => setTitledSort('defender_u25')}
                      className={headerButtonClass(titledSort === 'defender_u25')}
                      aria-label={t('tournament_defender_u25')}
                    >
                      <Wind className="w-4 h-4" aria-hidden />
                      <span className="text-[10px] font-black opacity-70">U25</span>
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {searchedPlayers.map((p, idx) => (
                  <tr key={`${p.name}_${idx}`} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 sm:p-4 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-3 sm:p-4 font-black text-slate-800 text-lg sm:whitespace-nowrap break-words">{p.name}</td>

                    <td className="py-3 px-3 sm:p-4 text-center font-black text-beer-600 text-xl">{p.total}</td>

                    <td className={`py-3 px-3 sm:p-4 text-center font-black ${p.win ? 'text-slate-800' : 'text-slate-300'}`}>{p.win}</td>
                    <td className={`py-3 px-3 sm:p-4 text-center font-black ${p.ts ? 'text-slate-800' : 'text-slate-300'}`}>{p.ts}</td>
                    <td className={`py-3 px-3 sm:p-4 text-center font-black ${p.def ? 'text-slate-800' : 'text-slate-300'}`}>{p.def}</td>
                    <td className={`py-3 px-3 sm:p-4 text-center font-black ${p.mvp ? 'text-slate-800' : 'text-slate-300'}`}>{p.mvp}</td>

                    <td className={`py-3 px-3 sm:p-4 text-center font-black ${p.ts25 ? 'text-slate-800' : 'text-slate-300'}`}>{p.ts25}</td>
                    <td className={`py-3 px-3 sm:p-4 text-center font-black ${p.def25 ? 'text-slate-800' : 'text-slate-300'}`}>{p.def25}</td>
                  </tr>
                ))}

                {searchedPlayers.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="p-8 text-center text-slate-400">
                      {t('no_hof_records')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      );
    }

    const filteredByType = entries.filter(e => {
      if (activeTab === 'top_scorer') return e.type === 'top_scorer';
      if (activeTab === 'top_scorer_u25') return e.type === 'top_scorer_u25';
      if (activeTab === 'defender') return e.type === 'defender';
      if (activeTab === 'defender_u25') return e.type === 'defender_u25';
      return e.type === activeTab;
    });

    const filtered = (q
      ? filteredByType.filter(e => {
          const hay = [
            String(e.year || ''),
            String(e.tournamentName || ''),
            String(e.teamName || ''),
            Array.isArray(e.playerNames) ? e.playerNames.join(' ') : ''
          ].join(' ').toLowerCase();
          return hay.includes(q);
        })
      : filteredByType
    );
    const showMetric =
      activeTab === 'top_scorer' || activeTab === 'top_scorer_u25' || activeTab === 'defender' || activeTab === 'defender_u25';
    const metricLabel = (activeTab === 'defender' || activeTab === 'defender_u25') ? t('soffi') : t('points');

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(entry => {
          const isIndividualAward = entry.type !== 'winner';
          const primaryLabel = isIndividualAward
            ? (entry.playerNames?.join(', ') || entry.teamName || 'ND')
            : (entry.teamName || entry.playerNames.join(', '));
          const secondaryLabel = isIndividualAward
            ? (entry.teamName || '')
            : (entry.teamName ? entry.playerNames.join(' & ') : '');
          return (
          <div key={entry.id} className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition">
             <div>
               <div className="flex items-center gap-2 mb-2">
                 <span className="bg-slate-900 text-white text-xs font-black px-2 py-1 rounded whitespace-nowrap">{getTournamentDateLabel(entry)}</span>
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                   {entry.tournamentName}
                   {(entry.type === 'top_scorer_u25' || entry.type === 'defender_u25') && <span className="ml-1">(U25)</span>}
                 </span>
               </div>
               <div className="text-xl font-black text-slate-800">
                 <span>{primaryLabel}</span>
               </div>
               {secondaryLabel && <div className="text-sm text-slate-500 font-medium mt-1">{secondaryLabel}</div>}
             </div>
             {showMetric && (
               <div className="text-center">
                 <div className="text-3xl font-black text-beer-500">{entry.value !== undefined && entry.value !== null ? entry.value : 'ND'}</div>
                 <div className="text-[10px] font-bold text-slate-400 uppercase">{metricLabel}</div>
               </div>
             )}
          </div>
        )})}
        {filtered.length === 0 && (
          <div className="col-span-full p-10 sm:p-12 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
             <div className="text-slate-400 font-bold">{t('no_hof_records')}</div>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-8 animate-fade-in">
      {/* Public page header: sporty, "matchday" vibe */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-beer-500/20 blur-3xl" aria-hidden />
        <div className="absolute -left-24 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
          <div className="min-w-0">
            <PublicBrandStack className="mb-3" />
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide">
              <Medal className="w-4 h-4 text-beer-500" aria-hidden />
              {t('hof')}
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight">
              {t('hof')}
            </h1>
            <p className="mt-2 text-slate-300 font-medium max-w-2xl">
              {t('home_hof_desc')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-beer-500" aria-hidden />
              {entries.length} {(t('existing_records') || 'Record').toLowerCase()}
            </span>
            {yearsCount > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-white/50" aria-hidden />
                {yearsCount} {t('year')}
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold" title={activeTabLabel}>
              <Star className="w-4 h-4 text-beer-500" aria-hidden />
              {activeTabLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col gap-3" role="toolbar" aria-label={t('hall_of_fame_aria')}>
          <div className="relative">
            <div
              role="tablist"
              aria-label={t('hall_of_fame_aria')}
              ref={tabListRef}
              onScroll={updateTabFades}
              className="relative z-10 flex flex-nowrap gap-2 overflow-x-auto pb-1 pr-10 scrollbar-hide"
            >
              <TabButton id="winner" label={t('winner_plural')} icon={<Trophy className="w-4 h-4" aria-hidden />} />
              <TabButton id="top_scorer" label={t('top_scorers_plural')} icon={<PlasticCupIcon className="w-4 h-4 text-slate-700" />} />
              <TabButton id="top_scorer_u25" label={`${t('top_scorers_plural')} (U25)`} badge="U25" icon={<PlasticCupIcon className="w-4 h-4 text-slate-700" />} />
              <TabButton id="defender" label={t('defenders_plural')} icon={<Wind className="w-4 h-4" aria-hidden />} />
              <TabButton id="defender_u25" label={`${t('defenders_plural')} (U25)`} badge="U25" icon={<Wind className="w-4 h-4" aria-hidden />} />
              <TabButton id="mvp" label={t('mvp_plural')} icon={<Star className="w-4 h-4" aria-hidden />} />
              <TabButton id="titled" label={t('titled_players_plural')} icon={<Medal className="w-4 h-4" aria-hidden />} />
            </div>
            {showRightFade && (
              <div className="pointer-events-none absolute right-0 top-0 z-0 h-full w-10 bg-gradient-to-l from-white to-transparent" />
            )}
            {showLeftFade && (
              <div className="pointer-events-none absolute left-0 top-0 z-0 h-full w-6 bg-gradient-to-r from-white to-transparent" />
            )}
          </div>

          {activeTab === 'titled' && (
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" aria-hidden />
              <input
                type="text"
                placeholder={t('search_placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 outline-none font-bold text-slate-700"
                aria-label={t('search')}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                  aria-label={t('clear_search')}
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div role="tabpanel" id={`hof-panel-${activeTab}`} aria-labelledby={`hof-tab-${activeTab}`} className="min-h-[80px]">
        {renderContent()}
      </div>
    </div>
  );
};
