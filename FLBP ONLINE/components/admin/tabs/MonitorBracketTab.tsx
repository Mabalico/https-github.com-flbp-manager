import React from 'react';
import { LayoutDashboard, Search, X, Play, Square, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { Match, TournamentData } from '../../../types';
import type { AppState } from '../../../services/storageService';
import { TournamentBracket } from '../../TournamentBracket';
import { isTesterMode } from '../../../config/appMode';
import { getMatchParticipantIds, formatMatchScoreLabel, isByeTeamId, isTbdTeamId } from '../../../services/matchUtils';
import { generateTournamentStructure, getFinalRoundRobinActivationStatus } from '../../../services/tournamentEngine';
import { buildTournamentStructureSnapshot, getSlotValue as getStructureSlotValue, parseSlotKey as parseStructureSlotKey } from '../../../services/tournamentStructureSelectors';
import { applyStructuralOperation } from '../../../services/tournamentStructureOperations';
import { buildTournamentStructureIntegritySummary } from '../../../services/tournamentStructureIntegrity';
import { useTranslation } from '../../../App';

export interface MonitorBracketTabProps {
    state: AppState;
    simBusy: boolean;
    handleSimulateTurn: () => void;
    handleSimulateAll: () => void;
    handleUpdateLiveMatch: (m: Match) => void;

    handleUpdateTournamentAndMatches: (tournament: TournamentData, matches: Match[]) => void;

    getTeamName: (teamId?: string) => string;
    openReportFromCodes: (matchId: string) => void;
    toggleMatchStatus: (matchId: string) => void;

    handleActivateFinalRoundRobin: () => void;
    openTournamentEditor: (view?: 'groups' | 'bracket') => void;
}

export const MonitorBracketTab: React.FC<MonitorBracketTabProps> = ({
    state,
    simBusy,
    handleSimulateTurn,
    handleSimulateAll,
    handleUpdateLiveMatch,
    handleUpdateTournamentAndMatches,
    getTeamName,
    openReportFromCodes,
    toggleMatchStatus,
    handleActivateFinalRoundRobin,
    openTournamentEditor,
}) => {
    const { t } = useTranslation();
    const showLegacyStructuralTools = false;

    const isPlaceholderTeamId = React.useCallback((teamId?: string) => {
        const id = (teamId || '').trim();
        if (!id) return true;
        const up = id.toUpperCase();
        return up === 'BYE' || up === 'TBD' || up.startsWith('TBD-');
    }, []);

    const tournamentTeams = React.useMemo(() => {
        // Union: prefer live roster, but always include teams added to the global catalog after live start.
        const live = (state.tournament?.teams || []) as any[];
        const global = (state.teams || []) as any[];
        if (!live.length) return global;

        const byId = new Map<string, any>();
        for (const t of live) byId.set(String(t?.id || ''), t);
        for (const t of global) {
            const id = String(t?.id || '');
            if (!id) continue;
            if (!byId.has(id)) byId.set(id, t);
        }
        return Array.from(byId.values());
    }, [state.tournament?.teams, state.teams]);

    const teamsById = React.useMemo(() => {
        const map = new Map<string, { id: string; hidden?: boolean; isBye?: boolean }>();
        for (const t of (tournamentTeams || [])) map.set(t.id, t);
        return map;
    }, [tournamentTeams]);

    const structureSnapshot = React.useMemo(() => {
        if (!state.tournament) return null;
        return buildTournamentStructureSnapshot(state.tournament, state.tournamentMatches || [], state.teams || []);
    }, [state.tournament, state.tournamentMatches, state.teams]);

    const [query, setQuery] = React.useState<string>('');

    // Lightweight Admin UI tokens (local): keeps toolbar controls consistent with other tabs.
    const toolbarInput =
        'w-64 max-w-full pl-9 pr-9 px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnSecondarySm =
        'px-3 py-2.5 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';

    const queryNorm = query.trim().toLowerCase();

    const matchMatchesQuery = React.useCallback((m: Match) => {
        if (!queryNorm) return true;
        const code = ((m.code || m.id || '') + '').toLowerCase();
        const phase = ((m.phase || '') + '').toLowerCase();
        if (code.includes(queryNorm) || phase.includes(queryNorm)) return true;
        const ids = getMatchParticipantIds(m);
        for (const id of ids) {
            const name = ((getTeamName(id) || id || '') + '').toLowerCase();
            if (name.includes(queryNorm)) return true;
        }
        return false;
    }, [queryNorm, getTeamName]);

    const integrity = React.useMemo(() => {
        if (!structureSnapshot) return null;
        return buildTournamentStructureIntegritySummary(structureSnapshot);
    }, [structureSnapshot]);

    const integrityHasIssues = React.useMemo(() => {
        if (!integrity) return false;
        return (
            integrity.excluded.length > 0 ||
            integrity.rosterDuplicates.length > 0 ||
            integrity.duplicatesInGroups.length > 0 ||
            integrity.duplicatesInBracket.length > 0 ||
            integrity.unknown.length > 0
        );
    }, [integrity]);

    const finalRrStatus = React.useMemo(() => {
        if (!state.tournament) return null;
        const cfg = state.tournament.config?.finalRoundRobin;
        if (!cfg?.enabled) return null;
        return getFinalRoundRobinActivationStatus(state.tournament, state.tournamentMatches || []);
    }, [state.tournament, state.tournamentMatches]);

    const finalRrReasonLabel = (reason?: string) => {
        switch (reason) {
            case 'already_activated': return t('monitor_bracket_final_rr_already_active');
            case 'missing_topTeams': return t('monitor_bracket_final_rr_missing_top');
            case 'unsupported_tournament_type': return t('monitor_bracket_final_rr_unsupported');
            case 'no_bracket_matches': return t('no_bracket_available');
            case 'participants_not_determined': return t('monitor_bracket_final_rr_participants_tbd');
            case 'bye_in_participants': return t('monitor_bracket_final_rr_bye_not_allowed');
            case 'participants_count_mismatch': return t('monitor_bracket_final_rr_count_mismatch');
            case 'participants_not_found_in_roster': return t('monitor_bracket_final_rr_participants_missing');
            case 'bracket_too_small_or_unexpected_shape': return t('monitor_bracket_final_rr_unexpected_shape');
            default: return t('monitor_bracket_conditions_not_met');
        }
    };

    const openGroupTieBreaks = React.useMemo(() => {
        const ms = (state.tournamentMatches || [])
            .filter(m => m.phase === 'groups' && !m.hidden && !m.isBye)
            .filter(m => m.isTieBreak)
            .filter(m => m.status !== 'finished');
        return ms.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }, [state.tournamentMatches]);

    const [bracketZoom, setBracketZoom] = React.useState<number>(() => {
        // Never crash if browser storage is blocked (Safari private mode, hardened browsers, etc.)
        const raw = (() => {
            try {
                return sessionStorage.getItem('flbp_monitor_bracket_zoom');
            } catch {
                return null;
            }
        })();

        const z = raw ? Number(raw) : 1;
        if (!isFinite(z) || z <= 0) return 1;
        const clamped = Math.min(1.6, Math.max(0.5, z));
        return Math.round(clamped * 10) / 10;
    });

    React.useEffect(() => {
        try {
            sessionStorage.setItem('flbp_monitor_bracket_zoom', String(bracketZoom));
        } catch {
            // no-op
        }
    }, [bracketZoom]);

    const [manualEditMode, setManualEditMode] = React.useState<boolean>(false);
    const [altInsertPanelOpen, setAltInsertPanelOpen] = React.useState<boolean>(false);
    const [slotPickMode, setSlotPickMode] = React.useState<'insert' | 'swap'>('insert');

    const [replaceByeSlotKey, setReplaceByeSlotKey] = React.useState<string>('');
    const [replaceByeTeamId, setReplaceByeTeamId] = React.useState<string>('');
    const [swapSlotAKey, setSwapSlotAKey] = React.useState<string>('');
    const [swapSlotBKey, setSwapSlotBKey] = React.useState<string>('');
    const [manualEditMsg, setManualEditMsg] = React.useState<string>('');
    const [dragPayload, setDragPayload] = React.useState<null | { kind: 'slot'; slotKey: string } | { kind: 'team'; teamId: string }>(null);
    const [dropTargetSlotKey, setDropTargetSlotKey] = React.useState<string>('');

    const [integrityPanelOpen, setIntegrityPanelOpen] = React.useState<boolean>(false);
    const integrityPanelTouchedRef = React.useRef<boolean>(false);

    const toggleIntegrityPanel = React.useCallback(() => {
        integrityPanelTouchedRef.current = true;
        setIntegrityPanelOpen(v => !v);
    }, []);

    React.useEffect(() => {
        // If the operator enables manual edit, keep the panel open.
        if (manualEditMode) {
            setIntegrityPanelOpen(true);
            return;
        }

        // Auto-open only once (until the user interacts) when issues are detected.
        if (integrityPanelTouchedRef.current) return;
        if (integrityHasIssues) setIntegrityPanelOpen(true);
    }, [manualEditMode, integrityHasIssues]);

    // Click-to-fix helpers: allow the integrity panel pills to guide the operator.
    const [focusSlotKeys, setFocusSlotKeys] = React.useState<string[]>([]);
    const bracketCanvasRef = React.useRef<HTMLDivElement | null>(null);
    const prevManualEditModeRef = React.useRef<boolean>(manualEditMode);


    const clearFocusAndSelections = React.useCallback(() => {
        setFocusSlotKeys([]);
        setManualEditMsg('');
        setReplaceByeSlotKey('');
        setReplaceByeTeamId('');
        setSwapSlotAKey('');
        setSwapSlotBKey('');
        setDragPayload(null);
        setDropTargetSlotKey('');
        setSlotPickMode('insert');
    }, []);


    const setSlotPickModeWithReset = React.useCallback((mode: 'insert' | 'swap') => {
        // Switching mode should not keep stale selections.
        setFocusSlotKeys([]);
        setManualEditMsg('');
        setReplaceByeSlotKey('');
        setReplaceByeTeamId('');
        setSwapSlotAKey('');
        setSwapSlotBKey('');
        setDragPayload(null);
        setDropTargetSlotKey('');
        setSlotPickMode(mode);
    }, []);

    React.useEffect(() => {
        // When exiting manual edit, clear any pending selections/highlights.
        if (prevManualEditModeRef.current && !manualEditMode) {
            clearFocusAndSelections();
            setAltInsertPanelOpen(false);
        }
        prevManualEditModeRef.current = manualEditMode;
    }, [manualEditMode, clearFocusAndSelections]);


    const bracketMatches = React.useMemo(() => {
        return (state.tournamentMatches || []).filter(m => m.phase === 'bracket');
    }, [state.tournamentMatches]);

    // Stable ordering helper for bracket rounds.
    // NOTE: orderIndex is normally present, but historical/manual data may miss it. In that case we push those matches to the end.
    const orderKey = (m: Match) => {
        const v: any = (m as any).orderIndex;
        return (typeof v === 'number' && isFinite(v)) ? v : Number.MAX_SAFE_INTEGER;
    };
    const sortByOrderIndexSafe = (a: Match, b: Match) => {
        const d = orderKey(a) - orderKey(b);
        if (d !== 0) return d;
        const ac = String((a as any).code || a.id || '');
        const bc = String((b as any).code || b.id || '');
        return ac.localeCompare(bc);
    };


    const round1All = React.useMemo(() => {
        const ms = bracketMatches.filter(m => (m.round || 1) === 1);
        return [...ms].sort(sortByOrderIndexSafe);
    }, [bracketMatches]);

    const parseSlotKey = React.useCallback((key: string): { matchId: string; slot: 'teamAId' | 'teamBId' } | null => {
        const parts = (key || '').split('|');
        if (parts.length !== 2) return null;
        const matchId = parts[0];
        const side = parts[1];
        if (!matchId) return null;
        if (side !== 'A' && side !== 'B') return null;
        return { matchId, slot: side === 'A' ? 'teamAId' : 'teamBId' };
    }, []);

    const printableRosterTeams = React.useMemo(() => {
        return (tournamentTeams || [])
            .filter(t => !t.hidden && !(t as any).isBye)
            .filter(t => !isPlaceholderTeamId(t.id));
    }, [tournamentTeams, isPlaceholderTeamId]);

    const byeSlotOptions = React.useMemo(() => {
        const opts: Array<{ key: string; label: string }> = [];
        round1All.forEach(m => {
            const a = (m.teamAId || '').trim();
            const b = (m.teamBId || '').trim();
            if (a === 'BYE') opts.push({ key: `${m.id}|A`, label: `${m.code || m.id} • Slot A (libero)` });
            if (b === 'BYE') opts.push({ key: `${m.id}|B`, label: `${m.code || m.id} • Slot B (libero)` });
        });
        return opts;
    }, [round1All]);

    const swapSlotOptions = React.useMemo(() => {
        // In swap mode we support both: swapping two real teams, and moving a team into a "slot libero".
        // Finished matches can still be relabeled retroactively; only "playing" is protected.
        const opts: Array<{ key: string; label: string }> = [];

        // Real teams in Round 1 not currently playing.
        round1All.forEach(m => {
            if ((m as any).hidden || m.hidden) return;
            if (m.isBye) return;
            if (m.status === 'playing') return;

            const a = (m.teamAId || '').trim();
            const b = (m.teamBId || '').trim();

            if (a && !isPlaceholderTeamId(a)) opts.push({ key: `${m.id}|A`, label: `${m.code || m.id} • A: ${getTeamName(a)}` });
            if (b && !isPlaceholderTeamId(b)) opts.push({ key: `${m.id}|B`, label: `${m.code || m.id} • B: ${getTeamName(b)}` });
        });

        // Include "slot libero" targets (BYE) to enable move.
        for (const o of byeSlotOptions) {
            // Avoid duplicates (defensive)
            if (!opts.some(x => x.key === o.key)) opts.push(o);
        }

        return opts;
    }, [round1All, byeSlotOptions, getTeamName, isPlaceholderTeamId]);


    const swapSlotKeySet = React.useMemo(() => new Set(swapSlotOptions.map(o => o.key)), [swapSlotOptions]);

    const allByeSlotKeys = React.useMemo(() => byeSlotOptions.map(o => o.key), [byeSlotOptions]);

    const manualEditValidation = React.useMemo(() => {
        const occ = new Map<string, { count: number; slotKeys: string[] }>();
        const placeholderSlotKeys: string[] = [];

        for (const m of round1All) {
            const slots: Array<{ key: string; id: string }> = [
                { key: `${m.id}|A`, id: String(m.teamAId || '').trim() },
                { key: `${m.id}|B`, id: String(m.teamBId || '').trim() },
            ];

            for (const slot of slots) {
                const up = slot.id.toUpperCase();
                const isNonByePlaceholder = !slot.id || up === 'TBD' || up.startsWith('TBD-');
                if (isNonByePlaceholder) {
                    placeholderSlotKeys.push(slot.key);
                    continue;
                }
                if (up === 'BYE') continue;

                const prev = occ.get(slot.id) || { count: 0, slotKeys: [] };
                prev.count += 1;
                prev.slotKeys.push(slot.key);
                occ.set(slot.id, prev);
            }
        }

        const duplicateEntries = Array.from(occ.entries()).filter(([, value]) => value.count > 1);
        const duplicateSlotKeys = duplicateEntries.flatMap(([, value]) => value.slotKeys);
        const placedIds = new Set(Array.from(occ.keys()));
        const missingRosterIds = state.tournament?.type === 'elimination'
            ? (printableRosterTeams || [])
                .map(t => String(t.id || '').trim())
                .filter(Boolean)
                .filter(id => !placedIds.has(id))
            : [];

        return {
            duplicateEntries,
            placeholderSlotKeys,
            invalidSlotKeys: Array.from(new Set([...placeholderSlotKeys, ...duplicateSlotKeys])),
            missingRosterIds,
        };
    }, [round1All, printableRosterTeams, state.tournament?.type]);

    const round1SlotKeysForTeam = React.useCallback((teamId: string): string[] => {
        const id = (teamId || '').trim();
        if (!id) return [];
        const keys: string[] = [];
        for (const m of round1All) {
            if ((m as any).hidden || m.hidden) continue;
            if (m.isBye) continue;
            const a = (m.teamAId || '').trim();
            const b = (m.teamBId || '').trim();
            if (a === id) keys.push(`${m.id}|A`);
            if (b === id) keys.push(`${m.id}|B`);
        }
        return keys;
    }, [round1All]);

    const scrollToBracketCanvas = React.useCallback(() => {
        bracketCanvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const focusExcludedTeam = React.useCallback((teamId: string) => {
        const id = (teamId || '').trim();
        if (!id) return;
        setFocusSlotKeys(allByeSlotKeys);
        setManualEditMode(true);
        setSlotPickMode('insert');
        setReplaceByeTeamId(id);
        setReplaceByeSlotKey('');
        setSwapSlotAKey('');
        setSwapSlotBKey('');
        setManualEditMsg(
            allByeSlotKeys.length > 0
                ? t('monitor_bracket_selected_excluded_team').replace('{team}', getTeamName(id) || id)
                : `Selezionata squadra non inclusa: ${getTeamName(id) || id}. Non ci sono slot liberi nel Round 1: correggi gli incastri o conferma l'esclusione alla chiusura.`
        );

        scrollToBracketCanvas();
    }, [allByeSlotKeys, getTeamName, scrollToBracketCanvas]);

    const focusBracketTeam = React.useCallback((teamId: string, label?: string) => {
        const id = (teamId || '').trim();
        if (!id) return;
        const keys = round1SlotKeysForTeam(id);
        setFocusSlotKeys(keys);
        setManualEditMsg(label || `Evidenziata: ${getTeamName(id) || id} nel Round 1.`);
        scrollToBracketCanvas();
    }, [getTeamName, round1SlotKeysForTeam, scrollToBracketCanvas]);

    const handleBracketParticipantClick = React.useCallback((args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => {
        if (!manualEditMode) return;

        const key = `${args.matchId}|${args.side}`;
        const m = args.match;
        if (m.phase !== 'bracket' || (m.round || 1) !== 1) return;

        if (slotPickMode === 'insert') {
            // In insert mode the operator can edit any Round 1 slot directly from the bracket canvas.
            // The slot will render an inline dropdown (first option: "Svuota slot", then teams not yet in bracket).
            setReplaceByeSlotKey(key);
            setFocusSlotKeys([key]);
            // Clear any pre-selected team from the panel: the dropdown is now the primary interaction.
            setReplaceByeTeamId('');
            setManualEditMsg(t('monitor_bracket_slot_selected_use_menu'));
            return;
        }

        // swap mode
        if (!swapSlotKeySet.has(key)) {
            setManualEditMsg(t('monitor_bracket_swap_move_hint'));
            return;
        }

        if (!swapSlotAKey || swapSlotAKey === key) {
            setSwapSlotAKey(key);
            setSwapSlotBKey('');
            setFocusSlotKeys([key]);
            setManualEditMsg(t('monitor_bracket_slot1_selected'));
            return;
        }

        if (!swapSlotBKey && swapSlotAKey !== key) {
            setSwapSlotBKey(key);
            setFocusSlotKeys([swapSlotAKey, key]);
            setManualEditMsg(t('monitor_bracket_slot2_selected_swap'));
            return;
        }

        // restart selection
        setSwapSlotAKey(key);
        setSwapSlotBKey('');
        setFocusSlotKeys([key]);
        setManualEditMsg(t('monitor_bracket_selection_reset'));
    }, [manualEditMode, slotPickMode, swapSlotKeySet, swapSlotAKey, swapSlotBKey]);

    const clearBracketDragState = React.useCallback(() => {
        setDragPayload(null);
        setDropTargetSlotKey('');
    }, []);

    const handleBracketSlotDragStart = React.useCallback((args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => {
        if (!manualEditMode) return;
        setDragPayload({ kind: 'slot', slotKey: `${args.matchId}|${args.side}` });
        setDropTargetSlotKey('');
        setManualEditMsg('Trascina lo slot su un altro slot del Round 1 per scambiare o spostare.');
    }, [manualEditMode]);

    const handleBracketTeamDragStart = React.useCallback((teamId: string) => {
        if (!manualEditMode) return;
        setDragPayload({ kind: 'team', teamId });
        setDropTargetSlotKey('');
        setManualEditMsg(`Trascina ${getTeamName(teamId) || teamId} su uno slot del Round 1 per assegnarla.`);
    }, [manualEditMode, getTeamName]);

    const handleBracketSlotDragEnter = React.useCallback((args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => {
        if (!manualEditMode || !dragPayload) return;
        const match = args.match;
        if (match.phase !== 'bracket' || (match.round || 1) !== 1) return;
        if (match.status === 'playing') return;
        setDropTargetSlotKey(`${args.matchId}|${args.side}`);
    }, [manualEditMode, dragPayload]);

    const applyLegacyBracketOperation = React.useCallback((operation: Parameters<typeof applyStructuralOperation>[1], successMessage?: string) => {
        if (!structureSnapshot) {
            setManualEditMsg(t('alert_no_live_active'));
            return false;
        }
        const result = applyStructuralOperation(structureSnapshot, operation);
        if (!result.ok || !result.nextSnapshot) {
            setManualEditMsg(result.check.humanMessage || 'Operazione non consentita.');
            return false;
        }
        handleUpdateTournamentAndMatches(result.nextSnapshot.tournament, result.nextSnapshot.matches);
        setManualEditMsg(successMessage || result.entry?.message || result.check.humanMessage);
        return true;
    }, [structureSnapshot, handleUpdateTournamentAndMatches]);

    const rebuildFutureBracketFromCurrentState = React.useCallback((seedMatches: Match[]) => {
        const matches = seedMatches.map(m => ({ ...m } as Match));
        const bracketRoundsMap = new Map<number, Match[]>();
        for (const match of matches) {
            if (match.phase !== 'bracket') continue;
            const round = match.round || 1;
            if (!bracketRoundsMap.has(round)) bracketRoundsMap.set(round, []);
            bracketRoundsMap.get(round)!.push(match);
        }

        const roundNumbers = Array.from(bracketRoundsMap.keys()).sort((a, b) => a - b);
        const rounds = roundNumbers.map(round => (bracketRoundsMap.get(round) || []).slice().sort(sortByOrderIndexSafe));
        const byId = new Map(matches.map(m => [m.id, m]));

        const isRealTeamId = (id?: string) => {
            const raw = String(id || '').trim();
            return !!raw && !isPlaceholderTeamId(raw);
        };

        const resolveWinner = (match?: Match) => {
            if (!match) return undefined;
            if (isByeTeamId(match.teamAId) && match.teamBId && !isByeTeamId(match.teamBId) && !isTbdTeamId(match.teamBId)) return match.teamBId;
            if (isByeTeamId(match.teamBId) && match.teamAId && !isByeTeamId(match.teamAId) && !isTbdTeamId(match.teamAId)) return match.teamAId;
            if (match.status !== 'finished') return undefined;
            if ((match.scoreA || 0) > (match.scoreB || 0)) return isTbdTeamId(match.teamAId) ? undefined : match.teamAId;
            if ((match.scoreB || 0) > (match.scoreA || 0)) return isTbdTeamId(match.teamBId) ? undefined : match.teamBId;
            return undefined;
        };

        const normalizeFutureMatch = (match: Match) => {
            if (match.phase !== 'bracket') return match;
            if (match.status === 'playing' || (match.status === 'finished' && !match.isBye && !match.hidden)) return match;

            const next = {
                ...match,
                scoreA: match.status === 'finished' ? (match.scoreA || 0) : 0,
                scoreB: match.status === 'finished' ? (match.scoreB || 0) : 0,
                stats: match.status === 'finished' ? match.stats : undefined,
            } as Match;

            const a = String(next.teamAId || '').trim();
            const b = String(next.teamBId || '').trim();
            const aIsBye = isByeTeamId(a);
            const bIsBye = isByeTeamId(b);
            const aIsReal = isRealTeamId(a);
            const bIsReal = isRealTeamId(b);

            if (aIsBye || bIsBye) {
                next.hidden = true;
                next.isBye = true;
                next.scoreA = 0;
                next.scoreB = 0;
                next.stats = undefined;

                if (aIsBye && bIsReal && !isTbdTeamId(b)) {
                    next.played = true;
                    next.status = 'finished';
                    return next;
                }
                if (bIsBye && aIsReal && !isTbdTeamId(a)) {
                    next.played = true;
                    next.status = 'finished';
                    return next;
                }
                if (aIsBye && bIsBye) {
                    next.played = true;
                    next.status = 'finished';
                    return next;
                }

                next.played = false;
                next.status = 'scheduled';
                return next;
            }

            next.hidden = false;
            next.isBye = false;

            if (next.status !== 'finished') {
                next.played = false;
                next.status = 'scheduled';
                next.scoreA = 0;
                next.scoreB = 0;
                next.stats = undefined;
            }

            return next;
        };

        for (const match of matches) {
            if (match.phase !== 'bracket') continue;
            if ((match.round || 1) <= 1) continue;
            if (match.status === 'playing' || (match.status === 'finished' && !match.isBye && !match.hidden)) continue;
            byId.set(match.id, {
                ...match,
                teamAId: undefined,
                teamBId: undefined,
                scoreA: 0,
                scoreB: 0,
                played: false,
                status: 'scheduled',
                hidden: false,
                isBye: false,
                stats: undefined,
            } as Match);
        }

        for (let rIdx = 0; rIdx < rounds.length - 1; rIdx++) {
            const currentRound = rounds[rIdx] || [];
            const nextRound = rounds[rIdx + 1] || [];

            for (let mIdx = 0; mIdx < currentRound.length; mIdx++) {
                const current = byId.get(currentRound[mIdx].id) || currentRound[mIdx];
                const targetSkeleton = nextRound[Math.floor(mIdx / 2)];
                if (!targetSkeleton) continue;

                const target = byId.get(targetSkeleton.id) || targetSkeleton;
                if (target.status === 'playing' || (target.status === 'finished' && !target.isBye && !target.hidden)) continue;

                const slot: 'teamAId' | 'teamBId' = (mIdx % 2 === 0) ? 'teamAId' : 'teamBId';
                const winner = resolveWinner(current);
                const updatedTarget = normalizeFutureMatch({
                    ...target,
                    [slot]: winner,
                } as Match);
                byId.set(updatedTarget.id, updatedTarget);
            }
        }

        return matches.map(match => {
            const next = byId.get(match.id) || match;
            if (next.phase !== 'bracket') return next;
            return normalizeFutureMatch(next);
        });
    }, [isPlaceholderTeamId, sortByOrderIndexSafe]);

    const commitBracketMatches = React.useCallback((seedMatches: Match[], successMessage: string) => {
        if (!state.tournament) return;
        const nextMatches = rebuildFutureBracketFromCurrentState(seedMatches);
        const nextTournament: TournamentData = {
            ...state.tournament,
            matches: nextMatches,
        };
        handleUpdateTournamentAndMatches(nextTournament, nextMatches);
        setManualEditMsg(successMessage);
    }, [state.tournament, rebuildFutureBracketFromCurrentState, handleUpdateTournamentAndMatches]);

    const applyBracketSlotValue = React.useCallback((slotKey: string, nextIdRaw: string, successMessage: string) => {
        const nextId = String(nextIdRaw || '').trim();
        if (!slotKey || !nextId) return false;
        if (nextId === 'BYE') {
            setManualEditMsg(t('monitor_bracket_direct_clear_moved'));
            openTournamentEditor('bracket');
            return false;
        }
        const currentValue = structureSnapshot ? getStructureSlotValue(structureSnapshot, slotKey) : '';
        const operation = isPlaceholderTeamId(currentValue)
            ? { type: 'INSERT_TEAM_IN_BRACKET_SLOT' as const, teamId: nextId, slotKey }
            : { type: 'REPLACE_BRACKET_SLOT' as const, slotKey, newTeamId: nextId };
        return applyLegacyBracketOperation(operation, successMessage);
    }, [structureSnapshot, isPlaceholderTeamId, applyLegacyBracketOperation, openTournamentEditor]);

    const applyBracketSlotSwap = React.useCallback((slotAKey: string, slotBKey: string, successMessage: string) => {
        const parsedA = parseStructureSlotKey(slotAKey);
        const parsedB = parseStructureSlotKey(slotBKey);
        if (!parsedA || !parsedB) {
            setManualEditMsg(t('monitor_bracket_select_two_valid_slots'));
            return false;
        }
        if (parsedA.matchId === parsedB.matchId && parsedA.side === parsedB.side) return false;
        return applyLegacyBracketOperation({
            type: 'SWAP_BRACKET_SLOTS',
            slotAKey,
            slotBKey,
        }, successMessage);
    }, [applyLegacyBracketOperation]);

    const handleBracketSlotDrop = React.useCallback((args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => {
        if (!manualEditMode || !dragPayload) return;
        const targetKey = `${args.matchId}|${args.side}`;

        let applied = false;
        if (dragPayload.kind === 'slot') {
            applied = applyBracketSlotSwap(
                dragPayload.slotKey,
                targetKey,
                t('monitor_bracket_drag_drop_applied')
            );
        } else {
            applied = applyBracketSlotValue(
                targetKey,
                dragPayload.teamId,
                t('monitor_bracket_assignment_applied')
            );
        }

        if (applied) {
            setFocusSlotKeys([targetKey]);
            setReplaceByeSlotKey('');
            setReplaceByeTeamId('');
            setSwapSlotAKey('');
            setSwapSlotBKey('');
        }
        clearBracketDragState();
    }, [manualEditMode, dragPayload, applyBracketSlotSwap, applyBracketSlotValue, clearBracketDragState]);

    const handleReplaceBye = React.useCallback(() => {
        setManualEditMsg('');
        const teamId = (replaceByeTeamId || '').trim();
        if (!replaceByeSlotKey || !teamId) {
            setManualEditMsg(t('monitor_bracket_select_empty_slot_and_team'));
            return;
        }
        const applied = applyBracketSlotValue(
            replaceByeSlotKey,
            teamId,
            'Slot aggiornato. I turni futuri non giocati sono stati riallineati.'
        );
        if (!applied) return;
        // reset selection
        setReplaceByeSlotKey('');
        setReplaceByeTeamId('');
    }, [replaceByeSlotKey, replaceByeTeamId, applyBracketSlotValue]);

    
    const inlineSlotEditor = React.useMemo(() => {
        if (!manualEditMode) return null;
        if (slotPickMode !== 'insert') return null;
        if (!replaceByeSlotKey) return null;

        const parsed = parseSlotKey(replaceByeSlotKey);
        if (!parsed) return null;

        const m = round1All.find(x => x.id === parsed.matchId);
        if (!m) return null;

        const curRaw = String((m as any)[parsed.slot] || '').trim();
        const curIsPlaceholder = !curRaw || isPlaceholderTeamId(curRaw);
        const curValue = curIsPlaceholder ? 'BYE' : curRaw;
        const curLabel = curIsPlaceholder ? t('monitor_bracket_empty_slot') : (getTeamName(curRaw) || curRaw);

        const options: Array<{ value: string; label: string; disabled?: boolean }> = [
            { value: '__CLEAR__', label: t('monitor_bracket_clear_slot') },
            { value: curValue, label: `— ${curLabel} —`, disabled: true },
            ...printableRosterTeams.map(t => ({ value: t.id, label: t.name }))
        ];

        return { slotKey: replaceByeSlotKey, currentTeamId: curValue, options };
    }, [manualEditMode, slotPickMode, replaceByeSlotKey, parseSlotKey, round1All, getTeamName, printableRosterTeams, isPlaceholderTeamId]);


    const handleInlineEditChange = React.useCallback((value: string) => {
        setManualEditMsg('');

        const key = replaceByeSlotKey;
        if (!key) return;

        const parsed = parseSlotKey(key);
        if (!parsed) return;

        const m = round1All.find(x => x.id === parsed.matchId);
        if (!m) return;

        let nextId = String(value || '').trim();
        if (nextId === '__CLEAR__') nextId = 'BYE';
        if (!nextId) return;
        const applied = applyBracketSlotValue(
            key,
            nextId,
            nextId === 'BYE'
                ? t('monitor_bracket_slot_cleared_recomputed')
                : t('monitor_bracket_slot_updated_recomputed')
        );
        if (!applied) return;
        setReplaceByeSlotKey('');
        setReplaceByeTeamId('');
        setFocusSlotKeys([]);
    }, [replaceByeSlotKey, parseSlotKey, round1All, applyBracketSlotValue]);


const handleSwapSlots = React.useCallback(() => {
        setManualEditMsg('');
        if (!swapSlotAKey || !swapSlotBKey) {
            setManualEditMsg(t('monitor_bracket_select_two_slots'));
            return;
        }
        const applied = applyBracketSlotSwap(
            swapSlotAKey,
            swapSlotBKey,
            t('monitor_bracket_swap_applied')
        );
        if (!applied) return;
        setSwapSlotAKey('');
        setSwapSlotBKey('');
    }, [swapSlotAKey, swapSlotBKey, applyBracketSlotSwap]);

    const slotLabelForKey = React.useCallback((key: string): { short: string; full: string; teamId?: string } => {
        const parsed = parseSlotKey(key);
        if (!parsed) return { short: key, full: key };

        const m = round1All.find(x => x.id === parsed.matchId);
        const side = parsed.slot === 'teamAId' ? 'A' : 'B';
        const code = (m?.code || m?.id || parsed.matchId);

        const rawTeamId = m ? String((m as any)[parsed.slot] || '').trim() : '';
        const up = rawTeamId.toUpperCase();
        const isBye = up === 'BYE';
        const isTbd = up === 'TBD' || up.startsWith('TBD-') || !rawTeamId;

        const teamLabel = isBye ? t('monitor_bracket_empty_slot') : (isTbd ? t('tbd_label') : (getTeamName(rawTeamId) || rawTeamId));
        const full = `${code} • ${side}: ${teamLabel}`;
        const short = teamLabel;
        return { short, full, teamId: (!isBye && !isTbd) ? rawTeamId : undefined };
    }, [parseSlotKey, round1All, getTeamName]);

    const handleManualEditSave = React.useCallback(() => {
        setManualEditMsg('');
        if (!state.tournament) {
            setManualEditMsg(t('alert_no_live_active'));
            return;
        }

        const firstDup = manualEditValidation.duplicateEntries[0];
        if (firstDup) {
            focusBracketTeam(firstDup[0], t('monitor_bracket_duplicate_round1_error').replace('{team}', getTeamName(firstDup[0]) || firstDup[0]).replace('{count}', String(firstDup[1].count)));
            return;
        }

        if (manualEditValidation.placeholderSlotKeys.length > 0) {
            setFocusSlotKeys(manualEditValidation.placeholderSlotKeys);
            setManualEditMsg(t('monitor_bracket_error_fill_round1_before_save'));
            scrollToBracketCanvas();
            return;
        }

        if (manualEditValidation.missingRosterIds.length > 0) {
            const firstMissing = manualEditValidation.missingRosterIds[0];
            const confirmed = window.confirm(
                t('monitor_bracket_missing_roster_confirm').replace('{count}', String(manualEditValidation.missingRosterIds.length)).replace('{example}', getTeamName(firstMissing) || firstMissing)
            );
            if (!confirmed) {
                focusExcludedTeam(firstMissing);
                setManualEditMsg(t('monitor_bracket_add_or_reposition_before_close').replace('{team}', getTeamName(firstMissing) || firstMissing));
                return;
            }
        }

        setFocusSlotKeys([]);
        setManualEditMode(false);
        setTimeout(() => setManualEditMsg(t('monitor_bracket_changes_saved')), 0);
    }, [
        state.tournament,
        manualEditValidation,
        focusBracketTeam,
        focusExcludedTeam,
        getTeamName,
        scrollToBracketCanvas,
    ]);

    const nextPowerOf2 = (n: number) => {
        let p = 1;
        while (p < Math.max(1, n)) p *= 2;
        return p;
    };

    const isTbdId = (id?: string) => {
        const up = String(id || '').trim().toUpperCase();
        return up === 'TBD' || up.startsWith('TBD-');
    };

    const applyByeAutoWin = (m: Match): Match => {
        if (!m) return m;
        if (m.status === 'finished') return m;
        // IMPORTANT: never auto-advance TBD placeholders.
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE' && !isTbdTeamId(m.teamBId)) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true } as any;
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE' && !isTbdTeamId(m.teamAId)) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true } as any;
        }
        if (m.teamAId === 'BYE' && m.teamBId === 'BYE') {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true } as any;
        }
        return m;
    };

    const resolveWinnerTeamId = (m: Match) => {
        if (!m) return undefined;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE') {
            if (isTbdTeamId(m.teamBId)) return undefined;
            return m.teamBId;
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE') {
            if (isTbdTeamId(m.teamAId)) return undefined;
            return m.teamAId;
        }
        if (m.status !== 'finished') return undefined;
        if (m.scoreA > m.scoreB) {
            if (isTbdTeamId(m.teamAId)) return undefined;
            return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
            if (isTbdTeamId(m.teamBId)) return undefined;
            return m.teamBId;
        }
        return undefined;
    };

    const buildBracketRounds = (matches: Match[]): Match[][] => {
        const map = new Map<number, Match[]>();
        (matches || [])
            .filter(m => m.phase === 'bracket')
            .forEach(m => {
                const r = m.round || 1;
                if (!map.has(r)) map.set(r, []);
                map.get(r)!.push(m);
            });
        const keys = Array.from(map.keys()).sort((a, b) => a - b);
        return keys.map(k => (map.get(k) || []).slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)));
    };

    const findMatchPositionInRounds = (rounds: Match[][], matchId: string): { rIdx: number; mIdx: number } | null => {
        for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
            const rr = rounds[rIdx] || [];
            for (let mIdx = 0; mIdx < rr.length; mIdx++) {
                if (rr[mIdx]?.id === matchId) return { rIdx, mIdx };
            }
        }
        return null;
    };

    const propagateWinnerFromMatch = (finishedMatch: Match, matches: Match[]): Match[] => {
        const rounds = buildBracketRounds(matches);
        const pos = findMatchPositionInRounds(rounds, finishedMatch.id);
        if (!pos) return matches;

        let rIdx = pos.rIdx;
        let mIdx = pos.mIdx;
        let current = finishedMatch;

        let out = [...matches];
        const byId = new Map(out.map(m => [m.id, m]));
        const upsert = (u: Match) => {
            byId.set(u.id, u);
            out = out.map(m => (m.id === u.id ? u : m));
        };

        while (true) {
            const winner = resolveWinnerTeamId(current);
            if (!winner || winner === 'BYE') break;

            const nextRound = rounds[rIdx + 1];
            if (!nextRound || nextRound.length === 0) break;

            const nextSkel = nextRound[Math.floor(mIdx / 2)];
            if (!nextSkel) break;

            const next = byId.get(nextSkel.id) || nextSkel;
            const slot: 'teamAId' | 'teamBId' = (mIdx % 2 === 0) ? 'teamAId' : 'teamBId';
            if ((next as any)[slot]) break;

            let nextUpdated: Match = { ...next, [slot]: winner } as any;
            const beforeStatus = nextUpdated.status;
            nextUpdated = applyByeAutoWin(nextUpdated);
            upsert(nextUpdated);

            // If the newly updated match auto-finished due to a BYE, continue propagating.
            if (beforeStatus !== 'finished' && nextUpdated.status === 'finished') {
                current = nextUpdated;
                rIdx = rIdx + 1;
                mIdx = Math.floor(mIdx / 2);
                continue;
            }
            break;
        }

        return out;
    };

    const autoResolveBracketByes = (matches: Match[]): Match[] => {
        let out = [...matches];
        let changed = true;
        let guard = 0;
        while (changed && guard < 2000) {
            guard++;
            changed = false;
            for (const m of out) {
                if (m.phase !== 'bracket') continue;
                if (m.status === 'finished') continue;
                const after = applyByeAutoWin(m);
                const didChange = (after.status !== m.status) || (after.scoreA !== m.scoreA) || (after.scoreB !== m.scoreB) || (after.played !== m.played) || !!((after as any).hidden) !== !!((m as any).hidden);
                if (after.status === 'finished' && didChange) {
                    out = out.map(mm => (mm.id === after.id ? after : mm));
                    out = propagateWinnerFromMatch(after, out);
                    changed = true;
                }
            }
        }
        return out;
    };

    const handleRebuildEliminationBracketRandom = React.useCallback(() => {
        setManualEditMsg('');
        if (!state.tournament) {
            setManualEditMsg(t('alert_no_live_active'));
            return;
        }
        if (state.tournament.type !== 'elimination') {
            setManualEditMsg(t('monitor_bracket_regenerate_only_elimination'));
            return;
        }
        if (integrity?.bracketLocked) {
            setManualEditMsg('Tabellone bloccato: non è possibile rigenerare.');
            return;
        }

        const ok = window.confirm(t('monitor_bracket_regenerate_random_confirm'));
        if (!ok) return;

        const liveTeams = (state.tournament.teams && state.tournament.teams.length) ? state.tournament.teams : (tournamentTeams || []);
        try {
            const { tournament: genT, matches: genM } = generateTournamentStructure(liveTeams, {
                mode: 'elimination',
                tournamentName: state.tournament.name,
                advancingPerGroup: state.tournament.config?.advancingPerGroup || 2,
                finalRoundRobin: state.tournament.config?.finalRoundRobin,
            });

            const nextTournament: TournamentData = {
                ...genT,
                id: state.tournament.id,
                name: state.tournament.name,
                startDate: state.tournament.startDate,
                type: 'elimination',
                teams: liveTeams,
                config: {
                    ...state.tournament.config,
                    finalRoundRobin: state.tournament.config?.finalRoundRobin,
                },
                matches: genM,
                rounds: genT.rounds,
                refereesRoster: state.tournament.refereesRoster,
                refereesPassword: state.tournament.refereesPassword,
                isManual: true,
            };

            handleUpdateTournamentAndMatches(nextTournament, genM);
            setManualEditMsg('Tabellone rigenerato (casuale).');
        } catch (e) {
            console.error('Rigenerazione tabellone fallita:', e);
            setManualEditMsg(t('monitor_bracket_regenerate_failed'));
        }
    }, [state.tournament, integrity?.bracketLocked, tournamentTeams, handleUpdateTournamentAndMatches]);

    const handleRebuildEliminationBracketPreserve = React.useCallback(() => {
        setManualEditMsg('');
        if (!state.tournament) {
            setManualEditMsg(t('alert_no_live_active'));
            return;
        }
        if (state.tournament.type !== 'elimination') {
            setManualEditMsg(t('monitor_bracket_regenerate_only_elimination'));
            return;
        }
        if (integrity?.bracketLocked) {
            setManualEditMsg('Tabellone bloccato: non è possibile rigenerare.');
            return;
        }

        const ok = window.confirm(t('monitor_bracket_regenerate_keep_confirm'));
        if (!ok) return;

        const liveTeams = (state.tournament.teams && state.tournament.teams.length) ? state.tournament.teams : (tournamentTeams || []);
        const rosterTeamIds = (liveTeams || [])
            .filter(t => !t.hidden && !(t as any).isBye && String(t.id || '').trim().toUpperCase() !== 'BYE')
            .map(t => String(t.id || '').trim())
            .filter(Boolean);

        if (rosterTeamIds.length < 2) {
            setManualEditMsg('Servono almeno 2 squadre per rigenerare un tabellone.');
            return;
        }

        const currMatches = (state.tournamentMatches || []).filter(m => m.phase === 'bracket');
        const roundsPresent = currMatches
            .map(m => (m.round ?? 1))
            .filter(r => Number.isFinite(r));
        const baseRound = roundsPresent.length ? Math.min(...roundsPresent) : 1;

        const baseRoundMatches = currMatches
            .filter(m => (m.round ?? 1) === baseRound)
            .slice()
            .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        if (!baseRoundMatches.length) {
            setManualEditMsg(t('monitor_bracket_keep_structure_initial_round_missing'));
            return;
        }

        // Preserve placeholders: BYE auto-advances (hidden), TBD never auto-advances.
        const normalizeSlotId = (raw?: string): string => {
            const id = String(raw || '').trim();
            if (!id) return 'BYE';
            const up = id.toUpperCase();
            if (up === 'BYE') return 'BYE';
            if (isTbdTeamId(id)) return id; // keep TBD/TBD-* as-is
            return id;
        };

        const basePairs: [string, string][] = baseRoundMatches.map(m => {
            const a = normalizeSlotId(m.teamAId);
            const b = normalizeSlotId(m.teamBId);
            return [a, b] as [string, string];
        });

        const isRealTeamId = (id: string) => {
            if (!id) return false;
            const up = id.toUpperCase();
            if (up === 'BYE') return false;
            if (isTbdTeamId(id)) return false;
            return true;
        };

        const usedSeeds = new Set<string>();
        for (const [a, b] of basePairs) {
            if (isRealTeamId(a)) usedSeeds.add(a);
            if (isRealTeamId(b)) usedSeeds.add(b);
        }

        // New teams since the bracket was created.
        const newTeamIdsInitial = rosterTeamIds.filter(id => !usedSeeds.has(id));

        // 1) Fill empty/BYE/TBD slots in the preserved Round with new teams first.
        const filledBasePairs: [string, string][] = basePairs.map(p => [...p] as [string, string]);
        const fillPool = [...newTeamIdsInitial];
        for (const p of filledBasePairs) {
            for (let i = 0; i < 2; i++) {
                if (!fillPool.length) break;
                const slot = p[i];
                if (!isRealTeamId(slot)) {
                    p[i] = fillPool.shift() as string;
                }
            }
            if (!fillPool.length) break;
        }

        const usedAfterFill = new Set<string>();
        for (const [a, b] of filledBasePairs) {
            if (isRealTeamId(a)) usedAfterFill.add(a);
            if (isRealTeamId(b)) usedAfterFill.add(b);
        }
        const remainingNewTeamIds = rosterTeamIds.filter(id => !usedAfterFill.has(id));

        const baseSlotCount = filledBasePairs.length * 2;
        const rosterCount = rosterTeamIds.length;
        const targetSize = nextPowerOf2(rosterCount);

        // Strategy:
        // - If we fit in the current bracket size, just apply the filled pairs to Round 1.
        // - If we overflow, expand to the next power-of-2 by inserting a preliminary round (one-step expansion).
        //   The preserved pairs become the next round (Round 2) matchups if the seeded teams win.
        if (targetSize < baseSlotCount) {
            setManualEditMsg(t('monitor_bracket_keep_structure_cannot_shrink'));
            return;
        }

        const canKeepSameSize = targetSize === baseSlotCount;
        const canExpandOneStep = targetSize === baseSlotCount * 2;

        if (!canKeepSameSize && !canExpandOneStep) {
            setManualEditMsg(t('monitor_bracket_keep_structure_supported_up_to_double'));
            return;
        }

        try {
            const { tournament: genT, matches: genM0 } = generateTournamentStructure(liveTeams, {
                mode: 'elimination',
                tournamentName: state.tournament.name,
                advancingPerGroup: state.tournament.config?.advancingPerGroup || 2,
                finalRoundRobin: state.tournament.config?.finalRoundRobin,
            });

            const genM = genM0.map(m => ({ ...m }));

            const genBracket = genM.filter(m => m.phase === 'bracket');
            const genRound1 = genBracket
                .filter(m => (m.round ?? 1) === 1)
                .slice()
                .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

            // Case A: keep same size -> apply filledBasePairs directly to Round 1.
            if (canKeepSameSize) {
                if (genRound1.length !== filledBasePairs.length) {
                    setManualEditMsg(t('monitor_bracket_initial_round_mismatch'));
                    return;
                }
                for (let i = 0; i < genRound1.length; i++) {
                    const m = genRound1[i];
                    const [a, b] = filledBasePairs[i];
                    const upd: Match = {
                        ...m,
                        teamAId: a,
                        teamBId: b,
                        scoreA: 0,
                        scoreB: 0,
                        played: false,
                        status: 'scheduled',
                        hidden: false,
                        isBye: false,
                        stats: [],
                    } as any;
                    const idx = genM.findIndex(mm => mm.id === m.id);
                    if (idx >= 0) genM[idx] = upd;
                }
            }

            // Case B: expand one step -> Round 1 becomes preliminaries feeding into the preserved pairs.
            if (canExpandOneStep) {
                // New Round 1 must have exactly baseSlotCount matches (e.g., 16->32 => 16 matches).
                if (genRound1.length !== baseSlotCount) {
                    setManualEditMsg(t('monitor_bracket_preliminary_mismatch'));
                    return;
                }

                // Seeds are the filledBasePairs slots in order: they will meet in Round 2 if they win.
                // Map:
                //   basePairs[i][0] -> genRound1[2*i]
                //   basePairs[i][1] -> genRound1[2*i+1]
                const opponentPool: string[] = [...remainingNewTeamIds];
                while (opponentPool.length < baseSlotCount) opponentPool.push('BYE');

                for (let i = 0; i < filledBasePairs.length; i++) {
                    const [seedA, seedB] = filledBasePairs[i];
                    const m0 = genRound1[2 * i];
                    const m1 = genRound1[2 * i + 1];
                    const opp0 = opponentPool[2 * i] || 'BYE';
                    const opp1 = opponentPool[2 * i + 1] || 'BYE';

                    const upd0: Match = {
                        ...m0,
                        teamAId: seedA,
                        teamBId: opp0,
                        scoreA: 0,
                        scoreB: 0,
                        played: false,
                        status: 'scheduled',
                        hidden: false,
                        isBye: false,
                        stats: [],
                    } as any;
                    const upd1: Match = {
                        ...m1,
                        teamAId: seedB,
                        teamBId: opp1,
                        scoreA: 0,
                        scoreB: 0,
                        played: false,
                        status: 'scheduled',
                        hidden: false,
                        isBye: false,
                        stats: [],
                    } as any;

                    const idx0 = genM.findIndex(mm => mm.id === m0.id);
                    if (idx0 >= 0) genM[idx0] = upd0;
                    const idx1 = genM.findIndex(mm => mm.id === m1.id);
                    if (idx1 >= 0) genM[idx1] = upd1;
                }
            }

            // Reset downstream rounds (participants will be re-populated via BYE auto-wins / results)
            for (let i = 0; i < genM.length; i++) {
                const m = genM[i];
                if (m.phase !== 'bracket') continue;
                if ((m.round || 1) <= 1) continue;
                genM[i] = {
                    ...m,
                    teamAId: undefined,
                    teamBId: undefined,
                    scoreA: 0,
                    scoreB: 0,
                    played: false,
                    status: 'scheduled',
                    hidden: false,
                    isBye: false,
                    stats: [],
                } as any;
            }

            const finalMatches = autoResolveBracketByes(genM);

            const nextTournament: TournamentData = {
                ...genT,
                id: state.tournament.id,
                name: state.tournament.name,
                startDate: state.tournament.startDate,
                type: 'elimination',
                teams: liveTeams,
                config: {
                    ...state.tournament.config,
                    finalRoundRobin: state.tournament.config?.finalRoundRobin,
                },
                matches: finalMatches,
                rounds: genT.rounds,
                refereesRoster: state.tournament.refereesRoster,
                refereesPassword: state.tournament.refereesPassword,
                isManual: true,
            };

            handleUpdateTournamentAndMatches(nextTournament, finalMatches);
            setManualEditMsg('Tabellone rigenerato (mantieni struttura).');
        } catch (e) {
            console.error('Rigenerazione tabellone (mantieni struttura) fallita:', e);
            setManualEditMsg(t('monitor_bracket_regenerate_failed'));
        }
    }, [state.tournament, state.tournamentMatches, integrity?.bracketLocked, tournamentTeams, handleUpdateTournamentAndMatches]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <h3 className="text-xl font-black flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5" /> Monitor Tabellone
                </h3>
                <div className="text-xs font-bold text-slate-500 mt-1">
                    {t('monitor_bracket_quick_search_tip_prefix')} <span className="font-black">{t('monitor_bracket_start_close')}</span> {t('monitor_bracket_quick_search_tip_mid')} <span className="font-black">{t('report_label')}</span> {t('monitor_bracket_quick_search_tip_suffix')}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label={t('monitor_bracket_toolbar_aria')}>
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('codes_search_placeholder')}
                            aria-label={t('codes_search_aria')}
                            className={toolbarInput}
                        />
                        {query.trim() && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-xl hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                aria-label={t('clear_search')}
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        )}
                    </div>

                    {isTesterMode ? (
                        <>
                            <button type="button"
                                onClick={handleSimulateTurn}
                                disabled={!state.tournament || simBusy}
                                className={btnSecondarySm}
                                title={t('monitor_bracket_simulate_next_round_title')}
                            >
                                {t('simulate_turn')}
                            </button>
                            <button type="button"
                                onClick={handleSimulateAll}
                                disabled={!state.tournament || simBusy}
                                className={btnSecondarySm}
                                title={t('monitor_bracket_simulate_all')}
                            >
                                {t('simulate_all')}
                            </button>
                        </>
                    ) : null}
                </div>

                <div className="text-xs font-bold text-slate-500">
                    {t('monitor_live_tournament_label')}: {state.tournament ? t('yes') : t('no')} • {t('match_list')}: {(state.tournamentMatches || []).length}
                </div>
            </div>
        </div>

        {state.tournament && query.trim() && (state.tournamentMatches || []).filter(m => !m.hidden && !m.isBye).filter(matchMatchesQuery).length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold flex items-center justify-between gap-3 flex-wrap">
                <div>
                    {t('monitor_no_match_found_for').replace('{query}', `“${query.trim()}”`)}
                </div>
                <button
                    type="button"
                    onClick={() => setQuery('')}
                    className={btnSecondarySm}
                >
                    {t('clear')}
                </button>
            </div>
        )}
        {state.tournament && finalRrStatus && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-indigo-900 font-bold">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div className="font-black">{t('monitor_bracket_final_group_rr_title')}</div>
                        <div className="text-sm font-bold text-indigo-900/90 mt-1">
                            {finalRrStatus.activated
                                ? t('active_now') + '.'
                                : finalRrStatus.canActivate
                                    ? t('monitor_bracket_final_group_ready').replace('{top}', String(finalRrStatus.topTeams))
                                    : t('monitor_bracket_final_group_not_activatable').replace('{reason}', finalRrReasonLabel(finalRrStatus.reason))}
                        </div>
                        {!finalRrStatus.activated && finalRrStatus.participants && finalRrStatus.participants.length ? (
                            <div className="text-xs font-mono font-black text-indigo-900/80 mt-2 flex flex-wrap gap-2">
                                {finalRrStatus.participants.map(t => (
                                    <span key={t.id} className="px-2 py-1 rounded-full border border-indigo-200 bg-white">
                                        {t.name || t.id}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    {!finalRrStatus.activated && (
                        <button type="button"
                            onClick={handleActivateFinalRoundRobin}
                            disabled={!finalRrStatus.canActivate}
                            className="px-4 py-3 rounded-xl font-black border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={finalRrStatus.canActivate ? t('monitor_bracket_activate_final_group_title') : t('monitor_bracket_final_group_not_ready')}
                        >
                            {t('monitor_bracket_activate_final_group')}
                        </button>
                    )}
                </div>
            </div>
        )}

        {state.tournament && state.tournament.type === 'groups_elimination' && openGroupTieBreaks.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 font-bold">
                <div className="font-black">{t('monitor_bracket_qualification_blocked_by_tiebreak').replace('{label}', t('tiebreak_label').toUpperCase())}</div>
                <div className="text-sm font-bold text-amber-900/90 mt-1">
                    {t('monitor_bracket_tiebreaks_pending_desc')}
                </div>
                <div className="text-xs font-mono font-black text-amber-900/80 mt-2 flex flex-wrap gap-2">
                    {openGroupTieBreaks.slice(0, 10).map(m => (
                        <span key={m.id} className="px-2 py-1 rounded-full border border-amber-200 bg-white">
                            {(m.code || m.id)}{m.groupName ? ` (G ${m.groupName})` : ''}
                        </span>
                    ))}
                    {openGroupTieBreaks.length > 10 && (
                        <span className="px-2 py-1 rounded-full border border-amber-200 bg-white">
                            +{openGroupTieBreaks.length - 10}
                        </span>
                    )}
                </div>
            </div>
        )}

        {!state.tournament && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                {t('monitor_no_live_go_structure_confirm')}
            </div>
        )}

        {state.tournament && (
            <div className="space-y-4">
                {showLegacyStructuralTools && integrity && (() => {
                    const duplicateUniqueCount = new Set([
                        ...integrity.rosterDuplicates,
                        ...integrity.duplicatesInGroups,
                        ...integrity.duplicatesInBracket,
                    ]).size;
                    const issueCount = integrity.excluded.length + duplicateUniqueCount + integrity.unknown.length;

                    return (
                        <button
                            type="button"
                            onClick={toggleIntegrityPanel}
                            aria-expanded={integrityPanelOpen}
                            aria-controls="monitor-bracket-integrity-panel"
                            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border font-bold text-left hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${integrityHasIssues ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                            title={integrityPanelOpen ? t('monitor_bracket_hide_integrity_title') : t('monitor_bracket_open_integrity_title')}
                        >
                            <div>
                                <div className="font-black">{t('monitor_live_integrity_legacy_title')}</div>
                                <div className="text-sm font-bold opacity-90 mt-1">
                                    {t('monitor_bracket_label')}: {integrity.bracketLocked ? t('monitor_bracket_started_state') : t('monitor_bracket_not_started_state')} •{' '}
                                    Gironi conclusi: {integrity.groupsConcludedCount}/{integrity.groupsTotal}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {issueCount > 0 && (
                                    <span className="px-3 py-2 rounded-full border border-rose-200 bg-white text-rose-900 font-black text-xs">
                                        {t('issues_label')}: {issueCount}
                                    </span>
                                )}
                                <span className="text-xs font-black uppercase tracking-wide opacity-80">
                                    {integrityPanelOpen ? t('hide') : t('open')}
                                </span>
                                {integrityPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                        </button>
                    );
                })()}

                {showLegacyStructuralTools && integrity && integrityPanelOpen && (
                    <div id="monitor-bracket-integrity-panel" className="space-y-4">

{integrity && (() => {
    const hasIssues = (
        integrity.excluded.length > 0 ||
        integrity.rosterDuplicates.length > 0 ||
        integrity.duplicatesInGroups.length > 0 ||
        integrity.duplicatesInBracket.length > 0 ||
        integrity.unknown.length > 0
    );

    const duplicateUniqueCount = new Set([
        ...integrity.rosterDuplicates,
        ...integrity.duplicatesInGroups,
        ...integrity.duplicatesInBracket,
    ]).size;

    return (
        <div className={`border rounded-xl p-4 font-bold ${hasIssues ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="font-black">{t('monitor_integrity_check')}</div>
                    <div className="text-sm font-bold mt-1">
                        {hasIssues
                            ? (
                                <>
                                    {t('editor_attention')}:
                                    {integrity.excluded.length > 0 ? <> <span className="font-black">{integrity.excluded.length}</span> non incluse</> : null}
                                    {duplicateUniqueCount > 0 ? (
                                        <> • <span className="font-black">{duplicateUniqueCount}</span> duplicate</>
                                    ) : null}
                                    {integrity.unknown.length > 0 ? <> • <span className="font-black">{integrity.unknown.length}</span> non in "Squadre"</> : null}
                                    .
                                </>
                            )
                            : t('monitor_bracket_integrity_ok')}
                    </div>
                    <div className="text-xs font-bold mt-2 opacity-90">
                        {t('monitor_correction_in_progress')}: <span className="font-black">{t('yes').toUpperCase()}</span>
                        {integrity.groupsTotal > 0 ? (
                            <> • Gironi conclusi: <span className="font-black">{integrity.groupsConcludedCount}/{integrity.groupsTotal}</span></>
                        ) : null}
                    </div>
                    <div className="text-[11px] font-bold mt-2 opacity-80">
                        Questo controllo si aggiorna automaticamente e segnala i punti da correggere prima di passare all’Editor Torneo.
                    </div>
                </div>

                {(focusSlotKeys.length > 0 || !!manualEditMsg || !!replaceByeTeamId || !!replaceByeSlotKey || !!swapSlotAKey || !!swapSlotBKey) && (
                    <button
                        type="button"
                        onClick={clearFocusAndSelections}
                        className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                        title={t('monitor_clear_highlights_title')}
                    >
                        Reset evidenziazione
                    </button>
                )}
            </div>

            <div className="mt-4">
                <div className="text-xs font-black">
                    SQUADRE DA APPLICARE {integrity.excluded.length > 0 ? <>• <span className="font-black">{integrity.excluded.length}</span></> : null}
                </div>
                <div className="text-[11px] font-bold mt-1 opacity-80">
                    {t('monitor_bracket_present_in_teams_not_bracket').replace('{teams}', t('teams'))}
                    <> Clicca una pill per guidare l’inserimento o per verificare gli slot del Round 1.</>
                </div>
                {integrity.excluded.length > 0 ? (
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.excluded.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => focusExcludedTeam(id)}
                                className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                                title={t('monitor_bracket_click_guide_insert_title')}
                            >
                                {getTeamName(id) || id}
                            </button>
                        ))}
                        {integrity.excluded.length > 16 && (
                            <span className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900">
                                +{integrity.excluded.length - 16}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="mt-2 text-xs font-bold text-emerald-900/80">
                        {t('monitor_no_team_to_apply')}
                    </div>
                )}
            </div>

            {integrity.rosterDuplicates.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs font-black">{t('monitor_duplicates_in_teams_same_id')}</div>
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.rosterDuplicates.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => focusBracketTeam(id, t('monitor_duplicate_in_teams_highlight').replace('{team}', getTeamName(id) || id))}
                                className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                                title={t('monitor_bracket_highlight_team_title')}
                            >
                                {getTeamName(id) || id}
                            </button>
                        ))}
                        {integrity.rosterDuplicates.length > 16 && (
                            <span className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900">
                                +{integrity.rosterDuplicates.length - 16}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {integrity.duplicatesInGroups.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs font-black">{t('monitor_duplicates_in_groups')}</div>
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.duplicatesInGroups.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => {
                                    setFocusSlotKeys([]);
                                    setManualEditMsg(t('monitor_duplicate_in_groups_go_monitor').replace('{team}', getTeamName(id) || id));
                                }}
                                title={(integrity.groupDupGroups?.[id] || []).join(', ')}
                                className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                            >
                                {getTeamName(id) || id}
                                <span className="ml-1 text-[10px] opacity-70">
                                    ×{integrity.groupDupCount?.[id] || 2}
                                </span>
                            </button>
                        ))}
                        {integrity.duplicatesInGroups.length > 16 && (
                            <span className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900">
                                +{integrity.duplicatesInGroups.length - 16}
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] font-bold mt-2 opacity-80">
                        Suggerimento: passa il mouse sulle pill per vedere in quali gironi compare la squadra.
                    </div>
                </div>
            )}

            {integrity.duplicatesInBracket.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs font-black">{t('monitor_duplicates_in_round1_bracket')}</div>
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.duplicatesInBracket.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => focusBracketTeam(id, t('monitor_duplicate_in_round1_highlight').replace('{team}', getTeamName(id) || id))}
                                className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                                title={t('monitor_bracket_highlight_in_bracket_title')}
                            >
                                {getTeamName(id) || id}
                                <span className="ml-1 text-[10px] opacity-70">
                                    ×{integrity.bracketDupCount?.[id] || 2}
                                </span>
                            </button>
                        ))}
                        {integrity.duplicatesInBracket.length > 16 && (
                            <span className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900">
                                +{integrity.duplicatesInBracket.length - 16}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {integrity.unknown.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs font-black">{t('monitor_present_in_groups_bracket_not_teams')}</div>
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.unknown.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => focusBracketTeam(id, t('monitor_present_in_groups_bracket_not_teams_highlight').replace('{team}', getTeamName(id) || id))}
                                className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                                title={t('monitor_bracket_highlight_title')}
                            >
                                {getTeamName(id) || id}
                            </button>
                        ))}
                        {integrity.unknown.length > 16 && (
                            <span className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900">
                                +{integrity.unknown.length - 16}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
})()}

                {showLegacyStructuralTools && integrity && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 font-bold">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <div className="font-black">{t('monitor_bracket_correction_title')}</div>
                                <div className="text-sm font-bold text-slate-700/90 mt-1">
                                    Puoi correggere gli incastri del Round 1 anche a torneo avviato. I match in corso non si toccano; i turni futuri non ancora giocati vengono riallineati.
                                </div>
                            </div>
                            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
                                <input
                                    type="checkbox"
                                    checked={manualEditMode}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setManualEditMode(true);
                                            setManualEditMsg('');
                                            return;
                                        }
                                        handleManualEditSave();
                                    }}
                                />
                                <span className="text-sm font-black">{t('enable')}</span>
                            </label>
                        </div>

                        <div className="text-xs font-bold text-slate-700/80 mt-2">
                            {t('monitor_bracket_status_label')}: {integrity.bracketLocked ? t('monitor_bracket_started_present') : t('monitor_bracket_no_started_matches')}
                        </div>

                        {manualEditMode && (
                            <details className="mt-3 rounded-xl border border-slate-200 bg-white" open={!!manualEditMsg}>
                                <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-black text-slate-700/80">{t('edit_tools')}</div>
                                        <div className="text-[11px] font-bold text-slate-700/70 mt-0.5">
                                            Slot Round 1, scambi e riallineamento dei turni futuri.
                                        </div>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                </summary>
                                <div className="border-t border-slate-200 p-3 space-y-3">
                                <div className="text-xs font-black text-slate-700/80">
                                    Azioni Round 1
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={handleManualEditSave}
                                        className="px-3 py-2 rounded-xl font-black border border-slate-300 bg-slate-900 text-white text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                        title={t('monitor_bracket_validate_round1_title')}
                                    >
                                        Salva modifiche
                                    </button>
                                    <div className="text-[11px] font-bold text-slate-700/70">
                                        {t('monitor_bracket_close_guard_desc')}
                                    </div>
                                </div>

                                {manualEditMsg && (
                                    <div className="text-xs font-black text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                        {manualEditMsg}
                                    </div>
                                )}

                                <div className="bg-white border border-slate-200 rounded-xl p-3">
                                    <div className="text-xs font-black text-slate-700/80">
                                        Selezione dal tabellone
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSlotPickModeWithReset('insert')}
                                            className={`px-3 py-2 rounded-xl font-black border text-xs ${slotPickMode === 'insert' ? 'border-slate-300 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                        >
                                            Modifica slot (menu)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSlotPickModeWithReset('swap')}
                                            className={`px-3 py-2 rounded-xl font-black border text-xs ${slotPickMode === 'swap' ? 'border-slate-300 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                        >
                                            Scambia posizioni
                                        </button>
                                        <div className="text-[11px] font-bold text-slate-700/70">
                                            {slotPickMode === 'insert'
                                                ? t('monitor_bracket_insert_help')
                                                : t('monitor_bracket_swap_help')}
                                        </div>
                                    </div>
                                </div>


                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setAltInsertPanelOpen(v => !v)}
                                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                        aria-expanded={altInsertPanelOpen}
                                        aria-controls="alt-insert-panel"
                                    >
                                        <div className="min-w-0 text-left">
                                            <div className="text-xs font-black text-slate-700/80">{t('monitor_bracket_alternative_method_panel')}</div>
                                            <div className="text-[11px] font-bold text-slate-700/70 mt-0.5">
                                                Slot liberi: <span className="font-black">{byeSlotOptions.length}</span>
                                                <span className="mx-1">•</span>
                                                Squadre selezionabili: <span className="font-black">{printableRosterTeams.length}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[11px] font-black text-slate-700/80">{altInsertPanelOpen ? t('hide') : t('open')}</span>
                                            {altInsertPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                    </button>

                                    {altInsertPanelOpen && (
                                        <div id="alt-insert-panel" className="border-t border-slate-200 p-3">
                                            <div className="text-xs font-black text-slate-700/80">
                                                {t('monitor_bracket_insert_empty_round1')}
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <select
                                                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                                                    value={replaceByeSlotKey}
                                                    onChange={(e) => setReplaceByeSlotKey(e.target.value)}
                                                >
                                                    <option value="">{t('monitor_bracket_select_empty_slot')}</option>
                                                    {byeSlotOptions.map(o => (
                                                        <option key={o.key} value={o.key}>{o.label}</option>
                                                    ))}
                                                </select>

                                                <select
                                                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                                                    value={replaceByeTeamId}
                                                    onChange={(e) => setReplaceByeTeamId(e.target.value)}
                                                >
                                                    <option value="">{t('monitor_bracket_select_team_option')}</option>
                                                    {printableRosterTeams.map(t => (
                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                    ))}
                                                </select>

                                                <button type="button"
                                                    onClick={handleReplaceBye}
                                                    disabled={!replaceByeSlotKey || !replaceByeTeamId || byeSlotOptions.length === 0 || printableRosterTeams.length === 0}
                                                    className={`px-3 py-2 rounded-xl font-black border text-xs ${(!replaceByeSlotKey || !replaceByeTeamId || byeSlotOptions.length === 0 || printableRosterTeams.length === 0) ? 'border-slate-200 bg-white opacity-50 cursor-not-allowed' : 'border-slate-300 bg-slate-900 text-white'}`}
                                                    title={byeSlotOptions.length === 0 ? t('monitor_bracket_no_empty_round1') : ''}
                                                >
                                                    Inserisci
                                                </button>
                                            </div>

                                            {(byeSlotOptions.length > 0 || printableRosterTeams.length > 0) && (
                                                <div className="mt-3">
                                                    <div className="text-[11px] font-black text-slate-700/80">{t('monitor_bracket_quick_bar')}</div>
                                                    {byeSlotOptions.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {byeSlotOptions.map(o => {
                                                                const info = slotLabelForKey(o.key);
                                                                const selected = replaceByeSlotKey === o.key;
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        key={o.key}
                                                                        onClick={() => {
                                                                            if (slotPickMode !== 'insert') setSlotPickModeWithReset('insert');
                                                                            setReplaceByeSlotKey(o.key);
                                                                            setFocusSlotKeys([o.key]);
                                                                            scrollToBracketCanvas();
                                                                        }}
                                                                        className={`px-2 py-1 rounded-full border text-xs font-black ${selected ? 'border-slate-300 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                                        title={info.full}
                                                                    >
                                                                        {info.short}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {printableRosterTeams.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {printableRosterTeams.slice(0, 24).map(t => {
                                                                const selected = replaceByeTeamId === t.id;
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        key={t.id}
                                                                        draggable={manualEditMode}
                                                                        onDragStart={() => handleBracketTeamDragStart(t.id)}
                                                                        onDragEnd={clearBracketDragState}
                                                                        onClick={() => {
                                                                            if (slotPickMode !== 'insert') setSlotPickModeWithReset('insert');
                                                                            setReplaceByeTeamId(t.id);
                                                                        }}
                                                                        className={`px-2 py-1 rounded-full border text-xs font-black ${selected ? 'border-slate-300 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                                        title={t.name}
                                                                    >
                                                                        {t.name}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {printableRosterTeams.length > 24 && (
                                                        <div className="mt-2 text-[11px] font-bold text-slate-700/70">
                                                            +{printableRosterTeams.length - 24} squadre non mostrate (usa il menu a tendina)
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="text-[11px] font-bold text-slate-700/70 mt-2">
                                                Nota: puoi trascinare squadra→slot o slot→slot. I doppioni vengono segnati in rosso e non puoi chiudere la modifica finché non li sistemi.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white border border-slate-200 rounded-xl p-3">
                                    <div className="text-xs font-black text-slate-700/80">
                                        Scambia posizioni (Round 1)
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <select
                                            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                                            value={swapSlotAKey}
                                            onChange={(e) => setSwapSlotAKey(e.target.value)}
                                        >
                                            <option value="">{t('monitor_bracket_slot1_option')}</option>
                                            {swapSlotOptions.map(o => (
                                                <option key={o.key} value={o.key}>{o.label}</option>
                                            ))}
                                        </select>

                                        <select
                                            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                                            value={swapSlotBKey}
                                            onChange={(e) => setSwapSlotBKey(e.target.value)}
                                        >
                                            <option value="">{t('monitor_bracket_slot2_option')}</option>
                                            {swapSlotOptions.map(o => (
                                                <option key={o.key} value={o.key}>{o.label}</option>
                                            ))}
                                        </select>

                                        <button type="button"
                                            onClick={handleSwapSlots}
                                            disabled={!swapSlotAKey || !swapSlotBKey}
                                            className={`px-3 py-2 rounded-xl font-black border text-xs ${(!swapSlotAKey || !swapSlotBKey) ? 'border-slate-200 bg-white opacity-50 cursor-not-allowed' : 'border-slate-300 bg-slate-900 text-white'}`}
                                        >
                                            Scambia
                                        </button>
                                    </div>

                                    {swapSlotOptions.length > 0 && (
                                        <div className="mt-3">
                                            <div className="text-[11px] font-black text-slate-700/80">{t('monitor_bracket_move_bar')}</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {swapSlotOptions.map(o => {
                                                    const info = slotLabelForKey(o.key);
                                                    const isA = swapSlotAKey === o.key;
                                                    const isB = swapSlotBKey === o.key;
                                                    const active = isA || isB;
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={o.key}
                                                            onClick={() => {
                                                                if (slotPickMode !== 'swap') setSlotPickModeWithReset('swap');

                                                                if (!swapSlotAKey || swapSlotAKey === o.key) {
                                                                    setSwapSlotAKey(o.key);
                                                                    setSwapSlotBKey('');
                                                                    setFocusSlotKeys([o.key]);
                                                                    setManualEditMsg(t('monitor_bracket_slot1_selected_choose_slot2'));
                                                                    scrollToBracketCanvas();
                                                                    return;
                                                                }

                                                                if (!swapSlotBKey && swapSlotAKey !== o.key) {
                                                                    setSwapSlotBKey(o.key);
                                                                    setFocusSlotKeys([swapSlotAKey, o.key]);
                                                                    setManualEditMsg(t('monitor_bracket_slot2_selected_press_swap'));
                                                                    scrollToBracketCanvas();
                                                                    return;
                                                                }

                                                                setSwapSlotAKey(o.key);
                                                                setSwapSlotBKey('');
                                                                setFocusSlotKeys([o.key]);
                                                                setManualEditMsg(t('monitor_bracket_selection_reset'));
                                                                scrollToBracketCanvas();
                                                            }}
                                                            className={`px-2 py-1 rounded-full border text-xs font-black ${
                                                                isA
                                                                    ? 'border-beer-600 bg-beer-600 text-white'
                                                                    : (isB ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white hover:bg-slate-50')
                                                            }`}
                                                            title={info.full}
                                                        >
                                                            {info.short}
                                                            {(isA || isB) && <span className="ml-1 opacity-90">{isA ? '1' : '2'}</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <div className="text-[11px] font-bold text-slate-700/70 mt-2">
                                        {t('monitor_bracket_only_round1_move_desc')}
                                    </div>
                                </div>

                                <div className="bg-white border border-slate-200 rounded-xl p-3">
                                    <div className="text-xs font-black text-slate-700/80">
                                        {t('monitor_bracket_regenerate_new_preliminaries')}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button type="button"
                                            onClick={handleRebuildEliminationBracketRandom}
                                            disabled={!state.tournament || state.tournament.type !== 'elimination'}
                                            className={`px-3 py-2 rounded-xl font-black border text-xs ${(!state.tournament || state.tournament.type !== 'elimination') ? 'border-slate-200 bg-white opacity-50 cursor-not-allowed' : 'border-slate-300 bg-slate-900 text-white'}`}
                                            title={(state.tournament && state.tournament.type !== 'elimination') ? 'Disponibile solo per tornei "Solo Eliminazione Diretta"' : ''}
                                        >
                                            {t('monitor_bracket_regenerate_random_button')}
                                        </button>
                                        <button type="button"
                                            onClick={handleRebuildEliminationBracketPreserve}
                                            disabled={!state.tournament || state.tournament.type !== 'elimination'}
                                            className={`px-3 py-2 rounded-xl font-black border text-xs ${(!state.tournament || state.tournament.type !== 'elimination') ? 'border-slate-200 bg-white opacity-50 cursor-not-allowed' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-900'}`}
                                            title={(state.tournament && state.tournament.type !== 'elimination') ? 'Disponibile solo per tornei "Solo Eliminazione Diretta"' : ''}
                                        >
                                            {t('monitor_bracket_regenerate_keep_button')}
                                        </button>
                                        <div className="text-[11px] font-bold text-slate-700/70">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${integrity.bracketLocked ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                                                    {integrity.bracketLocked ? 'BLOCCATO' : 'OK'}
                                                </span>
                                                <span>
                                                    {t('monitor_bracket_regeneration_allowed_only_unstarted')}
                                                </span>
                                            </div>
                                            <div className="mt-1">
                                                <span className="font-black">{t('monitor_bracket_random_label')}</span>: {t('monitor_bracket_random_desc')}
                                                <span className="mx-1">•</span>
                                                <span className="font-black">{t('monitor_bracket_keep_structure_label')}</span>: {t('monitor_bracket_keep_structure_desc')}
                                            </div>
                                            <div className="mt-1">{t('monitor_bracket_tbd_no_autoadvance_prefix')} <span className="font-black">{t('tbd_label')}</span> {t('monitor_bracket_tbd_no_autoadvance_suffix')}</div>
                                        </div>
                                    </div>
                                </div>
                                </div>
                            </details>
                        )}
					</div>
				)}

                    </div>
                )}

	                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs font-black text-slate-500 uppercase tracking-wide">
                            Zoom tabellone
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button"
                                onClick={() => setBracketZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
                                className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                title={t('monitor_bracket_zoom_out')}
                                aria-label={t('monitor_bracket_zoom_out_title')}
                            >
                                −
                            </button>
                            <button type="button"
                                onClick={() => setBracketZoom(1)}
                                className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                title={t('reset')}
                                aria-label={t('monitor_bracket_zoom_reset_title')}
                            >
                                {Math.round(bracketZoom * 100)}%
                            </button>
                            <button type="button"
                                onClick={() => setBracketZoom(z => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}
                                className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                title={t('monitor_bracket_zoom_in')}
                                aria-label={t('monitor_bracket_zoom_in_title')}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="overflow-auto" ref={bracketCanvasRef}>
                        <TournamentBracket
                            teams={state.teams || []}
                            data={state.tournament}
                            matches={state.tournamentMatches || []}
                            onUpdate={handleUpdateLiveMatch}
                            scale={bracketZoom}
                            showConnectors={true}
                            onMatchClick={(m) => openReportFromCodes(m.id)}
                            wrapTeamNames={true}
                            showByeSlots={manualEditMode}
                            participantSelectionMode={manualEditMode}
                            onParticipantClick={handleBracketParticipantClick}
                            highlightedSlotKeys={(() => {
                                const selected = manualEditMode
                                    ? (slotPickMode === 'insert'
                                        ? (replaceByeSlotKey ? [replaceByeSlotKey] : [])
                                        : [swapSlotAKey, swapSlotBKey].filter(Boolean))
                                    : [];

                                // When a non-included team is selected for insert but no slot is yet chosen,
                                // highlight all available "slot libero" targets to guide the operator.
                                const guide = (manualEditMode && slotPickMode === 'insert' && replaceByeTeamId && !replaceByeSlotKey)
                                    ? allByeSlotKeys
                                    : focusSlotKeys;

                                return Array.from(new Set([...(selected || []), ...(guide || [])]));
                            })()}
                            invalidSlotKeys={manualEditMode ? manualEditValidation.invalidSlotKeys : []}
                            draggingSlotKey={dragPayload?.kind === 'slot' ? dragPayload.slotKey : undefined}
                            dropTargetSlotKey={dropTargetSlotKey}
                            inlineEditSlotKey={inlineSlotEditor?.slotKey}
                            inlineEditValue={inlineSlotEditor?.currentTeamId}
                            inlineEditOptions={inlineSlotEditor?.options}
                            onInlineEditChange={inlineSlotEditor ? handleInlineEditChange : undefined}
                            onParticipantDragStart={handleBracketSlotDragStart}
                            onParticipantDragEnter={handleBracketSlotDragEnter}
                            onParticipantDrop={handleBracketSlotDrop}
                            onParticipantDragEnd={clearBracketDragState}
                        />
                    </div>
                </div>

                {(() => {
                    // BYE matches are present in data but must remain invisible in UI (no referto, no controls).
                    const msAll = [...(state.tournamentMatches || [])]
                        .filter(m => !((m as any).hidden || m.hidden))
                        .filter(m => !((m as any).isBye || m.isBye))
                        .filter(m => {
                            const ids = getMatchParticipantIds(m);
                            return !ids.some(id => String(id || '').trim().toUpperCase() === 'BYE');
                        })
                        .sort(sortByOrderIndexSafe);
                    const playing = (queryNorm ? msAll.filter(matchMatchesQuery) : msAll).filter(m => m.status === 'playing');
                    const scheduled = (queryNorm ? msAll.filter(matchMatchesQuery) : msAll).filter(m => m.status === 'scheduled');
                    const finished = (queryNorm ? msAll.filter(matchMatchesQuery) : msAll).filter(m => m.status === 'finished');

                    const Section = ({ title, items }: { title: string; items: Match[] }) => (
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <div className="bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between">
                                <span>{title}</span>
                                <span className="text-xs font-mono font-bold text-white/70">{items.length}</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {items.map(m => {
                                    const label = m.code ? m.code : m.id;
                                    const ids = getMatchParticipantIds(m);
                                    const hasPlaceholder = ids.some(id => isPlaceholderTeamId(id));
                                    const names = ids.map(id => getTeamName(id));
                                    const isMulti = ids.length >= 3;
                                    const teamsLabel = isMulti ? names.join(' vs ') : `${names[0] || t('tbd_label')} vs ${names[1] || t('tbd_label')}`;
                                    const where = m.phase === 'groups'
                                        ? (m.groupName ? t('monitor_groups_group_label').replace('{name}', m.groupName) : t('groups_label'))
                                        : (m.roundName || (m.round ? t('round_n').replace('{n}', String(m.round)) : t('editor_target_bracket')));
                                    const canToggle = m.status !== 'finished';
                                    const toggleDisabled = hasPlaceholder;
                                    const canReport = !hasPlaceholder;
                                    const toggleLabel = m.status === 'playing' ? t('pause') : t('start_live');
                                    const scoreLabel = formatMatchScoreLabel(m);

                                    return (
                                        <div
                                            key={m.id}
                                            onClick={() => {
                                                if (m.status === 'finished' && !hasPlaceholder) {
                                                    openReportFromCodes(m.id);
                                                }
                                            }}
                                            className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer ${m.status === 'playing' ? 'bg-emerald-50' : m.status === 'finished' ? 'bg-rose-50' : 'bg-white'} hover:brightness-95`}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-black text-slate-900 flex items-center gap-2 min-w-0 flex-wrap">
                                                    <span className="font-mono text-xs text-slate-500">{label}</span>
                                                    {m.isTieBreak && (
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${isMulti ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                            {t('tiebreak_label').toUpperCase()}{isMulti ? ' MULTI' : ''}{typeof m.targetScore === 'number' ? ` a ${m.targetScore}` : ''}
                                                        </span>
                                                    )}

                                                    <span className="whitespace-normal break-words">{teamsLabel}</span>
                                                </div>
                                                <div className="text-xs font-bold text-slate-500 mt-1">{where}</div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-mono font-black text-slate-700 text-xs">{scoreLabel}</span>
                                                {canToggle && (
                                                    <button type="button"
                                                        disabled={toggleDisabled}
                                                        title={toggleDisabled ? t('monitor_bracket_unavailable_until_tbd_resolved') : undefined}
                                                        onClick={(e) => { e.stopPropagation(); if (!toggleDisabled) toggleMatchStatus(m.id); }}
                                                        className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {toggleLabel}
                                                    </button>
                                                )}
                                                <button type="button"
                                                    disabled={!canReport}
                                                    title={!canReport ? t('monitor_bracket_unavailable_until_tbd_resolved') : undefined}
                                                    onClick={(e) => { e.stopPropagation(); if (canReport) openReportFromCodes(m.id); }}
                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {t('report_label')}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {!items.length && (
                                    <div className="px-4 py-6 text-center text-slate-400 font-bold">
                                        {t('no_matches_available')}
                                    </div>
                                )}
                            </div>
                        </div>
                    );

                    return (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Section title={t('live_now_label')} items={playing} />
                            <Section title={t('monitor_bracket_to_play')} items={scheduled} />
                            <Section title={t('monitor_bracket_played')} items={finished} />
                        </div>
                    );
                })()}
	            </div>
	        )}
	        </div>
	    );
};
