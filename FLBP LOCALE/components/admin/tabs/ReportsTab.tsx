import React from 'react';
import { flushSync } from 'react-dom';
import { ClipboardList, Upload, CheckCircle2, Play } from 'lucide-react';
import type { AppState } from '../../../services/storageService';
import type { Match, Team } from '../../../types';
import { canPlayMatch, getMatchParticipantIds, normalizeMatchCode, pickMatchForCode } from '../../../services/matchUtils';
import { compareTournamentMatches } from '../../../services/groupUtils';
import { useTranslation } from '../../../App';
import { focusReportField, handleReportFieldEnter, reportTieState } from '../../../services/reportEntry';
import { ReportScoreCards } from '../ReportEntryFeedback';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../../services/formInputUX';

export interface ReportsTabProps {
    state: AppState;

    reportMatchId: string;
    handlePickReportMatch: (matchId: string) => void;

    getTeamFromCatalog: (id?: string) => Team | undefined;
    getTeamName: (id?: string) => string;

    reportSaveNotice?: React.ReactNode;
    reportOcrScoreLabel?: string;
    resultsOnly: boolean;
    reportWinnerTeamId: string;
    setReportWinnerTeamId: (v: string) => void;

    reportStatsForm: Record<string, { canestri: string; soffi: string }>;
    setReportStatsForm: React.Dispatch<React.SetStateAction<Record<string, { canestri: string; soffi: string }>>>;

    handleSaveReport: () => void;
    reportSaveBusy: boolean;

    reportFileRef: React.RefObject<HTMLInputElement | null>;
    handleReportFile: (file: File) => void;

    reportImageBusy: boolean;
    reportImageUrl: string;
    setReportImageUrl: (v: string) => void;

