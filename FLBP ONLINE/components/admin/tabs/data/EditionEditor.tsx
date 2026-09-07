import { downloadBlob } from '../../../../services/adminDownloadUtils';
import React from 'react';
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import type { HallOfFameEntry, IntegrationScorerEntry } from '../../../../types';
import { buildPlayerProfileSnapshots, getHallOfFamePlayerRefs } from '../../../../services/playerDataProvenance';
import { getPlayerKey, getPlayerKeyLabel, isU25, normalizeBirthDateInput, formatBirthDateDisplay } from '../../../../services/playerIdentity';
import { listEditions, editionHasResults, editionMatches, rankEditionScorers, replaceEditionScorers, validateEditionAwards } from '../../../../services/editionData';
import { syncTournamentAwardsToHallOfFame } from '../../../../services/storageService';
import { removeArchivedTournamentDeep } from '../../../../services/archiveCascadeDelete';
import { readScorersFile } from '../../../../services/scorersImport';
import { uuid } from '../../../../services/id';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';
import { PlayerPickerCombobox, emptyEditionPlayer, type EditionPlayer } from '../../editor/PlayerPickerCombobox';

type AwardType = HallOfFameEntry['type'];
const categories: AwardType[] = ['winner', 'mvp', 'top_scorer', 'defender', 'top_scorer_u25', 'defender_u25'];
const labelKey = (type: AwardType) => `edition_award_${type}`;
type ScorerDraft = IntegrationScorerEntry & { playerConfirmed?: boolean; birthInput?: string };
interface TitleDraft { key: string; original?: HallOfFameEntry; type: AwardType; teamName: string; players: EditionPlayer[]; value: string }
const playerFromEntry = (entry: HallOfFameEntry, index: number): EditionPlayer => {
    const name = entry.playerNames[index] || '';
    const playerId = entry.playerIds?.[index] || (index === 0 ? entry.playerId : '') || '';
    const birthDate = entry.playerBirthDates?.[index] || entry.playerBirthDate || (playerId ? normalizeBirthDateInput(getPlayerKeyLabel(playerId).yob) : '') || '';
    return { name, birthDate: formatBirthDateDisplay(birthDate) || '', playerId: playerId || getPlayerKey(name, birthDate || 'ND'), confirmed: true };
};

