import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { Match, Team, TournamentData, HallOfFameEntry } from '../types';
import { PublicTvShell } from './PublicTvShell';
import { TvClassicBracket } from './TvClassicBracket';
import { getPlayerKey, resolvePlayerKey } from '../services/storageService';
import { isU25, normalizeBirthDateInput } from '../services/playerIdentity';
import { Star } from 'lucide-react';
import { getPreferredBracketRounds } from '../services/tournamentStructureSelectors';

type SortMode = 'points' | 'soffi';
type ActiveScreen = 'bracket' | 'scorers';

const BRACKET_DURATION_SEC = 15;
const SCORERS_DURATION_SEC = 15;
const TV_ITEMS_PER_PAGE = 15;
const TV_MAX_PAGES = 3;
const TV_CLAMP_2_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

interface TvBracketScorersViewProps {
  teams: Team[];
  matches: Match[];
  data: TournamentData | null;
  logo: string;
  awards?: HallOfFameEntry[];
  playerAliases?: Record<string, string>;
  onExit: () => void;
}

type ScorerRow = {
  id: string;
  name: string;
  teamName: string;
  birthDate?: string;
  points: number;
  soffi: number;
  matchesPlayed: number;
};

export const TvBracketScorersView: React.FC<TvBracketScorersViewProps> = ({
  teams,
  matches,
  data,
  logo,
  awards = [],
  playerAliases = {},
  onExit,
}) => {
  const { t } = useTranslation();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('bracket');
  const [sortMode, setSortMode] = useState<SortMode>('points');
  const [page, setPage] = useState(0);
  const [timeLeft, setTimeLeft] = useState(BRACKET_DURATION_SEC);

  // Scorers extraction logic
  const rows = useMemo<ScorerRow[]>(() => {
    const map: Record<string, ScorerRow> = {};

    const birthDateFromKey = (key: string): string | undefined => {
      const m = (key || '').match(/_(ND|\d{4}-\d{2}-\d{2})$/i);
      if (!m) return undefined;
      return normalizeBirthDateInput(m[1]);
    };

    const getTeamBirthDate = (team: Team | undefined, playerName: string): string | undefined => {
      if (!team) return undefined;
      if (team.player1 === playerName) return normalizeBirthDateInput((team as any).player1BirthDate);
      if (team.player2 === playerName) return normalizeBirthDateInput((team as any).player2BirthDate);
      return undefined;
    };

    teams.forEach((t) => {
      const p1BirthDate = normalizeBirthDateInput((t as any).player1BirthDate);
      const p1Raw = getPlayerKey(t.player1, p1BirthDate || 'ND');
      const p1Key = resolvePlayerKey({ playerAliases } as any, p1Raw);
      map[p1Key] = {
        id: p1Key,
        name: t.player1,
        teamName: t.name,
        birthDate: p1BirthDate ?? birthDateFromKey(p1Key),
        points: 0,
        soffi: 0,
        matchesPlayed: 0,
      };
      if (t.player2) {
        const p2BirthDate = normalizeBirthDateInput((t as any).player2BirthDate);
        const p2Raw = getPlayerKey(t.player2, p2BirthDate || 'ND');
        const p2Key = resolvePlayerKey({ playerAliases } as any, p2Raw);
        map[p2Key] = {
          id: p2Key,
          name: t.player2,
          teamName: t.name,
          birthDate: p2BirthDate ?? birthDateFromKey(p2Key),
          points: 0,
          soffi: 0,
          matchesPlayed: 0,
        };
      }
    });

    matches.forEach((m) => {
      if (!m.stats) return;
      m.stats.forEach((s) => {
        const team = teams.find((t) => t.id === s.teamId);
        const birthDate = getTeamBirthDate(team, s.playerName);
        const rawKey = getPlayerKey(s.playerName, birthDate || 'ND');
        const key = resolvePlayerKey({ playerAliases } as any, rawKey);

        if (!map[key]) {
          map[key] = {
            id: key,
            name: s.playerName,
            teamName: team?.name || s.teamId || '?',
            birthDate: birthDate ?? birthDateFromKey(key),
            points: 0,
            soffi: 0,
            matchesPlayed: 0,
          };
        }

        map[key].points += s.canestri || 0;
        map[key].soffi += s.soffi || 0;
        map[key].matchesPlayed += 1;
      });
    });

    return Object.values(map).filter((r) => (r.points > 0 || r.soffi > 0) && r.matchesPlayed > 0);
  }, [teams, matches, playerAliases]);

  const sorted = useMemo(() => {
    const byMetric = [...rows].sort((a, b) => {
      if (sortMode === 'points') return (b.points - a.points) || (b.soffi - a.soffi);
      return (b.soffi - a.soffi) || (b.points - a.points);
    });
    const filtered = byMetric.filter((r) => (sortMode === 'points' ? r.points > 0 : r.soffi > 0));
    return filtered.slice(0, TV_ITEMS_PER_PAGE * TV_MAX_PAGES);
  }, [rows, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / TV_ITEMS_PER_PAGE));
  const startIndex = page * TV_ITEMS_PER_PAGE;
  const visible = sorted.slice(startIndex, startIndex + TV_ITEMS_PER_PAGE);

  // Consecutive Loop Timer
  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (activeScreen === 'bracket') {
            // Switch to scorers screen
            setActiveScreen('scorers');
            setSortMode('points');
            setPage(0);
            return SCORERS_DURATION_SEC;
          } else {
            // activeScreen === 'scorers'
            let nextPage = page + 1;
            if (nextPage < totalPages) {
              setPage(nextPage);
              return SCORERS_DURATION_SEC;
            } else {
              if (sortMode === 'points') {
                setSortMode('soffi');
                setPage(0);
                return SCORERS_DURATION_SEC;
              } else {
                setActiveScreen('bracket');
                return BRACKET_DURATION_SEC;
              }
            }
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeScreen, page, totalPages, sortMode]);

  // Keep page within bounds when data changes
  useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [page, totalPages]);

  const normalize = (s: string) => (s || '').trim().toLowerCase();
  const hasTitle = (p: ScorerRow, type: HallOfFameEntry['type']) => {
    const pid = p.id;
    const pn = normalize(p.name);
    return awards.some((a) => {
      if (a.type !== type) return false;
      if (a.playerId) return resolvePlayerKey({ playerAliases } as any, a.playerId) === pid;
      return (a.playerNames || []).some((n) => normalize(n) === pn);
    });
  };

  const metricLabel = sortMode === 'points' ? t('canestri_tv') : t('soffi_tv');

  // Bracket metadata and checks
  const isByeTeam = React.useCallback((t: Team) => {
    const anyT = t as any;
    if (anyT?.hidden === true) return true;
    if (anyT?.isBye === true) return true;
    if (t.id === 'BYE') return true;
    if (String(t.name || '').toUpperCase() === 'BYE') return true;
    return false;
  }, []);

  const visibleTeams = React.useCallback((teamsList: Team[]) => {
    return (teamsList || []).filter((t) => !isByeTeam(t));
  }, [isByeTeam]);

  const visibleBracketTeamsCount = React.useMemo(() => visibleTeams(teams).length, [teams, visibleTeams]);
  const preferredBracketRounds = React.useMemo(() => getPreferredBracketRounds(data, matches), [data, matches]);

  const bracketRoundCount = React.useMemo(() => {
    return preferredBracketRounds.length;
  }, [preferredBracketRounds]);

  const hasBracketContent = React.useMemo(() => {
    if (preferredBracketRounds.length > 0) return true;
    return (matches || []).some((m) => m.phase === 'bracket' && !m.hidden && !m.isBye);
  }, [matches, preferredBracketRounds.length]);

  return (
    <PublicTvShell data={data} logo={logo} onExit={onExit} variant="minimal">
      {activeScreen === 'bracket' ? (
        <div className="relative h-full w-full overflow-hidden bg-black">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,64,175,0.08),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.42)_10%,rgba(2,6,23,0.7)_100%)]" aria-hidden="true" />
          <img
            src="/tv-bracket-logo-2025.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-auto w-[28%] min-w-[220px] max-w-[420px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.18] drop-shadow-[0_0_24px_rgba(255,253,230,0.08)]"
          />

          <div className="pointer-events-none absolute inset-x-[1.4%] top-[1.25%] z-20 flex items-start justify-between gap-4 text-white">
            <div className="min-w-0 text-[clamp(18px,1.7vw,30px)] font-black uppercase tracking-tight leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
              {data?.name || t('tournament_name')}
            </div>
            <div className="shrink-0 flex items-center gap-4 text-[clamp(10px,0.82vw,15px)] font-black uppercase tracking-[0.14em] text-slate-100/92 drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
              <span>{t('teams')} {visibleBracketTeamsCount}</span>
              <span>{t('turns_label')} {bracketRoundCount}</span>
              <span className="bg-blue-600/30 px-2 py-0.5 rounded border border-blue-400/20">{t('admin_tv_bracket')}</span>
              <span className="font-mono font-black">{timeLeft}s</span>
            </div>
          </div>

          <div className="absolute inset-x-[0.2%] inset-y-[0.35%] top-[4.9%] min-h-0 min-w-0">
            {hasBracketContent ? (
              <TvClassicBracket
                teams={teams}
                data={data}
                matches={matches}
                compact={false}
                minimalChrome={true}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-white/10 bg-slate-950/60 text-slate-400 font-black uppercase tracking-[0.22em] text-sm">
                {t('bracket_no_bracket_available')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 px-[1.05%] py-[1.05%] h-full w-full">
          <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/10 bg-white shadow-[0_28px_80px_rgba(2,6,23,0.28)] flex flex-col">
            <div className="flex items-center justify-between gap-4 px-5 py-3 bg-slate-900 text-white border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300">
                  {t('top_scorers_live')}
                </div>
                <div
                  className="mt-0.5 text-[26px] font-black uppercase tracking-[0.04em] text-white leading-tight break-words"
                  style={TV_CLAMP_2_STYLE}
                >
                  {t('top_scorers_plural')}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-orange-600/30 px-2 py-0.5 rounded border border-orange-400/20 text-orange-200 text-xs font-black uppercase tracking-wider">
                  {t('admin_tv_scorers')}
                </div>
                <div className={`rounded-full border px-3 py-1 text-[12px] font-black uppercase tracking-[0.14em] ${sortMode === 'points' ? 'border-orange-400/35 bg-orange-500/12 text-orange-200' : 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200'}`}>
                  {metricLabel}
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-[12px] font-mono font-black text-slate-300">
                  {Math.min(page + 1, totalPages)}/{totalPages}
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-[12px] font-mono font-black text-slate-300">
                  {timeLeft}s
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 bg-slate-950 text-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] border-b border-slate-800 shrink-0">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-4">{t('player_view')}</div>
              <div className="col-span-4">{t('team_view')}</div>
              <div className="col-span-1 text-center">{t('games')}</div>
              <div className="col-span-2 text-right">{sortMode === 'points' ? t('canestri_tv') : t('soffi_tv')}</div>
            </div>

            <div className="flex-1 min-h-0 bg-slate-50 flex flex-col">
              {visible.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-black">{t('no_data_available')}</div>
              ) : (
                visible.map((p, idx) => {
                  const rank = startIndex + idx + 1;
                  return (
                    <div
                      key={p.id}
                      className={`grid grid-cols-12 px-4 items-center border-b border-slate-200 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100/90'}`}
                      style={{ height: `calc(100% / ${TV_ITEMS_PER_PAGE})` }}
                    >
                      <div className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-black text-[14px]">{rank}</span>
                      </div>
                      <div className="col-span-4 pr-3 min-w-0">
                        <div
                          className="text-slate-900 font-black text-[15px] leading-tight break-words"
                          style={TV_CLAMP_2_STYLE}
                        >
                          {p.name}
                          {isU25(p.birthDate) && <span className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black">U25</span>}
                          {hasTitle(p, 'mvp') && <Star className="ml-2 inline h-4 w-4 align-middle text-amber-500" aria-hidden />}
                        </div>
                      </div>
                      <div
                        className="col-span-4 pr-3 min-w-0 text-slate-600 uppercase text-[12px] font-bold leading-tight break-words"
                        style={TV_CLAMP_2_STYLE}
                      >
                        {p.teamName}
                      </div>
                      <div className="col-span-1 text-center text-slate-700 font-mono font-black text-[13px]">{p.matchesPlayed}</div>
                      <div className={`col-span-2 text-right text-[16px] font-black font-mono ${sortMode === 'points' ? 'text-orange-600' : 'text-cyan-600'}`}>
                        {sortMode === 'points' ? p.points : p.soffi}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </PublicTvShell>
  );
};
