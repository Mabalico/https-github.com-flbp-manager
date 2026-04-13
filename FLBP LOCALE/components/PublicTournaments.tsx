import React from 'react';
import { Match, Team, TournamentData } from '../types';
import { useTranslation } from '../App';
import { formatMatchScoreLabel, formatMatchTeamsLabel, getMatchParticipantIds, isByeTeamId } from '../services/matchUtils';
import { Activity, History, ArrowRight, MonitorPlay, Search, X, Users, CalendarDays, LayoutList } from 'lucide-react';
import { PublicBrandStack } from './PublicBrandStack';

interface PublicTournamentsProps {
  liveTournament: TournamentData | null;
  history: TournamentData[];
  /** Optional: live bundle (local snapshot) to render "turni" without DB. */
  liveMatches?: Match[];
  liveTeams?: Team[];
  onViewTournament: (t: TournamentData, isLive: boolean) => void;
  onEnterTv?: () => void;
}

export const PublicTournaments: React.FC<PublicTournamentsProps> = ({ liveTournament, history, liveMatches, liveTeams, onViewTournament, onEnterTv }) => {
  const { t } = useTranslation();

  const btnBaseDark = "inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-black uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none sm:w-auto sm:px-8 sm:py-4";
  const btnPrimaryDark = `${btnBaseDark} bg-beer-500 text-slate-900 shadow-lg hover:bg-beer-600`;
  const btnGhostDark = `${btnBaseDark} bg-white/10 text-white border border-white/10 hover:bg-white/20`;

  const badgeBase = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide";
  const badgeLiveDark = `${badgeBase} bg-beer-500 text-slate-900`;
  const badgeTopDark = "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black bg-beer-500/20 border border-beer-500/30 text-beer-200";

  const [query, setQuery] = React.useState('');
  const [yearFilter, setYearFilter] = React.useState<string>('all');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');

  const [turnsOpen, setTurnsOpen] = React.useState(false);
  const [turnsLoading, setTurnsLoading] = React.useState(false);
  const [turnsError, setTurnsError] = React.useState<string | null>(null);
  const [turnsBundle, setTurnsBundle] = React.useState<{ teams: Team[]; matches: Match[] } | null>(null);

  const [turnsTab, setTurnsTab] = React.useState<'all' | 'live' | 'next' | 'played' | 'tbd'>('all');
  const [turnsPinExpanded, setTurnsPinExpanded] = React.useState(false);

  const turnsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const turnsCurrentTurnRef = React.useRef<HTMLDivElement | null>(null);

  const openTurns = async () => {
    if (!liveTournament) return;
    setTurnsOpen(true);
    setTurnsError(null);
    setTurnsTab('all');
    setTurnsPinExpanded(false);

    // Prefer the live snapshot props (local mode) if available.
    const snapTeams = (liveTeams && liveTeams.length) ? liveTeams : (liveTournament.teams || []);
    const snapMatches = (liveMatches && liveMatches.length) ? liveMatches : (liveTournament.matches || (liveTournament.rounds ? liveTournament.rounds.flat() : []));
    if (snapTeams.length && snapMatches.length) {
      setTurnsBundle({ teams: snapTeams, matches: snapMatches });
      return;
    }

    setTurnsError(t('turns_unavailable_tournament'));
  };

  const closeTurns = () => {
    setTurnsOpen(false);
  };

  React.useEffect(() => {
    // Keep the pinned header compact when switching tabs.
    if (!turnsOpen) return;
    setTurnsPinExpanded(false);
  }, [turnsOpen, turnsTab]);

  const liveTurnsBadgeCount = React.useMemo(() => {
    if (!liveTournament) return 0;
    const ms = (liveMatches && liveMatches.length)
      ? liveMatches
      : (liveTournament.matches || (liveTournament.rounds ? liveTournament.rounds.flat() : []));
    if (!ms || !ms.length) return 0;

    const isVisiblePublic = (m: Match) => {
      if ((m as any).hidden || (m as any).isBye || m.isBye) return false;
      const ids = getMatchParticipantIds(m);
      return !ids.some(id => isByeTeamId(id) || String(id || '').trim().toUpperCase() === 'BYE');
    };

    return ms.filter(m => m.status === 'playing' && isVisiblePublic(m)).length;
  }, [liveTournament, liveMatches]);

  React.useEffect(() => {
    if (!turnsOpen) return;
    if (turnsLoading || turnsError) return;
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
  }, [turnsOpen, turnsLoading, turnsError, turnsTab, turnsBundle]);

  const years = React.useMemo(() => {
    const set = new Set<string>();
    for (const item of history) {
      const ts = Date.parse(item.startDate);
      if (Number.isFinite(ts)) set.add(String(new Date(ts).getFullYear()));
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [history]);

  const filteredHistory = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = history.slice().sort((a, b) => {
      const ta = Date.parse(a.startDate);
      const tb = Date.parse(b.startDate);
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    return items.filter((item) => {
      const ts = Date.parse(item.startDate);
      const y = Number.isFinite(ts) ? String(new Date(ts).getFullYear()) : '—';

      if (yearFilter !== 'all' && y !== yearFilter) return false;
      if (typeFilter !== 'all' && item.type !== (typeFilter as any)) return false;

      if (!q) return true;
      const hay = `${item.name} ${y}`.toLowerCase();
      return hay.includes(q);
    });
  }, [history, query, yearFilter, typeFilter]);

  const formatTournamentType = (type: TournamentData['type']) => {
    if (type === 'groups_elimination') return t('format_groups_elimination_short');
    if (type === 'round_robin') return t('format_round_robin');
    return t('format_elimination');
  };

  const safeDateLabel = (d: string) => {
    const ts = Date.parse(d);
    return Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : '—';
  };

  const isStructurelessManualArchive = (t: TournamentData) =>
    !!t.isManual && !(t.groups && t.groups.length) && !((t.matches && t.matches.length) || (t.rounds && t.rounds.flat().length));

  const visibleTeamsCount = (t: TournamentData) =>
    (t.teams || []).filter((team) => {
      const name = (team?.name || '').trim().toUpperCase();
      return !team?.hidden && !team?.isBye && name !== 'BYE' && name !== 'TBD';
    }).length;

  const renderTurnsModal = () => {
    if (!turnsOpen || !liveTournament) return null;

    // Reset the anchor so we don't reuse a stale element when switching tabs.
    turnsCurrentTurnRef.current = null;

    const bundle = turnsBundle;
    const teams = bundle?.teams || [];
    const byId = new Map<string, Team>();
    teams.forEach(tt => byId.set(tt.id, tt));

    const getTeamName = (id: string) => {
      const tt = byId.get(id);
      return (tt?.name || id || '—');
    };

    const rawCfgTables = (liveTournament.config as any)?.refTables;
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
      return !up || up == 'BYE' || up == 'TBD' || up.startsWith('TBD-');
    };

    const isByeOrHidden = (m: Match) => {
      if ((m as any).hidden || (m as any).isBye || (m as any).isBye === true || m.isBye) return true;
      const ids = getMatchParticipantIds(m);
      return ids.some(id => isByeTeamId(id) || String(id || '').trim().toUpperCase() == 'BYE');
    };

    const hasValidParticipants = (m: Match) => {
      const ids = getMatchParticipantIds(m);
      if (ids.length < 2) return false;
      return ids.every(id => !isPlaceholderId(id));
    };

    const msAll = (bundle?.matches || [])
      .filter(m => !isByeOrHidden(m))
      .slice()
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const isDoneMatch = (m: Match) => (m.status === 'finished') || !!(m as any).played;

    const msPlayed = msAll.filter(m => isDoneMatch(m));
    const msUpcomingRaw = msAll.filter(m => !isDoneMatch(m));

    // Align "turni" numbering to Admin → Arbitri:
    // - only matches not finished
    // - exclude BYE/TBD placeholders from turns (same as RefereesTab hasValidParticipants)
    const msAdmin = msUpcomingRaw
      .filter(m => m.status !== 'finished')
      .filter(m => hasValidParticipants(m));

    // Upcoming matches not eligible for a referee turn yet (TBD placeholders etc.).
    const msTbd = msUpcomingRaw.filter(m => !hasValidParticipants(m));

    const blocksAdmin: Match[][] = [];
    for (let i = 0; i < msAdmin.length; i += nTables) blocksAdmin.push(msAdmin.slice(i, i + nTables));

    const blocksPlayed: Match[][] = [];
    for (let i = 0; i < msPlayed.length; i += nTables) blocksPlayed.push(msPlayed.slice(i, i + nTables));

    const playingIdxs = msAdmin
      .map((m, i) => (m.status === 'playing' ? i : -1))
      .filter(i => i >= 0) as number[];

    const currentBlockIdx = playingIdxs.length ? Math.floor(Math.min(...playingIdxs) / nTables) : 0;
    const hasPlaying = playingIdxs.length > 0;

    const adminBlockTone = (idx: number) => {
      const b = blocksAdmin[idx] || [];
      const anyPlaying = b.some(m => m.status === 'playing');
      if (anyPlaying) return { label: t('live_state_label'), cls: 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' };
      return { label: idx === currentBlockIdx ? t('next_state_label') : t('future_state_label'), cls: 'bg-beer-500/20 text-beer-200 border border-beer-500/30' };
    };

    const playedBlockTone = (_idx: number) => {
      return { label: t('played_label'), cls: 'bg-white/10 text-white/80 border border-white/10' };
    };

    const renderMatchRow = (m: Match) => {
      const label = formatMatchTeamsLabel(m, getTeamName, { includeCode: true });
      const score = formatMatchScoreLabel(m);
      const isDone = m.played || m.status === 'finished';
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

    return (
      <div
        className="flbp-mobile-sheet fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={t('turns_dialog')}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeTurns();
        }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

        <div className="flbp-mobile-sheet-panel relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wide text-beer-200">{t('turns_dialog')}</div>
              <div className="text-lg md:text-xl font-black uppercase tracking-tight leading-tight whitespace-normal break-words">{liveTournament.name}</div>
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
            {!turnsLoading && !turnsError && (
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

                  let count = 0;
                  if (opt.key === 'all') count = (msAdmin.length + msPlayed.length + msTbd.length);
                  if (opt.key === 'live') count = msAdmin.filter(m => m.status === 'playing').length;
                  if (opt.key === 'next') {
                    const nextBlockStart = hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx;
                    count = blocksAdmin[nextBlockStart]?.length ?? 0;
                  }
                  if (opt.key === 'played') count = msPlayed.length;
                  if (opt.key === 'tbd') count = msTbd.length;

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
            )}

            {/* Pinned summary (sticky) for quick glance and jump */}
            {!turnsLoading && !turnsError && blocksAdmin.length > 0 && (turnsTab === 'all' || turnsTab === 'live' || turnsTab === 'next') && (() => {
              const pinIdx = (() => {
                if (turnsTab === 'live') return hasPlaying ? currentBlockIdx : -1;
                if (turnsTab === 'next') return hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx;
                // all
                return hasPlaying ? currentBlockIdx : 0;
              })();

              if (pinIdx < 0 || pinIdx >= blocksAdmin.length) return null;
              const pinBlock = blocksAdmin[pinIdx] || [];
              const pinAnyLive = pinBlock.some(m => m.status === 'playing');
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
                          onClick={() => setTurnsPinExpanded(v => !v)}
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
            {turnsLoading && (
              <div className="p-6 text-center text-white/70 font-bold">{t('loading_turns')}</div>
            )}

            {!turnsLoading && turnsError && (
              <div className="p-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 text-amber-100">
                <div className="font-black">{turnsError}</div>
                <div className="text-sm font-bold opacity-80 mt-1">{t('reload_page_or_check_connection')}</div>
              </div>
            )}

            {!turnsLoading && !turnsError && blocksAdmin.length === 0 && blocksPlayed.length === 0 && msTbd.length === 0 && (
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 text-white/70 font-bold">
                {t('no_matches_available')}
              </div>
            )}

            {!turnsLoading && !turnsError && (blocksAdmin.length > 0 || blocksPlayed.length > 0 || msTbd.length > 0) && (() => {
              const startIndex = (turnsTab === 'next') ? ((hasPlaying ? (currentBlockIdx + 1) : currentBlockIdx)) : 0;

              const adminBlocks = (() => {
                if (turnsTab === 'live') return blocksAdmin.filter(b => b.some(m => m.status === 'playing'));
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

              return (
                <div className="space-y-6">
                  {emptyForTab && (
                    <div className="p-6 rounded-2xl border border-white/10 bg-white/5 text-white/70 font-bold">
                      {t('no_matches_for_selected_filter')}
                    </div>
                  )}
                {adminBlocks.length > 0 && (
                  <div className="space-y-5">
                    <div className="text-[11px] font-black uppercase tracking-wide text-white/60">{turnsTab === 'live' ? t('live_turns') : (turnsTab === 'next' ? t('next_turns') : t('live_and_next_turns'))}</div>
                    {adminBlocks.map((b, idx) => {
                      const absoluteIdx = (turnsTab === 'next') ? (idx + startIndex) : (turnsTab === 'live' ? (blocksAdmin.findIndex(bb => bb === b)) : idx);
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
              );
            })()}

          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {renderTurnsModal()}

        {/* Live Tournament Hero */}
        {liveTournament && (
            <div className="bg-slate-900 rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden border border-white/10">
                <div className="relative z-10 flex flex-col md:flex-row gap-5 sm:gap-8 items-center">
                    <div className="bg-white/10 p-4 sm:p-6 rounded-2xl backdrop-blur-sm border border-white/10">
                        <Activity className="w-10 h-10 sm:w-16 sm:h-16 text-beer-500 animate-pulse" />
                    </div>
                    <div className="text-center md:text-left flex-1">
                        <PublicBrandStack className="mb-3 inline-block text-center md:text-left" />
                        <div className={`mb-2 ${badgeLiveDark}`}>
                          <span className="w-2 h-2 rounded-full bg-slate-900/60 animate-pulse" />
                          {t('active_now')}
                        </div>
                        <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tight leading-tight mb-2">{liveTournament.name}</h3>
                        <p className="text-slate-400 font-medium mb-6 max-w-xl">
                            {t('live_tournament_desc')}
                        </p>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-6">
                            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold">
                                <Users className="w-4 h-4 text-beer-500" /> {visibleTeamsCount(liveTournament)} {t('teams')}
                            </span>
                            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold">
                                <CalendarDays className="w-4 h-4 text-white/70" /> {safeDateLabel(liveTournament.startDate)}
                            </span>
                            <span className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold">
                                {formatTournamentType(liveTournament.type)}
                            </span>
                            {typeof (liveTournament as any)?.config?.advancingPerGroup === 'number' && liveTournament.type === 'groups_elimination' && (
                              <span className={badgeTopDark}>{t('top_count').replace('{count}', String((liveTournament as any).config.advancingPerGroup))}</span>
                            )}
                        </div>
                        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4 justify-center md:justify-start">
                            <button 
                              onClick={() => onViewTournament(liveTournament, true)}
                              className={btnPrimaryDark}
                            >
                                {t('follow_live')} <ArrowRight className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { void openTurns(); }}
                              className={btnGhostDark}
                            >
                              <LayoutList className="w-5 h-5" /> {t('turns_label')}
                              {liveTurnsBadgeCount > 0 && (
                                <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[11px] font-black bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 tabular-nums">
                                  {liveTurnsBadgeCount}
                                </span>
                              )}
                            </button>
                            {onEnterTv && (
                                <button 
                                  onClick={onEnterTv}
                                  className={btnGhostDark}
                                >
                                    <MonitorPlay className="w-5 h-5" /> {t('tv_view')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                {/* Decoration */}
                <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-beer-500/20 to-transparent pointer-events-none"></div>
            </div>
        )}

        {/* History Section */}
        <div>
            <div className="bg-white rounded-[24px] border border-slate-200 p-4 md:p-6 mb-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2 leading-none">
                            <History className="w-5 h-5 text-slate-400" /> {t('archived_tournaments')}
                        </h3>
                        <div className="text-sm text-slate-500 mt-1">
                            {t('tournaments_count_summary').replace('{shown}', String(filteredHistory.length)).replace('{total}', String(history.length))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                            {t('quick_search')}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                            {t('year_format_filters')}
                          </span>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3" role="toolbar" aria-label={t('archive_filters')}>
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('search_tournament_year')}
                                aria-label={t('search_tournament_year')}
                                className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                            />
                            {query.trim().length > 0 && (
                              <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                                aria-label={t('clear_search')}
                              >
                                <X className="w-4 h-4" aria-hidden />
                              </button>
                            )}
                        </div>

                        <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                            aria-label={t('filter_by_year')}
                        >
                            <option value="all">{t('all_years')}</option>
                            {years.map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                        </select>

                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                            aria-label={t('filter_by_format')}
                        >
                            <option value="all">{t('all_formats')}</option>
                            <option value="groups_elimination">{t('format_groups_elimination_short')}</option>
                            <option value="elimination">{t('format_elimination')}</option>
                            <option value="round_robin">{t('format_round_robin')}</option>
                        </select>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredHistory.map((tournament) => (
                    <button
                      key={tournament.id}
                      type="button"
                      className="text-left bg-white p-6 rounded-[24px] shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-0.5 transition cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-400 focus-visible:ring-offset-2"
                      onClick={() => onViewTournament(tournament, false)}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-black uppercase">
                                {(() => {
                                  const ts = Date.parse(tournament.startDate);
                                  return Number.isFinite(ts) ? new Date(ts).getFullYear() : '—';
                                })()}
                            </div>
                            {tournament.type === 'groups_elimination' && <span className="text-[10px] font-bold text-slate-400 uppercase border border-slate-100 px-2 py-1 rounded">{t('groups_label')}</span>}
                        </div>
                        <h4 className="font-black text-lg text-slate-800 mb-1 group-hover:text-beer-600 transition-colors">{tournament.name}</h4>
                        <div className="text-sm text-slate-500 mb-4">{safeDateLabel(tournament.startDate)}</div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {isStructurelessManualArchive(tournament) ? null : (
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                              {formatTournamentType(tournament.type)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                            <CalendarDays className="w-3.5 h-3.5" /> {safeDateLabel(tournament.startDate)}
                          </span>
                        </div>
                        
                        <div className="pt-4 border-t border-slate-50 flex justify-end">
                             <span className="text-xs font-black uppercase text-slate-400 group-hover:text-beer-500 flex items-center gap-1 transition-colors">
                                 {isStructurelessManualArchive(tournament) ? t('open_sheet') : t('see_results')} <ArrowRight className="w-3 h-3" />
                             </span>
                        </div>
                    </button>
                ))}
                {filteredHistory.length === 0 && (
                    <div className="col-span-full p-12 text-center text-slate-400 italic bg-white rounded-2xl border-2 border-dashed border-slate-200">
                        {history.length === 0 ? t('no_archived_tournaments') : t('no_results_for_selected_filters')}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
