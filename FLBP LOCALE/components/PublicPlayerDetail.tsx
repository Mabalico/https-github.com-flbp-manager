import React from 'react';
import { ArrowLeft, BadgeCheck, Star, Trophy, UserRound, Wind } from 'lucide-react';
import type { AppState } from '../services/storageService';
import type { Match, PlayerProfileSnapshot, PlayerStats, PlayerTitleSourceRow, TournamentData } from '../types';
import { getPlayerKey, resolvePlayerKey } from '../services/storageService';
import { pickPlayerIdentityValue } from '../services/playerIdentity';
import { buildPlayerProfileSnapshot, buildPlayerProfileSnapshots } from '../services/playerDataProvenance';
import { getMatchParticipantIds, getMatchScoreForTeam } from '../services/matchUtils';
import { useTranslation } from '../App';
import { PlasticCupIcon } from './icons/PlasticCupIcon';

type PublicPlayerDetailProps = {
  state: AppState;
  playerId?: string | null;
  playerName?: string | null;
  playerBirthDate?: string | null;
  fallbackStats?: Partial<PlayerStats> | null;
  onBack: () => void;
  onOpenTournament?: (tournamentId: string) => void;
};

type PublicParticipationRow = {
  id: string;
  openTournamentId: string | null;
  name: string;
  year: string;
  team: string;
  games: number;
  points: number;
  soffi: number;
  titles: number;
};

const metricCardClass = 'group relative overflow-hidden rounded-[24px] border border-white/60 bg-white/70 px-5 py-4 shadow-sm shadow-slate-200/50 ring-1 ring-inset ring-slate-100/50 transition-all duration-300 hover:-translate-y-1 hover:bg-white/95 hover:shadow-xl';
const sectionCardClass = 'rounded-[26px] border border-white/60 bg-white/80 p-4 shadow-sm ring-1 ring-inset ring-slate-100 md:p-5';
const sectionTitleClass = 'text-lg font-black text-slate-950';

const oneDecimalFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const cleanDisplayValue = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^[.·\-]+$/u.test(trimmed)) return null;
  return trimmed;
};

const cleanTeamLabel = (value?: string | null) => {
  const normalized = cleanDisplayValue(value);
  if (!normalized) return null;
  if (/^(squadra|team)$/i.test(normalized)) return null;
  return normalized;
};

const formatMetaLine = (...parts: Array<string | null | undefined>) => {
  const values = parts.map(cleanDisplayValue).filter(Boolean) as string[];
  return values.length ? values.join(' · ') : null;
};

const getTournamentMatches = (tournament: TournamentData | null | undefined): Match[] => {
  if (!tournament) return [];
  if (Array.isArray(tournament.matches) && tournament.matches.length) return tournament.matches;
  if (Array.isArray(tournament.rounds) && tournament.rounds.length) return tournament.rounds.flat().filter(Boolean);
  return [];
};

const normalizeName = (value?: string | null) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const getTitleVisual = (
  type: PlayerTitleSourceRow['type'],
  t: (key: string) => string
) => {
  switch (type) {
    case 'winner':
      return {
        label: t('winner'),
        Icon: Trophy,
        chipClass: 'bg-amber-50 text-amber-800 ring-amber-200/80',
        iconClass: 'text-amber-500',
      };
    case 'mvp':
      return {
        label: t('mvp_plural'),
        Icon: Star,
        chipClass: 'bg-orange-50 text-orange-800 ring-orange-200/80',
        iconClass: 'text-orange-500',
      };
    case 'top_scorer':
      return {
        label: t('top_scorer_single'),
        Icon: PlasticCupIcon,
        chipClass: 'bg-yellow-50 text-yellow-900 ring-yellow-200/80',
        iconClass: 'text-yellow-600',
      };
    case 'defender':
      return {
        label: t('defender_single'),
        Icon: Wind,
        chipClass: 'bg-sky-50 text-sky-900 ring-sky-200/80',
        iconClass: 'text-sky-600',
      };
    case 'top_scorer_u25':
      return {
        label: t('top_scorer_u25_single'),
        Icon: PlasticCupIcon,
        chipClass: 'bg-yellow-50 text-yellow-900 ring-yellow-200/80',
        iconClass: 'text-yellow-600',
      };
    case 'defender_u25':
    default:
      return {
        label: t('defender_u25_single'),
        Icon: UserRound,
        chipClass: 'bg-indigo-50 text-indigo-900 ring-indigo-200/80',
        iconClass: 'text-indigo-500',
      };
  }
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className={metricCardClass}>
    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-100/50 blur-3xl transition-transform duration-500 group-hover:scale-150" />
    <div className="relative z-10 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
    <div className="relative z-10 mt-1 text-2xl font-black tracking-tight text-slate-900">{value}</div>
    {hint ? <div className="relative z-10 mt-1 text-xs font-bold text-slate-500">{hint}</div> : null}
  </div>
);