export const EditionEditor: React.FC<Pick<DataTabProps, 'state' | 'setState' | 't'> & {
    editionId?: string;
    onBack: () => void;
    onSaved: (id?: string) => void;
    onDirtyChange: (dirty: boolean) => void;
}> = ({ state, setState, t, editionId, onBack, onSaved, onDirtyChange }) => {
    const [initial] = React.useState(() => listEditions(state).find(row => row.id === editionId));
    const [id] = React.useState(() => editionId || `manual_${uuid()}`);
    const [name, setName] = React.useState(initial?.name || '');
    const [date, setDate] = React.useState(normalizeBirthDateInput(initial?.date || '') || '');
    const [titles, setTitles] = React.useState<TitleDraft[]>(() => (initial?.awards || []).map(entry => ({
        key: entry.id, original: entry, type: entry.type, teamName: entry.teamName || '', value: entry.value == null ? '' : String(entry.value),
        players: Array.from({ length: Math.max(entry.type === 'winner' ? 2 : 1, entry.playerNames.length) }, (_, i) => playerFromEntry({ ...entry, playerIds: getHallOfFamePlayerRefs(state, entry).map(ref => ref.rawPlayerId) }, i)),
    })));
    const [scorers, setScorers] = React.useState<ScorerDraft[]>(initial?.scorers || []);
    const [importChanged, setImportChanged] = React.useState(false);
    const [section, setSection] = React.useState<'setup' | 'awards' | 'scorers'>('setup');
    const [dirty, setDirty] = React.useState(false);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [preview, setPreview] = React.useState<HallOfFameEntry[] | null>(null);
    const [deleting, setDeleting] = React.useState(false);
    const profiles = React.useMemo(() => buildPlayerProfileSnapshots(state), [state]);
    const hasResults = editionHasResults(state, id);
    const resultsOnly = !!initial?.tournament?.config?.resultsOnly;
    const locked = (type: AwardType) => type !== 'mvp' && hasResults;
    const disabledCategory = (type: AwardType) => (resultsOnly && type !== 'winner' && type !== 'mvp') || (initial?.tournament?.includeU25Awards === false && type.endsWith('_u25'));
    const input = 'w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-beer-500 disabled:bg-slate-100';
    const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-beer-500 disabled:opacity-50';

    React.useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
    React.useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    const changed = () => { setDirty(true); setError(''); };
    const updateTitle = (key: string, patch: Partial<TitleDraft>) => { setTitles(rows => rows.map(row => row.key === key ? { ...row, ...patch } : row)); changed(); };
    const addTitle = (type: AwardType) => { setTitles(rows => [...rows, { key: uuid(), type, teamName: '', players: Array.from({ length: type === 'winner' ? 2 : 1 }, emptyEditionPlayer), value: '' }]); changed(); };

    const checkPlayer = (player: EditionPlayer) => {
        if (!player.name.trim()) return;
        if (!player.confirmed) throw new Error('edition_choose_player');
        if (player.birthDate && !normalizeBirthDateInput(player.birthDate)) throw new Error('edition_birth_date_invalid');
    };
    const buildEntries = (): HallOfFameEntry[] => {
        const entries = titles.map(row => {
            if (locked(row.type) && row.original) return row.original;
            row.players.forEach(checkPlayer);
            const players = row.players.filter(player => player.name.trim());
            if (row.value && (!/^\d+$/.test(row.value) || !Number.isSafeInteger(Number(row.value)))) throw new Error('edition_import_invalid_number');
            const entry: HallOfFameEntry = {
                ...row.original, id: row.original?.id || `${id}_${row.type}_${row.key}`, tournamentId: id, tournamentName: name.trim(),
                year: date.slice(0, 4) || initial?.year || '', type: row.type, teamName: row.teamName.trim() || undefined,
                playerNames: players.map(player => player.name.trim()),
                playerIds: players.map(player => player.playerId || getPlayerKey(player.name, player.birthDate || 'ND')),
                playerBirthDates: players.map(player => normalizeBirthDateInput(player.birthDate) || ''),
                playerId: row.type === 'winner' ? undefined : players[0]?.playerId,
                playerBirthDate: row.type === 'winner' ? undefined : normalizeBirthDateInput(players[0]?.birthDate || ''),
                value: row.value ? Number(row.value) : undefined,
                sourceType: initial?.tournament ? 'archived_tournament' : 'manual', sourceTournamentId: id,
                sourceTournamentName: name.trim(), sourceTournamentDate: date || row.original?.sourceTournamentDate,
                sourceAutoGenerated: false, manuallyEdited: true,
            };
            const existingUnchanged = row.original && row.original.playerNames[0] === entry.playerNames[0]
                && (row.original.playerBirthDate || '') === (entry.playerBirthDate || '') && date === (normalizeBirthDateInput(initial?.date || '') || '');
            if (row.type.endsWith('_u25') && !existingUnchanged && !isU25(entry.playerBirthDate, date)) throw new Error('edition_u25_invalid');
            return entry;
        });
        validateEditionAwards(name, date, entries, !!initial && !normalizeBirthDateInput(initial.date?.slice(0, 10) || '') && !date);
        if (importChanged) {
            scorers.forEach(entry => {
                if (entry.playerConfirmed === false) throw new Error('edition_choose_player');
                if (entry.birthInput && !normalizeBirthDateInput(entry.birthInput)) throw new Error('edition_birth_date_invalid');
                if ((entry.points > 0 || entry.soffi > 0) && entry.games <= 0) throw new Error('edition_import_games_required');
                if (!Number.isSafeInteger(entry.games) || entry.games < 0) throw new Error('edition_import_invalid_number');
            });
            replaceEditionScorers(state, id, name, date, scorers);
        }
        return entries.map(entry => ({ ...entry, tournamentName: name.trim(), year: date.slice(0, 4) || entry.year, sourceTournamentDate: date || entry.sourceTournamentDate, sourceTournamentName: name.trim() }));
    };
    const review = () => { try { setError(''); setPreview(buildEntries()); } catch (e) { setError(t((e as Error).message)); } };
    const save = () => {
        try {
            // Revalidate against current results in case the edition changed while the form was open.
            const entries = buildEntries();
            let next = {
                ...state,
                tournamentHistory: (state.tournamentHistory || []).map(row => row.id === id ? { ...row, name: name.trim(), startDate: date || row.startDate } : row),
                hallOfFame: [...(state.hallOfFame || []).filter(row => row.tournamentId !== id), ...entries],
                integrationsScorers: importChanged ? replaceEditionScorers(state, id, name.trim(), date, scorers.map(({ playerConfirmed, birthInput, ...entry }) => entry)) : (state.integrationsScorers || []).map(row => row.sourceTournamentId === id ? { ...row, sourceLabel: name.trim(), sourceTournamentDate: date || row.sourceTournamentDate } : row),
            };
            const tournament = next.tournamentHistory.find(row => row.id === id);
            if (tournament) next.hallOfFame = syncTournamentAwardsToHallOfFame(next.hallOfFame, tournament, editionMatches(next, id), tournament.teams || []);
            setState(next); setDirty(false); onDirtyChange(false); setPreview(null); onSaved(id);
        } catch (e) { setPreview(null); setError(t((e as Error).message)); }
    };
    const remove = () => {
        const next = initial?.tournament ? removeArchivedTournamentDeep(state, id).state : state;
        setState({ ...next, hallOfFame: (next.hallOfFame || []).filter(row => row.tournamentId !== id), integrationsScorers: (next.integrationsScorers || []).filter(row => row.sourceTournamentId !== id) });
        onDirtyChange(false); onSaved();
    };
    const importFile = async (file: File) => {
        setLoading(true); setError('');
        try {
            if (hasResults) throw new Error('edition_import_has_results');
            const rows = await readScorersFile(file);
            if (!rows.length) throw new Error('edition_import_empty');
            setScorers(rows); setImportChanged(true); changed();
        } catch (e) { setError(t((e as Error).message)); }
        finally { setLoading(false); }
    };
    const proposeAwards = () => {
        if (scorers.some(row => row.playerConfirmed === false)) { setError(t('edition_choose_player')); return; }
        if (!date) { setError(t('edition_date_required')); return; }
        const generated: TitleDraft[] = [];
        (['top_scorer', 'defender', 'top_scorer_u25', 'defender_u25'] as AwardType[]).forEach(type => {
            if (disabledCategory(type)) return;
            const metric = type.startsWith('top') ? 'points' : 'soffi';
            rankEditionScorers(state, scorers, date, metric, type.endsWith('_u25')).forEach(player => generated.push({
                key: uuid(), type, teamName: player.teamName || '', value: String(player[metric]),
                players: [{ name: player.name, birthDate: formatBirthDateDisplay(player.birthDate) || '', playerId: player.playerId || getPlayerKey(player.name, player.birthDate || 'ND'), confirmed: true }],
            }));
        });
        setTitles(rows => [...rows.filter(row => row.type === 'winner' || row.type === 'mvp'), ...generated]);
        changed(); setSection('awards');
    };

    return <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={button} onClick={onBack}><ArrowLeft size={16} />{t('edition_list')}</button>
            <h3 className="text-lg font-black text-slate-900">{initial ? initial.name : t('edition_new')}</h3>
            {!!initial && !initial.live && <button type="button" className={`${button} text-rose-700`} onClick={() => setDeleting(true)}><Trash2 size={16} />{t('delete')}</button>}
        </div>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900">{error}</div>}
        <nav className="flex flex-wrap gap-2" aria-label={t('edition_sections')}>
            {(['setup', 'awards', 'scorers'] as const).map(key => <button type="button" key={key} onClick={() => setSection(key)} aria-current={section === key ? 'step' : undefined} className={`${button} ${section === key ? '!border-slate-900 !bg-slate-900 !text-white' : ''}`}>{t(`edition_section_${key}`)}{key === 'awards' ? ` (${titles.length})` : key === 'scorers' ? ` (${scorers.length})` : ''}</button>)}
        </nav>
        {section === 'setup' && <div className="grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-bold">{t('edition_name')}<input className={input} value={name} onChange={e => { setName(e.target.value); changed(); }} /></label>
            <label className="space-y-2 text-sm font-bold">{t('edition_date')}<input type="date" className={input} value={date} onChange={e => { setDate(e.target.value); changed(); }} /></label>
            <p className="text-sm text-slate-600 sm:col-span-2">{t('edition_required_hint')}</p>
        </div>}
        {section === 'awards' && <div className="space-y-4">
            {hasResults && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{t('edition_results_locked')}</p>}
            {categories.map(type => <div key={type} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black text-slate-900">{t(labelKey(type))}</h4><button type="button" className={button} disabled={locked(type) || disabledCategory(type)} onClick={() => addTitle(type)}><Plus size={16} />{t(titles.some(row => row.type === type) ? 'edition_add_tie' : 'edition_add_award')}</button></div>
                {titles.filter(row => row.type === type).map(row => <div key={row.key} className="space-y-3 rounded-xl bg-slate-50 p-3">
                    <div className="flex gap-2"><label className="min-w-0 flex-1 text-xs font-bold">{t('team_name')}<input className={input} disabled={locked(type)} value={row.teamName} onChange={e => updateTitle(row.key, { teamName: e.target.value })} /></label>
                        {!locked(type) && <button type="button" className={button} aria-label={t('edition_remove_award')} onClick={() => { setTitles(rows => rows.filter(item => item.key !== row.key)); changed(); }}><Trash2 size={16} /></button>}
                    </div>
                    <div className={`grid gap-4 ${type === 'winner' ? 'sm:grid-cols-2' : ''}`}>{row.players.map((player, index) => <PlayerPickerCombobox key={index} value={player} profiles={profiles} t={t} disabled={locked(type)} label={`${t('player_label')} ${index + 1}`} onChange={value => updateTitle(row.key, { players: row.players.map((current, i) => i === index ? value : current) })} />)}</div>
                    {type !== 'winner' && type !== 'mvp' && <label className="block text-xs font-bold">{t(type.startsWith('top') ? 'points' : 'soffi')}<input type="number" min="0" step="1" className={input} disabled={locked(type)} value={row.value} onChange={e => updateTitle(row.key, { value: e.target.value })} /></label>}
                </div>)}
            </div>)}
        </div>}
        {section === 'scorers' && <div className="space-y-4 rounded-2xl border bg-white p-4">
            <p className="text-sm text-slate-600">{t(hasResults ? 'edition_import_has_results' : 'edition_import_hint')}</p>
            <p className="text-sm text-slate-600">{t('edition_tie_rule')}</p>
            {!hasResults && <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={button} onClick={() => downloadBlob(new Blob(['\uFEFFNome;Cognome;DataNascita;Squadra;Partite;Canestri;Soffi\n'], { type: 'text/csv;charset=utf-8' }), 'modello_marcatori.csv')}>{t('hof_bundle_download_template')}</button>
                <label className={button}><Upload size={16} />{t('edition_import')}<input type="file" accept=".csv,.xlsx,.xls" disabled={loading} className="max-w-full text-xs" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importFile(file); }} /></label>
                <button type="button" className={button} disabled={!scorers.length || loading} onClick={proposeAwards}>{t('edition_propose_awards')}</button>
                {!!scorers.length && <button type="button" className={button} onClick={() => { setScorers([]); setImportChanged(true); changed(); }}>{t('edition_clear_import')}</button>}
            </div>}
            {!!scorers.length && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['player_label', 'games', 'points', 'soffi'].map(key => <th className="p-2" key={key}>{t(key)}</th>)}</tr></thead><tbody>{scorers.map(row => <tr key={row.id} className="border-t"><td className="min-w-64 p-2">
                <PlayerPickerCombobox label={t('player_label')} t={t} profiles={profiles} disabled={hasResults} value={{ name: row.name, birthDate: row.birthInput ?? formatBirthDateDisplay(row.birthDate) ?? '', playerId: getPlayerKey(row.name, row.birthDate || 'ND'), confirmed: row.playerConfirmed !== false }} onChange={player => {
                    setScorers(rows => rows.map(item => item.id === row.id ? { ...item, name: player.name, birthDate: normalizeBirthDateInput(player.birthDate), birthInput: player.birthDate, playerConfirmed: player.confirmed, yob: undefined } : item)); setImportChanged(true); changed();
                }} />
            </td>{(['games', 'points', 'soffi'] as const).map(metric => <td className="p-2" key={metric}>{row[metric]}</td>)}</tr>)}</tbody></table></div>}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><p className="text-sm text-slate-600">{titles.length} {t('edition_titles')} · {scorers.length} {t('scorers_label')}</p><button type="button" disabled={loading} className={`${button} !bg-blue-700 !text-white`} onClick={review}>{t('edition_review')}</button></div>
        <AdminDataConfirmModal open={!!preview} tone="info" title={t('edition_review')} description={`${name} · ${date || initial?.year || ''}`} confirmLabel={t('save_changes')} cancelLabel={t('back')} onClose={() => setPreview(null)} onConfirm={save}>
            <ul className="space-y-2">{preview?.map(entry => <li key={entry.id} className="rounded-lg bg-slate-50 p-2 text-sm"><strong>{t(labelKey(entry.type))}</strong> · {entry.teamName} · {entry.playerNames.join(', ')}{entry.value != null ? ` · ${entry.value}` : ''}</li>)}</ul>
            {importChanged && <p className="mt-3 text-sm font-bold">{t('edition_import_replaces').replace('{count}', String(scorers.length))}</p>}
        </AdminDataConfirmModal>
        <AdminDataConfirmModal open={deleting} title={t('edition_delete')} description={t('edition_delete_hint').replace('{name}', name)} confirmLabel={t('delete')} cancelLabel={t('cancel')} onClose={() => setDeleting(false)} onConfirm={remove} summaryItems={[{ label: t('edition_titles'), value: initial?.awards.length || 0 }, { label: t('scorers_label'), value: initial?.scorers.length || 0 }]} />
    </section>;
};
