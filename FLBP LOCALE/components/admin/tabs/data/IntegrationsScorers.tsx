import React from 'react';
import { Upload, Download, Pencil, Trash2 } from 'lucide-react';

import type { DataTabProps } from '../DataTab';
import type { AliasConflict } from '../../modals/AliasModal';
import type { IntegrationScorerEntry } from '../../../../types';

import { getPlayerKey, getPlayerKeyLabel, resolvePlayerKey } from '../../../../services/storageService';
import { normalizeCol, normalizeNameLower } from '../../../../services/textUtils';
import { uuid } from '../../../../services/id';
import { downloadBlob } from '../../../../services/adminDownloadUtils';
import { decodeCsvText, detectCsvSeparator, parseCsvRows } from '../../../../services/adminCsvUtils';
import { getXLSX } from '../../../../services/lazyXlsx';
import { isTesterMode } from '../../../../config/appMode';
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
        removeAlias,
    } = props;

    const [editId, setEditId] = React.useState('');
    const [manualName, setManualName] = React.useState('');
    const [manualBirthDate, setManualBirthDate] = React.useState('');
    const [manualTeamName, setManualTeamName] = React.useState('');
    const [manualGames, setManualGames] = React.useState('');
    const [manualPoints, setManualPoints] = React.useState('');
    const [manualSoffi, setManualSoffi] = React.useState('');

    // Lightweight Admin UI tokens (local): consistent controls without new deps
    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnBase = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black transition disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnDanger = `${btnBase} bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;
    const btnSmBase = `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-black transition text-xs ${ring}`;
    const btnSmDanger = `${btnSmBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;
    const btnSmSecondary = `${btnSmBase} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50`;
    const inputBase = `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 ${ring}`;

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

    const parseScorersRows = (rows: Array<Record<string, any>>, fileName: string): { entries: IntegrationScorerEntry[]; warnings: string[] } => {
        const getField = (row: Record<string, any>, candidates: string[]) => {
            const cand = new Set(candidates.map(normalizeCol));
            for (const k of Object.keys(row)) {
                if (cand.has(normalizeCol(k))) return row[k];
            }
            return '';
        };

        const profilesIndex = buildProfilesIndex();
        const entries: IntegrationScorerEntry[] = [];
        const warnings: string[] = [];

        rows.forEach((r, idx) => {
            const name = String(getField(r, ['Nome', 'Giocatore', 'Player', 'CognomeNome', 'Cognome Nome', 'Name'])).trim();
            if (!name) return;

            const birthDate = normalizeBirthDateInput(String(getField(r, ['DataNascita', 'Data di nascita', 'BirthDate', 'DOB', 'NascitaCompleta']) || ''));
            const yob = deriveYoBFromBirthDate(birthDate) ?? toInt(getField(r, ['Anno', 'AnnoNascita', 'Year', 'YoB', 'Nascita', 'BirthYear']));
            const games = Math.max(0, toInt(getField(r, ['Partite', 'Gare', 'Games', 'Played'])) || 0);
            const points = Math.max(0, toInt(getField(r, ['Canestri', 'Punti', 'Points', 'PT'])) || 0);
            const soffi = Math.max(0, toInt(getField(r, ['Soffi', 'SF', 'Blows'])) || 0);
            const teamName = String(getField(r, ['Squadra', 'Team', 'TeamName'])).trim();

            const norm = normalizeName(name);
            const yobStr = formatBirthDateDisplay(birthDate) || (yob ? String(yob) : 'ND');
            const rawKey = getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob));
            const resolved = resolvePlayerKey(state, rawKey);

            const existingKeys = profilesIndex.get(norm);
            if (existingKeys && existingKeys.size > 0 && resolved === rawKey && !existingKeys.has(resolved)) {
                const list = Array.from(existingKeys).map((k: any) => labelFromPlayerKey(String(k))).join(' | ');
                warnings.push(`${name} · esistenti: ${list} · import: ${yobStr} (riga ${idx + 2})`);
            }

            entries.push({
                id: `sc_${uuid()}`,
                name,
                yob,
                birthDate,
                games,
                points,
                soffi,
                createdAt: Date.now(),
                source: fileName,
                sourceType: 'manual_integration',
                sourceTournamentId: null,
                sourceLabel: fileName,
                teamName: teamName || undefined
            });
        });

        return { entries, warnings };
    };

    const importScorersFromFile = async (file: File): Promise<{ entries: IntegrationScorerEntry[]; warnings: string[] }> => {
        const name = (file.name || '').toLowerCase();
        const isCsv = name.endsWith('.csv') || (file.type || '').includes('csv');

        if (isCsv) {
            const text = await decodeCsvText(file);
            const sep = detectCsvSeparator(text);
            const matrix = parseCsvRows(text, sep);
            if (!matrix.length) return { entries: [], warnings: [] };

            const header = matrix[0] || [];
            const data = matrix.slice(1);
            const objects: Array<Record<string, any>> = data.map(row => {
                const obj: Record<string, any> = {};
                header.forEach((h, i) => {
                    obj[h || `COL_${i}`] = row[i] ?? '';
                });
                return obj;
            });

            return parseScorersRows(objects, file.name);
        }

        // Excel / fogli
        const XLSX = await getXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        return parseScorersRows(rows, file.name);
    };

    const entries = (state.integrationsScorers || [])
        .slice()
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const aliases = Object.entries((state.playerAliases || {}) as Record<string, string>) as Array<[string, string]>;

    const onPickFile = () => scorersFileRef.current?.click();

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
            const { entries: imported, warnings } = await importScorersFromFile(f);
            if (!imported.length) {
                alert(t('alert_no_valid_scorers_rows'));
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
            alert(t('alert_scorers_import_error'));
        }
    };

    const deleteEntry = (id: string) => {
        setState({
            ...state,
            integrationsScorers: (state.integrationsScorers || []).filter(e => e.id !== id)
        });
    };

    const clearAll = () => {
        if (!confirm(t('clear_all_scorers_confirm'))) return;
        setState({ ...state, integrationsScorers: [] });
        setScorersImportWarnings([]);
    };

    const resetManual = () => {
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
            alert(t('alert_enter_player_name'));
            return;
        }
        const birthDate = normalizeBirthDateInput(manualBirthDate);
        if (manualBirthDate.trim() && !birthDate) {
            alert(t('birthdate_invalid'));
            return;
        }
        const yob = deriveYoBFromBirthDate(birthDate);
        const entry: IntegrationScorerEntry = {
            id: editId || `sc_${uuid()}`,
            name,
            yob,
            birthDate,
            teamName: manualTeamName.trim() || undefined,
            games: Math.max(0, parseInt(manualGames || '0', 10) || 0),
            points: Math.max(0, parseInt(manualPoints || '0', 10) || 0),
            soffi: Math.max(0, parseInt(manualSoffi || '0', 10) || 0),
            createdAt: Date.now(),
            source: editId ? t('manual_edit_source') : t('manual_entry_source_label'),
            sourceType: 'manual_integration',
            sourceTournamentId: null,
            sourceLabel: editId ? t('manual_edit_source') : t('manual_entry_source_label'),
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
        const rows = entries.map(e => ({
            Nome: e.name,
            DataNascita: formatBirthDateDisplay((e as any).birthDate) || '',
            Squadra: e.teamName ?? '',
            Partite: e.games ?? 0,
            Canestri: e.points ?? 0,
            Soffi: e.soffi ?? 0
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { header: ['Nome', 'DataNascita', 'Squadra', 'Partite', 'Canestri', 'Soffi'] as any });
        const csv = '\ufeff' + XLSX.utils.sheet_to_csv(ws, { FS: ';' });
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `integrazioni_marcatori_${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const downloadTemplateXlsx = async () => {
        const XLSX = await getXLSX();
        const ws = XLSX.utils.aoa_to_sheet([
            ['Nome', 'DataNascita', 'Squadra', 'Partite', 'Canestri', 'Soffi'],
            ['', '', '', '', '', '']
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
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div className="font-black text-slate-900">{t('scorers_integrations_title')}</div>
                        <div className="text-xs text-slate-600 font-bold">
                            {t('scorers_integrations_desc')}
                        </div>
                    </div>
                    <div className="flex items-center gap-2" role="toolbar" aria-label={t('scorers_actions_toolbar')}>
                        <button type="button"
                            onClick={onPickFile}
                            className={btnSecondary}
                        >
                            <Upload className="w-4 h-4" /> {t('import_file')}
                        </button>
                        {isTesterMode && (
                            <button type="button"
                                onClick={downloadTemplateXlsx}
                                className={btnSecondary}
                            >
                                <Download className="w-4 h-4" /> Template
                            </button>
                        )}
                        {isTesterMode && (
                            <button type="button"
                                onClick={exportCsv}
                                disabled={entries.length === 0}
                                className={btnSecondary}
                            >
                                <Download className="w-4 h-4" /> {t('export_csv')}
                            </button>
                        )}
                        <button type="button"
                            onClick={clearAll}
                            className={btnDanger}
                        >
                            <Trash2 className="w-4 h-4" /> {t('clear_all')}
                        </button>
                    </div>
                    <input
                        ref={scorersFileRef}
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={onFileChange}
                    />
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div className="font-black text-slate-900">{t('manual_insert_edit')}</div>
                        <div className="text-xs text-slate-600 font-bold">
                            {t('manual_insert_edit_desc')}
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2">
                        <div className="text-xs font-black text-slate-500 mb-1">{t('player_label')}</div>
                        <input value={manualName} onChange={(e) => setManualName(e.target.value)} className={inputBase} placeholder={t('player_full_name_placeholder')} />
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
                    <button type="button" onClick={saveManualEntry} className={btnSecondary}>
                        {editId ? t('update_record') : t('add_record')}
                    </button>
                    <button type="button" onClick={resetManual} className={btnSecondary}>
                        {t('reset')}
                    </button>
                </div>
            </div>

            {aliases.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 font-black text-slate-700 flex items-center justify-between">
                        <span>{t('integrations_players_aliases')}</span>
                        <span className="font-mono text-xs text-slate-500">{aliases.length}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {aliases.slice(0, 50).map(([from, to]) => (
                            <div key={from} className="px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-500">{t('from_label')}</div>
                                    <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{labelFromPlayerKey(from)}</div>
                                    <div className="text-xs font-bold text-slate-500 mt-2">{t('to_label')}</div>
                                    <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{labelFromPlayerKey(to)}</div>
                                </div>
                                <div className="shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => removeAlias(from)}
                                        className={btnSmDanger}
                                    >
                                        {t('remove')}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {aliases.length > 50 && (
                            <div className="px-4 py-3 text-xs font-bold text-slate-500">
                                {t('show_first_50_aliases')}
                            </div>
                        )}
                    </div>
                    <div className="px-4 py-3 text-[11px] font-bold text-slate-500 bg-slate-50">
                        {t('aliases_logic_note')}
                    </div>
                </div>
            )}

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

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between">
                    <span>{t('imported_records')}</span>
                    <span className="text-xs font-mono font-bold text-white/70">{entries.length}</span>
                </div>
                <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-700">
                            <tr>
                                <th className="text-left px-3 py-2 font-black">{t('name_label')}</th>
                                <th className="text-left px-3 py-2 font-black">{t('birth_label_short')}</th>
                                <th className="text-right px-3 py-2 font-black">{t('games')}</th>
                                <th className="text-right px-3 py-2 font-black">{t('points_baskets')}</th>
                                <th className="text-right px-3 py-2 font-black">{t('soffi')}</th>
                                <th className="text-left px-3 py-2 font-black">{t('team_or_source')}</th>
                                <th className="text-right px-3 py-2 font-black">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {entries.map(e => (
                                <tr key={e.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-bold">{e.name}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{formatBirthDateDisplay((e as any).birthDate) || t('nd_short')}</td>
                                    <td className="px-3 py-2 text-right font-mono">{e.games}</td>
                                    <td className="px-3 py-2 text-right font-mono">{e.points}</td>
                                    <td className="px-3 py-2 text-right font-mono">{e.soffi}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600 font-bold">{[e.teamName, e.source || ''].filter(Boolean).join(' · ')}</td>
                                    <td className="px-3 py-2 text-right">
                                        <button
                                            type="button"
                                            onClick={() => startEdit(e)}
                                            className={btnSmSecondary}
                                        >
                                            <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteEntry(e.id)}
                                            className={btnSmDanger}
                                        >
                                            {t('delete')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {entries.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-6 text-center text-slate-400 font-bold">
                                        {t('no_imported_records')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
