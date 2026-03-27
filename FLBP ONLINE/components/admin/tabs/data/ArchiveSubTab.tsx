import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, Upload, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DataTabProps } from '../DataTab';
import type { Match } from '../../../../types';
import { getPlayerKey, getPlayerKeyLabel, isU25, syncArchivedHistoryToHallOfFame } from '../../../../services/storageService';
import { syncBracketFromGroups, ensureFinalTieBreakIfNeeded } from '../../../../services/tournamentEngine';
import { getMatchParticipantIds, getMatchScoreForTeam, formatMatchScoreLabel } from '../../../../services/matchUtils';
import {
    getArchivedTournamentDeleteImpact,
    removeArchivedTournamentDeep,
    type ArchivedTournamentDeleteSummary,
} from '../../../../services/archiveCascadeDelete';
import { AdminDataConfirmModal } from './AdminDataConfirmModal';
import { BirthDateInput } from '../../BirthDateInput';
import { formatBirthDateDisplay } from '../../../../services/playerIdentity';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../../../services/formInputUX';

export const ArchiveSubTab: React.FC<DataTabProps> = ({
    state,
    setState,
    t,
    dataSubTab,
    setDataSubTab,
    integrationsSubTab,
    setIntegrationsSubTab,
    aliasesSearch,
    setAliasesSearch,
    aliasToolSelections,
    setAliasToolSelections,
    buildProfilesIndex,
    setAlias,
    removeAlias,
    dataSelectedTournamentId,
    setDataSelectedTournamentId,
    dataSelectedMatchId,
    setDataSelectedMatchId,
    dataScoreA,
    setDataScoreA,
    dataScoreB,
    setDataScoreB,
    dataStatus,
    setDataStatus,
    dataRecomputeAwards,
    setDataRecomputeAwards,
    dataWinnerTeamId,
    setDataWinnerTeamId,
    dataTopScorerPlayerId,
    setDataTopScorerPlayerId,
    dataDefenderPlayerId,
    setDataDefenderPlayerId,
    dataMvpPlayerId,
    setDataMvpPlayerId,
    dataTopScorerU25PlayerId,
    setDataTopScorerU25PlayerId,
    dataDefenderU25PlayerId,
    setDataDefenderU25PlayerId,
    hofEditId,
    setHofEditId,
    hofEditTournamentId,
    setHofEditTournamentId,
    hofYear,
    setHofYear,
    hofTournamentName,
    setHofTournamentName,
    hofType,
    setHofType,
    hofTeamName,
    setHofTeamName,
    hofWinnerP1,
    setHofWinnerP1,
    hofWinnerP2,
    setHofWinnerP2,
    hofPlayerName,
    setHofPlayerName,
    hofPlayerYoB,
    setHofPlayerYoB,
    hofValue,
    setHofValue,
    scorersImportWarnings,
    setScorersImportWarnings,
    setPendingScorersImport,
    setAliasModalOpen,
    setAliasModalTitle,
    setAliasModalConflicts,
    scorersFileRef,
    createArchiveOpen,
    createArchiveStep,
    setCreateArchiveStep,
    createArchiveName,
    setCreateArchiveName,
    createArchiveDate,
    setCreateArchiveDate,
    createArchiveMode,
    setCreateArchiveMode,
    createArchiveGroups,
    setCreateArchiveGroups,
    createArchiveAdvancing,
    setCreateArchiveAdvancing,
    createArchiveFinalRrEnabled,
    setCreateArchiveFinalRrEnabled,
    createArchiveFinalRrTopTeams,
    setCreateArchiveFinalRrTopTeams,
    createArchiveTeams,
    createArchiveFileRef,
    caTeamName,
    setCaTeamName,
    caP1,
    setCaP1,
    caY1,
    setCaY1,
    caP2,
    setCaP2,
    caY2,
    setCaY2,
    caP1IsRef,
    setCaP1IsRef,
    caP2IsRef,
    setCaP2IsRef,
    openCreateArchiveWizard,
    resetCreateArchiveWizard,
    copyLiveTeamsIntoWizard,
    importArchiveTeamsFile,
    addWizardTeam,
    removeWizardTeam,
    createArchivedTournament,
    autoFixBracketFromResults,
}) => {
    const [editStats, setEditStats] = useState<Record<string, { canestri: string; soffi: string }>>({});
    const [editStatsMatchId, setEditStatsMatchId] = useState<string>('');
    const [snackbar, setSnackbar] = useState<null | { tone: 'success' | 'error'; message: string }>(null);
    const [archiveDeleteTarget, setArchiveDeleteTarget] = useState<null | {
        tournamentId: string;
        tournamentName: string;
        tournamentDate: string;
        summary: ArchivedTournamentDeleteSummary;
    }>(null);

    // Initialize per-player stats editor when selecting a match
    useEffect(() => {
        const tsel = (state.tournamentHistory || []).find(x => x.id === dataSelectedTournamentId);
        if (!tsel) return;
        const msel = (tsel.matches || []).find(mm => mm.id === dataSelectedMatchId);
        if (!msel) return;
        if (editStatsMatchId === msel.id) return;

        const map: Record<string, { canestri: string; soffi: string }> = {};
        const push = (teamId?: string, playerName?: string) => {
            if (!teamId || !playerName) return;
            if (teamId === 'BYE') return;
            const key = `${teamId}||${playerName}`;
            const existing = (msel.stats || []).find(st => st.teamId === teamId && st.playerName === playerName);
            map[key] = { canestri: String(existing?.canestri ?? 0), soffi: String(existing?.soffi ?? 0) };
        };
        const participantIds = getMatchParticipantIds(msel as any);
        participantIds.forEach((id) => {
            const team = id ? (tsel.teams || []).find(tt => tt.id === id) : null;
            if (!team) return;
            push(team.id, team.player1);
            push(team.id, team.player2);
        });
        setEditStats(map);
        setEditStatsMatchId(msel.id);
    }, [state.tournamentHistory, dataSelectedTournamentId, dataSelectedMatchId, editStatsMatchId]);

    const computedScores = useMemo(() => {
        const tsel = (state.tournamentHistory || []).find(x => x.id === dataSelectedTournamentId);
        if (!tsel) return { scoreA: 0, scoreB: 0 };
        const msel = (tsel.matches || []).find(mm => mm.id === dataSelectedMatchId);
        if (!msel) return { scoreA: 0, scoreB: 0 };
        const participantIds = getMatchParticipantIds(msel as any);
        const teams = participantIds
            .map(id => id ? (tsel.teams || []).find(tt => tt.id === id) : null)
            .filter(Boolean) as any[];

        const sumTeam = (team: any) => {
            if (!team) return 0;
            const keys = [team.player1, team.player2].filter(Boolean).map((pn: string) => `${team.id}||${pn}`);
            return keys.reduce((acc: number, k: string) => acc + (parseInt((editStats[k]?.canestri || '0'), 10) || 0), 0);
        };

        const scoresByTeam: Record<string, number> = {};
        teams.forEach((t: any) => { scoresByTeam[t.id] = sumTeam(t); });

        const ordered = Object.values(scoresByTeam).sort((a, b) => b - a);
        return { scoreA: ordered[0] ?? 0, scoreB: ordered[1] ?? 0, scoresByTeam };

    }, [state.tournamentHistory, dataSelectedTournamentId, dataSelectedMatchId, editStats]);

    useEffect(() => {
        if (!snackbar) return;
        const timer = window.setTimeout(() => setSnackbar(null), 2600);
        return () => window.clearTimeout(timer);
    }, [snackbar]);

    const wizardPlayableTeamsCount = useMemo(() => {
        // NOTE: Referee teams are still real teams for structure/brackets.
        // Exclude only BYE/hidden (backward-compatible with historical snapshots).
        return (createArchiveTeams || []).filter(t => !t.hidden && !t.isBye).length;
    }, [createArchiveTeams]);

    const finalToggleDisabled = createArchiveMode === 'round_robin' || wizardPlayableTeamsCount < 4;
    const top8Disabled = wizardPlayableTeamsCount < 8;
    const selectedArchivedTournament = useMemo(
        () => (state.tournamentHistory || []).find(x => x.id === dataSelectedTournamentId) || null,
        [state.tournamentHistory, dataSelectedTournamentId]
    );
    const selectedArchiveDeleteImpact = useMemo(() => {
        if (!selectedArchivedTournament) return null;
        try {
            return getArchivedTournamentDeleteImpact(state, selectedArchivedTournament.id);
        } catch {
            return null;
        }
    }, [state, selectedArchivedTournament]);

    // Lightweight Admin UI tokens (local): consistent controls without new deps
    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const inputBase =
        `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 ${ring}`;
    const selectBase =
        `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 ${ring}`;
    const btnBase =
        `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black transition disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnDark = `${btnBase} bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900/30`;
    const btnPrimary = `${btnBase} bg-blue-700 border border-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-500`;
    const btnSuccess = `${btnBase} bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500`;
    const btnDanger = `${btnBase} bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;
    const btnSmBase = `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-black transition text-xs disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnSmSecondary = `${btnSmBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnSmDanger = `${btnSmBase} bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;
    const chipBase = `px-2 py-1 rounded-lg text-xs font-black border ${ring}`;
    const chipActive = 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800';
    const chipInactive = 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';

    return (
                    <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-1 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="font-black text-slate-700">{t('archive_tournaments')}</div>
                                <button type="button"
                                    onClick={() => {
                                        if (createArchiveOpen) {
                                            if (confirm(t('archive_close_creation_confirm'))) resetCreateArchiveWizard();
                                            return;
                                        }
                                        openCreateArchiveWizard();
                                    }}
                                    className={`${createArchiveOpen ? btnDark : btnSuccess} text-sm`}
                                >
                                    <Plus className="w-4 h-4" />
                                    {createArchiveOpen ? t('close') : t('archive_new_tournament')}
                                </button>
                            </div>

                            {createArchiveOpen && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-3 flex items-center justify-between gap-2">
                                        <div className="font-black text-slate-800 flex items-center gap-2"><Archive className="w-4 h-4"/> {t('archive_new_tournament_title')}</div>
                                        <div className="flex items-center gap-1" role="toolbar" aria-label={t('archive_creation_steps_aria')}>
                                            <button type="button"
                                                onClick={() => setCreateArchiveStep('meta')}
                                                className={`${chipBase} ${createArchiveStep==='meta' ? chipActive : chipInactive}`}
                                            >
                                                {t('archive_step_meta_label')}
                                            </button>
                                            <button type="button"
                                                onClick={() => setCreateArchiveStep('teams')}
                                                className={`${chipBase} ${createArchiveStep==='teams' ? chipActive : chipInactive}`}
                                            >
                                                {t('archive_step_teams_label')}
                                            </button>
                                            <button type="button"
                                                onClick={() => setCreateArchiveStep('structure')}
                                                className={`${chipBase} ${createArchiveStep==='structure' ? chipActive : chipInactive}`}
                                            >
                                                {t('archive_step_structure_label')}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 space-y-4">
                                        {createArchiveStep === 'meta' && (
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_name')}</div>
                                                    <input
                                                        value={createArchiveName}
                                                        onChange={(e) => setCreateArchiveName(e.target.value)}
                                                        className={inputBase}
                                                        placeholder={t('archive_example_tournament_name_placeholder')}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('archive_tournament_date')}</div>
                                                        <input
                                                            type="date"
                                                            value={createArchiveDate}
                                                            onChange={(e) => setCreateArchiveDate(e.target.value)}
                                                            className={inputBase}
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('archive_mode')}</div>
                                                        <select
                                                            value={createArchiveMode}
                                                            onChange={(e) => setCreateArchiveMode(e.target.value as any)}
                                                            className={selectBase}
                                                        >
                                                            <option value="round_robin">{t('archive_mode_round_robin_full')}</option>
                                                            <option value="groups_elimination">{t('groups_mode')}</option>
                                                            <option value="elimination">{t('elimination_mode')}</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs font-bold text-slate-500">{t('archive_meta_hint')}</div>
                                                    <button type="button"
                                                        onClick={() => setCreateArchiveStep('teams')}
                                                        className={`${btnSecondary} text-sm`}
                                                    >
                                                        {t('next_arrow')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {createArchiveStep === 'teams' && (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-black text-slate-800">{t('teams')} ({(createArchiveTeams || []).length})</div>
                                                    <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label={t('archive_teams_actions_aria')}>
                                                        <button type="button"
                                                            onClick={copyLiveTeamsIntoWizard}
                                                            className={btnSmSecondary}
                                                        >
                                                            {t('archive_copy_from_live')}
                                                        </button>
                                                        <input
                                                            ref={createArchiveFileRef}
                                                            type="file"
                                                            accept=".xlsx,.xls,.csv"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                const f = e.target.files?.[0];
                                                                if (f) importArchiveTeamsFile(f);
                                                                if (createArchiveFileRef.current) createArchiveFileRef.current.value = '';
                                                            }}
                                                        />
                                                        <button type="button"
                                                            onClick={() => createArchiveFileRef.current?.click()}
                                                            className={btnSmSecondary}
                                                        >
                                                            <Upload className="w-4 h-4"/> {t('import')}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                                                    <div className="text-xs font-black text-slate-500">{t('archive_manual_entry_three_rows')}</div>
                                                    <input value={caTeamName} onChange={(e)=>setCaTeamName(e.target.value)} className={inputBase} placeholder={t('team_name')} />
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <input value={caP1} onChange={(e)=>setCaP1(e.target.value)} className={inputBase} placeholder={t('player_1')} />
                                                        <BirthDateInput value={caY1} onChange={setCaY1} className={inputBase} placeholder="gg/mm/aaaa" ariaLabel={t('archive_player1_birthdate_aria')} />
                                                        <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                                                            <input type="checkbox" className="h-4 w-4 accent-beer-500" checked={caP1IsRef} onChange={(e)=>setCaP1IsRef(e.target.checked)} />
                                                            {t('referee_label')}
                                                        </label>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <input value={caP2} onChange={(e)=>setCaP2(e.target.value)} className={inputBase} placeholder={t('player_2')} />
                                                        <BirthDateInput value={caY2} onChange={setCaY2} className={inputBase} placeholder="gg/mm/aaaa" ariaLabel={t('archive_player2_birthdate_aria')} />
                                                        <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                                                            <input type="checkbox" className="h-4 w-4 accent-beer-500" checked={caP2IsRef} onChange={(e)=>setCaP2IsRef(e.target.checked)} />
                                                            {t('referee_label')}
                                                        </label>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-xs font-bold text-slate-500">{t('archive_import_same_live_format_hint')}</div>
                                                        <button type="button" onClick={addWizardTeam} className={`${btnPrimary} text-sm`}>
                                                            <Plus className="w-4 h-4"/> {t('add')}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="bg-slate-50 px-4 py-2 font-black text-slate-700">{t('archive_team_list')}</div>
                                                    <div className="max-h-[260px] overflow-auto divide-y divide-slate-100">
                                                        {(createArchiveTeams || []).map(tn => (
                                                            <div key={tn.id} className="px-4 py-2 flex items-center justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{tn.name}</div>
                                                                    <div className="text-xs font-bold text-slate-500 whitespace-normal break-words leading-tight">
                                                                        {tn.player1} ({formatBirthDateDisplay((tn as any).player1BirthDate) || 'ND'}){(tn as any).player1IsReferee ? ' ✅' : ''} · {tn.player2} ({formatBirthDateDisplay((tn as any).player2BirthDate) || 'ND'}){(tn as any).player2IsReferee ? ' ✅' : ''}
                                                                    </div>
                                                                </div>
                                                                <button type="button" onClick={() => removeWizardTeam(tn.id)} className={btnSmDanger}>
                                                                    <Trash2 className="w-4 h-4"/> {t('delete')}
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {!(createArchiveTeams || []).length && (
                                                            <div className="px-4 py-6 text-center text-slate-400 font-bold">{t('no_teams')}</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between gap-2" role="toolbar" aria-label={t('archive_creation_steps_aria')}>
                                                    <button type="button"
                                                        onClick={() => setCreateArchiveStep('meta')}
                                                        className={`${btnSecondary} text-sm`}
                                                    >
                                                        ← {t('back')}
                                                    </button>
                                                    <button type="button"
                                                        onClick={() => setCreateArchiveStep('structure')}
                                                        className={`${btnSecondary} text-sm`}
                                                    >
                                                        {t('next_arrow')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {createArchiveStep === 'structure' && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {createArchiveMode === 'groups_elimination' && (
                                                        <>
                                                            <div>
                                                                <div className="text-xs font-black text-slate-500 mb-1">{t('structure_groups_count_label')}</div>
                                                                <input
                                                                    value={String(createArchiveGroups)}
                                                                    onChange={(e) => setCreateArchiveGroups(Math.max(1, Math.min(64, Number(e.target.value.replace(/[^0-9]/g,'')) || 1)))}
                                                                    className={inputBase}
                                                                    onFocus={handleZeroValueFocus}
                                                                    onMouseUp={handleZeroValueMouseUp}
                                                                    onBlur={handleZeroValueBlur}
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-black text-slate-500 mb-1">{t('archive_advancing_per_group_label')}</div>
                                                                <input
                                                                    value={String(createArchiveAdvancing)}
                                                                    onChange={(e) => setCreateArchiveAdvancing(Math.max(1, Math.min(8, Number(e.target.value.replace(/[^0-9]/g,'')) || 1)))}
                                                                    className={inputBase}
                                                                    onFocus={handleZeroValueFocus}
                                                                    onMouseUp={handleZeroValueMouseUp}
                                                                    onBlur={handleZeroValueBlur}
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {createArchiveMode === 'round_robin' && (
                                                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                                                        <div className="text-xs font-black text-slate-700">{t('archive_mode_round_robin_full')}</div>
                                                        <div className="text-xs font-bold text-slate-500 mt-1">{t('archive_round_robin_hint')}</div>
                                                    </div>
                                                )}

                                                {createArchiveMode !== 'round_robin' && (
                                                    <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                                                        <div className="text-xs font-black text-slate-700">{t('archive_final_group_round_robin_title')}</div>
                                                        <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 accent-beer-500"
                                                                checked={createArchiveFinalRrEnabled}
                                                                disabled={finalToggleDisabled}
                                                                onChange={(e) => setCreateArchiveFinalRrEnabled(e.target.checked)}
                                                            />
                                                            {t('archive_enable_final_group')}
                                                        </label>
                                                        {finalToggleDisabled && (
                                                            <div className="text-xs font-bold text-slate-500">{t('archive_final_group_requirements_hint')}</div>
                                                        )}
                                                        {!finalToggleDisabled && (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                <div>
                                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('archive_top_participants_label')}</div>
                                                                        <select
                                                                        value={String(createArchiveFinalRrTopTeams)}
                                                                        onChange={(e) => setCreateArchiveFinalRrTopTeams((Number(e.target.value) as any) || 4)}
                                                                        disabled={!createArchiveFinalRrEnabled}
                                                                            className={`${selectBase} ${!createArchiveFinalRrEnabled ? 'bg-slate-100 text-slate-400' : ''}`}
                                                                    >
                                                                        <option value="4">Top 4</option>
                                                                        <option value="8" disabled={top8Disabled}>Top 8</option>
                                                                    </select>
                                                                    {createArchiveFinalRrEnabled && top8Disabled ? (
                                                                        <div className="text-[11px] font-bold text-slate-500 mt-1">{t('structure_top8_requires_eight_active_teams')}</div>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex items-end">
                                                                    <div className="text-[11px] font-bold text-slate-500">{t('archive_final_group_runtime_hint')}</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="text-xs font-bold text-slate-500">
                                                    {t('teams')}: {(createArchiveTeams || []).length} ({t('archive_usable_count')}: {wizardPlayableTeamsCount}) · {t('archive_mode')}: {createArchiveMode === 'groups_elimination'
                                                        ? t('groups_mode')
                                                        : (createArchiveMode === 'round_robin' ? t('archive_round_robin_short') : t('archive_elimination_short'))}
                                                    {createArchiveMode === 'groups_elimination' ? ` · ${t('groups_label')}: ${createArchiveGroups} · ${t('archive_qualified_label')}: ${createArchiveAdvancing}` : ''}
                                                    {createArchiveMode !== 'round_robin' && createArchiveFinalRrEnabled ? ` · ${t('structure_final_group_badge')}: Top ${createArchiveFinalRrTopTeams}` : ''}
                                                </div>

                                                <div className="flex items-center justify-between gap-2" role="toolbar" aria-label={t('archive_confirm_creation_aria')}>
                                                    <button type="button"
                                                        onClick={() => setCreateArchiveStep('teams')}
                                                        className={`${btnSecondary} text-sm`}
                                                    >
                                                        ← {t('back')}
                                                    </button>
                                                    <button type="button"
                                                        onClick={createArchivedTournament}
                                                        className={`${btnSuccess} text-sm`}
                                                    >
                                                        <CheckCircle2 className="w-4 h-4"/> {t('archive_create_tournament')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                                <div className="font-black text-slate-700">{t('archive_select_tournament')}</div>
                                {dataSelectedTournamentId ? (
                                    <button type="button"
                                        onClick={() => {
                                            const tsel = selectedArchivedTournament;
                                            if (!tsel) return;
                                            try {
                                                const summary = getArchivedTournamentDeleteImpact(state, tsel.id);
                                                setArchiveDeleteTarget({
                                                    tournamentId: tsel.id,
                                                    tournamentName: tsel.name,
                                                    tournamentDate: tsel.startDate,
                                                    summary,
                                                });
                                            } catch (error: any) {
                                                setSnackbar({ tone: 'error', message: error?.message || t('archive_delete_error') });
                                            }
                                        }}
                                        className={btnSmDanger}
                                        title={t('archive_delete_tournament')}
                                    >
                                        <Trash2 className="w-4 h-4" /> {t('archive_delete_tournament')}
                                    </button>
                                ) : null}
                            </div>
                            <select
                                value={dataSelectedTournamentId}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    setDataSelectedTournamentId(id);
                                    setDataSelectedMatchId('');
                                    setDataWinnerTeamId('');
                                    setDataTopScorerPlayerId('');
                                    setDataDefenderPlayerId('');
                                    setDataMvpPlayerId('');
                                    setDataTopScorerU25PlayerId('');
                                    setDataDefenderU25PlayerId('');
                                }}
                                className={selectBase}
                            >
                                <option value="">—</option>
                                {(state.tournamentHistory || [])
                                    .slice()
                                    .sort((a, b) => (new Date(b.startDate).getTime()) - (new Date(a.startDate).getTime()))
                                    .map(tn => (
                                        <option key={tn.id} value={tn.id}>{tn.name}</option>
                                    ))}
                            </select>

                            {selectedArchivedTournament && selectedArchiveDeleteImpact ? (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <div className="text-sm font-black text-rose-900 flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" />
                                                {t('archive_permanent_delete')}
                                            </div>
                                            <div className="mt-1 text-sm font-bold text-slate-900">
                                                {selectedArchivedTournament.name}
                                            </div>
                                            <div className="mt-1 text-xs font-semibold text-slate-500">
                                                {new Date(selectedArchivedTournament.startDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-full border border-rose-200 bg-white text-[11px] font-black text-rose-700">
                                            {t('irreversible')}
                                        </span>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3">
                                        <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
                                            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('tournament_name')}</div>
                                            <div className="mt-1 text-sm font-black text-slate-950">{selectedArchiveDeleteImpact.removedTournament}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
                                            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('archive_titles_removed')}</div>
                                            <div className="mt-1 text-sm font-black text-slate-950">{selectedArchiveDeleteImpact.removedHallOfFameEntries}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
                                            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('archive_stats_rows')}</div>
                                            <div className="mt-1 text-sm font-black text-slate-950">{selectedArchiveDeleteImpact.removedMatchStats}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
                                            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{t('archive_players_affected')}</div>
                                            <div className="mt-1 text-sm font-black text-slate-950">{selectedArchiveDeleteImpact.affectedPlayers}</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 text-xs font-semibold leading-5 text-rose-900/80">
                                        {t('archive_delete_warning')}
                                    </div>
                                </div>
                            ) : null}

                            {(() => {
                                const tsel = selectedArchivedTournament;
                                if (!tsel) return null;

                                const matches = (tsel.matches || []).slice().sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
                                return (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-2 font-black text-slate-700">{t('match_list')}</div>
                                        <div className="max-h-[420px] overflow-auto divide-y divide-slate-100">
                                            {matches.map(m => {
                                                const label = m.code || m.id;
                                                const participantIds = getMatchParticipantIds(m as any);
                                                const names = participantIds.map(id => {
                                                    if (!id) return t('tbd_label');
                                                    if (id === 'BYE') return t('bye_label');
                                                    return (tsel.teams || []).find(tt => tt.id === id)?.name || id;
                                                });
                                                const vsLabel = names.join(' vs ');
                                                const scoreOf = (teamId: string) => getMatchScoreForTeam(m as any, teamId);
                                                const scoreLabel = formatMatchScoreLabel(m as any);
                                                const where = m.phase === 'groups'
                                                    ? (m.groupName ? `${t('groups_label')} ${m.groupName}` : t('groups_label'))
                                                    : (m.roundName || (m.round ? `${t('round')} ${m.round}` : t('monitor_bracket')));
                                                const isSel = dataSelectedMatchId === m.id;
                                                const badge = m.status === 'finished' ? 'bg-red-50 text-red-700 border-red-200' : (m.status === 'playing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-700 border-slate-200');
                                                return (
                                                    <button type="button"
                                                        key={m.id}
                                                        onClick={() => {
                                                            setDataSelectedMatchId(m.id);
                                                            const vals = participantIds.map(id => scoreOf(id)).sort((a, b) => b - a);
                                                            const aInit = participantIds.length >= 3 ? (vals[0] ?? 0) : (m.scoreA ?? 0);
                                                            const bInit = participantIds.length >= 3 ? (vals[1] ?? 0) : (m.scoreB ?? 0);
                                                            setDataScoreA(String(aInit));
                                                            setDataScoreB(String(bInit));
                                                            setDataStatus(m.status || 'scheduled');
                                                        }}
                                                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${isSel ? 'bg-blue-50' : 'bg-white'} ${ring}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="font-black text-slate-900 flex items-center gap-2">
                                                                    <span className="font-mono text-xs text-slate-500">{label}</span>
                                                                    <span className="text-sm font-black">{vsLabel}</span>
                                                                </div>
                                                                <div className="text-xs font-bold text-slate-500 mt-1">{where}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="font-mono font-black text-slate-700 text-xs">{scoreLabel}</span>
                                                                <span className={`text-[10px] px-2 py-1 rounded-full border font-black ${badge}`}>{m.status === 'finished' ? t('finished_status') : m.status === 'playing' ? t('playing_status') : t('scheduled_status')}</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="lg:col-span-2 space-y-4">
                            {(() => {
                                const tsel = (state.tournamentHistory || []).find(x => x.id === dataSelectedTournamentId);
                                if (!tsel) {
                                    return <div className="text-slate-400 font-bold">{t('archive_select_to_start')}</div>;
                                }

                                const msel = (tsel.matches || []).find(mm => mm.id === dataSelectedMatchId);
                                const players = (tsel.teams || []).flatMap(tm => ([
                                    { id: getPlayerKey(tm.player1, (tm as any).player1BirthDate || 'ND'), name: tm.player1, birthDate: (tm as any).player1BirthDate },
                                    { id: getPlayerKey(tm.player2, (tm as any).player2BirthDate || 'ND'), name: tm.player2, birthDate: (tm as any).player2BirthDate },
                                ])).filter(p => !!p.name);

                                const u25Players = players.filter(p => isU25(p.birthDate));

                                const getPlayerLabel = (pid: string) => {
                                    const pl = players.find(p => p.id === pid);
                                    if (!pl) return '';
                                    const yy = getPlayerKeyLabel(pl.id).yob || 'ND';
                                    return `${pl.name} (${yy})`;
                                };

                                const saveMatchEdit = () => {
                                    if (!msel) {
                                        alert(t('alert_select_match'));
                                        return;
                                    }

                                    const isBye = (id?: string) => String(id || '').toUpperCase() === 'BYE';
                                    const isTbd = (id?: string) => {
                                        const up = String(id || '').trim().toUpperCase();
                                        return up === 'TBD' || up.startsWith('TBD-');
                                    };
                                    const participantIds = getMatchParticipantIds(msel as any).filter(Boolean);
                                    const participantTeams = participantIds
                                        .map(id => (id ? (tsel.teams || []).find(tt => tt.id === id) : null))
                                        .filter(Boolean) as any[];
                                    // Retroattivo marcatori: lo score deriva dalla somma dei canestri dei singoli giocatori.
                                    const stats: any[] = [];
                                    const push = (teamId?: string, playerName?: string) => {
                                        if (!teamId || !playerName) return;
                                        if (teamId === 'BYE') return;
                                        const key = `${teamId}||${playerName}`;
                                        const f = editStats[key] || { canestri: '0', soffi: '0' };
                                        stats.push({
                                            teamId,
                                            playerName,
                                            canestri: Math.max(0, parseInt(f.canestri || '0', 10) || 0),
                                            soffi: Math.max(0, parseInt(f.soffi || '0', 10) || 0),
                                        });
                                    };

                                    // Build stats for all real participants (1v1 and multi-team)
                                    participantTeams.forEach((team: any) => {
                                        push(team.id, team.player1);
                                        push(team.id, team.player2);
                                    });

                                    // Guardrail: pareggi non ammessi nei match reali quando si marca come "finished".
                                    // - valido sia 1v1 che multi-team
                                    // - BYE non conta, TBD non può essere finalizzato
                                    const playableIds = participantIds.filter(id => !isBye(id));
                                    const playableScoresByTeam: Record<string, number> = {};
                                    for (const id of playableIds) {
                                        playableScoresByTeam[id] = (computedScores as any).scoresByTeam?.[id] ?? 0;
                                    }
                                    const maxScore = Math.max(0, ...Object.values(playableScoresByTeam));

                                    if (dataStatus === 'finished') {
                                        if (playableIds.some(id => isTbd(id))) {
                                            alert(t('archive_cannot_finish_with_tbd'));
                                            return;
                                        }
                                        const leaders = Object.keys(playableScoresByTeam).filter(id => (playableScoresByTeam[id] ?? 0) === maxScore);
                                        if (leaders.length !== 1) {
                                            alert(t('alert_tie_not_allowed'));
                                            return;
                                        }
                                    }

                                    let nextMatches = (tsel.matches || []).map(mm => {
                                        if (mm.id !== msel.id) return mm;
                                        const nextScoresByTeam = (mm.teamIds && mm.teamIds.length)
                                            ? mm.teamIds.reduce((acc, id) => ({ ...acc, [id]: ((computedScores as any).scoresByTeam?.[id] ?? 0) }), {} as Record<string, number>)
                                            : undefined;
                                        return {
                                            ...mm,
                                            // For tie-break matches we promote the effective target to the final max score.
                                            targetScore: (mm.isTieBreak && dataStatus === 'finished') ? maxScore : (mm as any).targetScore,
                                            // Legacy 1v1 fields + some older components:
                                            // for multi-team we mirror the top-2 scores.
                                            scoreA: (computedScores as any).scoreA ?? 0,
                                            scoreB: (computedScores as any).scoreB ?? 0,
                                            scoresByTeam: nextScoresByTeam || (mm as any).scoresByTeam,
                                            status: dataStatus,
                                            played: dataStatus !== 'scheduled',
                                            stats: stats.length ? stats : mm.stats,
                                        } as Match;
                                    });

                                    if (tsel.type === 'groups_elimination') {
                                        nextMatches = syncBracketFromGroups(tsel, nextMatches);
                                    }

                                    nextMatches = ensureFinalTieBreakIfNeeded(tsel, nextMatches);

                                    nextMatches = autoFixBracketFromResults(nextMatches);

                                    const nextHistory = (state.tournamentHistory || []).map(tt => (tt.id === tsel.id ? { ...tt, matches: nextMatches } : tt));

                                    const nextHall = syncArchivedHistoryToHallOfFame({
                                        ...state,
                                        tournamentHistory: nextHistory,
                                        hallOfFame: state.hallOfFame || [],
                                    });

                                    setState({ ...state, tournamentHistory: nextHistory, hallOfFame: nextHall });
                                    alert(t('alert_saved_propagation'));
                                };

                                const saveAwardsManual = () => {
                                    const year = new Date(tsel.startDate).getFullYear().toString();
                                    const cur = state.hallOfFame || [];
                                    const keep = cur.filter(e => e.tournamentId !== tsel.id);

                                    const mkPlayerEntry = (type: any, playerId: string) => ({
                                        id: `${tsel.id}_${type}`,
                                        year,
                                        tournamentId: tsel.id,
                                        tournamentName: tsel.name,
                                        type,
                                        playerId,
                                        playerNames: [players.find(p => p.id === playerId)?.name || ''],
                                        sourceType: 'archived_tournament' as const,
                                        sourceTournamentId: tsel.id,
                                        sourceTournamentName: tsel.name,
                                        sourceAutoGenerated: false,
                                        manuallyEdited: true,
                                    });

                                    const winnerTeam = (tsel.teams || []).find(tt => tt.id === dataWinnerTeamId);
                                    const winnerEntry = dataWinnerTeamId ? {
                                        id: `${tsel.id}_winner`,
                                        year,
                                        tournamentId: tsel.id,
                                        tournamentName: tsel.name,
                                        type: 'winner' as const,
                                        teamName: winnerTeam?.name || dataWinnerTeamId,
                                        playerNames: winnerTeam ? [winnerTeam.player1, winnerTeam.player2].filter(Boolean) as string[] : [],
                                        sourceType: 'archived_tournament' as const,
                                        sourceTournamentId: tsel.id,
                                        sourceTournamentName: tsel.name,
                                        sourceAutoGenerated: false,
                                        manuallyEdited: true,
                                    } : null;

                                    const entries: any[] = [];
                                    if (winnerEntry) entries.push(winnerEntry);
                                    if (dataTopScorerPlayerId) entries.push(mkPlayerEntry('top_scorer', dataTopScorerPlayerId));
                                    if (dataDefenderPlayerId) entries.push(mkPlayerEntry('defender', dataDefenderPlayerId));
                                    if (dataTopScorerU25PlayerId) entries.push(mkPlayerEntry('top_scorer_u25', dataTopScorerU25PlayerId));
                                    if (dataDefenderU25PlayerId) entries.push(mkPlayerEntry('defender_u25', dataDefenderU25PlayerId));
                                    if (dataMvpPlayerId) entries.push(mkPlayerEntry('mvp', dataMvpPlayerId));

                                    const seededHallOfFame = [...keep, ...entries];
                                    const nextHall = syncArchivedHistoryToHallOfFame({
                                        ...state,
                                        hallOfFame: seededHallOfFame,
                                    });

                                    setState({ ...state, hallOfFame: nextHall });
                                    alert(t('alert_awards_updated'));
                                };

                                return (
                                    <div className="space-y-6">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                            <div className="font-black text-slate-800">Editing risultato (retroattivo)</div>
                                            {!msel && <div className="text-slate-400 font-bold">{t('archive_select_match_left_column')}</div>}
                                            {msel && (
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                    <div className="md:col-span-2">
                                                        <div className="text-xs font-black text-slate-500 mb-1">Score</div>
                                                        <div className="flex gap-2">
                                                            <input value={String(computedScores.scoreA)} disabled className={`w-24 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-black text-slate-700 ${ring}`} />
                                                            <span className="font-black self-center text-slate-500">-</span>
                                                            <input value={String(computedScores.scoreB)} disabled className={`w-24 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-black text-slate-700 ${ring}`} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">Stato</div>
                                                        <select value={dataStatus} onChange={(e)=>setDataStatus(e.target.value as any)} className={selectBase}>
                                                            <option value="scheduled">scheduled</option>
                                                            <option value="playing">playing</option>
                                                            <option value="finished">finished</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex items-end">
                                                        <button type="button" onClick={saveMatchEdit} className={`${btnPrimary} w-full`}>
                                                            {t('register_result')}
                                                        </button>
                                                    </div>
                                                    <div className="md:col-span-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">
                                                        {t('archive_awards_realign_hint')}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                                            <div className="font-black text-slate-800">{t('archive_match_scorers_retro')}</div>
                                            {!msel ? (
                                                <div className="text-slate-400 font-bold">{t('archive_select_match_edit_scorers')}</div>
                                            ) : (
                                                <>
                                                    <div className="text-xs font-bold text-slate-500">{t('archive_edit_match_scorers_hint')}</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {(() => {
                                                            const participantIds = getMatchParticipantIds(msel as any);
                                                            const teams = participantIds
                                                                .map(id => id ? (tsel.teams || []).find(tt => tt.id === id) : null)
                                                                .filter(Boolean) as any[];
                                                            const rows: Array<{ teamId: string; teamName: string; playerName: string }> = [];
                                                            const push = (team: any, playerName?: string) => {
                                                                if (!team || !playerName) return;
                                                                rows.push({ teamId: team.id, teamName: team.name, playerName });
                                                            };
                                                            teams.forEach((team: any) => {
                                                                push(team, team.player1);
                                                                push(team, team.player2);
                                                            });
                                                            return rows.map(r => {
                                                                const k = `${r.teamId}||${r.playerName}`;
                                                                const f = editStats[k] || { canestri: '0', soffi: '0' };
                                                                return (
                                                                    <div key={k} className="border border-slate-200 rounded-xl p-3">
                                                                        <div className="text-xs font-black text-slate-500">{r.teamName}</div>
                                                                        <div className="font-black text-slate-900">{r.playerName}</div>
                                                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                                                            <div>
                                                                                <div className="text-[10px] font-black text-slate-500 mb-1">{t('canestri_tv')}</div>
                                                                                <input
                                                                                    value={f.canestri}
                                                                                    onChange={(e) => setEditStats(prev => ({ ...prev, [k]: { ...prev[k], canestri: e.target.value.replace(/[^0-9]/g, '') } }))}
                                                                                    className={inputBase}
                                                                                    onFocus={handleZeroValueFocus}
                                                                                    onMouseUp={handleZeroValueMouseUp}
                                                                                    onBlur={handleZeroValueBlur}
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-[10px] font-black text-slate-500 mb-1">{t('soffi')}</div>
                                                                                <input
                                                                                    value={f.soffi}
                                                                                    onChange={(e) => setEditStats(prev => ({ ...prev, [k]: { ...prev[k], soffi: e.target.value.replace(/[^0-9]/g, '') } }))}
                                                                                    className={inputBase}
                                                                                    onFocus={handleZeroValueFocus}
                                                                                    onMouseUp={handleZeroValueMouseUp}
                                                                                    onBlur={handleZeroValueBlur}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            });
                                                        })()}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                                            <div className="font-black text-slate-800">{t('archive_manual_awards')}</div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('archive_champions_team')}</div>
                                                    <select value={dataWinnerTeamId} onChange={(e)=>setDataWinnerTeamId(e.target.value)} className={selectBase}>
                                                        <option value="">—</option>
                                                        {(tsel.teams || []).map(tt => (<option key={tt.id} value={tt.id}>{tt.name}</option>))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_mvp')}</div>
                                                    <select value={dataMvpPlayerId} onChange={(e)=>setDataMvpPlayerId(e.target.value)} className={selectBase}>
                                                        <option value="">—</option>
                                                        {players.map(p => (<option key={p.id} value={p.id}>{getPlayerLabel(p.id)}</option>))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_top_scorer')}</div>
                                                    <select value={dataTopScorerPlayerId} onChange={(e)=>setDataTopScorerPlayerId(e.target.value)} className={selectBase}>
                                                        <option value="">—</option>
                                                        {players.map(p => (<option key={p.id} value={p.id}>{getPlayerLabel(p.id)}</option>))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_defender')}</div>
                                                    <select value={dataDefenderPlayerId} onChange={(e)=>setDataDefenderPlayerId(e.target.value)} className={selectBase}>
                                                        <option value="">—</option>
                                                        {players.map(p => (<option key={p.id} value={p.id}>{getPlayerLabel(p.id)}</option>))}
                                                    </select>
                                                </div>
                                                {tsel.includeU25Awards !== false ? (
                                                    <>
                                                        <div>
                                                            <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_top_scorer_u25')}</div>
                                                            <select value={dataTopScorerU25PlayerId} onChange={(e)=>setDataTopScorerU25PlayerId(e.target.value)} className={selectBase}>
                                                                <option value="">—</option>
                                                                {u25Players.map(p => (<option key={p.id} value={p.id}>{getPlayerLabel(p.id)}</option>))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_defender_u25')}</div>
                                                            <select value={dataDefenderU25PlayerId} onChange={(e)=>setDataDefenderU25PlayerId(e.target.value)} className={selectBase}>
                                                                <option value="">—</option>
                                                                {u25Players.map(p => (<option key={p.id} value={p.id}>{getPlayerLabel(p.id)}</option>))}
                                                            </select>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                                                        {t('archive_u25_disabled')}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <button type="button" onClick={saveAwardsManual} className={`${btnDark} text-sm`}>
                                                    {t('archive_save_manual_awards')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                    <AdminDataConfirmModal
                        open={!!archiveDeleteTarget}
                        tone="danger"
                        title={t('archive_delete_confirm_title')}
                        description={t('archive_delete_confirm_desc')}
                        confirmLabel={t('archive_delete_confirm_label')}
                        onClose={() => setArchiveDeleteTarget(null)}
                        onConfirm={() => {
                            if (!archiveDeleteTarget) return;
                            try {
                                const result = removeArchivedTournamentDeep(state, archiveDeleteTarget.tournamentId);
                                setState(result.state);
                                setDataSelectedTournamentId('');
                                setDataSelectedMatchId('');
                                setEditStats({});
                                setEditStatsMatchId('');
                                setArchiveDeleteTarget(null);
                                setSnackbar({ tone: 'success', message: `${t('archive_tournament_deleted')}: ${result.tournament.name}.` });
                            } catch (error: any) {
                                setArchiveDeleteTarget(null);
                                setSnackbar({ tone: 'error', message: error?.message || t('archive_delete_error') });
                            }
                        }}
                        summaryItems={
                            archiveDeleteTarget ? [
                                { label: t('tournament_name_short'), value: archiveDeleteTarget.summary.removedTournament },
                                { label: t('archive_titles_removed'), value: archiveDeleteTarget.summary.removedHallOfFameEntries },
                                { label: t('archive_stats_rows_removed'), value: archiveDeleteTarget.summary.removedMatchStats },
                                { label: t('archive_players_affected'), value: archiveDeleteTarget.summary.affectedPlayers },
                            ] : []
                        }
                    >
                        <div className="space-y-2">
                            <div className="text-sm font-black text-slate-950">{archiveDeleteTarget?.tournamentName}</div>
                            <div className="text-xs font-semibold text-slate-500">
                                {archiveDeleteTarget ? new Date(archiveDeleteTarget.tournamentDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            </div>
                            <p>
                                {t('archive_deep_delete_explainer')}
                            </p>
                        </div>
                    </AdminDataConfirmModal>
                    {snackbar ? (
                        <div className="fixed bottom-5 right-5 z-50">
                            <div
                                className={`min-w-[280px] max-w-[420px] rounded-2xl border px-4 py-3 shadow-lg ${
                                    snackbar.tone === 'success'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                        : 'border-rose-200 bg-rose-50 text-rose-900'
                                }`}
                            >
                                <div className="font-black text-sm">{snackbar.message}</div>
                            </div>
                        </div>
                    ) : null}
                    </>
    );
};
