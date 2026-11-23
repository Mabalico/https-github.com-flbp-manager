import { useIntegrationFeedback } from './useIntegrationFeedback';
import { readScorersFile } from '../../../../services/scorersImport';
import React from 'react';
import { Upload, Download } from 'lucide-react';

import type { DataTabProps } from '../DataTab';
import type { AliasConflict } from '../../modals/AliasModal';
import type { IntegrationScorerEntry } from '../../../../types';

import { getPlayerKey, getPlayerKeyLabel, resolvePlayerKey } from '../../../../services/storageService';
import { buildCanonicalPlayerNameFromParts, normalizeCol, normalizeNameLower, splitCanonicalPlayerName } from '../../../../services/textUtils';
import { uuid } from '../../../../services/id';
import { downloadBlob } from '../../../../services/adminDownloadUtils';
import { decodeCsvText, detectCsvSeparator, parseCsvRows } from '../../../../services/adminCsvUtils';
import { getXLSX } from '../../../../services/lazyXlsx';
import { BirthDateInput } from '../../BirthDateInput';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../../../services/formInputUX';
import { deriveYoBFromBirthDate, formatBirthDateDisplay, normalizeBirthDateInput, pickPlayerIdentityValue } from '../../../../services/playerIdentity';

export const IntegrationsScorers: React.FC<DataTabProps> = (props) => {
    const {
        state,
        setState,
        t,
        scorersImportWarnings,
        setScorersImportWarnings,
        setPendingScorersImport,
        setAliasModalOpen,
        setAliasModalTitle,
        setAliasModalConflicts,
        scorersFileRef,
        buildProfilesIndex,
    } = props;

    const { notify, ask, feedbackUI } = useIntegrationFeedback(t);
    const [editId, setEditId] = React.useState('');
    const [manualOpen, setManualOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [visibleCount, setVisibleCount] = React.useState(50);
    const manualNameRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (manualOpen) manualNameRef.current?.focus();
    }, [manualOpen, editId]);
    const [manualName, setManualName] = React.useState('');
    const [manualBirthDate, setManualBirthDate] = React.useState('');
    const [manualTeamName, setManualTeamName] = React.useState('');
    const [manualGames, setManualGames] = React.useState('');
    const [manualPoints, setManualPoints] = React.useState('');
    const [manualSoffi, setManualSoffi] = React.useState('');

    // Lightweight Admin UI tokens (local): consistent controls without new deps
    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnBase = `inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const inputBase = `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 ${ring}`;

    const btnPrimary = btnBase + ' bg-blue-700 text-white hover:bg-blue-800';
    const normalizeName = (n: string) => normalizeNameLower(n);

    const labelFromPlayerKey = (key: string) => {
        const { name, yob } = getPlayerKeyLabel(key);
        return `${name} (${yob})`;
    };

    const toInt = (v: any): number | undefined => {
        const raw = String(v ?? '').trim();
        if (!raw) return undefined;
        const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : undefined;
    };

    const makeAliasConflict = (name: string, yob?: number, index?: Map<string, Set<string>>, birthDate?: string): AliasConflict | null => {
        const norm = normalizeName(name);
        if (!norm) return null;

        const rawKey = getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob));
        const resolved = resolvePlayerKey(state, rawKey);

        // già integrato altrove
        if (resolved !== rawKey) return null;

        const set = (index || buildProfilesIndex()).get(norm);
        if (!set || set.size === 0) return null;

        // se esiste già lo stesso profilo, non è un conflitto "anno diverso"
        if (set.has(resolved)) return null;

        const candidates = Array.from(set)
            .filter(k => k !== resolved)
            .map((k: any) => ({ key: String(k), label: labelFromPlayerKey(String(k)) }));

        if (candidates.length === 0) return null;

        return {
            id: uuid(),
            sourceKey: rawKey,
            sourceName: name,
            sourceYoB: formatBirthDateDisplay(birthDate) || (yob ? String(yob) : 'ND'),
            candidates,
            action: 'separate'
        };
    };

    const importScorersFromFile = async (file: File) => ({ entries: await readScorersFile(file), warnings: [] as string[] });

    const entries = (state.integrationsScorers || [])
        .filter(row => !row.sourceTournamentId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const search = normalizeName(query);
    const filtered = entries.filter(row => normalizeName(row.name + ' ' + (row.teamName || '')).includes(search));

    const onPickFile = () => scorersFileRef.current?.click();

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
            const { entries: imported, warnings } = await importScorersFromFile(f);
            if (!imported.length) {
                notify(t('alert_no_valid_scorers_rows'));
                return;
            }

            // Conflitti Nome+data di nascita
            const idxProfiles = buildProfilesIndex();
            const conflicts: AliasConflict[] = [];
            imported.forEach(en => {
                const c = makeAliasConflict(en.name, en.yob, idxProfiles, (en as any).birthDate);
                if (c) conflicts.push(c);
            });

            setScorersImportWarnings(warnings);

            if (conflicts.length > 0) {
                setAliasModalTitle(`${t('possible_homonyms_birthdate')} — ${t('import_file')}`);
                setAliasModalConflicts(conflicts);
                setPendingScorersImport({ entries: imported, warnings });
                setAliasModalOpen(true);
                return;
            }

            setState({
                ...state,
                integrationsScorers: [...(state.integrationsScorers || []), ...imported]
            });
        } catch (err) {
            console.error(err);
            notify(t('alert_scorers_import_error'));
        }
    };

    const deleteEntry = (id: string) => {
        setState({
            ...state,
            integrationsScorers: (state.integrationsScorers || []).filter(e => e.id !== id)
        });
    };

    const clearAll = async () => {
        if (!await ask(t('edition_clear_extra_stats').replace('{count}', String(entries.length)))) return;
        setState({ ...state, integrationsScorers: (state.integrationsScorers || []).filter(row => row.sourceTournamentId) });
        setScorersImportWarnings([]);
    };

    const resetManual = () => {
        setManualOpen(false);
        setEditId('');
        setManualName('');
        setManualBirthDate('');
        setManualTeamName('');
        setManualGames('');
        setManualPoints('');
        setManualSoffi('');
    };

    const saveManualEntry = () => {
        const name = manualName.trim();
        if (!name) {
            notify(t('alert_enter_player_name'));
            return;
        }
        const birthDate = normalizeBirthDateInput(manualBirthDate);
        if (manualBirthDate.trim() && !birthDate) {
            notify(t('birthdate_invalid'));
            return;
        }
        if ([manualGames, manualPoints, manualSoffi].some(value => value.trim() && (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))))) { notify(t('edition_import_invalid_number')); return; }
        const yob = deriveYoBFromBirthDate(birthDate);
        const previous = (state.integrationsScorers || []).find(row => row.id === editId);
        const entry: IntegrationScorerEntry = {
            ...previous,
            id: editId || `sc_${uuid()}`,
            name,
            yob,
            birthDate,
            teamName: manualTeamName.trim() || undefined,
            games: Math.max(0, parseInt(manualGames || '0', 10) || 0),
            points: Math.max(0, parseInt(manualPoints || '0', 10) || 0),
            soffi: Math.max(0, parseInt(manualSoffi || '0', 10) || 0),
            createdAt: Date.now(),
            source: previous?.source || t('manual_entry_source_label'),
            sourceType: 'manual_integration',
            sourceTournamentId: previous?.sourceTournamentId || null,
            sourceLabel: previous?.sourceLabel || (editId ? t('manual_edit_source') : t('manual_entry_source_label')),
        };

        const idxProfiles = buildProfilesIndex();
        const conflict = makeAliasConflict(entry.name, entry.yob, idxProfiles, entry.birthDate);
        if (conflict) {
            setAliasModalTitle(`${t('possible_homonyms_birthdate')} — ${t('scorers_label')}`);
            setAliasModalConflicts([conflict]);
            setPendingScorersImport({ entries: [entry], warnings: [] });
            setAliasModalOpen(true);
            return;
        }

        const keep = (state.integrationsScorers || []).filter((row) => row.id !== entry.id);
        setState({ ...state, integrationsScorers: [...keep, entry] });
        resetManual();
    };

    const startEdit = (entry: IntegrationScorerEntry) => {
        setManualOpen(true);
        setEditId(entry.id);
        setManualName(entry.name || '');
        setManualBirthDate(formatBirthDateDisplay((entry as any).birthDate) || '');
        setManualTeamName(entry.teamName || '');
        setManualGames(String(entry.games || 0));
        setManualPoints(String(entry.points || 0));
        setManualSoffi(String(entry.soffi || 0));
    };

    const exportCsv = async () => {
        const XLSX = await getXLSX();
        const rows = entries.map(e => {
            const parts = splitCanonicalPlayerName(e.name || '');
            return {
            Nome: parts.firstName,
            Cognome: parts.lastName,
            DataNascita: formatBirthDateDisplay((e as any).birthDate) || '',
            Squadra: e.teamName ?? '',
            Partite: e.games ?? 0,
            Canestri: e.points ?? 0,
            Soffi: e.soffi ?? 0
        };});
        const ws = XLSX.utils.json_to_sheet(rows, { header: ['Nome', 'Cognome', 'DataNascita', 'Squadra', 'Partite', 'Canestri', 'Soffi'] as any });
        const csv = '\ufeff' + XLSX.utils.sheet_to_csv(ws, { FS: ';' });
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `integrazioni_marcatori_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const downloadTemplateXlsx = async () => {
        const XLSX = await getXLSX();
        const ws = XLSX.utils.aoa_to_sheet([
            ['Nome', 'Cognome', 'DataNascita', 'Squadra', 'Partite', 'Canestri', 'Soffi'],
            ['', '', '', '', '', '', '']
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Marcatori');
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        downloadBlob(
            new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            'template_integrazioni_marcatori.xlsx'
        );
    };

    return (
        <div className="space-y-4">
            {feedbackUI}
            <p className="text-sm text-slate-600">{t('edition_standalone_hint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('scorers_actions_toolbar')}>
                <input type="search" aria-label={t('edition_search_extra_stats')} placeholder={t('edition_search_extra_stats')}
                    value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(50); }}
                    className={inputBase + ' basis-full sm:min-w-48 sm:flex-1'} />
                <button type="button" onClick={onPickFile} className={btnPrimary}><Upload size={16} />{t('import_file')}</button>
                <button type="button" onClick={downloadTemplateXlsx} className={btnSecondary}><Download size={16} />{t('hof_bundle_download_template')}</button>
                <button type="button" onClick={exportCsv} disabled={!entries.length} className={btnSecondary}>{t('export_csv')}</button>
                <details className="relative">
                    <summary className={btnSecondary + ' cursor-pointer list-none'}>{t('edition_more_actions')} ⋯</summary>
                    <div className="absolute right-0 z-10 mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                        <button type="button" disabled={!entries.length} onClick={event => {
                            event.currentTarget.closest('details')?.removeAttribute('open');
                            void clearAll();
                        }} className={btnSecondary + ' whitespace-nowrap text-rose-700'}>{t('clear_all')}</button>
                    </div>
                </details>
                <input ref={scorersFileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onFileChange} />
            </div>

            {!manualOpen && <button type="button" onClick={() => setManualOpen(true)} className={btnSecondary}>{t('edition_manual_add')}</button>}
            {manualOpen && <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={event => { event.preventDefault(); saveManualEntry(); }}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2">
                        <div className="text-xs font-black text-slate-500 mb-1">{t('player_label')}</div>
                        <input ref={manualNameRef} value={manualName} onChange={(e) => setManualName(e.target.value)} className={inputBase} placeholder={t('player_full_name_placeholder')} />
                    </div>
                    <div>
                        <div className="text-xs font-black text-slate-500 mb-1">{t('birthdate_label')}</div>
                        <BirthDateInput value={manualBirthDate} onChange={setManualBirthDate} className={inputBase} placeholder={t('birthdate_placeholder')} ariaLabel={t('scorers_birthdate_aria')} calendarTitle={t('open_calendar')} />
                    </div>
                    <div className="md:col-span-2">
                        <div className="text-xs font-black text-slate-500 mb-1">{t('team_label')}</div>
                        <input value={manualTeamName} onChange={(e) => setManualTeamName(e.target.value)} className={inputBase} placeholder={t('team_name_placeholder')} />
                    </div>
                    <div>
                        <div className="text-xs font-black text-slate-500 mb-1">{t('games')}</div>
                        <input value={manualGames} onChange={(e) => setManualGames(e.target.value.replace(/[^0-9]/g, ''))} className={inputBase} placeholder="0" onFocus={handleZeroValueFocus} onMouseUp={handleZeroValueMouseUp} onBlur={handleZeroValueBlur} />
                    </div>
                    <div>
                        <div className="text-xs font-black text-slate-500 mb-1">{t('points_baskets')}</div>
                        <input value={manualPoints} onChange={(e) => setManualPoints(e.target.value.replace(/[^0-9]/g, ''))} className={inputBase} placeholder="0" onFocus={handleZeroValueFocus} onMouseUp={handleZeroValueMouseUp} onBlur={handleZeroValueBlur} />
                    </div>
                    <div>
                        <div className="text-xs font-black text-slate-500 mb-1">{t('soffi')}</div>
                        <input value={manualSoffi} onChange={(e) => setManualSoffi(e.target.value.replace(/[^0-9]/g, ''))} className={inputBase} placeholder="0" onFocus={handleZeroValueFocus} onMouseUp={handleZeroValueMouseUp} onBlur={handleZeroValueBlur} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button type="submit" className={btnPrimary}>{t('save_changes')}</button>
                    <button type="button" onClick={resetManual} className={btnSecondary}>{t('cancel')}</button>
                </div>
            </form>}

            {scorersImportWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="font-black text-amber-900 mb-2">{t('possible_homonyms_birthdate')}</div>
                    <ul className="list-disc pl-5 space-y-1 text-xs font-bold text-amber-900">
                        {scorersImportWarnings.slice(0, 10).map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                    {scorersImportWarnings.length > 10 && (
                        <div className="text-xs font-bold text-amber-800 mt-2">
                            +{scorersImportWarnings.length - 10} {t('others_ellipsis')}
                        </div>
                    )}
                    <div className="text-xs text-amber-800 font-bold mt-2">
                        {t('manage_name_birthdate_integrations_hint')}
                    </div>
                </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[65vh] overflow-auto">
                    <table className="min-w-full text-sm">
                        <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-700 shadow-sm">
                            <tr>
                                {(['player_label', 'birth_label_short', 'team_label', 'games', 'points_baskets', 'soffi', 'edition_stats_source'] as const).map(key =>
                                    <th key={key} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-black">{t(key)}</th>
                                )}
                                <th scope="col" className="px-3 py-2"><span className="sr-only">{t('actions')}</span>⋯</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.slice(0, visibleCount).map(entry => (
                                <tr key={entry.id} className="hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-3 py-2 font-bold">{entry.name}</td>
                                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatBirthDateDisplay(entry.birthDate) || entry.yob || t('nd_short')}</td>
                                    <td className="whitespace-nowrap px-3 py-2">{entry.teamName || '—'}</td>
                                    <td className="px-3 py-2 tabular-nums">{entry.games}</td>
                                    <td className="px-3 py-2 tabular-nums">{entry.points}</td>
                                    <td className="px-3 py-2 tabular-nums">{entry.soffi}</td>
                                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{(entry.sourceLabel || entry.source || '').replace(/\.(csv|xlsx|xls)$/i, '').replace(/_/g, ' ').trim() || '—'}</td>
                                    <td className="px-3 py-2">
                                        <details className="relative" name="extra-stats-row-actions">
                                            <summary aria-label={t('actions') + ' ' + entry.name} className="cursor-pointer list-none rounded-lg px-2 py-1 font-bold hover:bg-slate-200">⋯</summary>
                                            <div className="grid gap-1">
                                                <button type="button" onClick={event => {
                                                    event.currentTarget.closest('details')?.removeAttribute('open');
                                                    startEdit(entry);
                                                }} className="rounded-lg px-2 py-1 text-left font-bold hover:bg-slate-100">{t('edit')}</button>
                                                <button type="button" onClick={event => {
                                                    event.currentTarget.closest('details')?.removeAttribute('open');
                                                    deleteEntry(entry.id);
                                                }} className="rounded-lg px-2 py-1 text-left font-bold text-rose-700 hover:bg-rose-50">{t('delete')}</button>
                                            </div>
                                        </details>
                                    </td>
                                </tr>
                            ))}
                            {!filtered.length && <tr><td colSpan={8} className="p-6 text-center font-bold text-slate-500">{t('no_imported_records')}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            {filtered.length > visibleCount && <button type="button" className={btnSecondary} onClick={() => setVisibleCount(count => count + 50)}>{t('edition_show_more_stats')}</button>}
        </div>
    );
};
