import React from 'react';
import { useTranslation } from '../App';
import { Team, TournamentData, Match } from '../types';
import { PublicTvShell } from './PublicTvShell';
import { TvClassicBracket } from './TvClassicBracket';
import { TvProjection } from '../types';
import { computeGroupStandings } from '../services/groupStandings';
import { GroupStandingsTable } from './GroupStandingsTable';
import { getMatchParticipantIds, getMatchScoreForTeam } from '../services/matchUtils';

const ROTATION_MS = 15000;

interface TvBracketViewProps {
  teams: Team[];
  matches: Match[];
  data: TournamentData | null;
  logo: string;
  onExit: () => void;
  mode: TvProjection;
}

export const TvBracketView: React.FC<TvBracketViewProps> = ({ teams, matches, data, logo, onExit, mode }) => {
  const { t } = useTranslation();
  const isSplit = mode === 'groups_bracket';

  // Detect an eventual "Girone Finale" in a backwards compatible way.
  // - preferred: group.stage === 'final' (if present in persisted data)
  // - fallback: group.name contains the word "final"/"finale" (case-insensitive)
  const isFinalGroup = React.useCallback((g: any) => {
    const stage = (g as any)?.stage;
    if (stage === 'final') return true;
    const name = String(g?.name || '');
    // Use word boundaries to avoid false positives like "semifinale".
    return /\bfinale?\b/i.test(name);
  }, []);

  const finalGroup = React.useMemo(() => {
    const groups = (data?.groups || []) as any[];
    return groups.find(isFinalGroup) || null;
  }, [data?.groups, isFinalGroup]);

  const stageGroups = React.useMemo(() => {
    const groups = (data?.groups || []) as any[];
    if (!finalGroup) return groups;
    return groups.filter((g) => g?.id !== (finalGroup as any)?.id);
  }, [data?.groups, finalGroup]);

  const isFinalMatch = React.useCallback((m: Match) => {
    if (/^FTB/i.test(String(m.code || ''))) return true;
    const gName = String(m.groupName || '');
    if (finalGroup?.name && gName === finalGroup.name) return true;
    return /\bfinale?\b/i.test(gName);
  }, [finalGroup]);

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

  const pendingGroupTieBreaks = React.useMemo(() => {
    return (matches || [])
      .filter((m) => m.phase === 'groups' && m.isTieBreak && m.status !== 'finished' && !m.hidden && !m.isBye)
      .filter((m) => {
        const ids = getMatchParticipantIds(m);
        return !ids.includes('BYE');
      })
      // In split mode, the "Gironi" banner must refer to stage groups only (exclude final-stage tie-breaks).
      .filter((m) => !isFinalMatch(m));
  }, [matches, isFinalMatch]);

  const groupMatchesByName = React.useMemo(() => {
    const byGroup = new Map<string, Match[]>();
    for (const m of (matches || [])) {
      if (m.phase !== 'groups') continue;
      if (m.hidden || m.isBye) continue;
      const k = (m.groupName || '');
      const arr = byGroup.get(k);
      if (arr) arr.push(m);
      else byGroup.set(k, [m]);
    }
    for (const arr of byGroup.values()) {
      arr.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }
    return byGroup;
  }, [matches]);

  const teamNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) map.set(t.id, t.name);
    return map;
  }, [teams]);

  const getName = React.useCallback((id?: string) => {
    if (!id) return 'TBD';
    return teamNameById.get(id) || 'TBD';
  }, [teamNameById]);

  const visibleBracketTeamsCount = React.useMemo(() => visibleTeams(teams).length, [teams, visibleTeams]);

  const bracketRoundCount = React.useMemo(() => {
    if (Array.isArray(data?.rounds) && data.rounds.length > 0) return data.rounds.length;

    const rounds = new Set<string>();
    for (const m of (matches || [])) {
      if (m.phase !== 'bracket') continue;
      if (m.hidden || m.isBye) continue;
      if (typeof m.round === 'number') {
        rounds.add(`round-${m.round}`);
        continue;
      }
      if (m.roundName) {
        rounds.add(`name-${m.roundName}`);
      }
    }

    return rounds.size;
  }, [data?.rounds, matches]);


  const hasBracketContent = React.useMemo(() => {
    if (Array.isArray(data?.rounds) && data.rounds.length > 0) return true;
    return (matches || []).some((m) => m.phase === 'bracket' && !m.hidden && !m.isBye);
  }, [data?.rounds, matches]);

  // In split mode (Gironi + Tabellone), avoid scroll: paginate + auto-rotate like TV gironi.
  // If groups are "too large", show 1 per page; if small, allow 2 per page.
  const maxTeamsInGroup = Math.max(0, ...stageGroups.map((g: any) => visibleTeams(g.teams || []).length));
  const maxMatchesInGroup = Math.max(0, ...stageGroups.map((g: any) => (groupMatchesByName.get(g.name) || []).length));
  const groupsPerPage = !isSplit
    ? Math.max(1, stageGroups.length)
    : (stageGroups.length <= 1 ? 1 : (maxTeamsInGroup <= 4 && maxMatchesInGroup <= 6 ? 2 : 1));
  const pageCount = isSplit && stageGroups.length > 0 ? Math.ceil(stageGroups.length / groupsPerPage) : 0;
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    if (!isSplit) return;
    if (pageCount <= 1) return;
    const t = setInterval(() => {
      setPage((prev) => (prev + 1) % pageCount);
    }, ROTATION_MS);
    return () => clearInterval(t);
  }, [isSplit, pageCount]);

  React.useEffect(() => {
    if (!isSplit) return;
    if (pageCount <= 0) return;
    if (page >= pageCount) setPage(0);
  }, [isSplit, pageCount, page]);

  const pageGroups = React.useMemo(() => {
    if (!isSplit) return stageGroups;
    if (stageGroups.length === 0) return [] as any[];
    return stageGroups.slice(page * groupsPerPage, page * groupsPerPage + groupsPerPage);
  }, [isSplit, stageGroups, page, groupsPerPage]);

  const renderGroupCard = React.useCallback((g: any) => {
    const rawMatches = groupMatchesByName.get(g.name) || [];
    const groupMatches = rawMatches.filter((m) => !getMatchParticipantIds(m).includes('BYE'));

    const standings = computeGroupStandings({ teams: visibleTeams(g.teams || []), matches: groupMatches });
    const played = groupMatches.filter((m) => m.status === 'finished' && m.played);
    const upcoming = groupMatches.filter((m) => !m.played);

    const playedLimit = isSplit ? 3 : 6;
    const upcomingLimit = isSplit ? 3 : 6;

    return (
      <div key={g.id} className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden flex flex-col min-h-0">
        <div className="bg-slate-900 text-white p-2 font-black uppercase text-center tracking-widest text-xs">
          {g.name}
        </div>

        <div className="flex-1 min-h-0 p-3 grid grid-cols-1 gap-3">
          {/* Standings */}
          <div className="min-h-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('standings_label')}</div>
            <GroupStandingsTable
              rankedTeams={standings.rankedTeams}
              rows={standings.rows}
              advancingCount={data?.config?.advancingPerGroup ?? 0}
              headerStyle="abbr"
              compact={true}
            />
          </div>

          {/* Matches */}
          <div className="min-h-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('matches_label')}</div>

            <div className="space-y-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('played_label')}</div>
                <div className="space-y-1">
                  {played.length === 0 ? (
                    <div className="text-[10px] text-slate-400">{t('none_short')}</div>
                  ) : (
                    played.slice(0, playedLimit).map((m) => (
                      <div
                        key={m.id}
                        className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1"
                      >
                        {(() => {
                          const ids = getMatchParticipantIds(m).filter((id) => id !== 'BYE');
                          const prefix = m.isTieBreak ? `${t('tiebreak_label')} • ` : '';
                          if (ids.length >= 3) {
                            return prefix + ids.map((id) => `${getName(id)} ${getMatchScoreForTeam(m, id)}`).join(' • ');
                          }
                          return `${prefix}${getName(m.teamAId)} ${m.scoreA}-${m.scoreB} ${getName(m.teamBId)}`;
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('to_play_state_label')}</div>
                <div className="space-y-1">
                  {upcoming.length === 0 ? (
                    <div className="text-[10px] text-slate-400">{t('none_short')}</div>
                  ) : (
                    upcoming.slice(0, upcomingLimit).map((m) => (
                      <div
                        key={m.id}
                        className="text-xs font-mono text-slate-600 bg-white border border-slate-100 rounded px-2 py-1"
                      >
                        {(() => {
                          const ids = getMatchParticipantIds(m).filter((id) => id !== 'BYE');
                          const names = ids.map((id) => getName(id));
                          const prefix = m.isTieBreak ? `${t('tiebreak_label')} • ` : '';
                          return prefix + names.join(' vs ');
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {(played.length > playedLimit || upcoming.length > upcomingLimit) && (
              <div className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t('more_in_list')}</div>
            )}
          </div>
        </div>
      </div>
    );
  }, [groupMatchesByName, visibleTeams, data?.config?.advancingPerGroup, getName, isSplit]);

  return (
    <PublicTvShell data={data} logo={logo} onExit={onExit} variant="minimal">
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
            {isSplit && pageCount > 1 && <span>{t('page')} {page + 1}/{pageCount}</span>}
            <span>{t('teams')} {visibleBracketTeamsCount}</span>
            <span>{t('turns_label')} {bracketRoundCount}</span>
          </div>
        </div>

        {isSplit ? (
          <div className="absolute inset-x-[0.65%] bottom-[0.65%] top-[5.4%] min-h-0 min-w-0">
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,0.94fr)_minmax(0,1.36fr)] gap-[0.85%]">
              <div className="min-h-0 overflow-hidden rounded-[1.45rem] border border-white/10 bg-slate-950/60 p-[1.05%] shadow-[0_32px_90px_rgba(2,6,23,0.4)]">
                <div className="h-full min-h-0 flex flex-col gap-[1%]">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/78 px-4 py-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.28)]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200/80">
                          {t('admin_tv_groups_bracket')}
                        </div>
                        <div className="mt-0.5 text-[26px] leading-[1.05] font-black uppercase tracking-[0.06em] text-white">
                          {t('group_word')}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="rounded-full border border-white/12 bg-slate-950/55 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">
                          {t('groups')} {stageGroups.length}
                        </div>
                        {pageCount > 1 && (
                          <div className="rounded-full border border-blue-400/25 bg-blue-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-100">
                            {t('page')} {page + 1}/{pageCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {pendingGroupTieBreaks.length > 0 && (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 shadow-[0_16px_40px_rgba(120,53,15,0.18)]">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                        {t('qualification_blocked_tiebreak')}
                      </div>
                      <div className="mt-1 text-[10px] font-mono font-bold text-amber-50/85">
                        {pendingGroupTieBreaks
                          .slice(0, 4)
                          .map((m) => `${m.code || ''}${m.groupName ? ` (${m.groupName})` : ''}`)
                          .join(' • ')}
                        {pendingGroupTieBreaks.length > 4 ? ' • …' : ''}
                      </div>
                    </div>
                  )}

                  {pageGroups.length > 0 ? (
                    <div className={`grid flex-1 min-h-0 gap-[1%] ${pageGroups.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {pageGroups.map((group) => renderGroupCard(group))}
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center rounded-[1.35rem] border border-white/10 bg-slate-950/50 text-slate-400 font-black uppercase tracking-[0.22em] text-sm">
                      {t('no_group_data_available')}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-hidden rounded-[1.45rem] border border-white/10 bg-slate-950/60 p-[0.45%] shadow-[0_32px_90px_rgba(2,6,23,0.4)]">
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
          </div>
        ) : (
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
        )}
      </div>
    </PublicTvShell>
  );
};
