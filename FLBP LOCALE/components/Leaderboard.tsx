import React, { useEffect, useMemo, useState } from 'react';
import { AppState, loadState, getPlayerKey, resolvePlayerKey, isU25 } from '../services/storageService';
import { deriveYoBFromBirthDate, pickPlayerIdentityValue } from '../services/playerIdentity';
import { PlayerStats, Match, Team } from '../types';
import { useTranslation } from '../App';
import { Trophy, Medal, Search, Filter, ArrowUpDown, ArrowDown, Star, Wind, X, CalendarDays } from 'lucide-react';
import { getSupabaseConfig, pullPublicCareerLeaderboard, pullPublicHallOfFameEntries } from '../services/supabasePublic';
import { isLocalOnlyMode, isRemoteRepositoryEnabled } from '../services/repository/featureFlags';
import { normalizeNameLower } from '../services/textUtils';
import { PlasticCupIcon } from './icons/PlasticCupIcon';
import { PublicBrandStack } from './PublicBrandStack';
import { readVitePublicDbRead } from '../services/viteEnv';
import {
    readCachedPublicCareerLeaderboard,
    readCachedPublicHallOfFameEntries,
    writeCachedPublicCareerLeaderboard,
    writeCachedPublicHallOfFameEntries,
} from '../services/publicViewCache';

type LeaderboardProps = {
    /**
     * Optional override used by App to pass the DB-synced public snapshot (for HoF icons, tournaments, etc.).
     * When omitted, falls back to localStorage.
     */
    stateOverride?: AppState;
};

