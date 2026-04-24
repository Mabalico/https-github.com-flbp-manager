import React from 'react';
import type { AppState } from '../../../../services/storageService';
import { BirthDateInput } from '../../BirthDateInput';
import { formatBirthDateDisplay, normalizeBirthDateInput } from '../../../../services/playerIdentity';
import {
  PLAYER_APP_CHANGE_EVENT,
  buildPlayerAccountAdminRowFromLive,
  buildPlayerCanonicalIdentity,
  deletePlayerPreviewAccountAdmin,
  listPlayerPreviewAccountsAdminRows,
  updatePlayerPreviewAccountAdmin,
  type PlayerAccountAdminOrigin,
} from '../../../../services/playerAppService';
import {
  applyPlayerAccountAliasSuggestion,
  buildPlayerAccountAliasSuggestions,
  buildPlayerAccountMergeSuggestions,
  buildPlayerRegistrationAliasSuggestions,
  buildPlayerAccountAliasTargetProfilePayload,
  ignorePlayerAccountAliasSuggestion,
  shouldSyncAccountCanonicalAfterAliasMerge,
  type PlayerAccountAliasReason,
  type PlayerAccountMergeReason,
  type PlayerRegistrationAliasSuggestion,
} from '../../../../services/playerAccountAliasSuggestions';
import {
  deleteAdminPlayerAccount,
  grantAdminPlayerAccount,
  playerRequestPasswordReset,
  pullAdminPlayerAccountMergeRequests,
  pullAdminPlayerAccounts,
  pullAdminUserRoles,
  pushAdminPlayerAppProfile,
  revokeAdminPlayerAccount,
  setAdminPlayerAccountMergeRequestStatus,
  type PlayerAccountMergeRequestRow,
} from '../../../../services/supabaseRest';

interface AccountsSubTabProps {
  state: AppState;
  setState: (state: AppState) => void;
  t: (key: string) => string;
}

type AccountFilter = 'all' | PlayerAccountAdminOrigin | 'alias_candidates' | 'merge_requests';

const cardClass = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md';
const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition focus:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

const formatDateTime = (value?: number) => {
  if (!value) return 'ND';
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'ND';
  }
};

