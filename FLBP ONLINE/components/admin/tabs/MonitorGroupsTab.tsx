import React from 'react';
import { LayoutDashboard, Search, X, Play, Square, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppState } from '../../../services/storageService';
import type { Match, TournamentData } from '../../../types';
import { computeGroupStandings } from '../../../services/groupStandings';
import { getMatchParticipantIds, formatMatchScoreLabel } from '../../../services/matchUtils';
import { buildTournamentStructureSnapshot } from '../../../services/tournamentStructureSelectors';
import { applyStructuralOperation } from '../../../services/tournamentStructureOperations';
import { buildTournamentStructureIntegritySummary } from '../../../services/tournamentStructureIntegrity';
import { useTranslation } from '../../../App';

export interface MonitorGroupsTabProps {
    state: AppState;
    getTeamName: (teamId?: string) => string;
    toggleMatchStatus: (matchId: string) => void;
    openReportFromCodes: (matchId: string) => void;
    handleUpdateTournamentAndMatches: (tournament: TournamentData, matches: Match[]) => void;
    openTournamentEditor: (view?: 'groups' | 'bracket') => void;
}

const ALL_GROUPS = '__ALL__';

export const MonitorGroupsTab: React.FC<MonitorGroupsTabProps> = ({
    state,
    getTeamName,
    toggleMatchStatus,
    openReportFromCodes,
    handleUpdateTournamentAndMatches,
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

    const allGroups = state.tournament?.groups || [];
    const [selectedGroup, setSelectedGroup] = React.useState<string>(ALL_GROUPS);

    // Click-to-fix helpers: highlight a team inside group tables when selected from the integrity panel.
    const [focusTeamId, setFocusTeamId] = React.useState<string>('');
    const toGroupDomId = React.useCallback((name: string) => {
        return `group-card-${String(name || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }, []);

    const [query, setQuery] = React.useState<string>('');

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

    const queryNorm = query.trim().toLowerCase();

    const matchMatchesQuery = React.useCallback((m: Match) => {
        if (!queryNorm) return true;
        const code = ((m.code || m.id || '') + '').toLowerCase();
        const group = ((m.groupName || '') + '').toLowerCase();
        if (code.includes(queryNorm) || group.includes(queryNorm)) return true;
        const ids = getMatchParticipantIds(m);
        for (const id of ids) {
            const name = ((getTeamName(id) || id || '') + '').toLowerCase();
            if (name.includes(queryNorm)) return true;
        }
        return false;
    }, [queryNorm, getTeamName]);

    const openGroupTieBreaks = React.useMemo(() => {
        const ms = (state.tournamentMatches || [])
            .filter(m => m.phase === 'groups' && !m.hidden && !m.isBye)
            .filter(m => !getMatchParticipantIds(m).some(id => (id || '').trim().toUpperCase() === 'BYE'))
            .filter(m => m.isTieBreak)
            .filter(m => m.status !== 'finished');
        return ms.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }, [state.tournamentMatches]);

    // Se cambia il torneo (o cambiano i gironi), evita selezioni "orfane"
    React.useEffect(() => {
        if (selectedGroup === ALL_GROUPS) return;
        const stillExists = allGroups.some(g => g.name === selectedGroup);
        if (!stillExists) setSelectedGroup(ALL_GROUPS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allGroups.map(g => g.name).join('|')]);

    const visibleGroups = selectedGroup === ALL_GROUPS ? allGroups : allGroups.filter(g => g.name === selectedGroup);

    const matchesByGroup = React.useMemo(() => {
        const groupMatchesAll = (state.tournamentMatches || [])
            .filter(m => m.phase === 'groups' && !m.hidden && !m.isBye)
            .filter(m => !getMatchParticipantIds(m).some(id => (id || '').trim().toUpperCase() === 'BYE'))
            .filter(m => m.teamAId !== 'BYE' && m.teamBId !== 'BYE')
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

        const byGroup = new Map<string, Match[]>();
        groupMatchesAll.forEach(m => {
            const k = m.groupName || '—';
            const arr = byGroup.get(k);
            if (arr) arr.push(m);
            else byGroup.set(k, [m]);
        });
        return byGroup;
    }, [state.tournamentMatches]);

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
            integrity.unknown.length > 0
        );
    }, [integrity]);

    const selectedGroupConcluded = React.useMemo(() => {
        if (!integrity) return false;
        if (selectedGroup === ALL_GROUPS) return false;
        return integrity.concludedGroups.includes(selectedGroup);
    }, [integrity, selectedGroup]);

    const selectedGroupObj = React.useMemo(() => {
        if (selectedGroup === ALL_GROUPS) return null;
        return allGroups.find(g => g.name === selectedGroup) || null;
    }, [allGroups, selectedGroup]);

    const groupsManualEditDisabledReason = React.useMemo(() => {
        if (!state.tournament) return t('monitor_groups_disabled_no_live');
        if (selectedGroup === ALL_GROUPS) return t('monitor_groups_disabled_select_group');
        if (!selectedGroupObj) return t('monitor_groups_disabled_group_not_found');
        if (selectedGroupObj.stage === 'final') return t('monitor_groups_disabled_final_not_editable');
        if (selectedGroupConcluded) return t('monitor_groups_disabled_group_concluded').replace('{name}', selectedGroup);
        return '';
    }, [state.tournament, selectedGroup, selectedGroupObj, selectedGroupConcluded]);

    const canManualEditGroupsNow = !!state.tournament && !groupsManualEditDisabledReason;

    const availableTeamsToAdd = React.useMemo(() => {
        if (!integrity) return [] as string[];
        return (integrity.excluded || []).filter(id => !isPlaceholderTeamId(id));
    }, [integrity, isPlaceholderTeamId]);

    const groupStartedByName = React.useMemo(() => {
        const map = new Map<string, boolean>();
        for (const g of (allGroups || [])) {
            const ms = (matchesByGroup.get(g.name) || []);
            const started = ms.some(m => m.status !== 'scheduled' || m.played || m.isTieBreak);
            map.set(g.name, started);
        }
        return map;
    }, [allGroups, matchesByGroup]);

    const teamsInSelectedGroup = React.useMemo(() => {
        if (!selectedGroupObj) return [] as string[];
        return (selectedGroupObj.teams || [])
            .filter(t => !t.hidden && !t.isBye)
            .map(t => t.id)
            .filter(id => !isPlaceholderTeamId(id));
    }, [selectedGroupObj, isPlaceholderTeamId]);

    const availableTargetGroups = React.useMemo(() => {
        if (!integrity || !selectedGroupObj) return [] as string[];
        return (allGroups || [])
            .filter(g => g.id !== selectedGroupObj.id)
            .filter(g => g.stage !== 'final')
            .filter(g => !integrity.concludedGroups.includes(g.name))
            .map(g => g.name);
    }, [integrity, selectedGroupObj, allGroups]);

    const standingsByGroup = React.useMemo(() => {
        const map = new Map<string, ReturnType<typeof computeGroupStandings>>();
        for (const g of visibleGroups) {
            const ms = (matchesByGroup.get(g.name) || []).slice().sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            map.set(g.name, computeGroupStandings({ teams: (g.teams || []), matches: ms }));
        }
        return map;
    }, [visibleGroups, matchesByGroup]);

    const [manualEditMode, setManualEditMode] = React.useState<boolean>(false);

    // Inline replace (dropdown) directly inside group standings (manual edit only).
    const [inlineEditTeamId, setInlineEditTeamId] = React.useState<string>('');

    const [addTeamToGroupId, setAddTeamToGroupId] = React.useState<string>('');
    const [moveTeamFromGroupId, setMoveTeamFromGroupId] = React.useState<string>('');
    const [moveTeamToGroupName, setMoveTeamToGroupName] = React.useState<string>('');

    const [swapTeamFromSelectedId, setSwapTeamFromSelectedId] = React.useState<string>('');
    const [swapTargetGroupName, setSwapTargetGroupName] = React.useState<string>('');
    const [swapTeamFromTargetId, setSwapTeamFromTargetId] = React.useState<string>('');

    const [manualEditMsg, setManualEditMsg] = React.useState<string>('');
    const [groupDragPayload, setGroupDragPayload] = React.useState<null | { kind: 'excluded'; teamId: string } | { kind: 'selected'; teamId: string }>(null);
    const [groupDropTarget, setGroupDropTarget] = React.useState<string>('');
    const [pendingGroupDndAction, setPendingGroupDndAction] = React.useState<null | { type: 'add'; teamId: string } | { type: 'move'; teamId: string; targetGroupName: string } | { type: 'swap'; teamId: string; targetGroupName: string; targetTeamId: string }>(null);

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

    const validateGroupsIntegrity = React.useCallback(() => {
        if (!state.tournament) return { ok: false as const, msg: t('alert_no_live_active') };
        if (!integrity) return { ok: false as const, msg: t('monitor_groups_integrity_unavailable') };

        // Placeholders inside groups (TBD/BYE/empty) should never be considered valid.
        const placeholders: Array<{ groupName: string; teamId: string }> = [];
        for (const g of (state.tournament.groups || [])) {
            for (const t of (g.teams || [])) {
                const id = (t.id || '').trim();
                if (!id) continue;
                if (isPlaceholderTeamId(id)) placeholders.push({ groupName: g.name, teamId: id });
            }
        }

        if (placeholders.length) {
            const first = placeholders[0];
            return {
                ok: false as const,
                msg: t('monitor_groups_placeholders_present').replace('{example}', first.teamId)
            };
        }

        if (integrity.rosterDuplicates?.length) {
            return {
                ok: false as const,
                msg: t('monitor_groups_roster_duplicates').replace('{count}', String(integrity.rosterDuplicates.length))
            };
        }
        if (integrity.duplicatesInGroups?.length) {
            const id = integrity.duplicatesInGroups[0];
            const groups = (integrity.groupDupGroups?.[id] || []);
            return {
                ok: false as const,
                msg: t('monitor_groups_duplicates_in_groups').replace('{team}', getTeamName(id) || id).replace('{groups}', groups.length ? ` (${t('in_label')}: ${groups.join(', ')})` : '') ,
                focus: { type: 'dup' as const, teamId: id, groupName: groups[0] }
            };
        }
        if (integrity.excluded?.length) {
            const id = integrity.excluded[0];
            return {
                ok: true as const,
                requiresExcludedConfirm: true as const,
                msg: t('monitor_groups_excluded_warning').replace('{count}', String(integrity.excluded.length)).replace('{example}', getTeamName(id) || id),
                focus: { type: 'excluded' as const, teamId: id }
            };
        }
        if (integrity.unknown?.length) {
            const id = integrity.unknown[0];
            return {
                ok: false as const,
                msg: t('monitor_groups_unknown_in_groups').replace('{team}', getTeamName(id) || id),
                focus: { type: 'unknown' as const, teamId: id }
            };
        }

        return { ok: true as const, msg: t('monitor_groups_changes_ok') };
    }, [state.tournament, integrity, isPlaceholderTeamId, getTeamName]);

    const clearFocusAndSelections = React.useCallback(() => {
        setFocusTeamId('');
        setManualEditMsg('');
        setAddTeamToGroupId('');
        setMoveTeamFromGroupId('');
        setMoveTeamToGroupName('');
        setSwapTeamFromSelectedId('');
        setSwapTargetGroupName('');
        setSwapTeamFromTargetId('');
        setGroupDragPayload(null);
        setGroupDropTarget('');
        setPendingGroupDndAction(null);
    }, []);

    const prevManualEditModeRef = React.useRef<boolean>(manualEditMode);

    React.useEffect(() => {
        // When exiting manual edit, clear any pending selections/highlights.
        if (prevManualEditModeRef.current && !manualEditMode) {
            clearFocusAndSelections();
        }
        prevManualEditModeRef.current = manualEditMode;
    }, [manualEditMode, clearFocusAndSelections]);

    const firstEditableGroupName = React.useMemo(() => {
        const concluded = new Set<string>(integrity?.concludedGroups || []);
        for (const g of (allGroups || [])) {
            if (g.stage === 'final') continue;
            if (concluded.has(g.name)) continue;
            return g.name;
        }
        return '';
    }, [allGroups, integrity?.concludedGroups]);

    const scrollToGroupCard = React.useCallback((groupName: string) => {
        const id = toGroupDomId(groupName);
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [toGroupDomId]);

    const focusExcludedTeam = React.useCallback((teamId: string) => {
        const id = (teamId || '').trim();
        if (!id) return;

        setFocusTeamId(id);
        setAddTeamToGroupId(id);

        const targetGroup = (selectedGroup !== ALL_GROUPS && selectedGroup) ? selectedGroup : firstEditableGroupName;
        if (targetGroup) {
            setSelectedGroup(targetGroup);
        }

        // Ensure manual edit can re-enable after group selection updates.
        setTimeout(() => {
            setManualEditMode(true);
            setManualEditMsg(t('monitor_groups_selected_excluded_team').replace('{team}', getTeamName(id) || id));
            if (targetGroup) scrollToGroupCard(targetGroup);
        }, 0);
    }, [firstEditableGroupName, getTeamName, scrollToGroupCard, selectedGroup]);

    const focusTeamInGroup = React.useCallback((teamId: string, groupName?: string, msg?: string) => {
        const id = (teamId || '').trim();
        if (!id) return;

        setFocusTeamId(id);
        const gName = (groupName || '').trim();
        if (gName) setSelectedGroup(gName);

        setTimeout(() => {
            if (msg) setManualEditMsg(msg);
            if (gName) scrollToGroupCard(gName);
        }, 0);
    }, [scrollToGroupCard]);

    const handleValidateAndSaveGroups = React.useCallback(() => {
        setManualEditMsg('');
        const res = validateGroupsIntegrity();
        if (res.ok && !(res as any).requiresExcludedConfirm) {
            setManualEditMode(false);
            setTimeout(() => setManualEditMsg(t('monitor_groups_changes_saved')), 0);
            return;
        }

        if (res.ok && (res as any).requiresExcludedConfirm) {
            const confirmed = window.confirm(`${res.msg}\n\n${t('monitor_groups_confirm_leave_out')}`);
            if (confirmed) {
                setManualEditMode(false);
                setTimeout(() => setManualEditMsg(t('monitor_groups_changes_closed_excluded_confirmed')), 0);
                return;
            }
        }

        // Keep manual edit on and guide the user to fix.
        setManualEditMode(true);
        setManualEditMsg(res.msg);

        const focus = (res as any).focus as (undefined | { type: 'dup' | 'excluded' | 'unknown'; teamId: string; groupName?: string });
        if (focus?.type === 'excluded') {
            focusExcludedTeam(focus.teamId);
        } else if (focus?.type === 'dup') {
            focusTeamInGroup(focus.teamId, focus.groupName, res.msg);
        } else if (focus?.type === 'unknown') {
            focusTeamInGroup(focus.teamId, undefined, res.msg);
        }
    }, [validateGroupsIntegrity, focusExcludedTeam, focusTeamInGroup]);

    React.useEffect(() => {
        // Guard rail: do not allow manual edits if not eligible.
        if (!canManualEditGroupsNow && manualEditMode) setManualEditMode(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManualEditGroupsNow]);

    React.useEffect(() => {
        // Close any inline dropdown when leaving manual edit or switching group filter.
        if (!manualEditMode) setInlineEditTeamId('');
    }, [manualEditMode]);

    React.useEffect(() => {
        setInlineEditTeamId('');
    }, [selectedGroup]);

    React.useEffect(() => {
        // keep swap selections coherent
        if (!swapTargetGroupName) {
            if (swapTeamFromTargetId) setSwapTeamFromTargetId('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [swapTargetGroupName]);

    const teamsInTargetGroupForSwap = React.useMemo(() => {
        if (!state.tournament) return [] as string[];
        const g = (state.tournament.groups || []).find(gg => gg.name === swapTargetGroupName);
        if (!g) return [] as string[];
        return (g.teams || [])
            .filter(t => !t.hidden && !t.isBye)
            .map(t => t.id)
            .filter(id => !isPlaceholderTeamId(id));
    }, [state.tournament, swapTargetGroupName, isPlaceholderTeamId]);

    const applyLegacyStructuralOperation = React.useCallback((operation: Parameters<typeof applyStructuralOperation>[1], successMessage?: string) => {
        if (!structureSnapshot) {
            setManualEditMsg(t('alert_no_live_active'));
            return false;
        }
        const result = applyStructuralOperation(structureSnapshot, operation);
        if (!result.ok || !result.nextSnapshot) {
            setManualEditMsg(result.check.humanMessage || t('operation_not_allowed'));
            return false;
        }
        handleUpdateTournamentAndMatches(result.nextSnapshot.tournament, result.nextSnapshot.matches);
        setManualEditMsg(successMessage || result.entry?.message || result.check.humanMessage);
        return true;
    }, [structureSnapshot, handleUpdateTournamentAndMatches]);

    const handleAddTeamToSelectedGroup = React.useCallback(() => {
        setManualEditMsg('');
        if (!state.tournament) return;
        if (!selectedGroupObj) {
            setManualEditMsg(t('monitor_groups_group_not_found'));
            return;
        }
        if (groupsManualEditDisabledReason) {
            setManualEditMsg(groupsManualEditDisabledReason);
            return;
        }
        const teamId = (addTeamToGroupId || '').trim();
        if (!teamId) {
            setManualEditMsg(t('monitor_groups_select_team_to_add'));
            return;
        }
        if (isPlaceholderTeamId(teamId)) {
            setManualEditMsg(t('monitor_groups_cannot_add_placeholder'));
            return;
        }

        const teamToAdd = (tournamentTeams || []).find(t => t.id === teamId);
        if (!teamToAdd) {
            setManualEditMsg(t('monitor_groups_team_not_found_in_roster'));
            return;
        }
        const applied = applyLegacyStructuralOperation({
            type: 'INSERT_TEAM_IN_GROUP',
            teamId,
            groupId: selectedGroupObj.id,
        }, `Aggiunta ${getTeamName(teamToAdd.id)} a ${selectedGroupObj.name}.`);
        if (!applied) return;
        setAddTeamToGroupId('');
    }, [
        state.tournament,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        addTeamToGroupId,
        tournamentTeams,
        isPlaceholderTeamId,
        getTeamName,
        applyLegacyStructuralOperation,
    ]);

    const handleMoveTeamToOtherGroup = React.useCallback(() => {
        setManualEditMsg('');
        if (!state.tournament) return;
        if (!selectedGroupObj) {
            setManualEditMsg(t('monitor_groups_group_not_found'));
            return;
        }
        if (groupsManualEditDisabledReason) {
            setManualEditMsg(groupsManualEditDisabledReason);
            return;
        }

        const teamId = (moveTeamFromGroupId || '').trim();
        const targetGroupName = (moveTeamToGroupName || '').trim();
        if (!teamId) {
            setManualEditMsg(t('monitor_groups_select_team_to_move'));
            return;
        }
        if (!targetGroupName) {
            setManualEditMsg(t('monitor_groups_select_target_group'));
            return;
        }
        if (isPlaceholderTeamId(teamId)) {
            setManualEditMsg(t('monitor_groups_cannot_move_placeholder'));
            return;
        }
        if (targetGroupName === selectedGroupObj.name) {
            setManualEditMsg(t('monitor_groups_target_same_current'));
            return;
        }

        const targetGroupObj = (state.tournament.groups || []).find(g => g.name === targetGroupName) || null;
        if (!targetGroupObj) {
            setManualEditMsg(t('monitor_groups_target_not_found'));
            return;
        }
        if (targetGroupObj.stage === 'final') {
            setManualEditMsg(t('monitor_groups_final_not_editable'));
            return;
        }
        if (integrity?.concludedGroups.includes(targetGroupObj.name)) {
            setManualEditMsg(t('monitor_groups_group_concluded').replace('{name}', targetGroupObj.name));
            return;
        }
        const teamToMove = (tournamentTeams || []).find(t => t.id === teamId);
        if (!teamToMove) {
            setManualEditMsg(t('monitor_groups_team_not_found_in_roster'));
            return;
        }
        const applied = applyLegacyStructuralOperation({
            type: 'MOVE_TEAM_BETWEEN_GROUPS',
            teamId,
            fromGroupId: selectedGroupObj.id,
            toGroupId: targetGroupObj.id,
        }, t('monitor_groups_moved_success').replace('{team}', getTeamName(teamToMove.id)).replace('{from}', selectedGroupObj.name).replace('{to}', targetGroupObj.name));
        if (!applied) return;
        setMoveTeamFromGroupId('');
        setMoveTeamToGroupName('');
    }, [
        state.tournament,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        moveTeamFromGroupId,
        moveTeamToGroupName,
        tournamentTeams,
        isPlaceholderTeamId,
        integrity,
        getTeamName,
        applyLegacyStructuralOperation,
    ]);

    const handleSwapTeamsBetweenGroups = React.useCallback(() => {
        setManualEditMsg('');
        if (!state.tournament) return;
        if (!selectedGroupObj) {
            setManualEditMsg(t('monitor_groups_group_not_found'));
            return;
        }
        if (groupsManualEditDisabledReason) {
            setManualEditMsg(groupsManualEditDisabledReason);
            return;
        }

        const teamAId = (swapTeamFromSelectedId || '').trim();
        const targetGroupName = (swapTargetGroupName || '').trim();
        const teamBId = (swapTeamFromTargetId || '').trim();

        if (!teamAId) {
            setManualEditMsg(t('monitor_groups_select_current_group_team'));
            return;
        }
        if (!targetGroupName) {
            setManualEditMsg(t('monitor_groups_select_group_for_swap'));
            return;
        }
        if (!teamBId) {
            setManualEditMsg(t('monitor_groups_select_target_group_team'));
            return;
        }
        if (isPlaceholderTeamId(teamAId) || isPlaceholderTeamId(teamBId)) {
            setManualEditMsg(t('monitor_groups_cannot_swap_placeholder'));
            return;
        }

        const targetGroupObj = (state.tournament.groups || []).find(g => g.name === targetGroupName) || null;
        if (!targetGroupObj) {
            setManualEditMsg(t('monitor_groups_target_not_found'));
            return;
        }
        if (targetGroupObj.stage === 'final' || selectedGroupObj.stage === 'final') {
            setManualEditMsg(t('monitor_groups_final_not_editable'));
            return;
        }
        if (integrity?.concludedGroups.includes(targetGroupObj.name)) {
            setManualEditMsg(t('monitor_groups_group_concluded').replace('{name}', targetGroupObj.name));
            return;
        }
        const teamA = (tournamentTeams || []).find(t => t.id === teamAId);
        const teamB = (tournamentTeams || []).find(t => t.id === teamBId);
        if (!teamA || !teamB) {
            setManualEditMsg(t('monitor_groups_one_team_missing'));
            return;
        }
        const applied = applyLegacyStructuralOperation({
            type: 'SWAP_GROUP_TEAMS',
            teamAId,
            teamBId,
            groupAId: selectedGroupObj.id,
            groupBId: targetGroupObj.id,
        }, t('monitor_groups_swap_success').replace('{teamA}', getTeamName(teamA.id)).replace('{teamB}', getTeamName(teamB.id)));
        if (!applied) return;
        setSwapTeamFromSelectedId('');
        setSwapTargetGroupName('');
        setSwapTeamFromTargetId('');
    }, [
        state.tournament,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        swapTeamFromSelectedId,
        swapTargetGroupName,
        swapTeamFromTargetId,
        tournamentTeams,
        isPlaceholderTeamId,
        integrity,
        getTeamName,
        applyLegacyStructuralOperation,
    ]);

    React.useEffect(() => {
        if (!pendingGroupDndAction) return;
        const action = pendingGroupDndAction;
        setPendingGroupDndAction(null);

        if (action.type === 'add') {
            handleAddTeamToSelectedGroup();
            return;
        }
        if (action.type === 'move') {
            handleMoveTeamToOtherGroup();
            return;
        }
        if (action.type === 'swap') {
            handleSwapTeamsBetweenGroups();
        }
    }, [pendingGroupDndAction, handleAddTeamToSelectedGroup, handleMoveTeamToOtherGroup, handleSwapTeamsBetweenGroups]);

    const clearGroupDragState = React.useCallback(() => {
        setGroupDragPayload(null);
        setGroupDropTarget('');
    }, []);

    const handleExcludedTeamDragStart = React.useCallback((teamId: string) => {
        if (!manualEditMode) return;
        setGroupDragPayload({ kind: 'excluded', teamId });
        setGroupDropTarget('');
        setManualEditMsg(t('monitor_groups_drag_add').replace('{team}', getTeamName(teamId) || teamId));
    }, [manualEditMode, getTeamName]);

    const handleSelectedTeamDragStart = React.useCallback((teamId: string) => {
        if (!manualEditMode) return;
        setGroupDragPayload({ kind: 'selected', teamId });
        setGroupDropTarget('');
        setManualEditMsg(t('monitor_groups_drag_move_or_swap').replace('{team}', getTeamName(teamId) || teamId));
    }, [manualEditMode, getTeamName]);

    const queueGroupAddDrop = React.useCallback((teamId: string) => {
        setAddTeamToGroupId(teamId);
        setPendingGroupDndAction({ type: 'add', teamId });
    }, []);

    const queueGroupMoveDrop = React.useCallback((teamId: string, targetGroupName: string) => {
        setMoveTeamFromGroupId(teamId);
        setMoveTeamToGroupName(targetGroupName);
        setPendingGroupDndAction({ type: 'move', teamId, targetGroupName });
    }, []);

    const queueGroupSwapDrop = React.useCallback((teamId: string, targetGroupName: string, targetTeamId: string) => {
        setSwapTeamFromSelectedId(teamId);
        setSwapTargetGroupName(targetGroupName);
        setSwapTeamFromTargetId(targetTeamId);
        setPendingGroupDndAction({ type: 'swap', teamId, targetGroupName, targetTeamId });
    }, []);

    const handleGroupAddTargetDragEnter = React.useCallback(() => {
        if (!manualEditMode || !selectedGroupObj || groupDragPayload?.kind !== 'excluded') return;
        setGroupDropTarget(`add:${selectedGroupObj.name}`);
    }, [manualEditMode, selectedGroupObj, groupDragPayload]);

    const handleGroupAddTargetDrop = React.useCallback(() => {
        if (!manualEditMode || !selectedGroupObj || groupDragPayload?.kind !== 'excluded') return;
        queueGroupAddDrop(groupDragPayload.teamId);
        clearGroupDragState();
    }, [manualEditMode, selectedGroupObj, groupDragPayload, queueGroupAddDrop, clearGroupDragState]);

    const handleGroupMoveTargetDragEnter = React.useCallback((targetGroupName: string) => {
        if (!manualEditMode || !targetGroupName || groupDragPayload?.kind !== 'selected') return;
        setGroupDropTarget(`move:${targetGroupName}`);
    }, [manualEditMode, groupDragPayload]);

    const handleGroupMoveTargetDrop = React.useCallback((targetGroupName: string) => {
        if (!manualEditMode || !targetGroupName || groupDragPayload?.kind !== 'selected') return;
        queueGroupMoveDrop(groupDragPayload.teamId, targetGroupName);
        clearGroupDragState();
    }, [manualEditMode, groupDragPayload, queueGroupMoveDrop, clearGroupDragState]);

    const handleGroupSwapTargetDragEnter = React.useCallback((targetGroupName: string, targetTeamId: string) => {
        if (!manualEditMode || !targetGroupName || !targetTeamId || groupDragPayload?.kind !== 'selected') return;
        setSwapTargetGroupName(targetGroupName);
        setGroupDropTarget(`swap:${targetGroupName}:${targetTeamId}`);
    }, [manualEditMode, groupDragPayload]);

    const handleGroupSwapTargetDrop = React.useCallback((targetGroupName: string, targetTeamId: string) => {
        if (!manualEditMode || !targetGroupName || !targetTeamId || groupDragPayload?.kind !== 'selected') return;
        queueGroupSwapDrop(groupDragPayload.teamId, targetGroupName, targetTeamId);
        clearGroupDragState();
    }, [manualEditMode, groupDragPayload, queueGroupSwapDrop, clearGroupDragState]);

    const handleInlineReplaceTeamInSelectedGroup = React.useCallback((oldTeamId: string, nextTeamIdRaw: string) => {
        setManualEditMsg('');
        if (!state.tournament) return;
        if (!selectedGroupObj) {
            setManualEditMsg(t('monitor_groups_group_not_found'));
            return;
        }
        if (groupsManualEditDisabledReason) {
            setManualEditMsg(groupsManualEditDisabledReason);
            return;
        }

        const oldId = (oldTeamId || '').trim();
        if (!oldId) return;
        if (isPlaceholderTeamId(oldId)) {
            setManualEditMsg(t('monitor_groups_cannot_edit_placeholder'));
            return;
        }

        const raw = (nextTeamIdRaw || '').trim();
        const clear = raw === '__EMPTY__' || raw === '';
        const nextTeamId = clear ? '' : raw;
        if (!nextTeamId) {
            setManualEditMsg(t('monitor_groups_direct_remove_moved'));
            openTournamentEditor('groups');
            return;
        }
        if (isPlaceholderTeamId(nextTeamId)) {
            setManualEditMsg(t('monitor_groups_cannot_insert_placeholder'));
            return;
        }

        const newLabel = getTeamName(nextTeamId) || nextTeamId;
        const applied = applyLegacyStructuralOperation({
            type: 'REPLACE_GROUP_TEAM',
            oldTeamId: oldId,
            newTeamId: nextTeamId,
            groupId: selectedGroupObj.id,
        }, `Sostituita ${getTeamName(oldId) || oldId} → ${newLabel} in girone ${selectedGroupObj.name}.`);
        if (!applied) return;

        setInlineEditTeamId('');
        setMoveTeamFromGroupId('');
        setMoveTeamToGroupName('');
        setSwapTeamFromSelectedId('');
        setSwapTargetGroupName('');
        setSwapTeamFromTargetId('');
    }, [
        state.tournament,
        selectedGroupObj,
        groupsManualEditDisabledReason,
        isPlaceholderTeamId,
        getTeamName,
        applyLegacyStructuralOperation,
        openTournamentEditor,
    ]);


    const searchStats = React.useMemo(() => {
        if (!state.tournament) return { total: 0, filtered: 0 };
        const groups = selectedGroup === ALL_GROUPS ? allGroups : allGroups.filter(g => g.name === selectedGroup);
        let total = 0;
        let filtered = 0;
        for (const g of groups) {
            const msAll = (matchesByGroup.get(g.name) || []);
            total += msAll.length;
            filtered += (queryNorm ? msAll.filter(matchMatchesQuery).length : msAll.length);
        }
        return { total, filtered };
    }, [state.tournament, selectedGroup, allGroups, matchesByGroup, queryNorm, matchMatchesQuery]);

    // Lightweight Admin UI tokens (local): keeps toolbar controls consistent with other tabs.
    const toolbarInput =
        'w-64 max-w-full pl-9 pr-9 px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const toolbarSelect =
        'px-3 py-2.5 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnSecondarySm =
        'px-3 py-2.5 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h3 className="text-xl font-black flex items-center gap-2">
                        <LayoutDashboard className="w-5 h-5" /> {t('monitor_groups')}
                    </h3>
                    <div className="text-xs font-bold text-slate-500 mt-1">
                        {t('monitor_groups_quick_search_tip_prefix')} <span className="font-black">{t('monitor_bracket_start_close')}</span> {t('monitor_groups_quick_search_tip_mid')} <span className="font-black">{t('report_label')}</span> {t('monitor_groups_quick_search_tip_suffix')}
                    </div>
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label={t('monitor_groups_toolbar_aria')}>
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('codes_search_placeholder')}
                                aria-label={t('monitor_groups_search_aria')}
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

                        {state.tournament && (allGroups.length > 1) && (
                            <select
                                aria-label={t('monitor_groups_select_group_option')}
                                value={selectedGroup}
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className={toolbarSelect}
                            >
                                <option value={ALL_GROUPS}>{t('monitor_groups_all_groups')}</option>
                                {allGroups.map(g => (
                                    <option key={g.id} value={g.name}>{t('monitor_groups_group_label').replace('{name}', g.name)}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="text-xs font-bold text-slate-500">
                        {t('monitor_live_tournament_label')}: {state.tournament ? t('yes') : t('no')} • {t('groups_label')}: {(state.tournament?.groups || []).length} • {t('match_list')}: {(state.tournamentMatches || []).filter(m => m.phase === 'groups' && !(m as any).hidden && !m.isBye && m.teamAId !== 'BYE' && m.teamBId !== 'BYE').length}
                    </div>
                </div>
            </div>

            {!state.tournament && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                    {t('monitor_no_live_go_structure_confirm')}
                </div>
            )}

            {state.tournament && (
                <>
                    {query.trim() && searchStats.filtered === 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                {t('monitor_no_match_found_for').replace('{query}', `“${query.trim()}”`)}
                                <span className="text-slate-600 font-bold"> {t('monitor_groups_try_code_team_group')}</span>
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
                    {state.tournament.type === 'groups_elimination' && openGroupTieBreaks.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 font-bold">
                            <div className="font-black">{t('monitor_bracket_qualification_blocked_by_tiebreak').replace('{label}', t('tiebreak_label').toUpperCase())}</div>
                            <div className="text-sm font-bold text-amber-900/90 mt-1">
                                {t('monitor_groups_complete_tiebreaks_desc')}
                            </div>
                            <div className="text-xs font-mono font-black text-amber-900/80 mt-2 flex flex-wrap gap-2">
                                {openGroupTieBreaks.slice(0, 8).map(m => (
                                    <span key={m.id} className="px-2 py-1 rounded-full border border-amber-200 bg-white">
                                        {(m.code || m.id)}{m.groupName ? ` (G ${m.groupName})` : ''}
                                    </span>
                                ))}
                                {openGroupTieBreaks.length > 8 && (
                                    <span className="px-2 py-1 rounded-full border border-amber-200 bg-white">
                                        +{openGroupTieBreaks.length - 8}
                                    </span>
                                )}
                            </div>
                        </div>
	                    )}

                        {showLegacyStructuralTools && integrity && (() => {
                            const duplicateUniqueCount = new Set([
                                ...integrity.rosterDuplicates,
                                ...integrity.duplicatesInGroups,
                            ]).size;
                            const issueCount = integrity.excluded.length + duplicateUniqueCount + integrity.unknown.length;
                            const concludedCount = integrity.concludedGroups.length;
                            const totalGroups = (state.tournament?.groups || []).length;

                            return (
                                <button
                                    type="button"
                                    onClick={toggleIntegrityPanel}
                                    aria-expanded={integrityPanelOpen}
                                    aria-controls="monitor-groups-integrity-panel"
                                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border font-bold text-left hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 ${integrityHasIssues ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                    title={integrityPanelOpen ? t('monitor_bracket_hide_integrity_title') : t('monitor_bracket_open_integrity_title')}
                                >
                                    <div>
                                        <div className="font-black">{t('monitor_live_integrity_legacy_title')}</div>
                                        <div className="text-sm font-bold opacity-90 mt-1">
                                            {t('monitor_groups_concluded_label')}: {concludedCount}/{totalGroups}
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
                            <div id="monitor-groups-integrity-panel" className="space-y-4">

{integrity && (() => {
    const hasIssues = (
        integrity.excluded.length > 0 ||
        integrity.rosterDuplicates.length > 0 ||
        integrity.duplicatesInGroups.length > 0 ||
        integrity.unknown.length > 0
    );

    const duplicateUniqueCount = new Set([
        ...integrity.rosterDuplicates,
        ...integrity.duplicatesInGroups,
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
                            : 'OK: tutte le squadre risultano incluse e senza duplicati.'}
                    </div>
                    <div className="text-xs font-bold mt-2 opacity-90">
                        Gironi conclusi: <span className="font-black">{integrity.concludedGroups.length}/{(state.tournament.groups || []).length}</span>
                    </div>
                    <div className="text-[11px] font-bold mt-2 opacity-80">
                        Questo controllo si aggiorna automaticamente e segnala i punti da correggere prima di passare all’Editor Torneo.
                    </div>
                </div>

                {(!!focusTeamId || !!manualEditMsg || !!addTeamToGroupId || !!moveTeamFromGroupId || !!moveTeamToGroupName || !!swapTeamFromSelectedId || !!swapTargetGroupName || !!swapTeamFromTargetId) && (
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

            {integrity.concludedGroups.length > 0 && (
                <div className="text-xs font-mono font-black mt-3 flex flex-wrap gap-2">
                    {integrity.concludedGroups.map(name => (
                        <span key={name} className="px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-800">
                            {t('monitor_groups_group_label').replace('{name}', name)} {t('monitor_groups_concluded_short')}
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-4">
                <div className="text-xs font-black">
                    SQUADRE DA APPLICARE {integrity.excluded.length > 0 ? <>• <span className="font-black">{integrity.excluded.length}</span></> : null}
                </div>
                <div className="text-[11px] font-bold mt-1 opacity-80">
                    {t('monitor_groups_present_in_teams_not_groups').replace('{teams}', t('teams'))}
                    {t('monitor_groups_click_pill_prefill')}
                </div>
                {integrity.excluded.length > 0 ? (
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.excluded.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => focusExcludedTeam(id)}
                                draggable={manualEditMode && canManualEditGroupsNow}
                                onDragStart={manualEditMode && canManualEditGroupsNow ? () => handleExcludedTeamDragStart(id) : undefined}
                                onDragEnd={manualEditMode && canManualEditGroupsNow ? clearGroupDragState : undefined}
                                className="px-2 py-1 rounded-full border border-rose-200 bg-white text-rose-900 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                                title={t('monitor_groups_prefill_insert_title')}
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
                                onClick={() => focusTeamInGroup(id, undefined, `Duplicata in \"Squadre\": ${getTeamName(id) || id}. Verifica che non sia presente più volte.`)}
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
                                    const groups = (integrity.groupDupGroups?.[id] || []);
                                    const first = groups[0];
                                    focusTeamInGroup(id, first, t('monitor_groups_duplicate_highlighted').replace('{team}', getTeamName(id) || id).replace('{group}', first || t('groups_label').toLowerCase()));
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

            {integrity.unknown.length > 0 && (
                <div className="mt-4">
                    <div className="text-xs font-black">{t('monitor_present_in_groups_not_teams')}</div>
                    <div className="mt-2 text-xs font-mono font-black flex flex-wrap gap-2">
                        {integrity.unknown.slice(0, 16).map(id => (
                            <button
                                type="button"
                                key={id}
                                onClick={() => focusTeamInGroup(id, undefined, `Presente nei gironi ma non in \"Squadre\": ${getTeamName(id) || id}.`)}
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
                                        <div className="font-black">{t('monitor_groups_correction_title')}</div>
                                        <div className="text-sm font-bold text-slate-700/90 mt-1">
                                            Seleziona un girone specifico. Puoi correggere i gironi anche in corsa, ma una squadra che ha già iniziato a giocare non può essere spostata.
                                        </div>
                                    </div>
                                <div className="flex items-center gap-2">
                                    {manualEditMode && canManualEditGroupsNow && (
                                        <button
                                            type="button"
                                            onClick={handleValidateAndSaveGroups}
                                            className="px-3 py-2 rounded-xl font-black border border-slate-900 bg-slate-900 text-white hover:brightness-95 text-xs"
                                            title={t('monitor_groups_validate_title')}
                                        >
                                            Salva modifiche
                                        </button>
                                    )}
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
                                                handleValidateAndSaveGroups();
                                            }}
                                            disabled={!canManualEditGroupsNow}
                                        />
                                        <span className="text-sm font-black">{t('enable')}</span>
                                    </label>
                                </div>
                            </div>

                            {!canManualEditGroupsNow && (
                                <div className="text-xs font-bold text-slate-700/80 mt-2">
                                    {groupsManualEditDisabledReason}
                                </div>
                            )}

                            {manualEditMode && canManualEditGroupsNow && (
                                <details className="mt-3 rounded-xl border border-slate-200 bg-white" open={!!manualEditMsg}>
                                    <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-xs font-black text-slate-700/80">{t('edit_tools')}</div>
                                            <div className="text-[11px] font-bold text-slate-700/70 mt-0.5">
                                                Inserimento, spostamento e scambio con click o drag and drop.
                                            </div>
                                        </div>
                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                    </summary>
                                    <div className="border-t border-slate-200 p-3">
                                    {manualEditMsg && (
                                        <div className="mb-2 text-xs font-black text-slate-700/80">
                                            {manualEditMsg}
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="text-xs font-black text-slate-700/80">{t('monitor_groups_quick_move_tools')}</div>
                                        <div className="mt-2">
                                            <div className="text-[11px] font-black text-slate-600">{t('monitor_groups_excluded_not_in_groups')}</div>
                                            <div className="mt-1 flex flex-wrap gap-2">
                                                {availableTeamsToAdd.length === 0 ? (
                                                    <span className="text-xs font-bold text-slate-700/60">{t('none')}</span>
                                                ) : (
                                                    availableTeamsToAdd.slice(0, 24).map(id => {
                                                        const selected = (addTeamToGroupId || '') === id;
                                                        return (
                                                            <button
                                                                key={id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setAddTeamToGroupId(id);
                                                                    setMoveTeamFromGroupId('');
                                                                    setMoveTeamToGroupName('');
                                                                    setSwapTeamFromSelectedId('');
                                                                    setSwapTargetGroupName('');
                                                                    setSwapTeamFromTargetId('');
                                                                    setManualEditMsg(`Selezionata squadra esclusa: ${getTeamName(id) || id}.`);
                                                                }}
                                                                draggable={manualEditMode}
                                                                onDragStart={manualEditMode ? () => handleExcludedTeamDragStart(id) : undefined}
                                                                onDragEnd={manualEditMode ? clearGroupDragState : undefined}
                                                                className={`px-3 py-2 rounded-full text-xs font-black border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'} ${groupDragPayload?.kind === 'excluded' && groupDragPayload.teamId === id ? 'opacity-60 ring-2 ring-slate-400' : ''}`}
                                                            >
                                                                {getTeamName(id) || id}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                                {availableTeamsToAdd.length > 24 && (
                                                    <span className="px-3 py-2 rounded-full text-xs font-black border border-slate-200 bg-white text-slate-700">
                                                        +{availableTeamsToAdd.length - 24}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3">
                                            <div className="text-[11px] font-black text-slate-600">Squadre nel girone {selectedGroupObj?.name}</div>
                                            <div className="mt-1 flex flex-wrap gap-2">
                                                {teamsInSelectedGroup.slice(0, 24).map(id => {
                                                    const selected = (moveTeamFromGroupId || '') === id;
                                                    return (
                                                        <button
                                                            key={id}
                                                            type="button"
                                                            onClick={() => {
                                                                setMoveTeamFromGroupId(id);
                                                                setAddTeamToGroupId('');
                                                                setSwapTeamFromSelectedId('');
                                                                setSwapTargetGroupName('');
                                                                setSwapTeamFromTargetId('');
                                                                setManualEditMsg(`Selezionata: ${getTeamName(id) || id}. Ora scegli un girone di destinazione.`);
                                                            }}
                                                            draggable={manualEditMode}
                                                            onDragStart={manualEditMode ? () => handleSelectedTeamDragStart(id) : undefined}
                                                            onDragEnd={manualEditMode ? clearGroupDragState : undefined}
                                                            className={`px-3 py-2 rounded-full text-xs font-black border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'} ${groupDragPayload?.kind === 'selected' && groupDragPayload.teamId === id ? 'opacity-60 ring-2 ring-slate-400' : ''}`}
                                                        >
                                                            {getTeamName(id) || id}
                                                        </button>
                                                    );
                                                })}
                                                {teamsInSelectedGroup.length > 24 && (
                                                    <span className="px-3 py-2 rounded-full text-xs font-black border border-slate-200 bg-white text-slate-700">
                                                        +{teamsInSelectedGroup.length - 24}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3">
                                            <div className="text-[11px] font-black text-slate-600">{t('monitor_groups_target_group_label')}</div>
                                            <div className="mt-1 flex flex-wrap gap-2 items-center">
                                                {addTeamToGroupId ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleAddTeamToSelectedGroup}
                                                        onDragEnter={(e) => {
                                                            e.preventDefault();
                                                            handleGroupAddTargetDragEnter();
                                                        }}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            handleGroupAddTargetDragEnter();
                                                        }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            handleGroupAddTargetDrop();
                                                        }}
                                                        className={`px-3 py-2 rounded-xl font-black border text-xs ${groupDropTarget === `add:${selectedGroupObj?.name || ''}` ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200' : 'border-slate-900 bg-slate-900 text-white hover:brightness-95'}`}
                                                        title={t('monitor_groups_add_excluded_to_selected_title')}
                                                    >
                                                        {t('monitor_groups_insert_in_group_label').replace('{name}', selectedGroupObj?.name || "")}
                                                    </button>
                                                ) : (
                                                    <>
                                                        {availableTargetGroups.length === 0 ? (
                                                            <span className="text-xs font-bold text-slate-700/60">{t('monitor_groups_no_editable_group')}</span>
                                                        ) : (
                                                            availableTargetGroups.map(name => {
                                                                const selected = (moveTeamToGroupName || '') === name;
                                                                return (
                                                                    <button
                                                                        key={name}
                                                                        type="button"
                                                                        onClick={() => setMoveTeamToGroupName(name)}
                                                                        onDragEnter={(e) => {
                                                                            e.preventDefault();
                                                                            handleGroupMoveTargetDragEnter(name);
                                                                        }}
                                                                        onDragOver={(e) => {
                                                                            e.preventDefault();
                                                                            handleGroupMoveTargetDragEnter(name);
                                                                        }}
                                                                        onDrop={(e) => {
                                                                            e.preventDefault();
                                                                            handleGroupMoveTargetDrop(name);
                                                                        }}
                                                                        className={`px-3 py-2 rounded-full text-xs font-black border ${(selected || groupDropTarget === `move:${name}`) ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                                        title={selected ? t('monitor_groups_selected') : t('monitor_groups_select_destination')}
                                                                    >
                                                                        {t('monitor_groups_group_label').replace('{name}', name)}
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={handleMoveTeamToOtherGroup}
                                                            disabled={!moveTeamFromGroupId || !moveTeamToGroupName}
                                                            className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title={t('monitor_groups_apply_move_title')}
                                                        >
                                                            {t('monitor_groups_move_action')}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                            <div className="text-[11px] font-bold text-slate-700/70 mt-2">
                                                {t('monitor_groups_hint_prefix')} <span className="font-black">{t('save_changes')}</span> {t('monitor_groups_hint_suffix')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-xs font-black text-slate-700/80">
                                        Azioni — {selectedGroupObj?.name}:
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2 items-end">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_excluded_team')}</span>
                                            <select
                                                aria-label={t('monitor_groups_select_excluded_team_aria')}
                                                value={addTeamToGroupId}
                                                onChange={(e) => setAddTeamToGroupId(e.target.value)}
                                                className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]"
                                            >
                                                <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                {availableTeamsToAdd.map(id => (
                                                    <option key={id} value={id}>{getTeamName(id) || id}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <button type="button"
                                            onClick={handleAddTeamToSelectedGroup}
                                            disabled={!addTeamToGroupId || availableTeamsToAdd.length === 0}
                                            className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={availableTeamsToAdd.length === 0 ? t('monitor_groups_no_excluded_available') : t('monitor_groups_add_to_selected_group')}
                                        >
                                            {t('monitor_groups_add_team_to_group')}
                                        </button>
                                    </div>

                                    {availableTeamsToAdd.length === 0 && (
                                        <div className="text-xs font-bold text-slate-700/70 mt-2">
                                            {t('monitor_groups_no_excluded_to_add')}
                                        </div>
                                    )}

                                    <div className="mt-4 border-t border-slate-200 pt-3">
                                        <div className="text-xs font-black text-slate-700/80">
                                            {t('monitor_groups_move_team_other_group')}
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2 items-end">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_team_in_group')}</span>
                                                <select
                                                    aria-label={t('monitor_groups_select_team_to_move')}
                                                    value={moveTeamFromGroupId}
                                                    onChange={(e) => setMoveTeamFromGroupId(e.target.value)}
                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]"
                                                >
                                                    <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                    {teamsInSelectedGroup.map(id => (
                                                        <option key={id} value={id}>{getTeamName(id) || id}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_target_group_label')}</span>
                                                <select
                                                    aria-label={t('monitor_groups_select_target_group')}
                                                    value={moveTeamToGroupName}
                                                    onChange={(e) => setMoveTeamToGroupName(e.target.value)}
                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[180px]"
                                                >
                                                    <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                    {availableTargetGroups.map(name => (
                                                        <option key={name} value={name}>{t('monitor_groups_group_label').replace('{name}', name)}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <button type="button"
                                                onClick={handleMoveTeamToOtherGroup}
                                                disabled={!moveTeamFromGroupId || !moveTeamToGroupName || availableTargetGroups.length === 0}
                                                className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                title={availableTargetGroups.length === 0 ? t('monitor_groups_no_other_editable_group') : t('monitor_groups_move_to_selected_group')}
                                            >
                                                {t('monitor_groups_move_team_action')}
                                            </button>
                                        </div>

                                        {availableTargetGroups.length === 0 && (
                                            <div className="text-xs font-bold text-slate-700/70 mt-2">
                                                {t('monitor_groups_no_other_editable_group_detailed')}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 border-t border-slate-200 pt-3">
                                        <div className="text-xs font-black text-slate-700/80">
                                            Scambia squadre tra due gironi:
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2 items-end">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_team_in_group')}</span>
                                                <select
                                                    aria-label={t('monitor_groups_select_current_team_for_swap_aria')}
                                                    value={swapTeamFromSelectedId}
                                                    onChange={(e) => setSwapTeamFromSelectedId(e.target.value)}
                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]"
                                                >
                                                    <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                    {teamsInSelectedGroup.map(id => (
                                                        <option key={id} value={id}>{getTeamName(id) || id}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_other_group')}</span>
                                                <select
                                                    aria-label={t('monitor_groups_select_group_for_swap_aria')}
                                                    value={swapTargetGroupName}
                                                    onChange={(e) => setSwapTargetGroupName(e.target.value)}
                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[180px]"
                                                >
                                                    <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                    {availableTargetGroups.map(name => (
                                                        <option key={name} value={name}>{t('monitor_groups_group_label').replace('{name}', name)}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_team_in_other_group')}</span>
                                                <select
                                                    aria-label={t('monitor_groups_select_team_other_group_for_swap_aria')}
                                                    value={swapTeamFromTargetId}
                                                    onChange={(e) => setSwapTeamFromTargetId(e.target.value)}
                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]"
                                                    disabled={!swapTargetGroupName}
                                                >
                                                    <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                    {teamsInTargetGroupForSwap.map(id => (
                                                        <option key={id} value={id}>{getTeamName(id) || id}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <button type="button"
                                                onClick={handleSwapTeamsBetweenGroups}
                                                disabled={!swapTeamFromSelectedId || !swapTargetGroupName || !swapTeamFromTargetId || availableTargetGroups.length === 0}
                                                className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                title={availableTargetGroups.length === 0 ? t('monitor_groups_no_other_editable_group') : t('monitor_groups_swap_two_teams')}
                                            >
                                                Scambia
                                            </button>
                                        </div>

                                        {swapTargetGroupName && teamsInTargetGroupForSwap.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {teamsInTargetGroupForSwap.slice(0, 24).map(id => {
                                                    const selected = (swapTeamFromTargetId || '') === id;
                                                    return (
                                                        <button
                                                            key={id}
                                                            type="button"
                                                            onClick={() => setSwapTeamFromTargetId(id)}
                                                            onDragEnter={(e) => {
                                                                e.preventDefault();
                                                                handleGroupSwapTargetDragEnter(swapTargetGroupName, id);
                                                            }}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                handleGroupSwapTargetDragEnter(swapTargetGroupName, id);
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                handleGroupSwapTargetDrop(swapTargetGroupName, id);
                                                            }}
                                                            className={`px-3 py-2 rounded-full text-xs font-black border ${(selected || groupDropTarget === `swap:${swapTargetGroupName}:${id}`) ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                            title={selected ? 'Selezionata' : 'Seleziona'}
                                                        >
                                                            {getTeamName(id) || id}
                                                        </button>
                                                    );
                                                })}
                                                {teamsInTargetGroupForSwap.length > 24 && (
                                                    <span className="px-3 py-2 rounded-full text-xs font-black border border-slate-200 bg-white text-slate-600">
                                                        +{teamsInTargetGroupForSwap.length - 24}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-xs font-bold text-slate-700/70 mt-2">
                                        Vincolo: puoi correggere i gironi in corsa, ma una squadra con match gia iniziati non puo essere spostata.
                                    </div>
                                    </div>
                                </details>
                            )}
                        </div>
	                    )}

	                            </div>
	                        )}

	                    {(() => {
                        const groups = visibleGroups;
                        if (!groups.length) {
                            return (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                                    {t('monitor_groups_no_group_available')}
                                </div>
                            );
                        }

                        return (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {groups.map(g => {
                                    const ms = (matchesByGroup.get(g.name) || []);
                                    const played = ms.filter(m => m.status === 'finished');
                                    const upcoming = ms.filter(m => m.status !== 'finished');
                                    const total = ms.length;
                                    const done = played.length;
                                    const tieBreaks = ms.filter(m => m.isTieBreak);
                                    const openTieBreaks = tieBreaks.filter(m => m.status !== 'finished');

                                    const standings = standingsByGroup.get(g.name) || computeGroupStandings({ teams: (g.teams || []), matches: ms });
                                    const rankedTeams = standings.rankedTeams;
                                    const rows = standings.rows;

                                    const manualSelectable = manualEditMode && canManualEditGroupsNow && !!selectedGroupObj && g.id === selectedGroupObj.id;

                                    const MatchRow: React.FC<{ m: Match }> = ({ m }) => {
                                        const label = m.code ? m.code : m.id;
                                        const ids = getMatchParticipantIds(m);
                                        const names = ids.map(id => getTeamName(id));
                                        const isMulti = ids.length >= 3;
                                        const hasPlaceholder = ids.some(id => isPlaceholderTeamId(id));
                                        const teamsLabel = isMulti ? names.join(' vs ') : `${names[0] || t('tbd_label')} vs ${names[1] || t('tbd_label')}`;
                                        const isFinished = m.status === 'finished';
                                        const isPlaying = m.status === 'playing';
                                        const score = formatMatchScoreLabel(m);

                                        return (
                                            <div
                                                onClick={() => {
                                                    // Guard rail: do not open reports for placeholder (TBD-*) matches.
                                                    if (isFinished && !hasPlaceholder) openReportFromCodes(m.id);
                                                }}
                                                className={`px-3 py-2 rounded-lg border ${isFinished && hasPlaceholder ? 'cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-between gap-3 hover:brightness-95 ${isPlaying ? 'border-emerald-200 bg-emerald-50' : isFinished ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}
                                                title={isFinished && hasPlaceholder ? 'Non disponibile: match con placeholder' : ''}
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                        <span className="font-mono font-black text-xs text-slate-600">{label}</span>
                                                        {m.isTieBreak && (
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${isMulti ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                                SPAREGGIO{isMulti ? ' MULTI' : ''}{typeof m.targetScore === 'number' ? ` a ${m.targetScore}` : ''}
                                                            </span>
                                                        )}
                                                        <span className="font-black text-slate-900 whitespace-normal break-words">{teamsLabel}</span>
                                                    </div>
                                                    <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                                                        {isFinished ? `Risultato: ${score}` : (isPlaying ? 'IN CORSO' : 'DA GIOCARE')}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="px-2 py-1 rounded-full text-[11px] font-black border border-slate-200 bg-slate-50 text-slate-700 uppercase">
                                                        {isFinished ? t('monitor_match_played') : (isPlaying ? t('monitor_match_in_progress') : t('monitor_bracket_to_play'))}
                                                    </span>
                                                    {isFinished ? (
                                                    <button type="button"
                                                        onClick={(e) => { e.stopPropagation(); if (!hasPlaceholder) openReportFromCodes(m.id); }}
                                                        disabled={hasPlaceholder}
                                                        className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                                        title={hasPlaceholder ? t('monitor_groups_unavailable_placeholder_match') : ''}
                                                    >
                                                        <span className="inline-flex items-center gap-1">
                                                            <FileText className="w-4 h-4" /> {t('report_label')}
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <button type="button"
                                                        onClick={(e) => { e.stopPropagation(); toggleMatchStatus(m.id); }}
                                                        disabled={hasPlaceholder}
                                                        className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-slate-900 text-white hover:brightness-110 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                                        title={hasPlaceholder ? t('monitor_groups_unavailable_placeholder_match') : ''}
                                                    >
                                                        <span className="inline-flex items-center gap-1">
                                                            {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                            {isPlaying ? t('close_match') : t('start_live')}
                                                        </span>
                                                    </button>
                                                )}
                                                </div>
                                            </div>
                                        );
                                    };

                                    return (
                                        <div key={g.id} id={toGroupDomId(g.name)} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="whitespace-normal break-words leading-tight">{t('monitor_groups_group_label').replace('{name}', g.name)}</span>
                                                    {openTieBreaks.length > 0 && (
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-slate-900 border border-amber-300 shrink-0">
                                                            SPAREGGIO
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs font-mono font-bold text-white/70">{done}/{total}</span>
                                            </div>

                                            <div className="p-4 space-y-4">
                                                <div>
                                                    <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{t('standings_label')}</div>
                                                    <div className="border border-slate-200 rounded-xl overflow-x-auto">
                                                        <table className="min-w-full text-xs">
                                                            <thead className="bg-slate-50">
                                                                <tr className="text-[11px] uppercase tracking-widest text-slate-600">
                                                                    <th className="px-2 py-2 text-left font-black">#</th>
                                                                    <th className="px-2 py-2 text-left font-black">{t('teams').slice(0, -1) || t('teams')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_played_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_wins_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_losses_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_cups_for_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_cups_against_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_diff_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_blows_for_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_blows_against_short')}</th>
                                                                    <th className="px-2 py-2 text-center font-black">{t('standings_diff_short')}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rankedTeams.map((tt, idx) => {
                                                                    const r = rows[tt.id];
                                                                    const advancing = idx < (state.tournament?.config?.advancingPerGroup ?? 0);
                                                                    const selected = manualSelectable && ((moveTeamFromGroupId || '') === tt.id || (swapTeamFromSelectedId || '') === tt.id);
                                                                    const focused = (focusTeamId || '') === tt.id;
                                                                    const isInlineEditing = manualSelectable && inlineEditTeamId === tt.id;
                                                                const rowBg = isInlineEditing ? 'bg-beer-50' : (selected ? 'bg-beer-200' : (focused ? 'bg-rose-100' : (advancing ? 'bg-beer-100' : 'bg-white')));
                                                                    return (
                                                                        <tr
                                                                            key={tt.id}
                                                                            onClick={() => {
                                                                                if (!manualSelectable) return;
                                                                                setMoveTeamFromGroupId(tt.id);
                                                                                setSwapTeamFromSelectedId(tt.id);
                                                                                setManualEditMsg(t('monitor_groups_selected_team').replace('{team}', tt.name));
                                                                            }}
                                                                            draggable={manualSelectable && !isInlineEditing}
                                                                            onDragStart={manualSelectable && !isInlineEditing ? () => handleSelectedTeamDragStart(tt.id) : undefined}
                                                                            onDragEnd={manualSelectable && !isInlineEditing ? clearGroupDragState : undefined}
                                                                            className={`border-t ${rowBg} ${manualSelectable ? 'cursor-pointer hover:brightness-95' : ''} ${isInlineEditing ? 'outline outline-2 outline-beer-500 outline-offset-[-2px]' : ''} ${groupDragPayload?.kind === 'selected' && groupDragPayload.teamId === tt.id ? 'opacity-60 ring-2 ring-slate-400' : ''}`}
                                                                        >
                                                                            <td className="px-2 py-2 font-mono font-black text-slate-600">{idx + 1}</td>
                                                                            <td className="px-2 py-2 min-w-[180px]">
                                                                                {manualSelectable && inlineEditTeamId === tt.id ? (
                                                                                    <select
                                                                                        aria-label={t('monitor_groups_edit_team_aria').replace('{team}', tt.name)}
                                                                                        defaultValue=""
                                                                                        autoFocus
                                                                                        onBlur={(e) => { e.stopPropagation(); setInlineEditTeamId(''); }}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        onChange={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const v = (e.target.value || '').trim();
                                                                                            if (!v) return;
                                                                                            handleInlineReplaceTeamInSelectedGroup(tt.id, v);
                                                                                        }}
                                                                                        className="w-full max-w-[260px] px-2 py-1.5 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                                                                    >
                                                                                        <option value="" disabled>— {tt.name} —</option>
                                                                                        <option value="__EMPTY__">{t('monitor_bracket_clear_slot')}</option>
                                                                                        {availableTeamsToAdd.map(id => (
                                                                                            <option key={id} value={id}>{getTeamName(id) || id}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                ) : (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            if (!manualSelectable) return;
                                                                                            e.stopPropagation();
                                                                                            setInlineEditTeamId(tt.id);
                                                                                        }}
                                                                                        className={`w-full text-left font-black text-slate-900 whitespace-normal break-words ${manualSelectable ? 'hover:underline' : ''}`}
                                                                                        title={manualSelectable ? t('monitor_groups_click_replace_clear') : undefined}
                                                                                    >
                                                                                        {tt.name}
                                                                                    </button>
                                                                                )}
                                                                                <div className="text-[11px] font-bold text-slate-500 whitespace-normal break-words">
                                                                                    {tt.player1}{tt.player2 ? ` • ${tt.player2}` : ''}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.played ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.wins ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.losses ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.cupsFor ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.cupsAgainst ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-black">{r?.cupsDiff ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.blowFor ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-bold">{r?.blowAgainst ?? 0}</td>
                                                                            <td className="px-2 py-2 text-center font-mono font-black">{r?.blowDiff ?? 0}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                {manualSelectable && availableTeamsToAdd.length > 0 && (
                                                    <div className="mt-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                                                        <div className="text-xs font-black uppercase tracking-widest text-slate-600">
                                                            {t('monitor_groups_add_team_to_group')}
                                                        </div>
                                                        <div className="text-[11px] font-bold text-slate-600/80 mt-1">
                                                            {t('monitor_groups_select_excluded_insert_here')}
                                                        </div>
                                                        <div className="mt-2 flex flex-wrap gap-2 items-end">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[11px] font-black text-slate-600">{t('monitor_groups_excluded_team')}</span>
                                                                <select
                                                                    aria-label={t('monitor_groups_select_excluded_team_aria')}
                                                                    value={addTeamToGroupId}
                                                                    onChange={(e) => setAddTeamToGroupId(e.target.value)}
                                                                    className="px-3 py-2 rounded-xl font-black border border-slate-200 bg-white hover:bg-slate-50 text-xs min-w-[220px]"
                                                                >
                                                                    <option value="">{t('monitor_groups_select_placeholder')}</option>
                                                                    {availableTeamsToAdd.map(id => (
                                                                        <option key={id} value={id}>{getTeamName(id) || id}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={handleAddTeamToSelectedGroup}
                                                                disabled={!addTeamToGroupId}
                                                                onDragEnter={(e) => {
                                                                    e.preventDefault();
                                                                    handleGroupAddTargetDragEnter();
                                                                }}
                                                                onDragOver={(e) => {
                                                                    e.preventDefault();
                                                                    handleGroupAddTargetDragEnter();
                                                                }}
                                                                onDrop={(e) => {
                                                                    e.preventDefault();
                                                                    handleGroupAddTargetDrop();
                                                                }}
                                                                className={`px-3 py-2 rounded-xl font-black border text-xs disabled:opacity-50 disabled:cursor-not-allowed ${groupDropTarget === `add:${selectedGroupObj?.name || ''}` ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200' : 'border-slate-200 bg-slate-900 text-white hover:brightness-110'}`}
                                                                title={!addTeamToGroupId ? t('monitor_groups_select_team') : t('monitor_groups_insert_in_group')}
                                                            >
                                                                Inserisci
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <div className="bg-slate-50 px-3 py-2 font-black text-xs uppercase tracking-widest text-slate-600 flex items-center justify-between">
                                                            <span>{t('monitor_bracket_played')}</span>
                                                            <span className="font-mono">{played.length}</span>
                                                        </div>
                                                        <div className="p-3 space-y-2">
                                                            {played.length ? played.map(m => (<MatchRow key={m.id} m={m} />)) : (
                                                                <div className="text-slate-400 font-bold text-sm">{t('none')}</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <div className="bg-slate-50 px-3 py-2 font-black text-xs uppercase tracking-widest text-slate-600 flex items-center justify-between">
                                                            <span>{t('monitor_bracket_to_play')}</span>
                                                            <span className="font-mono">{upcoming.length}</span>
                                                        </div>
                                                        <div className="p-3 space-y-2">
                                                            {upcoming.length ? upcoming.map(m => (<MatchRow key={m.id} m={m} />)) : (
                                                                <div className="text-slate-400 font-bold text-sm">{t('none')}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </>
            )}
        </div>
    );
};
