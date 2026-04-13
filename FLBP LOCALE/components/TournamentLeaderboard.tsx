import React, { useId, useMemo, useState } from 'react';
import { Team, Match, HallOfFameEntry, PlayerStats } from '../types';
import type { AppState } from '../services/storageService';
import { useTranslation } from '../App';
import { Trophy, Medal, Search, Baby, ChevronDown, ChevronUp, ArrowDown, ArrowUpDown, Wind } from 'lucide-react';
import { isU25, getPlayerKey, resolvePlayerKey } from '../services/storageService';
import { deriveYoBFromBirthDate, pickPlayerIdentityValue } from '../services/playerIdentity';
import { PlasticCupIcon } from './icons/PlasticCupIcon';
import { isEmbeddedNativeShell } from '../services/nativeShell';
import { PublicPlayerDetail } from './PublicPlayerDetail';

type TournamentLeaderboardVariant = 'sidebar' | 'page';
type SortField = 'points' | 'soffi' | 'gamesPlayed' | 'winRate' | 'avgPoints' | 'avgSoffi';

interface TournamentLeaderboardProps {
    teams: Team[];
    matches: Match[];
    awards?: HallOfFameEntry[];
    compact?: boolean;
    variant?: TournamentLeaderboardVariant;
    playerAliases?: Record<string, string>;
    publicState?: AppState;
    onOpenTournament?: (tournamentId: string) => void;
}

const getSortValue = (player: PlayerStats, field: SortField): number => {
    if (field === 'points') return player.points;
    if (field === 'soffi') return player.soffi;
    if (field === 'gamesPlayed') return player.gamesPlayed;
    if (field === 'winRate') return player.winRate ?? 0;
    if (field === 'avgPoints') return player.avgPoints;
    return player.avgSoffi;
};

const isCompetitiveTeamId = (teamId: string | undefined, teams: Team[]): teamId is string => {
    if (!teamId) return false;
    const team = teams.find((candidate) => candidate.id === teamId);
    if (team?.isBye || team?.hidden) return false;
    const label = String(team?.name || teamId).trim().toUpperCase();
    return label !== 'BYE' && label !== 'TBD' && label !== 'SLOT LIBERO';
};