const buildFallbackProfile = (
  playerId: string,
  playerName: string,
  fallbackStats?: Partial<PlayerStats> | null
): PlayerProfileSnapshot => ({
  playerId,
  displayName: playerName || fallbackStats?.name || playerId,
  yobLabel: 'ND',
  aliasCount: 0,
  totalTitles: 0,
  totalCanestri: fallbackStats?.points || 0,
  totalSoffi: fallbackStats?.soffi || 0,
  hasArchivedData: false,
  hasManualData: false,
  badges: [],
  titles: [],
  contributions: fallbackStats?.gamesPlayed
    ? [{
        id: `fallback:${playerId}`,
        playerId,
        playerName: playerName || fallbackStats?.name || playerId,
        sourceType: 'manual_integration',
        tournamentId: null,
        tournamentName: null,
        tournamentYear: null,
        matchId: null,
        teamId: null,
        teamName: fallbackStats?.teamName || null,
        canestri: fallbackStats?.points || 0,
        soffi: fallbackStats?.soffi || 0,
        games: fallbackStats?.gamesPlayed || 0,
        sourceLabel: null,
        manuallyAdded: false,
      }]
    : [],
  aliases: [],
});

const selectPublicProfile = (
  state: AppState,
  playerId?: string | null,
  playerName?: string | null,
  playerBirthDate?: string | null,
  fallbackStats?: Partial<PlayerStats> | null
): PlayerProfileSnapshot => {
  const candidateIds = new Set<string>();
  const pushId = (value?: string | null) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    candidateIds.add(resolvePlayerKey(state, trimmed));
  };

  pushId(playerId);
  pushId(fallbackStats?.id);

  const name = String(playerName || fallbackStats?.name || '').trim();
  if (name) {
    pushId(getPlayerKey(name, pickPlayerIdentityValue(playerBirthDate || fallbackStats?.birthDate)));
    pushId(getPlayerKey(name, 'ND'));
    pushId(getPlayerKey(name));
  }

  for (const id of candidateIds) {
    const direct = buildPlayerProfileSnapshot(state, id);
    if (direct) return direct;
  }

  const profiles = buildPlayerProfileSnapshots(state);
  const normalizedName = normalizeName(name);
  const byName = normalizedName
    ? profiles.filter((profile) => normalizeName(profile.displayName) === normalizedName)
    : [];
  if (byName.length === 1) return byName[0];

  const fallbackId = Array.from(candidateIds)[0] || getPlayerKey(name || 'giocatore', 'ND');
  return buildFallbackProfile(fallbackId, name || fallbackId, fallbackStats);
};

const buildPlayerPerformanceSummary = (state: AppState, profile: PlayerProfileSnapshot) => {
  const totalGames = profile.contributions.reduce((sum, row) => sum + Math.max(0, row.games || 0), 0);
  const avgPoints = totalGames > 0 ? profile.totalCanestri / totalGames : 0;
  const avgSoffi = totalGames > 0 ? profile.totalSoffi / totalGames : 0;

  const tournamentMap = new Map(
    [
      ...(state.tournamentHistory || []),
      ...(state.tournament ? [state.tournament] : []),
    ].map((tournament) => [tournament.id, tournament])
  );

  let wins = 0;
  let losses = 0;
  const seenMatches = new Set<string>();

  profile.contributions.forEach((row) => {
    const tournamentId = String(row.tournamentId || '').trim();
    const matchId = String(row.matchId || '').trim();
    const teamId = String(row.teamId || '').trim();
    if (!tournamentId || !matchId || !teamId) return;

    const dedupeKey = `${tournamentId}:${matchId}:${teamId}`;
    if (seenMatches.has(dedupeKey)) return;

    const tournament = tournamentMap.get(tournamentId);
    const match = getTournamentMatches(tournament).find((item) => item.id === matchId);
    if (!match || !(match.status === 'finished' || match.played)) return;

    const participantIds = getMatchParticipantIds(match);
    if (!participantIds.includes(teamId)) return;

    const teamScore = getMatchScoreForTeam(match, teamId);
    const opponentScores = participantIds
      .filter((id) => id !== teamId)
      .map((id) => getMatchScoreForTeam(match, id));
    if (!opponentScores.length) return;

    const bestOpponentScore = Math.max(...opponentScores);
    if (teamScore > bestOpponentScore) wins += 1;
    else if (teamScore < bestOpponentScore) losses += 1;

    seenMatches.add(dedupeKey);
  });

  const decidedGames = wins + losses;
  return {
    totalGames,
    avgPoints,
    avgSoffi,
    wins,
    losses,
    winRate: decidedGames > 0 ? (wins / decidedGames) * 100 : null,
  };
};

