import { scoringRankIndex } from '../services/awardRules';
import { countedIntegrations, listEditions, editionMatches } from '../services/editionData';
import { buildTitledHallOfFameRows } from '../services/hallOfFameView';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, loadState, getPlayerKey, resolvePlayerKey, isU25 } from '../services/storageService';
import { deriveYoBFromBirthDate, formatPlayerBirthIdentityLabel, getPlayerKeyLabel, pickPlayerIdentityValue } from '../services/playerIdentity';
import { PlayerStats, Match, Team } from '../types';
import { useTranslation } from '../App';
import { Trophy, Medal, Search, Filter, ArrowUpDown, ArrowDown, X, CalendarDays } from 'lucide-react';
import { getSupabaseConfig, pullPublicCareerLeaderboard, pullPublicHallOfFameEntries } from '../services/supabasePublic';
import { isLocalOnlyMode, isRemoteRepositoryEnabled } from '../services/repository/featureFlags';
import { normalizeNameLower } from '../services/textUtils';
import { PublicBrandStack } from './PublicBrandStack';
import { PublicPlayerDetail } from './PublicPlayerDetail';
import { hasCountedPlayerStats } from '../services/matchUtils';
import { readVitePublicDbRead } from '../services/viteEnv';
import { isEmbeddedNativeShell } from '../services/nativeShell';
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
    returnToListRequest?: number;
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

