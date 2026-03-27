import React, { useState, useEffect } from 'react';
import { Team, TournamentData, Match, HallOfFameEntry } from '../types';
import { useTranslation } from '../App';
import { TournamentBracket } from './TournamentBracket';
import { TournamentLeaderboard } from './TournamentLeaderboard';
import { computeGroupStandings } from '../services/groupStandings';
import { GroupStandingsTable } from './GroupStandingsTable';
import { getMatchParticipantIds, formatMatchScoreLabel, formatMatchTeamsLabel, isByeTeamId } from '../services/matchUtils';
import { Trophy, LayoutList, Clock, Medal, X, GitBranch, Star, Wind, UserRound, Users, CalendarDays, Archive, ArrowLeft } from 'lucide-react';
import { PlasticCupIcon } from './icons/PlasticCupIcon';
import { PublicBrandStack } from './PublicBrandStack';

interface PublicTournamentDetailProps {
  initialData: TournamentData;
  initialMatches: Match[];
  teams: Team[];
  isLive: boolean;
  onBack: () => void;
  logo: string;
  hallOfFame: HallOfFameEntry[];
  playerAliases?: Record<string, string>;
}

export const PublicTournamentDetail: React.FC<PublicTournamentDetailProps> = ({
  initialData,
  initialMatches,
  teams,
  isLive,
  onBack,
  logo,
  hallOfFame,
  playerAliases = {},
}) => {
  const { t } = useTranslation();

  const btnBaseDark = "inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none";
  const btnGhostDark = `${btnBaseDark} text-white bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 text-xs`;
  const btnPrimaryDark = `${btnBaseDark} bg-beer-500 text-slate-900 shadow-lg hover:bg-beer-600 px-5 py-3`;

  const badgeBaseDark = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide";
  const badgeLiveDark = `${badgeBaseDark} bg-beer-500 text-slate-900`;
  const badgeArchiveDark = `${badgeBaseDark} bg-white/10 text-white/80 border border-white/10`;
  const badgeTopLight = "inline-flex items-center rounded-full px-3 py-1 text-xs font-black bg-beer-50 text-beer-700 border border-beer-100";
  const [data, setData] = useState<TournamentData>(initialData);
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [view, setView] = useState<'groups' | 'bracket' | 'leaderboard' | 'overview'>('groups');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [showAwards, setShowAwards] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const [turnsOpen, setTurnsOpen] = useState(false);
  const [turnsTab, setTurnsTab] = useState<'all' | 'live' | 'next' | 'played' | 'tbd'>('all');
  const [turnsPinExpanded, setTurnsPinExpanded] = useState(false);

  const turnsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const turnsCurrentTurnRef = React.useRef<HTMLDivElement | null>(null);

  const teamNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) map.set(t.id, t.name);
    return map;
  }, [teams]);

  const getTeamName = (id?: string) => {
    if (!id) return 'TBD';
    return teamNameById.get(id) || 'TBD';
  };

  const tournamentAwards = hallOfFame.filter((h) => h.tournamentId === data.id);

  const openTurns = () => {
    if (!isLive) return;
    setShowAwards(false);
    setSelectedMatch(null);
    setTurnsOpen(true);
    setTurnsTab('all');
    setTurnsPinExpanded(false);
  };

  const closeTurns = () => setTurnsOpen(false);

  useEffect(() => {
    if (!turnsOpen) return;
    setTurnsPinExpanded(false);
  }, [turnsOpen, turnsTab]);

  const turnsLiveBadgeCount = React.useMemo(() => {
    const isByeOrHiddenPublic = (m: Match) => {
      if ((m as any).hidden || (m as any).isBye || m.isBye) return true;
      const ids = getMatchParticipantIds(m);
      return ids.some((id) => isByeTeamId(id) || String(id || '').trim().toUpperCase() === 'BYE');
    };

    return (matches || [])
      .filter((m) => !isByeOrHiddenPublic(m))
      .filter((m) => m.status === 'playing')
      .length;
  }, [matches]);

  useEffect(() => {
    if (!turnsOpen) return;
    if (turnsTab === 'played' || turnsTab === 'tbd') return;

    const scrollEl = turnsScrollRef.current;
    const target = turnsCurrentTurnRef.current;

    const t = window.setTimeout(() => {
      if (target) {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        try {
          (target as any).focus?.({ preventScroll: true });
        } catch {
          // ignore
        }
      } else if (scrollEl) {
        scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [turnsOpen, turnsTab]);

  const renderTurnsModal = () => {
    if (!turnsOpen) return null;

    // Reset the anchor so we don't reuse a stale element when switching tabs.
    turnsCurrentTurnRef.current = null;

    const rawCfgTables = (data.config as any)?.refTables;
    const cfgTables = typeof rawCfgTables === 'number' && Number.isFinite(rawCfgTables)
      ? rawCfgTables
      : parseInt(String(rawCfgTables || ''), 10);

    let nTables = Number.isFinite(cfgTables) && cfgTables > 0 ? Math.floor(cfgTables) : 0;
    if (!nTables) {
      try {
        const raw = localStorage.getItem('flbp_ref_tables');
        const n = raw ? parseInt(raw, 10) : 0;
        if (Number.isFinite(n) && n > 0) nTables = Math.floor(n);
      } catch {
        // ignore
      }
    }
    if (!nTables) nTables = 8;

    const isPlaceholderId = (id?: string) => {
      const up = String(id || '').trim().toUpperCase();
      return !up || up === 'BYE' || up === 'TBD' || up.startsWith('TBD-');
    };

    const isByeOrHidden = (m: Match) => {
      if ((m as any).hidden || (m as any).isBye || m.isBye) return true;
      const ids = getMatchParticipantIds(m);
      return ids.some((id) => isByeTeamId(id) || String(id || '').trim().toUpperCase() === 'BYE');
    };

    const hasValidParticipants = (m: Match) => {
      const ids = getMatchParticipantIds(m);
      if (ids.length < 2) return false;
      return ids.every((id) => !isPlaceholderId(id));
    };

    const msAll = (matches || [])
      .filter((m) => !isByeOrHidden(m))
      .slice()
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const isDoneMatch = (m: Match) => (m.status === 'finished') || !!(m as any).played;

    const msPlayed = msAll.filter((m) => isDoneMatch(m));
    const msUpcomingRaw = msAll.filter((m) => !isDoneMatch(m));

    // Align numbering to Admin → Arbitri:
    // - only matches not finished
    // - exclude BYE/TBD placeholders from turns
    const msAdmin = msUpcomingRaw
      .filter((m) => m.status !== 'finished')
      .filter((m) => hasValidParticipants(m));

    // Upcoming matches not eligible for a referee turn yet (TBD placeholders etc.).
    const msTbd = msUpcomingRaw.filter((m) => !hasValidParticipants(m));

    const blocksAdmin: Match[][] = [];
    for (let i = 0; i < msAdmin.length; i += nTables) blocksAdmin.push(msAdmin.slice(i, i + nTables));

    const blocksPlayed: Match[][] = [];
    for (let i = 0; i < msPlayed.length; i += nTables) blocksPlayed.push(msPlayed.slice(i, i + nTables));

    const playingIdxs = msAdmin
      .map((m, i) => (m.status === 'playing' ? i : -1))
      .filter((i) => i >= 0) as number[];

    const currentBlockIdx = playingIdxs.length ? Math.floor(Math.min(...playingIdxs) / nTables) : 0;

    const adminBlockTone = (idx: number) => {
      const b = blocksAdmin[idx] || [];
      const anyPlaying = b.some((m) => m.status === 'playing');
      if (anyPlaying) return { label: t('live_state_label'), cls: 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' };
      return { label: idx === currentBlockIdx ? t('next_state_label') : t('future_state_label'), cls: 'bg-beer-500/20 text-beer-200 border border-beer-500/30' };
    };

    const playedBlockTone = (_idx: number) => {
      return { label: t('played_label'), cls: 'bg-white/10 text-white/80 border border-white/10' };
    };

    const renderMatchRow = (m: Match) => {
      const label = formatMatchTeamsLabel(m, (id) => getTeamName(id), { includeCode: true });
      const score = formatMatchScoreLabel(m);
      const isDone = (m as any).played || m.status === 'finished';
      const isLive = m.status === 'playing';

      return (
        <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-black leading-tight text-white whitespace-normal break-words" title={label}>{label}</div>
            {(m.phase || m.groupName || m.roundName) && (
              <div className="text-[11px] font-bold leading-tight text-white/60 whitespace-normal break-words">
                {m.groupName ? `${t('group_word')} ${m.groupName}` : (m.roundName || (m.phase === 'bracket' ? t('bracket_word') : ''))}
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> {t('live_badge')}
              </span>
            )}
            <div className="text-sm font-black tabular-nums text-white">{(isDone || isLive) ? score : '—'}</div>
          </div>
        </div>
      );
    };

    const hasPlaying = blocksAdmin.some((b) => b.some((m) => m.status === 'playing'));
    const startIndex = (turnsTab === 'next') ? ((hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx)) : 0;

    const adminBlocks = (() => {
      if (turnsTab === 'live') return blocksAdmin.filter((b) => b.some((m) => m.status === 'playing'));
      if (turnsTab === 'next') {
        const nextBlockStart = hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx;
        const nextBlock = blocksAdmin[nextBlockStart];
        return nextBlock ? [nextBlock] : [];
      }
      if (turnsTab === 'played' || turnsTab === 'tbd') return [];
      return blocksAdmin;
    })();

    const playedBlocks = (turnsTab === 'all' || turnsTab === 'played') ? blocksPlayed : [];
    const tbdMatches = (turnsTab === 'all' || turnsTab === 'tbd') ? msTbd : [];

    const emptyForTab = adminBlocks.length === 0 && playedBlocks.length === 0 && tbdMatches.length === 0;

    const countForTab = (key: typeof turnsTab) => {
      if (key === 'all') return (msAdmin.length + msPlayed.length + msTbd.length);
      if (key === 'live') return msAdmin.filter((m) => m.status === 'playing').length;
      if (key === 'next') {
        const nextBlockStart = hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx;
        return blocksAdmin[nextBlockStart]?.length ?? 0;
      }
      if (key === 'played') return msPlayed.length;
      return msTbd.length;
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={t('turns_dialog')}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeTurns();
        }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

        <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wide text-beer-200">{t('turns_dialog')}</div>
              <div className="text-lg md:text-xl font-black uppercase tracking-tight leading-tight whitespace-normal break-words">{data.name}</div>
              <div className="text-xs font-bold text-white/60 mt-1">{t('turns_helper').replace('{count}', String(nTables))}</div>
            </div>
            <button
              type="button"
              onClick={closeTurns}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60"
              aria-label={t('close')}
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div ref={turnsScrollRef} className="p-5 overflow-auto max-h-[calc(85vh-84px)]">
            <div className="mb-5 flex flex-wrap items-center gap-2" role="tablist" aria-label={t('turns_filter')}>
              {([
                { key: 'all', label: t('all') },
                { key: 'live', label: t('live_label') },
                { key: 'next', label: t('next_label') },
                { key: 'played', label: t('played_label') },
                { key: 'tbd', label: 'TBD' },
              ] as const).map((opt) => {
                const active = turnsTab === opt.key;
                const base = 'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60';
                const cls = active
                  ? 'bg-beer-500 text-slate-900 border-beer-500'
                  : 'bg-white/10 text-white border-white/10 hover:bg-white/20';
                const count = countForTab(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTurnsTab(opt.key)}
                    className={base + ' ' + cls}
                    role="tab"
                    aria-selected={active}
                  >
                    {opt.label}
                    <span className={active ? 'rounded-full bg-slate-900/25 px-2 py-0.5 text-[11px] font-black' : 'rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-black'}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pinned summary (sticky) for quick glance and jump */}
            {blocksAdmin.length > 0 && (turnsTab === 'all' || turnsTab === 'live' || turnsTab === 'next') && (() => {
              const pinIdx = (() => {
                if (turnsTab === 'live') return hasPlaying ? currentBlockIdx : -1;
                if (turnsTab === 'next') return hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx;
                // all
                return hasPlaying ? currentBlockIdx : 0;
              })();

              if (pinIdx < 0 || pinIdx >= blocksAdmin.length) return null;
              const pinBlock = blocksAdmin[pinIdx] || [];
              const pinAnyLive = pinBlock.some((m) => m.status === 'playing');
              const pinTitle = (turnsTab === 'next')
                ? t('next_turn')
                : (pinAnyLive ? t('current_turn') : t('next_turn'));

              return (
                <div className="sticky top-0 z-10 -mx-5 px-5 pt-0 pb-4 bg-slate-950/90 backdrop-blur border-b border-white/10">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-black uppercase tracking-wide text-white/60">{pinTitle}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <div className="min-w-0 font-black uppercase tracking-tight whitespace-normal break-words leading-tight">{t('turn_word')} {pinIdx + 1}</div>
                          {pinAnyLive && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> {t('live_badge')}
                            </span>
                          )}
                        </div>
                        {!turnsPinExpanded && (
                          <div className="mt-1 text-xs font-bold text-white/60">{t('match_count').replace('{count}', String(pinBlock.length))}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(turnsCurrentTurnRef.current && turnsTab !== 'next') && (
                          <button
                            type="button"
                            onClick={() => {
                              const target = turnsCurrentTurnRef.current;
                              if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
                            }}
                            className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide bg-white/10 border border-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60"
                          >
                            {t('go_to_turn')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setTurnsPinExpanded((v) => !v)}
                          className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide bg-white/10 border border-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60"
                          aria-expanded={turnsPinExpanded}
                        >
                          {turnsPinExpanded ? t('close') : t('expand')}
                        </button>
                      </div>
                    </div>
                    {turnsPinExpanded && (
                      <div className="mt-3 space-y-2">{pinBlock.map(renderMatchRow)}</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {blocksAdmin.length === 0 && blocksPlayed.length === 0 && msTbd.length === 0 && (
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 text-white/70 font-bold">
                {t('no_matches_available')}
              </div>
            )}

            {(blocksAdmin.length > 0 || blocksPlayed.length > 0 || msTbd.length > 0) && (
              <div className="space-y-6">
                {emptyForTab && (
                  <div className="p-6 rounded-2xl border border-white/10 bg-white/5 text-white/70 font-bold">
                    {t('no_matches_for_selected_filter')}
                  </div>
                )}

                {adminBlocks.length > 0 && (
                  <div className="space-y-5">
                    <div className="text-[11px] font-black uppercase tracking-wide text-white/60">
                      {turnsTab === 'live' ? t('live_turns') : (turnsTab === 'next' ? t('next_turns') : t('live_and_next_turns'))}
                    </div>
                    {adminBlocks.map((b, idx) => {
                      const absoluteIdx = (turnsTab === 'next') ? (idx + startIndex) : (turnsTab === 'live' ? (blocksAdmin.findIndex((bb) => bb === b)) : idx);
                      let tone = adminBlockTone(Math.max(0, absoluteIdx));
                      if (turnsTab === 'next' && idx === 0 && tone.label !== t('live_state_label')) {
                        tone = { label: t('next_state_label'), cls: 'bg-beer-500/20 text-beer-200 border border-beer-500/30' };
                      }
                      const isCurrent = Math.max(0, absoluteIdx) === currentBlockIdx;
                      const shouldAnchor = isCurrent && turnsTab !== 'next';
                      return (
                        <div
                          key={idx}
                          ref={shouldAnchor ? (el) => { if (el) turnsCurrentTurnRef.current = el; } : undefined}
                          tabIndex={shouldAnchor ? -1 : undefined}
                          className="space-y-2 scroll-mt-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black uppercase tracking-tight">{t('turn_word')} {Math.max(0, absoluteIdx) + 1}{isCurrent ? ` ${t('current_suffix')}` : ''}</div>
                            <div className="inline-flex items-center gap-2">
                              <span className={"rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide " + tone.cls}>{tone.label}</span>
                              <span className="text-[11px] font-black text-white/60">{b.length}/{nTables}</span>
                            </div>
                          </div>
                          <div className="space-y-2">{b.map(renderMatchRow)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {playedBlocks.length > 0 && (
                  <div className="space-y-5 pt-6 border-t border-white/10">
                    <div className="text-[11px] font-black uppercase tracking-wide text-white/60">{t('played_turns_history')}</div>
                    {playedBlocks.map((b, idx) => {
                      const tone = playedBlockTone(idx);
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black uppercase tracking-tight">{t('played_turn_word')} {idx + 1}</div>
                            <div className="inline-flex items-center gap-2">
                              <span className={"rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide " + tone.cls}>{tone.label}</span>
                              <span className="text-[11px] font-black text-white/60">{b.length}/{nTables}</span>
                            </div>
                          </div>
                          <div className="space-y-2">{b.map(renderMatchRow)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {tbdMatches.length > 0 && (
                  <div className="space-y-3 pt-6 border-t border-white/10">
                    <div className="text-[11px] font-black uppercase tracking-wide text-white/60">{t('waiting_tbd')}</div>
                    <div className="space-y-2">{tbdMatches.map(renderMatchRow)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    setData(initialData);
    setMatches(initialMatches);
    setLastUpdated(new Date());
  }, [initialData, initialMatches]);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [isLive]);

  const hasGroups = !!(data.groups && data.groups.length > 0);
  const isStructurelessManualArchive = !isLive && !!data.isManual && !hasGroups && (matches?.length || 0) === 0;
  const advancingPerGroup = typeof data.config?.advancingPerGroup === 'number' ? data.config.advancingPerGroup : undefined;
  const availableViews = React.useMemo(() => {
    const views: Array<{
      key: 'groups' | 'bracket' | 'leaderboard' | 'overview';
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }> = [];

    if (isStructurelessManualArchive) {
      views.push({ key: 'overview', label: t('history_label'), icon: Archive });
      return views;
    }

    if (hasGroups) {
      views.push({ key: 'groups', label: t('groups_label'), icon: LayoutList });
      if (!data.isManual) {
        views.push({ key: 'bracket', label: t('bracket_finale'), icon: GitBranch });
        views.push({ key: 'leaderboard', label: t('scorers_label'), icon: Medal });
      }
      return views;
    }

    views.push(
      { key: 'bracket', label: t('bracket_finale'), icon: GitBranch },
      { key: 'leaderboard', label: t('scorers_label'), icon: Medal }
    );
    return views;
  }, [data.isManual, hasGroups, isStructurelessManualArchive, t]);

  useEffect(() => {
    if (!availableViews.some((item) => item.key === view)) {
      setView(availableViews[0]?.key ?? 'bracket');
    }
  }, [availableViews, view]);

  const currentViewMeta = availableViews.find((item) => item.key === view) || availableViews[0] || {
    key: 'overview' as const,
    label: t('history_label'),
    icon: Archive,
  };
  const CurrentViewIcon = currentViewMeta.icon;

  const renderViewTabs = (tone: 'dark' | 'light') => {
    if (availableViews.length <= 1) return null;

    const containerClass = tone === 'dark'
      ? 'flex flex-wrap bg-white/10 p-1 rounded-xl border border-white/10'
      : 'flex flex-wrap bg-white p-1 rounded-xl border border-slate-200';
    const activeClass = tone === 'dark'
      ? 'bg-white shadow text-slate-900'
      : 'bg-slate-900 shadow text-white';
    const inactiveClass = tone === 'dark'
      ? 'text-white/70 hover:text-white hover:bg-white/10'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
    const focusClass = tone === 'dark'
      ? 'focus-visible:ring-beer-500/60 focus-visible:ring-offset-slate-900'
      : 'focus-visible:ring-beer-400 focus-visible:ring-offset-slate-50';

    return (
      <div className={containerClass} role="toolbar" aria-label={t('tournament_view')}>
        {availableViews.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`px-4 py-2 rounded-lg font-black uppercase text-xs transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${focusClass} ${
              view === key ? activeClass : inactiveClass
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
    );
  };

const formatTournamentType = (type: TournamentData['type']) => {
  if (type === 'groups_elimination') return t('format_groups_elimination_short');
  if (type === 'round_robin') return t('format_round_robin');
  return t('format_elimination');
};

const safeDateLabel = (d: string) => {
  const ts = Date.parse(d);
  return Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : '—';
};

const visibleTeamsCount = React.useMemo(() => {
  return (teams || []).filter((team) => {
    const name = (team?.name || '').trim().toUpperCase();
    return !team?.hidden && !team?.isBye && name !== 'BYE' && name !== 'TBD';
  }).length;
}, [teams]);


  const pendingGroupTieBreaks = React.useMemo(() => {
    return (matches || [])
      .filter((m) => m.phase === 'groups' && m.isTieBreak && m.status !== 'finished' && !m.hidden && !m.isBye)
      .filter((m) => {
        const ids = getMatchParticipantIds(m);
        return !ids.includes('BYE');
      });
  }, [matches]);

  const groupBundles = React.useMemo(() => {
    const byGroup = new Map<string, Match[]>();
    for (const m of (matches || [])) {
      if (m.phase !== 'groups') continue;
      const k = (m.groupName || '');
      const arr = byGroup.get(k);
      if (arr) arr.push(m);
      else byGroup.set(k, [m]);
    }
    for (const arr of byGroup.values()) {
      arr.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }

    const out = new Map<string, { standings: ReturnType<typeof computeGroupStandings>; matches: Match[] }>();
    for (const g of (data.groups || [])) {
      const ms = byGroup.get(g.name) || [];
      out.set(g.name, {
        matches: ms,
        standings: computeGroupStandings({ teams: g.teams, matches: ms }),
      });
    }
    return out;
  }, [matches, data.groups]);

  const getAward = (type: string) => tournamentAwards.find((a) => a.type === (type as any));

  const AwardRow = ({ label, type, icon, color }: any) => {
    const entry = getAward(type);
    const isIndividualAward = type !== 'winner';
    const primaryLabel = !entry
      ? null
      : (isIndividualAward
        ? (entry.playerNames?.join(', ') || entry.teamName || 'ND')
        : (entry.teamName || entry.playerNames.join(', ')));
    const secondaryLabel = !entry
      ? ''
      : (isIndividualAward
        ? (entry.teamName || '')
        : (entry.teamName ? entry.playerNames.join(' & ') : ''));
    return (
      <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3">
          <div className={`${color} p-2 rounded-full text-white`}>
            {icon}
          </div>
          <span className="font-black text-sm text-slate-700 uppercase tracking-wide">{label}</span>
        </div>
        <div className="font-black text-slate-900 text-right">
          {entry ? (
            <div>
              <div>{primaryLabel}</div>
              {secondaryLabel && <div className="text-[10px] text-slate-400 font-bold">{secondaryLabel}</div>}
            </div>
          ) : (
            <span className="text-slate-400 italic">ND</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in min-h-screen pb-12">
      {renderTurnsModal()}
      {/* Header */}
      <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl border border-white/10 relative overflow-hidden">
        {/* Decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-beer-500/20 to-transparent"></div>
          <div className="absolute left-0 -top-10 h-40 w-40 bg-white/5 rounded-full blur-2xl"></div>
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <button
                onClick={onBack}
                aria-label={t('back')}
                className={btnGhostDark}
              >
                &larr; {t('back')}
              </button>

              <div className="min-w-0">
                <PublicBrandStack className="mb-3" />
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight leading-tight whitespace-normal break-words">{data.name}</h2>
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-300">

                  {isLive && (

                    <span className="inline-flex items-center gap-2">

                      <Clock className="w-4 h-4" />

                      <span className="whitespace-nowrap">{t('updated_at')}: {lastUpdated.toLocaleTimeString()}</span>

                    </span>

                  )}

                  {isLive ? (

                    <span className={badgeLiveDark}>

                      <span className="w-2 h-2 rounded-full bg-slate-900/60 animate-pulse" />

                      {t('live_badge')}

                    </span>

                  ) : (

                    <span className={badgeArchiveDark}>{t('archive_status')}</span>

                  )}

                </div>


                <div className="mt-3 flex flex-wrap items-center gap-2">

                  {isStructurelessManualArchive ? null : (
                    <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white/90">
                      <Users className="w-4 h-4 text-beer-500" /> {visibleTeamsCount} squadre
                    </span>
                  )}

                  <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white/90">

                    <CalendarDays className="w-4 h-4 text-white/70" /> {safeDateLabel(data.startDate)}

                  </span>

                  <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white/90">

                    {formatTournamentType(data.type)}

                  </span>

                  {typeof advancingPerGroup === 'number' && data.type === 'groups_elimination' && (

                    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black bg-beer-500/20 border border-beer-500/30 text-beer-200">

                      {t('top_count').replace('{count}', String(advancingPerGroup))}

                    </span>

                  )}

                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end" role="toolbar" aria-label="Azioni torneo">
              {isLive && (
                <button
                  type="button"
                  onClick={openTurns}
                  className={btnGhostDark}
                >
                  <LayoutList className="w-4 h-4" aria-hidden /> {t('turns_label')}
                  {turnsLiveBadgeCount > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[11px] font-black bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 tabular-nums">
                      {turnsLiveBadgeCount}
                    </span>
                  )}
                </button>
              )}
              {!isLive && (
                <button
                  onClick={() => setShowAwards(true)}
                  className={`${btnPrimaryDark} flex items-center justify-center`}
                >
                  <Medal className="w-4 h-4" /> <span>{t('awards_label')}</span>
                </button>
              )}

              {renderViewTabs('dark')}
            </div>
	        </div>
	      </div>
	    </div>

	    {hasGroups && pendingGroupTieBreaks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <div className="font-black uppercase text-amber-900 text-sm">{t('qualification_blocked_tiebreak')}</div>
            <div className="text-xs font-bold text-amber-800">
              {t('waiting_label')} {pendingGroupTieBreaks
                .slice(0, 6)
                .map((m) => `${m.code || ''}${m.groupName ? ` (${m.groupName})` : ''}`)
                .join(', ')}
              {pendingGroupTieBreaks.length > 6 ? ' …' : ''}
            </div>
          </div>
          <div className="text-[11px] font-black uppercase text-amber-700">{t('play_tiebreak_to_unlock_bracket')}</div>
        </div>
      )}

      <div className="space-y-6">
        {/* Main */}
        <div className="space-y-4">
          

          <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden">

            
            <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <CurrentViewIcon className="w-4 h-4 text-slate-600" />

                <h3 className="font-black uppercase tracking-tight text-sm text-slate-700">
                  {currentViewMeta.label}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> {t('go_back')}
                </button>

                {view === 'groups' && hasGroups && typeof advancingPerGroup === 'number' && (
                  <span className={badgeTopLight}>{t('top_count').replace('{count}', String(advancingPerGroup))}</span>
                )}

                {renderViewTabs('light')}
              </div>
            </div>


            <div className="p-4">

              {view === 'overview' && (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <h4 className="mt-4 text-lg font-black text-slate-900">{t('manual_archive_without_structure_title')}</h4>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                        {t('manual_archive_without_structure_desc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAwards(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                    >
                      <Medal className="h-4 w-4" /> {t('open_awards')}
                    </button>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={onBack}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                    >
                      <ArrowLeft className="h-4 w-4" /> {t('back_to_archive')}
                    </button>
                  </div>
                </div>
              )}

              {view === 'groups' && hasGroups && (

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {data.groups?.map((g) => {

                    const computed = groupBundles.get(g.name) || {

                      matches: [] as Match[],

                      standings: computeGroupStandings({ teams: g.teams, matches: [] }),

                    };

                    return (

                      <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-black uppercase text-slate-700 flex justify-between">

                          <span>{g.name}</span>

                          {typeof advancingPerGroup === 'number' && (

                            <span className={badgeTopLight}>{t('top_count').replace('{count}', String(advancingPerGroup))}</span>

                          )}

                        </div>


                        <div className="p-4">

                          <GroupStandingsTable

                            rankedTeams={computed.standings.rankedTeams}

                            rows={computed.standings.rows}

                            advancingCount={advancingPerGroup ?? 0}

                            headerStyle="legend"

                            fitToWidth={true}

                          />

                        </div>


                        <div className="p-3 bg-slate-50 border-t border-slate-200">

                          <div className="text-[11px] font-black uppercase text-slate-500 mb-2">{t('matches_label')}</div>

                          <div className="space-y-1">

                            {computed.matches

                              .filter((m) => !m.hidden && !m.isBye)

                              .filter((m) => {

                                const ids = getMatchParticipantIds(m);

                                return !ids.includes('BYE');

                              })

                              .map((m) => {

                                const ids = getMatchParticipantIds(m);

                                const names = ids.map(id => getTeamName(id));

                                const label = names.join(' vs ');

                                const score = m.status === 'finished' ? formatMatchScoreLabel(m) : '—';

                                const a11yLabel = `${t('view')} ${((m.code || '').trim() || t('match_detail'))}: ${label}`;

                                return (

                                  
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setSelectedMatch(m)}
                                    aria-label={a11yLabel}
                                    title={a11yLabel}
                                    className="w-full group flex items-start justify-between gap-3 text-left bg-white/70 hover:bg-white border border-slate-200 rounded-2xl px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                  >
                                    <div className="flex items-start gap-3 min-w-0">
                                      <span className="shrink-0 rounded-xl bg-slate-900 text-white text-[10px] font-black px-2.5 py-1 uppercase tracking-wide">
                                        {(m.code || '').trim() || t('match_code_fallback')}
                                      </span>

                                      <div className="min-w-0">
                                        {(() => {
                                          const isTwoTeams = ids.length === 2;
                                          if (isTwoTeams) {
                                            return (
                                              <div className="text-[13px] font-black leading-tight">
                                                <div className="text-slate-900 whitespace-normal break-words">{names[0]}</div>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">vs</span>
                                                  <span className="text-slate-700 whitespace-normal break-words">{names[1]}</span>
                                                </div>
                                              </div>
                                            );
                                          }
                                          return <div className="text-[13px] font-black leading-tight text-slate-900 whitespace-normal break-words">{label}</div>;
                                        })()}

                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                          <span
                                            className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                              m.status === 'finished'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : m.status === 'playing'
                                                ? 'bg-beer-50 text-beer-700 border-beer-100'
                                                : 'bg-slate-100 text-slate-700 border-slate-200'
                                            }`}
                                          >
                                            {m.status === 'finished' ? t('finished_state_label') : m.status === 'playing' ? t('live_state_label') : t('to_play_state_label')}
                                          </span>

                                          {m.isTieBreak && (
                                            <span
                                              className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
                                                ids.length >= 3
                                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                                              }`}
                                            >
                                              {t('tiebreak_label')}{ids.length >= 3 ? ` ${t('multi_suffix')}` : ''}{typeof m.targetScore === 'number' ? ` ${t('target_score_prefix')} ${m.targetScore}` : ''}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="shrink-0 text-right">
                                      <div className="text-xs font-black text-slate-700">{score}</div>
                                    </div>
                                  </button>

                                );

                              })}

                            {computed.matches

                              .filter((m) => !m.hidden && !m.isBye)

                              .filter((m) => {

                                const ids = getMatchParticipantIds(m);

                                return !ids.includes('BYE');

                              }).length === 0 && (

                              <div className="text-xs text-slate-400 italic">{t('no_group_matches')}</div>

                            )}

                          </div>

                        </div>

                      </div>

                    );

                  })}

                </div>

              )}


              {view === 'bracket' && (

                <div className="relative min-h-[400px] overflow-hidden rounded-[28px] border border-slate-900/10 bg-slate-950 shadow-[0_32px_80px_-44px_rgba(15,23,42,0.9)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />
                  <div className="pointer-events-none absolute -top-16 left-12 h-40 w-40 rounded-full bg-beer-400/15 blur-3xl" />
                  <div className="pointer-events-none absolute right-0 top-10 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />

                  <div className="relative border-b border-white/10 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-beer-300/30 bg-beer-400/15 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-beer-100">
                          <GitBranch className="w-3.5 h-3.5" /> {t('bracket_word')}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide border ${
                          isLive
                            ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100'
                            : 'border-white/12 bg-white/6 text-white/70'
                        }`}>
                          {isLive ? t('live_status') : t('archive_status')}
                        </span>
                      </div>
                      <div className="text-[11px] font-black uppercase tracking-wide text-white/50">{t('scroll_bracket')}</div>
                    </div>
                  </div>

                  <div className="relative bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.88)_100%)]">
                    <TournamentBracket teams={teams} data={data} matches={matches} readOnly={true} showConnectors={true} wrapTeamNames={true} />
                  </div>

                </div>

              )}

              {view === 'leaderboard' && (
                <TournamentLeaderboard
                  variant="page"
                  teams={teams}
                  matches={matches}
                  awards={tournamentAwards}
                  playerAliases={playerAliases}
                />
              )}

            </div>

          </div>

        </div>
      </div>

      {selectedMatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedMatch(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="match-dialog-title" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <h3 id="match-dialog-title" className="font-black uppercase">{t('match_detail')}</h3>
              <button
                type="button"
                onClick={() => setSelectedMatch(null)}
                className="p-1 rounded hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                aria-label={t('close')}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-2">
              <div className="text-sm font-black text-slate-700">{selectedMatch.code || ''}</div>
              <div className="font-black text-slate-900">
                {(() => {
                  const ids = getMatchParticipantIds(selectedMatch);
                  const names = ids.map(id => getTeamName(id));
                  return names.join(' vs ');
                })()}
              </div>
              <div className="text-2xl font-black">
                {(() => {
                  if (selectedMatch.status !== 'finished') return t('not_finished');
                  return formatMatchScoreLabel(selectedMatch);
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Awards Modal */}
      {showAwards && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAwards(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="awards-dialog-title" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <h3 id="awards-dialog-title" className="font-black uppercase flex items-center gap-2">
                <Trophy className="w-5 h-5 text-beer-500" /> {t('hof')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAwards(false)}
                className="p-1 rounded hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                aria-label={t('close')}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <AwardRow label={t('tournament_winner')} type="winner" icon={<Trophy className="w-5 h-5" />} color="bg-yellow-500" />
              <AwardRow label={t('tournament_mvp')} type="mvp" icon={<Star className="w-5 h-5" />} color="bg-orange-500" />
              <AwardRow label={t('tournament_top_scorer')} type="top_scorer" icon={<PlasticCupIcon className="w-4 h-4" />} color="bg-yellow-600" />
              <AwardRow label={t('tournament_defender')} type="defender" icon={<Wind className="w-5 h-5" />} color="bg-blue-600" />
              <AwardRow label={t('tournament_top_scorer_u25')} type="top_scorer_u25" icon={<PlasticCupIcon className="w-4 h-4" />} color="bg-yellow-500" />
              <AwardRow label={t('tournament_defender_u25')} type="defender_u25" icon={<UserRound className="w-5 h-5" />} color="bg-blue-400" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
