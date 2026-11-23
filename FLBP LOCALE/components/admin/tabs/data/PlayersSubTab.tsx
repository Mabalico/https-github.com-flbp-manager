import React from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Link2,
  Medal,
  PencilLine,
  Search,
  Trash2,
  Unlink2,
  UserRound,
} from 'lucide-react';
import type {
  PlayerAliasRelationRow,
  PlayerContributionSourceRow,
  PlayerProfileSnapshot,
  PlayerTitleSourceRow,
} from '../../../../types';
import {
  buildPlayerProfileSnapshot,
  getAliasRemovalImpact,
  removePlayerAliasMapping,
} from '../../../../services/playerDataProvenance';
import { deleteHallOfFameEntry, reassignHallOfFameEntry } from '../../../../services/hallOfFameAdmin';
import { BirthDateInput } from '../../BirthDateInput';
import { formatBirthDateDisplay, getPlayerKey, normalizeBirthDateInput, pickPlayerIdentityValue, resolvePlayerKey } from '../../../../services/playerIdentity';
import { updatePlayerProfileIdentity } from '../../../../services/playerProfileAdmin';
import type { DataTabProps } from '../DataTab';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';

type SnackbarState =
  | { tone: 'success' | 'error'; message: string }
  | null;

type PlayerListFilter = 'all' | 'archived' | 'manual' | 'mixed' | 'aliases';
type PlayerListSort = 'impact' | 'titles' | 'canestri' | 'name';

const sectionSurfaceClass = 'rounded-[22px] border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md';
const subCardClass = 'rounded-[18px] border border-slate-200 bg-slate-50';
const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const inputBase =
  `w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition focus:border-blue-300 ${ring}`;
const buttonBase =
  `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${ring}`;
const secondaryButtonClass = `${buttonBase} border border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 shadow-sm`;
const primaryButtonClass = `${buttonBase} border border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300`;
const dangerButtonClass = `${buttonBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-500 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 shadow-sm`;
const chipBase =
  `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black transition ${ring}`;

const toneClassByKey = {
  archived: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  manual: 'border-violet-200 bg-violet-50 text-violet-700',
  mixed: 'border-sky-200 bg-sky-50 text-sky-700',
  alias: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  changed: 'border-blue-200 bg-blue-50 text-blue-700',
} as const;

const metricCardClass = 'rounded-[18px] border border-slate-100 bg-gradient-to-b from-slate-50/90 to-white/90 px-4 py-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-300';

const profileSourceVariant = (profile: PlayerProfileSnapshot): 'archived' | 'manual' | 'mixed' | 'neutral' => {
  if (profile.hasArchivedData && profile.hasManualData) return 'mixed';
  if (profile.hasArchivedData) return 'archived';
  if (profile.hasManualData) return 'manual';
  return 'neutral';
};


const groupContributions = (rows: PlayerContributionSourceRow[]) => ({
  archived: rows.filter((row) => row.sourceType === 'archived_tournament_match'),
  manual: rows.filter((row) => row.sourceType === 'manual_integration'),
});

