import React from 'react';
import type { DataTabProps } from '../DataTab';
import type { IntegrationScorerEntry } from '../../../../types';
import { getPlayerKey, isU25, syncArchivedHistoryToHallOfFame } from '../../../../services/storageService';
import { BirthDateInput } from '../../BirthDateInput';
import { deriveYoBFromBirthDate, formatBirthDateDisplay, normalizeBirthDateInput, pickPlayerIdentityValue } from '../../../../services/playerIdentity';
import { uuid } from '../../../../services/id';
import { getXLSX } from '../../../../services/lazyXlsx';
import { downloadBlob } from '../../../../services/adminDownloadUtils';
import { decodeCsvText, detectCsvSeparator, parseCsvRows } from '../../../../services/adminCsvUtils';
import { removeArchivedTournamentDeep } from '../../../../services/archiveCascadeDelete';

type AwardDraftRow = {
    playerName: string;
    teamName: string;
    birthDate: string;
    value: string;
};

const createEmptyAwardRow = (): AwardDraftRow => ({
    playerName: '',
    teamName: '',
    birthDate: '',
    value: '',
});

const normalizeHeader = (value: string) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const IntegrationsHof: React.FC<DataTabProps> = ({
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
    createArchivedTournament,
}) => {
    // Lightweight Admin UI tokens (local): consistent controls without new deps
    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const inputBase =
        `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 ${ring}`;
    const selectBase =
        `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 ${ring}`;
    const btnBase =
        `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black transition disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnPrimary = `${btnBase} bg-blue-700 border border-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-500`;
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnDanger = `${btnBase} bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;
    const btnSmBase = `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-black transition text-xs ${ring}`;
    const btnSmSecondary = `${btnSmBase} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50`;
    const btnSmDanger = `${btnSmBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;

    const [bundleTournamentDate, setBundleTournamentDate] = React.useState('');
    const [bundleTournamentName, setBundleTournamentName] = React.useState('');
    const [bundleWinnerTeamName, setBundleWinnerTeamName] = React.useState('');
    const [bundleWinnerP1, setBundleWinnerP1] = React.useState('');
    const [bundleWinnerP2, setBundleWinnerP2] = React.useState('');
    const [bundleMvpRows, setBundleMvpRows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [bundleTopScorerRows, setBundleTopScorerRows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [bundleDefenderRows, setBundleDefenderRows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [bundleTopScorerU25Rows, setBundleTopScorerU25Rows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [bundleDefenderU25Rows, setBundleDefenderU25Rows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [bundleImportedScorers, setBundleImportedScorers] = React.useState<IntegrationScorerEntry[]>([]);
    const [bundleImportedScorersLabel, setBundleImportedScorersLabel] = React.useState('');
    const [bundleImportedScorersWarnings, setBundleImportedScorersWarnings] = React.useState<string[]>([]);
    const bundleScorersFileRef = React.useRef<HTMLInputElement | null>(null);
    const [editTournamentId, setEditTournamentId] = React.useState('');
    const [editTournamentDate, setEditTournamentDate] = React.useState('');
    const [editTournamentName, setEditTournamentName] = React.useState('');
    const [editWinnerTeamName, setEditWinnerTeamName] = React.useState('');
    const [editWinnerP1, setEditWinnerP1] = React.useState('');
    const [editWinnerP2, setEditWinnerP2] = React.useState('');
    const [editMvpRows, setEditMvpRows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [editTopScorerRows, setEditTopScorerRows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [editDefenderRows, setEditDefenderRows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [editTopScorerU25Rows, setEditTopScorerU25Rows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [editDefenderU25Rows, setEditDefenderU25Rows] = React.useState<AwardDraftRow[]>([createEmptyAwardRow()]);
    const [editWinnerLocked, setEditWinnerLocked] = React.useState(false);
    const [editTopScorerLocked, setEditTopScorerLocked] = React.useState(false);
    const [editDefenderLocked, setEditDefenderLocked] = React.useState(false);
    const [editTopScorerU25Locked, setEditTopScorerU25Locked] = React.useState(false);
    const [editDefenderU25Locked, setEditDefenderU25Locked] = React.useState(false);
    const [editHasBoundResults, setEditHasBoundResults] = React.useState(false);
    const [editHasHistoryTournament, setEditHasHistoryTournament] = React.useState(false);
    const [editU25DisabledByTournament, setEditU25DisabledByTournament] = React.useState(false);
    const [bundleEditorMode, setBundleEditorMode] = React.useState<'create' | 'edit'>('create');
    const [bundleEditorSection, setBundleEditorSection] = React.useState<'setup' | 'winners' | 'scorers' | 'awards'>('setup');

    React.useEffect(() => {
        if (bundleEditorMode === 'edit' && bundleEditorSection === 'scorers') {
            setBundleEditorSection('setup');
        }
    }, [bundleEditorMode, bundleEditorSection]);

    const clearTournamentBundleEditor = () => {
        setEditTournamentDate('');
        setEditTournamentName('');
        setEditWinnerTeamName('');
        setEditWinnerP1('');
        setEditWinnerP2('');
        setEditMvpRows([createEmptyAwardRow()]);
        setEditTopScorerRows([createEmptyAwardRow()]);
        setEditDefenderRows([createEmptyAwardRow()]);
        setEditTopScorerU25Rows([createEmptyAwardRow()]);
        setEditDefenderU25Rows([createEmptyAwardRow()]);
        setEditWinnerLocked(false);
        setEditTopScorerLocked(false);
        setEditDefenderLocked(false);
        setEditTopScorerU25Locked(false);
        setEditDefenderU25Locked(false);
        setEditHasBoundResults(false);
        setEditHasHistoryTournament(false);
        setEditU25DisabledByTournament(false);
    };

    const clearBundleScorersImport = () => {
        setBundleImportedScorers([]);
        setBundleImportedScorersLabel('');
        setBundleImportedScorersWarnings([]);
        setBundleTopScorerRows([createEmptyAwardRow()]);
        setBundleDefenderRows([createEmptyAwardRow()]);
        setBundleTopScorerU25Rows([createEmptyAwardRow()]);
        setBundleDefenderU25Rows([createEmptyAwardRow()]);
    };

    const getTournamentMatchesForEditor = (tournament: any) => {
        const directMatches = Array.isArray(tournament?.matches) ? tournament.matches : [];
        if (directMatches.length) return directMatches;
        const rounds = Array.isArray(tournament?.rounds) ? tournament.rounds : [];
        return rounds.flat().filter(Boolean);
    };

    const normalizeInputDate = (raw?: string) => {
        const value = String(raw || '').trim();
        if (!value) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const ts = Date.parse(value);
        if (!Number.isFinite(ts)) return '';
        return new Date(ts).toISOString().slice(0, 10);
    };

    const normalizeAwardRows = (rows: AwardDraftRow[], { withValue = false }: { withValue?: boolean } = {}) => {
        const normalized = (rows || [])
            .map((row) => ({
                playerName: String(row?.playerName || '').trim(),
                teamName: String(row?.teamName || '').trim(),
                birthDate: formatBirthDateDisplay(row?.birthDate || '') || '',
                value: withValue ? String(row?.value || '').replace(/[^\d]/g, '') : '',
            }))
            .filter((row) => row.playerName || row.teamName || row.birthDate || (withValue && row.value));
        return normalized.length ? normalized : [createEmptyAwardRow()];
    };

    const updateAwardRow = (
        setter: React.Dispatch<React.SetStateAction<AwardDraftRow[]>>,
        index: number,
        patch: Partial<AwardDraftRow>
    ) => {
        setter((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
    };

    const addAwardTieRow = (setter: React.Dispatch<React.SetStateAction<AwardDraftRow[]>>) => {
        setter((prev) => [...(prev || []), createEmptyAwardRow()]);
    };

    const removeAwardTieRow = (setter: React.Dispatch<React.SetStateAction<AwardDraftRow[]>>, index: number) => {
        setter((prev) => {
            const next = (prev || []).filter((_, rowIndex) => rowIndex !== index);
            return next.length ? next : [createEmptyAwardRow()];
        });
    };

    const resolveTournamentPlayerTeamName = (tournament: any, entry: any) => {
        const playerName = String(entry?.playerNames?.[0] || '').trim().toLowerCase();
        if (!playerName) return '';
        const playerBirthDate = normalizeBirthDateInput(entry?.playerBirthDate || '');
        const teams = Array.isArray(tournament?.teams) ? tournament.teams : [];
        const matchTeam = teams.find((team: any) => {
            const p1Name = String(team?.player1 || '').trim().toLowerCase();
            const p2Name = String(team?.player2 || '').trim().toLowerCase();
            const p1Birth = normalizeBirthDateInput(team?.player1BirthDate || '');
            const p2Birth = normalizeBirthDateInput(team?.player2BirthDate || '');
            return (p1Name === playerName && (!playerBirthDate || p1Birth === playerBirthDate))
                || (p2Name === playerName && (!playerBirthDate || p2Birth === playerBirthDate));
        });
        return String(matchTeam?.name || '');
    };

    const mapEntriesToAwardRows = (entries: any[], historyTournament?: any, { withValue = false }: { withValue?: boolean } = {}) => {
        const sorted = (entries || [])
            .slice()
            .sort((a: any, b: any) => String(a?.id || '').localeCompare(String(b?.id || '')));
        const rows = sorted.map((entry: any) => ({
            playerName: String(entry?.playerNames?.[0] || ''),
            teamName: String(entry?.teamName || resolveTournamentPlayerTeamName(historyTournament, entry) || ''),
            birthDate: formatBirthDateDisplay(entry?.playerBirthDate) || '',
            value: withValue && entry?.value !== undefined && entry?.value !== null ? String(entry.value) : '',
        }));
        return rows.length ? rows : [createEmptyAwardRow()];
    };

    const rankImportedAwardRows = (
        entries: IntegrationScorerEntry[],
        metric: 'points' | 'soffi',
        u25Only: boolean = false
    ) => {
        const filtered = (entries || [])
            .filter((entry) => String(entry?.name || '').trim())
            .filter((entry) => !u25Only || isU25((entry as any).birthDate));
        if (!filtered.length) return [createEmptyAwardRow()];
        const maxValue = Math.max(...filtered.map((entry) => Number((entry as any)?.[metric] || 0)));
        if (!Number.isFinite(maxValue) || maxValue <= 0) return [createEmptyAwardRow()];
        const winners = filtered.filter((entry) => Number((entry as any)?.[metric] || 0) === maxValue);
        return winners.map((entry) => ({
            playerName: String(entry.name || ''),
            teamName: String(entry.teamName || ''),
            birthDate: formatBirthDateDisplay((entry as any).birthDate) || '',
            value: String(Number((entry as any)?.[metric] || 0)),
        }));
    };

    const getTournamentBundleSnapshot = (tournamentId: string) => {
        const historyTournament = (state.tournamentHistory || []).find((row: any) => row.id === tournamentId) || null;
        const entries = (state.hallOfFame || []).filter((entry: any) => entry.tournamentId === tournamentId);
        if (!historyTournament && !entries.length) return null;

        const pickEntry = (type: string) => entries.find((entry: any) => entry.type === type) || null;
        const mvpEntries = entries.filter((entry: any) => entry.type === 'mvp').slice().sort((a: any, b: any) => String(a.id || '').localeCompare(String(b.id || '')));
        const winnerEntry = pickEntry('winner');
        const topScorerEntry = pickEntry('top_scorer');
        const defenderEntry = pickEntry('defender');
        const topScorerU25Entry = pickEntry('top_scorer_u25');
        const defenderU25Entry = pickEntry('defender_u25');

        const matches = historyTournament ? getTournamentMatchesForEditor(historyTournament) : [];
        const hasBoundResults = matches.some((match: any) => {
            if (!match || match.hidden || match.isBye) return false;
            const hasStats = Array.isArray(match.stats) && match.stats.length > 0;
            const hasScores = Number(match.scoreA || 0) !== 0 || Number(match.scoreB || 0) !== 0;
            return match.status === 'finished' || match.played === true || hasStats || hasScores;
        });

        const u25DisabledByTournament = !!historyTournament && historyTournament.includeU25Awards === false && !topScorerU25Entry && !defenderU25Entry;
        const tournamentDate = normalizeInputDate(historyTournament?.startDate || winnerEntry?.sourceTournamentDate || topScorerEntry?.sourceTournamentDate || defenderEntry?.sourceTournamentDate || topScorerU25Entry?.sourceTournamentDate || defenderU25Entry?.sourceTournamentDate || '');
        const tournamentName = String(historyTournament?.name || winnerEntry?.tournamentName || topScorerEntry?.tournamentName || defenderEntry?.tournamentName || topScorerU25Entry?.tournamentName || defenderU25Entry?.tournamentName || '');

        return {
            historyTournament,
            entries,
            tournamentDate,
            tournamentName,
            winnerTeamName: String(winnerEntry?.teamName || ''),
            winnerP1: String((winnerEntry?.playerNames || [])[0] || ''),
            winnerP2: String((winnerEntry?.playerNames || [])[1] || ''),
            mvpRows: mapEntriesToAwardRows(mvpEntries, historyTournament),
            topScorerRows: mapEntriesToAwardRows(entries.filter((entry: any) => entry.type === 'top_scorer'), historyTournament, { withValue: true }),
            defenderRows: mapEntriesToAwardRows(entries.filter((entry: any) => entry.type === 'defender'), historyTournament, { withValue: true }),
            topScorerU25Rows: mapEntriesToAwardRows(entries.filter((entry: any) => entry.type === 'top_scorer_u25'), historyTournament, { withValue: true }),
            defenderU25Rows: mapEntriesToAwardRows(entries.filter((entry: any) => entry.type === 'defender_u25'), historyTournament, { withValue: true }),
            hasBoundResults,
            hasHistoryTournament: !!historyTournament,
            winnerLocked: hasBoundResults,
            topScorerLocked: hasBoundResults,
            defenderLocked: hasBoundResults,
            topScorerU25Locked: hasBoundResults || u25DisabledByTournament,
            defenderU25Locked: hasBoundResults || u25DisabledByTournament,
            u25DisabledByTournament,
        };
    };

    const applyTournamentBundleSnapshot = (tournamentId: string) => {
        if (!tournamentId) {
            setEditTournamentId('');
            clearTournamentBundleEditor();
            return;
        }
        const snapshot = getTournamentBundleSnapshot(tournamentId);
        if (!snapshot) {
            setEditTournamentId('');
            clearTournamentBundleEditor();
            return;
        }
        setEditTournamentId(tournamentId);
        setEditTournamentDate(snapshot.tournamentDate);
        setEditTournamentName(snapshot.tournamentName);
        setEditWinnerTeamName(snapshot.winnerTeamName);
        setEditWinnerP1(snapshot.winnerP1);
        setEditWinnerP2(snapshot.winnerP2);
        setEditMvpRows(snapshot.mvpRows);
        setEditTopScorerRows(snapshot.topScorerRows);
        setEditDefenderRows(snapshot.defenderRows);
        setEditTopScorerU25Rows(snapshot.topScorerU25Rows);
        setEditDefenderU25Rows(snapshot.defenderU25Rows);
        setEditWinnerLocked(snapshot.winnerLocked);
        setEditTopScorerLocked(snapshot.topScorerLocked);
        setEditDefenderLocked(snapshot.defenderLocked);
        setEditTopScorerU25Locked(snapshot.topScorerU25Locked);
        setEditDefenderU25Locked(snapshot.defenderU25Locked);
        setEditHasBoundResults(snapshot.hasBoundResults);
        setEditHasHistoryTournament(snapshot.hasHistoryTournament);
        setEditU25DisabledByTournament(snapshot.u25DisabledByTournament);
    };

    return (() => {
                                const isManual = (e: any) => e?.sourceType === 'manual' || String(e?.tournamentId || '').startsWith('manual_');
                                const manualEntries = (state.hallOfFame || [])
                                    .filter(isManual)
                                    .slice()
                                    .sort((a: any, b: any) => {
                                        const aDateTs = Date.parse(String(a?.sourceTournamentDate || ''));
                                        const bDateTs = Date.parse(String(b?.sourceTournamentDate || ''));
                                        const hasADate = Number.isFinite(aDateTs);
                                        const hasBDate = Number.isFinite(bDateTs);
                                        if (hasADate && hasBDate && bDateTs !== aDateTs) return bDateTs - aDateTs;
                                        if (hasADate !== hasBDate) return hasBDate ? 1 : -1;
                                        const ay = parseInt(String(a.year || '0'), 10) || 0;
                                        const by = parseInt(String(b.year || '0'), 10) || 0;
                                        if (by !== ay) return by - ay;
                                        return String(a.tournamentName || '').localeCompare(String(b.tournamentName || ''), 'it', { sensitivity: 'base' });
                                    });

                                const reset = () => {
                                    setHofEditId('');
                                    setHofEditTournamentId('');
                                    setHofYear(new Date().getFullYear().toString());
                                    setHofTournamentName('');
                                    setHofType('winner');
                                    setHofTeamName('');
                                    setHofWinnerP1('');
                                    setHofWinnerP2('');
                                    setHofPlayerName('');
                                    setHofPlayerYoB('');
                                    setHofValue('');
                                };

                                const resetBundle = () => {
                                    setBundleTournamentDate('');
                                    setBundleTournamentName('');
                                    setBundleWinnerTeamName('');
                                    setBundleWinnerP1('');
                                    setBundleWinnerP2('');
                                    setBundleMvpRows([createEmptyAwardRow()]);
                                    clearBundleScorersImport();
                                };

                                const formatTournamentDateLabel = (value?: string) => {
                                    const iso = String(value || '').trim();
                                    const ts = Date.parse(iso);
                                    if (!Number.isFinite(ts)) return '';
                                    return new Intl.DateTimeFormat('it-IT', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                    }).format(new Date(ts));
                                };

                                const toMetricValue = (raw: string) => {
                                    const parsed = Number(String(raw || '').replace(/[^\d]/g, ''));
                                    if (!Number.isFinite(parsed) || String(raw || '').trim() === '') return undefined;
                                    return Math.max(0, parsed);
                                };

                                const parseTournamentScorersRows = (rows: Array<Record<string, any>>, fileName: string): IntegrationScorerEntry[] => {
                                    const getField = (row: Record<string, any>, candidates: string[]) => {
                                        const normalizedCandidates = new Set(candidates.map(normalizeHeader));
                                        for (const key of Object.keys(row || {})) {
                                            if (normalizedCandidates.has(normalizeHeader(key))) return row[key];
                                        }
                                        return '';
                                    };

                                    return (rows || []).map((row) => {
                                        const name = String(getField(row, ['Giocatore', 'Nome', 'Player', 'Name'])).trim();
                                        if (!name) return null;
                                        const birthDate = normalizeBirthDateInput(String(getField(row, ['Data di nascita', 'DataNascita', 'BirthDate', 'DOB'])));
                                        const teamName = String(getField(row, ['Squadra', 'Team', 'TeamName'])).trim();
                                        const games = Math.max(0, parseInt(String(getField(row, ['Partite', 'Gare', 'Games', 'Played']) || '0').replace(/[^\d]/g, ''), 10) || 0);
                                        const points = Math.max(0, parseInt(String(getField(row, ['Canestri', 'Punti', 'Points', 'PT']) || '0').replace(/[^\d]/g, ''), 10) || 0);
                                        const soffi = Math.max(0, parseInt(String(getField(row, ['Soffi', 'SF', 'Blows']) || '0').replace(/[^\d]/g, ''), 10) || 0);
                                        return {
                                            id: `bundle_sc_${uuid()}`,
                                            name,
                                            birthDate,
                                            yob: deriveYoBFromBirthDate(birthDate),
                                            teamName: teamName || undefined,
                                            games,
                                            points,
                                            soffi,
                                            createdAt: Date.now(),
                                            source: fileName,
                                            sourceType: 'manual_integration' as const,
                                            sourceTournamentId: null,
                                            sourceLabel: fileName,
                                        };
                                    }).filter(Boolean) as IntegrationScorerEntry[];
                                };

                                const importBundleScorersFromFile = async (file: File) => {
                                    const lower = String(file.name || '').toLowerCase();
                                    if (lower.endsWith('.csv') || String(file.type || '').includes('csv')) {
                                        const text = await decodeCsvText(file);
                                        const sep = detectCsvSeparator(text);
                                        const matrix = parseCsvRows(text, sep);
                                        if (!matrix.length) return [];
                                        const header = matrix[0] || [];
                                        const rows = matrix.slice(1).map((cells) => {
                                            const row: Record<string, any> = {};
                                            header.forEach((head, index) => {
                                                row[head || `COL_${index}`] = cells[index] ?? '';
                                            });
                                            return row;
                                        });
                                        return parseTournamentScorersRows(rows, file.name);
                                    }
                                    const XLSX = await getXLSX();
                                    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
                                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                                    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
                                    return parseTournamentScorersRows(rows, file.name);
                                };

                                const applyBundleScorersImport = (entries: IntegrationScorerEntry[], label: string) => {
                                    setBundleImportedScorers(entries);
                                    setBundleImportedScorersLabel(label);
                                    setBundleTopScorerRows(rankImportedAwardRows(entries, 'points'));
                                    setBundleDefenderRows(rankImportedAwardRows(entries, 'soffi'));
                                    setBundleTopScorerU25Rows(rankImportedAwardRows(entries, 'points', true));
                                    setBundleDefenderU25Rows(rankImportedAwardRows(entries, 'soffi', true));
                                    const warnings: string[] = [];
        if (!rankImportedAwardRows(entries, 'points')[0]?.playerName) warnings.push(t('hof_bundle_no_top_scorer_determined'));
        if (!rankImportedAwardRows(entries, 'soffi')[0]?.playerName) warnings.push(t('hof_bundle_no_defender_determined'));
                                    setBundleImportedScorersWarnings(warnings);
                                };

                                const onBundleScorersFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    if (!file) return;
                                    try {
                                        const imported = await importBundleScorersFromFile(file);
                                        if (!imported.length) {
                                            alert(t('hof_bundle_invalid_scorers_rows'));
                                            return;
                                        }
                                        applyBundleScorersImport(imported, file.name);
                                    } catch (error) {
                                        console.error(error);
                                        alert(t('hof_bundle_import_error'));
                                    }
                                };

                                const downloadBundleTemplateXlsx = async () => {
                                    const XLSX = await getXLSX();
                                    const sheet = XLSX.utils.aoa_to_sheet([
                                        ['Giocatore', 'Squadra', 'Data di nascita', 'Partite', 'Canestri', 'Soffi'],
                                        ['', '', '', '', '', ''],
                                    ]);
                                    const workbook = XLSX.utils.book_new();
                                    XLSX.utils.book_append_sheet(workbook, sheet, 'Marcatori');
                                    const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
                                    downloadBlob(
                                        new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                                        'template_torneo_marcatori.xlsx'
                                    );
                                };

                                const buildManualPlayerEntry = ({
                                    id,
                                    tournamentId,
                                    tournamentName,
                                    tournamentDate,
                                    year,
                                    type,
                                    playerName,
                                    teamName,
                                    birthDateInput,
                                    value,
                                    sourceType = 'manual',
                                }: {
                                    id: string;
                                    tournamentId: string;
                                    tournamentName: string;
                                    tournamentDate: string;
                                    year: string;
                                    type: 'mvp' | 'top_scorer' | 'defender' | 'top_scorer_u25' | 'defender_u25';
                                    playerName: string;
                                    teamName?: string;
                                    birthDateInput?: string;
                                    value?: number;
                                    sourceType?: 'manual' | 'archived_tournament';
                                }) => {
                                    const cleanName = playerName.trim();
                                    if (!cleanName) return null;
                                    const playerBirthDate = normalizeBirthDateInput(birthDateInput || '');
                                    if ((birthDateInput || '').trim() && !playerBirthDate) {
                                        throw new Error(t('birthdate_invalid'));
                                    }
                                    const yob = deriveYoBFromBirthDate(playerBirthDate);
                                    const nextEntry: any = {
                                        id,
                                        year,
                                        tournamentId,
                                        tournamentName,
                                        type,
                                        playerNames: [cleanName],
                                        sourceType,
                                        sourceTournamentId: tournamentId,
                                        sourceTournamentName: tournamentName,
                                        sourceTournamentDate: tournamentDate,
                                        sourceAutoGenerated: false,
                                        manuallyEdited: true,
                                        playerBirthDate,
                                        playerId: getPlayerKey(cleanName, pickPlayerIdentityValue(playerBirthDate, yob)),
                                    };
                                    if (String(teamName || '').trim()) nextEntry.teamName = String(teamName || '').trim();
                                    if (value !== undefined) nextEntry.value = value;
                                    return nextEntry;
                                };

                                const buildAwardEntriesFromRows = ({
                                    tournamentId,
                                    tournamentName,
                                    tournamentDate,
                                    year,
                                    type,
                                    rows,
                                    sourceType = 'manual',
                                    withValue = false,
                                }: {
                                    tournamentId: string;
                                    tournamentName: string;
                                    tournamentDate: string;
                                    year: string;
                                    type: 'mvp' | 'top_scorer' | 'defender' | 'top_scorer_u25' | 'defender_u25';
                                    rows: AwardDraftRow[];
                                    sourceType?: 'manual' | 'archived_tournament';
                                    withValue?: boolean;
                                }) => {
                                    const normalizedRows = normalizeAwardRows(rows, { withValue });
                                    const built = normalizedRows
                                        .map((row, index) => buildManualPlayerEntry({
                                            id: index === 0 ? `${tournamentId}_${type}` : `${tournamentId}_${type}_${index + 1}`,
                                            tournamentId,
                                            tournamentName,
                                            tournamentDate,
                                            year,
                                            type,
                                            playerName: row.playerName,
                                            teamName: row.teamName,
                                            birthDateInput: row.birthDate,
                                            value: withValue ? toMetricValue(row.value) : undefined,
                                            sourceType,
                                        }))
                                        .filter(Boolean) as any[];
                                    const seen = new Set<string>();
                                    return built.filter((entry) => {
                                        const key = `${entry.type}||${entry.playerId || ''}||${String(entry.teamName || '').toLowerCase()}`;
                                        if (seen.has(key)) return false;
                                        seen.add(key);
                                        return true;
                                    });
                                };

                                const renderAwardRowsBlock = ({
                                    title,
                                    rows,
                                    setRows,
                                    locked = false,
                                    lockedLabel = '',
                                    helperText = '',
                                    valueLabel = '',
                                    showValue = false,
                                    showBirthDate = true,
                                    addLabel = t('hof_bundle_add_tie'),
                                }: {
                                    title: string;
                                    rows: AwardDraftRow[];
                                    setRows: React.Dispatch<React.SetStateAction<AwardDraftRow[]>>;
                                    locked?: boolean;
                                    lockedLabel?: string;
                                    helperText?: string;
                                    valueLabel?: string;
                                    showValue?: boolean;
                                    showBirthDate?: boolean;
                                    addLabel?: string;
                                }) => (
                                    <div className="rounded-xl border border-white/80 bg-white p-3 space-y-3">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <div className="text-sm font-black text-slate-800">{title}</div>
                                                {!locked && helperText ? (
                                                    <div className="text-[11px] font-bold text-slate-500 mt-1">{helperText}</div>
                                                ) : null}
                                            </div>
                                            {lockedLabel ? <span className="text-[11px] font-black text-rose-700">{lockedLabel}</span> : null}
                                        </div>
                                        <div className="space-y-3">
                                            {rows.map((row, index) => (
                                                <div key={`${title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                                                            {rows.length > 1
                                                                ? t('hof_bundle_tie_row').replace('{index}', String(index + 1))
                                                                : t('hof_bundle_entry_row')}
                                                        </div>
                                                        {!locked && rows.length > 1 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeAwardTieRow(setRows, index)}
                                                                className={btnSmDanger}
                                                            >
                                                                {t('hof_bundle_remove_row')}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <div className={`grid gap-3 ${showValue ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
                                                        <div>
                                                            <div className="text-xs font-black text-slate-500 mb-1">{t('player_label')}</div>
                                                            <input
                                                                value={row.playerName}
                                                                onChange={(event) => updateAwardRow(setRows, index, { playerName: event.target.value })}
                                                                disabled={locked}
                                                                placeholder={t('player_full_name_placeholder')}
                                                                className={`${inputBase} ${locked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-black text-slate-500 mb-1">{t('team_view')}</div>
                                                            <input
                                                                value={row.teamName}
                                                                onChange={(event) => updateAwardRow(setRows, index, { teamName: event.target.value })}
                                                                disabled={locked}
                                                                placeholder={t('team_name_placeholder')}
                                                                className={`${inputBase} ${locked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                            />
                                                        </div>
                                                        {showBirthDate ? (
                                                            <div>
                                                                <div className="text-xs font-black text-slate-500 mb-1">{t('birthdate_optional')}</div>
                                                                <BirthDateInput
                                                                    value={row.birthDate}
                                                                    onChange={(value) => updateAwardRow(setRows, index, { birthDate: value })}
                                                                    placeholder={t('birthdate_placeholder')}
                                                                    className={`${inputBase} ${locked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                                    ariaLabel={t('hof_birthdate_aria')}
                                                                    calendarTitle={t('open_calendar')}
                                                                    disabled={locked}
                                                                />
                                                            </div>
                                                        ) : null}
                                                        {showValue ? (
                                                            <div>
                                                                <div className="text-xs font-black text-slate-500 mb-1">{valueLabel}</div>
                                                                <input
                                                                    value={row.value}
                                                                    onChange={(event) => updateAwardRow(setRows, index, { value: event.target.value.replace(/[^\d]/g, '') })}
                                                                    disabled={locked}
                                                                    placeholder={t('leave_blank_nd')}
                                                                    className={`${inputBase} ${locked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                                />
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {!locked ? (
                                            <button type="button" onClick={() => addAwardTieRow(setRows)} className={btnSecondary}>
                                                {addLabel}
                                            </button>
                                        ) : null}
                                    </div>
                                );

                                const saveManualTournamentBundle = () => {
                                    const tournamentDate = String(bundleTournamentDate || '').trim();
                                    const tournamentName = String(bundleTournamentName || '').trim();
                                    const winnerTeamName = String(bundleWinnerTeamName || '').trim();
                                    if (!tournamentDate || !Number.isFinite(Date.parse(tournamentDate))) {
                                        alert(t('hof_bundle_invalid_date'));
                                        return;
                                    }
                                    if (!tournamentName) {
                                        alert(t('alert_enter_tournament_name'));
                                        return;
                                    }
                                    if (!winnerTeamName) {
                                        alert(t('alert_enter_champion_team'));
                                        return;
                                    }

                                    const tournamentId = `manual_${uuid()}`;
                                    const year = tournamentDate.slice(0, 4);
                                    const sourceType = 'manual' as const;
                                    const nextEntries: any[] = [];
                                    nextEntries.push({
                                        id: `${tournamentId}_winner`,
                                        year,
                                        tournamentId,
                                        tournamentName,
                                        type: 'winner',
                                        teamName: winnerTeamName,
                                        playerNames: [bundleWinnerP1, bundleWinnerP2].map((name) => String(name || '').trim()).filter(Boolean),
                                        sourceType,
                                        sourceTournamentId: tournamentId,
                                        sourceTournamentName: tournamentName,
                                        sourceTournamentDate: tournamentDate,
                                        sourceAutoGenerated: false,
                                        manuallyEdited: true,
                                    });

                                    try {
                                        nextEntries.push(
                                            ...buildAwardEntriesFromRows({
                                                tournamentId,
                                                tournamentName,
                                                tournamentDate,
                                                year,
                                                type: 'mvp',
                                                rows: bundleMvpRows,
                                                sourceType,
                                            })
                                        );
                                        nextEntries.push(
                                            ...buildAwardEntriesFromRows({
                                                tournamentId,
                                                tournamentName,
                                                tournamentDate,
                                                year,
                                                type: 'top_scorer',
                                                rows: bundleTopScorerRows,
                                                sourceType,
                                                withValue: true,
                                            })
                                        );
                                        nextEntries.push(
                                            ...buildAwardEntriesFromRows({
                                                tournamentId,
                                                tournamentName,
                                                tournamentDate,
                                                year,
                                                type: 'defender',
                                                rows: bundleDefenderRows,
                                                sourceType,
                                                withValue: true,
                                            })
                                        );
                                        nextEntries.push(
                                            ...buildAwardEntriesFromRows({
                                                tournamentId,
                                                tournamentName,
                                                tournamentDate,
                                                year,
                                                type: 'top_scorer_u25',
                                                rows: bundleTopScorerU25Rows,
                                                sourceType,
                                                withValue: true,
                                            })
                                        );
                                        nextEntries.push(
                                            ...buildAwardEntriesFromRows({
                                                tournamentId,
                                                tournamentName,
                                                tournamentDate,
                                                year,
                                                type: 'defender_u25',
                                                rows: bundleDefenderU25Rows,
                                                sourceType,
                                                withValue: true,
                                            })
                                        );
                                    } catch (error: any) {
                                        alert(error?.message || t('birthdate_invalid'));
                                        return;
                                    }

                                    setState({
                                        ...state,
                                        hallOfFame: [...(state.hallOfFame || []), ...nextEntries],
                                    });
                                    alert(t('hof_bundle_added'));
                                    resetBundle();
                                };

                                const editableTournamentOptions = (() => {
                                    const historyRows = (state.tournamentHistory || []).map((tournament: any) => ({
                                        id: String(tournament.id || ''),
                                        name: String(tournament.name || ''),
                                        date: normalizeInputDate(tournament.startDate),
                                        source: 'history' as const,
                                    }));
                                    const historyIds = new Set(historyRows.map((row) => row.id));
                                    const manualMap = new Map<string, { id: string; name: string; date: string; source: 'manual' }>();
                                    (state.hallOfFame || []).forEach((entry: any) => {
                                        const tournamentId = String(entry?.tournamentId || '').trim();
                                        if (!tournamentId || historyIds.has(tournamentId) || manualMap.has(tournamentId)) return;
                                        manualMap.set(tournamentId, {
                                            id: tournamentId,
                                            name: String(entry?.tournamentName || entry?.sourceTournamentName || tournamentId),
                                            date: normalizeInputDate(entry?.sourceTournamentDate),
                                            source: 'manual',
                                        });
                                    });
                                    return [...historyRows, ...Array.from(manualMap.values())].sort((a, b) => {
                                        const aTs = Date.parse(a.date || '');
                                        const bTs = Date.parse(b.date || '');
                                        const hasADate = Number.isFinite(aTs);
                                        const hasBDate = Number.isFinite(bTs);
                                        if (hasADate && hasBDate && bTs !== aTs) return bTs - aTs;
                                        if (hasADate !== hasBDate) return hasBDate ? 1 : -1;
                                        return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
                                    });
                                })();

                                const normalizeTournamentBundleDraft = (draft: {
                                    tournamentDate?: string;
                                    tournamentName?: string;
                                    winnerTeamName?: string;
                                    winnerP1?: string;
                                    winnerP2?: string;
                                    mvpRows?: AwardDraftRow[];
                                    topScorerRows?: AwardDraftRow[];
                                    defenderRows?: AwardDraftRow[];
                                    topScorerU25Rows?: AwardDraftRow[];
                                    defenderU25Rows?: AwardDraftRow[];
                                }) => ({
                                    tournamentDate: String(draft.tournamentDate || '').trim(),
                                    tournamentName: String(draft.tournamentName || '').trim(),
                                    winnerTeamName: String(draft.winnerTeamName || '').trim(),
                                    winnerP1: String(draft.winnerP1 || '').trim(),
                                    winnerP2: String(draft.winnerP2 || '').trim(),
                                    mvpRows: normalizeAwardRows(draft.mvpRows || []),
                                    topScorerRows: normalizeAwardRows(draft.topScorerRows || [], { withValue: true }),
                                    defenderRows: normalizeAwardRows(draft.defenderRows || [], { withValue: true }),
                                    topScorerU25Rows: normalizeAwardRows(draft.topScorerU25Rows || [], { withValue: true }),
                                    defenderU25Rows: normalizeAwardRows(draft.defenderU25Rows || [], { withValue: true }),
                                });

                                const selectedEditSnapshot = editTournamentId ? getTournamentBundleSnapshot(editTournamentId) : null;
                                const selectedEditSnapshotDraft = selectedEditSnapshot
                                    ? normalizeTournamentBundleDraft({
                                        tournamentDate: selectedEditSnapshot.tournamentDate,
                                        tournamentName: selectedEditSnapshot.tournamentName,
                                        winnerTeamName: selectedEditSnapshot.winnerTeamName,
                                        winnerP1: selectedEditSnapshot.winnerP1,
                                        winnerP2: selectedEditSnapshot.winnerP2,
                                        mvpRows: selectedEditSnapshot.mvpRows,
                                        topScorerRows: selectedEditSnapshot.topScorerRows,
                                        defenderRows: selectedEditSnapshot.defenderRows,
                                        topScorerU25Rows: selectedEditSnapshot.topScorerU25Rows,
                                        defenderU25Rows: selectedEditSnapshot.defenderU25Rows,
                                    })
                                    : null;
                                const currentEditDraft = editTournamentId
                                    ? normalizeTournamentBundleDraft({
                                        tournamentDate: editTournamentDate,
                                        tournamentName: editTournamentName,
                                        winnerTeamName: editWinnerTeamName,
                                        winnerP1: editWinnerP1,
                                        winnerP2: editWinnerP2,
                                        mvpRows: editMvpRows,
                                        topScorerRows: editTopScorerRows,
                                        defenderRows: editDefenderRows,
                                        topScorerU25Rows: editTopScorerU25Rows,
                                        defenderU25Rows: editDefenderU25Rows,
                                    })
                                    : null;
                                const editDirty = !!(selectedEditSnapshotDraft && currentEditDraft && JSON.stringify(selectedEditSnapshotDraft) !== JSON.stringify(currentEditDraft));
                                const editLockedCount = [editWinnerLocked, editTopScorerLocked, editDefenderLocked, editTopScorerU25Locked, editDefenderU25Locked].filter(Boolean).length;
                                const handleEditTournamentSelectionChange = (nextId: string) => {
                                    if (nextId === editTournamentId) return;
                                    if (editTournamentId && editDirty && !window.confirm(t('hof_bundle_confirm_switch'))) {
                                        return;
                                    }
                                    applyTournamentBundleSnapshot(nextId);
                                };

                                const saveEditedTournamentBundle = () => {
                                    if (!editTournamentId) {
                                        alert(t('hof_bundle_modify_alert'));
                                        return;
                                    }
                                    const snapshot = getTournamentBundleSnapshot(editTournamentId);
                                    if (!snapshot) {
                                        alert(t('hof_bundle_tournament_not_found'));
                                        return;
                                    }

                                    const tournamentDate = String(editTournamentDate || '').trim();
                                    const tournamentName = String(editTournamentName || '').trim();
                                    if (!tournamentDate || !Number.isFinite(Date.parse(tournamentDate))) {
                                        alert(t('hof_bundle_invalid_date'));
                                        return;
                                    }
                                    if (!tournamentName) {
                                        alert(t('alert_enter_tournament_name'));
                                        return;
                                    }

                                    const year = tournamentDate.slice(0, 4);
                                    const sourceType = snapshot.historyTournament ? 'archived_tournament' as const : 'manual' as const;
                                    const nextHistory = snapshot.historyTournament
                                        ? (state.tournamentHistory || []).map((tournament: any) => (
                                            tournament.id === editTournamentId
                                                ? { ...tournament, name: tournamentName, startDate: new Date(tournamentDate).toISOString() }
                                                : tournament
                                        ))
                                        : (state.tournamentHistory || []);

                                    const keep = (state.hallOfFame || []).filter((entry: any) => entry.tournamentId !== editTournamentId);
                                    const isLockedType = (type: string) => (
                                        (type === 'winner' && editWinnerLocked) ||
                                        (type === 'top_scorer' && editTopScorerLocked) ||
                                        (type === 'defender' && editDefenderLocked) ||
                                        (type === 'top_scorer_u25' && editTopScorerU25Locked) ||
                                        (type === 'defender_u25' && editDefenderU25Locked)
                                    );

                                    const preservedLockedManualEntries = (snapshot.entries || [])
                                        .filter((entry: any) => entry.type !== 'mvp' && isLockedType(entry.type) && (!!entry.manuallyEdited || entry.sourceAutoGenerated === false))
                                        .map((entry: any) => ({
                                            ...entry,
                                            year,
                                            tournamentName,
                                            sourceTournamentName: tournamentName,
                                            sourceTournamentDate: tournamentDate,
                                        }));

                                    const nextEntries: any[] = [...preservedLockedManualEntries];
                                    if (!editWinnerLocked && editWinnerTeamName.trim()) {
                                        nextEntries.push({
                                            id: `${editTournamentId}_winner`,
                                            year,
                                            tournamentId: editTournamentId,
                                            tournamentName,
                                            type: 'winner',
                                            teamName: editWinnerTeamName.trim(),
                                            playerNames: [editWinnerP1, editWinnerP2].map((value) => String(value || '').trim()).filter(Boolean),
                                            sourceType,
                                            sourceTournamentId: editTournamentId,
                                            sourceTournamentName: tournamentName,
                                            sourceTournamentDate: tournamentDate,
                                            sourceAutoGenerated: false,
                                            manuallyEdited: true,
                                        });
                                    }

                                    try {
                                        nextEntries.push(
                                            ...buildAwardEntriesFromRows({
                                                tournamentId: editTournamentId,
                                                tournamentName,
                                                tournamentDate,
                                                year,
                                                type: 'mvp',
                                                rows: editMvpRows,
                                                sourceType,
                                            })
                                        );
                                        if (!editTopScorerLocked) {
                                            nextEntries.push(
                                                ...buildAwardEntriesFromRows({
                                                    tournamentId: editTournamentId,
                                                    tournamentName,
                                                    tournamentDate,
                                                    year,
                                                    type: 'top_scorer',
                                                    rows: editTopScorerRows,
                                                    sourceType,
                                                    withValue: true,
                                                })
                                            );
                                        }
                                        if (!editDefenderLocked) {
                                            nextEntries.push(
                                                ...buildAwardEntriesFromRows({
                                                    tournamentId: editTournamentId,
                                                    tournamentName,
                                                    tournamentDate,
                                                    year,
                                                    type: 'defender',
                                                    rows: editDefenderRows,
                                                    sourceType,
                                                    withValue: true,
                                                })
                                            );
                                        }
                                        if (!editTopScorerU25Locked) {
                                            nextEntries.push(
                                                ...buildAwardEntriesFromRows({
                                                    tournamentId: editTournamentId,
                                                    tournamentName,
                                                    tournamentDate,
                                                    year,
                                                    type: 'top_scorer_u25',
                                                    rows: editTopScorerU25Rows,
                                                    sourceType,
                                                    withValue: true,
                                                })
                                            );
                                        }
                                        if (!editDefenderU25Locked) {
                                            nextEntries.push(
                                                ...buildAwardEntriesFromRows({
                                                    tournamentId: editTournamentId,
                                                    tournamentName,
                                                    tournamentDate,
                                                    year,
                                                    type: 'defender_u25',
                                                    rows: editDefenderU25Rows,
                                                    sourceType,
                                                    withValue: true,
                                                })
                                            );
                                        }
                                    } catch (error: any) {
                                        alert(error?.message || t('birthdate_invalid'));
                                        return;
                                    }

                                    const seededHallOfFame = [...keep, ...nextEntries];
                                    const nextHallOfFame = snapshot.historyTournament
                                        ? syncArchivedHistoryToHallOfFame({
                                            ...state,
                                            tournamentHistory: nextHistory,
                                            hallOfFame: seededHallOfFame,
                                        })
                                        : seededHallOfFame;

                                    setState({
                                        ...state,
                                        tournamentHistory: nextHistory,
                                        hallOfFame: nextHallOfFame,
                                    });
                                    alert(t('record_updated'));
                                };

                                const deleteEditedTournamentBundle = () => {
                                    if (!editTournamentId) {
                                        alert(t('hof_bundle_modify_alert'));
                                        return;
                                    }
                                    const snapshot = getTournamentBundleSnapshot(editTournamentId);
                                    if (!snapshot) {
                                        alert(t('hof_bundle_tournament_not_found'));
                                        return;
                                    }
                                    const tournamentName = String(
                                        snapshot.historyTournament?.name
                                        || snapshot.tournamentName
                                        || editTournamentName
                                        || t('hof_bundle_no_archive_tournament')
                                    ).trim();
                                    if (!window.confirm(
                                        t('hof_bundle_delete_tournament_confirm').replace('{name}', tournamentName)
                                    )) {
                                        return;
                                    }

                                    const nextState = snapshot.historyTournament
                                        ? (() => {
                                            const result = removeArchivedTournamentDeep(state as any, editTournamentId);
                                            return {
                                                ...result.state,
                                                integrationsScorers: (result.state.integrationsScorers || []).filter(
                                                    (entry: any) => String(entry?.sourceTournamentId || '').trim() !== editTournamentId
                                                ),
                                            };
                                        })()
                                        : {
                                            ...state,
                                            hallOfFame: (state.hallOfFame || []).filter((entry: any) => entry.tournamentId !== editTournamentId),
                                            integrationsScorers: (state.integrationsScorers || []).filter(
                                                (entry: any) => String(entry?.sourceTournamentId || '').trim() !== editTournamentId
                                            ),
                                        };

                                    setState(nextState);
                                    setEditTournamentId('');
                                    clearTournamentBundleEditor();
                                    setBundleEditorSection('setup');
                                    alert(t('hof_bundle_delete_tournament_done').replace('{name}', tournamentName));
                                };

                                const bundleSectionLabels: Record<'setup' | 'winners' | 'scorers' | 'awards', string> = {
                                    setup: t('hof_bundle_section_setup'),
                                    winners: t('winner_plural'),
                                    scorers: t('hof_bundle_scorers_title'),
                                    awards: t('hof_bundle_section_awards'),
                                };

                                const typeLabel = (typeKey: string) => {
                                    if (typeKey === 'winner') return t('winner_plural');
                                    if (typeKey === 'mvp') return t('mvp_plural');
                                    if (typeKey === 'top_scorer') return t('top_scorer_single');
                                    if (typeKey === 'defender') return t('defender_single');
                                    if (typeKey === 'top_scorer_u25') return t('top_scorer_u25_single');
                                    if (typeKey === 'defender_u25') return t('defender_u25_single');
                                    return typeKey;
                                };

                                const startEdit = (e: any) => {
                                    setHofEditId(e.id);
                                    setHofEditTournamentId(e.tournamentId);
                                    setHofYear(String(e.year || ''));
                                    setHofTournamentName(String(e.tournamentName || ''));
                                    setHofType(e.type);
                                    setHofTeamName(String(e.teamName || ''));
                                    setHofWinnerP1(String((e.playerNames || [])[0] || ''));
                                    setHofWinnerP2(String((e.playerNames || [])[1] || ''));
                                    setHofPlayerName(String((e.playerNames || [])[0] || ''));
                                    setHofValue(e.value !== undefined && e.value !== null ? String(e.value) : '');
                                    const pid = String(e.playerId || '');
                                    const m = pid.match(/_(\d{4}-\d{2}-\d{2}|\d{4}|ND)$/);
                                    if ((e as any).playerBirthDate) setHofPlayerYoB(formatBirthDateDisplay((e as any).playerBirthDate));
                                    else if (m && /\d{4}-\d{2}-\d{2}/.test(m[1])) setHofPlayerYoB(formatBirthDateDisplay(m[1]));
                                    else setHofPlayerYoB('');
                                };

                                const saveManualEntry = () => {
                                    const yearClean = (hofYear || '').replace(/[^\d]/g, '').slice(0, 4);
                                    if (!yearClean || yearClean.length !== 4) {
                                        alert(t('alert_year_invalid'));
                                        return;
                                    }
                                const tournamentName = (hofTournamentName || '').trim() || t('hof_bundle_no_archive_tournament');
                                    const isWinner = hofType === 'winner';
                                    const isMetric = hofType === 'top_scorer' || hofType === 'defender' || hofType === 'top_scorer_u25' || hofType === 'defender_u25';

                                    if (isWinner) {
                                        if (!hofTeamName.trim()) {
                                            alert(t('alert_enter_champion_team'));
                                            return;
                                        }
                                    } else {
                                        if (!hofPlayerName.trim()) {
                                            alert(t('alert_enter_player_name'));
                                            return;
                                        }
                                    }

                                    const manualId = hofEditTournamentId || `manual_${uuid()}`;
                                    const entryId = hofEditId || manualId;

                                    const playerBirthDate = normalizeBirthDateInput(hofPlayerYoB);
                                    if (!isWinner && hofPlayerYoB.trim() && !playerBirthDate) {
                                        alert(t('birthdate_invalid'));
                                        return;
                                    }
                                    const yob = deriveYoBFromBirthDate(playerBirthDate);

                                    const valNum = Number((hofValue || '').replace(/[^\d]/g, ''));
                                    const value = (isMetric && Number.isFinite(valNum) && (hofValue || '').trim() !== '') ? Math.max(0, valNum) : undefined;

                                    const nextEntry: any = {
                                        id: entryId,
                                        year: yearClean,
                                        tournamentId: manualId,
                                        tournamentName,
                                        type: hofType,
                                        playerNames: [] as string[],
                                        sourceType: 'manual',
                                        sourceTournamentId: manualId,
                                        sourceTournamentName: tournamentName,
                                        sourceAutoGenerated: false,
                                        manuallyEdited: true,
                                    };

                                    if (isWinner) {
                                        nextEntry.teamName = hofTeamName.trim();
                                        nextEntry.playerNames = [hofWinnerP1, hofWinnerP2].map(s => (s || '').trim()).filter(Boolean);
                                    } else {
                                        nextEntry.playerNames = [hofPlayerName.trim()];
                                        nextEntry.playerBirthDate = playerBirthDate;
                                        nextEntry.playerId = getPlayerKey(hofPlayerName.trim(), pickPlayerIdentityValue(playerBirthDate, yob));
                                        if (value !== undefined) nextEntry.value = value;
                                    }

                                    const cur = state.hallOfFame || [];
                                    const keep = cur.filter((e: any) => e.id !== entryId);
                                    setState({ ...state, hallOfFame: [...keep, nextEntry] });
                                    alert(hofEditId ? t('record_updated') : t('record_added'));
                                    reset();
                                };

                                const deleteManualEntry = (id: string) => {
                                    if (!confirm(t('delete_hof_confirm'))) return;
                                    const cur = state.hallOfFame || [];
                                    setState({ ...state, hallOfFame: cur.filter((e: any) => e.id !== id) });
                                };

                                const isWinnerType = hofType === 'winner';
                                const isMetricType = hofType === 'top_scorer' || hofType === 'defender' || hofType === 'top_scorer_u25' || hofType === 'defender_u25';
                                const metricLabel = (hofType === 'defender' || hofType === 'defender_u25') ? t('soffi') : t('points_label');
                                const isBundleEditMode = bundleEditorMode === 'edit';
                                const visibleBundleSections = (isBundleEditMode
                                    ? ['setup', 'winners', 'awards']
                                    : ['setup', 'winners', 'scorers', 'awards']) as Array<'setup' | 'winners' | 'scorers' | 'awards'>;
                                const activeBundleSection = visibleBundleSections.includes(bundleEditorSection)
                                    ? bundleEditorSection
                                    : visibleBundleSections[0];

                                const renderBundleSetupPanel = () => {
                                    if (!isBundleEditMode) {
                                        return (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('archive_tournament_date')}</div>
                                                        <input type="date" value={bundleTournamentDate} onChange={(e)=>setBundleTournamentDate(e.target.value)} className={inputBase} />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_name_even_if_not_archived')}</div>
                                                        <input value={bundleTournamentName} onChange={(e)=>setBundleTournamentName(e.target.value)} placeholder={t('tournament_example_placeholder')} className={inputBase} />
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm font-bold text-slate-600">
                                                    {t('hof_bundle_single_editor_desc')}
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="md:col-span-3">
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('hof_bundle_select_tournament')}</div>
                                                    <select
                                                        value={editTournamentId}
                                                        onChange={(e) => handleEditTournamentSelectionChange(e.target.value)}
                                                        className={selectBase}
                                                    >
                                                        <option value="">—</option>
                                                        {editableTournamentOptions.map((option) => (
                                                            <option key={option.id} value={option.id}>
                                                                {option.name}{option.date ? ` · ${formatTournamentDateLabel(option.date)}` : ''}{option.source === 'manual' ? ` · ${t('manual_entry')}` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {editTournamentId ? (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {editHasHistoryTournament ? (
                                                            <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] font-black text-slate-700">{t('hof_bundle_source_history')}</span>
                                                        ) : (
                                                            <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] font-black text-slate-700">{t('hof_bundle_source_hof_only')}</span>
                                                        )}
                                                        {editHasBoundResults ? (
                                                            <span className="px-2.5 py-1 rounded-full border border-rose-200 bg-white text-[11px] font-black text-rose-700">{t('hof_bundle_locked_results')}</span>
                                                        ) : (
                                                            <span className="px-2.5 py-1 rounded-full border border-emerald-200 bg-white text-[11px] font-black text-emerald-700">{t('hof_bundle_awards_editable')}</span>
                                                        )}
                                                        {editU25DisabledByTournament ? (
                                                            <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] font-black text-slate-500">{t('hof_bundle_u25_disabled')}</span>
                                                        ) : null}
                                                        {editDirty ? (
                                                            <span className="px-2.5 py-1 rounded-full border border-amber-200 bg-white text-[11px] font-black text-amber-700">{t('hof_bundle_unsaved')}</span>
                                                        ) : (
                                                            <span className="px-2.5 py-1 rounded-full border border-blue-200 bg-white text-[11px] font-black text-blue-700">{t('hof_bundle_synced')}</span>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                            <div className="text-[11px] font-black text-slate-500">{t('hof_bundle_source_label')}</div>
                                                            <div className="text-sm font-black text-slate-900">{editHasHistoryTournament ? t('hof_bundle_source_history') : t('hof_bundle_source_hof_only')}</div>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                            <div className="text-[11px] font-black text-slate-500">{t('hof_bundle_locked_fields')}</div>
                                                            <div className="text-sm font-black text-slate-900">{editLockedCount}/5</div>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                            <div className="text-[11px] font-black text-slate-500">{t('structure_tournament_date_label')}</div>
                                                            <div className="text-sm font-black text-slate-900">{formatTournamentDateLabel(editTournamentDate) || '—'}</div>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                            <div className="text-[11px] font-black text-slate-500">{t('hof_bundle_editor_state')}</div>
                                                            <div className="text-sm font-black text-slate-900">{editDirty ? t('hof_bundle_state_dirty') : t('hof_bundle_state_clean')}</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                        <div>
                                                            <div className="text-xs font-black text-slate-500 mb-1">{t('archive_tournament_date')}</div>
                                                            <input type="date" value={editTournamentDate} onChange={(e)=>setEditTournamentDate(e.target.value)} className={inputBase} />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_name_even_if_not_archived')}</div>
                                                            <input value={editTournamentName} onChange={(e)=>setEditTournamentName(e.target.value)} placeholder={t('tournament_example_placeholder')} className={inputBase} />
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-bold text-slate-500">
                                                    {t('hof_bundle_modify_alert')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                const renderBundleWinnersPanel = () => (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <div className="text-sm font-black text-slate-800">{t('winner_plural')}</div>
                                                {isBundleEditMode && !editWinnerLocked ? (
                                                    <div className="text-[11px] font-bold text-slate-500 mt-1">{t('hof_bundle_free_text_helper')}</div>
                                                ) : null}
                                            </div>
                                            {isBundleEditMode && editWinnerLocked ? <span className="text-[11px] font-black text-rose-700">{t('hof_bundle_locked_saved_matches')}</span> : null}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="md:col-span-3">
                                                <div className="text-xs font-black text-slate-500 mb-1">{t('champion_team_label')}</div>
                                                <input
                                                    value={isBundleEditMode ? editWinnerTeamName : bundleWinnerTeamName}
                                                    onChange={(e)=> isBundleEditMode ? setEditWinnerTeamName(e.target.value) : setBundleWinnerTeamName(e.target.value)}
                                                    disabled={isBundleEditMode ? editWinnerLocked : false}
                                                    placeholder={t('team_name_placeholder')}
                                                    className={`${inputBase} ${isBundleEditMode && editWinnerLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-slate-500 mb-1">{t('player_1_label')}</div>
                                                <input
                                                    value={isBundleEditMode ? editWinnerP1 : bundleWinnerP1}
                                                    onChange={(e)=> isBundleEditMode ? setEditWinnerP1(e.target.value) : setBundleWinnerP1(e.target.value)}
                                                    disabled={isBundleEditMode ? editWinnerLocked : false}
                                                    placeholder={t('name_label')}
                                                    className={`${inputBase} ${isBundleEditMode && editWinnerLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-slate-500 mb-1">{t('player_2_label')}</div>
                                                <input
                                                    value={isBundleEditMode ? editWinnerP2 : bundleWinnerP2}
                                                    onChange={(e)=> isBundleEditMode ? setEditWinnerP2(e.target.value) : setBundleWinnerP2(e.target.value)}
                                                    disabled={isBundleEditMode ? editWinnerLocked : false}
                                                    placeholder={t('name_label')}
                                                    className={`${inputBase} ${isBundleEditMode && editWinnerLocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                                                />
                                            </div>
                                            <div className="text-[11px] font-bold text-slate-500 flex items-end">{t('team_enters_hof_without_players')}</div>
                                        </div>
                                    </div>
                                );

                                const renderBundleScorersPanel = () => (
                                    <div className="space-y-4">
                                        <input
                                            ref={bundleScorersFileRef}
                                            type="file"
                                            className="hidden"
                                            accept=".xlsx,.xls,.csv"
                                            onChange={onBundleScorersFileChange}
                                        />
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-black text-slate-800">{t('hof_bundle_scorers_title')}</div>
                                                    <div className="text-xs font-bold text-slate-500 mt-1">
                                                        {t('hof_bundle_scorers_desc')}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <button type="button" onClick={() => bundleScorersFileRef.current?.click()} className={btnSecondary}>
                                                        {t('hof_bundle_import_scorers')}
                                                    </button>
                                                    <button type="button" onClick={downloadBundleTemplateXlsx} className={btnSecondary}>
                                                        {t('hof_bundle_download_template')}
                                                    </button>
                                                    {bundleImportedScorers.length ? (
                                                        <button type="button" onClick={clearBundleScorersImport} className={btnSecondary}>
                                                            {t('hof_bundle_remove_scorers_import')}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {bundleImportedScorers.length ? (
                                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
                                                    {t('hof_bundle_loaded_file')
                                                        .replace('{label}', bundleImportedScorersLabel || t('hof_bundle_loaded_file_fallback'))
                                                        .replace('{count}', String(bundleImportedScorers.length))}
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-600">
                                                    {t('hof_bundle_no_file')}
                                                </div>
                                            )}
                                            {bundleImportedScorersWarnings.length ? (
                                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                                                    {bundleImportedScorersWarnings.join(' ')}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                );

                                const renderBundleAwardsPanel = () => (
                                    <div className="space-y-4">
                                        {renderAwardRowsBlock({
                                            title: t('mvp_plural'),
                                            rows: isBundleEditMode ? editMvpRows : bundleMvpRows,
                                            setRows: isBundleEditMode ? setEditMvpRows : setBundleMvpRows,
                                            showValue: false,
                                            showBirthDate: false,
                                            helperText: isBundleEditMode ? t('hof_bundle_free_text_helper') : '',
                                            addLabel: isBundleEditMode ? t('hof_bundle_add_entry_or_tie') : t('hof_bundle_add_tie'),
                                        })}

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                            {renderAwardRowsBlock({
                                                title: t('top_scorer_single'),
                                                rows: isBundleEditMode ? editTopScorerRows : bundleTopScorerRows,
                                                setRows: isBundleEditMode ? setEditTopScorerRows : setBundleTopScorerRows,
                                                showValue: true,
                                                valueLabel: t('hof_bundle_value_label').replace('{metric}', t('points_label')),
                                                locked: isBundleEditMode ? editTopScorerLocked : bundleImportedScorers.length > 0,
                                                lockedLabel: isBundleEditMode
                                                    ? (editTopScorerLocked ? t('hof_bundle_locked_saved_matches') : '')
                                                    : (bundleImportedScorers.length > 0 ? t('hof_bundle_locked_from_scorers') : ''),
                                                helperText: isBundleEditMode ? t('hof_bundle_free_text_helper') : '',
                                                addLabel: isBundleEditMode ? t('hof_bundle_add_entry_or_tie') : t('hof_bundle_add_tie'),
                                            })}
                                            {renderAwardRowsBlock({
                                                title: t('defender_single'),
                                                rows: isBundleEditMode ? editDefenderRows : bundleDefenderRows,
                                                setRows: isBundleEditMode ? setEditDefenderRows : setBundleDefenderRows,
                                                showValue: true,
                                                valueLabel: t('hof_bundle_value_label').replace('{metric}', t('soffi')),
                                                locked: isBundleEditMode ? editDefenderLocked : bundleImportedScorers.length > 0,
                                                lockedLabel: isBundleEditMode
                                                    ? (editDefenderLocked ? t('hof_bundle_locked_saved_matches') : '')
                                                    : (bundleImportedScorers.length > 0 ? t('hof_bundle_locked_from_scorers') : ''),
                                                helperText: isBundleEditMode ? t('hof_bundle_free_text_helper') : '',
                                                addLabel: isBundleEditMode ? t('hof_bundle_add_entry_or_tie') : t('hof_bundle_add_tie'),
                                            })}
                                            {renderAwardRowsBlock({
                                                title: t('top_scorer_u25_single'),
                                                rows: isBundleEditMode ? editTopScorerU25Rows : bundleTopScorerU25Rows,
                                                setRows: isBundleEditMode ? setEditTopScorerU25Rows : setBundleTopScorerU25Rows,
                                                showValue: true,
                                                valueLabel: t('hof_bundle_value_label').replace('{metric}', t('points_label')),
                                                locked: isBundleEditMode ? editTopScorerU25Locked : bundleImportedScorers.length > 0,
                                                lockedLabel: isBundleEditMode
                                                    ? (editTopScorerU25Locked ? (editU25DisabledByTournament ? t('hof_bundle_u25_disabled') : t('hof_bundle_locked_saved_matches')) : '')
                                                    : (bundleImportedScorers.length > 0 ? t('hof_bundle_locked_from_scorers') : ''),
                                                helperText: isBundleEditMode ? t('hof_bundle_free_text_helper') : '',
                                                addLabel: isBundleEditMode ? t('hof_bundle_add_entry_or_tie') : t('hof_bundle_add_tie'),
                                            })}
                                            {renderAwardRowsBlock({
                                                title: t('defender_u25_single'),
                                                rows: isBundleEditMode ? editDefenderU25Rows : bundleDefenderU25Rows,
                                                setRows: isBundleEditMode ? setEditDefenderU25Rows : setBundleDefenderU25Rows,
                                                showValue: true,
                                                valueLabel: t('hof_bundle_value_label').replace('{metric}', t('soffi')),
                                                locked: isBundleEditMode ? editDefenderU25Locked : bundleImportedScorers.length > 0,
                                                lockedLabel: isBundleEditMode
                                                    ? (editDefenderU25Locked ? (editU25DisabledByTournament ? t('hof_bundle_u25_disabled') : t('hof_bundle_locked_saved_matches')) : '')
                                                    : (bundleImportedScorers.length > 0 ? t('hof_bundle_locked_from_scorers') : ''),
                                                helperText: isBundleEditMode ? t('hof_bundle_free_text_helper') : '',
                                                addLabel: isBundleEditMode ? t('hof_bundle_add_entry_or_tie') : t('hof_bundle_add_tie'),
                                            })}
                                        </div>
                                    </div>
                                );

                                return (
                                    <>
                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4">
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="font-black text-slate-900">{isBundleEditMode ? t('hof_bundle_edit_title') : t('hof_bundle_create_title')}</div>
                                                    <div className="text-xs font-bold text-slate-600 mt-1">
                                                        {isBundleEditMode ? t('hof_bundle_edit_desc') : t('hof_bundle_create_desc')}
                                                    </div>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-full border border-blue-200 bg-white text-[11px] font-black text-blue-700">
                                                    {isBundleEditMode ? t('edit') : t('data_add')}
                                                </span>
                                            </div>

                                            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('hof_bundle_single_editor_desc')}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setBundleEditorMode('create');
                                                        setBundleEditorSection('setup');
                                                    }}
                                                    className={bundleEditorMode === 'create' ? btnPrimary : btnSecondary}
                                                >
                                                    {t('data_add')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setBundleEditorMode('edit');
                                                        setBundleEditorSection('setup');
                                                    }}
                                                    className={bundleEditorMode === 'edit' ? btnPrimary : btnSecondary}
                                                >
                                                    {t('edit')}
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {visibleBundleSections.map((sectionKey) => (
                                                    <button
                                                        key={sectionKey}
                                                        type="button"
                                                        onClick={() => setBundleEditorSection(sectionKey)}
                                                        className={activeBundleSection === sectionKey ? btnSecondary : `${btnSecondary} opacity-80`}
                                                    >
                                                        {bundleSectionLabels[sectionKey]}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="rounded-2xl border border-white/90 bg-white p-4">
                                                {activeBundleSection === 'setup' ? renderBundleSetupPanel() : null}
                                                {activeBundleSection === 'winners' ? renderBundleWinnersPanel() : null}
                                                {activeBundleSection === 'scorers' && !isBundleEditMode ? renderBundleScorersPanel() : null}
                                                {activeBundleSection === 'awards' ? renderBundleAwardsPanel() : null}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                {isBundleEditMode ? (
                                                    <>
                                                        <button type="button" onClick={saveEditedTournamentBundle} className={btnPrimary} disabled={!editDirty || !editTournamentId}>{t('hof_bundle_save_changes')}</button>
                                                        <button
                                                            type="button"
                                                            onClick={() => applyTournamentBundleSnapshot(editTournamentId)}
                                                            className={btnSecondary}
                                                            disabled={!editTournamentId}
                                                        >
                                                            {editDirty ? t('hof_bundle_cancel_unsaved') : t('hof_bundle_reload_saved')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={deleteEditedTournamentBundle}
                                                            className={btnDanger}
                                                            disabled={!editTournamentId}
                                                            title={t('hof_bundle_delete_tournament_hint')}
                                                        >
                                                            {t('archive_delete_tournament')}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button type="button" onClick={saveManualTournamentBundle} className={btnPrimary}>{t('hof_bundle_generate')}</button>
                                                        <button type="button" onClick={resetBundle} className={btnSecondary}>{t('reset')}</button>
                                                    </>
                                                )}
                                            </div>
                                            {isBundleEditMode ? (
                                                <div className="text-[11px] font-bold text-slate-500">
                                                    {t('hof_bundle_delete_tournament_hint')}
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                            <div className="font-black text-slate-800">{t('hof_manual_title')}</div>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('year')}</div>
                                                    <input value={hofYear} onChange={(e)=>setHofYear(e.target.value.replace(/[^\d]/g,''))} placeholder="2024" className={inputBase} />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('tournament_name_even_if_not_archived')}</div>
                                                    <input value={hofTournamentName} onChange={(e)=>setHofTournamentName(e.target.value)} placeholder={t('tournament_example_placeholder')} className={inputBase} />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-slate-500 mb-1">{t('type')}</div>
                                                    <select value={hofType} onChange={(e)=>setHofType(e.target.value as any)} className={selectBase}>
                                                        <option value="winner">{t('winner_plural')}</option>
                                                        <option value="top_scorer">{t('top_scorer_single')}</option>
                                                        <option value="defender">{t('defender_single')}</option>
                                                        <option value="mvp">{t('mvp_plural')}</option>
                                                        <option value="top_scorer_u25">{t('top_scorer_u25_single')}</option>
                                                        <option value="defender_u25">{t('defender_u25_single')}</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {isWinnerType ? (
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    <div className="md:col-span-3">
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('champion_team_label')}</div>
                                                        <input value={hofTeamName} onChange={(e)=>setHofTeamName(e.target.value)} placeholder={t('team_name_placeholder')} className={inputBase} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('player_1_label')}</div>
                                                        <input value={hofWinnerP1} onChange={(e)=>setHofWinnerP1(e.target.value)} placeholder={t('name_label')} className={inputBase} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('player_2_label')}</div>
                                                        <input value={hofWinnerP2} onChange={(e)=>setHofWinnerP2(e.target.value)} placeholder={t('name_label')} className={inputBase} />
                                                    </div>
                                                    <div className="md:col-span-3 text-[11px] font-bold text-slate-500">
                                                        {t('team_enters_hof_without_players')}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                    <div className="md:col-span-2">
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('player_label')}</div>
                                                        <input value={hofPlayerName} onChange={(e)=>setHofPlayerName(e.target.value)} placeholder={t('player_full_name_placeholder')} className={inputBase} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('birthdate_optional')}</div>
                                                        <BirthDateInput value={hofPlayerYoB} onChange={setHofPlayerYoB} placeholder={t('birthdate_placeholder')} className={inputBase} ariaLabel={t('hof_birthdate_aria')} calendarTitle={t('open_calendar')} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-slate-500 mb-1">{t('hof_bundle_value_label').replace('{metric}', metricLabel)}</div>
                                                        <input
                                                            value={hofValue}
                                                            onChange={(e)=>setHofValue(e.target.value.replace(/[^\d]/g,''))}
                                                            placeholder={isMetricType ? t('leave_blank_nd') : '—'}
                                                            disabled={!isMetricType}
                                                            className={`${inputBase} ${!isMetricType ? 'bg-slate-100 text-slate-400' : ''}`}
                                                        />
                                                    </div>
                                                    <div className="md:col-span-4 text-[11px] font-bold text-slate-500">
                                                        {t('player_key_label')}: {hofPlayerName.trim() ? getPlayerKey(hofPlayerName.trim(), pickPlayerIdentityValue(normalizeBirthDateInput(hofPlayerYoB), deriveYoBFromBirthDate(normalizeBirthDateInput(hofPlayerYoB)))) : '—'}
                                                        {isMetricType ? ` · ${t('leave_blank_saved_as_nd')}` : ''}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('manual_hof_actions_toolbar')}>
                                                <button type="button" onClick={saveManualEntry} className={btnPrimary}>
                                                    {hofEditId ? t('update_record') : t('add_record')}
                                                </button>
                                                <button type="button" onClick={reset} className={btnSecondary}>
                                                    {t('reset')}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 font-black text-slate-700 flex items-center justify-between">
                                                <span>{t('manual_records')}</span>
                                                <span className="font-mono text-xs text-slate-500">{manualEntries.length}</span>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {manualEntries.map((e: any) => {
                                                    const isMetric = e.type === 'top_scorer' || e.type === 'defender' || e.type === 'top_scorer_u25' || e.type === 'defender_u25';
                                                    const metric = (e.type === 'defender' || e.type === 'defender_u25') ? t('soffi') : t('points_label');
                                                    const valueText = isMetric ? (e.value !== undefined && e.value !== null ? String(e.value) : 'ND') : '';
                                                    return (
                                                        <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded">{e.year}</span>
                                                                    {formatTournamentDateLabel(e.sourceTournamentDate) ? (
                                                                        <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-1 rounded border border-blue-200">
                                                                            {formatTournamentDateLabel(e.sourceTournamentDate)}
                                                                        </span>
                                                                    ) : null}
                                                                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{typeLabel(e.type)}</span>
                                                                </div>
                                                                <div className="text-[11px] font-bold text-slate-400 whitespace-normal break-words leading-tight mt-1">{e.tournamentName}</div>
                                                                <div className="font-black text-slate-900 mt-1 whitespace-normal break-words leading-tight">
                                                                    {e.teamName ? e.teamName : (e.playerNames || []).join(', ')}
                                                                </div>
                                                                {e.teamName && (e.playerNames || []).length > 0 && (
                                                                    <div className="text-[11px] font-bold text-slate-500 whitespace-normal break-words leading-tight">{e.playerNames.join(' & ')}</div>
                                                                )}
                                                                {isMetric && (
                                                                    <div className="text-[11px] font-black text-slate-600 mt-1">{metric}: {valueText}</div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <button type="button" onClick={() => startEdit(e)} className={btnSmSecondary}>
                                                                    {t('edit')}
                                                                </button>
                                                                <button type="button" onClick={() => deleteManualEntry(e.id)} className={btnSmDanger}>
                                                                    {t('delete')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {manualEntries.length === 0 && (
                                                    <div className="p-8 text-center text-slate-400 font-bold">
                                                        {t('no_manual_hof_records')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                );
    })();
};
