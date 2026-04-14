import React from 'react';
import { useTranslation } from '../../../App';
import { Brackets, Download, Settings, CheckCircle2, PlayCircle, ChevronDown } from 'lucide-react';
import type { AppState } from '../../../services/storageService';
import type { Match, TournamentData } from '../../../types';
import { isTesterMode } from '../../../config/appMode';
import { SocialGraphicsPanel } from '../SocialGraphicsPanel';
import { isByeMatch } from '../../../services/matchUtils';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../../services/formInputUX';

export interface StructureTabProps {
    state: AppState;
    draft: { t: TournamentData; m: Match[] } | null;

    tournName: string;
    setTournName: (v: string) => void;

    tournDate: string;
    setTournDate: (v: string) => void;

    tournMode: 'elimination' | 'groups_elimination' | 'round_robin';
    setTournMode: (v: 'elimination' | 'groups_elimination' | 'round_robin') => void;

    finalRrEnabled: boolean;
    setFinalRrEnabled: (v: boolean) => void;

    finalRrTopTeams: 4 | 8;
    setFinalRrTopTeams: (v: 4 | 8) => void;

    resultsOnly: boolean;
    setResultsOnly: (v: boolean) => void;

    numGroups: number;
    setNumGroups: (v: number) => void;

    advancing: number;
    setAdvancing: (v: number) => void;

    handleGenerate: () => void;
    handleStartLive: () => void;
    printBracket: () => void;
}

