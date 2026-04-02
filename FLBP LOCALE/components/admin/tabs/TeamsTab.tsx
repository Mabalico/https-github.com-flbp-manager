import React from 'react';
import { Users, Upload, Download, Trash2, Plus, MoreHorizontal, ChevronDown, FileText, Pencil } from 'lucide-react';
import type { Team } from '../../../types';
import { isTesterMode } from '../../../config/appMode';
import { BirthDateInput } from '../BirthDateInput';
import { formatBirthDateDisplay, getPlayerKey, normalizeBirthDateInput, pickPlayerIdentityValue, resolvePlayerKey } from '../../../services/playerIdentity';
import { updatePlayerProfileIdentity } from '../../../services/playerProfileAdmin';
import { buildPlayerProfileSnapshot } from '../../../services/playerDataProvenance';
import type { AppState } from '../../../services/storageService';
import { buildCanonicalPlayerNameFromParts, splitCanonicalPlayerName } from '../../../services/textUtils';

export interface TeamsTabProps {
    t: (key: string) => string;

    fileRef: React.RefObject<HTMLInputElement | null>;
    backupRef: React.RefObject<HTMLInputElement | null>;

    importFile: (file: File) => void;
    importBackupJson: (file: File) => void;

    exportTeamsXlsx: () => void;
    exportBackupJson: () => void;
    printTeams: () => void;

    editingId: string | null;
    teamName: string;
    setTeamName: (v: string) => void;

    p1: string;
    setP1: (v: string) => void;
    p2: string;
    setP2: (v: string) => void;
    y1: string;
    setY1: (v: string) => void;
    y2: string;
    setY2: (v: string) => void;

    p1IsReferee: boolean;
    setP1IsReferee: (v: boolean) => void;
    p2IsReferee: boolean;
    setP2IsReferee: (v: boolean) => void;

    saveTeam: () => void;
    resetForm: () => void;

    poolN: string;
    setPoolN: (v: string) => void;
    genPool: (n: number) => void;
    addHomonyms: () => void;
    clearTeams: () => void;

    sortedTeams: Team[];
    editTeam: (id: string) => void;
    deleteTeam: (id: string) => void;
    state: AppState;
    setState: (next: AppState) => void;
}

