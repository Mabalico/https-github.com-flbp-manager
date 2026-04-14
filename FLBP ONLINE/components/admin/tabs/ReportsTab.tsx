import React from 'react';
import { ClipboardList, Upload, CheckCircle2, Search, X, Play } from 'lucide-react';
import type { AppState } from '../../../services/storageService';
import type { Match, Team } from '../../../types';
import { getMatchParticipantIds } from '../../../services/matchUtils';
import { useTranslation } from '../../../App';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../../services/formInputUX';

export interface ReportsTabProps {
    state: AppState;

    reportMatchId: string;
    handlePickReportMatch: (matchId: string) => void;

    getTeamFromCatalog: (id?: string) => Team | undefined;
    getTeamName: (id?: string) => string;

    reportStatus: 'scheduled' | 'playing' | 'finished';
    setReportStatus: (v: 'scheduled' | 'playing' | 'finished') => void;

    reportScoreA: string;
    setReportScoreA: (v: string) => void;
    reportScoreB: string;
    setReportScoreB: (v: string) => void;

    resultsOnly: boolean;
    reportWinnerTeamId: string;
    setReportWinnerTeamId: (v: string) => void;

    reportStatsForm: Record<string, { canestri: string; soffi: string }>;
    setReportStatsForm: React.Dispatch<React.SetStateAction<Record<string, { canestri: string; soffi: string }>>>;

