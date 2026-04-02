import React from 'react';
import { useTranslation } from '../App';
import { Match, Team, TournamentData } from '../types';
import { PublicTvShell } from './PublicTvShell';
import { computeGroupStandings } from '../services/groupStandings';
import { GroupStandingsTable } from './GroupStandingsTable';
import { formatMatchScoreLabel, getMatchParticipantIds, getMatchScoreForTeam } from '../services/matchUtils';

interface TvSimpleViewProps {
  teams: Team[];
  data: TournamentData | null;
  matches: Match[];
  logo: string;
  onExit: () => void;
}

interface GroupTvPage {
  key: string;
  group: TournamentData['groups'][number];
  isFinal: boolean;
  pageIndex: number;
  pageCount: number;
  standings: ReturnType<typeof computeGroupStandings>;
  matchesPage: Match[];
  playedTotal: number;
  upcomingTotal: number;
  totalMatches: number;
  tieBreakCount: number;
}

const ROTATION_MS = 15000;
const MATCH_ROWS_PER_PAGE = 18;
const TV_CLAMP_2_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

export const TvSimpleView: React.FC<TvSimpleViewProps> = ({ teams, data, matches, logo, onExit }) => {
  const { t } = useTranslation();
  const groups = data?.groups || [];

  const isFinalGroup = React.useCallback((g: any) => {
    const stage = String((g as any)?.stage || '').toLowerCase();
    if (stage === 'final') return true;
    const name = String(g?.name || '').toLowerCase();
    return /\bfinale?\b/i.test(name);
  }, []);

  const isByeTeam = React.useCallback((t: any) => {
    if (!t) return false;
    if (String(t.id || '') === 'BYE') return true;
    const name = String(t.name || '').trim();
    if (/^bye$/i.test(name)) return true;
    if ((t as any).isBye === true) return true;
    if ((t as any).hidden === true) return true;
    return false;
  }, []);

  const visibleTeams = React.useCallback((arr: Team[]) => {
    return (arr || []).filter((t) => !isByeTeam(t));
  }, [isByeTeam]);

  const finalGroup = React.useMemo(() => groups.find(isFinalGroup) || null, [groups, isFinalGroup]);
  const stageGroups = React.useMemo(() => groups.filter((g) => !isFinalGroup(g)), [groups, isFinalGroup]);

  const teamNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams || []) map.set(t.id, t.name);
    for (const t of data?.teams || []) map.set(t.id, t.name);
    for (const g of groups) {
      for (const t of visibleTeams(g.teams || [])) map.set(t.id, t.name);
    }
    return map;
  }, [teams, data?.teams, groups, visibleTeams]);

  const getName = React.useCallback((id?: string) => {
    if (!id) return 'TBD';
    return teamNameById.get(id) || 'TBD';
  }, [teamNameById]);

  const groupMatchesByName = React.useMemo(() => {
    const byGroup = new Map<string, Match[]>();
    for (const m of matches || []) {
      if (m.phase !== 'groups') continue;
      if (m.hidden || m.isBye) continue;
      const ids = getMatchParticipantIds(m);
      if (ids.includes('BYE')) continue;
      const groupName = m.groupName || '';
      const current = byGroup.get(groupName);
      if (current) current.push(m);
      else byGroup.set(groupName, [m]);
    }
    for (const arr of byGroup.values()) {
      arr.sort((a, b) => {
        const order = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        if (order !== 0) return order;
        return String(a.code || a.id).localeCompare(String(b.code || b.id), 'it', { sensitivity: 'base' });
      });
    }
    return byGroup;
  }, [matches]);

  const isFinalMatch = React.useCallback((m: Match) => {
    const gName = String(m.groupName || '');
    if (finalGroup?.name && gName === finalGroup.name) return true;
    if (/final/i.test(gName)) return true;
    if (/^FTB/i.test(String(m.code || '').trim())) return true;
    return false;
  }, [finalGroup]);

  const pendingGroupTieBreaks = React.useMemo(() => {
    return (matches || [])
      .filter((m) => m.phase === 'groups' && m.isTieBreak && m.status !== 'finished' && !m.hidden && !m.isBye)
      .filter((m) => !getMatchParticipantIds(m).includes('BYE'))
      .filter((m) => !isFinalMatch(m));
  }, [matches, isFinalMatch]);

  const pendingFinalTieBreaks = React.useMemo(() => {
    if (!finalGroup) return [] as Match[];
    return (matches || [])
      .filter((m) => m.phase === 'groups' && m.isTieBreak && m.status !== 'finished' && !m.hidden && !m.isBye)
      .filter((m) => !getMatchParticipantIds(m).includes('BYE'))
      .filter((m) => isFinalMatch(m));
  }, [matches, finalGroup, isFinalMatch]);

  const pages = React.useMemo<GroupTvPage[]>(() => {
    const buildPagesForGroup = (group: TournamentData['groups'][number], isFinal: boolean): GroupTvPage[] => {
      const groupMatches = groupMatchesByName.get(group.name) || [];
      const standings = computeGroupStandings({
        teams: visibleTeams(group.teams || []),
        matches: groupMatches,
      });
      const played = groupMatches.filter((m) => m.status === 'finished' && m.played);
      const upcoming = groupMatches.filter((m) => m.status !== 'finished' || !m.played);
      const pageCount = Math.max(1, Math.ceil(groupMatches.length / MATCH_ROWS_PER_PAGE));

      return Array.from({ length: pageCount }, (_, index) => ({
        key: `${group.id || group.name}-${index}`,
        group,
        isFinal,
        pageIndex: index,
        pageCount,
        standings,
        matchesPage: groupMatches.slice(index * MATCH_ROWS_PER_PAGE, (index + 1) * MATCH_ROWS_PER_PAGE),
        playedTotal: played.length,
        upcomingTotal: upcoming.length,
        totalMatches: groupMatches.length,
        tieBreakCount: groupMatches.filter((m) => m.isTieBreak).length,
      }));
    };

    const groupPages = stageGroups.flatMap((group) => buildPagesForGroup(group, false));
    const finalPages = finalGroup ? buildPagesForGroup(finalGroup, true) : [];
    return [...groupPages, ...finalPages];
  }, [finalGroup, groupMatchesByName, stageGroups, visibleTeams]);

  const [page, setPage] = React.useState(0);
  const pageCount = pages.length;
  const currentPage = pageCount > 0 ? pages[page] : null;

  React.useEffect(() => {
    if (pageCount <= 1) return;
    const timer = setInterval(() => {
      setPage((prev) => (prev + 1) % pageCount);
    }, ROTATION_MS);
    return () => clearInterval(timer);
  }, [pageCount]);

  React.useEffect(() => {
    if (pageCount <= 0) return;
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const renderScoreLabel = React.useCallback((m: Match) => {
    const ids = getMatchParticipantIds(m);
    if (ids.length >= 3) {
      return ids.map((id) => `${getName(id)} ${getMatchScoreForTeam(m, id)}`).join(' • ');
    }
    return formatMatchScoreLabel(m);
  }, [getName]);

  const renderTeamsLabel = React.useCallback((m: Match) => {
    const ids = getMatchParticipantIds(m);
    return ids.map((id) => getName(id)).join(' vs ');
  }, [getName]);

  const renderMatchesTable = React.useCallback((opts: {
    title: string;
    accentClass: string;
    matches: Match[];
    total: number;
    emptyLabel: string;
  }) => {
    const { title, accentClass, matches: bucketMatches, total, emptyLabel } = opts;
    return (
      <div className="min-h-0 h-full rounded-2xl border border-white/12 bg-slate-900/75 shadow-[0_24px_60px_rgba(2,6,23,0.28)] overflow-hidden flex flex-col">
        <div className={`px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 ${accentClass}`}>
          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/90">
            {title}
          </div>
          <div className="text-[9px] font-mono font-black text-white/70">
            {total}
          </div>
        </div>
        <div className="px-3 py-1.5 flex-1 min-h-0">
          {bucketMatches.length === 0 ? (
            <div className="h-full rounded-xl border border-dashed border-white/12 bg-slate-950/40 flex items-center justify-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {emptyLabel}
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-1 text-left text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">{t('match_detail')}</th>
                  <th className="w-[22%] pb-1 text-right text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
                    {t('result_status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bucketMatches.map((m) => {
                  const isPlaying = m.status === 'playing';
                  const isFinished = m.status === 'finished';
                  const rightLabel = isFinished ? renderScoreLabel(m) : (isPlaying ? t('live_state_label') : t('to_play_state_label'));
                  return (
                    <tr key={m.id} className="border-b border-white/6 last:border-b-0">
                      <td className="py-1 pr-1.5 align-middle">
                        <div
                          className="text-[10px] leading-tight font-black text-white break-words"
                          style={TV_CLAMP_2_STYLE}
                        >
                          {renderTeamsLabel(m)}
                        </div>
                        {m.isTieBreak && (
                          <div className="mt-0.5 inline-flex rounded-full border border-amber-400/35 bg-amber-400/10 px-1 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-amber-200">
                            {t('tiebreak_label')}
                          </div>
                        )}
                      </td>
                      <td className="py-1 align-middle text-right">
                        <span className={`inline-flex min-w-[5rem] justify-center rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] ${
                          isFinished
                            ? 'border-rose-400/35 bg-rose-500/12 text-rose-100'
                            : isPlaying
                              ? 'border-emerald-400/35 bg-emerald-500/12 text-emerald-100'
                              : 'border-slate-500/30 bg-slate-800/80 text-slate-200'
                        }`}>
                          {rightLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }, [renderScoreLabel, renderTeamsLabel]);

  return (
    <PublicTvShell data={data} logo={logo} onExit={onExit}>
      <div className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_rgba(15,23,42,0.96)_38%,_rgba(2,6,23,1)_100%)] px-[1.15%] py-[1.05%]">
        {pendingGroupTieBreaks.length > 0 && (
          <div className="mb-2 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-2.5 shadow-[0_16px_40px_rgba(120,53,15,0.18)]">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-100">
              {t('qualification_blocked_tiebreak')}
            </div>
            <div className="mt-1 text-[11px] font-mono font-bold text-amber-50/85">
              {pendingGroupTieBreaks
                .slice(0, 4)
                .map((m) => `${renderTeamsLabel(m)}${m.groupName ? ` (${m.groupName})` : ''}`)
                .join(' • ')}
              {pendingGroupTieBreaks.length > 4 ? ' • …' : ''}
            </div>
          </div>
        )}
        {pendingFinalTieBreaks.length > 0 && (
          <div className="mb-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 shadow-[0_16px_40px_rgba(136,19,55,0.18)]">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-100">
              {t('title_blocked_final_tiebreak')}
            </div>
            <div className="mt-1 text-[11px] font-mono font-bold text-rose-50/85">
              {pendingFinalTieBreaks
                .slice(0, 4)
                .map((m) => `${renderTeamsLabel(m)}${m.groupName ? ` (${m.groupName})` : ''}`)
                .join(' • ')}
              {pendingFinalTieBreaks.length > 4 ? ' • …' : ''}
            </div>
          </div>
        )}

        {currentPage ? (
          <div className="flex-1 min-h-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/55 p-[1.1%] shadow-[0_40px_100px_rgba(2,6,23,0.42)]">
            <div className="h-full min-h-0 flex flex-col gap-[1%]">
              <div className="rounded-2xl border border-white/10 bg-slate-900/72 px-4 py-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.28)]">
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200/80">
                      {currentPage.isFinal ? t('final_group_label') : t('group_word')}
                    </div>
                    <div
                      className="mt-0.5 text-[28px] leading-[1.05] font-black uppercase tracking-[0.06em] text-white break-words"
                      style={TV_CLAMP_2_STYLE}
                    >
                      {currentPage.group.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="rounded-full border border-white/12 bg-slate-950/55 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">
                      {t('teams')} {visibleTeams(currentPage.group.teams || []).length}
                    </div>
                    <div className="rounded-full border border-white/12 bg-slate-950/55 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">
                      {t('matches_label')} {currentPage.playedTotal}/{currentPage.totalMatches}
                    </div>
                    {currentPage.tieBreakCount > 0 && (
                      <div className="rounded-full border border-amber-400/30 bg-amber-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">
                        {t('tiebreaks_label')} {currentPage.tieBreakCount}
                      </div>
                    )}
                    {currentPage.pageCount > 1 && (
                      <div className="rounded-full border border-blue-400/25 bg-blue-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-100">
                        {t('page')} {currentPage.pageIndex + 1}/{currentPage.pageCount}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-[1%]">
                <div className="min-h-0 rounded-2xl border border-white/12 bg-white overflow-hidden shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                  <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                      {t('standings_label')}
                    </div>
                    {!currentPage.isFinal && (
                      <div className="text-[10px] font-mono font-black text-slate-500">
                        {t('qualified_label')} {data?.config?.advancingPerGroup ?? 0}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <GroupStandingsTable
                      rankedTeams={currentPage.standings.rankedTeams}
                      rows={currentPage.standings.rows}
                      advancingCount={currentPage.isFinal ? 0 : (data?.config?.advancingPerGroup ?? 0)}
                      headerStyle="abbr"
                      fitToWidth={true}
                      tvReadable={true}
                    />
                  </div>
                </div>

                {renderMatchesTable({
                  title: t('matches_label'),
                  accentClass: 'bg-blue-700/85',
                  matches: currentPage.matchesPage,
                  total: currentPage.totalMatches,
                  emptyLabel: t('no_group_matches'),
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center rounded-[1.6rem] border border-white/10 bg-slate-950/50 text-slate-400 font-black uppercase tracking-[0.22em] text-sm">
            {t('no_group_data_available')}
          </div>
        )}
      </div>
    </PublicTvShell>
  );
};
