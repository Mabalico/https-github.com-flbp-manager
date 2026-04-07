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
import { deleteAdminPlayerAccount, playerRequestPasswordReset, pullAdminPlayerAccounts, pushAdminPlayerAppProfile } from '../../../../services/supabaseRest';

interface AccountsSubTabProps {
  state: AppState;
  t: (key: string) => string;
}

type AccountFilter = 'all' | PlayerAccountAdminOrigin;

const cardClass = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60';
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

export const AccountsSubTab: React.FC<AccountsSubTabProps> = ({ state, t }) => {
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [remoteRows, setRemoteRows] = React.useState<ReturnType<typeof listPlayerPreviewAccountsAdminRows>>([]);
  const [remoteStatus, setRemoteStatus] = React.useState<'idle' | 'loading' | 'ready' | 'backend_pending' | 'unavailable'>('idle');
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
        setRemoteRows(liveRows.map((row) => buildPlayerAccountAdminRowFromLive(state, row)));
        setRemoteStatus('ready');
        setRemoteError(null);
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message || error || '').trim();
        setRemoteRows([]);
        setRemoteError(message || null);
        if (
          /flbp_admin_list_player_accounts|player_app_profiles|player_app_devices|player_app_calls|function .*flbp_admin_list_player_accounts|relation .*player_app_/i.test(message)
        ) {
          setRemoteStatus('backend_pending');
        } else {
          setRemoteStatus('unavailable');
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
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            {remoteStatus === 'ready'
              ? t('data_accounts_live_catalog_ready')
              : remoteStatus === 'loading'
                ? t('loading')
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
              {remoteStatus === 'ready' ? t('data_accounts_mode_live') : t('data_accounts_preview_only')}
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
                      <div className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700">
                        {row.hasProfile ? t('player_area_profile_title') : t('data_accounts_profile_missing')}
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
                </div>
              </div>

              {selectedRow.mode === 'live' ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-800">
                  {t('data_accounts_live_profile_hint')}
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
                <button
                  type="button"
                  onClick={() => void deleteSelected()}
                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
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
