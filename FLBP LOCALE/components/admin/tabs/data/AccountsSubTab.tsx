import React from 'react';
import type { AppState } from '../../../../services/storageService';
import { BirthDateInput } from '../../BirthDateInput';
import { formatBirthDateDisplay } from '../../../../services/playerIdentity';
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
  buildPlayerAccountAliasTargetProfilePayload,
  ignorePlayerAccountAliasSuggestion,
  shouldSyncAccountCanonicalAfterAliasMerge,
  type PlayerAccountAliasReason,
} from '../../../../services/playerAccountAliasSuggestions';
import {
  deleteAdminPlayerAccount,
  grantAdminPlayerAccount,
  playerRequestPasswordReset,
  pullAdminPlayerAccounts,
  pullAdminUserRoles,
  pushAdminPlayerAppProfile,
  revokeAdminPlayerAccount,
} from '../../../../services/supabaseRest';

interface AccountsSubTabProps {
  state: AppState;
  setState: (state: AppState) => void;
  t: (key: string) => string;
}

type AccountFilter = 'all' | PlayerAccountAdminOrigin;

const cardClass = 'animate-pop-in rounded-3xl border border-slate-200/50 bg-white/95 backdrop-blur-md p-5 shadow-sm shadow-slate-200/60 hover:shadow-md transition-all duration-300';
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