const buildParticipationRows = (profile: PlayerProfileSnapshot, t: (key: string) => string): PublicParticipationRow[] => {
  const rows = new Map<string, PublicParticipationRow>();

  const ensureRow = (input: {
    id?: string | null;
    openTournamentId?: string | null;
    name?: string | null;
    year?: string | null;
    team?: string | null;
  }) => {
    const id = cleanDisplayValue(input.id) || cleanDisplayValue(input.name) || 'manual';
    const existing = rows.get(id);
    const next = existing || {
      id,
      openTournamentId: cleanDisplayValue(input.openTournamentId) || null,
      name: cleanDisplayValue(input.name) || id,
      year: cleanDisplayValue(input.year) || '',
      team: cleanTeamLabel(input.team) || '',
      games: 0,
      points: 0,
      soffi: 0,
      titles: 0,
    };
    next.name = next.name || cleanDisplayValue(input.name) || id;
    next.openTournamentId = next.openTournamentId || cleanDisplayValue(input.openTournamentId) || null;
    next.year = next.year || cleanDisplayValue(input.year) || '';
    next.team = next.team || cleanTeamLabel(input.team) || '';
    rows.set(id, next);
    return next;
  };

  profile.contributions.forEach((row) => {
    const tournamentId = cleanDisplayValue(row.tournamentId);

    const item = ensureRow({
      id: tournamentId || 'integrated-history',
      openTournamentId: tournamentId,
      name: row.tournamentName || (tournamentId ? null : t('player_area_integrated_history')),
      year: row.tournamentYear || null,
      team: row.teamName || null,
    });
    item.games += Math.max(0, row.games || 0);
    item.points += row.canestri || 0;
    item.soffi += row.soffi || 0;
  });

  profile.titles.forEach((row) => {
    const tournamentId = cleanDisplayValue(row.tournamentId || row.sourceTournamentId);
    const item = ensureRow({
      id: tournamentId || row.entryId,
      openTournamentId: tournamentId,
      name: row.tournamentName || row.sourceTournamentName || null,
      year: row.year || null,
      team: row.teamName || null,
    });
    item.titles += 1;
  });

  return Array.from(rows.values()).sort((a, b) => {
    const byYear = Number(b.year || 0) - Number(a.year || 0);
    if (byYear !== 0) return byYear;
    return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
  });
};

