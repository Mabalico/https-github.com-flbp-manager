import React from 'react';
import {
  ArrowRightLeft,
  Brackets,
  CheckCircle2,
  Eye,
  GripVertical,
  Info,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCcw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Undo2,
  Redo2,
  Users,
  X,
} from 'lucide-react';
import type { Match, Team, TournamentData } from '../../../types';
import type { AppState } from '../../../services/storageService';
import { setRemoteBaseUpdatedAt } from '../../../services/supabaseRest';
import {
  buildBracketRoundsFromMatches,
  buildTournamentStructureSnapshot,
  findSuccessorMatch,
  findTeamStartedInPhase,
  getBracketMatches,
  getCatalogTeam,
  getMatchById,
  getRound1Matches,
  getSlotValue,
  hasRealBracketStarted,
  isLockedBracketMatchForStructureEdit,
  resolveWinnerTeamId,
} from '../../../services/tournamentStructureSelectors';
import {
  canInsertTeamIntoBracketSlot,
  canInsertTeamIntoGroup,
  canClearBracketSlot,
  canMoveBracketSlot,
  canMoveTeamBetweenGroups,
  canRemoveTeamFromGroup,
  canReplaceBracketSlot,
  canReplaceGroupTeam,
  canSwapBracketSlots,
  canSwapTeams,
  getTeamEligibility,
} from '../../../services/tournamentStructureEligibility';
import { prepareTournamentStructureApply } from '../../../services/tournamentStructureApply';
import { preflightTournamentStructureConflict, reloadRemoteTournamentStructureState } from '../../../services/tournamentStructureConflict';
import { useTournamentStructureDraft } from '../../../services/tournamentStructureDraft';
import type {
  CurrentPlacement,
  StructuralOperation,
  StructuralPhase,
  StructuralTargetCheck,
  TeamEligibilityStatus,
  TournamentStructureConflictResult,
  TournamentStructureSnapshot,
} from '../../../services/tournamentStructureTypes';
import { isPlaceholderTeamId } from '../../../services/matchUtils';
import { isFinalGroup } from '../../../services/groupUtils';
import { TournamentBracket } from '../../TournamentBracket';
import { TeamPickerCombobox, type TeamPickerOption } from '../editor/TeamPickerCombobox';
import { uuid } from '../../../services/id';
import { useTranslation } from '../../../App';

interface TournamentEditorTabProps {
  state: AppState;
  setState: (state: AppState) => void;
  handleUpdateTournamentAndMatches: (tournament: TournamentData, matches: Match[]) => void;
  initialView?: EditorView;
}

type EditorView = 'groups' | 'bracket';
type PoolFilter = 'all' | 'eligible' | 'ineligible' | 'assigned' | 'eliminated' | 'locked';
type SnackbarTone = 'success' | 'error' | 'info';

type EditorSelection =
  | { kind: 'pool-team'; teamId: string }
  | { kind: 'group-team'; teamId: string; groupId: string }
  | { kind: 'bracket-slot'; slotKey: string; teamId?: string }
  | null;

interface PoolEntry {
  team: Team;
  status: TeamEligibilityStatus;
  reasonCode: string;
  humanMessage: string;
  placementLabel: string;
  badgeLabel: string;
  disabled: boolean;
}

interface DuplicateOccurrence {
  key: string;
  phase: 'groups' | 'bracket';
  teamId: string;
  teamName: string;
  location: string;
  groupId?: string;
  slotKey?: string;
  locked: boolean;
}

interface DuplicateRemediationSection {
  scope: 'groups' | 'bracket';
  teamId: string;
  teamName: string;
  occurrences: DuplicateOccurrence[];
}

interface BlockedAdvancementPreview {
  sourceLabel: string;
  winnerLabel: string;
  targetLabel: string;
}

const EMPTY_TOURNAMENT: TournamentData = {
  id: '__editor-empty__',
  name: '',
  type: 'elimination',
  startDate: '',
  teams: [],
  groups: [],
  matches: [],
  rounds: [],
  config: { advancingPerGroup: 0 },
};

const EMPTY_SNAPSHOT: TournamentStructureSnapshot = {
  tournament: EMPTY_TOURNAMENT,
  matches: [],
  catalogTeams: [],
};

const editorThemeVars: React.CSSProperties = {
  '--editor-bg-app': '#F6F8FB',
  '--editor-bg-surface': '#FFFFFF',
  '--editor-bg-surface-muted': '#F8FAFC',
  '--editor-bg-surface-soft': '#F1F5F9',
  '--editor-bg-hover': '#EEF4FF',
  '--editor-bg-selected': '#E8F0FF',
  '--editor-bg-changed': '#F3E8FF',
  '--editor-bg-disabled': '#F8FAFC',
  '--editor-text-primary': '#0F172A',
  '--editor-text-secondary': '#334155',
  '--editor-text-muted': '#64748B',
  '--editor-text-disabled': '#94A3B8',
  '--editor-text-on-brand': '#FFFFFF',
  '--editor-border-subtle': '#E2E8F0',
  '--editor-border-default': '#CBD5E1',
  '--editor-border-strong': '#94A3B8',
  '--editor-border-brand': '#3B82F6',
  '--editor-brand-50': '#EFF6FF',
  '--editor-brand-100': '#DBEAFE',
  '--editor-brand-500': '#3B82F6',
  '--editor-brand-600': '#2563EB',
  '--editor-brand-700': '#1D4ED8',
  '--editor-success-50': '#ECFDF3',
  '--editor-success-100': '#DCFCE7',
  '--editor-success-600': '#16A34A',
  '--editor-success-700': '#15803D',
  '--editor-warning-50': '#FFFBEB',
  '--editor-warning-100': '#FEF3C7',
  '--editor-warning-600': '#D97706',
  '--editor-warning-700': '#B45309',
  '--editor-danger-50': '#FEF2F2',
  '--editor-danger-100': '#FEE2E2',
  '--editor-danger-600': '#DC2626',
  '--editor-danger-700': '#B91C1C',
  '--editor-info-50': '#F0F9FF',
  '--editor-info-100': '#E0F2FE',
  '--editor-info-600': '#0284C7',
  '--editor-info-700': '#0369A1',
  '--editor-draft-50': '#F5F3FF',
  '--editor-draft-100': '#EDE9FE',
  '--editor-draft-600': '#7C3AED',
  '--editor-draft-700': '#6D28D9',
  '--editor-locked-bg': '#F1F5F9',
  '--editor-locked-text': '#475569',
  '--editor-locked-border': '#CBD5E1',
} as React.CSSProperties;

const editorPanelClass = 'animate-pop-in rounded-[24px] border border-slate-200/50 bg-slate-50/60 backdrop-blur-md shadow-sm shadow-slate-200/40 hover:shadow-md transition-all duration-300';
const editorSoftPanelClass = 'rounded-2xl border border-slate-100/50 bg-white/80 backdrop-blur-md p-4 shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-300';
const editorGhostButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-all duration-300 hover:bg-white hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const editorOutlineButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all duration-300 hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
const editorPrimaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-[0_2px_8px_-2px_rgba(37,99,235,0.4)] transition-all duration-300 hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

const statusOrder: Record<TeamEligibilityStatus, number> = {
  eligible: 0,
  already_assigned: 1,
  locked_by_match: 2,
  eliminated: 3,
  duplicate: 4,
  deleted: 5,
  unknown: 6,
};

const DRAG_SCROLL_EDGE_PX = 96;
const DRAG_SCROLL_MIN_STEP = 8;
const DRAG_SCROLL_MAX_STEP = 30;

const getEdgeScrollDelta = (pointer: number, size: number) => {
  if (size <= 0) return 0;
  if (pointer < DRAG_SCROLL_EDGE_PX) {
    const intensity = (DRAG_SCROLL_EDGE_PX - pointer) / DRAG_SCROLL_EDGE_PX;
    return -Math.round(DRAG_SCROLL_MIN_STEP + intensity * (DRAG_SCROLL_MAX_STEP - DRAG_SCROLL_MIN_STEP));
  }
  if (size - pointer < DRAG_SCROLL_EDGE_PX) {
    const intensity = (DRAG_SCROLL_EDGE_PX - (size - pointer)) / DRAG_SCROLL_EDGE_PX;
    return Math.round(DRAG_SCROLL_MIN_STEP + intensity * (DRAG_SCROLL_MAX_STEP - DRAG_SCROLL_MIN_STEP));
  }
  return 0;
};

const resolveElementFromEventTarget = (target: EventTarget | null): Element | null => {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
};

const canScrollElementAxis = (element: HTMLElement, axis: 'x' | 'y') => {
  const style = window.getComputedStyle(element);
  const overflow = axis === 'y' ? style.overflowY || style.overflow : style.overflowX || style.overflow;
  if (!/(auto|scroll|overlay)/.test(overflow)) return false;
  return axis === 'y' ? element.scrollHeight > element.clientHeight + 4 : element.scrollWidth > element.clientWidth + 4;
};

const getScrollableAncestors = (target: EventTarget | null) => {
  const scrollables: HTMLElement[] = [];
  let current = resolveElementFromEventTarget(target);
  while (current) {
    if (current instanceof HTMLElement && (canScrollElementAxis(current, 'y') || canScrollElementAxis(current, 'x'))) {
      scrollables.push(current);
    }
    current = current.parentElement;
  }
  return scrollables;
};

const mergeTeamCatalog = (base: Team[], additions: Team[]) => {
  const merged = new Map<string, Team>();
  for (const team of base || []) {
    const id = String(team.id || '').trim();
    if (!id) continue;
    merged.set(id, { ...team });
  }
  for (const team of additions || []) {
    const id = String(team.id || '').trim();
    if (!id) continue;
    merged.set(id, { ...merged.get(id), ...team });
  }
  return Array.from(merged.values());
};

const buildSnapshotSignature = (snapshot: TournamentStructureSnapshot) =>
  JSON.stringify({
    tournamentId: snapshot.tournament.id,
    type: snapshot.tournament.type,
    groups: (snapshot.tournament.groups || []).map((group) => ({
      id: group.id,
      teams: (group.teams || []).map((team) => team.id),
    })),
    matches: (snapshot.matches || []).map((match) => ({
      id: match.id,
      phase: match.phase || '',
      groupName: match.groupName || '',
      round: match.round || 0,
      teamAId: match.teamAId || '',
      teamBId: match.teamBId || '',
      status: match.status,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      hidden: !!match.hidden,
      isBye: !!match.isBye,
    })),
  });

const toneForStatus = (status: TeamEligibilityStatus) => {
  switch (status) {
    case 'eligible':
      return 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] text-[var(--editor-success-700)]';
    case 'already_assigned':
      return 'border-[color:var(--editor-info-100)] bg-[var(--editor-info-50)] text-[var(--editor-info-700)]';
    case 'locked_by_match':
      return 'border-[color:var(--editor-locked-border)] bg-[var(--editor-locked-bg)] text-[var(--editor-locked-text)]';
    case 'eliminated':
      return 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)]';
    case 'duplicate':
      return 'border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] text-[var(--editor-warning-700)]';
    case 'deleted':
      return 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-soft)] text-[var(--editor-text-secondary)]';
    default:
      return 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] text-[var(--editor-text-secondary)]';
  }
};


const canExpandPreliminaryRound = (snapshot: TournamentStructureSnapshot, bracketAvailable: boolean): boolean => {
  if (!bracketAvailable) return false;
  if (hasRealBracketStarted(snapshot)) return false;
  const slotKeys = getRound1Matches(snapshot).flatMap((match) => [`${match.id}|A`, `${match.id}|B`]);
  return !slotKeys.some((slotKey) => {
    const value = getSlotValue(snapshot, slotKey);
    return !value || isPlaceholderTeamId(value);
  });
};

const toneForValidation = (blocking: number, warnings: number) => {
  if (blocking > 0) return 'rose';
  if (warnings > 0) return 'amber';
  return 'emerald';
};

const filterPoolEntry = (entry: PoolEntry, filter: PoolFilter) => {
  switch (filter) {
    case 'eligible':
      return entry.status === 'eligible';
    case 'ineligible':
      return entry.status !== 'eligible';
    case 'assigned':
      return entry.status === 'already_assigned';
    case 'eliminated':
      return entry.status === 'eliminated';
    case 'locked':
      return entry.status === 'locked_by_match';
    default:
      return true;
  }
};

const matchesPoolQuery = (entry: PoolEntry, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.team.name, entry.badgeLabel, entry.placementLabel, entry.humanMessage]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
};

const selectionEquals = (a: EditorSelection, b: EditorSelection) => {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'pool-team' && b.kind === 'pool-team') return a.teamId === b.teamId;
  if (a.kind === 'group-team' && b.kind === 'group-team') return a.teamId === b.teamId && a.groupId === b.groupId;
  if (a.kind === 'bracket-slot' && b.kind === 'bracket-slot') return a.slotKey === b.slotKey;
  return false;
};