export const AccountsSubTab: React.FC<AccountsSubTabProps> = ({ state, setState, t }) => {
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [remoteRows, setRemoteRows] = React.useState<ReturnType<typeof listPlayerPreviewAccountsAdminRows>>([]);
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
        let liveAdminIds = new Set<string>();
        let rolesMessage = '';
        try {
          const liveAdmins = await pullAdminUserRoles();
          if (cancelled) return;
          liveAdminIds = new Set(
            liveAdmins
              .map((row) => String(row.user_id || '').trim())
              .filter(Boolean)
          );
        } catch (rolesError: any) {
          rolesMessage = String(rolesError?.message || rolesError || '').trim();
        }
        setRemoteRows(
          liveRows.map((row) =>
            buildPlayerAccountAdminRowFromLive(state, {
              ...row,
              is_admin: liveAdminIds.has(String(row.user_id || '').trim()),
            })
          )
        );
        setRemoteStatus('ready');
        setRemoteError(rolesMessage || null);
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message || error || '').trim();
        setRemoteRows([]);
        if (/invalid jwt|jwt expired|sessione admin assente o scaduta|sessione admin/i.test(message)) {
          setRemoteStatus('auth_expired');
          setRemoteError(null);
        } else if (
          /flbp_admin_list_player_accounts|player_app_profiles|player_app_devices|player_app_calls|function .*flbp_admin_list_player_accounts|relation .*player_app_/i.test(message)
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

  const filteredRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.origin !== filter) return false;
      if (!needle) return true;
      const haystack = [
        row.email,
        row.linkedPlayerName || '',
        row.providers.join(' '),
        row.birthDate || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, filter, search]);

  const selectedRow = React.useMemo(() => {
    if (!filteredRows.length) return null;
    return filteredRows.find((row) => row.id === selectedId) || filteredRows[0] || null;
  }, [filteredRows, selectedId]);

  React.useEffect(() => {
    if (!selectedRow) {
      setSelectedId('');
      return;
    }
    if (selectedRow.id !== selectedId) {
      setSelectedId(selectedRow.id);
    }
  }, [selectedRow, selectedId]);

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
  }, [selectedRow?.id, selectedRow?.email, selectedRow?.linkedPlayerName, selectedRow?.birthDate]);

  const aliasSuggestions = React.useMemo(() => {
    if (!selectedRow || !selectedRow.canonicalPlayerId || !selectedRow.linkedPlayerName) return [];
    return buildPlayerAccountAliasSuggestions(state, selectedRow).slice(0, 6);
  }, [selectedRow, state]);

  const saveSelected = async () => {
    if (!selectedRow) return;
    try {
      if (selectedRow.mode === 'live') {
        const identity = buildPlayerCanonicalIdentity(firstName, lastName, birthDate, selectedRow.canonicalPlayerId || null);
        await pushAdminPlayerAppProfile({
          userId: selectedRow.id,
          firstName: identity.firstName,
          lastName: identity.lastName,
          birthDate: identity.birthDate,
          canonicalPlayerId: identity.canonicalPlayerId,
          canonicalPlayerName: identity.canonicalPlayerName,
        });
      } else {
        updatePlayerPreviewAccountAdmin(selectedRow.id, {
          email,
          firstName,
          lastName,
          birthDate,
        });
      }
      setFeedback({ tone: 'success', message: t('data_accounts_save_done') });
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
    if (!selectedRow || selectedRow.mode !== 'live') return;
    if (!selectedRow.email) {
      setFeedback({ tone: 'error', message: t('data_accounts_admin_missing_email') });
      return;
    }

    const confirmed = window.confirm(
      (
        selectedRow.isAdmin
          ? t('data_accounts_admin_revoke_confirm')
          : t('data_accounts_admin_grant_confirm')
      ).replace('{email}', selectedRow.email || selectedRow.id)
    );
    if (!confirmed) return;

    try {
      if (selectedRow.isAdmin) {
        await revokeAdminPlayerAccount({ userId: selectedRow.id, email: selectedRow.email });
        setFeedback({ tone: 'success', message: t('data_accounts_admin_revoke_done') });
      } else {
        await grantAdminPlayerAccount({ userId: selectedRow.id, email: selectedRow.email });
        setFeedback({ tone: 'success', message: t('data_accounts_admin_grant_done') });
      }
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
                {t('data_accounts_list_count').replace('{count}', String(filteredRows.length))}
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
            </div>
          </div>

          <div className="space-y-3">
            {filteredRows.length ? (
              filteredRows.map((row) => {
                const active = selectedRow?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-blue-300 bg-blue-50 shadow-sm shadow-blue-100'
                        : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
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
                          {row.hasProfile ? t('player_area_profile_title') : t('data_accounts_profile_missing')}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 md:grid-cols-3">
                      <div>{t('data_accounts_linked_player')}: {row.linkedPlayerName || t('data_accounts_no_player')}</div>
                      <div>{t('titles')}: {row.totalTitles}</div>
                      <div>{t('scores_label')}: {row.totalCanestri}</div>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('player_area_email')}</div>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={inputClass}
                    disabled={selectedRow.mode === 'live'}
                    title={selectedRow.mode === 'live' ? t('data_accounts_live_email_readonly') : undefined}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">{t('data_accounts_provider_label')}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    {selectedRow.providers.join(' • ')}
                  </div>
                </div>
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
                  <div>{t('data_accounts_linked_player')}: <span className="font-black text-slate-900">{selectedRow.linkedPlayerName || t('data_accounts_no_player')}</span></div>
                  <div className="mt-1">{t('data_accounts_created')}: <span className="font-black text-slate-900">{formatDateTime(selectedRow.createdAt)}</span></div>
                  <div className="mt-1">
                    {t('data_accounts_last_login')}: <span className="font-black text-slate-900">{formatDateTime(selectedRow.lastLoginAt)}</span>
                    <span className="ml-2 text-xs font-bold text-slate-500">({formatRelativeAccess(selectedRow.lastLoginAt)})</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>{t('titles')}: <span className="font-black text-slate-900">{selectedRow.totalTitles}</span></div>
                  <div className="mt-1">{t('scores_label')}: <span className="font-black text-slate-900">{selectedRow.totalCanestri}</span></div>
                  <div className="mt-1">{t('soffi_label')}: <span className="font-black text-slate-900">{selectedRow.totalSoffi}</span></div>
                  <div className="mt-1">{t('birth_date')}: <span className="font-black text-slate-900">{formatBirthDateDisplay(selectedRow.birthDate || '') || 'ND'}</span></div>
                  <div className="mt-1">{t('data_accounts_admin_role_label')}: <span className={`font-black ${selectedRow.isAdmin ? 'text-violet-700' : 'text-slate-900'}`}>{selectedRow.isAdmin ? t('data_accounts_admin_role_yes') : t('data_accounts_admin_role_no')}</span></div>
                </div>
              </div>

              {selectedRow.mode === 'live' ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-800">
                  {t('data_accounts_live_profile_hint')}
                </div>
              ) : null}

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
                {selectedRow.mode === 'live' ? (
                  <button
                    type="button"
                    onClick={() => void toggleSelectedAdminRole()}
                    className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      selectedRow.isAdmin
                        ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 focus-visible:ring-violet-500'
                        : 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-600'
                    }`}
                  >
                    {selectedRow.isAdmin ? t('data_accounts_admin_revoke') : t('data_accounts_admin_grant')}
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
