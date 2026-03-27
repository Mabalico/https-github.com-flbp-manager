import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { Match, Team, TournamentData, HallOfFameEntry } from '../types';
import { PublicTvShell } from './PublicTvShell';
import { getPlayerKey, resolvePlayerKey } from '../services/storageService';
import { isU25, normalizeBirthDateInput } from '../services/playerIdentity';

type SortMode = 'points' | 'soffi';

const TV_PAGE_DURATION_SEC = 20;
const TV_ITEMS_PER_PAGE = 15;
const TV_MAX_PAGES = 3;
const TV_CLAMP_2_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

interface TvScorersViewProps {
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

export const TvScorersView: React.FC<TvScorersViewProps> = ({ teams, matches, data, logo, awards = [], playerAliases = {}, onExit }) => {
  const { t } = useTranslation();
  const [sortMode, setSortMode] = useState<SortMode>('points');
  const [page, setPage] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TV_PAGE_DURATION_SEC);

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

    // Seed all current roster players to keep stable ordering (even if they have 0 at start).
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

    // Aggregate from saved match stats.
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

  // Countdown + page advance + metric alternation.
  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPage((prevPage) => {
            if (prevPage < totalPages - 1) return prevPage + 1;
            setSortMode((prevMode) => (prevMode === 'points' ? 'soffi' : 'points'));
            return 0;
          });
          return TV_PAGE_DURATION_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [totalPages]);

  // Keep page within bounds when data changes.
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

  return (
    <PublicTvShell data={data} logo={logo} onExit={onExit}>
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 px-[1.05%] py-[1.05%]">
        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/10 bg-white shadow-[0_28px_80px_rgba(2,6,23,0.28)] flex flex-col">
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-slate-900 text-white border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300">{t('top_scorers_live')}</div>
              <div
                className="mt-0.5 text-[26px] font-black uppercase tracking-[0.04em] text-white leading-tight break-words"
                style={TV_CLAMP_2_STYLE}
              >
                {t('top_scorers_plural')}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
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

          <div className="grid grid-cols-12 bg-slate-950 text-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] border-b border-slate-800">
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
                        {hasTitle(p, 'mvp') && <span className="ml-2 align-middle">⭐</span>}
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
    </PublicTvShell>
  );
};