export const StructureTab: React.FC<StructureTabProps> = ({
    state,
    draft,
    tournName,
    setTournName,
    tournDate,
    setTournDate,
    tournMode,
    setTournMode,
    finalRrEnabled,
    setFinalRrEnabled,
    finalRrTopTeams,
    setFinalRrTopTeams,
    resultsOnly,
    setResultsOnly,
    numGroups,
    setNumGroups,
    advancing,
    setAdvancing,
    handleGenerate,
    handleStartLive,
    printBracket,
}) => {
    const { t, lang } = useTranslation();
    const dateLocale = lang === 'it' ? 'it-IT' : lang;
    // NOTE: "Squadre arbitri" are still real teams for structure/brackets.
    // Exclude only BYE/hidden (backward-compatible with historical snapshots).
    const playableTeamsCount = (state.teams || []).filter(t => !t.hidden && !t.isBye).length;
    const finalToggleDisabled = playableTeamsCount < 4;
    const top8Disabled = playableTeamsCount < 8;

    // Lightweight Admin UI tokens (local to this tab): keeps buttons/inputs consistent
    // without introducing new dependencies.
    const inputBase =
        'w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const selectBase =
        'w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnBase =
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnDark = `${btnBase} bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900/30`;
    const btnPrimary = `${btnBase} bg-blue-700 border border-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-500`;
    const checkbox = 'h-4 w-4 accent-beer-500';
    const activeRefereesCount = (state.teams || []).filter(t => !t.hidden && !t.isBye && t.isReferee).length;
    const draftGroupsCount = draft?.t.groups?.length || 0;
    const draftRoundsCount = draft?.t.rounds?.length || 0;
    const countableDraftMatches = draft?.m.filter(m => !isByeMatch(m)) || [];
    const draftMatchesCount = countableDraftMatches.length;
    const draftGroupsMatchesCount = countableDraftMatches.filter(m => m.phase === 'groups').length || 0;
    const draftBracketMatchesCount = countableDraftMatches.filter(m => m.phase === 'bracket').length || 0;
    const liveRefereesCount = activeRefereesCount;
    const modeLabel = tournMode === 'round_robin'
        ? t('structure_mode_round_robin_single_group')
        : (tournMode === 'groups_elimination' ? t('structure_mode_groups_bracket') : t('structure_mode_elimination_only'));
    const draftDateLabel = draft?.t.startDate
        ? new Date(draft.t.startDate).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
        : null;

    return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xl font-black flex items-center gap-2"><Brackets className="w-5 h-5"/> {t('structure_generation_title')}</h3>
            {isTesterMode && (
                <div className="flex items-center gap-2" role="toolbar" aria-label={t('structure_actions_aria')}>
                    <button type="button"
                    onClick={printBracket}
                    disabled={!((state.tournamentMatches && state.tournamentMatches.length) || (draft?.m && draft.m.length))}
                    className={btnSecondary}
                >
                    <Download className="w-4 h-4"/> {t('structure_export_bracket_pdf')}
                </button>
                </div>
            )}
        </div>
        
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <h4 className="text-sm font-black tracking-tight text-slate-900">{t('structure_config_title')}</h4>
                                <p className="text-xs text-slate-600 mt-1">
                                    {t('structure_config_desc')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <span className="text-slate-700 bg-white/70 border border-slate-200 px-3 py-1 rounded-full">
                                    {t('structure_active_teams')}:  {playableTeamsCount}
                                </span>
                                <span className="text-slate-700 bg-white/70 border border-slate-200 px-3 py-1 rounded-full">
                                    {t('structure_formula_label')}:  {modeLabel}
                                </span>
                                <span className="text-slate-700 bg-white/70 border border-slate-200 px-3 py-1 rounded-full">
                                    {t('structure_date_short')}:  {tournDate || t('today')}
                                </span>
                                {tournMode !== 'round_robin' ? (
                                    <span className={`px-3 py-1 rounded-full border ${finalRrEnabled ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-slate-700 bg-white/70 border-slate-200'}`}>
                                        {t('structure_final_group_badge')}:  {finalRrEnabled ? `Top ${finalRrTopTeams}` : t('off')}
                                    </span>
                                ) : null}
                                {resultsOnly ? (
                                    <span className="text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                                        {t('structure_results_only_badge')}
                                    </span>
                                ) : null}
                                {draft ? (
                                    <span className="text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                                        {t('structure_draft_ready_badge')}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">{t('tournament_name')}</label>
                            <input 
                                value={tournName} 
                                onChange={e => setTournName(e.target.value)} 
                                className={inputBase}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('structure_tournament_date_label')}</label>
                                <input
                                    type="date"
                                    value={tournDate}
                                    onChange={e => setTournDate(e.target.value)}
                                    className={inputBase}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">{t('archive_mode')}</label>
                                <select 
                                    value={tournMode} 
                                    onChange={e => setTournMode(e.target.value as any)}
                                    className={selectBase}
                                >
                                    <option value="round_robin">{t('structure_mode_round_robin_option')}</option>
                                    <option value="groups_elimination">{t('structure_mode_groups_elimination_option')}</option>
                                    <option value="elimination">{t('structure_mode_elimination_option')}</option>
                                </select>
                            </div>

                            {tournMode === 'groups_elimination' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">{t('structure_groups_count_label')}</label>
                                        <input 
                                            type="number" 
                                            value={numGroups} 
                                            onChange={e => setNumGroups(Number(e.target.value))} 
                                            className={inputBase}
                                            min={1}
                                            onFocus={handleZeroValueFocus}
                                            onMouseUp={handleZeroValueMouseUp}
                                            onBlur={handleZeroValueBlur}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">{t('structure_advancing_per_group')}</label>
                                        <input 
                                            type="number" 
                                            value={advancing} 
                                            onChange={e => setAdvancing(Number(e.target.value))} 
                                            className={inputBase}
                                            min={1}
                                            onFocus={handleZeroValueFocus}
                                            onMouseUp={handleZeroValueMouseUp}
                                            onBlur={handleZeroValueBlur}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <label className={`block cursor-pointer rounded-2xl border p-4 transition ${resultsOnly ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}>
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={resultsOnly}
                                    onChange={e => setResultsOnly(e.target.checked)}
                                    className={`${checkbox} mt-1`}
                                />
                                <div>
                                    <div className="font-black">{t('structure_results_only_label')}</div>
                                    <div className="mt-1 text-xs font-bold leading-5 text-slate-600">
                                        {t('structure_results_only_desc')}
                                    </div>
                                </div>
                            </div>
                        </label>

                        {tournMode !== 'round_robin' && (
                            <details className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-black text-slate-900">{t('structure_final_group_optional')}</div>
                                        <div className="text-xs font-bold text-slate-500 mt-1">
                                            {t('structure_final_group_optional_desc')}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {finalRrEnabled ? (
                                            <span className="px-2 py-1 rounded-full text-[11px] font-black border border-emerald-200 bg-emerald-50 text-emerald-800">
                                                {t('active')}
                                            </span>
                                        ) : null}
                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                    </div>
                                </summary>
                                <div className="border-t border-slate-200 p-4">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="text-xs font-bold text-slate-500">
                                            {t('structure_final_group_runtime_hint_before')} <b>{t('monitor_bracket')}</b> {t('structure_final_group_runtime_hint_after')}
                                        </div>
                                        <label className="flex items-center gap-2 font-black text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={finalRrEnabled}
                                                disabled={finalToggleDisabled}
                                                onChange={e => setFinalRrEnabled(e.target.checked)}
                                                className={checkbox}
                                            />
                                            {t('enable')}
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">{t('structure_participants_label')}</label>
                                            <select
                                                value={finalRrTopTeams}
                                                onChange={e => setFinalRrTopTeams(Number(e.target.value) as 4 | 8)}
                                                disabled={!finalRrEnabled || finalToggleDisabled}
                                                className={`${selectBase} disabled:opacity-50`}
                                            >
                                                <option value={4}>Top 4</option>
                                                <option value={8} disabled={top8Disabled}>Top 8</option>
                                            </select>
                                        </div>
                                        <div className="text-xs font-bold text-slate-500 flex items-end">
                                            {finalToggleDisabled ? (
                                                <div className="text-amber-700">{t('structure_need_at_least_four_active_teams')}</div>
                                            ) : (finalRrEnabled && top8Disabled && finalRrTopTeams === 8) ? (
                                                <div className="text-amber-700">{t('structure_top8_requires_eight_active_teams')}</div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </details>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h4 className="text-sm font-black tracking-tight text-slate-900">{t('structure_preview_live_title')}</h4>
                            <p className="text-xs text-slate-600 mt-1">
                                {t('structure_preview_live_desc')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <span className={`px-3 py-1 rounded-full border ${draft ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                            {t('status')}:  {draft ? t('structure_draft_ready_badge') : t('structure_draft_missing')}
                        </span>
                        <span className="px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                            {t('structure_formula_label')}:  {modeLabel}
                        </span>
                    </div>

                    <button type="button" 
                        onClick={handleGenerate} 
                        disabled={playableTeamsCount < 2}
                        className={`${btnDark} w-full px-6 py-3 uppercase tracking-wide`}
                    >
                        <Settings className="w-5 h-5" /> {t('structure_generate_draft')}
                    </button>

                    {!draft && (
                        <div className="text-xs text-slate-500">
                            {t('structure_no_preview_yet')}
                        </div>
                    )}
                </div>

                {draft && (
                            <div className="border-2 border-dashed border-blue-200 bg-blue-50 p-6 rounded-2xl">
                                <div className="flex items-center gap-3 mb-4">
                                    <CheckCircle2 className="w-8 h-8 text-blue-600" />
                                    <div>
                                        <h4 className="font-black text-blue-900 text-lg">{t('structure_draft_ready_live')}</h4>
                                        <p className="text-blue-700 text-sm">
                                            {t('structure_generated_prefix')}:  {draftGroupsCount} {t('groups_label').toLowerCase()}, {draftRoundsCount} {t('structure_rounds_bracket_label')}, {draftMatchesCount} {t('structure_effective_matches_label')}.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-3 text-sm text-blue-800 mb-6">
                                    <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                        <b>{t('groups_label')}:</b> {draftGroupsCount}
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                        <b>{t('structure_rounds_label')}:</b> {draftRoundsCount}
                                    </div>
                                    {draftDateLabel ? (
                                        <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                            <b>{t('structure_date_short')}: </b> {draftDateLabel}
                                        </div>
                                    ) : null}
                                    <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                        <b>{t('matches')}:</b> {draftMatchesCount}
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                        <b>{t('structure_group_matches_label')}:</b> {draftGroupsMatchesCount}
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                        <b>{t('structure_bracket_matches_label')}:</b> {draftBracketMatchesCount}
                                    </div>
                                    <div className="bg-white px-3 py-1 rounded border border-blue-100">
                                        <b>{t('referees')}:</b> {resultsOnly ? t('off') : liveRefereesCount}
                                    </div>
                                </div>

                                <button type="button" 
                                    onClick={handleStartLive}
                                    className={`${btnPrimary} w-full py-4 text-xl uppercase shadow-lg`}
                                >
                                    <PlayCircle className="w-8 h-8" /> {t('structure_confirm_start_live')}
                                </button>
                                <p className="text-center text-xs text-blue-600 mt-2">
                                    {t('structure_start_live_warning')}
                                </p>
                            </div>
                        )}
                </div>
            </div>

            <SocialGraphicsPanel state={state} draft={draft} />
        </div>
    );
};