export const Leaderboard: React.FC<LeaderboardProps> = ({ stateOverride, returnToListRequest }) => {
    const { t } = useTranslation();
    const nativeShell = isEmbeddedNativeShell();
    const [localStateSnapshot] = useState<AppState | null>(() => (stateOverride ? null : loadState()));
    const state = stateOverride || localStateSnapshot || { teams: [], matches: [], tournamentHistory: [], hallOfFame: [], integrationsScorers: [] } as AppState;
    const [searchTerm, setSearchTerm] = useState('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [onlyPro, setOnlyPro] = useState(false);
    const [onlyU25, setOnlyU25] = useState(false);
    const [sortField, setSortField] = useState<'points' | 'soffi' | 'gamesPlayed' | 'winRate' | 'avgPoints' | 'avgSoffi'>('points');
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(null);

    useEffect(() => {
        setSelectedPlayer(null);
    }, [returnToListRequest]);

    useEffect(() => {
        if (selectedPlayer) window.scrollTo({ top: 0, behavior: 'instant' });
    }, [selectedPlayer]);

    const [dbStats, setDbStats] = useState<PlayerStats[] | null>(null);
    const [dbHoF, setDbHoF] = useState<import('../types').HallOfFameEntry[] | null>(null);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        const pushYear = (iso?: string) => {
            const ts = Date.parse(String(iso || ''));
            if (!Number.isFinite(ts)) return;
            years.add(String(new Date(ts).getFullYear()));
        };
        listEditions(state).forEach(row => pushYear(row.date || row.year));
        if (state.tournament?.startDate) pushYear(state.tournament.startDate);
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [state]);

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
            if (!hasCountedPlayerStats(m)) return;
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
                const slot = t?.player1 === s.playerName ? 1 : 2;
                if (!birthDate && typeof (t as any)?.[`player${slot}CareerU25`] === 'boolean') p.u25 = (t as any)[`player${slot}CareerU25`];
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
                if (tn.config?.resultsOnly) return;
                editionMatches(state, tn.id).forEach(m => processMatch(m, tn.teams || []));
            });
        }
        if (state.tournament) {
            const y = yearOfIso(state.tournament.startDate);
            if ((!selectedYear || y === selectedYear) && !state.tournament.config?.resultsOnly) {
                (state.tournamentMatches || []).forEach(m => processMatch(m, state.teams));
            }
        }

        // Edition imports are attributable to the tournament year.
        {
            countedIntegrations(state, selectedYear ? String(selectedYear) : undefined).forEach(e => {
                const birthDate = (e as any).birthDate;
                const rawKey = getPlayerKey(e.name, pickPlayerIdentityValue(birthDate));
                const p = initPlayer(rawKey, e.name, e.teamName || 'Integrazioni', birthDate);
                if (!birthDate && typeof (e as any).careerU25 === 'boolean') p.u25 = (e as any).careerU25;
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
    const getDisplayBirthIdentityLabel = (player: PlayerStats) =>
        formatPlayerBirthIdentityLabel(
            player.yobLabel
            ?? player.birthDate
            ?? (typeof player.yob === 'number' ? String(player.yob) : '')
        );

    const disambiguateNameMap = useMemo(() => {
        const map = new Map<string, Set<string>>();
        stats.forEach(p => {
            const k = normalizeName(p.name);
            const set = map.get(k) || new Set<string>();
            const label = getDisplayBirthIdentityLabel(p);
            set.add(label ? `LBL:${label}` : 'ND');
            map.set(k, set);
        });
        const res: Record<string, boolean> = {};
        map.forEach((set, k) => {
            if (set.size > 1) res[k] = true;
        });
        return res;
    }, [stats]);

    const hallOfFame = state.hallOfFame?.length ? state.hallOfFame : dbHoF || [];
    const titleCountsByPlayerId = useMemo(() => {
        const idsByName = new Map<string, string[]>();
        for (const player of stats) {
            const name = normalizeName(player.name);
            idsByName.set(name, [...(idsByName.get(name) || []), player.id]);
        }
        const playerIds = new Set(stats.map(player => player.id));
        const totals: Record<string, number> = {};
        for (const row of buildTitledHallOfFameRows(state, hallOfFame)) {
            const candidates = idsByName.get(normalizeName(row.name)) || [];
            const hasKnownIdentity = getPlayerKeyLabel(row.key).yob !== 'ND';
            const id = playerIds.has(row.key) ? row.key : !hasKnownIdentity && candidates.length === 1 ? candidates[0] : null;
            if (id) totals[id] = (totals[id] || 0) + row.total + row.u25Total;
        }
        return totals;
    }, [stats, state, hallOfFame]);

    const rankIndex = (index: number) => scoringRankIndex(filteredStats, index, sortField);
    const filteredStats = stats
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter(p => !onlyPro || p.gamesPlayed >= 5)
        .filter(p => !onlyU25 || (p.u25 ?? isU25(p.birthDate)))
        .sort((a, b) => {
    const primary = (b as any)[sortField] - (a as any)[sortField];
    if (primary !== 0) return primary;
    if ((sortField === 'points' || sortField === 'soffi') && a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    // Fixed tie-break importance: baskets > blows > games > averages
    const order: Array<keyof any> = ['points', 'soffi', 'gamesPlayed', 'winRate', 'avgPoints', 'avgSoffi'];
    for (const k of order) {
        if (k === sortField) continue;
        const d = (b as any)[k] - (a as any)[k];
        if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
});

    const thPad = 'py-3 px-2 sm:p-4';
    const stickyTh = nativeShell ? '' : 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';
    const tableScrollClass = nativeShell ? 'overflow-x-auto' : 'overflow-x-auto overscroll-x-contain sm:max-h-[68vh] sm:overflow-auto sm:overscroll-contain';
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

    const renderPlayerAwardBadges = (player: PlayerStats) => {
        const count = titleCountsByPlayerId[player.id] || 0;
        if (!count) return null;
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-900"
                title={t('players_titles_count').replace('{count}', String(count))}
                aria-label={t('players_titles_count').replace('{count}', String(count))}>
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                ×{count}
            </span>
        );
    };

    if (selectedPlayer) {
        return (
            <PublicPlayerDetail
                state={{ ...state, hallOfFame }}
                playerId={selectedPlayer.id}
                playerName={selectedPlayer.name}
                playerBirthDate={selectedPlayer.birthDate}
                fallbackStats={selectedPlayer}
                onBack={() => setSelectedPlayer(null)}
            />
        );
    }

    return (
        <div className="space-y-3 sm:space-y-8">
            {/* Public page header: "sport scoreboard" vibe + clear hierarchy */}
            <div className="hidden overflow-hidden rounded-3xl bg-slate-900 p-8 text-white shadow-xl sm:block sm:relative">
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

            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 sm:hidden">
                <h1 className="text-xl font-black text-slate-950">{t('historical')}</h1>
                <span className="text-sm font-bold text-slate-600">{filteredStats.length} {t('players').toLocaleLowerCase()}</span>
            </div>

            <div role="toolbar" aria-label={t('leaderboard_controls')} className="flex flex-col items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5 md:flex-row">
                <div className="relative w-full md:w-96">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" aria-hidden />
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
                            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                            aria-label={t('clear_search')}
                        >
                            <X className="w-4 h-4" aria-hidden />
                        </button>
                    )}
                </div>
                <div className="flex w-full items-center gap-2 sm:flex-wrap sm:justify-end md:w-auto">
                    <div className="relative hidden w-full sm:block sm:w-auto sm:min-w-[180px]">
                        <CalendarDays className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden />
                        <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(e.target.value)}
                            aria-label={t('filter_by_year')}
                            className="w-full ps-9 pe-4 py-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                        >
                            <option value="all">{t('all_years')}</option>
                            {availableYears.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative min-w-0 flex-1 sm:w-auto sm:min-w-[185px] sm:flex-none">
                        <ArrowUpDown className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden />
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as any)}
                            aria-label={t('sort_by')}
                            className="w-full ps-9 pe-4 py-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
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
                        className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-sm font-black transition shadow-sm sm:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${onlyPro ? 'bg-beer-500 text-white ring-1 ring-beer-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        title={t('pro_mode')}
                        aria-label={t('pro_mode')}
                    >
                        <Filter className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                        <span className="sm:hidden">Pro</span><span className="hidden sm:inline">{t('pro_mode')}</span>
                    </button>
                    <button
                        onClick={() => setOnlyU25(!onlyU25)}
                        aria-pressed={onlyU25}
                        className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-sm font-black transition shadow-sm sm:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${onlyU25 ? 'bg-green-600 text-white ring-1 ring-green-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        title="U25"
                    >
                        U25
                    </button>
                </div>
            </div>

            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:hidden">
                {filteredStats.map((player, index) => {
                    const titles = titleCountsByPlayerId[player.id] || 0;
                    const value = sortField === 'winRate' ? formatWinRate(player) : player[sortField];
                    const unit = sortField === 'points' || sortField === 'avgPoints' ? t('leaderboard_points_short')
                        : sortField === 'soffi' || sortField === 'avgSoffi' ? t('leaderboard_soffi_short')
                        : sortField === 'gamesPlayed' ? t('games').toLocaleLowerCase() : '';
                    return (
                        <li key={player.id}>
                            <button type="button" className="flex min-h-[58px] w-full items-center gap-2 px-3 py-2 text-start hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600" onClick={() => setSelectedPlayer(player)}>
                                <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums text-slate-600">{rankIndex(index) + 1}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-black text-slate-950">{player.name}</span>
                                    {disambiguateNameMap[normalizeName(player.name)] && getDisplayBirthIdentityLabel(player) && (
                                        <span className="block text-xs text-slate-600">{getDisplayBirthIdentityLabel(player)}</span>
                                    )}
                                    <span className="block text-xs font-medium text-slate-600">
                                        {t(player.gamesPlayed === 1 ? 'leaderboard_games_one' : 'leaderboard_games_count').replace('{count}', String(player.gamesPlayed))}
                                        {' · '}{t(titles === 1 ? 'leaderboard_title_one' : 'players_titles_count').replace('{count}', String(titles))}
                                    </span>
                                </span>
                                {renderPlayerAwardBadges(player)}
                                <span className="shrink-0 text-end text-lg font-black tabular-nums text-slate-950">
                                    {value}{unit && <span className="text-[10px] font-bold text-slate-600">{' '}{unit}</span>}
                                </span>
                            </button>
                        </li>
                    );
                })}
                {filteredStats.length === 0 && <li className="p-5 text-center text-sm text-slate-600">{t('no_players_found')}</li>}
            </ul>

            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:block">
                <div className={tableScrollClass}>
                    <table className="w-full min-w-[820px] text-left text-[13px] sm:min-w-[1020px] sm:text-sm">
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
                                <tr
                                    key={p.id}
                                    className="cursor-pointer hover:bg-slate-50 transition focus-within:bg-slate-50"
                                    onClick={() => setSelectedPlayer(p)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setSelectedPlayer(p);
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Apri dati giocatore ${p.name}`}
                                >
                                    <td className={`${thPad} text-center font-black text-slate-400`}>
                                        {rankIndex(idx) < 3 ? (
                                            rankIndex(idx) === 0 ? <Trophy className="w-5 h-5 text-yellow-500 mx-auto" /> :
                                            rankIndex(idx) === 1 ? <Medal className="w-5 h-5 text-slate-400 mx-auto" /> :
                                            <Medal className="w-5 h-5 text-orange-700 mx-auto" />
                                        ) : rankIndex(idx) + 1}
                                    </td>
                                    <td className={`${thPad}`}>
                                        <div className="font-bold text-slate-900 text-base flex items-center gap-2 flex-wrap">
                                            <span>{p.name}</span>
                                            {renderPlayerAwardBadges(p)}
                                        </div>
                                        {disambiguateNameMap[normalizeName(p.name)] && getDisplayBirthIdentityLabel(p) && (
                                            <div className="text-[10px] text-slate-400 font-bold">
                                                {getDisplayBirthIdentityLabel(p)}
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