    reportOcrBusy: boolean;
    reportOcrText: string;
    setReportOcrText: (v: string) => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
    state,
    reportMatchId,
    handlePickReportMatch,
    getTeamFromCatalog,
    getTeamName,
    reportSaveNotice,
    reportOcrScoreLabel,
    resultsOnly,
    reportWinnerTeamId,
    setReportWinnerTeamId,
    reportStatsForm,
    setReportStatsForm,
    handleSaveReport,
    reportSaveBusy,
    reportFileRef,
    handleReportFile,
    reportImageBusy,
    reportImageUrl,
    setReportImageUrl,
    reportOcrBusy,
    reportOcrText,
    setReportOcrText,
}) => {
    const [code, setCode] = React.useState('');
    const [codeError, setCodeError] = React.useState(false);
    const [duplicateCode, setDuplicateCode] = React.useState('');
    const codeRef = React.useRef<HTMLInputElement>(null);
    const matchSelectRef = React.useRef<HTMLSelectElement>(null);
    const fieldsRef = React.useRef<HTMLDivElement>(null);
    const [showOcrPanel, setShowOcrPanel] = React.useState(false);
    const { t } = useTranslation();

    React.useEffect(() => {
        if (reportImageBusy || reportImageUrl || reportOcrText.trim()) {
            setShowOcrPanel(true);
        }
    }, [reportImageBusy, reportImageUrl, reportOcrText]);

    React.useEffect(() => {
        if (reportMatchId) {
            focusReportField(fieldsRef.current);
        } else {
            setCode('');
            setCodeError(false);
            setDuplicateCode('');
            codeRef.current?.focus();
        }
    }, [reportMatchId]);

    const normalizeTeamId = (id: unknown) => (typeof id === 'string' ? id.trim().toUpperCase() : '');
    const isPlaceholderTeamId = (id: unknown) => {
        const up = normalizeTeamId(id);
        return up === 'BYE' || up === 'TBD' || up.startsWith('TBD-');
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xl font-black flex items-center gap-2">
                <ClipboardList className="w-5 h-5" /> {t('reports')}
            </h3>
            <div className="text-xs font-bold text-slate-500">
                {t('codes_live_tournament_label')}: {state.tournament ? t('yes_short') : t('no_short')} • {t('matches_label')}: {(state.tournamentMatches || []).length}
            </div>
        </div>

        {reportSaveNotice}

        {!state.tournament && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                {t('admin_no_live_guidance')}. {t('structure')} → <b>{t('start_live')}</b>.
            </div>
        )}

        {state.tournament && (
            <>
                {(() => {
                    const sourceMatches = state.tournamentMatches?.length ? state.tournamentMatches : state.tournament?.matches || [];
                    const msPlayable = sourceMatches.filter(canPlayMatch)
                        .sort(compareTournamentMatches(state.tournament));

                    const current = msPlayable.find(m => m.status === 'playing') || msPlayable.find(m => m.status === 'scheduled');
                    const tournamentComplete = msPlayable.length > 0 && msPlayable.every(m => m.status === 'finished');
                    const playing = msPlayable.find(m => m.status === 'playing');
                    const selected = reportMatchId ? msPlayable.find(m => m.id === reportMatchId) : undefined;

                    const formatOpt = (m: Match) => {
                        const ids = getMatchParticipantIds(m);
                        const names = ids.map(getTeamName);
                        const code = m.code || '-';
                        const status = t('match_status_' + m.status);
                        const tb = m.isTieBreak ? ` • ${t('reports_tiebreak_label')}${(typeof m.targetScore === 'number') ? ` ${t('reports_tiebreak_target').replace('{count}', String(m.targetScore))}` : ''}` : '';
                        return `${code} · ${names.join(' ' + t('versus_short') + ' ')}${tb} · ${status}`;
                    };

                    const matchesForSelect = duplicateCode
                        ? msPlayable.filter(m => normalizeMatchCode(m.code) === duplicateCode)
                        : msPlayable;
                    const openMatch = (match?: Match) => {
                        if (!match) return;
                        setDuplicateCode('');
                        setCodeError(false);
                        handlePickReportMatch(match.id);
                        requestAnimationFrame(() => focusReportField(fieldsRef.current));
                    };
                    const openCode = () => {
                        const normalized = normalizeMatchCode(code);
                        if (!normalized) {
                            openMatch(current);
                            return;
                        }
                        const hits = sourceMatches.filter(m => !m.hidden && normalizeMatchCode(m.code) === normalized);
                        const playable = hits.filter(canPlayMatch);
                        const match = pickMatchForCode(hits, playable);
                        if (playable.length > 1) {
                            flushSync(() => setDuplicateCode(normalized));
                            matchSelectRef.current?.focus();
                            try { matchSelectRef.current?.showPicker?.(); } catch { /* The focused select remains keyboard-accessible. */ }
                        } else if (match || playable.length === 1) {
                            openMatch(match || playable[0]);
                        } else {
                            setCodeError(true);
                        }
                    };

                    const selectedIds = selected ? getMatchParticipantIds(selected) : [];
                    const selectedTeams = selected
                        ? selectedIds.filter(id => id && !isPlaceholderTeamId(id)).map(id => getTeamFromCatalog(id)).filter(Boolean) as Team[]
                        : [];
                    const isMulti = !!selected && selectedIds.length >= 3;

                    const selectedHasPlaceholder = !!selected && (selectedIds.length < 2 || selectedIds.some(isPlaceholderTeamId));

                    const computeTeamScoreFromForm = (teamId: string, p1?: string, p2?: string) => {
                        const getCan = (playerName?: string) => {
                            if (!playerName) return 0;
                            const k = `${teamId}||${playerName}`;
                            const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
                            return Math.max(0, parseInt(f.canestri || '0', 10) || 0);
                        };
                        return getCan(p1) + getCan(p2);
                    };

                    const scores = selectedTeams.map(team => ({
                        id: team.id,
                        name: team.name || team.id,
                        score: computeTeamScoreFromForm(team.id, team.player1, team.player2),
                    }));
                    const { tied } = reportTieState(scores.map(team => team.score));
                    const saveDisabled = reportSaveBusy || selectedHasPlaceholder || (resultsOnly ? !reportWinnerTeamId : tied);
                    const fieldIndexByPlayer = new Map(selectedTeams.flatMap(team =>
                        [team.player1, team.player2].filter(Boolean).map(player => team.id + '||' + player)
                    ).map((key, index) => [key, index * 2]));

                    const renderPlayerRow = (teamId: string, playerName: string) => {
                        const k = `${teamId}||${playerName}`;
                        const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
                        const fieldIndex = fieldIndexByPlayer.get(k) ?? 0;
                        return (
                            <div key={k} className="grid grid-cols-2 gap-2 items-center py-2 sm:grid-cols-12 sm:py-1">
                                <div className="col-span-2 min-w-0 font-black text-xs leading-tight text-slate-800 whitespace-normal break-words sm:col-span-6">{playerName}</div>
                                <div className="col-span-1 sm:col-span-3">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={f.canestri}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/[^0-9]/g, '');
                                            setReportStatsForm(prev => ({
                                                ...prev,
                                                [k]: { ...(prev[k] || { canestri: '0', soffi: '0' }), canestri: v }
                                            }));
                                        }}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-black"
                                        aria-label={`${playerName} · ${t('points')}`}
                                        data-report-field-index={fieldIndex}
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                    />
                                </div>
                                <div className="col-span-1 sm:col-span-3">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={f.soffi}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/[^0-9]/g, '');
                                            setReportStatsForm(prev => ({
                                                ...prev,
                                                [k]: { ...(prev[k] || { canestri: '0', soffi: '0' }), soffi: v }
                                            }));
                                        }}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-black"
                                        aria-label={`${playerName} · ${t('soffi')}`}
                                        data-report-field-index={fieldIndex + 1}
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                    />
                                </div>
                            </div>
                        );
                    };

                    const renderStatsHeader = () => (
                        <div className="hidden sm:grid grid-cols-12 gap-2 items-center pb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                            <div className="col-span-6">{t('player_label')}</div>
                            <div className="col-span-3 text-center">{t('points')}</div>
                            <div className="col-span-3 text-center">{t('soffi')}</div>
                        </div>
                    );

                    return (
                        <div className="space-y-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                        <div className="font-black text-slate-900">{t('reports_select_match_step')}</div>
                                        <div className="text-[11px] font-bold text-slate-500 mt-1">
                                            {t('reports_match_step_desc')}
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-bold text-slate-500">
                                        {t('reports_matches_shown').replace('{shown}', String(matchesForSelect.length)).replace('{total}', String(msPlayable.length))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-[10rem_minmax(0,1fr)_auto]">
                                    <div>
                                        <input ref={codeRef}
                                            value={code}
                                            aria-label={t('reports_code_placeholder')}
                                            aria-invalid={codeError}
                                            autoCapitalize="characters"
                                            autoComplete="off"
                                            onChange={event => {
                                                setCode(event.target.value.toUpperCase());
                                                setCodeError(false);
                                                setDuplicateCode('');
                                            }}
                                            onKeyDown={event => {
                                                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                                                event.preventDefault();
                                                openCode();
                                            }}
                                            placeholder={t('reports_code_placeholder')}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-bold focus-visible:ring-2 focus-visible:ring-beer-500"
                                        />
                                        {codeError && <p role="status" className="mt-1 text-xs font-bold text-red-700">{t('referees_err_code_not_found')}</p>}
                                    </div>

                                    <div>
                                        <select ref={matchSelectRef}
                                            aria-label={t('reports_select_match_option')}
                                            value={duplicateCode ? '' : selected?.id || ''}
                                            onChange={event => {
                                                const match = msPlayable.find(m => m.id === event.target.value);
                                                if (match) openMatch(match);
                                                else handlePickReportMatch('');
                                            }}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                        >
                                            <option value="">{t('reports_select_match_option')}</option>
                                            {matchesForSelect.map(m => (
                                                <option key={m.id} value={m.id}>{formatOpt(m)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openMatch(current)}
                                            disabled={!current}
                                            className={`min-h-[44px] flex-1 px-3 py-2 rounded-xl font-black border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${current ? 'border-slate-200 bg-white hover:bg-slate-100' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                            title={tournamentComplete ? t('backup_status_complete') : t('reports_pick_next_match')}
                                        >
                                            {tournamentComplete ? t('backup_status_complete') : t('reports_next_match')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openMatch(playing)}
                                            disabled={!playing}
                                            className={`min-h-[44px] px-3 py-2 rounded-xl font-black border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center justify-center ${playing ? 'border-slate-200 bg-white hover:bg-slate-100' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                            aria-label={t('reports_go_playing_match')}
                                            title={playing ? t('reports_go_playing_match') : t('reports_no_playing_match')}
                                        >
                                            <Play className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                {!selected && current?.code && (
                                    <p className="text-xs font-bold text-slate-600">{t('reports_suggested_code').replace('{code}', current.code)}</p>
                                )}
                                <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                        {t('reports_live_code')}: <span className="font-mono">{playing?.code || '-'}</span>
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                        {t('reports_flow_state')}: {selected ? t('reports_flow_selected') : t('reports_flow_open')}
                                    </span>
                                </div>
                            </div>

                            {!selected && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div className="font-black text-slate-700">{t('reports_select_match_prompt')}</div>
                                </div>
                            )}

                            {selected && (
                                <div className="space-y-4">
                                    <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-white">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="font-black text-slate-900">
                                                {(selected.code || '-')}{' '}
                                                {selected.isTieBreak && (
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${selectedTeams.length >= 3 ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                        {t('reports_tiebreak_label')}{selectedTeams.length >= 3 ? ` ${t('reports_tiebreak_multi')}` : ''}{typeof selected.targetScore === 'number' ? ` ${t('reports_tiebreak_target').replace('{count}', String(selected.targetScore))}` : ''}
                                                    </span>
                                                )}
                                                
                                                <span className="text-slate-400">•</span>{' '}
                                                {isMulti
                                                    ? selectedIds.map(id => getTeamName(id)).join(' vs ')
                                                    : (<>{getTeamName(selected.teamAId)} <span className="text-slate-400">{t('versus_short')}</span> {getTeamName(selected.teamBId)}</>)}
                                            </div>
                                            <div className="text-xs font-bold text-slate-500 uppercase">
                                                {selected.phase === 'groups' ? t('reports_phase_groups') : t('reports_phase_bracket')} · {t('match_status_' + selected.status)}
                                            </div>
                                        </div>

                                        {resultsOnly ? (
                                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                                <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">
                                                    {t('results_only_report_title')}
                                                </div>
                                                <div className="mt-1 text-sm font-bold text-amber-950">
                                                    {t('results_only_report_desc')}
                                                </div>
                                                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                    {selectedTeams.map((tt) => {
                                                        const active = reportWinnerTeamId === tt.id;
                                                        return (
                                                            <button
                                                                key={tt.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setReportWinnerTeamId(tt.id);
                                                                    setReportStatsForm({});
                                                                }}
                                                                className={`min-h-[64px] rounded-2xl border px-4 py-3 text-left font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${
                                                                    active
                                                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm'
                                                                        : 'border-white bg-white text-slate-800 hover:border-amber-300'
                                                                }`}
                                                            >
                                                                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                                                                    {active ? t('winner') : t('select_winner')}
                                                                </span>
                                                                <span className="block mt-1 whitespace-normal break-words">{tt.name || tt.id}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <ReportScoreCards scores={scores} tieMessage={t('alert_tie_not_allowed')} />
                                        )}

                                        {!resultsOnly && (
                                        <div ref={fieldsRef}
                                            onKeyDown={event => handleReportFieldEnter(event, { tied, canSave: !saveDisabled, save: handleSaveReport })}
                                            className="border-t border-slate-100 pt-3 space-y-3">
                                            <div className="font-black text-slate-800">{t('statistics')}</div>

                                            {!isMulti ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                                        <div className="mb-2 flex items-center justify-between gap-3">
                                                            <div className="font-black text-xs text-slate-700 uppercase">{getTeamName(selected.teamAId)}</div>
                                                        </div>
                                                        {selected.teamAId && selected.teamAId !== 'BYE' && (
                                                            <>
                                                                {renderStatsHeader()}
                                                                {getTeamFromCatalog(selected.teamAId)?.player1 && renderPlayerRow(selected.teamAId, getTeamFromCatalog(selected.teamAId)?.player1 || '')}
                                                                {getTeamFromCatalog(selected.teamAId)?.player2 && renderPlayerRow(selected.teamAId, getTeamFromCatalog(selected.teamAId)?.player2 || '')}
                                                            </>
                                                        )}
                                                        {!selected.teamAId && <div className="text-xs text-slate-400 font-bold">{t('not_available_short')}</div>}
                                                    </div>

                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                                        <div className="mb-2 flex items-center justify-between gap-3">
                                                            <div className="font-black text-xs text-slate-700 uppercase">{getTeamName(selected.teamBId)}</div>
                                                        </div>
                                                        {selected.teamBId && selected.teamBId !== 'BYE' && (
                                                            <>
                                                                {renderStatsHeader()}
                                                                {getTeamFromCatalog(selected.teamBId)?.player1 && renderPlayerRow(selected.teamBId, getTeamFromCatalog(selected.teamBId)?.player1 || '')}
                                                                {getTeamFromCatalog(selected.teamBId)?.player2 && renderPlayerRow(selected.teamBId, getTeamFromCatalog(selected.teamBId)?.player2 || '')}
                                                            </>
                                                        )}
                                                        {!selected.teamBId && <div className="text-xs text-slate-400 font-bold">{t('not_available_short')}</div>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {selectedTeams.map(tt => (
                                                        <div key={tt.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                                <div className="min-w-0 flex-1 font-black text-xs uppercase leading-tight text-slate-700 whitespace-normal break-words">{tt.name || tt.id}</div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="text-xs font-mono font-black text-slate-600">{computeTeamScoreFromForm(tt.id, tt.player1, tt.player2)}</div>
                                                                </div>
                                                            </div>
                                                            {tt.id && tt.id !== 'BYE' && (
                                                                <>
                                                                    {renderStatsHeader()}
                                                                    {tt.player1 && renderPlayerRow(tt.id, tt.player1)}
                                                                    {tt.player2 && renderPlayerRow(tt.id, tt.player2)}
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {!selectedTeams.length && (
                                                        <div className="text-xs text-slate-400 font-bold">{t('not_available_short')}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (saveDisabled) return;
                                                handleSaveReport();
                                            }}
                                            disabled={saveDisabled}
                                            className={`sticky bottom-3 z-10 w-full py-3 rounded-xl font-black uppercase transition flex items-center justify-center gap-2 sm:static ${
                                                saveDisabled
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    : 'bg-beer-500 text-white hover:bg-beer-600'
                                            }`}
                                        >
                                            <CheckCircle2 className="w-5 h-5" /> {reportSaveBusy ? t('referees_save_busy') : t('referees_save_report')}
                                        </button>

                                        {selectedHasPlaceholder && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 font-bold text-sm">
                                                {t('report_not_available_tbd')} <b>TBD</b> ({t('placeholder_word')}).
                                            </div>
                                        )}
                                    </div>

                                    {!resultsOnly && (
                                    <div className="border border-slate-200 rounded-xl bg-white">
                                        <button
                                            type="button"
                                            onClick={() => setShowOcrPanel(v => !v)}
                                            className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left"
                                        >
                                            <div>
                                                <div className="text-[11px] font-black text-slate-500 uppercase">{t('optional_support')}</div>
                                                <div className="font-black text-slate-900">{t('photo_ocr')}</div>
                                            </div>
                                            <div className="text-xs font-black text-slate-500">
                                                {showOcrPanel ? t('hide') : t('report_show')}
                                            </div>
                                        </button>

                                        {showOcrPanel && (
                                            <div className="border-t border-slate-100 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div className="text-[11px] font-bold text-slate-500">
                                                        La foto aiuta la lettura. L'OCR resta solo un supporto manuale.
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => reportFileRef.current?.click()}
                                                            className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                                        >
                                                            <Upload className="w-4 h-4" /> Carica foto
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setReportImageUrl('')}
                                                            disabled={!reportImageUrl || reportImageBusy}
                                                            className={`px-3 py-2 rounded-xl font-black border focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${(!reportImageUrl || reportImageBusy) ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                        >
                                                            Pulisci
                                                        </button>
                                                    </div>
                                                </div>

                                                <input
                                                    ref={reportFileRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        e.currentTarget.value = '';
                                                        if (f) handleReportFile(f);
                                                    }}
                                                />

                                                {reportImageBusy && (
                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                                                        Elaborazione immagine...
                                                    </div>
                                                )}

                                                {!reportImageBusy && !reportImageUrl && (
                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                                                        Carica una foto del referto: verra' allineata automaticamente per aiutarti nella lettura.
                                                    </div>
                                                )}

                                                {!reportImageBusy && reportImageUrl && (
                                                    <div className="bg-white border border-slate-200 rounded-xl p-2 space-y-2 sm:overflow-auto">
                                                        <img src={reportImageUrl} alt="Referto allineato" className="w-full h-auto rounded-lg" />
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-xs font-black text-slate-600 uppercase">
                                                                {t('ocr_beta')}{reportOcrScoreLabel && <span className="ml-2 font-mono">{reportOcrScoreLabel}</span>}
                                                            </div>
                                                            {reportOcrBusy && <div className="text-xs font-bold text-slate-500">{t('ocr_reading')}</div>}
                                                        </div>
                                                        <textarea
                                                            value={reportOcrText}
                                                            onChange={(e) => setReportOcrText(e.target.value)}
                                                            placeholder={t('ocr_text_placeholder')}
                                                            className="w-full h-32 border border-slate-200 rounded-lg px-2 py-2 text-xs font-mono text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </>
        )}
    </div>
    );
};