export const PublicPlayerDetail: React.FC<PublicPlayerDetailProps> = ({
  state,
  playerId,
  playerName,
  playerBirthDate,
  fallbackStats,
  onBack,
  onOpenTournament,
}) => {
  const { t } = useTranslation();
  const profile = React.useMemo(
    () => selectPublicProfile(state, playerId, playerName, playerBirthDate, fallbackStats),
    [fallbackStats, playerBirthDate, playerId, playerName, state]
  );
  const performance = React.useMemo(() => buildPlayerPerformanceSummary(state, profile), [profile, state]);
  const participations = React.useMemo(() => buildParticipationRows(profile, t), [profile, t]);
  const identityLabel = (() => {
    const raw = String(profile.yobLabel || '').trim();
    if (!raw || raw === 'ND') return null;
    const yearMatch = raw.match(/(\d{4})$/);
    return yearMatch?.[1] || null;
  })();

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="relative overflow-hidden rounded-[30px] border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white/95 p-5 shadow-sm shadow-blue-100/50 ring-1 ring-inset ring-white md:p-7">
        <div className="absolute -right-4 -top-8 h-40 w-40 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-blue-700 shadow-sm ring-1 ring-inset ring-blue-100">
              <UserRound className="h-3.5 w-3.5" />
              {t('player_public_detail_title')}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-blue-950 md:text-4xl">
              {profile.displayName}
            </h1>
            {identityLabel ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200/60">
                {identityLabel}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl bg-white/85 px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-white hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label={t('games')} value={performance.totalGames} />
        <MetricCard label={t('scores_label')} value={profile.totalCanestri} />
        <MetricCard label={t('soffi_label')} value={profile.totalSoffi} />
        <MetricCard label={t('player_area_avg_scores')} value={oneDecimalFormatter.format(performance.avgPoints)} />
        <MetricCard label={t('player_area_avg_soffi')} value={oneDecimalFormatter.format(performance.avgSoffi)} />
        <MetricCard
          label={t('player_area_win_rate')}
          value={performance.winRate != null ? `${oneDecimalFormatter.format(performance.winRate)}%` : t('not_available_short')}
          hint={`${performance.wins}${t('standings_wins_short')} · ${performance.losses}${t('standings_losses_short')}`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className={`${sectionCardClass} space-y-4`}>
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-5 w-5 text-sky-500" />
            <div className={sectionTitleClass}>{t('player_area_tournaments_played')}</div>
          </div>

          {participations.length > 0 ? (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {participations.map((row) => {
                const subtitle = formatMetaLine(row.year, row.team);
                const stats = formatMetaLine(
                  row.games ? `${row.games} ${t('games').toLowerCase()}` : null,
                  row.points ? `${row.points} ${t('points').toLowerCase()}` : null,
                  row.soffi ? `${row.soffi} ${t('soffi').toLowerCase()}` : null
                );
                const body = (
                  <>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 transition-colors group-hover:text-sky-900">{row.name}</div>
                      {subtitle ? <div className="mt-1 text-xs font-bold text-slate-500">{subtitle}</div> : null}
                      {stats ? <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{stats}</div> : null}
                    </div>
                    {row.titles > 0 ? (
                      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800 ring-1 ring-inset ring-amber-200">
                        <Trophy className="h-3.5 w-3.5" />
                        {row.titles}
                      </div>
                    ) : null}
                  </>
                );

                return onOpenTournament && row.openTournamentId ? (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onOpenTournament(row.openTournamentId!)}
                    className="group flex w-full items-start justify-between gap-3 overflow-hidden rounded-[20px] border border-slate-100 bg-white/80 px-4 py-3 text-left shadow-sm transition-all hover:border-sky-100 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
                  >
                    {body}
                  </button>
                ) : (
                  <div key={row.id} className="group flex items-start justify-between gap-3 overflow-hidden rounded-[20px] border border-slate-100 bg-white/80 px-4 py-3 shadow-sm">
                    {body}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-center text-sm font-bold text-slate-500">
              {t('player_area_no_tournaments')}
            </div>
          )}
        </div>

        <div className={`${sectionCardClass} space-y-4`}>
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <div className={sectionTitleClass}>{t('titles')}</div>
          </div>

          {profile.titles.length > 0 ? (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {profile.titles.map((row) => {
                const titleVisual = getTitleVisual(row.type, t);
                const subtitle = formatMetaLine(row.year, cleanTeamLabel(row.teamName));
                const tournamentName = cleanDisplayValue(row.tournamentName || row.sourceTournamentName) || t('player_area_unknown_tournament');
                return (
                  <div key={row.id} className="group relative overflow-hidden rounded-[20px] border border-slate-100 bg-gradient-to-r from-amber-50/50 to-white/50 px-4 py-3 shadow-sm transition-all hover:border-amber-100 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 transition-colors group-hover:text-amber-900">{tournamentName}</div>
                        {subtitle ? <div className="mt-1 text-xs font-bold text-slate-500">{subtitle}</div> : null}
                      </div>
                      <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black shadow-sm ring-1 ring-inset ${titleVisual.chipClass}`}>
                        <titleVisual.Icon className={`h-3.5 w-3.5 ${titleVisual.iconClass}`} />
                        <span>{titleVisual.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-center text-sm font-bold text-slate-500">
              {t('player_area_no_results')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