const SourceBadge: React.FC<{
  label: string;
  tone: keyof typeof toneClassByKey;
  icon?: React.ReactNode;
}> = ({ label, tone, icon }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black ${toneClassByKey[tone]}`}>
    {icon}
    {label}
  </span>
);

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className={metricCardClass}>
    <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
    <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
  </div>
);

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
}> = ({ icon, title, body }) => (
  <div className="px-5 py-8 text-center">
    <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      {icon}
    </div>
    <div className="mt-4 text-sm font-black text-slate-800">{title}</div>
    <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{body}</div>
  </div>
);

const PlayerSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}> = ({ icon, title, count, children }) => (
  <details open className={`${sectionSurfaceClass} group`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          {icon}
        </div>
        <div>
          <div className="text-base font-black text-slate-950">{title}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
          {count}
        </span>
        <ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
      </div>
    </summary>
    <div className="px-5 py-5">{children}</div>
  </details>
);

export const PlayersSubTab: React.FC<DataTabProps & {
  profiles: PlayerProfileSnapshot[];
  aliasesLink: React.ReactNode;
  onLinkName: (player: PlayerProfileSnapshot) => void;
  onOpenEdition: (id: string) => void;
}> = ({
  state,
  setState,
  profiles: allProfiles,
  aliasesLink,
  onLinkName,
  onOpenEdition,
  t,
}) => {
  const [search, setSearch] = React.useState('');
  const [listFilter, setListFilter] = React.useState<PlayerListFilter>('all');
  const [sortBy, setSortBy] = React.useState<PlayerListSort>('impact');
  const [selectedPlayerId, setSelectedPlayerId] = React.useState('');
  const [detailOpen, setDetailOpen] = React.useState(false);
  const detailBackRef = React.useRef<HTMLButtonElement>(null);
  const reassignRef = React.useRef<HTMLDivElement>(null);
  const [highlightPlayerId, setHighlightPlayerId] = React.useState('');
  const [snackbar, setSnackbar] = React.useState<SnackbarState>(null);
  const [profileDraftName, setProfileDraftName] = React.useState('');
  const [profileDraftBirthDate, setProfileDraftBirthDate] = React.useState('');
  const [reassignDraft, setReassignDraft] = React.useState<{
    rowId: string;
    entryId: string;
    playerSlotIndex?: number | null;
    nextPlayerName: string;
    nextPlayerBirthDate: string;
  } | null>(null);
  const [titleDeleteTarget, setTitleDeleteTarget] = React.useState<PlayerTitleSourceRow | null>(null);
  const [aliasDeleteTarget, setAliasDeleteTarget] = React.useState<{
    alias: PlayerAliasRelationRow;
    impact: ReturnType<typeof getAliasRemovalImpact>;
  } | null>(null);



  const awardLabelText = React.useCallback((type: PlayerTitleSourceRow['type']) => {
    if (type === 'winner') return t('winner');
    if (type === 'mvp') return 'MVP';
    if (type === 'top_scorer') return t('top_scorers_plural');
    if (type === 'defender') return t('defenders_plural');
    if (type === 'top_scorer_u25') return t('players_award_top_scorer_u25');
    if (type === 'defender_u25') return t('players_award_defender_u25');
    return type;
  }, [t]);

  const profileSourceLabelText = React.useCallback((profile: PlayerProfileSnapshot) => {
    const variant = profileSourceVariant(profile);
    if (variant === 'mixed') return t('players_filter_mixed');
    if (variant === 'archived') return t('players_filter_archived');
    if (variant === 'manual') return t('players_filter_manual');
    return t('players_profile_only');
  }, [t]);

  const filterCounts = React.useMemo(() => {
    const counts = { all: allProfiles.length, archived: 0, manual: 0, mixed: 0, aliases: 0 };
    allProfiles.forEach((profile) => {
      const variant = profileSourceVariant(profile);
      if (variant === 'archived') counts.archived += 1;
      if (variant === 'manual') counts.manual += 1;
      if (variant === 'mixed') counts.mixed += 1;
      if (profile.aliasCount > 0) counts.aliases += 1;
    });
    return counts;
  }, [allProfiles]);

  const profiles = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    let next = allProfiles.filter((profile) => {
      const matchesFilter =
        listFilter === 'all'
          ? true
          : listFilter === 'aliases'
            ? profile.aliasCount > 0
            : listFilter === 'mixed'
              ? profile.hasArchivedData && profile.hasManualData
              : listFilter === 'archived'
                ? profile.hasArchivedData && !profile.hasManualData
                : profile.hasManualData && !profile.hasArchivedData;

      if (!matchesFilter) return false;
      if (!query) return true;
      if (profile.displayName.toLowerCase().includes(query)) return true;
      return profile.aliases.some((alias) => alias.otherLabel.toLowerCase().includes(query));
    });

    next = next.slice().sort((a, b) => {
      if (sortBy === 'name') return a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' });
      if (sortBy === 'titles') {
        const diff = b.totalTitles - a.totalTitles;
        if (diff !== 0) return diff;
      }
      if (sortBy === 'canestri') {
        const diff = b.totalCanestri - a.totalCanestri;
        if (diff !== 0) return diff;
      }
      const scoreA = a.totalTitles * 1000 + a.totalCanestri * 10 + a.totalSoffi;
      const scoreB = b.totalTitles * 1000 + b.totalCanestri * 10 + b.totalSoffi;
      const diff = scoreB - scoreA;
      if (diff !== 0) return diff;
      return a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' });
    });

    return next;
  }, [allProfiles, listFilter, search, sortBy]);

  const selectedProfile = React.useMemo(
    () => (selectedPlayerId ? allProfiles.find((profile) => profile.playerId === selectedPlayerId) || null : null),
    [allProfiles, selectedPlayerId]
  );

  const groupedContributionsBySource = React.useMemo(
    () => groupContributions(selectedProfile?.contributions || []),
    [selectedProfile]
  );

  React.useEffect(() => {
    if (!profiles.length) {
      setSelectedPlayerId('');
      return;
    }
    if (!selectedPlayerId || !profiles.some((profile) => profile.playerId === selectedPlayerId)) {
      setSelectedPlayerId(profiles[0].playerId);
    }
  }, [profiles, selectedPlayerId]);

  React.useEffect(() => {
    if (detailOpen && window.matchMedia('(max-width: 1023px)').matches) detailBackRef.current?.focus();
  }, [detailOpen, selectedPlayerId]);

  React.useEffect(() => {
    if (reassignDraft && reassignRef.current) {
      reassignRef.current.querySelector('input')?.focus();
    }
  }, [reassignDraft?.rowId]);

  React.useEffect(() => {
    if (!selectedProfile) {
      setProfileDraftName('');
      setProfileDraftBirthDate('');
      return;
    }
    setProfileDraftName(selectedProfile.displayName || '');
    setProfileDraftBirthDate(/^\d{2}\/\d{2}\/\d{4}$/.test(selectedProfile.yobLabel || '') ? selectedProfile.yobLabel : '');
  }, [selectedProfile]);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 2600);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  React.useEffect(() => {
    if (!highlightPlayerId) return;
    const timer = window.setTimeout(() => setHighlightPlayerId(''), 1500);
    return () => window.clearTimeout(timer);
  }, [highlightPlayerId]);


  const profileUpdateMeta = React.useMemo(() => {
    if (!selectedProfile) return null;

    const countTeamSlots = (teams: any[] | undefined) => {
      if (!Array.isArray(teams) || !teams.length) return 0;
      return teams.reduce((total, team) => {
        let nextTotal = total;
        const player1Key = team.player1 ? resolvePlayerKey(state, getPlayerKey(team.player1, pickPlayerIdentityValue((team as any).player1BirthDate, team.player1YoB))) : '';
        const player2Key = team.player2 ? resolvePlayerKey(state, getPlayerKey(team.player2, pickPlayerIdentityValue((team as any).player2BirthDate, team.player2YoB))) : '';
        if (player1Key === selectedProfile.playerId) nextTotal += 1;
        if (player2Key === selectedProfile.playerId) nextTotal += 1;
        return nextTotal;
      }, 0);
    };

    const nextName = profileDraftName.trim();
    const nextBirthDate = normalizeBirthDateInput(profileDraftBirthDate) || undefined;
    const currentBirthDate = normalizeBirthDateInput(/^\d{2}\/\d{2}\/\d{4}$/.test(selectedProfile.yobLabel || '') ? selectedProfile.yobLabel : '') || undefined;
    const currentProfile = buildPlayerProfileSnapshot(state, selectedProfile.playerId);
    const nextRawPlayerId = nextName ? getPlayerKey(nextName, pickPlayerIdentityValue(nextBirthDate)) : '';
    const nextPlayerId = nextRawPlayerId ? resolvePlayerKey(state, nextRawPlayerId) : '';
    const targetProfile = nextPlayerId ? buildPlayerProfileSnapshot(state, nextPlayerId) : null;
    const isSameName = selectedProfile.displayName.trim() === nextName;
    const isSameBirthDate = (currentBirthDate || '') === (nextBirthDate || '');
    const hasChanges = !!nextName && (!isSameName || !isSameBirthDate);
    const mergeTarget = !!targetProfile && nextPlayerId !== selectedProfile.playerId;

    return {
      nextName,
      hasChanges,
      mergeTarget,
      targetLabel: targetProfile ? `${targetProfile.displayName}${targetProfile.yobLabel && targetProfile.yobLabel !== 'ND' ? ` · ${targetProfile.yobLabel}` : ''}` : '',
      registeredSlots: countTeamSlots(state.teams),
      liveTournamentSlots: countTeamSlots(state.tournament?.teams),
      archivedTeamSlots: (state.tournamentHistory || []).reduce((total, tournamentRow) => total + countTeamSlots(tournamentRow.teams), 0),
      contributionRows: currentProfile?.contributions.length || 0,
      titleRows: currentProfile?.titles.length || 0,
      aliasCount: currentProfile?.aliasCount || 0,
    };
  }, [profileDraftBirthDate, profileDraftName, selectedProfile, state]);

  const confirmDeleteTitle = () => {
    if (!titleDeleteTarget) return;
    try {
      const result = deleteHallOfFameEntry(state, titleDeleteTarget.entryId);
      setState(result.state);
      setTitleDeleteTarget(null);
      setReassignDraft(null);
      setHighlightPlayerId(selectedPlayerId);
      setSnackbar({ tone: 'success', message: t('players_snackbar_title_deleted').replace('{title}', awardLabelText(titleDeleteTarget.type)) });
    } catch (error: any) {
      setSnackbar({ tone: 'error', message: error?.message || t('players_snackbar_title_delete_error') });
    }
  };

  const confirmRemoveAlias = () => {
    if (!aliasDeleteTarget) return;
    try {
      setState(removePlayerAliasMapping(state, aliasDeleteTarget.alias.fromKey));
      setAliasDeleteTarget(null);
      setHighlightPlayerId(selectedPlayerId);
      setSnackbar({ tone: 'success', message: t('players_snackbar_alias_removed') });
    } catch (error: any) {
      setSnackbar({ tone: 'error', message: error?.message || t('players_snackbar_alias_remove_error') });
    }
  };

  const applyProfileUpdate = () => {
    if (!selectedProfile) return;
    try {
      const nextState = updatePlayerProfileIdentity(state, {
        currentPlayerId: selectedProfile.playerId,
        nextPlayerName: profileDraftName.trim(),
        nextBirthDate: normalizeBirthDateInput(profileDraftBirthDate) || undefined,
      });
      setState(nextState);
      setHighlightPlayerId(selectedProfile.playerId);
      setSnackbar({ tone: 'success', message: t('players_snackbar_profile_updated') });
    } catch (error: any) {
      setSnackbar({ tone: 'error', message: error?.message || t('players_snackbar_profile_update_error') });
    }
  };

  const applyReassign = () => {
    if (!reassignDraft) return;
    const nextName = reassignDraft.nextPlayerName.trim();
    if (!nextName) {
      setSnackbar({ tone: 'error', message: t('players_snackbar_enter_new_player') });
      return;
    }
    try {
      const result = reassignHallOfFameEntry(state, {
        entryId: reassignDraft.entryId,
        nextPlayerName: nextName,
        nextPlayerBirthDate: normalizeBirthDateInput(reassignDraft.nextPlayerBirthDate) || undefined,
        playerSlotIndex: reassignDraft.playerSlotIndex,
      });
      setState(result.state);
      setHighlightPlayerId(selectedPlayerId);
      setSnackbar({ tone: 'success', message: t('players_snackbar_title_reassigned') });
      setReassignDraft(null);
    } catch (error: any) {
      setSnackbar({ tone: 'error', message: error?.message || t('players_snackbar_title_reassign_error') });
    }
  };

  const quickFilterLabels: Array<{ key: PlayerListFilter; label: string; count: number }> = [
    { key: 'all', label: t('all'), count: filterCounts.all },
    { key: 'archived', label: t('players_filter_archived'), count: filterCounts.archived },
    { key: 'manual', label: t('players_filter_manual'), count: filterCounts.manual },
    { key: 'mixed', label: t('players_filter_mixed'), count: filterCounts.mixed },
    { key: 'aliases', label: t('edition_alias_filter'), count: filterCounts.aliases },
  ];


  return (
    <>
      <p className="text-sm text-slate-600">{t('players_tab_subtitle')}</p>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className={sectionSurfaceClass + ' lg:sticky lg:top-4 lg:self-start ' + (detailOpen && selectedProfile ? 'hidden lg:block' : '')}>
              <div className="border-b border-slate-100 px-5 py-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    aria-label={t('players_search_aria')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('players_search_placeholder')}
                    className={`${inputBase} pl-11 pr-11`}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-black text-slate-500 transition hover:bg-slate-50 ${ring}`}
                    >
                      {t('clear')}
                    </button>
                  ) : null}
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  {quickFilterLabels.map((filter) => {
                    const active = listFilter === filter.key;
                    return (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setListFilter(filter.key)}
                        className={`${chipBase} ${
                          active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        aria-pressed={active}
                      >
                        {filter.label}
                        <span className={`rounded-full px-1.5 py-0.5 ${active ? 'bg-white/80 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {filter.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <label className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('players_sort_by')}</label>
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerListSort)} className={`${inputBase} mt-2 py-2.5`}>
                    <option value="impact">{t('players_sort_impact')}</option>
                    <option value="titles">{t('players_sort_titles')}</option>
                    <option value="canestri">{t('players_sort_canestri')}</option>
                    <option value="name">{t('players_sort_name')}</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[52vh] space-y-2 overflow-auto px-3 py-3">
                {profiles.map((profile) => {
                  const selected = profile.playerId === selectedPlayerId;
                  const highlighted = profile.playerId === highlightPlayerId;
                  const sourceVariant = profileSourceVariant(profile);
                  return (
                    <button
                      key={profile.playerId}
                      type="button"
                      onClick={() => {
                        setSelectedPlayerId(profile.playerId);
                        setDetailOpen(true);
                        setReassignDraft(null);
                      }}
                      className={`w-full rounded-[20px] border px-4 py-3 text-left transition-all duration-150 ${ring} ${
                        selected
                          ? 'border-blue-200 bg-blue-50 shadow-sm shadow-blue-100 ring-1 ring-blue-100'
                          : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
                      } ${highlighted ? 'ring-2 ring-emerald-200' : ''}`}
                      aria-current={selected}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 h-12 w-1.5 rounded-full ${selected ? 'bg-blue-600' : sourceVariant === 'mixed' ? 'bg-sky-300' : 'bg-transparent'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-black text-slate-950 whitespace-normal break-words leading-tight">{profile.displayName}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{profile.yobLabel}</div>
                            </div>
                            <SourceBadge label={profileSourceLabelText(profile)} tone={sourceVariant} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <SourceBadge label={t('players_titles_count').replace('{count}', String(profile.totalTitles))} tone="info" />
                            <SourceBadge label={t('players_canestri_count').replace('{count}', String(profile.totalCanestri))} tone="archived" />
                            <SourceBadge label={t('players_soffi_count').replace('{count}', String(profile.totalSoffi))} tone="manual" />
                            {profile.aliasCount > 0 ? <SourceBadge label={t('players_alias_count').replace('{count}', String(profile.aliasCount))} tone="alias" /> : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {profiles.length === 0 ? (
                  <EmptyState
                    icon={<Search className="h-4 w-4" />}
                    title={t('players_none_found_title')}
                    body={t('players_none_found_body')}
                  />
                ) : null}
              </div>
              <div className="border-t border-slate-100 p-3">{aliasesLink}</div>
            </aside>

            <div className={'min-w-0 space-y-4 ' + (detailOpen && selectedProfile ? '' : 'hidden lg:block')}>
              <button type="button" ref={detailBackRef} className={secondaryButtonClass + ' lg:hidden'} onClick={() => setDetailOpen(false)}>← {t('edition_player_list')}</button>
              {!selectedProfile ? (
                <div className={`${sectionSurfaceClass} p-10`}>
                  <EmptyState
                    icon={<UserRound className="h-5 w-5" />}
                    title={t('players_select_profile_title')}
                    body={t('players_select_profile_body')}
                  />
                </div>
              ) : (
                <>
                  <div className={`${sectionSurfaceClass} overflow-hidden`}>
                    <div className="border-b border-slate-100 px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-2xl font-black text-slate-950">{selectedProfile.displayName}</div>
                            <SourceBadge label={profileSourceLabelText(selectedProfile)} tone={profileSourceVariant(selectedProfile)} />
                            {selectedProfile.aliasCount > 0 ? <SourceBadge label={t('players_alias_count').replace('{count}', String(selectedProfile.aliasCount))} tone="alias" icon={<Link2 className="h-3.5 w-3.5" />} /> : null}
                          </div>
                        </div>
                        <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
                          <MetricCard label={t('players_birth_date')} value={selectedProfile.yobLabel} />
                          <MetricCard label={t('players_titles')} value={selectedProfile.totalTitles} />
                          <MetricCard label={t('canestri_tv')} value={selectedProfile.totalCanestri} />
                          <MetricCard label={t('soffi')} value={selectedProfile.totalSoffi} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <PlayerSection
                    icon={<Medal className="h-5 w-5" />}
                    title={t('players_titles')}
                    count={selectedProfile.titles.length}
                  >
                    <div className="space-y-3">
                      {selectedProfile.titles.map((row) => {
                        const title = [
                          awardLabelText(row.type),
                          row.tournamentName + (row.year ? ' (' + row.year + ')' : ''),
                          row.teamName,
                          row.value,
                        ].filter(value => value != null && value !== '').join(' · ');
                        return (
                          <article key={row.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                            <Medal className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-bold text-slate-900">{title}</p>
                              <p className="text-xs text-slate-500">{t(row.manuallyEdited ? 'players_status_reassigned' : row.sourceType === 'manual' ? 'players_added_manually' : 'edition_from_archive')}</p>
                            </div>
                            <details className="relative shrink-0" name="player-title-actions">
                              <summary aria-label={t('actions') + ' ' + title} className={'cursor-pointer list-none rounded-lg px-2 py-1 font-bold hover:bg-slate-100 ' + ring}>⋯</summary>
                              <div className="absolute right-0 z-10 grid min-w-40 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                                {row.sourceTournamentId && <button type="button" onClick={event => {
                                  event.currentTarget.closest('details')?.removeAttribute('open');
                                  if (row.sourceTournamentId) onOpenEdition(row.sourceTournamentId);
                                }} className={secondaryButtonClass}>{t('player_area_open_tournament')}</button>}
                                <button type="button" onClick={event => {
                                  event.currentTarget.closest('details')?.removeAttribute('open');
                                  setReassignDraft({ rowId: row.id, entryId: row.entryId, playerSlotIndex: row.playerSlotIndex, nextPlayerName: '', nextPlayerBirthDate: '' });
                                }} className={secondaryButtonClass}>{t('edition_reassign')}</button>
                                <button type="button" onClick={event => {
                                  event.currentTarget.closest('details')?.removeAttribute('open');
                                  setTitleDeleteTarget(row);
                                }} className={dangerButtonClass}>{t('delete')}</button>
                              </div>
                            </details>
                          </article>
                        );
                      })}
                      {selectedProfile.titles.length === 0 ? (
                        <EmptyState
                          icon={<Medal className="h-4 w-4" />}
                          title={t('players_no_titles_title')}
                          body={t('players_no_titles_body')}
                        />
                      ) : null}
                    </div>
                  </PlayerSection>

                      {reassignDraft ? (
                        <div ref={reassignRef} className="rounded-[20px] border border-blue-200 bg-blue-50/70 p-4">
                          <div className="flex items-center gap-2 text-sm font-black text-blue-900">
                            <PencilLine className="h-4 w-4" />
                            {t('edition_reassign')}
                          </div>
                          <div className="mt-3 space-y-3">
                            <label className="block">
                              <div className="mb-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-900">{t('players_label_player')}</div>
                              <input
                                value={reassignDraft.nextPlayerName}
                                onChange={(event) => setReassignDraft((current) => (current ? { ...current, nextPlayerName: event.target.value } : current))}
                                className={inputBase}
                                placeholder={t('players_name_placeholder')}
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-900">{t('players_birth_date')}</div>
                              <BirthDateInput
                                value={reassignDraft.nextPlayerBirthDate}
                                onChange={(value) =>
                                  setReassignDraft((current) =>
                                    current ? { ...current, nextPlayerBirthDate: value } : current
                                  )
                                }
                                className={inputBase}
                                placeholder={t('players_birth_date_placeholder')}
                                ariaLabel={t('players_reassign_birthdate_aria')}
                              />
                            </label>
                            <div>
                              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-blue-900">{t('players_suggested_profiles')}</div>
                              <div className="flex flex-wrap gap-2">
                                {allProfiles
                                  .filter((profile) => profile.playerId !== selectedProfile?.playerId)
                                  .filter((profile) => !reassignDraft.nextPlayerName || profile.displayName.toLowerCase().includes(reassignDraft.nextPlayerName.toLowerCase()))
                                  .slice(0, 8)
                                  .map((profile) => (
                                    <button
                                      key={profile.playerId}
                                      type="button"
                                      onClick={() =>
                                        setReassignDraft((current) =>
                                          current ? { ...current, nextPlayerName: profile.displayName, nextPlayerBirthDate: profile.yobLabel === 'ND' ? '' : profile.yobLabel } : current
                                        )
                                      }
                                      className={`rounded-full border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-black text-blue-700 transition hover:bg-blue-100 ${ring}`}
                                    >
                                      {profile.displayName} ({profile.yobLabel})
                                    </button>
                                  ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={applyReassign} className={primaryButtonClass}>
                                <CheckCircle2 className="h-4 w-4" />
                                {t('players_confirm_reassign')}
                              </button>
                              <button type="button" onClick={() => setReassignDraft(null)} className={secondaryButtonClass}>
                                {t('referees_add_cancel')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                  <PlayerSection
                    icon={<Crosshair className="h-5 w-5" />}
                    title={t('players_stats_by_source_title')}
                    count={selectedProfile.contributions.length}
                  >
                    <div className="space-y-5">
                      <div className={`${subCardClass} border-emerald-200 bg-emerald-50/50 p-4`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Archive className="h-4 w-4 text-emerald-700" />
                            <div className="text-sm font-black text-emerald-900">{t('players_archived_tournaments')}</div>
                          </div>
                          <SourceBadge label={t('players_rows_count').replace('{count}', String(groupedContributionsBySource.archived.length))} tone="archived" />
                        </div>
                        <div className="mt-4 space-y-3">
                          {groupedContributionsBySource.archived.map((row) => (
                            <div key={row.id} className="rounded-[18px] border border-emerald-100 bg-white px-4 py-3">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-black text-slate-950">{row.tournamentName || t('players_archived_tournament_fallback')}</div>
                                    <SourceBadge label={t('players_filter_archived')} tone="archived" />
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-slate-500">
                                    {row.tournamentYear && <>{row.tournamentYear} · </>}
                                    {row.teamName}
                                  </div>
                                  {row.tournamentId && <button type="button" className="mt-1 text-xs font-bold text-blue-700 hover:underline" onClick={() => onOpenEdition(row.tournamentId!)}>{t('player_area_open_tournament')}</button>}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-black text-slate-950">{row.canestri} {t('points_baskets')}</div>
                                  <div className="text-xs font-bold text-slate-500">{row.soffi} {t('soffi')}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {groupedContributionsBySource.archived.length === 0 ? (
                            <EmptyState icon={<Archive className="h-4 w-4" />} title={t('players_no_archive_rows_title')} body={t('players_no_archive_rows_body')} />
                          ) : null}
                        </div>
                      </div>

                      <div className={`${subCardClass} border-violet-200 bg-violet-50/60 p-4`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <PencilLine className="h-4 w-4 text-violet-700" />
                            <div className="text-sm font-black text-violet-900">{t('players_manual_integrations')}</div>
                          </div>
                          <SourceBadge label={t('players_rows_count').replace('{count}', String(groupedContributionsBySource.manual.length))} tone="manual" />
                        </div>
                        <div className="mt-4 space-y-3">
                          {groupedContributionsBySource.manual.map((row) => (
                            <div key={row.id} className="rounded-[18px] border border-violet-100 bg-white px-4 py-3">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-black text-slate-950">{row.sourceLabel || t('players_added_manually')}</div>
                                    <SourceBadge label={t('players_filter_manual')} tone="manual" />
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-slate-500">
                                    {row.teamName ? <>squadra: <span className="font-bold text-slate-700">{row.teamName}</span> · </> : null}
                                    {row.games ? <>partite: <span className="font-bold text-slate-700">{row.games}</span> · </> : null}
                                    <span className="font-bold text-violet-700">{t('players_added_manually')}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-black text-slate-950">{row.canestri} can</div>
                                  <div className="text-xs font-bold text-slate-500">{row.soffi} soffi</div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {groupedContributionsBySource.manual.length === 0 ? (
                            <EmptyState icon={<PencilLine className="h-4 w-4" />} title={t('players_no_manual_rows_title')} body={t('players_no_manual_rows_body')} />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </PlayerSection>

                  <PlayerSection
                    icon={<Link2 className="h-5 w-5" />}
                    title={t('players_aliases_label')}
                    count={selectedProfile.aliases.length}
                  >
                    <p className="font-bold text-sm text-slate-700">{t('edition_also_known_as')}</p>
                    <ul className="divide-y divide-slate-100">
                      {selectedProfile.aliases.map(aliasRow => (
                        <li key={aliasRow.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0 break-words text-sm font-bold capitalize">{aliasRow.otherLabel}</span>
                          <button type="button" onClick={() => setAliasDeleteTarget({ alias: aliasRow, impact: getAliasRemovalImpact(state, aliasRow.fromKey) })} className={dangerButtonClass}>
                            <Unlink2 className="h-4 w-4" />{t('players_remove_alias')}
                          </button>
                        </li>
                      ))}
                      {selectedProfile.aliases.length === 0 && <li className="py-2 text-sm text-slate-500">—</li>}
                    </ul>
                    <button type="button" className={secondaryButtonClass} onClick={() => onLinkName(selectedProfile)}>
                      <Link2 className="h-4 w-4" />{t('edition_link_name')}
                    </button>
                  </PlayerSection>
                  <details className="rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer font-bold">{t('players_fix_profile_title')}</summary>
                    <div className="mt-3">
                      <div className={subCardClass + ' p-4'}>

                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {t('edition_player_edit_hint')}
                        </div>
                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('players_correct_name')}</div>
                            <input value={profileDraftName} onChange={(event) => setProfileDraftName(event.target.value)} className={inputBase} placeholder={t('players_name_placeholder')} />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('players_birth_date')}</div>
                            <BirthDateInput value={profileDraftBirthDate} onChange={setProfileDraftBirthDate} className={inputBase} placeholder={t('players_birth_date_placeholder')} ariaLabel={t('players_profile_birthdate_aria')} />
                          </label>
                          {profileUpdateMeta ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Iscritti live</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">{profileUpdateMeta.registeredSlots}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Torneo live</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">{profileUpdateMeta.liveTournamentSlots}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Storico squadre</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">{profileUpdateMeta.archivedTeamSlots}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Righe statistiche</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">{profileUpdateMeta.contributionRows}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Titoli</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">{profileUpdateMeta.titleRows}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Alias attivi</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">{profileUpdateMeta.aliasCount}</div>
                                </div>
                              </div>

                              {!profileUpdateMeta.nextName ? (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-800">
                                  Inserisci il nome corretto del giocatore per poter salvare.
                                </div>
                              ) : !profileUpdateMeta.hasChanges ? (
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700">
                                  Nessuna modifica effettiva: nome e data coincidono con il profilo attuale.
                                </div>
                              ) : profileUpdateMeta.mergeTarget ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-900">
                                  Questa correzione si accorperà al profilo <span className="font-black">{profileUpdateMeta.targetLabel}</span>.
                                </div>
                              ) : (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold text-emerald-900">
                                  Questa correzione manterrà separato il profilo dal resto dei dati: le occorrenze sopra verranno aggiornate sul giocatore corretto in live, referti, classifica, storico e Hall of Fame.
                                </div>
                              )}
                            </div>
                          ) : null}
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={applyProfileUpdate} disabled={!selectedProfile || !profileUpdateMeta?.nextName || !profileUpdateMeta?.hasChanges} className={primaryButtonClass}>
                              <CheckCircle2 className="h-4 w-4" />
                              Salva correzione profilo
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                  <details className="rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer font-bold">{t('edition_technical_details')}</summary>
                    <p className="mt-2 break-all text-xs text-slate-600">playerId <code>{selectedProfile.playerId}</code></p>
                    <ul className="mt-2 space-y-1 break-all text-xs text-slate-600">
                      {selectedProfile.titles.map(row => <li key={row.id}>{row.tournamentName} · tournamentId <code>{row.tournamentId}</code></li>)}
                      {selectedProfile.contributions.filter(row => row.tournamentId || row.matchId).map(row => <li key={row.id}>{row.tournamentName} · <code>{[row.tournamentId, row.matchId].filter(Boolean).join(' · ')}</code></li>)}
                    </ul>
                  </details>
                </>
              )}
            </div>
      </div>

      <AdminDataConfirmModal
        open={!!titleDeleteTarget}
        tone="danger"
        title={t('players_confirm_delete_title_title')}
        description={t('players_confirm_delete_title_desc')}
        confirmLabel={t('players_delete_title')}
        onClose={() => setTitleDeleteTarget(null)}
        onConfirm={confirmDeleteTitle}
        summaryItems={
          titleDeleteTarget
            ? [
                { label: t('players_modal_title_label'), value: awardLabelText(titleDeleteTarget.type) },
                { label: t('players_modal_tournament_label'), value: titleDeleteTarget.tournamentName },
                { label: t('year'), value: titleDeleteTarget.year },
                { label: t('players_modal_origin_label'), value: titleDeleteTarget.sourceType === 'manual' ? t('players_filter_manual') : t('players_filter_archived') },
              ]
            : []
        }
      >
        <p>{t('players_confirm_delete_title_body')}</p>
      </AdminDataConfirmModal>

      <AdminDataConfirmModal
        open={!!aliasDeleteTarget}
        tone="warning"
        title={t('players_confirm_remove_alias_title')}
        description={t('players_confirm_remove_alias_desc')}
        confirmLabel={t('players_remove_alias')}
        onClose={() => setAliasDeleteTarget(null)}
        onConfirm={confirmRemoveAlias}
        summaryItems={
          aliasDeleteTarget
            ? [
                { label: t('players_aliases_label'), value: `${aliasDeleteTarget.impact.sourceLabel} → ${aliasDeleteTarget.impact.targetLabel}` },
                { label: t('players_modal_separated_profiles'), value: aliasDeleteTarget.impact.separatedProfiles },
                { label: t('players_modal_contribution_rows'), value: aliasDeleteTarget.impact.affectedContributionRows },
                { label: t('players_modal_title_rows'), value: aliasDeleteTarget.impact.affectedTitleRows },
              ]
            : []
        }
      >
        <p>{t('players_confirm_remove_alias_body')}</p>
      </AdminDataConfirmModal>

      {snackbar ? (
        <div className="fixed bottom-5 right-5 z-[95]" role="status" aria-live="polite">
          <div
            className={`min-w-[300px] max-w-[440px] rounded-2xl border px-4 py-3 shadow-xl shadow-slate-900/10 ${
              snackbar.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/70">
                {snackbar.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </div>
              <div className="text-sm font-black">{snackbar.message}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
