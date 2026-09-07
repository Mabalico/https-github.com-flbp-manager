import React from 'react';
import { CalendarDays, Check, LoaderCircle, Pencil, Search, Trophy, X } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import { listEditions } from '../../../../services/editionData';

type TournamentRenameRow = {
    key: string;
    id: string;
    name: string;
    startDate?: string;
    isLive: boolean;
    titlesOnly: boolean;
    titleCount: number;
    scorerCount: number;
};

const parseTournamentDate = (value?: string): number => {
    const raw = String(value || '').trim();
    if (!raw) return Number.NaN;
    const italianDate = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s|$)/);
    if (italianDate) {
        const [, day, month, year] = italianDate;
        const timestamp = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0).getTime();
        const parsed = new Date(timestamp);
        if (
            parsed.getFullYear() === Number(year)
            && parsed.getMonth() === Number(month) - 1
            && parsed.getDate() === Number(day)
        ) return timestamp;
    }
    return Date.parse(raw);
};

const formatTournamentDate = (value?: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const timestamp = parseTournamentDate(raw);
    if (!Number.isFinite(timestamp)) return raw;
    return new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(timestamp));
};

export const IntegrationsTournaments: React.FC<Pick<DataTabProps, 'state' | 't' | 'renameTournamentEdition'> & { onOpen: (id: string) => void }> = ({
    state,
    t,
    renameTournamentEdition,
    onOpen,
}) => {
    const [query, setQuery] = React.useState('');
    const [editingKey, setEditingKey] = React.useState('');
    const [draftName, setDraftName] = React.useState('');
    const [savingKey, setSavingKey] = React.useState('');
    const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const rows = React.useMemo<TournamentRenameRow[]>(() => listEditions(state).map(row => ({
        key: row.id, id: row.id, name: row.name, startDate: row.date || row.year,
        isLive: row.live, titlesOnly: !row.tournament, titleCount: row.awards.length, scorerCount: row.scorers.length,
    })), [state]);

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleRows = normalizedQuery
        ? rows.filter((row) => `${row.name} ${row.id}`.toLocaleLowerCase().includes(normalizedQuery))
        : rows;

    React.useEffect(() => {
        if (editingKey) inputRef.current?.focus();
    }, [editingKey]);

    React.useEffect(() => {
        if (!editingKey) return;
        const selectedRow = rows.find((row) => row.key === editingKey);
        if (!selectedRow) {
            setEditingKey('');
            setDraftName('');
        }
    }, [editingKey, rows]);

    const beginEditing = (row: TournamentRenameRow) => {
        setEditingKey(row.key);
        setDraftName(row.name || '');
        setFeedback(null);
    };

    const cancelEditing = () => {
        if (savingKey) return;
        setEditingKey('');
        setDraftName('');
    };

    const saveName = async (row: TournamentRenameRow) => {
        const nextName = draftName.trim();
        if (!nextName) {
            setFeedback({ tone: 'error', message: t('alert_enter_tournament_name') });
            inputRef.current?.focus();
            return;
        }
        if (nextName === String(row.name || '').trim()) {
            cancelEditing();
            return;
        }

        setSavingKey(row.key);
        setFeedback(null);
        try {
            await renameTournamentEdition(row.id, nextName);
            setEditingKey('');
            setDraftName('');
            setFeedback({ tone: 'success', message: `${t('record_updated')} ${nextName}` });
        } catch (error: any) {
            setFeedback({
                tone: 'error',
                message: String(error?.message || t('alert_enter_tournament_name')),
            });
        } finally {
            setSavingKey('');
        }
    };

    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';

    return (
        <section className="space-y-4" aria-labelledby="integrations-tournaments-title">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                            <Trophy className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h3 id="integrations-tournaments-title" className="text-lg font-black text-slate-950">
                                {t('edition_list')}
                            </h3>
                            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                                {t('data_integrations_helper')}
                            </p>
                        </div>
                    </div>

                    <label className="relative block w-full sm:w-72">
                        <span className="sr-only">{t('search')}</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('search')}
                            className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 ${ring}`}
                        />
                    </label>
                </div>
            </div>

            <div aria-live="polite" aria-atomic="true">
                {feedback ? (
                    <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${feedback.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}>
                        {feedback.message}
                    </div>
                ) : null}
            </div>

            {visibleRows.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <ul className="divide-y divide-slate-200">
                        {visibleRows.map((row) => {
                            const isEditing = editingKey === row.key;
                            const isSaving = savingKey === row.key;
                            const dateLabel = formatTournamentDate(row.startDate);
                            return (
                                <li key={row.key} className={row.isLive ? 'bg-amber-50/60' : 'bg-white'}>
                                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${row.isLive
                                                ? 'bg-amber-500 text-slate-950'
                                                : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                <CalendarDays className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="break-words text-sm font-black text-slate-950">{row.name || '—'}</span>
                                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${row.isLive
                                                        ? 'border-amber-300 bg-amber-100 text-amber-900'
                                                        : 'border-slate-200 bg-slate-50 text-slate-600'
                                                    }`}>
                                                        {row.isLive ? t('live_badge') : t('archive_tournaments')}
                                                    </span>
                                                </div>
                                                {dateLabel ? <div className="mt-1 text-xs font-bold text-slate-500">{dateLabel}</div> : null}
                                            </div>
                                        </div>

                                        {!row.isLive && <button type="button" className={`rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold ${ring}`} onClick={() => onOpen(row.id)}>{t('edition_open')}</button>}
                                        {row.titlesOnly && <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{t('edition_section_awards')} · {row.titleCount}</span>}
                                        {isEditing ? (
                                            <form
                                                className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center"
                                                onSubmit={(event) => {
                                                    event.preventDefault();
                                                    void saveName(row);
                                                }}
                                            >
                                                <label className="min-w-0 flex-1">
                                                    <span className="sr-only">{t('tournament_name')}</span>
                                                    <input
                                                        ref={inputRef}
                                                        value={draftName}
                                                        onChange={(event) => setDraftName(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Escape') cancelEditing();
                                                        }}
                                                        disabled={isSaving}
                                                        aria-invalid={!draftName.trim() || undefined}
                                                        className={`w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm font-black text-slate-950 ${ring}`}
                                                    />
                                                </label>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <button
                                                        type="submit"
                                                        disabled={isSaving || !draftName.trim() || draftName.trim() === String(row.name || '').trim()}
                                                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45 ${ring}`}
                                                    >
                                                        {isSaving
                                                            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                            : <Check className="h-4 w-4" aria-hidden="true" />}
                                                        {t('save_changes')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditing}
                                                        disabled={isSaving}
                                                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 ${ring}`}
                                                    >
                                                        <X className="h-4 w-4" aria-hidden="true" />
                                                        {t('cancel')}
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => beginEditing(row)}
                                                disabled={Boolean(savingKey)}
                                                aria-label={`${t('edition_rename')}: ${row.name}`}
                                                className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-45 sm:self-auto ${ring}`}
                                            >
                                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                                {t('edit')}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-500">
                    {t('no_tournament')}
                </div>
            )}
        </section>
    );
};