export const TeamsTab: React.FC<TeamsTabProps> = ({
    t,
    fileRef,
    backupRef,
    importFile,
    importBackupJson,
    exportTeamsXlsx,
    exportBackupJson,
    printTeams,
    editingId,
    teamName,
    setTeamName,
    p1,
    setP1,
    p2,
    setP2,
    y1,
    setY1,
    y2,
    setY2,
    p1IsReferee,
    setP1IsReferee,
    p2IsReferee,
    setP2IsReferee,
    saveTeam,
    resetForm,
    poolN,
    setPoolN,
    genPool,
    addHomonyms,
    clearTeams,
    sortedTeams,
    editTeam,
    deleteTeam,
    state,
    setState,
}) => {
    const [query, setQuery] = React.useState('');
    const [p1FirstName, setP1FirstName] = React.useState('');
    const [p1LastName, setP1LastName] = React.useState('');
    const [p2FirstName, setP2FirstName] = React.useState('');
    const [p2LastName, setP2LastName] = React.useState('');
    const skipNextP1SyncRef = React.useRef(false);
    const skipNextP2SyncRef = React.useRef(false);
    const [viewMode, setViewMode] = React.useState<'team' | 'player'>('team');
    const [teamSortKey, setTeamSortKey] = React.useState<'registration' | 'team_name' | 'player1' | 'player2'>('registration');
    const [teamSortDirection, setTeamSortDirection] = React.useState<'asc' | 'desc'>('asc');
    const [playerSortKey, setPlayerSortKey] = React.useState<'registration' | 'player' | 'team_name' | 'year' | 'referee'>('player');
    const [playerSortDirection, setPlayerSortDirection] = React.useState<'asc' | 'desc'>('asc');

    const [profileEditDraft, setProfileEditDraft] = React.useState<null | {
        currentPlayerId: string;
        teamId: string;
        teamName: string;
        slot: 'G1' | 'G2';
        currentName: string;
        currentBirthDate: string;
        draftName: string;
        draftBirthDate: string;
    }>(null);
    const [profileFeedback, setProfileFeedback] = React.useState<null | { tone: 'success' | 'error'; message: string }>(null);

    // Lightweight Admin UI tokens (local to this tab): keeps buttons/inputs consistent
    // without introducing new dependencies or cross-tab refactors.
    const inputBase =
        'w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnBase =
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnPrimary = `${btnBase} bg-blue-700 border border-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-500`;
    const btnSuccess = `${btnBase} bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500`;
    const btnDanger = `${btnBase} bg-white border border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-400`;
    const btnIcon =
        'inline-flex items-center justify-center rounded-xl px-3 py-2 font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const checkbox = 'h-4 w-4 accent-beer-500';
    const toggleBtn =
        'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';

    const handleTeamSort = React.useCallback((nextKey: 'registration' | 'team_name' | 'player1' | 'player2') => {
        if (teamSortKey === nextKey) {
            setTeamSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            return;
        }
        setTeamSortKey(nextKey);
        setTeamSortDirection('asc');
    }, [teamSortKey]);

    const handlePlayerSort = React.useCallback((nextKey: 'registration' | 'player' | 'team_name' | 'year' | 'referee') => {
        if (playerSortKey === nextKey) {
            setPlayerSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            return;
        }
        setPlayerSortKey(nextKey);
        setPlayerSortDirection('asc');
    }, [playerSortKey]);

    React.useEffect(() => {
        if (!profileFeedback) return;
        const timer = window.setTimeout(() => setProfileFeedback(null), 2600);
        return () => window.clearTimeout(timer);
    }, [profileFeedback]);

    React.useEffect(() => {
        if (skipNextP1SyncRef.current) {
            skipNextP1SyncRef.current = false;
            return;
        }
        const parts = splitCanonicalPlayerName(p1);
        setP1FirstName(parts.firstName);
        setP1LastName(parts.lastName);
    }, [p1]);

    React.useEffect(() => {
        if (skipNextP2SyncRef.current) {
            skipNextP2SyncRef.current = false;
            return;
        }
        const parts = splitCanonicalPlayerName(p2);
        setP2FirstName(parts.firstName);
        setP2LastName(parts.lastName);
    }, [p2]);

    const profileEditMeta = React.useMemo(() => {
        if (!profileEditDraft) return null;

        const countTeamSlots = (teams: Team[] | undefined) => {
            if (!Array.isArray(teams) || !teams.length) return 0;
            return teams.reduce((total, team) => {
                let nextTotal = total;
                const player1Key = team.player1 ? resolvePlayerKey(state, getPlayerKey(team.player1, pickPlayerIdentityValue((team as any).player1BirthDate, team.player1YoB))) : '';
                const player2Key = team.player2 ? resolvePlayerKey(state, getPlayerKey(team.player2, pickPlayerIdentityValue((team as any).player2BirthDate, team.player2YoB))) : '';
                if (player1Key === profileEditDraft.currentPlayerId) nextTotal += 1;
                if (player2Key === profileEditDraft.currentPlayerId) nextTotal += 1;
                return nextTotal;
            }, 0);
        };

        const nextName = profileEditDraft.draftName.trim();
        const nextBirthDate = normalizeBirthDateInput(profileEditDraft.draftBirthDate) || undefined;
        const currentBirthDate = normalizeBirthDateInput(profileEditDraft.currentBirthDate) || undefined;
        const currentProfile = buildPlayerProfileSnapshot(state, profileEditDraft.currentPlayerId);
        const nextRawPlayerId = nextName ? getPlayerKey(nextName, pickPlayerIdentityValue(nextBirthDate)) : '';
        const nextPlayerId = nextRawPlayerId ? resolvePlayerKey(state, nextRawPlayerId) : '';
        const targetProfile = nextPlayerId ? buildPlayerProfileSnapshot(state, nextPlayerId) : null;
        const registeredSlots = countTeamSlots(state.teams);
        const liveTournamentSlots = countTeamSlots(state.tournament?.teams);
        const archivedTeamSlots = (state.tournamentHistory || []).reduce((total, tournamentRow) => total + countTeamSlots(tournamentRow.teams), 0);
        const isSameName = profileEditDraft.currentName.trim() === nextName;
        const isSameBirthDate = (currentBirthDate || '') === (nextBirthDate || '');
        const hasChanges = !!nextName && (!isSameName || !isSameBirthDate);
        const mergeTarget = !!targetProfile && nextPlayerId !== profileEditDraft.currentPlayerId;

        return {
            nextName,
            nextBirthDate: nextBirthDate || '',
            hasChanges,
            mergeTarget,
            currentProfile,
            targetProfile,
            targetLabel: targetProfile ? `${targetProfile.displayName}${targetProfile.yobLabel && targetProfile.yobLabel !== 'ND' ? ` · ${targetProfile.yobLabel}` : ''}` : '',
            registeredSlots,
            liveTournamentSlots,
            archivedTeamSlots,
            contributionRows: currentProfile?.contributions.length || 0,
            titleRows: currentProfile?.titles.length || 0,
            aliasCount: currentProfile?.aliasCount || 0,
        };
    }, [profileEditDraft, state]);

    const openProfileEditor = React.useCallback((team: Team, slot: 'G1' | 'G2') => {
        const playerName = slot === 'G1' ? team.player1 : team.player2;
        const birthDate = slot === 'G1' ? (team as any).player1BirthDate : (team as any).player2BirthDate;
        const yob = slot === 'G1' ? team.player1YoB : team.player2YoB;
        const trimmedName = String(playerName || '').trim();
        if (!trimmedName) return;
        const rawPlayerId = getPlayerKey(trimmedName, pickPlayerIdentityValue(birthDate, yob));
        setProfileEditDraft({
            currentPlayerId: resolvePlayerKey(state, rawPlayerId),
            teamId: team.id,
            teamName: team.name || '',
            slot,
            currentName: trimmedName,
            currentBirthDate: formatBirthDateDisplay(birthDate) || '',
            draftName: trimmedName,
            draftBirthDate: formatBirthDateDisplay(birthDate) || '',
        });
        setProfileFeedback(null);
    }, [state]);

    const closeProfileEditor = React.useCallback(() => {
        setProfileEditDraft(null);
    }, []);

    const applyProfileCorrection = React.useCallback(() => {
        if (!profileEditDraft) return;
        const nextName = profileEditDraft.draftName.trim();
        const nextBirthDate = normalizeBirthDateInput(profileEditDraft.draftBirthDate) || undefined;
        const currentBirthDate = normalizeBirthDateInput(profileEditDraft.currentBirthDate) || undefined;
        if (!nextName) {
            setProfileFeedback({
                tone: 'error',
                message: t('teams_profile_enter_correct_name'),
            });
            return;
        }
        if (profileEditDraft.currentName.trim() === nextName && (currentBirthDate || '') === (nextBirthDate || '')) {
            setProfileFeedback({
                tone: 'error',
                message: t('teams_profile_no_changes'),
            });
            return;
        }
        try {
            const nextState = updatePlayerProfileIdentity(state, {
                currentPlayerId: profileEditDraft.currentPlayerId,
                nextPlayerName: nextName,
                nextBirthDate,
            });
            setState(nextState);
            setProfileFeedback({
                tone: 'success',
                message: t('players_snackbar_profile_updated'),
            });
            setProfileEditDraft(null);
        } catch (error: any) {
            setProfileFeedback({
                tone: 'error',
                message: error?.message || t('players_snackbar_profile_update_error'),
            });
        }
    }, [profileEditDraft, setState, state, t]);

    const allTeamRows = React.useMemo(() => {
        return sortedTeams.map((team, index) => ({
            team,
            registrationNumber: index + 1,
        }));
    }, [sortedTeams]);

    const teamRows = React.useMemo(() => {
        const compareText = (aValue?: string, bValue?: string) => {
            const aText = String(aValue || '').trim();
            const bText = String(bValue || '').trim();
            if (!aText && !bText) return 0;
            if (!aText) return 1;
            if (!bText) return -1;
            return aText.localeCompare(bText, 'it', { sensitivity: 'base' });
        };

        const q = query.trim().toLowerCase();
        const filtered = !q ? allTeamRows : allTeamRows.filter(({ team: t }) => {
            const n = (t.name ?? '').toLowerCase();
            const p1 = (t.player1 ?? '').toLowerCase();
            const p2 = (t.player2 ?? '').toLowerCase();
            const y1s = formatBirthDateDisplay((t as any).player1BirthDate);
            const y2s = formatBirthDateDisplay((t as any).player2BirthDate);
            return n.includes(q) || p1.includes(q) || p2.includes(q) || y1s.toLowerCase().includes(q) || y2s.toLowerCase().includes(q);
        });

        return filtered.slice().sort((a, b) => {
            let result = 0;
            if (teamSortKey === 'team_name') result = compareText(a.team.name, b.team.name);
            if (teamSortKey === 'player1') result = compareText(a.team.player1, b.team.player1);
            if (teamSortKey === 'player2') result = compareText(a.team.player2, b.team.player2);
            if (teamSortKey === 'registration') result = a.registrationNumber - b.registrationNumber;
            if (teamSortDirection === 'desc') result *= -1;
            return result || (a.registrationNumber - b.registrationNumber);
        });
    }, [allTeamRows, query, teamSortDirection, teamSortKey]);

    const allPlayerRows = React.useMemo(() => {
        return allTeamRows.flatMap(({ team, registrationNumber }) => {
            const legacyRefereeOnG1 = !!team.isReferee && !(team as any).player1IsReferee && !(team as any).player2IsReferee;
            const rows: Array<{
                team: Team;
                registrationNumber: number;
                slot: 'G1' | 'G2';
                playerName: string;
                yob?: number;
                birthDate?: string;
                isReferee: boolean;
            }> = [];

            if (team.player1) {
                rows.push({
                    team,
                    registrationNumber,
                    slot: 'G1',
                    playerName: team.player1,
                    yob: team.player1YoB,
                    birthDate: (team as any).player1BirthDate,
                    isReferee: !!(team as any).player1IsReferee || legacyRefereeOnG1,
                });
            }

            if (team.player2) {
                rows.push({
                    team,
                    registrationNumber,
                    slot: 'G2',
                    playerName: team.player2,
                    yob: team.player2YoB,
                    birthDate: (team as any).player2BirthDate,
                    isReferee: !!(team as any).player2IsReferee,
                });
            }

            return rows;
        });
    }, [allTeamRows]);

    const playerRows = React.useMemo(() => {
        const compareText = (aValue?: string, bValue?: string) => {
            const aText = String(aValue || '').trim();
            const bText = String(bValue || '').trim();
            if (!aText && !bText) return 0;
            if (!aText) return 1;
            if (!bText) return -1;
            return aText.localeCompare(bText, 'it', { sensitivity: 'base' });
        };

        const compareBirthDate = (aValue?: string, bValue?: string) => {
            const aDate = String(aValue || '').trim();
            const bDate = String(bValue || '').trim();
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return aDate.localeCompare(bDate, 'it', { sensitivity: 'base' });
        };

        const q = query.trim().toLowerCase();
        const filtered = !q ? allPlayerRows : allPlayerRows.filter((row) => {
            const player = row.playerName.toLowerCase();
            const teamName = (row.team.name || '').toLowerCase();
            const yob = formatBirthDateDisplay(row.birthDate);
            const slot = row.slot.toLowerCase();
            return player.includes(q) || teamName.includes(q) || yob.toLowerCase().includes(q) || slot.includes(q);
        });

        return filtered.slice().sort((a, b) => {
            let result = 0;
            if (playerSortKey === 'registration') result = a.registrationNumber - b.registrationNumber || a.slot.localeCompare(b.slot);
            if (playerSortKey === 'player') result = compareText(a.playerName, b.playerName);
            if (playerSortKey === 'team_name') result = compareText(a.team.name, b.team.name);
            if (playerSortKey === 'year') result = compareBirthDate(a.birthDate, b.birthDate);
            if (playerSortKey === 'referee') result = Number(a.isReferee) - Number(b.isReferee);
            if (playerSortDirection === 'desc') result *= -1;
            return result || a.registrationNumber - b.registrationNumber || a.slot.localeCompare(b.slot);
        });
    }, [allPlayerRows, playerSortDirection, playerSortKey, query]);

    const SortHeader = ({
        label,
        column,
    }: {
        label: string;
        column: 'registration' | 'team_name' | 'player1' | 'player2';
    }) => {
        const active = teamSortKey === column;
        return (
            <button
                type="button"
                onClick={() => handleTeamSort(column)}
                className="inline-flex items-center gap-1 font-black text-slate-600 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 rounded-md"
                aria-label={`${t('sort_by')} ${label}`}
            >
                <span>{label}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${active ? 'opacity-100' : 'opacity-35'} ${active && teamSortDirection === 'asc' ? 'rotate-180' : ''}`} />
            </button>
        );
    };

    const PlayerSortHeader = ({
        label,
        column,
    }: {
        label: string;
        column: 'registration' | 'player' | 'team_name' | 'year' | 'referee';
    }) => {
        const active = playerSortKey === column;
        return (
            <button
                type="button"
                onClick={() => handlePlayerSort(column)}
                className="inline-flex items-center gap-1 font-black text-slate-600 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 rounded-md"
                aria-label={`${t('sort_by')} ${label}`}
            >
                <span>{label}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${active ? 'opacity-100' : 'opacity-35'} ${active && playerSortDirection === 'asc' ? 'rotate-180' : ''}`} />
            </button>
        );
    };

    const visibleCount = viewMode === 'team' ? teamRows.length : playerRows.length;
    const totalCount = viewMode === 'team' ? allTeamRows.length : allPlayerRows.length;

    return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xl font-black flex items-center gap-2"><Users className="w-5 h-5"/> {t('teams')}</h3>

            <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label={t('teams_search_toolbar')}>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('search')}
                        aria-label={t('teams_search_aria')}
                        className={`${inputBase} w-64 max-w-full`}
                    />

                    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                        <span className="px-2 text-xs font-black uppercase tracking-wide text-slate-500">{t('sort_by')}:</span>
                        <button
                            type="button"
                            onClick={() => setViewMode('team')}
                            className={`${toggleBtn} ${viewMode === 'team' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                            {t('team_view')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('player')}
                            className={`${toggleBtn} ${viewMode === 'player' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                            {t('player_view')}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label={t('teams_actions_aria')}>
                    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importFile(f);
                        e.currentTarget.value = '';
                    }}/>

                    <input ref={backupRef} type="file" className="hidden" accept="application/json,.json" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importBackupJson(f);
                        e.currentTarget.value = '';
                    }}/>

                    <button type="button" onClick={() => fileRef.current?.click()} className={btnSuccess}>
                        <Upload className="w-4 h-4"/> {t('import_excel_csv')}
                    </button>

                    <button type="button" onClick={resetForm} className={btnSecondary}>
                        <Plus className="w-4 h-4"/> {t('reset_form')}
                    </button>

                    {isTesterMode && (
                        <details className="relative">
                            <summary className={`list-none cursor-pointer select-none ${btnSecondary}`}>
                                <MoreHorizontal className="w-4 h-4"/> {t('advanced_actions')} <ChevronDown className="w-4 h-4 opacity-70"/>
                            </summary>
                            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg p-1 z-20">
                                <button type="button" onClick={(e) => { exportTeamsXlsx(); (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} className="w-full text-left px-3 py-2 rounded-xl font-black hover:bg-slate-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                                    <Download className="w-4 h-4"/> {t('export_excel')}
                                </button>
                                <button type="button" onClick={(e) => { exportBackupJson(); (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} className="w-full text-left px-3 py-2 rounded-xl font-black hover:bg-slate-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                                    <Download className="w-4 h-4"/> {t('backup_json')}
                                </button>
                                <button type="button" onClick={(e) => { backupRef.current?.click(); (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} className="w-full text-left px-3 py-2 rounded-xl font-black hover:bg-slate-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                                    <Upload className="w-4 h-4"/> {t('restore_json')}
                                </button>
                                <button type="button" onClick={(e) => { printTeams(); (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} className="w-full text-left px-3 py-2 rounded-xl font-black hover:bg-slate-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                                    <FileText className="w-4 h-4"/> {t('export_pdf')}
                                </button>
                            </div>
                        </details>
                    )}
                </div>

                {query.trim() ? (
                    <div className="text-xs text-slate-500 font-bold">
                        {visibleCount}/{totalCount}
                    </div>
                ) : null}
            </div>
        </div>

        {/* Manual Insert */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <h4 className="font-black">{editingId ? t('edit_team') : t('manual_entry')}</h4>
                    <div className="text-xs font-bold text-slate-500 mt-1">
                        {t('teams_manual_entry_desc')}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                    <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{t('team_name_label')}</label>
                    <input
                        value={teamName}
                        onChange={(e)=>setTeamName(e.target.value)}
                        placeholder={t('team_name_label')}
                        className={inputBase}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="md:col-span-3 space-y-1">
                        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{t('player_1_label')}</label>
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                            <input
                                value={p1FirstName}
                                onChange={(e) => {
                                    const nextFirstName = e.target.value;
                                    setP1FirstName(nextFirstName);
                                    skipNextP1SyncRef.current = true;
                                    setP1(buildCanonicalPlayerNameFromParts(nextFirstName, p1LastName));
                                }}
                                placeholder={t('name_label')}
                                className={inputBase}
                            />
                            <input
                                value={p1LastName}
                                onChange={(e) => {
                                    const nextLastName = e.target.value;
                                    setP1LastName(nextLastName);
                                    skipNextP1SyncRef.current = true;
                                    setP1(buildCanonicalPlayerNameFromParts(p1FirstName, nextLastName));
                                }}
                                placeholder={t('player_area_last_name')}
                                className={inputBase}
                            />
                            <label className="flex items-center gap-1 text-xs font-black text-slate-700 whitespace-nowrap">
                                <input className={checkbox} type="checkbox" checked={p1IsReferee} onChange={(e)=>setP1IsReferee(e.target.checked)} />
                                {t('referees')}
                            </label>
                        </div>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date_label_1')}</label>
                        <BirthDateInput value={y1} onChange={setY1} placeholder="gg/mm/aaaa" className={inputBase} ariaLabel={t('birth_date_player_1_aria')} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="md:col-span-3 space-y-1">
                        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{t('player_2_label')}</label>
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                            <input
                                value={p2FirstName}
                                onChange={(e) => {
                                    const nextFirstName = e.target.value;
                                    setP2FirstName(nextFirstName);
                                    skipNextP2SyncRef.current = true;
                                    setP2(buildCanonicalPlayerNameFromParts(nextFirstName, p2LastName));
                                }}
                                placeholder={t('name_label')}
                                className={inputBase}
                            />
                            <input
                                value={p2LastName}
                                onChange={(e) => {
                                    const nextLastName = e.target.value;
                                    setP2LastName(nextLastName);
                                    skipNextP2SyncRef.current = true;
                                    setP2(buildCanonicalPlayerNameFromParts(p2FirstName, nextLastName));
                                }}
                                placeholder={t('player_area_last_name')}
                                className={inputBase}
                            />
                            <label className="flex items-center gap-1 text-xs font-black text-slate-700 whitespace-nowrap">
                                <input className={checkbox} type="checkbox" checked={p2IsReferee} onChange={(e)=>setP2IsReferee(e.target.checked)} />
                                {t('referees')}
                            </label>
                        </div>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{t('birth_date_label_2')}</label>
                        <BirthDateInput value={y2} onChange={setY2} placeholder="gg/mm/aaaa" className={inputBase} ariaLabel={t('birth_date_player_2_aria')} />
                    </div>
                </div>
            </div>
            <div className="flex gap-2 mt-3">
                <button type="button" onClick={saveTeam} className={btnPrimary}>
                    <Plus className="w-4 h-4"/> {editingId ? t('save_changes') : t('referees_add_confirm')}
                </button>
                {editingId && (
                    <button type="button" onClick={resetForm} className={btnSecondary}>
                        {t('referees_add_cancel')}
                    </button>
                )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
                {t('teams_birthdate_note')}
            </p>
        </div>

        {/* Simulator (tester mode only) */}
        {isTesterMode ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h4 className="font-black mb-2">{t('pool_simulator_test')}</h4>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    value={poolN}
                    onChange={(e) => setPoolN(e.target.value.replace(/[^\d]/g, ''))}
                    className="w-24 border border-amber-300 rounded-xl px-3 py-2.5 font-black bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                    placeholder={t('teams_n_placeholder')}
                />
                <button type="button" onClick={() => genPool(Number(poolN))} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black bg-amber-600 text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2">
                    {t('generate_n_teams')}
                </button>
                <button type="button" onClick={addHomonyms} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-2">
                    {t('add_homonyms_test')}
                </button>
                <button type="button" onClick={clearTeams} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2">
                    <Trash2 className="w-4 h-4"/> {t('clear_registered_list')}
                </button>
            </div>
            <p className="text-xs text-amber-900/70 mt-2">
                {t('teams_pool_sim_desc')}
            </p>
        </div>
        ) : null}

        {/* List */}
        <div className="space-y-3">
            {profileFeedback ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${profileFeedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} role="status" aria-live="polite">
                    {profileFeedback.message}
                </div>
            ) : null}

            {profileEditDraft ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="text-sm font-black text-slate-950">{t('players_fix_profile_title')}</div>
                            <div className="mt-1 text-xs font-bold text-slate-600">
                                {profileEditDraft.teamName} · {profileEditDraft.slot} · {profileEditDraft.currentName}
                                {profileEditDraft.currentBirthDate ? ` · ${profileEditDraft.currentBirthDate}` : ''}
                            </div>
                            <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                                La correzione aggiorna live, referti, classifica live, storico e dati derivati dello stesso profilo. Se nome e data coincidono con un profilo esistente, i dati si accorpano; se li differenzi, il profilo si separa.
                            </div>
                        </div>
                        <button type="button" onClick={closeProfileEditor} className={btnSecondary}>
                            {t('editor_cancel_action')}
                        </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="block">
                            <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">{t('players_correct_name')}</div>
                            <input
                                value={profileEditDraft.draftName}
                                onChange={(event) => setProfileEditDraft((current) => current ? { ...current, draftName: event.target.value } : current)}
                                className={inputBase}
                                placeholder={t('players_name_placeholder')}
                            />
                        </label>
                        <label className="block">
                            <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">{t('players_birth_date')}</div>
                            <BirthDateInput
                                value={profileEditDraft.draftBirthDate}
                                onChange={(value) => setProfileEditDraft((current) => current ? { ...current, draftBirthDate: value } : current)}
                                className={inputBase}
                                placeholder={t('players_birth_date_placeholder')}
                                ariaLabel={t('players_profile_birthdate_aria')}
                            />
                        </label>
                    </div>
                    {profileEditMeta ? (
                        <div className="mt-4 space-y-3">
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('teams_live_registered')}</div>
                                    <div className="mt-1 text-lg font-black text-slate-950">{profileEditMeta.registeredSlots}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('teams_live_tournament')}</div>
                                    <div className="mt-1 text-lg font-black text-slate-950">{profileEditMeta.liveTournamentSlots}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('teams_history_rows')}</div>
                                    <div className="mt-1 text-lg font-black text-slate-950">{profileEditMeta.archivedTeamSlots}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('teams_stat_rows')}</div>
                                    <div className="mt-1 text-lg font-black text-slate-950">{profileEditMeta.contributionRows}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('titles_total')}</div>
                                    <div className="mt-1 text-lg font-black text-slate-950">{profileEditMeta.titleRows}</div>
                                </div>
                                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('teams_active_aliases')}</div>
                                    <div className="mt-1 text-lg font-black text-slate-950">{profileEditMeta.aliasCount}</div>
                                </div>
                            </div>

                            {!profileEditMeta.nextName ? (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-800">
                                    {t('teams_profile_enter_correct_name_full')}
                                </div>
                            ) : !profileEditMeta.hasChanges ? (
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700">
                                    {t('teams_profile_no_effective_changes')}
                                </div>
                            ) : profileEditMeta.mergeTarget ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-900">
                                    {t('teams_profile_merge_desc_prefix')} <span className="font-black">{profileEditMeta.targetLabel}</span>. {t('teams_profile_merge_desc_suffix')}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold text-emerald-900">
                                    {t('teams_profile_keep_separate_desc')}
                                </div>
                            )}
                        </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={applyProfileCorrection} disabled={!profileEditMeta?.nextName || !profileEditMeta?.hasChanges} className={btnPrimary}>
                            {t('teams_profile_save_correction')}
                        </button>
                        <button type="button" onClick={closeProfileEditor} className={btnSecondary}>
                            {t('editor_cancel_action')}
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                <div className="font-black">{t('registered_list')} ({visibleCount})</div>
            </div>
            <div className="overflow-auto">
                {viewMode === 'team' ? (
                    <table className="min-w-full text-sm">
                        <thead className="bg-white sticky top-0 border-b border-slate-100">
                            <tr className="text-left text-slate-500">
                                <th className="p-3"><SortHeader label={t('teams_registration_short')} column="registration" /></th>
                                <th className="p-3"><SortHeader label={t('teams').slice(0, -1) || t('teams')} column="team_name" /></th>
                                <th className="p-3"><SortHeader label={t('teams_player1_short')} column="player1" /></th>
                                <th className="p-3">{t('birth_date')}</th>
                                <th className="p-3"><SortHeader label={t('teams_player2_short')} column="player2" /></th>
                                <th className="p-3">{t('birth_date')}</th>
                                <th className="p-3">{t('referee_short')}</th>
                                <th className="p-3 text-right">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {teamRows.map(({ team, registrationNumber }) => (
                                <tr key={team.id} className="hover:bg-slate-50">
                                    <td className="p-3 font-mono font-black text-slate-500">{registrationNumber}</td>
                                    <td className="p-3 font-black text-slate-900">{team.name}</td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <span>{team.player1}</span>
                                            {team.player1 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openProfileEditor(team, 'G1')}
                                                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                                    title={t('players_fix_profile_title')}
                                                    aria-label={`${t('players_fix_profile_title')} ${team.player1}`}
                                                >
                                                    <Pencil className="w-3.5 h-3.5"/>
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="p-3 font-mono">{formatBirthDateDisplay((team as any).player1BirthDate) || t('not_available_short')}</td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <span>{team.player2}</span>
                                            {team.player2 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openProfileEditor(team, 'G2')}
                                                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                                    title={t('players_fix_profile_title')}
                                                    aria-label={`${t('players_fix_profile_title')} ${team.player2}`}
                                                >
                                                    <Pencil className="w-3.5 h-3.5"/>
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="p-3 font-mono">{formatBirthDateDisplay((team as any).player2BirthDate) || t('not_available_short')}</td>
                                    <td className="p-3">
                                        {((team as any).player1IsReferee || (team as any).player2IsReferee || team.isReferee) ? (
                                            <div className="flex flex-wrap gap-2">
                                                {(team as any).player1IsReferee ? <span className="inline-flex items-center gap-1 text-xs font-black"><span>{t('teams_player1_short')}</span><span>✅</span></span> : null}
                                                {(team as any).player2IsReferee ? <span className="inline-flex items-center gap-1 text-xs font-black"><span>{t('teams_player2_short')}</span><span>✅</span></span> : null}
                                                {(!(team as any).player1IsReferee && !(team as any).player2IsReferee && team.isReferee) ? <span className="inline-flex items-center gap-1 text-xs font-black"><span>{t('referee_short')}</span><span>✅</span></span> : null}
                                            </div>
                                        ) : ''}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="inline-flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => editTeam(team.id)}
                                                title={t('edit')}
                                                aria-label={t('edit')}
                                                className={`${btnIcon} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`}
                                            >
                                                <Pencil className="w-4 h-4"/>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteTeam(team.id)}
                                                title={t('delete')}
                                                aria-label={t('delete')}
                                                className={`${btnIcon} bg-white border border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-400`}
                                            >
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!teamRows.length && (
                                <tr><td colSpan={8} className="p-6 text-center text-slate-400">{sortedTeams.length ? t('no_results') : t('no_teams')}</td></tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="min-w-full text-sm">
                        <thead className="bg-white sticky top-0 border-b border-slate-100">
                            <tr className="text-left text-slate-500">
                                <th className="p-3"><PlayerSortHeader label={t('teams_registration_short')} column="registration" /></th>
                                <th className="p-3"><PlayerSortHeader label={t('players').slice(0, -1) || t('players')} column="player" /></th>
                                <th className="p-3"><PlayerSortHeader label={t('teams').slice(0, -1) || t('teams')} column="team_name" /></th>
                                <th className="p-3"><PlayerSortHeader label={t('birth_date')} column="year" /></th>
                                <th className="p-3"><PlayerSortHeader label={t('referees')} column="referee" /></th>
                                <th className="p-3 text-right">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {playerRows.map((row) => (
                                <tr key={`${row.team.id}-${row.slot}`} className="hover:bg-slate-50">
                                    <td className="p-3 font-mono font-black text-slate-500">{row.registrationNumber}</td>
                                    <td className="p-3 font-black text-slate-900">{row.playerName}</td>
                                    <td className="p-3 font-bold text-slate-700">{row.team.name}</td>
                                    <td className="p-3 font-mono">{formatBirthDateDisplay(row.birthDate) || t('not_available_short')}</td>
                                    <td className="p-3">{row.isReferee ? '✅' : ''}</td>
                                    <td className="p-3 text-right">
                                        <div className="inline-flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openProfileEditor(row.team, row.slot)}
                                                title={t('players_fix_profile_title')}
                                                aria-label={`${t('players_fix_profile_title')} ${row.playerName}`}
                                                className={`${btnIcon} bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 focus-visible:ring-blue-500`}
                                            >
                                                <Pencil className="w-4 h-4"/>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => editTeam(row.team.id)}
                                                title={t('edit')}
                                                aria-label={t('edit')}
                                                className={`${btnIcon} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`}
                                            >
                                                <Pencil className="w-4 h-4"/>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteTeam(row.team.id)}
                                                title={t('delete')}
                                                aria-label={t('delete')}
                                                className={`${btnIcon} bg-white border border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-400`}
                                            >
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!playerRows.length && (
                                <tr><td colSpan={6} className="p-6 text-center text-slate-400">{allPlayerRows.length ? t('no_results') : t('no_teams')}</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            </div>
        </div>
    </div>
);
};