    handleSaveReport: () => void;

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
    reportStatus,
    setReportStatus,
    reportScoreA,
    setReportScoreA,
    reportScoreB,
    setReportScoreB,
    resultsOnly,
    reportWinnerTeamId,
    setReportWinnerTeamId,
    reportStatsForm,
    setReportStatsForm,
    handleSaveReport,
    reportFileRef,
    handleReportFile,
    reportImageBusy,
    reportImageUrl,
    setReportImageUrl,
    reportOcrBusy,
    reportOcrText,
    setReportOcrText,
}) => {
    const [matchQuery, setMatchQuery] = React.useState('');
    const [showOcrPanel, setShowOcrPanel] = React.useState(false);
    const { t } = useTranslation();

    React.useEffect(() => {
        if (reportImageBusy || reportImageUrl || reportOcrText.trim()) {
            setShowOcrPanel(true);
        }
    }, [reportImageBusy, reportImageUrl, reportOcrText]);

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

        {!state.tournament && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                {t('admin_no_live_guidance')}. {t('structure')} → <b>{t('start_live')}</b>.
            </div>
        )}

        {state.tournament && (
            <>
                {(() => {
                    const teamMap = new Map((state.teams || []).map(t => [t.id, t.name]));
                    const msAll = [...(state.tournamentMatches || [])]
                        .sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER));

                    // Guardrail: BYE invisibili e TBD esclusi dai flussi referto.
                    const msPlayable = msAll
                        .filter(m => !(m as any).hidden)
                        .filter(m => !m.isBye)
                        .filter(m => {
                            const ids = getMatchParticipantIds(m);
                            return ids.length >= 2 && !ids.some(isPlaceholderTeamId);
                        });

                    const current = msPlayable.find(m => m.status === 'playing') || msPlayable.find(m => m.status === 'scheduled') || msPlayable[0];
                    const playing = msPlayable.find(m => m.status === 'playing');
                    const selected = reportMatchId ? msPlayable.find(m => m.id === reportMatchId) : undefined;

                    const formatOpt = (m: Match) => {
                        const ids = getMatchParticipantIds(m);
                        const names = ids.map(id => id ? (teamMap.get(id) || id) : 'TBD');
                        const code = m.code || '-';
                        const status = m.status.toUpperCase();
                        const tb = m.isTieBreak ? ` • ${t('reports_tiebreak_label')}${(typeof m.targetScore === 'number') ? ` ${t('reports_tiebreak_target', { count: String(m.targetScore) })}` : ''}` : '';
                        return `${code} • ${names.join(' vs ')}${tb} • ${status}`;
                    };

                    const normalizedQuery = matchQuery.trim().toLowerCase();
                    const matchesForSelect = normalizedQuery
                        ? msPlayable.filter(m => {
                            const ids = getMatchParticipantIds(m);
                            const names = ids.map(id => id ? (teamMap.get(id) || id) : 'TBD');
                            const hay = `${m.code || ''} ${names.join(' ')} ${m.status}`.toLowerCase();
                            return hay.includes(normalizedQuery);
                        })
                        : msPlayable;

                    const selectedIds = selected ? getMatchParticipantIds(selected) : [];
                    const selectedTeams = selected
                        ? selectedIds.filter(id => id && !isPlaceholderTeamId(id)).map(id => getTeamFromCatalog(id)).filter(Boolean) as Team[]
                        : [];
                    const isMulti = !!selected && selectedIds.length >= 3;

                    const selectedHasPlaceholder = !!selected && (selectedIds.length < 2 || selectedIds.some(isPlaceholderTeamId));
                    const saveDisabled = selectedHasPlaceholder || (resultsOnly && !reportWinnerTeamId);

                    const computeTeamScoreFromForm = (teamId: string, p1?: string, p2?: string) => {
                        const getCan = (playerName?: string) => {
                            if (!playerName) return 0;
                            const k = `${teamId}||${playerName}`;
                            const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
                            return Math.max(0, parseInt(f.canestri || '0', 10) || 0);
                        };
                        return getCan(p1) + getCan(p2);
                    };

                    const renderPlayerRow = (teamId: string, playerName: string) => {
                        const k = `${teamId}||${playerName}`;
                        const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
                        return (
                            <div key={k} className="grid grid-cols-2 gap-2 items-center py-2 sm:grid-cols-12 sm:py-1">
                                <div className="col-span-2 min-w-0 font-black text-xs leading-tight text-slate-800 whitespace-normal break-words sm:col-span-6">{playerName}</div>
                                <div className="col-span-1 sm:col-span-3">
                                    <input
                                        type="number"
                                        min={0}
                                        value={f.canestri}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setReportStatsForm(prev => ({
                                                ...prev,
                                                [k]: { ...(prev[k] || { canestri: '0', soffi: '0' }), canestri: v }
                                            }));
                                        }}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-black"
                                        placeholder="CAN"
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                    />
                                </div>
                                <div className="col-span-1 sm:col-span-3">
                                    <input
                                        type="number"
                                        min={0}
                                        value={f.soffi}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setReportStatsForm(prev => ({
                                                ...prev,
                                                [k]: { ...(prev[k] || { canestri: '0', soffi: '0' }), soffi: v }
                                            }));
                                        }}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-black"
                                        placeholder="SF"
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
                                        {t('reports_matches_shown', { shown: String(matchesForSelect.length), total: String(msAll.length) })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                                    <div className="md:col-span-4">
                                        <div className="relative">
                                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                value={matchQuery}
                                                onChange={(e) => setMatchQuery(e.target.value)}
                                                placeholder={t('codes_search_placeholder')}
                                                className="w-full pl-9 pr-9 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                            />
                                            {matchQuery.trim() && (
                                                <button
                                                    type="button"
                                                    onClick={() => setMatchQuery('')}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                                    aria-label={t('clear_search')}
                                                    title={t('clear_search')}
                                                >
                                                    <X className="w-4 h-4 text-slate-500" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="md:col-span-6">
                                        <select
                                            value={selected?.id || ''}
                                            onChange={(e) => handlePickReportMatch(e.target.value)}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                        >
                                            <option value="">{t('reports_select_match_option')}</option>
                                            {matchesForSelect.map(m => (
                                                <option key={m.id} value={m.id}>{formatOpt(m)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => current && handlePickReportMatch(current.id)}
                                            disabled={!current}
                                            className={`min-h-[44px] flex-1 px-3 py-2 rounded-xl font-black border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${current ? 'border-slate-200 bg-white hover:bg-slate-100' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                            title={t('reports_pick_next_match')}
                                        >
                                            {t('next_round')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => playing && handlePickReportMatch(playing.id)}
                                            disabled={!playing}
                                            className={`min-h-[44px] px-3 py-2 rounded-xl font-black border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center justify-center ${playing ? 'border-slate-200 bg-white hover:bg-slate-100' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                            aria-label={t('reports_go_playing_match')}
                                            title={playing ? t('reports_go_playing_match') : t('reports_no_playing_match')}
                                        >
                                            <Play className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                        {t('reports_live_code')}: <span className="font-mono">{playing?.code || '-'}</span>
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                        {t('reports_next_code')}: <span className="font-mono">{current?.code || '-'}</span>
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
                                                        {t('reports_tiebreak_label')}{selectedTeams.length >= 3 ? ` ${t('reports_tiebreak_multi')}` : ''}{typeof selected.targetScore === 'number' ? ` ${t('reports_tiebreak_target', { count: String(selected.targetScore) })}` : ''}
                                                    </span>
                                                )}
                                                
                                                <span className="text-slate-400">•</span>{' '}
                                                {isMulti
                                                    ? selectedIds.map(id => getTeamName(id)).join(' vs ')
                                                    : (<>{getTeamName(selected.teamAId)} <span className="text-slate-400">{t('versus_short')}</span> {getTeamName(selected.teamBId)}</>)}
                                            </div>
                                            <div className="text-xs font-bold text-slate-500 uppercase">
                                                {selected.phase === 'groups' ? t('reports_phase_groups') : t('reports_phase_bracket')} • {selected.status}
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
                                                                    setReportStatus('finished');
                                                                    if (!isMulti) {
                                                                        setReportScoreA(tt.id === selected.teamAId ? '1' : '0');
                                                                        setReportScoreB(tt.id === selected.teamBId ? '1' : '0');
                                                                    } else {
                                                                        setReportScoreA('1');
                                                                        setReportScoreB('0');
                                                                    }
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
                                        ) : !isMulti ? (
                                            <div className="grid grid-cols-3 gap-3 items-end">
                                                <div>
                                                    <div className="text-[10px] font-black text-slate-500 uppercase mb-1">{t('team_a')}</div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={reportScoreA}
                                                        onChange={(e) => setReportScoreA(e.target.value)}
                                                        readOnly
                                                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xl font-black text-center focus:border-beer-500 outline-none bg-slate-50"
                                                        title={t('reports_score_from_baskets')}
                                                    />
                                                </div>
                                                <div className="text-center font-black text-slate-300 text-2xl pb-2">-</div>
                                                <div>
                                                    <div className="text-[10px] font-black text-slate-500 uppercase mb-1">{t('team_b')}</div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={reportScoreB}
                                                        onChange={(e) => setReportScoreB(e.target.value)}
                                                        readOnly
                                                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xl font-black text-center focus:border-beer-500 outline-none bg-slate-50"
                                                        title={t('reports_score_from_baskets')}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="text-[10px] font-black text-slate-500 uppercase">{t('reports_scores_derived')}</div>
                                                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                                                    {selectedTeams.map(tt => (
                                                        <div key={tt.id} className="flex items-center justify-between px-3 py-2 bg-white">
                                                            <div className="min-w-0 flex-1 font-black text-sm leading-tight text-slate-900 whitespace-normal break-words">{tt.name || tt.id}</div>
                                                            <div className="font-mono font-black text-slate-700">
                                                                {computeTeamScoreFromForm(tt.id, tt.player1, tt.player2)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {resultsOnly ? (
                                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900">
                                                {t('results_only_report_status_hint')}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="text-xs font-black text-slate-500 uppercase">{t('status')}</div>
                                                <select
                                                    value={reportStatus}
                                                    onChange={(e) => setReportStatus(e.target.value as any)}
                                                    className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-black bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                                >
                                                    <option value="scheduled">{t('match_status_scheduled')}</option>
                                                    <option value="playing">{t('match_status_playing')}</option>
                                                    <option value="finished">{t('match_status_finished')}</option>
                                                </select>
                                                <div className="text-[10px] font-bold text-slate-400">
                                                    {t('reports_status_hint')}
                                                </div>
                                            </div>
                                        )}

                                        {!resultsOnly && (
                                        <div className="border-t border-slate-100 pt-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="font-black text-slate-800">{t('statistics')}</div>
                                                <div className="text-[10px] font-bold text-slate-400">{t('reports_stats_hint')}</div>
                                            </div>

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
                                            <CheckCircle2 className="w-5 h-5" /> Salva Referto
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
                                                {showOcrPanel ? 'Nascondi' : 'Mostra'}
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
                                                            <div className="text-xs font-black text-slate-600 uppercase">{t('ocr_beta')}</div>
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