const PUBLIC_DB_READ_LS_KEY = 'flbp_public_db_read';
const publicDbReadEnabled = (): boolean => {
    if (isLocalOnlyMode()) return false;
    if (isRemoteRepositoryEnabled()) return true;
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

const isCompetitiveTeamId = (teamId: string | undefined, teamsSource: Team[]): teamId is string => {
    if (!teamId) return false;
    const team = teamsSource.find((candidate) => candidate.id === teamId);
    if (team?.isBye || team?.hidden) return false;
    const label = String(team?.name || teamId).trim().toUpperCase();
    return label !== 'BYE' && label !== 'TBD' && label !== 'SLOT LIBERO';
};

const getWinningTeamId = (match: Match, teamsSource: Team[]): string | null => {
    if (match.isBye) return null;

    if (Array.isArray(match.teamIds) && match.teamIds.length > 0 && match.scoresByTeam) {
        const competitiveTeamIds = match.teamIds.filter((teamId) => isCompetitiveTeamId(teamId, teamsSource));
        if (competitiveTeamIds.length < 2) return null;

        let winningTeamId: string | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        let tie = false;

        competitiveTeamIds.forEach((teamId) => {
            const score = Number(match.scoresByTeam?.[teamId]);
            if (!Number.isFinite(score)) return;
            if (score > bestScore) {
                bestScore = score;
                winningTeamId = teamId;
                tie = false;
            } else if (score === bestScore) {
                tie = true;
            }
        });

        return tie ? null : winningTeamId;
    }

    if (!isCompetitiveTeamId(match.teamAId, teamsSource) || !isCompetitiveTeamId(match.teamBId, teamsSource)) return null;
    if (match.scoreA === match.scoreB) return null;
    return match.scoreA > match.scoreB ? match.teamAId : match.teamBId;
};

export const Leaderboard: React.FC<LeaderboardProps> = ({ stateOverride }) => {
    const { t } = useTranslation();
    const [localStateSnapshot] = useState<AppState | null>(() => (stateOverride ? null : loadState()));
    const state = stateOverride || localStateSnapshot || { teams: [], matches: [], tournamentHistory: [], hallOfFame: [], integrationsScorers: [] } as AppState;
    const [searchTerm, setSearchTerm] = useState('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [onlyPro, setOnlyPro] = useState(false);
    const [onlyU25, setOnlyU25] = useState(false);
    const [sortField, setSortField] = useState<'points' | 'soffi' | 'gamesPlayed' | 'winRate' | 'avgPoints' | 'avgSoffi'>('points');

    const [dbStats, setDbStats] = useState<PlayerStats[] | null>(null);
    const [dbHoF, setDbHoF] = useState<import('../types').HallOfFameEntry[] | null>(null);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        const pushYear = (iso?: string) => {
            const ts = Date.parse(String(iso || ''));
            if (!Number.isFinite(ts)) return;
            years.add(String(new Date(ts).getFullYear()));
        };
        (state.tournamentHistory || []).forEach(tn => pushYear(tn.startDate));
        if (state.tournament?.startDate) pushYear(state.tournament.startDate);
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [state.tournamentHistory, state.tournament?.startDate]);

    // Keep UI selection safe if history changes.
    useEffect(() => {
        if (yearFilter !== 'all' && !availableYears.includes(yearFilter)) {
            setYearFilter('all');
        }
    }, [availableYears, yearFilter]);

    // Optional: when public DB read is enabled, we can fetch a pre-aggregated public leaderboard
    // (without exposing full YoB). This keeps multi-device public displays consistent.
    useEffect(() => {
        if (stateOverride) {
            setDbStats(null);
            setDbHoF(null);
            return;
        }
        if (!publicDbReadEnabled()) {
            setDbStats(null);
            setDbHoF(null);
            return;
        }
        // If Supabase isn't configured we silently fall back.
        if (!getSupabaseConfig()) return;

        let cancelled = false;
        const cachedStats = readCachedPublicCareerLeaderboard();
        const cachedHoF = readCachedPublicHallOfFameEntries();

        if (cachedStats?.length) setDbStats(cachedStats);
        if (cachedHoF?.length) setDbHoF(cachedHoF);

        if (cachedStats?.length && cachedHoF?.length) {
            return () => {
                cancelled = true;
            };
        }

        const run = async () => {
            try {
                const [rows, hof] = await Promise.all([pullPublicCareerLeaderboard(), pullPublicHallOfFameEntries()]);
                if (cancelled) return;
                if (rows && rows.length) {
                    writeCachedPublicCareerLeaderboard(rows);
                    setDbStats(rows);
                }
                if (hof && hof.length) {
                    writeCachedPublicHallOfFameEntries(hof);
                    setDbHoF(hof);
                }
            } catch {
                // silent fallback to local calculation
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [stateOverride]);

    const computedStats = useMemo(() => {
        const playerMap: Record<string, PlayerStats> = {};

        const selectedYear = yearFilter === 'all' ? undefined : parseInt(yearFilter, 10);
        const yearOfIso = (iso?: string): number | undefined => {
            const ts = Date.parse(String(iso || ''));
            if (!Number.isFinite(ts)) return undefined;
            return new Date(ts).getFullYear();
        };

        const initPlayer = (rawKey: string, name: string, teamName: string, birthDate?: string) => {
            const key = resolvePlayerKey(state, rawKey);
            const yob = deriveYoBFromBirthDate(birthDate);
            if (!playerMap[key]) {
                playerMap[key] = {
                    id: key,
                    name,
                    teamName,
                    gamesPlayed: 0,
                    wins: 0,
                    losses: 0,
                    winRate: 0,
                    points: 0,
                    soffi: 0,
                    avgPoints: 0,
                    avgSoffi: 0,
                    birthDate,
                    yob,
                };
            } else if (birthDate && !playerMap[key].birthDate) {
                playerMap[key].birthDate = birthDate;
                playerMap[key].yob = yob;
            }
            return playerMap[key];
        };

const processMatch = (m: Match, teamsSource: Team[]) => {
            if (!m.played || !m.stats) return;
            const winningTeamId = getWinningTeamId(m, teamsSource);
            m.stats.forEach(s => {
                const t = teamsSource.find(tm => tm.id === s.teamId);
                let birthDate: string | undefined;
                if (t) {
                    if (t.player1 === s.playerName) { birthDate = (t as any).player1BirthDate; }
                    if (t.player2 === s.playerName) { birthDate = (t as any).player2BirthDate; }
                }
                const rawKey = getPlayerKey(s.playerName, pickPlayerIdentityValue(birthDate));
                const p = initPlayer(rawKey, s.playerName, t?.name || s.teamId || '?', birthDate);
                p.gamesPlayed++;
                if (winningTeamId && isCompetitiveTeamId(s.teamId, teamsSource)) {
                    if (s.teamId === winningTeamId) p.wins = (p.wins || 0) + 1;
                    else p.losses = (p.losses || 0) + 1;
                }
                p.points += (s.canestri || 0);
                p.soffi += (s.soffi || 0);
            });
        };

        // Aggregate matches
        // NOTE: When a specific year is selected, we only consider tournaments whose startDate matches that year.
        // We exclude state.matches and integrationsScorers in year mode because they are not reliably attributable.
        if (!selectedYear && state.matches && Array.isArray(state.matches)) {
            state.matches.forEach(m => processMatch(m, state.teams));
        }
        if (state.tournamentHistory && Array.isArray(state.tournamentHistory)) {
            state.tournamentHistory.forEach(tn => {
                const y = yearOfIso((tn as any)?.startDate);
                if (selectedYear && y !== selectedYear) return;
                (tn.matches || []).forEach(m => processMatch(m, tn.teams || []));
            });
        }
        if (state.tournament) {
            const y = yearOfIso(state.tournament.startDate);
            if (!selectedYear || y === selectedYear) {
                (state.tournamentMatches || []).forEach(m => processMatch(m, state.teams));
            }
        }

        // Integrazioni manuali (marcatori esterni ai tornei archiviati)
        // Only in all-years mode.
        if (!selectedYear) {
            (state.integrationsScorers || []).forEach(e => {
                const birthDate = (e as any).birthDate;
                const rawKey = getPlayerKey(e.name, pickPlayerIdentityValue(birthDate));
                const p = initPlayer(rawKey, e.name, e.teamName || 'Integrazioni', birthDate);
                p.gamesPlayed += (e.games || 0);
                p.points += (e.points || 0);
                p.soffi += (e.soffi || 0);
            });
        }
        
        // Process Hall of Fame (optional if needed to enrich data, but usually HoF is separate display)
        // state.hallOfFame.forEach(...)

        // Calculate averages
        return Object.values(playerMap).map(p => ({
            ...p,
            winRate: (p.wins || 0) + (p.losses || 0) > 0
                ? parseFloat((((p.wins || 0) / ((p.wins || 0) + (p.losses || 0))) * 100).toFixed(1))
                : 0,
            avgPoints: p.gamesPlayed > 0 ? parseFloat((p.points / p.gamesPlayed).toFixed(2)) : 0,
            avgSoffi: p.gamesPlayed > 0 ? parseFloat((p.soffi / p.gamesPlayed).toFixed(2)) : 0
        }));
    }, [state, dbStats, yearFilter]);

    const computedStatsById = useMemo(
        () => new Map(computedStats.map((player) => [player.id, player])),
        [computedStats]
    );

    const stats = useMemo(() => {
        if (yearFilter !== 'all' || !dbStats || !dbStats.length) return computedStats;
        return dbStats.map((player) => {
            const localPlayer = computedStatsById.get(player.id);
            if (!localPlayer) return player;
            return {
                ...player,
                birthDate: player.birthDate ?? localPlayer.birthDate,
                yob: player.yob ?? localPlayer.yob,
                wins: localPlayer.wins ?? 0,
                losses: localPlayer.losses ?? 0,
                winRate: localPlayer.winRate ?? 0,
            };
        });
    }, [computedStats, computedStatsById, dbStats, yearFilter]);

    const formatWinRate = (player: PlayerStats) => {
        const wins = player.wins ?? 0;
        const losses = player.losses ?? 0;
        if (wins + losses <= 0) return '—';
        return `${(player.winRate ?? 0).toFixed(1)}%`;
    };

    const normalizeName = (n: string) => normalizeNameLower(n);

    const disambiguateNameMap = useMemo(() => {
        const map = new Map<string, Set<string>>();
        stats.forEach(p => {
            const k = normalizeName(p.name);
            const set = map.get(k) || new Set<string>();
            set.add(p.yobLabel ? `LBL:${p.yobLabel}` : 'ND');
            map.set(k, set);
        });
        const res: Record<string, boolean> = {};
        map.forEach((set, k) => {
            if (set.size > 1) res[k] = true;
        });
        return res;
    }, [stats]);

    const titleCountsByPlayerId = useMemo(() => {
        type TitleCounts = { winner: number; top_scorer: number; defender: number; mvp: number; top_scorer_u25: number; defender_u25: number };
        const byId: Record<string, TitleCounts> = {};

        const ensure = (id: string) => {
            if (!byId[id]) byId[id] = { winner: 0, top_scorer: 0, defender: 0, mvp: 0, top_scorer_u25: 0, defender_u25: 0 };
            return byId[id];
        };

        // Index players by normalized name to allow safe fallback mapping (only if unique).
        const byName = new Map<string, string[]>();
        const validIds = new Set<string>();
        stats.forEach(p => {
            const k = normalizeName(p.name);
            const arr = byName.get(k) || [];
            arr.push(p.id);
            byName.set(k, arr);
            validIds.add(p.id);
        });

        const uniqueIdByName = (name: string) => {
            const k = normalizeName(name);
            const arr = byName.get(k) || [];
            return arr.length === 1 ? arr[0] : undefined;
        };

        const hofSource = (dbHoF && dbHoF.length) ? dbHoF : (state.hallOfFame || []);

        hofSource.forEach(e => {
            if (e.type === 'winner') {
                (e.playerNames || []).forEach(pn => {
                    const pid = uniqueIdByName(pn);
                    if (pid) ensure(pid).winner += 1;
                });
                return;
            }

            const primaryName = (e.playerNames && e.playerNames[0]) ? e.playerNames[0] : '';
            let pid: string | undefined = e.playerId ? resolvePlayerKey(state, e.playerId) : undefined;

            // Prefer direct match, otherwise fallback by unique name (avoid homonym merge).
            if (!pid || !validIds.has(pid)) {
                const fallback = uniqueIdByName(primaryName);
                if (fallback) pid = fallback;
            }

            if (!pid) return;
            const c = ensure(pid);

            if (e.type === 'top_scorer') c.top_scorer += 1;
            if (e.type === 'top_scorer_u25') c.top_scorer_u25 += 1;
            if (e.type === 'defender') c.defender += 1;
            if (e.type === 'defender_u25') c.defender_u25 += 1;
            if (e.type === 'mvp') c.mvp += 1;
        });

        return byId;
    }, [stats, state.hallOfFame, dbHoF]);

    const filteredStats = stats
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(p => !onlyPro || p.gamesPlayed >= 5)
        .filter(p => !onlyU25 || (p.u25 ?? isU25(p.birthDate)))
        .sort((a, b) => {
    const primary = (b as any)[sortField] - (a as any)[sortField];
    if (primary !== 0) return primary;
    // Fixed tie-break importance: baskets > blows > games > averages
    const order: Array<keyof any> = ['points', 'soffi', 'gamesPlayed', 'winRate', 'avgPoints', 'avgSoffi'];
    for (const k of order) {
        if (k === sortField) continue;
        const d = (b as any)[k] - (a as any)[k];
        if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
});

    const thPad = 'py-3 px-3 sm:p-4';
    const stickyTh = 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';
    const sortBtnBase = 'inline-flex items-center justify-center gap-1 w-full rounded-md focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 outline-none';
    const SortTh: React.FC<{ field: typeof sortField; children: React.ReactNode; className?: string }> = ({ field, children, className }) => (
        <th
            className={`${thPad} ${stickyTh} text-center ${className || ''}`}
            aria-sort={sortField === field ? 'descending' : 'none'}
        >
            <button
                type="button"
                onClick={() => setSortField(field)}
                className={`${sortBtnBase} px-2 py-1 transition ${sortField === field ? 'text-beer-700' : 'text-slate-500 hover:text-beer-600'}`}
            >
                <span>{children}</span>
                {sortField === field ? <ArrowDown className="w-3.5 h-3.5" aria-hidden /> : null}
            </button>
        </th>
    );


    return (
        <div className="space-y-8 animate-fade-in">
            {/* Public page header: "sport scoreboard" vibe + clear hierarchy */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-beer-500/20 blur-3xl" aria-hidden />
                <div className="absolute -left-24 -bottom-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" aria-hidden />

                <div className="relative flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
                    <div className="min-w-0">
                        <PublicBrandStack className="mb-3" />
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide">
                            <Trophy className="w-4 h-4 text-beer-500" aria-hidden />
                            {t('all_time_stats')}
                        </div>
                        <h1 className="mt-3 text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight">
                            {t('historical')}
                        </h1>
                        <p className="mt-2 text-slate-300 font-medium max-w-2xl">
                            {t('home_leaderboard_desc')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-beer-500" aria-hidden />
                            {filteredStats.length} / {stats.length} {t('players').toLowerCase()}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold" title={t('pro_mode')}
                        >
                            <Filter className="w-4 h-4 text-beer-500" aria-hidden />
                            {onlyPro ? t('pro_mode') : t('general_mode')}
                        </span>
                        {onlyU25 && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold">
                                <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden />
                                U25
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div role="toolbar" aria-label="Leaderboard controls" className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" aria-hidden />
                    <input 
                        type="text" 
                        placeholder={t('search_placeholder')} 
                        value={searchTerm}
                        aria-label={t('search')}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 outline-none font-bold text-slate-700"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                            aria-label="Clear search"
                        >
                            <X className="w-4 h-4" aria-hidden />
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto">
                    <div className="relative w-full sm:w-auto sm:min-w-[200px]">
                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden />
                        <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(e.target.value)}
                            aria-label="Filtra per anno"
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                        >
                            <option value="all">Tutti gli anni</option>
                            {availableYears.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative w-full sm:w-auto sm:min-w-[220px]">
                        <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden />
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as any)}
                            aria-label="Sort"
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                        >
                            <option value="points">{t('points')}</option>
                            <option value="soffi">{t('soffi')}</option>
                            <option value="gamesPlayed">{t('games')}</option>
                            <option value="avgPoints">{t('avg_points')}</option>
                            <option value="avgSoffi">{t('avg_soffi')}</option>
                            <option value="winRate">{t('standings_wins')} %</option>
                        </select>
                    </div>

                    <button 
                        onClick={() => setOnlyPro(!onlyPro)}
                        aria-pressed={onlyPro}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-black transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${onlyPro ? 'bg-beer-500 text-white ring-1 ring-beer-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        title={t('pro_mode')}
                    >
                        <Filter className="w-4 h-4" />
                        {t('pro_mode')}
                    </button>
                    <button
                        onClick={() => setOnlyU25(!onlyU25)}
                        aria-pressed={onlyU25}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-black transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${onlyU25 ? 'bg-green-600 text-white ring-1 ring-green-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        title="U25"
                    >
                        U25
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="max-h-[68vh] overflow-auto overscroll-contain">
                    <table className="w-full min-w-[1020px] text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-black uppercase tracking-wider">
                            <tr>
                                <th className={`${thPad} ${stickyTh} w-16 text-center`}>{t('rank')}</th>
                                <th className={`${thPad} ${stickyTh}`}>{t('players')}</th>
                                <SortTh field="gamesPlayed">{t('games')}</SortTh>
                                <SortTh field="points">{t('points')}</SortTh>
                                <SortTh field="soffi">{t('soffi')}</SortTh>
                                <SortTh field="avgPoints">{t('avg_points')}</SortTh>
                                <SortTh field="avgSoffi">{t('avg_soffi')}</SortTh>
                                <SortTh field="winRate">{t('standings_wins_short')}%</SortTh>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                            {filteredStats.map((p, idx) => (
                                <tr key={p.id} className="hover:bg-slate-50 transition">
                                    <td className={`${thPad} text-center font-black text-slate-400`}>
                                        {idx < 3 ? (
                                            idx === 0 ? <Trophy className="w-5 h-5 text-yellow-500 mx-auto" /> :
                                            idx === 1 ? <Medal className="w-5 h-5 text-slate-400 mx-auto" /> :
                                            <Medal className="w-5 h-5 text-orange-700 mx-auto" />
                                        ) : idx + 1}
                                    </td>
                                    <td className={`${thPad}`}>
                                        <div className="font-bold text-slate-900 text-base flex items-center gap-2 flex-wrap">
                                            <span>{p.name}</span>
                                            {(() => {
                                                const c = titleCountsByPlayerId[p.id];
                                                if (!c) return null;
                                                const parts: React.ReactNode[] = [];

                                                const awardBadge = (
                                                    key: string,
                                                    title: string,
                                                    icon: React.ReactNode,
                                                    count: number,
                                                    className: string
                                                ) => (
                                                    <span
                                                        key={key}
                                                        title={title}
                                                        className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-black ${className} cursor-help select-none`}
                                                    >
                                                        {icon}
                                                        {count > 1 ? `×${count}` : ''}
                                                    </span>
                                                );

                                                if (c.winner) {
                                                    parts.push(
                                                        awardBadge('w', 'Vittoria torneo', <Trophy className="w-4 h-4 text-yellow-600" aria-hidden />, c.winner, 'text-slate-700')
                                                    );
                                                }
                                                if (c.top_scorer) {
                                                    parts.push(
                                                        awardBadge(
                                                            'ts',
                                                            'Capocannoniere',
                                                            <PlasticCupIcon className="w-4 h-4 text-slate-700" />,
                                                            c.top_scorer,
                                                            'text-slate-700'
                                                        )
                                                    );
                                                }
                                                if (c.defender) {
                                                    parts.push(
                                                        awardBadge('def', 'Miglior difensore', <Wind className="w-4 h-4 text-sky-600" aria-hidden />, c.defender, 'text-slate-700')
                                                    );
                                                }
                                                if (c.mvp) {
                                                    parts.push(
                                                        awardBadge('mvp', 'MVP', <Star className="w-4 h-4 text-amber-600" aria-hidden />, c.mvp, 'text-slate-700')
                                                    );
                                                }

                                                // U25 awards: show only if the player doesn't already have the corresponding general award.
                                                // Render smaller to visually differentiate.
                                                const u25Parts: React.ReactNode[] = [];
                                                if (!c.top_scorer && c.top_scorer_u25) {
                                                    u25Parts.push(
                                                        awardBadge(
                                                            'tsu',
                                                            'Capocannoniere U25',
                                                            <PlasticCupIcon className="w-4 h-4 text-slate-700" />,
                                                            c.top_scorer_u25,
                                                            'text-slate-600'
                                                        )
                                                    );
                                                }
                                                if (!c.defender && c.defender_u25) {
                                                    u25Parts.push(
                                                        awardBadge(
                                                            'defu',
                                                            'Difensore U25',
                                                            <Wind className="w-4 h-4 text-sky-600" aria-hidden />,
                                                            c.defender_u25,
                                                            'text-slate-600'
                                                        )
                                                    );
                                                }
                                                if (u25Parts.length) parts.push(<span key="u25" className="flex items-center gap-1">{u25Parts}</span>);
                                                return parts.length ? <span className="flex items-center gap-1">{parts}</span> : null;
                                            })()}
                                        </div>
                                        {disambiguateNameMap[normalizeName(p.name)] && (
                                            <div className="text-[10px] text-slate-400 font-bold">
                                                {p.yobLabel ? p.yobLabel : 'ND'}
                                            </div>
                                        )}
                                    </td>
                                    <td className={`${thPad} text-center font-bold`}>{p.gamesPlayed}</td>
                                    <td className={`${thPad} text-center font-black text-lg ${sortField === 'points' ? 'text-beer-600' : 'text-slate-700'}`}>{p.points}</td>
                                    <td className={`${thPad} text-center font-black text-lg ${sortField === 'soffi' ? 'text-blue-600' : 'text-slate-700'}`}>{p.soffi}</td>
                                    <td className={`${thPad} text-center font-black text-lg ${sortField === 'avgPoints' ? 'text-beer-600' : ''}`}>{p.avgPoints}</td>
                                    <td className={`${thPad} text-center font-black text-lg ${sortField === 'avgSoffi' ? 'text-blue-600' : ''}`}>{p.avgSoffi}</td>
                                    <td className={`${thPad} text-center font-black text-base ${sortField === 'winRate' ? 'text-emerald-700' : 'text-slate-700'}`}>{formatWinRate(p)}</td>
                                </tr>
                            ))}
                            {filteredStats.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                                        {t('no_players_found')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