const getWinningTeamId = (match: Match, teams: Team[]): string | null => {
    if (match.isBye) return null;

    if (Array.isArray(match.teamIds) && match.teamIds.length > 0 && match.scoresByTeam) {
        const competitiveTeamIds = match.teamIds.filter((teamId) => isCompetitiveTeamId(teamId, teams));
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

    if (!isCompetitiveTeamId(match.teamAId, teams) || !isCompetitiveTeamId(match.teamBId, teams)) return null;
    if (match.scoreA === match.scoreB) return null;
    return match.scoreA > match.scoreB ? match.teamAId : match.teamBId;
};

export const TournamentLeaderboard: React.FC<TournamentLeaderboardProps> = ({
    teams,
    matches,
    awards = [],
    compact = false,
    variant = 'sidebar',
    playerAliases = {},
    publicState,
    onOpenTournament,
}) => {
    const { t } = useTranslation();
    const nativeShell = isEmbeddedNativeShell();
    const listId = useId();
    const [isExpanded, setIsExpanded] = useState(false);
    const [sortField, setSortField] = useState<SortField>('points');
    const [searchTerm, setSearchTerm] = useState('');
    const [onlyU25, setOnlyU25] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(null);
    const stickyTh = nativeShell ? '' : 'sticky top-0 z-10 bg-slate-50/95 supports-[backdrop-filter]:bg-slate-50/90 backdrop-blur';
    const pageTableScrollClass = nativeShell ? 'overflow-x-auto' : 'overflow-x-auto overscroll-x-contain sm:max-h-[68vh] sm:overflow-auto sm:overscroll-contain';

    const stats = useMemo(() => {
        const playerMap: Record<string, PlayerStats> = {};

        teams.forEach((team) => {
            [team.player1, team.player2].forEach((playerName, idx) => {
                if (!playerName) return;
                const birthDate = idx === 0 ? (team as any).player1BirthDate : (team as any).player2BirthDate;
                const yob = deriveYoBFromBirthDate(birthDate);
                const rawKey = getPlayerKey(playerName, pickPlayerIdentityValue(birthDate));
                const key = resolvePlayerKey({ playerAliases } as any, rawKey);
                playerMap[key] = {
                    id: key,
                    name: playerName,
                    teamName: team.name,
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
            });
        });

        matches.forEach((match) => {
            if (!match.stats || !(match.played || match.status === 'finished')) return;
            const winningTeamId = getWinningTeamId(match, teams);
            match.stats.forEach((stat) => {
                const team = teams.find((candidate) => candidate.id === stat.teamId);
                const birthDate = team
                    ? (team.player1 === stat.playerName ? (team as any).player1BirthDate : (team as any).player2BirthDate)
                    : undefined;
                const yob = deriveYoBFromBirthDate(birthDate);
                const rawKey = getPlayerKey(stat.playerName, pickPlayerIdentityValue(birthDate));
                const key = resolvePlayerKey({ playerAliases } as any, rawKey);

                if (!playerMap[key]) {
                    playerMap[key] = {
                        id: key,
                        name: stat.playerName,
                        teamName: team?.name || stat.teamId || '?',
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
                playerMap[key].gamesPlayed += 1;
                if (winningTeamId && isCompetitiveTeamId(stat.teamId, teams)) {
                    if (stat.teamId === winningTeamId) playerMap[key].wins = (playerMap[key].wins || 0) + 1;
                    else playerMap[key].losses = (playerMap[key].losses || 0) + 1;
                }
                playerMap[key].points += stat.canestri || 0;
                playerMap[key].soffi += stat.soffi || 0;
            });
        });

        return Object.values(playerMap)
            .filter((player) => player.points > 0 || player.soffi > 0 || player.gamesPlayed > 0)
            .map((player) => ({
                ...player,
                winRate: (player.wins || 0) + (player.losses || 0) > 0
                    ? parseFloat((((player.wins || 0) / ((player.wins || 0) + (player.losses || 0))) * 100).toFixed(1))
                    : 0,
                avgPoints: player.gamesPlayed > 0 ? parseFloat((player.points / player.gamesPlayed).toFixed(2)) : 0,
                avgSoffi: player.gamesPlayed > 0 ? parseFloat((player.soffi / player.gamesPlayed).toFixed(2)) : 0,
            }));
    }, [matches, playerAliases, teams]);

    const normalize = (name: string) => name.trim().toLowerCase();

    const filteredStats = useMemo(() => {
        return stats
            .filter((player) => !onlyU25 || isU25(player.birthDate))
            .filter((player) => player.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                const primary = getSortValue(b, sortField) - getSortValue(a, sortField);
                if (primary !== 0) return primary;
                const fallbackOrder: SortField[] = ['points', 'soffi', 'gamesPlayed', 'avgPoints', 'avgSoffi'];
                for (const field of fallbackOrder) {
                    if (field === sortField) continue;
                    const delta = getSortValue(b, field) - getSortValue(a, field);
                    if (delta !== 0) return delta;
                }
                return a.name.localeCompare(b.name);
            });
    }, [onlyU25, searchTerm, sortField, stats]);

    const displayStats = variant === 'page'
        ? filteredStats
        : (isExpanded ? filteredStats : filteredStats.slice(0, 5));

    const completedMatches = useMemo(
        () => matches.filter((match) => match.status === 'finished' || !!match.played).length,
        [matches]
    );

    const formatWinRate = (player: PlayerStats) => {
        const wins = player.wins ?? 0;
        const losses = player.losses ?? 0;
        if (wins + losses <= 0) return '—';
        return `${(player.winRate ?? 0).toFixed(1)}%`;
    };

    const getPlayerIcons = (player: PlayerStats) => {
        const normalized = normalize(player.name);
        const icons: React.ReactNode[] = [];
        const playerKey = player.id;

        const playerAwards = awards.filter((award) => {
            if (award.playerId && resolvePlayerKey({ playerAliases } as any, award.playerId) === playerKey) return true;
            return award.playerNames.some((playerName) => normalize(playerName) === normalized);
        });

        const hasTitle = (type: string) => playerAwards.some((award) => award.type === type);

        if (hasTitle('mvp')) {
            icons.push(
                <span key="mvp" title={t('tournament_mvp')} className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    ★
                </span>
            );
        }
        if (hasTitle('top_scorer')) {
            icons.push(
                <span
                    key="top_scorer"
                    title={t('top_scorer_single')}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-slate-700"
                >
                    <PlasticCupIcon className="w-3.5 h-3.5" />
                </span>
            );
        }
        if (hasTitle('defender')) {
            icons.push(
                <span
                    key="defender"
                    title={t('defender_single')}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-700"
                >
                    <Wind className="w-3.5 h-3.5" />
                </span>
            );
        }
        if (hasTitle('top_scorer_u25') && !hasTitle('top_scorer')) {
            icons.push(
                <span
                    key="top_scorer_u25"
                    title={t('tournament_top_scorer_u25')}
                    className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-black text-slate-600"
                >
                    <PlasticCupIcon className="w-3 h-3" />
                    U25
                </span>
            );
        }
        if (hasTitle('defender_u25') && !hasTitle('defender')) {
            icons.push(
                <span
                    key="defender_u25"
                    title={t('tournament_defender_u25')}
                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black text-slate-600"
                >
                    <Wind className="w-3 h-3" />
                    U25
                </span>
            );
        }
        if (isU25(player.birthDate)) {
            icons.push(
                <span
                    key="u25"
                    title="U25"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700"
                >
                    <Baby className="w-3 h-3" />
                    U25
                </span>
            );
        }

        return icons;
    };

    const getRankIcon = (index: number) => {
        if (index === 0) return <Trophy className="w-4 h-4 text-yellow-500 fill-yellow-500" />;
        if (index === 1) return <Medal className="w-4 h-4 text-slate-400" />;
        if (index === 2) return <Medal className="w-4 h-4 text-orange-700" />;
        return <span className="font-bold text-slate-400 text-xs">{index + 1}</span>;
    };

    if (variant === 'page') {
        if (selectedPlayer && publicState) {
            return (
                <PublicPlayerDetail
                    state={publicState}
                    playerId={selectedPlayer.id}
                    playerName={selectedPlayer.name}
                    playerBirthDate={selectedPlayer.birthDate}
                    fallbackStats={selectedPlayer}
                    onBack={() => setSelectedPlayer(null)}
                    onOpenTournament={onOpenTournament}
                />
            );
        }

        return (
            <div className="space-y-5">
                <div className="relative overflow-hidden rounded-[28px] bg-slate-900 px-5 py-5 text-white shadow-[0_28px_70px_-40px_rgba(15,23,42,0.9)] sm:px-6">
                    <div className="pointer-events-none absolute -right-16 -top-14 h-40 w-40 rounded-full bg-beer-400/20 blur-3xl" />
                    <div className="pointer-events-none absolute left-8 top-0 h-24 w-24 rounded-full bg-cyan-300/10 blur-3xl" />
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-2 rounded-full border border-beer-300/25 bg-beer-400/15 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-beer-100">
                                <Medal className="w-3.5 h-3.5" />
                                Classifica torneo
                            </span>
                            <h3 className="mt-3 text-2xl font-black uppercase tracking-tight sm:text-[28px]">
                                Cannonieri e soffi
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm font-medium text-white/70">
                                Statistiche della competizione corrente, con canestri, soffi e medie per partita.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold">
                                <span className="w-2 h-2 rounded-full bg-beer-400" />
                                Giocatori: {filteredStats.length}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold">
                                Match giocati: {completedMatches}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div className="relative w-full md:max-w-md">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder={t('search_placeholder')}
                                aria-label={t('search_placeholder')}
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <button
                                type="button"
                                onClick={() => setOnlyU25((value) => !value)}
                                aria-pressed={onlyU25}
                                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 sm:w-auto ${onlyU25 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                                title="U25"
                            >
                                <Baby className="h-4 w-4" />
                                U25
                            </button>
                            <div className="relative w-full sm:min-w-[220px]">
                                <ArrowUpDown className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <select
                                    value={sortField}
                                    onChange={(event) => setSortField(event.target.value as SortField)}
                                    aria-label={t('sort_tournament_leaderboard')}
                                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm font-bold text-slate-700 outline-none transition focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                >
                                    <option value="points">{t('points')}</option>
                                    <option value="soffi">{t('soffi')}</option>
                                    <option value="gamesPlayed">{t('games')}</option>
                                    <option value="avgPoints">{t('avg_points')}</option>
                                    <option value="avgSoffi">{t('avg_soffi')}</option>
                                    <option value="winRate">{t('standings_wins')} %</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="hidden">
                        {displayStats.map((player, index) => (
                            <button
                                key={player.id}
                                type="button"
                                onClick={() => {
                                    if (publicState) setSelectedPlayer(player);
                                }}
                                disabled={!publicState}
                                className={`w-full rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${publicState ? 'hover:border-beer-200 hover:shadow-md' : ''}`}
                                aria-label={publicState ? `Apri dati giocatore ${player.name}` : undefined}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white">
                                                {index < 3 ? (
                                                    index === 0 ? <Trophy className="h-4 w-4 text-yellow-400" /> :
                                                    index === 1 ? <Medal className="h-4 w-4 text-slate-300" /> :
                                                    <Medal className="h-4 w-4 text-orange-300" />
                                                ) : (
                                                    index + 1
                                                )}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="truncate text-base font-black uppercase tracking-tight text-slate-950">{player.name}</div>
                                                <div className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{player.teamName}</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1">{getPlayerIcons(player)}</div>
                                    </div>
                                    <div className="shrink-0 rounded-2xl bg-slate-50 px-3 py-2 text-right">
                                        <div className="text-[10px] font-black uppercase text-slate-500">{t('games')}</div>
                                        <div className="text-xl font-black text-slate-950">{player.gamesPlayed}</div>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-2">
                                    <div className="rounded-2xl bg-beer-50 px-3 py-2">
                                        <div className="text-[10px] font-black uppercase text-beer-700">{t('points')}</div>
                                        <div className="text-lg font-black text-slate-950">{player.points}</div>
                                    </div>
                                    <div className="rounded-2xl bg-sky-50 px-3 py-2">
                                        <div className="text-[10px] font-black uppercase text-sky-700">{t('soffi')}</div>
                                        <div className="text-lg font-black text-slate-950">{player.soffi}</div>
                                    </div>
                                    <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                                        <div className="text-[10px] font-black uppercase text-emerald-700">{t('standings_wins_short')}%</div>
                                        <div className="text-lg font-black text-slate-950">{formatWinRate(player)}</div>
                                    </div>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">{t('avg_points')}: <span className="text-slate-900">{player.avgPoints}</span></div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">{t('avg_soffi')}: <span className="text-slate-900">{player.avgSoffi}</span></div>
                                </div>
                            </button>
                        ))}
                        {displayStats.length === 0 && (
                            <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-10 text-center">
                                <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-slate-500">
                                    <Medal className="h-8 w-8 text-slate-300" />
                                    <div className="text-sm font-black text-slate-700">{t('no_players_found')}</div>
                                    <div className="text-xs font-medium text-slate-500">
                                        {t('reload_page_or_check_connection')}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={pageTableScrollClass}>
                        <table className="w-full min-w-[900px] text-left text-[13px] sm:min-w-[1020px] sm:text-sm">
                            <thead className="bg-white text-[11px] font-black uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>{t('rank')}</th>
                                    <th className={`px-4 py-3 ${stickyTh}`}>{t('players')}</th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>{t('team_view')}</th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSortField('gamesPlayed')}
                                            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'gamesPlayed' ? 'text-beer-700' : 'hover:text-beer-700'}`}
                                        >
                                            <span>{t('games')}</span>
                                            {sortField === 'gamesPlayed' ? <ArrowDown className="w-3.5 h-3.5" /> : null}
                                        </button>
                                    </th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSortField('points')}
                                            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'points' ? 'text-beer-700' : 'hover:text-beer-700'}`}
                                        >
                                            <span>{t('points')}</span>
                                            {sortField === 'points' ? <ArrowDown className="w-3.5 h-3.5" /> : null}
                                        </button>
                                    </th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSortField('soffi')}
                                            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'soffi' ? 'text-blue-700' : 'hover:text-blue-700'}`}
                                        >
                                            <span>{t('soffi')}</span>
                                            {sortField === 'soffi' ? <ArrowDown className="w-3.5 h-3.5" /> : null}
                                        </button>
                                    </th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSortField('avgPoints')}
                                            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'avgPoints' ? 'text-beer-700' : 'hover:text-beer-700'}`}
                                        >
                                            <span>{t('avg_points')}</span>
                                            {sortField === 'avgPoints' ? <ArrowDown className="w-3.5 h-3.5" /> : null}
                                        </button>
                                    </th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSortField('avgSoffi')}
                                            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'avgSoffi' ? 'text-blue-700' : 'hover:text-blue-700'}`}
                                        >
                                            <span>{t('avg_soffi')}</span>
                                            {sortField === 'avgSoffi' ? <ArrowDown className="w-3.5 h-3.5" /> : null}
                                        </button>
                                    </th>
                                    <th className={`px-4 py-3 text-center ${stickyTh}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSortField('winRate')}
                                            className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'winRate' ? 'text-emerald-700' : 'hover:text-emerald-700'}`}
                                        >
                                            <span>{t('standings_wins_short')}%</span>
                                            {sortField === 'winRate' ? <ArrowDown className="w-3.5 h-3.5" /> : null}
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                                {displayStats.map((player, index) => (
                                    <tr
                                        key={player.id}
                                        className={`${publicState ? 'cursor-pointer' : ''} transition hover:bg-slate-50 focus-within:bg-slate-50`}
                                        onClick={() => {
                                            if (publicState) setSelectedPlayer(player);
                                        }}
                                        onKeyDown={(event) => {
                                            if (!publicState) return;
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelectedPlayer(player);
                                            }
                                        }}
                                        role={publicState ? 'button' : undefined}
                                        tabIndex={publicState ? 0 : undefined}
                                        aria-label={publicState ? `Apri dati giocatore ${player.name}` : undefined}
                                    >
                                        <td className="px-4 py-3 text-center font-black text-slate-400">
                                            {index < 3 ? (
                                                index === 0 ? <Trophy className="mx-auto h-5 w-5 text-yellow-500" /> :
                                                index === 1 ? <Medal className="mx-auto h-5 w-5 text-slate-400" /> :
                                                <Medal className="mx-auto h-5 w-5 text-orange-700" />
                                            ) : (
                                                index + 1
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-black uppercase tracking-tight text-slate-900">
                                                    {player.name}
                                                </span>
                                                {getPlayerIcons(player)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                                            {player.teamName}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold">{player.gamesPlayed}</td>
                                        <td className={`px-4 py-3 text-center text-base font-black ${sortField === 'points' ? 'text-beer-600' : 'text-slate-700'}`}>
                                            {player.points}
                                        </td>
                                        <td className={`px-4 py-3 text-center text-base font-black ${sortField === 'soffi' ? 'text-blue-600' : 'text-slate-700'}`}>
                                            {player.soffi}
                                        </td>
                                        <td className={`px-4 py-3 text-center text-base font-black ${sortField === 'avgPoints' ? 'text-beer-600' : 'text-slate-700'}`}>
                                            {player.avgPoints}
                                        </td>
                                        <td className={`px-4 py-3 text-center text-base font-black ${sortField === 'avgSoffi' ? 'text-blue-600' : 'text-slate-700'}`}>
                                            {player.avgSoffi}
                                        </td>
                                        <td className={`px-4 py-3 text-center text-base font-black ${sortField === 'winRate' ? 'text-emerald-700' : 'text-slate-700'}`}>
                                            {formatWinRate(player)}
                                        </td>
                                    </tr>
                                ))}
                                {displayStats.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-10 text-center">
                                            <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-slate-500">
                                                <Medal className="h-8 w-8 text-slate-300" />
                                                <div className="text-sm font-black text-slate-700">{t('no_players_found')}</div>
                                                <div className="text-xs font-medium text-slate-500">
                                                    {t('reload_page_or_check_connection')}
                                                </div>
                                            </div>
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

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div
                className="shrink-0 border-b border-slate-100 bg-slate-50 p-3"
                onClick={() => {
                    if (compact && !isExpanded) setIsExpanded(true);
                }}
                onKeyDown={(event) => {
                    if (!(compact && !isExpanded)) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setIsExpanded(true);
                    }
                }}
                role={compact && !isExpanded ? 'button' : undefined}
                tabIndex={compact && !isExpanded ? 0 : undefined}
                aria-label={compact && !isExpanded ? t('top_scorers_plural') : undefined}
            >
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase text-slate-700">{t('top_scorers_plural')}</h3>
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                setSortField('points');
                            }}
                            aria-label={t('sort_by_points')}
                            aria-pressed={sortField === 'points'}
                            className={`rounded px-2 py-1 text-[10px] font-bold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'points' ? 'bg-beer-500 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-200'}`}
                        >
                            PT
                        </button>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                setSortField('soffi');
                            }}
                            aria-label={t('sort_by_soffi')}
                            aria-pressed={sortField === 'soffi'}
                            className={`rounded px-2 py-1 text-[10px] font-bold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${sortField === 'soffi' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-200'}`}
                        >
                            SF
                        </button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="border-b border-slate-100 bg-slate-50/50 p-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t('search_placeholder')}
                            aria-label={t('search_placeholder')}
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="w-full rounded-lg border py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-beer-500"
                        />
                    </div>
                </div>
            )}

            <div id={listId} className={`divide-y divide-slate-50 ${isExpanded ? 'flex-1 overflow-y-auto' : ''}`}>
                {displayStats.map((player, index) => (
                    <div key={player.id} className="grid grid-cols-12 items-center p-2 transition hover:bg-slate-50">
                        <div className="col-span-1 flex justify-center">{getRankIcon(index)}</div>
                        <div className="col-span-8">
                            <div className="mb-0.5 flex flex-wrap items-center gap-1 text-xs font-black uppercase leading-tight text-slate-800">
                                {player.name}
                                {getPlayerIcons(player)}
                            </div>
                        </div>
                        <div className="col-span-3 text-right">
                            <div className="flex items-baseline justify-end gap-2">
                                <div className={`text-sm font-black ${sortField === 'points' ? 'text-beer-600' : 'text-slate-700'}`}>
                                    CAN {player.points}
                                </div>
                                <div className={`text-sm font-black ${sortField === 'soffi' ? 'text-blue-600' : 'text-slate-700'}`}>
                                    SF {player.soffi}
                                </div>
                            </div>
                            <div className="text-[9px] font-bold text-slate-400">
                                CAN {player.avgPoints} • SF {player.avgSoffi} • {t('standings_wins_short')}% {formatWinRate(player)}
                            </div>
                        </div>
                    </div>
                ))}
                {displayStats.length === 0 && (
                    <div className="p-4 text-center text-xs italic text-slate-400">{t('no_players_found')}</div>
                )}
            </div>

            {!compact && (
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-expanded={isExpanded}
                    aria-controls={listId}
                    className="flex shrink-0 items-center justify-center gap-1 border-t border-slate-100 py-2.5 text-xs font-bold uppercase text-slate-500 transition hover:bg-slate-50"
                >
                    {isExpanded ? (
                        <>
                            <ChevronUp className="h-3 w-3" />
                            Nascondi
                        </>
                    ) : (
                        <>
                            <ChevronDown className="h-3 w-3" />
                            Espandi classifica ({stats.length})
                        </>
                    )}
                </button>
            )}
        </div>
    );
};