const formatRelativeAccess = (value?: number) => {
  if (!value) return 'mai';
  const delta = value - Date.now();
  const minutes = Math.round(delta / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  const years = Math.round(months / 12);
  return rtf.format(years, 'year');
};

const originLabel = (t: AccountsSubTabProps['t'], origin: AccountFilter) => {
  switch (origin) {
    case 'all':
      return t('all');
    case 'in_app':
      return t('data_accounts_origin_in_app');
    case 'google':
      return t('data_accounts_origin_google');
    case 'facebook':
      return t('data_accounts_origin_facebook');
    case 'apple':
      return t('data_accounts_origin_apple');
    case 'alias_candidates':
      return t('data_accounts_filter_alias');
    case 'merge_requests':
      return t('data_accounts_filter_merge_requests');
    default:
      return t('data_accounts_origin_other');
  }
};

const aliasReasonLabel = (t: AccountsSubTabProps['t'], reason: PlayerAccountAliasReason) => {
  switch (reason) {
    case 'same_birthdate':
      return t('data_accounts_alias_reason_same_birthdate');
    case 'exact_name':
      return t('data_accounts_alias_reason_exact_name');
    case 'close_name':
      return t('data_accounts_alias_reason_close_name');
    default:
      return t('data_accounts_alias_reason_existing_stats');
  }
};

const accountMergeReasonLabel = (t: AccountsSubTabProps['t'], reason: PlayerAccountMergeReason) => {
  switch (reason) {
    case 'same_canonical':
      return t('data_accounts_merge_reason_same_canonical');
    case 'same_birthdate':
      return t('data_accounts_merge_reason_same_birthdate');
    case 'exact_name':
      return t('data_accounts_merge_reason_exact_name');
    case 'close_name':
      return t('data_accounts_merge_reason_close_name');
    default:
      return t('data_accounts_merge_reason_same_stats');
  }
};

const mergeRequestStatusLabel = (t: AccountsSubTabProps['t'], status: PlayerAccountMergeRequestRow['status']) => {
  switch (status) {
    case 'resolved':
      return t('data_accounts_merge_status_resolved');
    case 'ignored':
      return t('data_accounts_merge_status_ignored');
    default:
      return t('data_accounts_merge_status_pending');
  }
};

type AccountAdminRow = ReturnType<typeof listPlayerPreviewAccountsAdminRows>[number];
type AccountMergeSuggestion = ReturnType<typeof buildPlayerAccountMergeSuggestions>[number];

interface AccountListGroup {
  id: string;
  primaryRow: AccountAdminRow;
  rows: AccountAdminRow[];
  emails: string[];
  providers: string[];
  providerOrigins: PlayerAccountAdminOrigin[];
  linkedPlayerName: string | null;
  birthDate: string | null;
  canonicalPlayerId: string | null;
  totalTitles: number;
  totalCanestri: number;
  totalSoffi: number;
  hasProfile: boolean;
  isAdmin: boolean;
}

const getAccountGroupId = (row: AccountAdminRow) => {
  const canonicalPlayerId = String(row.canonicalPlayerId || '').trim();
  return canonicalPlayerId ? `canonical:${canonicalPlayerId}` : `account:${row.id}`;
};

const splitLinkedPlayerName = (linkedPlayerName?: string | null) => {
  const parts = String(linkedPlayerName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { firstName: '', lastName: '' };
  }
  return {
    lastName: parts.slice(0, -1).join(' '),
    firstName: parts[parts.length - 1] || '',
  };
};

const groupMatchesMergeRequest = (
  group: AccountListGroup,
  request: PlayerAccountMergeRequestRow
) => {
  const relatedIds = new Set(group.rows.map((row) => row.id));
  const relatedEmails = new Set(
    group.rows.map((row) => row.email)
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const relatedCanonicalIds = new Set(
    group.rows.map((row) => row.canonicalPlayerId)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
  const requesterUserId = String(request.requester_user_id || '').trim();
  const requesterEmail = String(request.requester_email || '').trim().toLowerCase();
  const requesterCanonical = String(request.requester_canonical_player_id || '').trim();
  const candidatePlayerId = String(request.candidate_player_id || '').trim();
  return relatedIds.has(requesterUserId)
    || relatedEmails.has(requesterEmail)
    || relatedCanonicalIds.has(requesterCanonical)
    || relatedCanonicalIds.has(candidatePlayerId);
};

const compareAccountRows = (left: AccountAdminRow, right: AccountAdminRow) => {
  const liveDiff = Number(right.mode === 'live') - Number(left.mode === 'live');
  if (liveDiff) return liveDiff;
  const profileDiff = Number(right.hasProfile) - Number(left.hasProfile);
  if (profileDiff) return profileDiff;
  const adminDiff = Number(right.isAdmin) - Number(left.isAdmin);
  if (adminDiff) return adminDiff;
  const providerDiff = right.providers.length - left.providers.length;
  if (providerDiff) return providerDiff;
  const totalsDiff =
    (right.totalTitles + right.totalCanestri + right.totalSoffi)
    - (left.totalTitles + left.totalCanestri + left.totalSoffi);
  if (totalsDiff) return totalsDiff;
  const loginDiff = (right.lastLoginAt || 0) - (left.lastLoginAt || 0);
  if (loginDiff) return loginDiff;
  return left.email.localeCompare(right.email, 'it', { sensitivity: 'base' });
};

const buildAccountGroups = (rows: AccountAdminRow[]): AccountListGroup[] => {
  const groups = new Map<string, AccountAdminRow[]>();
  rows.forEach((row) => {
    const groupId = getAccountGroupId(row);
    const bucket = groups.get(groupId) || [];
    bucket.push(row);
    groups.set(groupId, bucket);
  });

  return Array.from(groups.entries())
    .map(([id, memberRows]) => {
      const sortedRows = [...memberRows].sort(compareAccountRows);
      const primaryRow = sortedRows[0]!;
      const providers = Array.from(
        new Set(sortedRows.flatMap((row) => row.providers).filter(Boolean))
      );
      const providerOrigins = Array.from(
        new Set(sortedRows.flatMap((row) => row.providerOrigins || [row.origin]))
      ) as PlayerAccountAdminOrigin[];
      const linkedPlayerName = sortedRows
        .map((row) => String(row.linkedPlayerName || '').trim())
        .find(Boolean) || null;
      const birthDate = sortedRows
        .map((row) => String(row.birthDate || '').trim())
        .find(Boolean) || null;
      const canonicalPlayerId = sortedRows
        .map((row) => String(row.canonicalPlayerId || '').trim())
        .find(Boolean) || null;
      return {
        id,
        primaryRow,
        rows: sortedRows,
        emails: sortedRows.map((row) => row.email).filter(Boolean),
        providers,
        providerOrigins,
        linkedPlayerName,
        birthDate,
        canonicalPlayerId,
        totalTitles: Math.max(...sortedRows.map((row) => row.totalTitles), 0),
        totalCanestri: Math.max(...sortedRows.map((row) => row.totalCanestri), 0),
        totalSoffi: Math.max(...sortedRows.map((row) => row.totalSoffi), 0),
        hasProfile: sortedRows.some((row) => row.hasProfile),
        isAdmin: sortedRows.some((row) => row.isAdmin),
      } satisfies AccountListGroup;
    })
    .sort((left, right) => compareAccountRows(left.primaryRow, right.primaryRow));
};

const mergeAccountSuggestions = (
  current: AccountMergeSuggestion | undefined,
  next: AccountMergeSuggestion
): AccountMergeSuggestion => {
  if (!current) return next;
  const mergedReasons = Array.from(new Set([...(current.reasons || []), ...(next.reasons || [])]));
  const preferred =
    next.confidence === 'high' && current.confidence !== 'high'
      ? next
      : next.reasons.length > current.reasons.length
        ? next
        : current;
  return {
    ...preferred,
    reasons: mergedReasons,
  };
};

export const AccountsSubTab: React.FC<AccountsSubTabProps> = ({ state, setState, t }) => {
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [remoteRows, setRemoteRows] = React.useState<ReturnType<typeof listPlayerPreviewAccountsAdminRows>>([]);
  const [remoteMergeRequests, setRemoteMergeRequests] = React.useState<PlayerAccountMergeRequestRow[]>([]);
  const [remoteStatus, setRemoteStatus] = React.useState<'idle' | 'loading' | 'ready' | 'backend_pending' | 'auth_expired' | 'unavailable'>('idle');
  const [remoteError, setRemoteError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<AccountFilter>('all');
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [birthDate, setBirthDate] = React.useState('');
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  React.useEffect(() => {
    const handler = () => setRefreshNonce((value) => value + 1);
    window.addEventListener('storage', handler);
    window.addEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(PLAYER_APP_CHANGE_EVENT, handler as EventListener);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadRemoteRows = async () => {
      setRemoteStatus('loading');
      try {
        const liveRows = await pullAdminPlayerAccounts();
        if (cancelled) return;

        // Show the account catalog as soon as the primary RPC returns; roles
        // and merge requests are useful enrichments but should not keep the tab empty.
        setRemoteRows(
          liveRows.map((row) =>
            buildPlayerAccountAdminRowFromLive(state, {
              ...row,
              is_admin: false,
            })
          )
        );
        setRemoteStatus('ready');

        const [rolesResult, mergeRequestsResult] = await Promise.allSettled([
          pullAdminUserRoles(),
          pullAdminPlayerAccountMergeRequests('pending'),
        ]);
        if (cancelled) return;

        const liveAdminIds = rolesResult.status === 'fulfilled'
          ? new Set(
              rolesResult.value
                .map((row) => String(row.user_id || '').trim())
                .filter(Boolean)
            )
          : new Set<string>();
        const mergeRequests = mergeRequestsResult.status === 'fulfilled'
          ? mergeRequestsResult.value
          : [];
        const rolesMessage = rolesResult.status === 'rejected'
          ? String(rolesResult.reason?.message || rolesResult.reason || '').trim()
          : '';
        const mergeRequestsMessage = mergeRequestsResult.status === 'rejected'
          ? String(mergeRequestsResult.reason?.message || mergeRequestsResult.reason || '').trim()
          : '';

        setRemoteRows(
          liveRows.map((row) =>
            buildPlayerAccountAdminRowFromLive(state, {
              ...row,
              is_admin: liveAdminIds.has(String(row.user_id || '').trim()),
            })
          )
        );
        setRemoteMergeRequests(mergeRequests);
        setRemoteError([rolesMessage, mergeRequestsMessage].filter(Boolean).join(' · ') || null);
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message || error || '').trim();
        setRemoteRows([]);
        setRemoteMergeRequests([]);
        if (/invalid jwt|jwt expired|sessione admin assente o scaduta|sessione admin/i.test(message)) {
          setRemoteStatus('auth_expired');
          setRemoteError(null);
        } else if (
          /flbp_admin_list_player_accounts|player_app_profiles|player_app_devices|player_app_calls|player_account_merge_requests|function .*flbp_admin_list_player_accounts|relation .*player_app_|relation .*player_account_merge_requests/i.test(message)
        ) {
          setRemoteStatus('backend_pending');
          setRemoteError(message || null);
        } else {
          setRemoteStatus('unavailable');
          setRemoteError(message || null);
        }
      }
    };
    void loadRemoteRows();
    return () => {
      cancelled = true;
    };
  }, [state, refreshNonce]);

  const rows = React.useMemo(
    () => [...remoteRows, ...listPlayerPreviewAccountsAdminRows(state)],
    [remoteRows, state]
  );

  const accountGroups = React.useMemo(() => buildAccountGroups(rows), [rows]);

  const accountMergeSuggestionMap = React.useMemo(
    () => new Map(rows.map((row) => [row.id, buildPlayerAccountMergeSuggestions(rows, row)])),
    [rows]
  );

  const historicalAliasSuggestionMap = React.useMemo(
    () =>
      new Map<string, PlayerRegistrationAliasSuggestion[]>(
        rows.map((row) => {
          const { firstName, lastName } = splitLinkedPlayerName(row.linkedPlayerName);
          const canonicalPlayerId = String(row.canonicalPlayerId || '').trim();
          if (!firstName || !lastName) {
            return [row.id, []];
          }
          const suggestions = buildPlayerRegistrationAliasSuggestions(state, {
            firstName,
            lastName,
            birthDate: row.birthDate || '',
          })
            .filter((suggestion) => suggestion.candidatePlayerId !== canonicalPlayerId)
            .slice(0, 6);
          return [row.id, suggestions];
        })
      ),
    [rows, state]
  );

  const aliasCandidateIds = React.useMemo(
    () => new Set(
      accountGroups
        .filter((group) => {
          const memberIds = new Set(group.rows.map((row) => row.id));
          const hasAccountMergeSuggestion = group.rows.some((row) =>
            (accountMergeSuggestionMap.get(row.id) || []).some((suggestion) => !memberIds.has(suggestion.candidateAccountId))
          );
          const hasHistoricalAliasSuggestion = group.rows.some(
            (row) => (historicalAliasSuggestionMap.get(row.id) || []).length > 0
          );
          return hasAccountMergeSuggestion || hasHistoricalAliasSuggestion;
        })
        .map((group) => group.id)
    ),
    [accountGroups, accountMergeSuggestionMap, historicalAliasSuggestionMap]
  );

  const mergeRequestGroupIds = React.useMemo(
    () => new Set(
      accountGroups
        .filter((group) => remoteMergeRequests.some((request) => groupMatchesMergeRequest(group, request)))
        .map((group) => group.id)
    ),
    [accountGroups, remoteMergeRequests]
  );

  const filteredGroups = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accountGroups.filter((group) => {
      if (filter === 'alias_candidates' && !aliasCandidateIds.has(group.id)) return false;
      if (filter === 'merge_requests' && !mergeRequestGroupIds.has(group.id)) return false;
      if (filter !== 'all' && filter !== 'alias_candidates' && filter !== 'merge_requests' && !(group.providerOrigins || [group.primaryRow.origin]).includes(filter)) return false;
      if (!needle) return true;
      const haystack = [
        group.emails.join(' '),
        group.linkedPlayerName || '',
        group.providers.join(' '),
        group.birthDate || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [accountGroups, filter, search, aliasCandidateIds, mergeRequestGroupIds]);

  const selectedGroup = React.useMemo(() => {
    if (!filteredGroups.length) return null;
    return filteredGroups.find((group) => group.id === selectedId) || filteredGroups[0] || null;
  }, [filteredGroups, selectedId]);

  const selectedRow = React.useMemo(() => selectedGroup?.primaryRow || null, [selectedGroup]);
  const selectedLiveRows = React.useMemo(
    () => (selectedGroup?.rows || []).filter((row) => row.mode === 'live'),
    [selectedGroup]
  );
  const selectedLiveAdminCount = React.useMemo(
    () => selectedLiveRows.filter((row) => row.isAdmin).length,
    [selectedLiveRows]
  );
  const canManageSelectedAdminRole = selectedLiveRows.length > 0;
  const allSelectedLiveRowsAreAdmin =
    canManageSelectedAdminRole && selectedLiveRows.every((row) => row.isAdmin);
  const selectedAdminStatusLabel = React.useMemo(() => {
    if (!canManageSelectedAdminRole) {
      return selectedRow?.isAdmin
        ? t('data_accounts_admin_role_yes')
        : t('data_accounts_admin_role_no');
    }
    if (allSelectedLiveRowsAreAdmin) {
      return selectedLiveRows.length > 1
        ? `${t('data_accounts_admin_role_yes')} (${selectedLiveAdminCount}/${selectedLiveRows.length} ${t('data_accounts_live_accounts_suffix')})`
        : t('data_accounts_admin_role_yes');
    }
    if (!selectedLiveAdminCount) {
      return selectedLiveRows.length > 1
        ? `${t('data_accounts_admin_role_no')} (0/${selectedLiveRows.length} ${t('data_accounts_live_accounts_suffix')})`
        : t('data_accounts_admin_role_no');
    }
    return `${t('data_accounts_admin_role_partial')} (${selectedLiveAdminCount}/${selectedLiveRows.length} ${t('data_accounts_live_accounts_suffix')})`;
  }, [
    allSelectedLiveRowsAreAdmin,
    canManageSelectedAdminRole,
    selectedLiveAdminCount,
    selectedLiveRows.length,
    selectedRow?.isAdmin,
    t,
  ]);

  React.useEffect(() => {
    if (!selectedGroup) {
      setSelectedId('');
      return;
    }
    if (selectedGroup.id !== selectedId) {
      setSelectedId(selectedGroup.id);
    }
  }, [selectedGroup, selectedId]);

  React.useEffect(() => {
    if (!selectedRow) {
      setEmail('');
      setFirstName('');
      setLastName('');
      setBirthDate('');
      return;
    }
    setEmail(selectedRow.email);
    const parts = String(selectedRow.linkedPlayerName || '').trim().split(/\s+/);
    if (parts.length >= 2) {
      setLastName(parts.slice(0, -1).join(' '));
      setFirstName(parts[parts.length - 1] || '');
    } else {
      setLastName('');
      setFirstName('');
    }
    setBirthDate(formatBirthDateDisplay(selectedRow.birthDate || ''));
    setFeedback(null);
  }, [selectedRow?.id, selectedRow?.email, selectedRow?.linkedPlayerName, selectedRow?.birthDate]);

  const aliasSuggestions = React.useMemo(() => {
    if (!selectedRow || !selectedRow.canonicalPlayerId || !selectedRow.linkedPlayerName) return [];
    return buildPlayerAccountAliasSuggestions(state, selectedRow).slice(0, 6);
  }, [selectedRow, state]);

  const historicalAliasSuggestions = React.useMemo(() => {
    if (!selectedGroup) return [];
    const actionableCandidateIds = new Set(aliasSuggestions.map((suggestion) => suggestion.candidatePlayerId));
    const collected = new Map<string, PlayerRegistrationAliasSuggestion>();
    selectedGroup.rows.forEach((row) => {
      (historicalAliasSuggestionMap.get(row.id) || []).forEach((suggestion) => {
        if (actionableCandidateIds.has(suggestion.candidatePlayerId)) return;
        if (!collected.has(suggestion.candidatePlayerId)) {
          collected.set(suggestion.candidatePlayerId, suggestion);
        }
      });
    });
    return Array.from(collected.values()).slice(0, 6);
  }, [aliasSuggestions, historicalAliasSuggestionMap, selectedGroup]);

  const accountMergeSuggestions = React.useMemo(
    () => {
      if (!selectedGroup) return [];
      const memberIds = new Set(selectedGroup.rows.map((row) => row.id));
      const suggestions = new Map<string, AccountMergeSuggestion>();
      selectedGroup.rows.forEach((row) => {
        (accountMergeSuggestionMap.get(row.id) || []).forEach((suggestion) => {
          if (memberIds.has(suggestion.candidateAccountId)) return;
          suggestions.set(
            suggestion.candidateAccountId,
            mergeAccountSuggestions(suggestions.get(suggestion.candidateAccountId), suggestion)
          );
        });
      });
      return Array.from(suggestions.values()).slice(0, 6);
    },
    [selectedGroup, accountMergeSuggestionMap]
  );

  const relatedAccountRows = React.useMemo(() => {
    if (!selectedGroup || !selectedRow) return [];
    return selectedGroup.rows.filter((row) => row.id !== selectedRow.id);
  }, [selectedGroup, selectedRow]);

  const emailCards = React.useMemo(() => {
    if (!selectedRow) return [];
    const deduped = new Map<string, { key: string; email: string; providers: string; editable: boolean; mode: 'preview' | 'live'; isAdmin: boolean }>();
    const pushCard = (row: (typeof rows)[number], editable: boolean) => {
      const emailValue = String(row.email || '').trim();
      if (!emailValue) return;
      const key = `${row.id}:${emailValue}`;
      if (deduped.has(key)) return;
      deduped.set(key, {
        key,
        email: emailValue,
        providers: row.providers.join(' • '),
        editable,
        mode: row.mode,
        isAdmin: row.isAdmin,
      });
    };
    pushCard(selectedRow, selectedRow.mode !== 'live');
    relatedAccountRows.forEach((row) => pushCard(row, false));
    return Array.from(deduped.values());
  }, [relatedAccountRows, selectedRow]);

  const selectedMergeRequests = React.useMemo(() => {
    if (!selectedRow || !selectedGroup) return [];
    return remoteMergeRequests.filter((request) => groupMatchesMergeRequest(selectedGroup, request));
  }, [selectedGroup, remoteMergeRequests, selectedRow]);

  const saveSelected = async () => {
    if (!selectedRow || !selectedGroup) return;
    try {
      const identity = buildPlayerCanonicalIdentity(
        firstName,
        lastName,
        birthDate,
        selectedGroup.canonicalPlayerId || selectedRow.canonicalPlayerId || null
      );
      for (const row of selectedGroup.rows) {
        if (row.mode === 'live') {
          await pushAdminPlayerAppProfile({
            userId: row.id,
            firstName: identity.firstName,
            lastName: identity.lastName,
            birthDate: identity.birthDate,
            canonicalPlayerId: identity.canonicalPlayerId,
            canonicalPlayerName: identity.canonicalPlayerName,
          });
        } else {
          updatePlayerPreviewAccountAdmin(row.id, {
            email: row.id === selectedRow.id ? email : row.email,
            firstName: identity.firstName,
            lastName: identity.lastName,
            birthDate: identity.birthDate,
          });
        }
      }
      setFeedback({
        tone: 'success',
        message: selectedGroup.rows.length > 1
          ? 'Profilo aggiornato e riallineato su tutti gli account collegati.'
          : t('data_accounts_save_done'),
      });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const resetSelectedPassword = async () => {
    if (!selectedRow?.hasPasswordRecovery || !selectedRow.email) return;
    try {
      await playerRequestPasswordReset(selectedRow.email, window.location.origin);
      setFeedback({ tone: 'success', message: t('data_accounts_reset_password_sent') });
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('data_accounts_reset_password_disabled')) });
    }
  };

  const deleteSelected = async () => {
    if (!selectedRow) return;
    const confirmed = window.confirm(
      selectedRow.mode === 'live'
        ? t('data_accounts_delete_confirm_live').replace('{email}', selectedRow.email || selectedRow.id)
        : t('data_accounts_delete_confirm_preview').replace('{email}', selectedRow.email || selectedRow.id)
    );
    if (!confirmed) return;

    try {
      if (selectedRow.mode === 'live') {
        await deleteAdminPlayerAccount({ userId: selectedRow.id });
      } else {
        deletePlayerPreviewAccountAdmin(selectedRow.id);
      }
      setFeedback({ tone: 'success', message: t('data_accounts_delete_done') });
      setSelectedId('');
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const toggleSelectedAdminRole = async () => {
    if (!selectedRow || !selectedGroup || !canManageSelectedAdminRole) return;
    const liveRowsToUpdate = allSelectedLiveRowsAreAdmin
      ? selectedLiveRows
      : selectedLiveRows.filter((row) => !row.isAdmin);
    if (!liveRowsToUpdate.length) {
      setFeedback({
        tone: 'success',
        message: t('data_accounts_admin_already_aligned'),
      });
      return;
    }
    if (liveRowsToUpdate.some((row) => !String(row.email || '').trim() && !String(row.id || '').trim())) {
      setFeedback({ tone: 'error', message: t('data_accounts_admin_missing_email') });
      return;
    }

    const confirmTarget =
      selectedGroup.rows.length > 1
        ? selectedGroup.linkedPlayerName || selectedRow.email || selectedRow.id
        : selectedRow.email || selectedRow.id;
    const confirmed = window.confirm(selectedGroup.rows.length > 1
      ? allSelectedLiveRowsAreAdmin
        ? t('data_accounts_admin_revoke_all_confirm').replace('{target}', confirmTarget)
        : t('data_accounts_admin_grant_all_confirm').replace('{target}', confirmTarget)
      : (
          allSelectedLiveRowsAreAdmin
            ? t('data_accounts_admin_revoke_confirm')
            : t('data_accounts_admin_grant_confirm')
        ).replace('{email}', confirmTarget)
    );
    if (!confirmed) return;

    try {
      if (allSelectedLiveRowsAreAdmin) {
        for (const row of liveRowsToUpdate) {
          await revokeAdminPlayerAccount({ userId: row.id, email: row.email });
        }
        setFeedback({
          tone: 'success',
          message: selectedGroup.rows.length > 1
            ? t('data_accounts_admin_revoke_all_done')
            : t('data_accounts_admin_revoke_done'),
        });
      } else {
        for (const row of liveRowsToUpdate) {
          await grantAdminPlayerAccount({ userId: row.id, email: row.email });
        }
        setFeedback({
          tone: 'success',
          message: selectedGroup.rows.length > 1
            ? t('data_accounts_admin_grant_all_done')
            : t('data_accounts_admin_grant_done'),
        });
      }
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const applyIdentityToAccount = async (
    row: (typeof rows)[number],
    canonicalPlayerName: string,
    birthDateValue: string
  ) => {
    const payload = buildPlayerAccountAliasTargetProfilePayload(canonicalPlayerName, birthDateValue);
    if (!payload.firstName || !payload.lastName || !payload.birthDate) {
      throw new Error('Per integrare gli account serve un profilo con nome, cognome e data di nascita validi.');
    }
    if (row.mode === 'live') {
      await pushAdminPlayerAppProfile({
        userId: row.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        birthDate: payload.birthDate,
        canonicalPlayerId: payload.canonicalPlayerId,
        canonicalPlayerName: payload.canonicalPlayerName,
      });
      return;
    }
    updatePlayerPreviewAccountAdmin(row.id, {
      email: row.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      birthDate: payload.birthDate,
    });
  };

  const integrateSelectedWithAccount = async (candidateAccountId: string) => {
    if (!selectedRow) return;
    const candidateRow = rows.find((row) => row.id === candidateAccountId);
    if (!candidateRow) {
      setFeedback({ tone: 'error', message: 'Account candidato non trovato.' });
      return;
    }

    try {
      const selectedIdentity = {
        canonicalPlayerName: String(selectedRow.linkedPlayerName || '').trim(),
        birthDate: normalizeBirthDateInput(selectedRow.birthDate || undefined) || '',
        score:
          (selectedRow.linkedPlayerName ? 3 : 0)
          + (normalizeBirthDateInput(selectedRow.birthDate || undefined) ? 3 : 0)
          + (selectedRow.canonicalPlayerId ? 2 : 0)
          + (selectedRow.hasProfile ? 1 : 0)
          + (selectedRow.totalTitles > 0 || selectedRow.totalCanestri > 0 || selectedRow.totalSoffi > 0 ? 1 : 0),
      };
      const candidateIdentity = {
        canonicalPlayerName: String(candidateRow.linkedPlayerName || '').trim(),
        birthDate: normalizeBirthDateInput(candidateRow.birthDate || undefined) || '',
        score:
          (candidateRow.linkedPlayerName ? 3 : 0)
          + (normalizeBirthDateInput(candidateRow.birthDate || undefined) ? 3 : 0)
          + (candidateRow.canonicalPlayerId ? 2 : 0)
          + (candidateRow.hasProfile ? 1 : 0)
          + (candidateRow.totalTitles > 0 || candidateRow.totalCanestri > 0 || candidateRow.totalSoffi > 0 ? 1 : 0),
      };

      const master =
        candidateIdentity.score > selectedIdentity.score
          ? candidateIdentity
          : selectedIdentity.score > candidateIdentity.score
            ? selectedIdentity
            : candidateRow.totalTitles + candidateRow.totalCanestri + candidateRow.totalSoffi
                > selectedRow.totalTitles + selectedRow.totalCanestri + selectedRow.totalSoffi
              ? candidateIdentity
              : selectedIdentity;

      if (!master.canonicalPlayerName || !master.birthDate) {
        throw new Error('Per integrare due account serve almeno un profilo con giocatore collegato e data di nascita valida.');
      }

      const currentSelectedBirthDate = normalizeBirthDateInput(selectedRow.birthDate || undefined) || '';
      const currentCandidateBirthDate = normalizeBirthDateInput(candidateRow.birthDate || undefined) || '';
      const selectedAligned =
        String(selectedRow.linkedPlayerName || '').trim() === master.canonicalPlayerName
        && currentSelectedBirthDate === master.birthDate;
      const candidateAligned =
        String(candidateRow.linkedPlayerName || '').trim() === master.canonicalPlayerName
        && currentCandidateBirthDate === master.birthDate;

      if (!selectedAligned) {
        await applyIdentityToAccount(selectedRow, master.canonicalPlayerName, master.birthDate);
      }
      if (!candidateAligned) {
        await applyIdentityToAccount(candidateRow, master.canonicalPlayerName, master.birthDate);
      }

      const liveRowsToPromote = [selectedRow, candidateRow].filter(
        (row) => row.mode === 'live' && !row.isAdmin
      );
      const shouldPropagateAdminRole =
        [selectedRow, candidateRow].some((row) => row.mode === 'live' && row.isAdmin)
        && liveRowsToPromote.length > 0;
      if (shouldPropagateAdminRole) {
        for (const row of liveRowsToPromote) {
          await grantAdminPlayerAccount({ userId: row.id, email: row.email });
        }
      }

      const masterPayload = buildPlayerAccountAliasTargetProfilePayload(master.canonicalPlayerName, master.birthDate);
      const relatedIds = new Set([selectedRow.id, candidateRow.id]);
      const relatedEmails = new Set(
        [selectedRow.email, candidateRow.email]
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const relevantRequestIds = remoteMergeRequests
        .filter((request) => {
          const requesterUserId = String(request.requester_user_id || '').trim();
          const requesterEmail = String(request.requester_email || '').trim().toLowerCase();
          const candidatePlayerId = String(request.candidate_player_id || '').trim();
          const requesterCanonicalId = String(request.requester_canonical_player_id || '').trim();
          return relatedIds.has(requesterUserId)
            || relatedEmails.has(requesterEmail)
            || candidatePlayerId === masterPayload.canonicalPlayerId
            || requesterCanonicalId === masterPayload.canonicalPlayerId;
        })
        .map((request) => request.id);

      if (relevantRequestIds.length) {
        await Promise.allSettled(
          relevantRequestIds.map((requestId) =>
            setAdminPlayerAccountMergeRequestStatus({ requestId, status: 'resolved' })
          )
        );
      }

      setFeedback({
        tone: 'success',
        message: selectedAligned && candidateAligned
          ? t('data_accounts_merge_already_integrated')
          : relevantRequestIds.length
            ? shouldPropagateAdminRole
              ? t('data_accounts_merge_integrated_admin_requests_done')
              : t('data_accounts_merge_integrated_requests_done')
            : shouldPropagateAdminRole
              ? t('data_accounts_merge_integrated_admin_done')
              : t('data_accounts_merge_integrated_done'),
      });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const updateMergeRequestStatus = async (
    requestId: string,
    status: 'resolved' | 'ignored'
  ) => {
    try {
      await setAdminPlayerAccountMergeRequestStatus({ requestId, status });
      setFeedback({
        tone: 'success',
        message: status === 'resolved'
          ? t('data_accounts_merge_request_resolved_done')
          : t('data_accounts_merge_request_ignored_done'),
      });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const ignoreAliasSuggestion = (suggestionId: string) => {
    setState(ignorePlayerAccountAliasSuggestion(state, { id: suggestionId }));
    setFeedback({ tone: 'success', message: t('data_accounts_alias_ignore_done') });
  };

  const mergeAliasSuggestion = async (suggestionId: string) => {
    if (!selectedRow) return;
    const suggestion = aliasSuggestions.find((row) => row.id === suggestionId);
    if (!suggestion) return;

    const confirmMessage =
      suggestion.mergeMode === 'candidate_into_account'
        ? t('data_accounts_alias_merge_confirm_candidate_into_account')
        : suggestion.mergeMode === 'account_into_candidate'
          ? t('data_accounts_alias_merge_confirm_account_into_candidate')
          : t('data_accounts_alias_merge_confirm_alias_candidate_into_account');

    const confirmed = window.confirm(
      confirmMessage
        .replace('{account}', selectedRow.linkedPlayerName || selectedRow.email || selectedRow.id)
        .replace('{candidate}', suggestion.candidateDisplayName)
    );
    if (!confirmed) return;

    try {
      const mergeResult = applyPlayerAccountAliasSuggestion(state, selectedRow, suggestion);

      if (shouldSyncAccountCanonicalAfterAliasMerge(suggestion)) {
        const nextPayload = buildPlayerAccountAliasTargetProfilePayload(
          mergeResult.nextCanonicalPlayerName,
          mergeResult.nextBirthDate
        );
        if (selectedRow.mode === 'live') {
          await pushAdminPlayerAppProfile({
            userId: selectedRow.id,
            firstName: nextPayload.firstName,
            lastName: nextPayload.lastName,
            birthDate: nextPayload.birthDate,
            canonicalPlayerId: mergeResult.nextCanonicalPlayerId,
            canonicalPlayerName: mergeResult.nextCanonicalPlayerName,
          });
        } else {
          await updatePlayerPreviewAccountAdmin(selectedRow.id, {
            email: selectedRow.email,
            firstName: nextPayload.firstName,
            lastName: nextPayload.lastName,
            birthDate: nextPayload.birthDate || '',
          });
        }
      }

      setState(mergeResult.state);
      setFeedback({ tone: 'success', message: t('data_accounts_alias_merge_done') });
      setRefreshNonce((value) => value + 1);
    } catch (error: any) {
      setFeedback({ tone: 'error', message: String(error?.message || error || t('player_area_preview_error')) });
    }
  };

  const canDeleteSelected = !!selectedRow && !(selectedRow.mode === 'live' && selectedRow.isAdmin);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-base font-black text-slate-950">{t('data_accounts_title')}</div>
            <div className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{t('data_accounts_helper')}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 max-w-xl">
            {t('data_accounts_admin_email_todo')}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            remoteStatus === 'ready'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : remoteStatus === 'loading'
                ? 'border-slate-200 bg-slate-50 text-slate-700'
                : remoteStatus === 'auth_expired'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            {remoteStatus === 'ready'
              ? t('data_accounts_live_catalog_ready')
              : remoteStatus === 'loading'
                ? t('loading')
                : remoteStatus === 'auth_expired'
                  ? t('data_accounts_live_catalog_session_expired')
                  : t('data_accounts_live_catalog_pending')}
          </div>
          {remoteError ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 max-w-3xl">
              {remoteError}
            </div>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div className={`${cardClass} ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          <div className="text-sm font-bold">{feedback.message}</div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className={`${cardClass} space-y-4`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black text-slate-900">{t('data_accounts_list_title')}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">
                {t('data_accounts_list_count').replace('{count}', String(filteredGroups.length))}
              </div>
            </div>
            <div className="text-xs font-bold text-slate-500">
              {remoteStatus === 'ready' ? t('data_accounts_mode_live') : remoteStatus === 'auth_expired' ? t('db_no_session') : t('data_accounts_preview_only')}
            </div>
          </div>

          <div className="space-y-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass}
              placeholder={t('data_accounts_search_placeholder')}
            />

            <div className="flex gap-2 flex-wrap">
              {(['all', 'in_app', 'google', 'facebook', 'apple', 'other'] as AccountFilter[]).map((option) => {
                const active = filter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {originLabel(t, option)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setFilter('alias_candidates')}
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  filter === 'alias_candidates'
                    ? 'border-rose-700 bg-rose-700 text-white'
                    : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                {`${originLabel(t, 'alias_candidates')} ${aliasCandidateIds.size}`}
              </button>
              <button
                type="button"
                onClick={() => setFilter('merge_requests')}
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  filter === 'merge_requests'
                    ? 'border-amber-700 bg-amber-700 text-white'
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {`${originLabel(t, 'merge_requests')} ${mergeRequestGroupIds.size}`}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredGroups.length ? (
              filteredGroups.map((group) => {
                const active = selectedGroup?.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedId(group.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-blue-300 bg-blue-50 shadow-sm shadow-blue-100'
                        : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        {group.rows.map((row, index) => (
                          <div
                            key={`${group.id}:${row.id}:${row.email || index}`}
                            className={`rounded-2xl border px-3 py-2 ${
                              index === 0 && group.rows.length > 1
                                ? 'border-blue-200 bg-white/90'
                                : 'border-slate-200 bg-white/70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-950">{row.email}</div>
                                <div className="mt-1 text-xs font-semibold text-slate-500">
                                  {row.providers.join(' • ')} • {row.mode === 'preview' ? t('data_accounts_mode_preview') : t('data_accounts_mode_live')}
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                {row.isAdmin ? (
                                  <div className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700">
                                    {t('data_accounts_admin_badge')}
                                  </div>
                                ) : null}
                                <div className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700">
                                  {row.hasProfile ? t('data_accounts_linked_player') : t('data_accounts_profile_missing')}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <div className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700">
                    {group.rows.length === 1
                      ? t('data_accounts_linked_accounts_count_one')
                      : t('data_accounts_linked_accounts_count_many').replace('{count}', String(group.rows.length))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 md:grid-cols-3">
                      <div>{t('data_accounts_linked_player')}: {group.linkedPlayerName || t('data_accounts_no_player')}</div>
                      <div>{t('titles')}: {group.totalTitles}</div>
                      <div>{t('scores_label')}: {group.totalCanestri}</div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-600">
                {t('data_accounts_empty')}
              </div>
            )}
          </div>
        </div>

        <div className={`${cardClass} space-y-4`}>
          <div>
            <div className="text-sm font-black text-slate-900">{t('data_accounts_detail_title')}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{t('data_accounts_detail_desc')}</div>
          </div>

          {selectedRow ? (
            <>
              <div className="space-y-3">
                {emailCards.map((emailCard, index) => (
                  <div key={emailCard.key} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
                    <div>
                      <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                        {index === 0 ? t('player_area_email') : 'Email collegata'}
                      </div>
                      <input
                        value={index === 0 ? email : emailCard.email}
                        onChange={index === 0 ? (event) => setEmail(event.target.value) : undefined}
                        className={inputClass}
                        disabled={!emailCard.editable}
                        title={!emailCard.editable ? t('data_accounts_live_email_readonly') : undefined}
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('data_accounts_provider_label')}</div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    {emailCard.providers || t('data_accounts_linked_account_label')}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {emailCard.mode === 'live' ? t('data_accounts_mode_live') : t('data_accounts_mode_preview')}
                        </div>
                        {emailCard.isAdmin ? (
                          <div className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                            {t('data_accounts_admin_badge')}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('name_label')}</div>
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={inputClass} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_last_name')}</div>
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date')}</div>
                <BirthDateInput
                  value={birthDate}
                  onChange={setBirthDate}
                  className={inputClass}
                  placeholder="gg/mm/aaaa"
                  ariaLabel={t('birth_date')}
                  calendarTitle={t('player_area_open_calendar')}
                />
              </div>

              <div className="grid gap-3 text-sm font-semibold text-slate-600">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>{t('data_accounts_linked_player')}: <span className="font-black text-slate-900">{selectedGroup?.linkedPlayerName || t('data_accounts_no_player')}</span></div>
                  <div className="mt-1">{t('data_accounts_created')}: <span className="font-black text-slate-900">{formatDateTime(selectedRow.createdAt)}</span></div>
                  <div className="mt-1">
                    {t('data_accounts_last_login')}: <span className="font-black text-slate-900">{formatDateTime(selectedRow.lastLoginAt)}</span>
                    <span className="ml-2 text-xs font-bold text-slate-500">({formatRelativeAccess(selectedRow.lastLoginAt)})</span>
                  </div>
                  <div className="mt-1">Account collegati: <span className="font-black text-slate-900">{selectedGroup?.rows.length || 1}</span></div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>{t('titles')}: <span className="font-black text-slate-900">{selectedGroup?.totalTitles || 0}</span></div>
                  <div className="mt-1">{t('scores_label')}: <span className="font-black text-slate-900">{selectedGroup?.totalCanestri || 0}</span></div>
                  <div className="mt-1">{t('soffi_label')}: <span className="font-black text-slate-900">{selectedGroup?.totalSoffi || 0}</span></div>
                  <div className="mt-1">{t('birth_date')}: <span className="font-black text-slate-900">{formatBirthDateDisplay(selectedGroup?.birthDate || '') || 'ND'}</span></div>
                  <div className="mt-1">{t('data_accounts_admin_role_label')}: <span className={`font-black ${selectedLiveAdminCount > 0 ? 'text-violet-700' : 'text-slate-900'}`}>{selectedAdminStatusLabel}</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-black text-rose-950">{t('data_accounts_merge_requests_title')}</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-rose-900/80">
                      {t('data_accounts_merge_requests_desc')}
                    </div>
                  </div>
                  <div className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-black text-rose-800">
                    {selectedMergeRequests.length}
                  </div>
                </div>

                {selectedMergeRequests.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedMergeRequests.map((request) => (
                      <div key={request.id} className="rounded-2xl border border-rose-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-950">
                              {request.requester_email}
                              {selectedGroup?.rows.some((row) => row.id === request.requester_user_id) ? ` · ${t('data_accounts_linked_account_label')}` : ''}
                            </div>
                            <div className="mt-1 text-xs font-bold text-slate-500">
                              {`${request.requester_last_name} ${request.requester_first_name}`.trim()}
                              {request.requester_birth_date ? ` · ${formatBirthDateDisplay(request.requester_birth_date)}` : ''}
                            </div>
                            <div className="mt-2 text-xs font-bold text-slate-600">
                              {t('data_accounts_merge_candidate_label')}: {request.candidate_player_name}
                              {request.candidate_birth_date ? ` · ${formatBirthDateDisplay(request.candidate_birth_date)}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                request.status === 'resolved'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : request.status === 'ignored'
                                    ? 'border-slate-200 bg-slate-100 text-slate-700'
                                    : 'border-rose-200 bg-rose-50 text-rose-700'
                              }`}>
                                {mergeRequestStatusLabel(t, request.status)}
                              </div>
                              <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-700">
                                {formatDateTime(request.created_at ? Date.parse(request.created_at) : undefined)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {request.comment ? (
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
                            {request.comment}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                            {t('data_accounts_no_user_comment')}
                          </div>
                        )}

                        <div className="mt-4 flex gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void updateMergeRequestStatus(request.id, 'resolved')}
                            className="inline-flex items-center justify-center rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                          >
                            {t('data_accounts_mark_resolved')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateMergeRequestStatus(request.id, 'ignored')}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                          >
                            {t('data_accounts_ignore')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-rose-200 bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                    {t('data_accounts_merge_requests_empty')}
                  </div>
                )}
              </div>

              {selectedRow.mode === 'live' ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-800">
                  {t('data_accounts_live_profile_hint')}
                </div>
              ) : null}

              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-black text-rose-950">{t('data_accounts_possible_integrations_title')}</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-rose-900/80">
                      {t('data_accounts_possible_integrations_desc')}
                    </div>
                  </div>
                  <div className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-black text-rose-800">
                    {accountMergeSuggestions.length}
                  </div>
                </div>

                {accountMergeSuggestions.length ? (
                  <div className="mt-4 space-y-3">
                    {accountMergeSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-2xl border border-rose-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-950">{suggestion.candidateEmail}</div>
                            <div className="mt-1 text-xs font-bold text-slate-500">
                              {suggestion.candidateProviders.join(' • ')} • {suggestion.candidateMode === 'live' ? t('data_accounts_mode_live') : t('data_accounts_mode_preview')}
                            </div>
                            <div className="mt-2 text-xs font-bold text-slate-600">
                              {suggestion.candidateDisplayName}
                              {suggestion.candidateBirthDateLabel !== 'ND' ? ` · ${suggestion.candidateBirthDateLabel}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                suggestion.confidence === 'high'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-100 text-slate-700'
                              }`}>
                                {suggestion.confidence === 'high' ? t('data_accounts_alias_confidence_high') : t('data_accounts_alias_confidence_medium')}
                              </div>
                              {suggestion.reasons.map((reason) => (
                                <div key={reason} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-700">
                                  {accountMergeReasonLabel(t, reason)}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-2 text-right text-[11px] font-black text-slate-600 sm:grid-cols-2">
                            <div>{t('titles')}: <span className="text-slate-950">{suggestion.candidateTotalTitles}</span></div>
                            <div>{t('scores_label')}: <span className="text-slate-950">{suggestion.candidateTotalCanestri}</span></div>
                            <div>{t('soffi_label')}: <span className="text-slate-950">{suggestion.candidateTotalSoffi}</span></div>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void integrateSelectedWithAccount(suggestion.candidateAccountId)}
                            className="inline-flex items-center justify-center rounded-xl border border-rose-600 bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
                          >
                            {t('data_accounts_integrate_account')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-rose-200 bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                    {t('data_accounts_no_compatible_profiles')}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-black text-amber-950">{t('data_accounts_alias_suggestions_title')}</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-amber-900/80">
                      {t('data_accounts_alias_suggestions_desc')}
                    </div>
                  </div>
                  <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-black text-amber-800">
                    {aliasSuggestions.length}
                  </div>
                </div>

                {aliasSuggestions.length ? (
                  <div className="mt-4 space-y-3">
                    {aliasSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-2xl border border-amber-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-950">
                              {suggestion.candidateDisplayName}
                              {suggestion.candidateBirthDateLabel !== 'ND' ? ` · ${suggestion.candidateBirthDateLabel}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                suggestion.confidence === 'high'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-100 text-slate-700'
                              }`}>
                                {suggestion.confidence === 'high'
                                  ? t('data_accounts_alias_confidence_high')
                                  : t('data_accounts_alias_confidence_medium')}
                              </div>
                              {suggestion.reasons.map((reason) => (
                                <div key={reason} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-700">
                                  {aliasReasonLabel(t, reason)}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-2 text-right text-[11px] font-black text-slate-600 sm:grid-cols-2">
                            <div>{t('titles')}: <span className="text-slate-950">{suggestion.candidateTotalTitles}</span></div>
                            <div>{t('scores_label')}: <span className="text-slate-950">{suggestion.candidateTotalCanestri}</span></div>
                            <div>{t('soffi_label')}: <span className="text-slate-950">{suggestion.candidateTotalSoffi}</span></div>
                            <div>{t('data_accounts_alias_candidate_aliases')}: <span className="text-slate-950">{suggestion.candidateAliasCount}</span></div>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void mergeAliasSuggestion(suggestion.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-amber-600 bg-amber-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                          >
                            {t('data_accounts_alias_merge')}
                          </button>
                          <button
                            type="button"
                            onClick={() => ignoreAliasSuggestion(suggestion.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                          >
                            {t('data_accounts_alias_ignore')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                    {t('data_accounts_alias_suggestions_empty')}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-black text-blue-950">{t('data_accounts_historical_matches_title')}</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-blue-900/80">
                      {t('data_accounts_historical_matches_desc')}
                    </div>
                  </div>
                  <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-black text-blue-800">
                    {historicalAliasSuggestions.length}
                  </div>
                </div>

                {historicalAliasSuggestions.length ? (
                  <div className="mt-4 space-y-3">
                    {historicalAliasSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-2xl border border-blue-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-950">
                              {suggestion.candidateDisplayName}
                              {suggestion.candidateBirthDateLabel !== 'ND' ? ` · ${suggestion.candidateBirthDateLabel}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <div className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                                suggestion.confidence === 'high'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-100 text-slate-700'
                              }`}>
                                {suggestion.confidence === 'high'
                                  ? t('data_accounts_alias_confidence_high')
                                  : t('data_accounts_alias_confidence_medium')}
                              </div>
                              {suggestion.reasons.map((reason) => (
                                <div key={reason} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-700">
                                  {aliasReasonLabel(t, reason)}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-2 text-right text-[11px] font-black text-slate-600 sm:grid-cols-2">
                            <div>{t('titles')}: <span className="text-slate-950">{suggestion.candidateTotalTitles}</span></div>
                            <div>{t('scores_label')}: <span className="text-slate-950">{suggestion.candidateTotalCanestri}</span></div>
                            <div>{t('soffi_label')}: <span className="text-slate-950">{suggestion.candidateTotalSoffi}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                    {t('data_accounts_historical_matches_empty')}
                  </div>
                )}
              </div>

              {feedback ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                  {feedback.message}
                </div>
              ) : null}

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void saveSelected()}
                  className="inline-flex items-center justify-center rounded-xl border border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  {t('data_accounts_save')}
                </button>
                <button
                  type="button"
                  disabled={!selectedRow.hasPasswordRecovery}
                  onClick={() => void resetSelectedPassword()}
                  className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black ${
                    selectedRow.hasPasswordRecovery
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      : 'border-slate-200 bg-slate-100 text-slate-400'
                  }`}
                  title={selectedRow.hasPasswordRecovery ? undefined : t('data_accounts_reset_password_disabled')}
                >
                  {t('data_accounts_reset_password')}
                </button>
                {canManageSelectedAdminRole ? (
                  <button
                    type="button"
                    onClick={() => void toggleSelectedAdminRole()}
                    className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      allSelectedLiveRowsAreAdmin
                        ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 focus-visible:ring-violet-500'
                        : 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-600'
                    }`}
                  >
                    {allSelectedLiveRowsAreAdmin ? t('data_accounts_admin_revoke') : t('data_accounts_admin_grant')}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canDeleteSelected}
                  onClick={() => void deleteSelected()}
                  className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    canDeleteSelected
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-500'
                      : 'border-slate-200 bg-slate-100 text-slate-400'
                  }`}
                  title={!canDeleteSelected ? t('data_accounts_delete_admin_first') : undefined}
                >
                  {t('data_accounts_delete')}
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                {t('data_accounts_reset_password_disabled')}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-600">
              {t('data_accounts_empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
