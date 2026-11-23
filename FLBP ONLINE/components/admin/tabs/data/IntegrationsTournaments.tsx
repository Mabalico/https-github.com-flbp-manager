import React from 'react';
import { Check, ChevronRight, LoaderCircle, Pencil, Plus, Search, X } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import { listEditions } from '../../../../services/editionData';
import { formatBirthDateDisplay, normalizeBirthDateInput } from '../../../../services/playerIdentity';

type TournamentRenameRow = {
    key: string;
    id: string;
    name: string;
    isLive: boolean;
    date: string;
    year: string;
    winner: string;
    titleCount: number;
    scorerCount: number;
};

const normalizeTournamentDate = (date: string) => {
    const normalized = normalizeBirthDateInput(date.replace(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/, '$1/$2/$3'));
    if (normalized || !date || /^\d{4}$/.test(date)) return normalized || date;
    const timestamp = Date.parse(date);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : date;
};

export const IntegrationsTournaments: React.FC<Pick<DataTabProps, 'state' | 't' | 'renameTournamentEdition'> & { onOpen: (id: string) => void; onAdd: () => void }> = ({
    state,
    t,
    renameTournamentEdition,
    onOpen,
    onAdd,
}) => {
    const [query, setQuery] = React.useState('');
    const [year, setYear] = React.useState('');
    const [editingKey, setEditingKey] = React.useState('');
    const [draftName, setDraftName] = React.useState('');
    const [savingKey, setSavingKey] = React.useState('');
    const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; message: string } | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const rows = React.useMemo<TournamentRenameRow[]>(() => listEditions(state).map(row => {
        const winner = row.awards.find(award => award.type === 'winner');
        const date = normalizeTournamentDate(row.date);
        return {
            key: row.id, id: row.id, name: row.name,
            date, year: /^\d{4}/.test(date) ? date.slice(0, 4) : row.year, isLive: row.live,
            winner: winner ? [winner.teamName, winner.playerNames.filter(Boolean).join(' & ')].filter(Boolean).join(' · ') : '',
            titleCount: row.awards.length, scorerCount: row.scorers.length,
        };
    }).sort((a, b) => Number(b.isLive) - Number(a.isLive)
        || (b.date || b.year).localeCompare(a.date || a.year) || a.name.localeCompare(b.name)), [state]);
    const years = [...new Set(rows.map(row => row.year).filter(value => /^\d{4}$/.test(value)))].sort().reverse();
    const duplicateKey = (row: TournamentRenameRow) => row.name.trim().toLocaleLowerCase() + '|' + row.date;
    const duplicateCounts = new Map<string, number>();
    for (const row of rows) {
        if (!row.isLive && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
            const key = duplicateKey(row);
            duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
        }
    }
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleRows = rows.filter(row => (!year || row.year === year)
        && (row.name + ' ' + row.year).toLocaleLowerCase().includes(normalizedQuery));

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
        <section className="space-y-4" aria-label={t('edition_list')}>
            <div className="flex flex-wrap items-center gap-2">
                    <label className="relative block min-w-48 flex-1">
                        <span className="sr-only">{t('search')}</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('edition_search')}
                            className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 ${ring}`}
                        />
                    </label>
                <select aria-label={t('year')} value={year} onChange={event => setYear(event.target.value)} className={`rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold ${ring}`}>
                    <option value="">{t('all_years')}</option>
                    {years.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <button type="button" onClick={onAdd} className={`inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-sm font-black text-white ${ring}`}>
                    <Plus size={16} aria-hidden="true" />{t('edition_new')}
                </button>
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
                            const dateLabel = formatBirthDateDisplay(row.date) || row.date || row.year || '—';
                            const possibleDuplicate = (duplicateCounts.get(duplicateKey(row)) || 0) > 1;
                            return (
                                <li key={row.key} className={row.isLive ? 'bg-amber-50/60' : 'bg-white'}>
                                    {!row.isLive ? (
                                        <button type="button" onClick={() => onOpen(row.id)}
                                            className={`grid w-full grid-cols-[1fr_auto_20px] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(9rem,20%)_20px] ${ring}`}>
                                            <span className="col-start-2 row-start-1 whitespace-nowrap text-xs font-semibold text-slate-500 sm:col-start-1">{dateLabel}</span>
                                            <strong className="col-start-1 row-start-1 min-w-0 break-words text-sm text-slate-950 sm:col-start-2">{row.name || '—'}</strong>
                                            <span className="col-span-2 row-start-2 text-sm text-slate-700 sm:col-span-1 sm:col-start-3 sm:row-start-1"><span className="sr-only">{t('winner')}: </span>{row.winner || '—'}</span>
                                            <span className="col-span-2 row-start-3 flex flex-wrap gap-1 text-xs font-bold sm:col-span-1 sm:col-start-4 sm:row-start-1">
                                                <span className="rounded-full bg-slate-100 px-2 py-1">{t('edition_section_awards')} {row.titleCount}</span>
                                                <span className="rounded-full bg-slate-100 px-2 py-1">{t('scorers_label')} {row.scorerCount}</span>
                                                {possibleDuplicate && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">{t('edition_possible_duplicate')}</span>}
                                            </span>
                                            <ChevronRight className="col-start-3 row-start-1 text-slate-500 sm:col-start-5" size={18} aria-hidden="true" />
                                        </button>
                                    ) : <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                                        <div className="min-w-0 text-sm">
                                            <strong className="break-words">{row.name || '—'}</strong>
                                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-900">{t('live_badge')}</span>
                                            <span className="ml-2 whitespace-nowrap text-xs text-slate-600">{dateLabel}</span>
                                        </div>
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
                                    </div>}
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