export const TournamentEditorTab: React.FC<TournamentEditorTabProps> = ({
  state,
  setState,
  handleUpdateTournamentAndMatches,
  initialView = 'groups',
}) => {
  const { t } = useTranslation();
  const badgeLabelByStatus = React.useMemo<Record<TeamEligibilityStatus, string>>(() => ({
    eligible: t('editor_status_eligible'),
    already_assigned: t('editor_status_already_assigned'),
    locked_by_match: t('editor_status_locked'),
    eliminated: t('editor_status_eliminated'),
    duplicate: t('editor_status_duplicate'),
    deleted: t('editor_status_removed'),
    unknown: t('editor_status_unknown'),
  }), [t]);
  const poolFilterLabel = React.useMemo<Record<PoolFilter, string>>(() => ({
    all: t('editor_filter_all'),
    eligible: t('editor_filter_eligible'),
    ineligible: t('editor_filter_ineligible'),
    assigned: t('editor_filter_assigned'),
    eliminated: t('editor_filter_eliminated'),
    locked: t('editor_filter_locked'),
  }), [t]);
  const hasLiveTournament = !!state.tournament;
  const sourceSnapshot = React.useMemo(
    () =>
      state.tournament
        ? buildTournamentStructureSnapshot(state.tournament, state.tournamentMatches || [], state.teams || [])
        : EMPTY_SNAPSHOT,
    [state.tournament, state.tournamentMatches, state.teams]
  );

  const sourceSignature = React.useMemo(() => buildSnapshotSignature(sourceSnapshot), [sourceSnapshot]);
  const draft = useTournamentStructureDraft(sourceSnapshot);
  const rebasedSignatureRef = React.useRef<string>(sourceSignature);

  const [view, setView] = React.useState<EditorView>(initialView);
  const [poolFilter, setPoolFilter] = React.useState<PoolFilter>('all');
  const [poolQuery, setPoolQuery] = React.useState('');
  const [newTeamOpen, setNewTeamOpen] = React.useState(false);
  const [newTeamName, setNewTeamName] = React.useState('');
  const [newTeamPlayer1, setNewTeamPlayer1] = React.useState('');
  const [newTeamPlayer2, setNewTeamPlayer2] = React.useState('');
  const [selection, setSelection] = React.useState<EditorSelection>(null);
  const [dragSource, setDragSource] = React.useState<EditorSelection>(null);
  const [hoverSlotKey, setHoverSlotKey] = React.useState('');
  const [interactionMessage, setInteractionMessage] = React.useState('');
  const [snackbar, setSnackbar] = React.useState<{
    tone: SnackbarTone;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [applyBusy, setApplyBusy] = React.useState(false);
  const [reloadBusy, setReloadBusy] = React.useState(false);
  const [conflictState, setConflictState] = React.useState<TournamentStructureConflictResult | null>(null);
  const [pendingApplyLocal, setPendingApplyLocal] = React.useState<ReturnType<typeof prepareTournamentStructureApply> | null>(null);
  const [pendingLiveApply, setPendingLiveApply] = React.useState<ReturnType<typeof prepareTournamentStructureApply> | null>(null);
  const [pendingDuplicateDelete, setPendingDuplicateDelete] = React.useState<DuplicateOccurrence | null>(null);
  const [wizardQuery, setWizardQuery] = React.useState('');
  const [liveOutOfSync, setLiveOutOfSync] = React.useState(false);
  const previewPanelRef = React.useRef<HTMLDivElement | null>(null);
  const bracketWorkspaceRef = React.useRef<HTMLDivElement | null>(null);
  const dragPointerRef = React.useRef<{ x: number; y: number; target: EventTarget | null }>({ x: 0, y: 0, target: null });
  const dragAutoscrollFrameRef = React.useRef<number | null>(null);
  const [isBracketFullscreen, setIsBracketFullscreen] = React.useState(false);

  const stopDragAutoscroll = React.useCallback(() => {
    if (dragAutoscrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoscrollFrameRef.current);
      dragAutoscrollFrameRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const groupsAvailable = (draft.state.present.tournament.groups || []).length > 0;
  const allBracketMatches = React.useMemo(() => getBracketMatches(draft.state.present), [draft.state.present]);
  const bracketAvailable = allBracketMatches.length > 0;
  const currentPhase: StructuralPhase = view === 'groups' ? 'groups' : 'bracket';

  React.useEffect(() => {
    if (view === 'groups' && !groupsAvailable && bracketAvailable) setView('bracket');
    if (view === 'bracket' && !bracketAvailable && groupsAvailable) setView('groups');
  }, [view, groupsAvailable, bracketAvailable]);

  React.useEffect(() => {
    if (!dragSource) {
      stopDragAutoscroll();
      return;
    }

    dragPointerRef.current = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      target: document.body,
    };

    const handleWindowDragOver = (event: DragEvent) => {
      dragPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        target: event.target,
      };
    };

    const tick = () => {
      const { x, y, target } = dragPointerRef.current;
      const deltaY = getEdgeScrollDelta(y, window.innerHeight);
      const deltaX = getEdgeScrollDelta(x, window.innerWidth);

      if (deltaY || deltaX) {
        let scrolled = false;
        for (const element of getScrollableAncestors(target)) {
          const prevTop = element.scrollTop;
          const prevLeft = element.scrollLeft;
          if (deltaY) element.scrollTop += deltaY;
          if (deltaX) element.scrollLeft += deltaX;
          if (element.scrollTop !== prevTop || element.scrollLeft !== prevLeft) {
            scrolled = true;
            break;
          }
        }

        if (!scrolled) {
          window.scrollBy({ top: deltaY, left: deltaX, behavior: 'auto' });
        }
      }

      dragAutoscrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    window.addEventListener('dragover', handleWindowDragOver);
    dragAutoscrollFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      stopDragAutoscroll();
    };
  }, [dragSource, stopDragAutoscroll]);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = window.setTimeout(() => setSnackbar(null), 3200);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBracketFullscreen(document.fullscreenElement === bracketWorkspaceRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  React.useEffect(() => {
    if (!hasLiveTournament) return;
    if (sourceSignature === rebasedSignatureRef.current) return;
    if (!draft.diff.changed) {
      draft.rebase(sourceSnapshot);
      rebasedSignatureRef.current = sourceSignature;
      setLiveOutOfSync(false);
      return;
    }
    setLiveOutOfSync(true);
  }, [draft, draft.diff.changed, hasLiveTournament, sourceSignature, sourceSnapshot]);

  const slotDisplayLabel = React.useCallback(
    (slotKey?: string) => {
      const [matchId, side] = String(slotKey || '').split('|');
      if (!matchId || (side !== 'A' && side !== 'B')) return t('editor_target_bracket');
      const match = getMatchById(draft.state.present, matchId);
      if (!match) return t('editor_target_bracket');
      const roundLabel = match.roundName || (match.round ? t('round_n').replace('{n}', String(match.round)) : t('editor_target_bracket'));
      const codeLabel = match.code ? ` · ${match.code}` : '';
      return `${roundLabel}${codeLabel} · lato ${side}`;
    },
    [draft.state.present, t]
  );

  const poolEntries = React.useMemo<PoolEntry[]>(() => {
    return (draft.state.present.catalogTeams || [])
      .filter((team) => !team.isBye)
      .filter((team) => !String(team.id || '').trim().toUpperCase().startsWith('TBD-'))
      .map((team) => {
        const eligibility = getTeamEligibility(draft.state.present, team.id, currentPhase);
        const placementLabel = eligibility.currentPlacement
          ? eligibility.currentPlacement.phase === 'groups'
            ? `${eligibility.currentPlacement.containerName || t('groups_label').slice(0, -1)}`
            : slotDisplayLabel(eligibility.currentPlacement.slotKey)
          : '';
        return {
          team,
          status: eligibility.status,
          reasonCode: String(eligibility.reasonCode || 'unknown'),
          humanMessage: eligibility.humanMessage,
          placementLabel,
          badgeLabel: badgeLabelByStatus[eligibility.status],
          disabled: eligibility.status !== 'eligible',
        };
      })
      .sort((a, b) => {
        const d = statusOrder[a.status] - statusOrder[b.status];
        if (d !== 0) return d;
        return a.team.name.localeCompare(b.team.name);
      });
  }, [currentPhase, draft.state.present, slotDisplayLabel, t]);

  const filteredPoolEntries = React.useMemo(
    () => poolEntries.filter((entry) => filterPoolEntry(entry, poolFilter)).filter((entry) => matchesPoolQuery(entry, poolQuery)),
    [poolEntries, poolFilter, poolQuery]
  );

  const poolCounts = React.useMemo(
    () => ({
      all: poolEntries.length,
      eligible: poolEntries.filter((entry) => entry.status === 'eligible').length,
      ineligible: poolEntries.filter((entry) => entry.status !== 'eligible').length,
      assigned: poolEntries.filter((entry) => entry.status === 'already_assigned').length,
      eliminated: poolEntries.filter((entry) => entry.status === 'eliminated').length,
      locked: poolEntries.filter((entry) => entry.status === 'locked_by_match').length,
    }),
    [poolEntries]
  );

  const selectedTeamId = selection?.kind === 'pool-team' ? selection.teamId : null;
  const comboboxItems = React.useMemo<TeamPickerOption[]>(
    () =>
      poolEntries.filter((entry) => filterPoolEntry(entry, poolFilter)).map((entry) => ({
        id: entry.team.id,
        name: entry.team.name,
        disabled: entry.disabled,
        badge: entry.badgeLabel,
        placement: entry.placementLabel || t('editor_not_assigned'),
        reason: entry.disabled ? entry.humanMessage : undefined,
      })),
    [poolEntries, poolFilter]
  );

  const changedGroupTeamIds = React.useMemo(() => new Set(draft.diff.groupChanges.map((change) => change.teamId)), [draft.diff.groupChanges]);
  const duplicateRemediationSections = React.useMemo<DuplicateRemediationSection[]>(() => {
    const teamName = (teamId: string) => getCatalogTeam(draft.state.present, teamId)?.name || teamId;
    const buildSections = (
      scope: 'groups' | 'bracket',
      occurrencesByTeam: Map<string, DuplicateOccurrence[]>
    ): DuplicateRemediationSection[] =>
      Array.from(occurrencesByTeam.entries())
        .filter(([, occurrences]) => occurrences.length > 1)
        .map(([teamId, occurrences]) => ({
          scope,
          teamId,
          teamName: teamName(teamId),
          occurrences,
        }));

    const groupOccurrences = new Map<string, DuplicateOccurrence[]>();
    for (const group of draft.state.present.tournament.groups || []) {
      for (const [index, team] of (group.teams || []).entries()) {
        const teamId = String(team.id || '').trim();
        if (!teamId || isPlaceholderTeamId(teamId) || team.hidden || team.isBye) continue;
        const check = canRemoveTeamFromGroup(draft.state.present, teamId, group.id);
        const occurrence: DuplicateOccurrence = {
          key: `group:${group.id}:${teamId}:${index}`,
          phase: 'groups',
          teamId,
          teamName: team.name || teamName(teamId),
          location: group.name,
          groupId: group.id,
          locked: !check.allowed,
        };
        groupOccurrences.set(teamId, [...(groupOccurrences.get(teamId) || []), occurrence]);
      }
    }

    const bracketOccurrences = new Map<string, DuplicateOccurrence[]>();
    for (const match of getRound1Matches(draft.state.present)) {
      for (const side of ['A', 'B'] as const) {
        const slotKey = `${match.id}|${side}`;
        const teamId = String(side === 'A' ? match.teamAId || '' : match.teamBId || '').trim();
        if (!teamId || isPlaceholderTeamId(teamId)) continue;
        const check = canClearBracketSlot(draft.state.present, slotKey);
        const occurrence: DuplicateOccurrence = {
          key: `bracket:${slotKey}`,
          phase: 'bracket',
          teamId,
          teamName: teamName(teamId),
          location: slotDisplayLabel(slotKey),
          slotKey,
          locked: !check.allowed,
        };
        bracketOccurrences.set(teamId, [...(bracketOccurrences.get(teamId) || []), occurrence]);
      }
    }

    return [
      ...buildSections('groups', groupOccurrences),
      ...buildSections('bracket', bracketOccurrences),
    ];
  }, [draft.state.present, slotDisplayLabel]);
  const duplicateOccurrenceCount = React.useMemo(
    () => duplicateRemediationSections.reduce((sum, section) => sum + section.occurrences.length, 0),
    [duplicateRemediationSections]
  );
  const originalCatalogTeamIds = React.useMemo(
    () => new Set((draft.state.original.catalogTeams || []).map((team) => String(team.id || '').trim()).filter(Boolean)),
    [draft.state.original.catalogTeams]
  );
  const catalogTeamAdditions = React.useMemo(
    () => (draft.state.present.catalogTeams || []).filter((team) => !originalCatalogTeamIds.has(String(team.id || '').trim())),
    [draft.state.present.catalogTeams, originalCatalogTeamIds]
  );
  const hasCatalogTeamChanges = catalogTeamAdditions.length > 0;
  const hasEditorChanges = draft.diff.changed || hasCatalogTeamChanges;
  const changedPoolTeamIds = React.useMemo(() => {
    const next = new Set<string>();
    draft.diff.groupChanges.forEach((change) => next.add(change.teamId));
    [...draft.diff.bracketChanges, ...draft.diff.futureBracketChanges].forEach((change) => {
      if (change.beforeTeamId && !isPlaceholderTeamId(change.beforeTeamId)) next.add(change.beforeTeamId);
      if (change.afterTeamId && !isPlaceholderTeamId(change.afterTeamId)) next.add(change.afterTeamId);
    });
    return next;
  }, [draft.diff.bracketChanges, draft.diff.futureBracketChanges, draft.diff.groupChanges]);
  const clearInteraction = React.useCallback(() => {
    setSelection(null);
    setDragSource(null);
    setHoverSlotKey('');
  }, []);

  const setSelectedPoolTeam = React.useCallback(
    (teamId: string) => {
      const entry = poolEntries.find((row) => row.team.id === teamId);
      if (!entry || entry.disabled) return;
      const nextSelection: EditorSelection = { kind: 'pool-team', teamId };
      setSelection((prev) => (selectionEquals(prev, nextSelection) ? null : nextSelection));
      setDragSource(null);
      setHoverSlotKey('');
      setInteractionMessage(
        t('editor_message_team_selected')
          .replace('{name}', entry.team.name)
          .replace('{target}', view === 'groups' ? t('editor_target_groups') : t('editor_target_bracket'))
      );
    },
    [poolEntries, t, view]
  );

  const applyOperation = React.useCallback(
    (operation: StructuralOperation, successTone: SnackbarTone = 'info') => {
      const result = draft.applyOperation(operation);
      setInteractionMessage(result.check.humanMessage);
      if (result.ok) {
        clearInteraction();
        setSnackbar({
          tone: successTone,
          message: result.entry?.message || result.check.humanMessage,
          actionLabel: draft.state.past.length >= 0 ? t('editor_undo') : undefined,
          onAction: () => {
            draft.undo();
            setInteractionMessage(t('editor_operation_cancelled'));
            setSnackbar({ tone: 'info', message: t('editor_operation_cancelled') });
          },
        });
        return true;
      }
      return false;
    },
    [clearInteraction, draft, t]
  );

  const applyDeleteDuplicateOccurrence = React.useCallback(
    (occurrence: DuplicateOccurrence) => {
      if (occurrence.phase === 'groups' && occurrence.groupId) {
        applyOperation({ type: 'REMOVE_GROUP_TEAM', teamId: occurrence.teamId, groupId: occurrence.groupId }, 'success');
        return;
      }

      if (occurrence.phase === 'bracket' && occurrence.slotKey) {
        applyOperation({ type: 'CLEAR_BRACKET_SLOT', slotKey: occurrence.slotKey }, 'success');
      }
    },
    [applyOperation]
  );

  const handleDeleteDuplicateOccurrence = React.useCallback((occurrence: DuplicateOccurrence) => {
    setPendingDuplicateDelete(occurrence);
  }, []);


  const handleAddNewTeamToPool = React.useCallback(() => {
    const name = newTeamName.trim();
    const player1 = newTeamPlayer1.trim();
    const player2 = newTeamPlayer2.trim();
    if (!name || !player1 || !player2) {
      setSnackbar({ tone: 'error', message: t('editor_new_team_requires_fields') });
      return;
    }
    const nextTeam: Team = {
      id: uuid(),
      name,
      player1,
      player2,
      createdAt: Date.now(),
    };
    const ok = applyOperation({ type: 'ADD_CATALOG_TEAM', team: nextTeam }, 'success');
    if (!ok) return;
    setNewTeamName('');
    setNewTeamPlayer1('');
    setNewTeamPlayer2('');
    setNewTeamOpen(false);
    setPoolQuery(name);
    setSelection({ kind: 'pool-team', teamId: nextTeam.id });
    setInteractionMessage(
      view === 'bracket' && canExpandPreliminaryRound(draft.state.present, bracketAvailable)
        ? t('editor_new_team_created_expand').replace('{name}', name)
        : t('editor_new_team_created_target')
            .replace('{name}', name)
            .replace('{target}', view === 'groups' ? t('editor_target_groups') : t('editor_target_bracket'))
    );
  }, [applyOperation, bracketAvailable, draft.state.present, newTeamName, newTeamPlayer1, newTeamPlayer2, t, view]);

  const groupCardCheck = React.useCallback(
    (groupId: string): StructuralTargetCheck | null => {
      const activeSource = dragSource || selection;
      if (!activeSource) return null;
      if (activeSource.kind === 'pool-team') {
        return canInsertTeamIntoGroup(draft.state.present, activeSource.teamId, groupId);
      }
      if (activeSource.kind === 'group-team') {
        return canMoveTeamBetweenGroups(draft.state.present, activeSource.teamId, activeSource.groupId, groupId);
      }
      return null;
    },
    [dragSource, draft.state.present, selection]
  );

  const groupRowCheck = React.useCallback(
    (groupId: string, targetTeamId: string): StructuralTargetCheck | null => {
      const activeSource = dragSource || selection;
      if (!activeSource) return null;
      if (activeSource.kind === 'pool-team') {
        return canReplaceGroupTeam(draft.state.present, targetTeamId, activeSource.teamId, groupId);
      }
      if (activeSource.kind === 'group-team') {
        return canSwapTeams(draft.state.present, activeSource.teamId, targetTeamId, 'groups', activeSource.groupId, groupId);
      }
      return null;
    },
    [dragSource, draft.state.present, selection]
  );

  const handleGroupCardAction = React.useCallback(
    (groupId: string) => {
      const activeSource = dragSource || selection;
      if (!activeSource) return;
      if (activeSource.kind === 'pool-team') {
        applyOperation({ type: 'INSERT_TEAM_IN_GROUP', teamId: activeSource.teamId, groupId }, 'success');
        return;
      }
      if (activeSource.kind === 'group-team') {
        applyOperation(
          {
            type: 'MOVE_TEAM_BETWEEN_GROUPS',
            teamId: activeSource.teamId,
            fromGroupId: activeSource.groupId,
            toGroupId: groupId,
          },
          'success'
        );
      }
    },
    [applyOperation, dragSource, selection]
  );

  const handleGroupRowAction = React.useCallback(
    (groupId: string, targetTeamId: string) => {
      const activeSource = dragSource || selection;
      if (!activeSource) {
        setSelection({ kind: 'group-team', teamId: targetTeamId, groupId });
        setInteractionMessage(t('editor_message_group_team_selected'));
        return;
      }
      if (activeSource.kind === 'pool-team') {
        applyOperation(
          {
            type: 'REPLACE_GROUP_TEAM',
            oldTeamId: targetTeamId,
            newTeamId: activeSource.teamId,
            groupId,
          },
          'success'
        );
        return;
      }
      if (activeSource.kind === 'group-team') {
        if (activeSource.teamId === targetTeamId && activeSource.groupId === groupId) {
          clearInteraction();
          setInteractionMessage(t('editor_selection_cancelled'));
          return;
        }
        applyOperation(
          {
            type: 'SWAP_GROUP_TEAMS',
            teamAId: activeSource.teamId,
            teamBId: targetTeamId,
            groupAId: activeSource.groupId,
            groupBId: groupId,
          },
          'success'
        );
      }
    },
    [applyOperation, clearInteraction, dragSource, selection]
  );

  const handleBracketSlotAction = React.useCallback(
    (slotKey: string) => {
      const activeSource = dragSource || selection;
      if (!activeSource) {
        const currentTeamId = getSlotValue(draft.state.present, slotKey);
        setSelection({ kind: 'bracket-slot', slotKey, teamId: currentTeamId || undefined });
        setInteractionMessage(t('editor_message_slot_selected'));
        return;
      }

      if (activeSource.kind === 'pool-team') {
        const currentValue = getSlotValue(draft.state.present, slotKey);
        const operation: StructuralOperation =
          currentValue && !isPlaceholderTeamId(currentValue)
            ? { type: 'REPLACE_BRACKET_SLOT', slotKey, newTeamId: activeSource.teamId }
            : { type: 'INSERT_TEAM_IN_BRACKET_SLOT', slotKey, teamId: activeSource.teamId };
        applyOperation(operation, 'success');
        return;
      }

      if (activeSource.kind === 'bracket-slot') {
        if (activeSource.slotKey === slotKey) {
          clearInteraction();
          setInteractionMessage(t('editor_slot_selection_cancelled'));
          return;
        }
        const targetValue = getSlotValue(draft.state.present, slotKey);
        if (!targetValue || isPlaceholderTeamId(targetValue)) {
          applyOperation({ type: 'MOVE_BRACKET_SLOT', fromSlotKey: activeSource.slotKey, toSlotKey: slotKey }, 'success');
          return;
        }
        applyOperation({ type: 'SWAP_BRACKET_SLOTS', slotAKey: activeSource.slotKey, slotBKey: slotKey }, 'success');
      }
    },
    [applyOperation, clearInteraction, dragSource, draft.state.present, selection]
  );

  const bracketTargetCheck = React.useCallback(
    (slotKey: string): StructuralTargetCheck | null => {
      const activeSource = dragSource || selection;
      if (!activeSource) return null;
      if (activeSource.kind === 'pool-team') {
        const currentValue = getSlotValue(draft.state.present, slotKey);
        return currentValue && !isPlaceholderTeamId(currentValue)
          ? canReplaceBracketSlot(draft.state.present, slotKey, activeSource.teamId)
          : canInsertTeamIntoBracketSlot(draft.state.present, activeSource.teamId, slotKey);
      }
      if (activeSource.kind === 'bracket-slot') {
        const targetValue = getSlotValue(draft.state.present, slotKey);
        return !targetValue || isPlaceholderTeamId(targetValue)
          ? canMoveBracketSlot(draft.state.present, activeSource.slotKey, slotKey)
          : canSwapBracketSlots(draft.state.present, activeSource.slotKey, slotKey);
      }
      return null;
    },
    [dragSource, draft.state.present, selection]
  );

  const round1Matches = React.useMemo(() => getRound1Matches(draft.state.present), [draft.state.present]);
  const allBracketSlotKeys = React.useMemo(
    () => allBracketMatches.flatMap((match) => [`${match.id}|A`, `${match.id}|B`]),
    [allBracketMatches]
  );
  const round1SlotKeys = React.useMemo(() => round1Matches.flatMap((match) => [`${match.id}|A`, `${match.id}|B`]), [round1Matches]);
  const round1HasPlaceholderSlots = React.useMemo(
    () => round1SlotKeys.some((slotKey) => {
      const value = getSlotValue(draft.state.present, slotKey);
      return !value || isPlaceholderTeamId(value);
    }),
    [draft.state.present, round1SlotKeys]
  );
  const canExpandBracketWithPreliminaryRound = React.useMemo(
    () => canExpandPreliminaryRound(draft.state.present, bracketAvailable),
    [bracketAvailable, draft.state.present]
  );
  const handleAddPreliminaryRound = React.useCallback(() => {
    applyOperation({ type: 'ADD_PRELIMINARY_BRACKET_ROUND' }, 'success');
  }, [applyOperation]);

  // Pannello azioni sullo slot bracket selezionato: inserisci una squadra della
  // sezione Squadre in uno slot libero, sostituisci o rimuovi quella presente,
  // senza dover passare dal pannello pool.
  const [slotPickerOpen, setSlotPickerOpen] = React.useState(false);
  const [slotPickerQuery, setSlotPickerQuery] = React.useState('');

  const selectedBracketSlot = React.useMemo(() => {
    if (dragSource || selection?.kind !== 'bracket-slot') return null;
    const slotKey = selection.slotKey;
    const matchId = slotKey.split('|')[0] || '';
    const match = getMatchById(draft.state.present, matchId);
    if (!match) return null;
    const value = String(getSlotValue(draft.state.present, slotKey) || '').trim();
    const isFree = !value || isPlaceholderTeamId(value);
    const team = !isFree ? (draft.state.present.catalogTeams || []).find((entry) => entry.id === value) : undefined;
    const clearCheck = !isFree ? canClearBracketSlot(draft.state.present, slotKey) : null;
    return {
      slotKey,
      isFree,
      teamName: team?.name || (!isFree ? value : ''),
      slotLabel: slotDisplayLabel(slotKey),
      locked: isLockedBracketMatchForStructureEdit(match),
      clearCheck,
    };
  }, [dragSource, selection, draft.state.present, slotDisplayLabel]);

  React.useEffect(() => {
    setSlotPickerOpen(false);
    setSlotPickerQuery('');
  }, [selectedBracketSlot?.slotKey]);

  const slotPickerOptions = React.useMemo<TeamPickerOption[]>(() => {
    if (!selectedBracketSlot || !slotPickerOpen) return [];
    return poolEntries.map((entry) => {
      const check = selectedBracketSlot.isFree
        ? canInsertTeamIntoBracketSlot(draft.state.present, entry.team.id, selectedBracketSlot.slotKey)
        : canReplaceBracketSlot(draft.state.present, selectedBracketSlot.slotKey, entry.team.id);
      const disabled = entry.disabled || !check.allowed;
      return {
        id: entry.team.id,
        name: entry.team.name,
        disabled,
        badge: entry.badgeLabel,
        placement: entry.placementLabel,
        reason: disabled ? (entry.disabled ? entry.humanMessage : check.humanMessage) : undefined,
      };
    });
  }, [selectedBracketSlot, slotPickerOpen, poolEntries, draft.state.present]);

  const handleSlotPickerSelect = React.useCallback((teamId: string) => {
    if (!selectedBracketSlot) return;
    const operation: StructuralOperation = selectedBracketSlot.isFree
      ? { type: 'INSERT_TEAM_IN_BRACKET_SLOT', slotKey: selectedBracketSlot.slotKey, teamId }
      : { type: 'REPLACE_BRACKET_SLOT', slotKey: selectedBracketSlot.slotKey, newTeamId: teamId };
    applyOperation(operation, 'success');
    setSlotPickerOpen(false);
    setSlotPickerQuery('');
    clearInteraction();
  }, [applyOperation, clearInteraction, selectedBracketSlot]);

  const handleRemoveSelectedSlotTeam = React.useCallback(() => {
    if (!selectedBracketSlot || selectedBracketSlot.isFree) return;
    if (selectedBracketSlot.clearCheck && !selectedBracketSlot.clearCheck.allowed) {
      setInteractionMessage(selectedBracketSlot.clearCheck.humanMessage || t('editor_invalid_target'));
      return;
    }
    applyOperation({ type: 'CLEAR_BRACKET_SLOT', slotKey: selectedBracketSlot.slotKey }, 'success');
    setSlotPickerOpen(false);
    setSlotPickerQuery('');
    clearInteraction();
  }, [applyOperation, clearInteraction, selectedBracketSlot, t]);

  const toggleBracketFullscreen = React.useCallback(async () => {
    const node = bracketWorkspaceRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen();
      } else {
        await node.requestFullscreen();
      }
    } catch {
      setInteractionMessage(t('editor_fullscreen_failed'));
    }
  }, [t]);

  const bracketActiveCheckMap = React.useMemo(() => {
    const valid = new Set<string>();
    const invalid = new Set<string>();
    for (const slotKey of allBracketSlotKeys) {
      const check = bracketTargetCheck(slotKey);
      if (!check) continue;
      if (check.allowed) valid.add(slotKey);
      else invalid.add(slotKey);
    }
    return { valid, invalid };
  }, [allBracketSlotKeys, bracketTargetCheck]);
  const interactiveByeSlots = React.useMemo(() => {
    const activeSource = dragSource || selection;
    return activeSource?.kind === 'pool-team' || activeSource?.kind === 'bracket-slot';
  }, [dragSource, selection]);

  const highlightedBracketSlots = React.useMemo(() => {
    const active = new Set<string>(Array.from(bracketActiveCheckMap.valid));
    if (selection?.kind === 'bracket-slot') active.add(selection.slotKey);
    if (hoverSlotKey && bracketActiveCheckMap.valid.has(hoverSlotKey)) active.add(hoverSlotKey);
    return Array.from(active);
  }, [bracketActiveCheckMap.valid, hoverSlotKey, selection]);

  const invalidBracketSlots = React.useMemo(() => {
    const invalid = new Set<string>(Array.from(bracketActiveCheckMap.invalid));
    if (hoverSlotKey && bracketActiveCheckMap.invalid.has(hoverSlotKey)) invalid.add(hoverSlotKey);
    return Array.from(invalid);
  }, [bracketActiveCheckMap.invalid, hoverSlotKey]);

  const changedBracketSlots = React.useMemo(
    () => Array.from(new Set([...draft.diff.bracketChanges.map((change) => change.slotKey), ...draft.diff.futureBracketChanges.map((change) => change.slotKey)])),
    [draft.diff.bracketChanges, draft.diff.futureBracketChanges]
  );

  const lockedBracketSlots = React.useMemo(
    () =>
      allBracketMatches.flatMap((match) =>
        isLockedBracketMatchForStructureEdit(match) ? [`${match.id}|A`, `${match.id}|B`] : []
      ),
    [allBracketMatches]
  );

  const applyPreparedSnapshot = React.useCallback(
    (prepared: ReturnType<typeof prepareTournamentStructureApply>, snackbarMessage: string) => {
      const mergedTeams = mergeTeamCatalog(state.teams || [], prepared.snapshot.catalogTeams || []);
      const nextTournament = prepared.tournament ? { ...prepared.tournament, matches: prepared.matches } : prepared.tournament;
      const rebasedSnapshot = { ...prepared.snapshot, catalogTeams: mergedTeams };
      setState({ ...state, teams: mergedTeams, tournament: nextTournament, tournamentMatches: prepared.matches });
      draft.rebase(rebasedSnapshot);
      rebasedSignatureRef.current = buildSnapshotSignature(rebasedSnapshot);
      clearInteraction();
      setLiveOutOfSync(false);
      setInteractionMessage('');
      setConflictState(null);
      setPendingApplyLocal(null);
      setPendingLiveApply(null);
      setSnackbar({ tone: 'success', message: snackbarMessage });
    },
    [clearInteraction, draft, setState, state]
  );

  const handleApplyDraft = React.useCallback(async () => {
    const prepared = prepareTournamentStructureApply(draft.state.original, draft.state.present);
    if (!hasEditorChanges) {
      setInteractionMessage(t('editor_no_changes_to_apply'));
      return;
    }
    if (!prepared.validation.canApply) {
      setInteractionMessage(t('editor_fix_blocking_errors_first'));
      return;
    }

    setApplyBusy(true);
    const conflict = await preflightTournamentStructureConflict();
    if (!conflict.ok) {
      setConflictState(conflict);
      setPendingApplyLocal(prepared);
      setApplyBusy(false);
      return;
    }

    if (hasLiveTournament) {
      setPendingLiveApply(prepared);
      setApplyBusy(false);
      return;
    }

    applyPreparedSnapshot(prepared, t('editor_applied_to_live'));
    setApplyBusy(false);
  }, [applyPreparedSnapshot, draft.state.original, draft.state.present, hasEditorChanges, hasLiveTournament, t]);

  const handleReloadRemoteState = React.useCallback(async () => {
    setReloadBusy(true);
    const reloaded = await reloadRemoteTournamentStructureState();
    if (!reloaded.ok || !reloaded.state) {
      setSnackbar({ tone: 'error', message: reloaded.message || t('editor_reload_remote_failed') });
      setReloadBusy(false);
      return;
    }

    setState(reloaded.state);
    if (reloaded.etag) setRemoteBaseUpdatedAt(reloaded.etag);
    if (reloaded.state.tournament) {
      const snapshot = buildTournamentStructureSnapshot(
        reloaded.state.tournament,
        reloaded.state.tournamentMatches || [],
        reloaded.state.teams || []
      );
      draft.rebase(snapshot);
      rebasedSignatureRef.current = buildSnapshotSignature(snapshot);
    }
    clearInteraction();
    setConflictState(null);
    setPendingApplyLocal(null);
    setLiveOutOfSync(false);
    setSnackbar({ tone: 'success', message: t('editor_reloaded_from_remote') });
    setReloadBusy(false);
  }, [clearInteraction, draft, setState]);

  const handleDiscardDraft = React.useCallback(() => {
    draft.reset();
    clearInteraction();
    setConflictState(null);
    setPendingApplyLocal(null);
    setPendingLiveApply(null);
    setLiveOutOfSync(false);
    setInteractionMessage(t('editor_discarded_message'));
    setSnackbar({ tone: 'info', message: t('editor_draft_restored') });
  }, [clearInteraction, draft, t]);

  const handleRefreshFromCurrentLive = React.useCallback(() => {
    draft.rebase(sourceSnapshot);
    rebasedSignatureRef.current = sourceSignature;
    clearInteraction();
    setLiveOutOfSync(false);
    setPendingLiveApply(null);
    setInteractionMessage(t('editor_rebased_live_message'));
    setSnackbar({ tone: 'info', message: t('editor_rebased_live_snackbar') });
  }, [clearInteraction, draft, sourceSignature, sourceSnapshot, t]);

  const validationTone = toneForValidation(draft.validation.blockingErrors.length, draft.validation.warnings.length);
  const openPersistenceTools = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('flbp:open-data-persistence'));
  }, []);

  const teamLabel = React.useCallback(
    (teamId?: string) => {
      if (!teamId) return t('dash');
      if (isPlaceholderTeamId(teamId)) return teamId;
      return getCatalogTeam(draft.state.present, teamId)?.name || teamId;
    },
    [draft.state.present, t]
  );

  const bracketPairRounds = React.useMemo(
    () => buildBracketRoundsFromMatches(draft.state.present.matches || []),
    [draft.state.present.matches]
  );

  const selectedActionLabel = React.useMemo(() => {
    const activeSource = dragSource || selection;
    if (!activeSource) return '';
    if (activeSource.kind === 'pool-team') return getCatalogTeam(draft.state.present, activeSource.teamId)?.name || activeSource.teamId;
    if (activeSource.kind === 'group-team') return getCatalogTeam(draft.state.present, activeSource.teamId)?.name || activeSource.teamId;
    return teamLabel(activeSource.teamId) || slotDisplayLabel(activeSource.slotKey);
  }, [dragSource, draft.state.present, selection, slotDisplayLabel, teamLabel]);
  const selectedPoolTeamForAction = React.useMemo(() => {
    const activeSource = dragSource || selection;
    if (activeSource?.kind !== 'pool-team') return null;
    return getCatalogTeam(draft.state.present, activeSource.teamId) || null;
  }, [dragSource, draft.state.present, selection]);

  const blockedAdvancementItems = React.useMemo<BlockedAdvancementPreview[]>(() => {
    const snapshot = draft.state.present;
    return getBracketMatches(snapshot)
      .map((match) => {
        const winner = resolveWinnerTeamId(match);
        if (!winner || isPlaceholderTeamId(winner)) return null;
        const successor = findSuccessorMatch(snapshot.matches || [], match.id);
        if (!successor || !isLockedBracketMatchForStructureEdit(successor.match)) return null;
        const targetValue = String((successor.match as any)[successor.slot] || '').trim();
        if (targetValue === winner) return null;
        const successorSide = successor.slot === 'teamAId' ? 'A' : 'B';
        return {
          sourceLabel: match.code || match.roundName || (match.round ? t('round_n').replace('{n}', String(match.round)) : t('bracket_word')),
          winnerLabel: teamLabel(winner),
          targetLabel: slotDisplayLabel(`${successor.match.id}|${successorSide}`),
        };
      })
      .filter(Boolean) as BlockedAdvancementPreview[];
  }, [draft.state.present, slotDisplayLabel, t, teamLabel]);

  const freeRound1PairMatches = React.useMemo(
    () =>
      round1Matches.filter((match) => {
        if (isLockedBracketMatchForStructureEdit(match)) return false;
        const teamA = String(match.teamAId || '').trim();
        const teamB = String(match.teamBId || '').trim();
        return (!teamA || isPlaceholderTeamId(teamA)) && (!teamB || isPlaceholderTeamId(teamB));
      }),
    [round1Matches]
  );

  const selectedWizardTeamId = selection?.kind === 'pool-team' ? selection.teamId : null;
  const selectedWizardTeam = selectedWizardTeamId ? getCatalogTeam(draft.state.present, selectedWizardTeamId) : null;
  const firstFreeRound1Pair = freeRound1PairMatches[0] || null;

  const handleWizardInsertSelectedTeam = React.useCallback(() => {
    if (!selectedWizardTeamId || !firstFreeRound1Pair) return;
    handleBracketSlotAction(`${firstFreeRound1Pair.id}|A`);
  }, [firstFreeRound1Pair, handleBracketSlotAction, selectedWizardTeamId]);

  const placementLabel = React.useCallback((placement?: CurrentPlacement) => {
    if (!placement) return t('editor_not_assigned_lower');
    if (placement.phase === 'groups') return placement.containerName || t('group_word');
    return placement.slotKey ? slotDisplayLabel(placement.slotKey) : (placement.containerName || t('bracket_word'));
  }, [slotDisplayLabel, t]);

  const recentOperations = React.useMemo(() => draft.state.log.slice(-8).reverse(), [draft.state.log]);
  const operationLabel = React.useCallback((type: StructuralOperation['type']) => {
    switch (type) {
      case 'INSERT_TEAM_IN_GROUP':
        return 'Inserimento nei gironi';
      case 'MOVE_TEAM_BETWEEN_GROUPS':
        return 'Spostamento nei gironi';
      case 'SWAP_GROUP_TEAMS':
        return 'Scambio nei gironi';
      case 'REPLACE_GROUP_TEAM':
        return 'Sostituzione nei gironi';
      case 'REMOVE_GROUP_TEAM':
        return 'Rimozione dai gironi';
      case 'INSERT_TEAM_IN_BRACKET_SLOT':
        return 'Inserimento nel tabellone';
      case 'REPLACE_BRACKET_SLOT':
        return 'Sostituzione nel tabellone';
      case 'MOVE_BRACKET_SLOT':
        return 'Spostamento nel tabellone';
      case 'SWAP_BRACKET_SLOTS':
        return 'Scambio nel tabellone';
      case 'CLEAR_BRACKET_SLOT':
        return 'Rimozione dal tabellone';
      case 'ADD_CATALOG_TEAM':
        return 'Nuova squadra';
      case 'ADD_PRELIMINARY_BRACKET_ROUND':
        return 'Nuovo turno preliminare';
      default:
        return 'Aggiornamento struttura';
    }
  }, []);
  const issueLabel = React.useCallback((code?: string, fallback = 'Da correggere') => {
    if (!code) return fallback;
    if (code.includes('duplicate')) return 'Squadra duplicata';
    if (code.includes('locked')) return 'Match bloccato';
    if (code.includes('placeholder') || code.includes('excluded')) return 'Squadra da sistemare';
    return fallback;
  }, []);
  const draftStatusLabel = draft.validation.blockingErrors.length
    ? t('editor_status_blocking_errors')
    : hasEditorChanges
      ? draft.validation.canApply
        ? t('editor_status_ready_to_apply')
        : t('editor_status_active_draft')
      : t('editor_status_no_changes');

  const scrollToPreview = React.useCallback(() => {
    previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToBracketWorkspace = React.useCallback(() => {
    setView('bracket');
    window.requestAnimationFrame(() => {
      bracketWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const navigateToIssue = React.useCallback(
    (issue: { groupId?: string; slotKey?: string; teamId?: string; message: string }) => {
      setInteractionMessage(issue.message);
      if (issue.groupId) {
        setView('groups');
        const group = draft.state.present.tournament.groups?.find((row) => row.id === issue.groupId);
        if (issue.teamId && group?.teams?.some((team) => team.id === issue.teamId)) {
          setSelection({ kind: 'group-team', teamId: issue.teamId, groupId: issue.groupId });
        } else if (issue.teamId) {
          setSelection({ kind: 'pool-team', teamId: issue.teamId });
        } else {
          clearInteraction();
        }
        window.setTimeout(() => {
          document.getElementById(`editor-group-${issue.groupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 20);
        return;
      }
      if (issue.slotKey) {
        setView('bracket');
        const teamId = getSlotValue(draft.state.present, issue.slotKey) || undefined;
        setSelection({ kind: 'bracket-slot', slotKey: issue.slotKey, teamId });
        window.setTimeout(() => {
          document.getElementById('editor-bracket-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 20);
        return;
      }
      if (issue.teamId) {
        setSelection({ kind: 'pool-team', teamId: issue.teamId });
      }
    },
    [clearInteraction, draft.state.present]
  );

  const renderBracketPairSlot = (match: Match, side: 'A' | 'B') => {
    const field = side === 'A' ? 'teamAId' : 'teamBId';
    const slotKey = `${match.id}|${side}`;
    const value = String((match as any)[field] || '').trim();
    const isPlaceholder = !value || isPlaceholderTeamId(value);
    const check = bracketTargetCheck(slotKey);
    const selected = selection?.kind === 'bracket-slot' && selection.slotKey === slotKey;
    const changed = changedBracketSlots.includes(slotKey);
    const locked = isLockedBracketMatchForStructureEdit(match);
    const canDragSlot = !!value && !isPlaceholder && !locked;
    const slotTone = check
      ? check.allowed
        ? 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] text-[var(--editor-success-700)]'
        : 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)]'
      : selected
        ? 'border-[color:var(--editor-border-brand)] bg-[var(--editor-bg-selected)] text-[var(--editor-brand-700)]'
        : changed
          ? 'border-violet-200 bg-[var(--editor-bg-changed)] text-[var(--editor-draft-700)]'
          : isPlaceholder
            ? 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)] border-dashed'
            : locked
              ? 'border-[color:var(--editor-locked-border)] bg-[var(--editor-locked-bg)] text-[var(--editor-locked-text)]'
              : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] text-[var(--editor-text-primary)] hover:border-[color:var(--editor-border-brand)] hover:bg-[var(--editor-bg-hover)]';

    return (
      <div key={slotKey} className="space-y-1.5">
        <button
          type="button"
          draggable={canDragSlot}
          onDragStart={() => {
            if (!canDragSlot) return;
            setDragSource({ kind: 'bracket-slot', slotKey, teamId: value });
            setSelection({ kind: 'bracket-slot', slotKey, teamId: value });
            setInteractionMessage(t('editor_drag_slot_round1'));
          }}
          onDragEnd={() => {
            setDragSource(null);
            setHoverSlotKey('');
          }}
          onDragOver={(event) => {
            if (check?.allowed) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!check?.allowed) {
              setInteractionMessage(check?.humanMessage || t('editor_invalid_target'));
              setDragSource(null);
              setHoverSlotKey('');
              return;
            }
            handleBracketSlotAction(slotKey);
            setHoverSlotKey('');
            setDragSource(null);
          }}
          onClick={() => handleBracketSlotAction(slotKey)}
          className={`min-h-[56px] w-full rounded-[16px] border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${slotTone}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-wide opacity-70">
                {side === 'A' ? t('editor_team_a') : t('editor_team_b')}
              </div>
              <div className="mt-0.5 text-sm font-black leading-tight">
                {isPlaceholder ? t('editor_no_opponent') : teamLabel(value)}
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-current/15 bg-white/60 px-2 py-1 text-[10px] font-black">
              {isPlaceholder ? t('editor_without_opponent') : side}
            </span>
          </div>
        </button>
        {check && !check.allowed ? (
          <div className="rounded-[12px] border border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] px-3 py-2 text-[11px] font-bold text-[var(--editor-danger-700)]">
            {check.humanMessage}
          </div>
        ) : check?.allowed ? (
          <div className="rounded-[12px] border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-3 py-2 text-[11px] font-bold text-[var(--editor-success-700)]">
            {check.humanMessage}
          </div>
        ) : null}
      </div>
    );
  };

  const renderBracketPairCard = (match: Match) => {
    const winnerId = resolveWinnerTeamId(match);
    const successor = findSuccessorMatch(draft.state.present.matches || [], match.id);
    const successorSide = successor?.slot === 'teamAId' ? 'A' : 'B';
    const successorLocked = !!successor && isLockedBracketMatchForStructureEdit(successor.match);
    const hasMissingOpponent =
      !String(match.teamAId || '').trim() ||
      !String(match.teamBId || '').trim() ||
      isPlaceholderTeamId(match.teamAId) ||
      isPlaceholderTeamId(match.teamBId);
    const matchLabel = match.roundName || (match.round ? t('round_n').replace('{n}', String(match.round)) : t('bracket_word'));
    const successorLabel = successor
      ? `${successor.match.roundName || (successor.match.round ? t('round_n').replace('{n}', String(successor.match.round)) : t('bracket_word'))} · ${t('editor_slot_short')} ${successorSide}`
      : t('editor_no_successor_final');

    return (
      <div
        key={match.id}
        className={`rounded-[20px] border p-4 shadow-sm transition-all duration-200 ${
          successorLocked
            ? 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)]'
            : hasMissingOpponent
              ? 'border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)]/55'
              : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[var(--editor-text-primary)]">{matchLabel}</div>
            {match.code ? <div className="mt-0.5 text-[11px] font-bold text-[var(--editor-text-muted)]">{match.code}</div> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {winnerId ? (
              <span className="rounded-full border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-2.5 py-1 text-[11px] font-black text-[var(--editor-success-700)]">
                {t('editor_winner_decided')}
              </span>
            ) : null}
            {hasMissingOpponent ? (
              <span className="rounded-full border border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] px-2.5 py-1 text-[11px] font-black text-[var(--editor-danger-700)]">
                {t('editor_without_opponent')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {renderBracketPairSlot(match, 'A')}
          <div className="text-center text-[11px] font-black uppercase tracking-wide text-[var(--editor-text-muted)]">vs</div>
          {renderBracketPairSlot(match, 'B')}
        </div>

        <div
          className={`mt-3 rounded-[14px] border px-3 py-2 text-xs font-black ${
            successorLocked
              ? 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)]'
              : 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] text-[var(--editor-success-700)]'
          }`}
        >
          {successorLocked
            ? t('editor_winner_cannot_advance')
            : t('editor_winner_goes_to').replace('{target}', successorLabel)}
        </div>
      </div>
    );
  };

  if (!hasLiveTournament) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="text-xl font-black text-slate-900">{t('editor_title')}</div>
        <div className="mt-2 text-sm font-bold text-slate-600">
          {t('editor_no_live_desc')}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1760px] space-y-6 text-[var(--editor-text-primary)]" style={editorThemeVars}>
      <div className={`${editorPanelClass} xl:sticky xl:top-3 z-20 overflow-hidden`}>
        <div className="border-b border-[color:var(--editor-border-subtle)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] px-5 py-5 md:px-6 backdrop-blur-sm">
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-brand-50)] text-[var(--editor-brand-700)] shadow-[0_10px_24px_-18px_rgba(37,99,235,0.4)]">
                  <Brackets className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[28px] font-bold leading-[1.15] text-[var(--editor-text-primary)]">{t('editor_title')}</h3>
                  <p className="mt-1 max-w-[74ch] text-sm font-medium leading-6 text-[var(--editor-text-secondary)]">
                    {t('editor_header_desc')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex min-h-6 items-center gap-2 rounded-full border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 py-1 text-[11px] font-semibold text-[var(--editor-text-secondary)]">
                  <span className="text-[var(--editor-text-muted)]">{t('editor_tournament_label')}</span>
                  <span className="text-[var(--editor-text-primary)]">{state.tournament?.name || t('dash')}</span>
                </span>
                <span className="inline-flex min-h-6 items-center gap-2 rounded-full border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 py-1 text-[11px] font-semibold text-[var(--editor-text-secondary)]">
                  <span className="text-[var(--editor-text-muted)]">{t('editor_format_label')}</span>
                  <span className="text-[var(--editor-text-primary)]">{state.tournament?.type || t('dash')}</span>
                </span>
                <span
                  className={`inline-flex min-h-6 items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    validationTone === 'rose'
                      ? 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)]'
                      : validationTone === 'amber'
                        ? 'border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] text-[var(--editor-warning-700)]'
                        : hasEditorChanges
                          ? 'border-[color:var(--editor-draft-100)] bg-[var(--editor-draft-50)] text-[var(--editor-draft-700)]'
                          : 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] text-[var(--editor-success-700)]'
                  }`}
                >
                  {draftStatusLabel}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={handleDiscardDraft} disabled={!hasEditorChanges} className={editorGhostButtonClass}>
                <RotateCcw className="h-4 w-4" />
                {t('editor_reset_draft')}
              </button>
              <button type="button" onClick={draft.undo} disabled={draft.state.past.length === 0} className={editorGhostButtonClass}>
                <Undo2 className="h-4 w-4" />
                {t('editor_undo')}
              </button>
              <button type="button" onClick={draft.redo} disabled={draft.state.future.length === 0} className={editorGhostButtonClass}>
                <Redo2 className="h-4 w-4" />
                {t('editor_redo')}
              </button>
              <button type="button" onClick={scrollToPreview} className={editorOutlineButtonClass}>
                <Eye className="h-4 w-4" />
                {t('editor_preview')}
              </button>
              <button
                type="button"
                onClick={handleApplyDraft}
                disabled={applyBusy || !hasEditorChanges || !draft.validation.canApply}
                className={editorPrimaryButtonClass}
              >
                <Save className="h-4 w-4" />
                {applyBusy ? t('editor_applying') : t('editor_apply_changes')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 md:px-6">
          {interactionMessage ? (
            <div className="rounded-[18px] border border-[color:var(--editor-info-100)] bg-[var(--editor-info-50)] px-4 py-3 text-sm font-medium text-[var(--editor-info-700)] shadow-[0_12px_24px_-24px_rgba(2,132,199,0.35)]">
              {interactionMessage}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] px-4 py-3 text-sm font-medium text-[var(--editor-text-secondary)]">
              {t('editor_select_team_or_slot')}
            </div>
          )}

        {liveOutOfSync ? (
          <div className="rounded-[18px] border border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] px-4 py-3 shadow-[0_12px_24px_-24px_rgba(217,119,6,0.35)]">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-[var(--editor-warning-700)] inline-flex items-center gap-2">
                  <TriangleAlert className="w-4 h-4" />
                  {t('editor_live_changed_title')}
                </div>
                <div className="mt-1 text-xs font-medium text-[var(--editor-warning-700)]/85">
                  {t('editor_live_changed_desc')}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRefreshFromCurrentLive}
                className={editorGhostButtonClass}
              >
                {t('editor_reload_editor')}
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:gap-5 2xl:grid-cols-[320px_minmax(0,1fr)_360px] xl:grid-cols-[292px_minmax(0,1fr)_332px]">
        <aside className={`${editorPanelClass} p-4 lg:p-4 xl:p-5 space-y-4 self-start`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-bold text-[var(--editor-text-primary)]">{t('editor_pool_title')}</div>
              <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">
                {t('editor_pool_results_and_workspace')
                  .replace('{count}', String(filteredPoolEntries.length))
                  .replace('{workspace}', currentPhase === 'groups' ? t('editor_workspace_groups') : t('editor_workspace_bracket'))}
              </div>
            </div>
            {selection?.kind === 'pool-team' ? (
              <button
                type="button"
                onClick={clearInteraction}
                className="inline-flex h-9 items-center rounded-[10px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 text-xs font-semibold text-[var(--editor-text-secondary)] shadow-[0_8px_16px_-20px_rgba(15,23,42,0.24)] transition-all duration-150 hover:border-[color:var(--editor-border-default)] hover:bg-[var(--editor-bg-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
              >
                {t('editor_deselect')}
              </button>
            ) : null}
          </div>

          <TeamPickerCombobox
            label={t('editor_pool_picker_label')}
            query={poolQuery}
            onQueryChange={setPoolQuery}
            items={comboboxItems}
            selectedId={selectedTeamId}
            onSelect={setSelectedPoolTeam}
            placeholder={t('editor_pool_picker_placeholder')}
          />

          <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_new_team_quick_title')}</div>
                <div className="mt-1 text-[11px] font-medium text-[var(--editor-text-muted)]">{t('editor_new_team_quick_desc')}</div>
              </div>
              <button
                type="button"
                onClick={() => setNewTeamOpen((value) => !value)}
                className="inline-flex h-9 items-center rounded-[10px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 text-xs font-semibold text-[var(--editor-text-secondary)] shadow-[0_8px_16px_-20px_rgba(15,23,42,0.24)] transition-all duration-150 hover:border-[color:var(--editor-border-default)] hover:bg-[var(--editor-bg-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
              >
                {newTeamOpen ? t('close') : t('editor_add_action')}
              </button>
            </div>
            {newTeamOpen ? (
              <div className="mt-3 space-y-3">
                <input
                  value={newTeamName}
                  onChange={(event) => setNewTeamName(event.target.value)}
                  placeholder={t('editor_team_name_placeholder')}
                  className="h-11 w-full rounded-[14px] border border-[color:var(--editor-border-default)] bg-[var(--editor-bg-surface)] px-3 text-sm font-medium text-[var(--editor-text-primary)] placeholder:text-[var(--editor-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    value={newTeamPlayer1}
                    onChange={(event) => setNewTeamPlayer1(event.target.value)}
                    placeholder={t('editor_player1_placeholder')}
                    className="h-11 w-full rounded-[14px] border border-[color:var(--editor-border-default)] bg-[var(--editor-bg-surface)] px-3 text-sm font-medium text-[var(--editor-text-primary)] placeholder:text-[var(--editor-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
                  />
                  <input
                    value={newTeamPlayer2}
                    onChange={(event) => setNewTeamPlayer2(event.target.value)}
                    placeholder={t('editor_player2_placeholder')}
                    className="h-11 w-full rounded-[14px] border border-[color:var(--editor-border-default)] bg-[var(--editor-bg-surface)] px-3 text-sm font-medium text-[var(--editor-text-primary)] placeholder:text-[var(--editor-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2"
                  />
                </div>
                <div className="rounded-[14px] border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-soft)] px-3 py-2 text-[11px] font-medium text-[var(--editor-text-muted)]">
                  {t('editor_new_team_hint_prefix')} <span className="font-semibold text-[var(--editor-text-primary)]">{t('editor_add_preliminary_round')}</span>{t('editor_new_team_hint_suffix')}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewTeamOpen(false);
                      setNewTeamName('');
                      setNewTeamPlayer1('');
                      setNewTeamPlayer2('');
                    }}
                    className={editorGhostButtonClass}
                  >
                    {t('editor_cancel_action')}
                  </button>
                  <button type="button" onClick={handleAddNewTeamToPool} className={editorOutlineButtonClass}>
                    {t('editor_save_to_pool')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(poolFilterLabel) as PoolFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPoolFilter(key)}
                className={`inline-flex min-h-[30px] items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  poolFilter === key
                    ? 'border-[color:var(--editor-border-brand)] bg-[var(--editor-brand-50)] text-[var(--editor-brand-700)] shadow-[0_8px_18px_-18px_rgba(37,99,235,0.25)]'
                    : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] text-[var(--editor-text-secondary)] hover:border-[color:var(--editor-border-default)] hover:bg-[var(--editor-bg-hover)]'
                }`}
              >
                {poolFilterLabel[key]}
                <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  poolFilter === key
                    ? 'bg-white/85 text-[var(--editor-brand-700)]'
                    : 'bg-[var(--editor-bg-surface)] text-[var(--editor-text-muted)]'
                }`}>
                  {poolCounts[key]}
                </span>
              </button>
            ))}
          </div>

          <div className="max-h-[62vh] overflow-y-auto space-y-2 pr-1">
            {filteredPoolEntries.map((entry) => {
              const isSelected = selection?.kind === 'pool-team' && selection.teamId === entry.team.id;
              const canDrag = !entry.disabled;
              const isChanged = changedPoolTeamIds.has(entry.team.id);
              return (
                <button
                  key={entry.team.id}
                  type="button"
                  disabled={entry.disabled}
                  draggable={canDrag}
                  onDragStart={() => {
                    if (!canDrag) return;
                    setDragSource({ kind: 'pool-team', teamId: entry.team.id });
                    setSelection({ kind: 'pool-team', teamId: entry.team.id });
                    setInteractionMessage(t('editor_drag_pool_team').replace('{name}', entry.team.name));
                  }}
                  onDragEnd={() => {
                    setDragSource(null);
                    setHoverSlotKey('');
                  }}
                  onClick={() => setSelectedPoolTeam(entry.team.id)}
                className={`relative w-full overflow-hidden rounded-[16px] border px-3 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${
                    entry.disabled
                      ? 'cursor-not-allowed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-disabled)] text-[var(--editor-text-disabled)] shadow-none opacity-100'
                      : isSelected
                        ? 'border-[color:var(--editor-border-brand)] bg-[var(--editor-bg-selected)] text-[var(--editor-text-primary)] shadow-[0_16px_34px_-26px_rgba(37,99,235,0.4)]'
                      : isChanged
                        ? 'border-violet-200 bg-[var(--editor-bg-changed)] text-[var(--editor-text-primary)] shadow-[0_14px_30px_-28px_rgba(109,40,217,0.28)]'
                        : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] text-[var(--editor-text-primary)] shadow-[0_12px_24px_-26px_rgba(15,23,42,0.2)] hover:border-[color:var(--editor-border-default)] hover:bg-[var(--editor-bg-hover)]'
                  }`}
                >
                  {isChanged ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[var(--editor-draft-600)]" /> : null}
                  <div className="flex items-start gap-3">
                    <GripVertical className={`mt-0.5 h-4 w-4 ${canDrag ? 'text-[var(--editor-text-muted)]' : 'text-[var(--editor-text-disabled)]'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold leading-tight text-[var(--editor-text-primary)]">{entry.team.name}</div>
                        <span className={`shrink-0 inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${toneForStatus(entry.status)}`}>
                          {entry.badgeLabel}
                        </span>
                      </div>
                        <div className="mt-1 text-[11px] font-medium text-[var(--editor-text-secondary)]">{entry.placementLabel || t('editor_not_assigned')}</div>
                      {isChanged ? (
                        <div className="mt-1 text-[11px] font-medium text-[var(--editor-draft-700)]">{t('editor_changed_in_draft')}</div>
                      ) : null}
                      {entry.disabled ? (
                        <div className="mt-1 text-[11px] font-medium text-[var(--editor-text-muted)]">{entry.humanMessage}</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}

            {!filteredPoolEntries.length ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] px-4 py-8 text-center">
                <Users className="mx-auto h-5 w-5 text-[var(--editor-text-muted)]" />
                <div className="mt-3 text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_no_team_found')}</div>
                <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">{t('editor_try_other_filter')}</div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className={`${editorPanelClass} min-w-0 p-4 lg:p-4 xl:p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-base font-bold text-[var(--editor-text-primary)]">{t('editor_workspace_title')}</div>
              <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">
                {t('editor_workspace_desc')}
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-[14px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-soft)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              <button
                type="button"
                onClick={() => setView('groups')}
                disabled={!groupsAvailable}
                className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${
                  view === 'groups'
                    ? 'bg-[var(--editor-bg-surface)] text-[var(--editor-brand-700)] shadow-sm ring-1 ring-[color:var(--editor-border-brand)]'
                    : 'bg-transparent text-[var(--editor-text-secondary)] hover:bg-[var(--editor-bg-surface)]'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Users className="w-4 h-4" /> {t('groups_label')}
              </button>
              <button
                type="button"
                onClick={() => setView('bracket')}
                disabled={!bracketAvailable}
                className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${
                  view === 'bracket'
                    ? 'bg-[var(--editor-bg-surface)] text-[var(--editor-brand-700)] shadow-sm ring-1 ring-[color:var(--editor-border-brand)]'
                    : 'bg-transparent text-[var(--editor-text-secondary)] hover:bg-[var(--editor-bg-surface)]'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Brackets className="w-4 h-4" /> {t('bracket_word')}
              </button>
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-black uppercase tracking-wide text-[var(--editor-text-muted)]">{t('editor_state_legend')}</span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--editor-border-brand)] bg-[var(--editor-bg-selected)] px-3 py-1 text-xs font-black text-[var(--editor-brand-700)]">{t('editor_state_selected')}</span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-3 py-1 text-xs font-black text-[var(--editor-success-700)]">{t('editor_state_valid')}</span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] px-3 py-1 text-xs font-black text-[var(--editor-danger-700)]">{t('editor_state_invalid')}</span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-violet-200 bg-[var(--editor-bg-changed)] px-3 py-1 text-xs font-black text-[var(--editor-draft-700)]">{t('editor_state_modified')}</span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-[color:var(--editor-locked-border)] bg-[var(--editor-locked-bg)] px-3 py-1 text-xs font-black text-[var(--editor-locked-text)]">{t('editor_state_blocked')}</span>
            </div>
          </div>

          {view === 'groups' ? (
            groupsAvailable ? (
              <div className="space-y-4">
                {hasRealBracketStarted(draft.state.present) ? (
                  <div className="rounded-[18px] border border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] px-4 py-3 text-sm font-medium text-[var(--editor-warning-700)]">
                    {t('editor_groups_locked_because_bracket_started')}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                  {(draft.state.present.tournament.groups || []).map((group) => {
                    const cardCheck = groupCardCheck(group.id);
                    const cardChanged = draft.diff.changedGroupIds.includes(group.id);
                    return (
                      <div
                        id={`editor-group-${group.id}`}
                        key={group.id}
                        onDragOver={(event) => {
                          if (cardCheck?.allowed) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (cardCheck?.allowed) handleGroupCardAction(group.id);
                        }}
                        className={`rounded-[18px] border p-4 transition-all duration-150 ${
                          cardCheck
                            ? cardCheck.allowed
                              ? 'border-[color:var(--editor-brand-100)] bg-[var(--editor-brand-50)] shadow-[0_16px_34px_-28px_rgba(37,99,235,0.35)]'
                              : 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)]'
                            : cardChanged
                              ? 'border-violet-200 bg-[var(--editor-bg-changed)]'
                              : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-bold text-[var(--editor-text-primary)]">{group.name}</div>
                            <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">
                              {t('editor_group_teams_count').replace('{count}', String((group.teams || []).filter((team) => !team.hidden && !team.isBye).length))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {cardChanged ? (
                              <span className="rounded-full border border-violet-200 bg-[var(--editor-bg-changed)] px-2.5 py-1 text-[11px] font-semibold text-[var(--editor-draft-700)]">
                                {t('editor_changed_badge')}
                              </span>
                            ) : null}
                            {isFinalGroup(group) ? (
                              <span className="rounded-full border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--editor-text-secondary)]">
                                {t('editor_final_badge')}
                              </span>
                            ) : null}
                          </div>
                        </div>

                          <button
                            type="button"
                            disabled={!cardCheck?.allowed}
                            onClick={() => handleGroupCardAction(group.id)}
                            className={`mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${
                              cardCheck?.allowed
                                ? 'border-[color:var(--editor-border-brand)] bg-[var(--editor-bg-surface)] text-[var(--editor-brand-700)] hover:bg-[var(--editor-brand-50)]'
                                : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] text-[var(--editor-text-disabled)]'
                          }`}
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                          {selection?.kind === 'pool-team'
                            ? t('editor_insert_into_group')
                            : selection?.kind === 'group-team'
                              ? t('editor_move_into_group')
                              : t('editor_group_drop_zone')}
                        </button>

                        {cardCheck ? (
                          <div className={`mt-2 text-xs font-medium ${cardCheck.allowed ? 'text-[var(--editor-brand-700)]' : 'text-[var(--editor-danger-700)]'}`}>
                            {cardCheck.humanMessage}
                          </div>
                        ) : null}

                        <div className="mt-3 space-y-2">
                          {(group.teams || []).map((team) => {
                            const rowCheck = groupRowCheck(group.id, team.id);
                            const locked = findTeamStartedInPhase(draft.state.present, team.id, 'groups');
                            const rowChanged = changedGroupTeamIds.has(team.id);
                            const isSelected =
                              selection?.kind === 'group-team' && selection.teamId === team.id && selection.groupId === group.id;
                            return (
                              <button
                                key={`${group.id}:${team.id}`}
                                type="button"
                                draggable={!locked && !hasRealBracketStarted(draft.state.present)}
                                onDragStart={() => {
                                  if (locked || hasRealBracketStarted(draft.state.present)) return;
                                  setDragSource({ kind: 'group-team', teamId: team.id, groupId: group.id });
                                  setSelection({ kind: 'group-team', teamId: team.id, groupId: group.id });
                                  setInteractionMessage(t('editor_drag_group_team').replace('{name}', team.name));
                                }}
                                onDragEnd={() => setDragSource(null)}
                                onDragOver={(event) => {
                                  if (rowCheck?.allowed) event.preventDefault();
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (rowCheck?.allowed) handleGroupRowAction(group.id, team.id);
                                }}
                                onClick={() => handleGroupRowAction(group.id, team.id)}
                                className={`relative w-full overflow-hidden rounded-[16px] border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-brand-500)] focus-visible:ring-offset-2 ${
                                  rowCheck
                                    ? rowCheck.allowed
                                      ? 'border-[color:var(--editor-brand-100)] bg-[var(--editor-brand-50)]'
                                      : 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)]'
                                    : isSelected
                                      ? 'border-[color:var(--editor-border-brand)] bg-[var(--editor-bg-selected)] shadow-[0_14px_30px_-26px_rgba(37,99,235,0.4)]'
                                      : rowChanged
                                        ? 'border-violet-200 bg-[var(--editor-bg-changed)]'
                                        : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] hover:bg-[var(--editor-bg-hover)]'
                                }`}
                              >
                                {rowChanged ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[var(--editor-draft-600)]" /> : null}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-[var(--editor-text-primary)] whitespace-normal break-words leading-tight">{team.name}</div>
                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                      {locked ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--editor-locked-border)] bg-[var(--editor-locked-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--editor-locked-text)]">
                                          <Lock className="w-3 h-3" /> {t('editor_status_locked')}
                                        </span>
                                      ) : null}
                                      {rowChanged ? (
                                        <span className="rounded-full border border-violet-200 bg-[var(--editor-bg-changed)] px-2.5 py-1 text-[11px] font-semibold text-[var(--editor-draft-700)]">
                                          {t('editor_changed_badge')}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <GripVertical className="mt-1 h-4 w-4 shrink-0 text-[var(--editor-text-disabled)]" />
                                </div>
                                {rowCheck ? (
                                  <div className={`mt-2 rounded-[12px] border px-3 py-2 text-[11px] font-bold ${
                                    rowCheck.allowed
                                      ? 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] text-[var(--editor-success-700)]'
                                      : 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)]'
                                  }`}>
                                    {rowCheck.humanMessage}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] px-4 py-12 text-center">
                <Users className="mx-auto h-5 w-5 text-[var(--editor-text-muted)]" />
                <div className="mt-3 text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_no_editable_groups_title')}</div>
                <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">{t('editor_no_editable_groups_desc')}</div>
              </div>
            )
          ) : bracketAvailable ? (
            <div className="space-y-4">
              <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] px-4 py-3 text-sm font-medium text-[var(--editor-text-secondary)]">
                {t('editor_bracket_editorial_round1')}
              </div>

              <div className="rounded-[22px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 text-base font-black text-[var(--editor-text-primary)]">
                      <Brackets className="h-4 w-4 text-[var(--editor-brand-700)]" />
                      {t('editor_add_team_wizard_title')}
                    </div>
                    <div className="mt-1 text-xs font-bold text-[var(--editor-text-muted)]">{t('editor_add_team_wizard_live_badge')}</div>
                  </div>
                  <button type="button" onClick={scrollToPreview} className={editorGhostButtonClass}>
                    <Eye className="h-4 w-4" />
                    {t('editor_preview')}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                  <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--editor-brand-50)] text-sm font-black text-[var(--editor-brand-700)]">1</span>
                      <div>
                        <div className="text-sm font-black text-[var(--editor-text-primary)]">{t('editor_wizard_step_choose')}</div>
                        <div className="text-[11px] font-bold text-[var(--editor-text-muted)]">{t('editor_wizard_step_choose_desc')}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <TeamPickerCombobox
                        label={t('editor_pool_picker_label')}
                        query={wizardQuery}
                        onQueryChange={setWizardQuery}
                        items={poolEntries.map((entry) => ({
                          id: entry.team.id,
                          name: entry.team.name,
                          disabled: entry.disabled,
                          badge: entry.badgeLabel,
                          placement: entry.placementLabel || t('editor_not_assigned'),
                          reason: entry.disabled ? entry.humanMessage : undefined,
                        }))}
                        selectedId={selectedWizardTeamId}
                        onSelect={(id) => {
                          setSelectedPoolTeam(id);
                          setWizardQuery(getCatalogTeam(draft.state.present, id)?.name || '');
                        }}
                        placeholder={t('editor_pool_picker_placeholder')}
                      />
                    </div>
                    {selectedWizardTeam ? (
                      <div className="mt-3 rounded-[14px] border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-3 py-2 text-xs font-black text-[var(--editor-success-700)]">
                        {t('editor_wizard_selected_team').replace('{name}', selectedWizardTeam.name)}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--editor-brand-50)] text-sm font-black text-[var(--editor-brand-700)]">2</span>
                      <div>
                        <div className="text-sm font-black text-[var(--editor-text-primary)]">{t('editor_wizard_step_insert')}</div>
                        <div className="text-[11px] font-bold text-[var(--editor-text-muted)]">{t('editor_wizard_step_insert_desc')}</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {firstFreeRound1Pair ? (
                        <button
                          type="button"
                          disabled={!selectedWizardTeamId}
                          onClick={handleWizardInsertSelectedTeam}
                          className="min-h-[48px] w-full rounded-[14px] border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-3 py-2 text-left text-sm font-black text-[var(--editor-success-700)] transition hover:bg-[var(--editor-success-100)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t('editor_wizard_use_free_pair')}
                        </button>
                      ) : canExpandBracketWithPreliminaryRound ? (
                        <div className="rounded-[14px] border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-3 py-3 text-sm font-bold text-[var(--editor-success-700)]">
                          {t('editor_wizard_preliminary_recommended')}
                        </div>
                      ) : (
                        <div className="rounded-[14px] border border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] px-3 py-3 text-sm font-bold text-[var(--editor-warning-700)]">
                          {t('editor_wizard_no_safe_pair')}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleAddPreliminaryRound}
                        disabled={!canExpandBracketWithPreliminaryRound}
                        className={editorOutlineButtonClass}
                      >
                        <Brackets className="h-4 w-4" />
                        {t('editor_wizard_add_preliminary')}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--editor-brand-50)] text-sm font-black text-[var(--editor-brand-700)]">3</span>
                      <div>
                        <div className="text-sm font-black text-[var(--editor-text-primary)]">{t('editor_wizard_step_preview')}</div>
                        <div className="text-[11px] font-bold text-[var(--editor-text-muted)]">{t('editor_wizard_step_preview_desc')}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={scrollToPreview} className={editorOutlineButtonClass}>
                        {t('editor_preview')}
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyDraft}
                        disabled={applyBusy || !hasEditorChanges || !draft.validation.canApply}
                        className={editorPrimaryButtonClass}
                      >
                        {t('editor_apply_changes')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_bracket_capacity_title')}</div>
                    <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">
                      {canExpandBracketWithPreliminaryRound
                        ? t('editor_bracket_capacity_full')
                        : hasRealBracketStarted(draft.state.present)
                          ? t('editor_bracket_capacity_started')
                          : round1HasPlaceholderSlots
                            ? t('editor_bracket_capacity_placeholders')
                            : t('editor_bracket_capacity_unavailable')}
                    </div>
                    <div className="mt-2 text-[11px] font-medium text-[var(--editor-text-muted)]">
                      {t('editor_bracket_capacity_hint_prefix')} <span className="font-semibold text-[var(--editor-text-primary)]">{t('editor_bracket_capacity_hint_highlight')}</span>{t('editor_bracket_capacity_hint_suffix')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleBracketFullscreen}
                      className={editorGhostButtonClass}
                    >
                      {isBracketFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      {isBracketFullscreen ? t('editor_fullscreen_exit') : t('editor_fullscreen_open')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPreliminaryRound}
                      disabled={!canExpandBracketWithPreliminaryRound}
                      className={editorOutlineButtonClass}
                    >
                      <Brackets className="h-4 w-4" />
                      {t('editor_add_preliminary_round')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-base font-black text-[var(--editor-text-primary)]">{t('editor_match_pair_view_title')}</div>
                    <div className="mt-1 text-xs font-bold text-[var(--editor-text-muted)]">{t('editor_match_pair_view_desc')}</div>
                  </div>
                  {blockedAdvancementItems.length ? (
                    <span className="rounded-full border border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] px-3 py-1 text-[11px] font-black text-[var(--editor-danger-700)]">
                      {t('editor_blocked_advancements_count').replace('{count}', String(blockedAdvancementItems.length))}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 space-y-4">
                  {bracketPairRounds.map((round, roundIndex) => {
                    const roundName = round[0]?.roundName || t('round_n').replace('{n}', String(roundIndex + 1));
                    return (
                      <div key={`${roundName}:${roundIndex}`} className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-wide text-[var(--editor-text-muted)]">{roundName}</div>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                          {round.map((match) => renderBracketPairCard(match))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                id="editor-bracket-workspace"
                ref={bracketWorkspaceRef}
                className={`rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${
                  isBracketFullscreen ? 'h-screen overflow-auto p-4' : 'overflow-auto p-2.5 lg:p-3'
                }`}
              >
                {isBracketFullscreen ? (
                  <div className="sticky top-2 z-30 mb-3 rounded-[18px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur">
                    {selectedPoolTeamForAction ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{t('editor_add_to_bracket_bar')}</div>
                          <div className="truncate text-base font-black text-slate-950">{selectedPoolTeamForAction.name}</div>
                          <div className="mt-0.5 text-xs font-bold text-slate-500">{t('editor_add_to_bracket_hint')}</div>
                        </div>
                        <button
                          type="button"
                          onClick={clearInteraction}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                        >
                          {t('editor_cancel_action')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-bold text-slate-600">{t('editor_fullscreen_select_team_first')}</div>
                        <button
                          type="button"
                          onClick={handleAddPreliminaryRound}
                          disabled={!canExpandBracketWithPreliminaryRound}
                          title={!canExpandBracketWithPreliminaryRound ? t('editor_bracket_capacity_placeholders') : undefined}
                          className={editorOutlineButtonClass}
                        >
                          <Brackets className="h-4 w-4" />
                          {t('editor_add_preliminary_round')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {selectedBracketSlot ? (
                  <div className="sticky top-2 z-20 mb-3 rounded-[18px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{selectedBracketSlot.slotLabel}</div>
                        <div className="truncate text-base font-black text-slate-950">
                          {selectedBracketSlot.isFree ? 'Slot libero selezionato' : selectedBracketSlot.teamName}
                        </div>
                        <div className="mt-0.5 text-xs font-bold text-slate-500">
                          {selectedBracketSlot.isFree
                            ? 'Inserisci una squadra iscritta in Squadre, oppure tocca un altro slot per spostare qui una squadra.'
                            : 'Tocca un altro slot per spostare o scambiare, oppure usa le azioni qui accanto.'}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setSlotPickerOpen((open) => !open); setSlotPickerQuery(''); }}
                          disabled={selectedBracketSlot.locked}
                          title={selectedBracketSlot.locked ? t('editor_bracket_slot_locked_started') : undefined}
                          className={editorOutlineButtonClass}
                        >
                          <Users className="h-4 w-4" />
                          {selectedBracketSlot.isFree ? 'Inserisci squadra' : 'Sostituisci con…'}
                        </button>
                        {!selectedBracketSlot.isFree ? (
                          <button
                            type="button"
                            onClick={handleRemoveSelectedSlotTeam}
                            disabled={!!selectedBracketSlot.clearCheck && !selectedBracketSlot.clearCheck.allowed}
                            title={selectedBracketSlot.clearCheck && !selectedBracketSlot.clearCheck.allowed ? selectedBracketSlot.clearCheck.humanMessage : undefined}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white/90 px-4 py-2 text-sm font-bold text-red-700 shadow-sm transition-all duration-300 hover:bg-red-50 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-4 w-4" />
                            Rimuovi dal tabellone
                          </button>
                        ) : null}
                        <button type="button" onClick={clearInteraction} className={editorGhostButtonClass}>
                          {t('editor_cancel_action')}
                        </button>
                      </div>
                    </div>
                    {slotPickerOpen && !selectedBracketSlot.locked ? (
                      <div className="mt-3 max-w-xl">
                        <TeamPickerCombobox
                          label={selectedBracketSlot.isFree ? 'Squadra da inserire' : 'Nuova squadra per questo slot'}
                          query={slotPickerQuery}
                          onQueryChange={setSlotPickerQuery}
                          items={slotPickerOptions}
                          selectedId={null}
                          onSelect={handleSlotPickerSelect}
                          placeholder="Cerca tra le squadre iscritte…"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <TournamentBracket
                  teams={draft.state.present.catalogTeams}
                  matches={draft.state.present.matches}
                  data={draft.state.present.tournament}
                  readOnly
                  wrapTeamNames
                  showConnectors
                  showByeSlots
                  participantSelectionMode
                  highlightedSlotKeys={highlightedBracketSlots}
                  invalidSlotKeys={invalidBracketSlots}
                  changedSlotKeys={changedBracketSlots}
                  lockedSlotKeys={lockedBracketSlots}
                  interactiveByeSlots={interactiveByeSlots}
                  draggingSlotKey={dragSource?.kind === 'bracket-slot' ? dragSource.slotKey : undefined}
                  dropTargetSlotKey={hoverSlotKey || undefined}
                  onParticipantClick={(args) => handleBracketSlotAction(`${args.matchId}|${args.side}`)}
                  onParticipantDoubleClick={(args) => handleBracketSlotAction(`${args.matchId}|${args.side}`)}
                  onParticipantDragStart={(args) => {
                    const slotKey = `${args.matchId}|${args.side}`;
                    const teamId = getSlotValue(draft.state.present, slotKey) || undefined;
                    if (!teamId) return;
                    const match = getMatchById(draft.state.present, args.matchId);
                    if (match && isLockedBracketMatchForStructureEdit(match)) {
                      setInteractionMessage(t('editor_bracket_slot_locked_started'));

                      return;
                    }
                    setDragSource({ kind: 'bracket-slot', slotKey, teamId });
                    setSelection({ kind: 'bracket-slot', slotKey, teamId });
                    setInteractionMessage(t('editor_drag_slot_round1'));

                  }}
                  onParticipantDragEnter={(args) => setHoverSlotKey(`${args.matchId}|${args.side}`)}
                  onParticipantDrop={(args) => {
                    const slotKey = `${args.matchId}|${args.side}`;
                    const check = bracketTargetCheck(slotKey);
                    if (!check?.allowed) {
                      setInteractionMessage(check?.humanMessage || t('editor_invalid_target'));
                      setDragSource(null);
                      setHoverSlotKey('');
                      return;
                    }
                    handleBracketSlotAction(slotKey);
                    setHoverSlotKey('');
                    setDragSource(null);
                  }}
                  onParticipantDragEnd={() => {
                    setDragSource(null);
                    setHoverSlotKey('');
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] px-4 py-12 text-center">
              <Brackets className="mx-auto h-5 w-5 text-[var(--editor-text-muted)]" />
              <div className="mt-3 text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_no_editable_round1_title')}</div>
              <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">{t('editor_no_editable_round1_desc')}</div>
            </div>
          )}
        </section>

        <aside className={`${editorPanelClass} self-start space-y-4 p-4 lg:p-4 xl:p-5 xl:sticky xl:top-3`}>
          <div ref={previewPanelRef} className="space-y-4">
            <div>
              <div className="text-base font-bold text-[var(--editor-text-primary)]">{t('editor_preview_integrity_title')}</div>
              <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">
                {t('editor_preview_integrity_desc')}
              </div>
            </div>

            <div className={`rounded-[18px] border px-4 py-4 ${
              validationTone === 'rose'
                ? 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)]'
                : validationTone === 'amber'
                  ? 'border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)]'
                  : hasEditorChanges
                    ? 'border-[color:var(--editor-draft-100)] bg-[var(--editor-draft-50)]'
                    : 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)]'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-base font-bold text-[var(--editor-text-primary)]">
                    {draft.validation.blockingErrors.length ? (
                      <ShieldAlert className="h-5 w-5 text-[var(--editor-danger-600)]" />
                    ) : draft.validation.warnings.length ? (
                      <TriangleAlert className="h-5 w-5 text-[var(--editor-warning-600)]" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-[var(--editor-success-600)]" />
                    )}
                    {draftStatusLabel}
                  </div>
                  <div className="mt-1 text-xs font-medium text-[var(--editor-text-secondary)]">
                    {draft.validation.blockingErrors.length
                      ? t('editor_resolve_blocks_before_apply')
                      : draft.validation.warnings.length
                        ? t('editor_draft_valid_with_attention')
                        : hasEditorChanges
                          ? t('editor_draft_coherent_apply')
                          : t('editor_no_changes_recorded_yet')}

                  </div>
                </div>
                <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[11px] font-semibold text-[var(--editor-text-secondary)]">
                  {draft.validation.blockingErrors.length ? t('editor_blocks_active') : draft.validation.warnings.length ? t('editor_attention') : t('editor_stable')}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[16px] bg-white/80 px-2 py-3">
                  <div className="text-lg font-bold text-[var(--editor-text-primary)]">{draft.diff.operationsCount}</div>
                  <div className="text-[11px] font-medium text-[var(--editor-text-muted)]">{t('editor_operations_label')}</div>
                </div>
                <div className="rounded-[16px] bg-white/80 px-2 py-3">
                  <div className="text-lg font-bold text-[var(--editor-text-primary)]">{draft.validation.warnings.length}</div>
                  <div className="text-[11px] font-medium text-[var(--editor-text-muted)]">{t('editor_warnings_label')}</div>
                </div>
                <div className="rounded-[16px] bg-white/80 px-2 py-3">
                  <div className="text-lg font-bold text-[var(--editor-text-primary)]">{draft.validation.blockingErrors.length}</div>
                  <div className="text-[11px] font-medium text-[var(--editor-text-muted)]">{t('editor_blocks_label')}</div>
                </div>
              </div>
            </div>
          </div>

          {duplicateRemediationSections.length ? (
            <div className="rounded-[18px] border border-[color:var(--editor-danger-100)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--editor-danger-700)] inline-flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    {t('editor_duplicates_to_fix')}
                  </div>
                  <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">
                    {t('editor_duplicates_fix_desc')}
                  </div>
                </div>
                <span className="rounded-full border border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] px-2.5 py-1 text-[11px] font-bold text-[var(--editor-danger-700)]">
                  {duplicateOccurrenceCount}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {duplicateRemediationSections.map((section) => (
                  <div key={`${section.scope}:${section.teamId}`} className="rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-black text-[var(--editor-text-primary)]">{section.teamName}</div>
                      <span className="rounded-full border border-[color:var(--editor-border-subtle)] bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--editor-text-muted)]">
                        {section.scope === 'groups' ? t('groups_label') : t('bracket_word')}
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {section.occurrences.map((occurrence) => (
                        <div key={occurrence.key} className="flex flex-col gap-2 rounded-[14px] border border-[color:var(--editor-border-subtle)] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--editor-text-primary)]">{occurrence.location}</div>
                            {occurrence.locked ? (
                              <div className="mt-0.5 text-[11px] font-medium text-[var(--editor-danger-700)]">{t('editor_duplicate_occurrence_locked')}</div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            disabled={occurrence.locked}
                            onClick={() => handleDeleteDuplicateOccurrence(occurrence)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('delete')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draft.validation.blockingErrors.length ? (
            <div className="rounded-[18px] border border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] p-4">
              <div className="text-sm font-bold text-[var(--editor-danger-700)] inline-flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                {t('editor_blocking_errors_title')}
              </div>
              <div className="mt-3 space-y-2">
                {draft.validation.blockingErrors.map((issue, index) => (
                  <button
                    key={`${issue.code}:${issue.teamId || issue.slotKey || issue.groupId || index}`}
                    type="button"
                    onClick={() => navigateToIssue(issue)}
                    className="w-full rounded-[16px] border border-[color:var(--editor-danger-100)] bg-white px-3 py-3 text-left transition-all duration-150 hover:bg-[var(--editor-danger-50)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-danger-600)] focus-visible:ring-offset-2"
                  >
                    <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-danger-700)]">{issueLabel(issue.code)}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--editor-text-primary)]">{issue.message}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {draft.validation.warnings.length ? (
            <div className="rounded-[18px] border border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] p-4">
              <div className="text-sm font-bold text-[var(--editor-warning-700)] inline-flex items-center gap-2">
                <TriangleAlert className="w-4 h-4" />
                {t('editor_warnings_label')}
              </div>
              <div className="mt-3 space-y-2">
                {draft.validation.warnings.map((issue, index) => (
                  <button
                    key={`${issue.code}:${issue.teamId || issue.slotKey || issue.groupId || index}`}
                    type="button"
                    onClick={() => navigateToIssue(issue)}
                    className="w-full rounded-[16px] border border-[color:var(--editor-warning-100)] bg-white px-3 py-3 text-left transition-all duration-150 hover:bg-[var(--editor-warning-50)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-warning-600)] focus-visible:ring-offset-2"
                  >
                    <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-warning-700)]">{issueLabel(issue.code, t('editor_warnings_label'))}</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--editor-text-primary)]">{issue.message}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] p-4">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--editor-success-700)]">
                <CheckCircle2 className="h-4 w-4" />
                {t('editor_no_persistent_warnings')}
              </div>
              <div className="mt-1 text-xs font-medium text-[var(--editor-text-secondary)]">{t('editor_no_structural_warnings_desc')}</div>
            </div>
          )}

          <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-[var(--editor-text-primary)] inline-flex items-center gap-2">
                <Info className="w-4 h-4 text-[var(--editor-text-muted)]" />
                {t('editor_preview_impacts')}
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--editor-text-muted)]">
                {hasEditorChanges ? t('editor_updated') : t('editor_status_no_changes')}
              </span>
            </div>

            <div className="space-y-2">
              {draft.diff.bracketChanges.length || draft.diff.futureBracketChanges.length ? (
                <div className="rounded-[16px] border border-[color:var(--editor-brand-100)] bg-[var(--editor-bg-surface)] p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-brand-700)]">{t('editor_before_after_preview_title')}</div>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {[...draft.diff.bracketChanges, ...draft.diff.futureBracketChanges].map((change) => (
                      <div key={`before-after:${change.slotKey}:${change.afterTeamId || 'empty'}`} className="rounded-[14px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-[var(--editor-text-muted)]">{slotDisplayLabel(change.slotKey)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="rounded-[12px] border border-[color:var(--editor-border-subtle)] bg-white px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-wide text-[var(--editor-text-muted)]">{t('editor_before_label')}</div>
                            <div className="mt-1 text-xs font-black text-[var(--editor-text-primary)]">{teamLabel(change.beforeTeamId)}</div>
                          </div>
                          <div className="rounded-[12px] border border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-wide text-[var(--editor-success-700)]">{t('editor_after_label')}</div>
                            <div className="mt-1 text-xs font-black text-[var(--editor-text-primary)]">{teamLabel(change.afterTeamId)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {draft.diff.groupChanges.length ? (
                <div className="rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-text-muted)]">{t('groups_label')}</div>
                  <div className="mt-2 space-y-2">
                    {draft.diff.groupChanges.map((change) => (
                      <div key={`${change.teamId}:${change.type}:${change.to?.containerId || change.to?.slotKey || ''}`} className="text-sm font-semibold text-[var(--editor-text-primary)]">
                        <span className="font-bold">{change.teamName}</span>
                        <span className="text-[var(--editor-text-muted)]"> · {change.type}</span>
                        <div className="mt-0.5 text-xs font-medium text-[var(--editor-text-muted)]">
                          {placementLabel(change.from)} → {placementLabel(change.to)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {draft.diff.bracketChanges.length ? (
                <div className="rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-text-muted)]">{t('editor_bracket_round1_label')}</div>
                  <div className="mt-2 space-y-2">
                    {draft.diff.bracketChanges.map((change) => (
                      <div key={`${change.slotKey}:${change.afterTeamId || 'empty'}`} className="text-sm font-semibold text-[var(--editor-text-primary)]">
                        <span className="font-bold">{slotDisplayLabel(change.slotKey)}</span>
                        <div className="mt-0.5 text-xs font-medium text-[var(--editor-text-muted)]">
                          {teamLabel(change.beforeTeamId)} → {teamLabel(change.afterTeamId)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {draft.diff.futureBracketChanges.length ? (
                <div className="rounded-[16px] border border-[color:var(--editor-warning-100)] bg-[var(--editor-bg-surface)] p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-warning-700)]">{t('editor_future_rounds_effects')}</div>
                  <div className="mt-2 space-y-2">
                    {draft.diff.futureBracketChanges.map((change) => (
                      <div key={`${change.slotKey}:${change.afterTeamId || 'empty'}`} className="text-sm font-semibold text-[var(--editor-text-primary)]">
                        <span className="font-bold">{slotDisplayLabel(change.slotKey)}</span>
                        <div className="mt-0.5 text-xs font-medium text-[var(--editor-text-muted)]">
                          {teamLabel(change.beforeTeamId)} → {teamLabel(change.afterTeamId)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {blockedAdvancementItems.length ? (
                <div className="rounded-[16px] border border-[color:var(--editor-warning-100)] bg-[var(--editor-warning-50)] p-3">
                  <div className="text-[11px] font-black uppercase tracking-wide text-[var(--editor-warning-700)]">{t('editor_blocked_advancements_title')}</div>
                  <div className="mt-1 text-xs font-bold text-[var(--editor-warning-700)]">{t('editor_blocked_advancements_desc')}</div>
                  <div className="mt-3 space-y-2">
                    {blockedAdvancementItems.map((item) => (
                      <div key={`${item.sourceLabel}:${item.winnerLabel}:${item.targetLabel}`} className="rounded-[14px] border border-[color:var(--editor-warning-100)] bg-white/80 px-3 py-2 text-xs font-black text-[var(--editor-text-primary)]">
                        {item.winnerLabel} <span className="text-[var(--editor-text-muted)]">→</span> {item.targetLabel}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {!draft.diff.groupChanges.length && !draft.diff.bracketChanges.length && !draft.diff.futureBracketChanges.length ? (
                <div className="rounded-[16px] border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 py-5 text-center">
                  <Info className="mx-auto h-5 w-5 text-[var(--editor-text-muted)]" />
                  <div className="mt-2 text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_no_draft_changes')}</div>
                  <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">{t('editor_preview_auto_populate')}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-[var(--editor-text-primary)]">{t('editor_operations_log')}</div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--editor-text-muted)]">
                {t('editor_recent_count').replace('{count}', String(recentOperations.length))}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {recentOperations.length ? recentOperations.map((entry) => (
                <div key={entry.id} className="rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 py-3">
                  <div className="text-[11px] font-semibold tracking-wide text-[var(--editor-text-muted)]">{operationLabel(entry.type)}</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--editor-text-primary)]">{entry.message}</div>
                </div>
              )) : (
                <div className="rounded-[16px] border border-dashed border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] px-3 py-5 text-center">
                  <div className="text-sm font-semibold text-[var(--editor-text-primary)]">{t('editor_no_draft_operations')}</div>
                  <div className="mt-1 text-xs font-medium text-[var(--editor-text-muted)]">{t('editor_operations_log_desc')}</div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--editor-text-primary)]">
              {draft.validation.canApply ? <CheckCircle2 className="h-4 w-4 text-[var(--editor-success-600)]" /> : <ShieldAlert className="h-4 w-4 text-[var(--editor-danger-600)]" />}
              {t('editor_final_applicability')}
            </div>
            <div className="mt-2 text-xs font-medium text-[var(--editor-text-muted)]">
              {t('editor_final_applicability_desc')}
            </div>
            <div className="mt-3 rounded-[16px] border border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface-muted)] px-3 py-3 text-sm font-semibold text-[var(--editor-text-secondary)]">
              {draft.validation.canApply && hasEditorChanges
                ? t('editor_ready_apply_hint')
                : !hasEditorChanges
                  ? t('editor_no_changes_to_apply')
                  : t('editor_resolve_blocks_first')}
            </div>
          </div>
        </aside>
      </div>

      {conflictState ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-slate-900 inline-flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  {conflictState.status === 409 ? t('editor_conflict_detected') : t('editor_remote_check_failed')}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-600">
                  {conflictState.message ||
                    (conflictState.status === 409
                      ? t('editor_conflict_other_admin')
                      : t('editor_conflict_remote_unreachable'))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConflictState(null);
                  setPendingApplyLocal(null);
                }}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">{t('editor_if_match_local')}</div>
                <div className="mt-2 text-sm font-mono font-bold text-slate-800 break-all">{conflictState.ifMatch || t('dash')}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">{t('editor_remote_etag')}</div>
                <div className="mt-2 text-sm font-mono font-bold text-slate-800 break-all">{conflictState.etag || t('dash')}</div>
              </div>
            </div>

            {pendingApplyLocal ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-black text-slate-900">{t('editor_draft_ready_to_apply')}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white px-2 py-2">
                    <div className="text-lg font-black text-slate-900">{pendingApplyLocal.diff.operationsCount}</div>
                    <div className="text-[11px] font-bold text-slate-500">{t('editor_operations_label')}</div>
                  </div>
                  <div className="rounded-xl bg-white px-2 py-2">
                    <div className="text-lg font-black text-slate-900">{pendingApplyLocal.validation.warnings.length}</div>
                    <div className="text-[11px] font-bold text-slate-500">{t('editor_warnings_label')}</div>
                  </div>
                  <div className="rounded-xl bg-white px-2 py-2">
                    <div className="text-lg font-black text-slate-900">{pendingApplyLocal.validation.blockingErrors.length}</div>
                    <div className="text-[11px] font-bold text-slate-500">{t('editor_blocks_label')}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-black hover:bg-slate-50"
              >
                {t('editor_discard_draft')}
              </button>
              <button
                type="button"
                onClick={openPersistenceTools}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-black hover:bg-slate-50"
              >
                {t('open_data_management')}
              </button>
              {conflictState.status === 503 && pendingApplyLocal ? (
                <button
                  type="button"
                  onClick={() => applyPreparedSnapshot(pendingApplyLocal, t('editor_applied_locally_check_sync'))}
                  className="px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-black hover:bg-amber-100"
                >
                  {t('editor_apply_local_only')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleReloadRemoteState}
                disabled={reloadBusy}
                className="px-3 py-2.5 rounded-xl bg-slate-900 text-white font-black inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                <RefreshCcw className="w-4 h-4" />
                {reloadBusy ? t('editor_reloading') : t('editor_reload_current_state')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingLiveApply ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-lg font-black text-slate-900">
                  <TriangleAlert className="h-5 w-5 text-amber-600" />
                  {t('editor_live_apply_confirm_title')}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-600">{t('editor_live_apply_confirm_desc')}</div>
              </div>
              <button
                type="button"
                onClick={() => setPendingLiveApply(null)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xl font-black text-slate-900">{pendingLiveApply.diff.operationsCount}</div>
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('editor_operations_label')}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                <div className="text-xl font-black text-amber-900">{pendingLiveApply.validation.warnings.length}</div>
                <div className="text-[11px] font-black uppercase tracking-wide text-amber-700">{t('editor_warnings_label')}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                <div className="text-xl font-black text-rose-900">{blockedAdvancementItems.length}</div>
                <div className="text-[11px] font-black uppercase tracking-wide text-rose-700">{t('editor_blocked_advancements_short')}</div>
              </div>
            </div>

            {blockedAdvancementItems.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-black text-amber-900">{t('editor_blocked_advancements_title')}</div>
                <div className="mt-1 text-xs font-bold text-amber-800">{t('editor_blocked_advancements_desc')}</div>
                <div className="mt-3 space-y-2">
                  {blockedAdvancementItems.map((item) => (
                    <div key={`live-confirm:${item.sourceLabel}:${item.winnerLabel}:${item.targetLabel}`} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-black text-slate-900">
                      {item.winnerLabel} <span className="text-slate-400">→</span> {item.targetLabel}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">{t('editor_before_after_preview_title')}</div>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {[...pendingLiveApply.diff.bracketChanges, ...pendingLiveApply.diff.futureBracketChanges].slice(0, 8).map((change) => (
                  <div key={`live-change:${change.slotKey}:${change.afterTeamId || 'empty'}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                    <span className="font-black text-slate-950">{slotDisplayLabel(change.slotKey)}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    {teamLabel(change.beforeTeamId)} <span className="text-slate-400">→</span> {teamLabel(change.afterTeamId)}
                  </div>
                ))}
                {![...pendingLiveApply.diff.bracketChanges, ...pendingLiveApply.diff.futureBracketChanges].length ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs font-bold text-slate-500">
                    {t('editor_no_bracket_slot_changes')}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingLiveApply(null)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {t('editor_live_apply_confirm_cancel')}
              </button>
              <button
                type="button"
                onClick={scrollToPreview}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {t('editor_preview')}
              </button>
              <button
                type="button"
                onClick={() => applyPreparedSnapshot(pendingLiveApply, t('editor_applied_to_live'))}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
              >
                {t('editor_live_apply_confirm_action')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDuplicateDelete ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-lg font-black text-slate-900">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                  {t('editor_duplicate_delete_confirm_title')}
                </div>
                <div className="mt-2 text-sm font-bold text-slate-600">
                  {t('editor_duplicate_delete_confirm_desc')
                    .replace('{team}', pendingDuplicateDelete.teamName)
                    .replace('{location}', pendingDuplicateDelete.location)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDuplicateDelete(null)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDuplicateDelete(null)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {t('editor_cancel_action')}
              </button>
              <button
                type="button"
                onClick={() => {
                  applyDeleteDuplicateOccurrence(pendingDuplicateDelete);
                  setPendingDuplicateDelete(null);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700"
              >
                {t('editor_duplicate_delete_action')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedActionLabel ? (
        <div
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-2xl"
          draggable={!!selectedPoolTeamForAction}
          onDragStart={(event) => {
            if (!selectedPoolTeamForAction) return;
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', selectedPoolTeamForAction.id);
            } catch {
              // no-op: some touch browsers do not expose dataTransfer.
            }
            setDragSource({ kind: 'pool-team', teamId: selectedPoolTeamForAction.id });
            setSelection({ kind: 'pool-team', teamId: selectedPoolTeamForAction.id });
            setInteractionMessage(t('editor_drag_pool_team').replace('{name}', selectedPoolTeamForAction.name));
          }}
          onDragEnd={() => {
            setDragSource(null);
            setHoverSlotKey('');
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {selectedPoolTeamForAction && currentPhase === 'bracket' ? (
                <div className="mb-1 inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-200">
                  {t('editor_add_to_bracket_bar')}
                </div>
              ) : null}
              <div className="truncate text-sm font-black">{selectedActionLabel}</div>
              <div className="mt-0.5 text-xs font-bold text-white/70">
                {selectedPoolTeamForAction && currentPhase === 'bracket' ? t('editor_add_to_bracket_hint') : t('editor_tap_to_place_hint')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedPoolTeamForAction && currentPhase === 'bracket' ? (
                <button
                  type="button"
                  onClick={scrollToBracketWorkspace}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-black text-slate-950 hover:bg-emerald-300"
                >
                  {t('editor_add_action')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={clearInteraction}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white hover:bg-white/15"
              >
                {t('editor_cancel_action')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {snackbar ? (
        <div className="fixed bottom-5 right-5 z-[65]">
          <div
            className={`min-w-[300px] max-w-[460px] rounded-[18px] border px-4 py-3 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] ${
              snackbar.tone === 'success'
                ? 'border-[color:var(--editor-success-100)] bg-[var(--editor-success-50)] text-[var(--editor-success-700)]'
                : snackbar.tone === 'error'
                  ? 'border-[color:var(--editor-danger-100)] bg-[var(--editor-danger-50)] text-[var(--editor-danger-700)]'
                  : 'border-[color:var(--editor-border-subtle)] bg-[var(--editor-bg-surface)] text-[var(--editor-text-primary)]'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{snackbar.message}</div>
                {snackbar.actionLabel && snackbar.onAction ? (
                  <button
                    type="button"
                    onClick={() => {
                      snackbar.onAction?.();
                      setSnackbar(null);
                    }}
                    className="mt-2 text-xs font-semibold underline underline-offset-4"
                  >
                    {snackbar.actionLabel}
                  </button>
                ) : null}
              </div>
              <button type="button" onClick={() => setSnackbar(null)} className="rounded-lg p-1 text-current/70 hover:bg-black/5">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
