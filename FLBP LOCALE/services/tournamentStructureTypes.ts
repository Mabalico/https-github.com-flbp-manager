import type { Match, Team, TournamentData } from '../types';

export type StructuralPhase = 'groups' | 'bracket';

export type TeamEligibilityStatus =
  | 'eligible'
  | 'duplicate'
  | 'eliminated'
  | 'deleted'
  | 'locked_by_match'
  | 'already_assigned'
  | 'unknown';

export type TeamEligibilityReasonCode =
  | 'ok'
  | 'already_assigned_groups'
  | 'already_assigned_bracket'
  | 'duplicate_in_groups'
  | 'duplicate_in_bracket'
  | 'eliminated_from_bracket'
  | 'deleted_from_catalog'
  | 'locked_by_group_match'
  | 'locked_by_bracket_match'
  | 'group_edit_blocked_by_bracket_phase'
  | 'group_is_final'
  | 'group_is_concluded'
  | 'team_not_found'
  | 'team_not_in_group'
  | 'team_already_in_group'
  | 'same_group'
  | 'same_slot'
  | 'invalid_slot'
  | 'slot_not_placeholder'
  | 'slot_locked'
  | 'source_locked'
  | 'target_locked'
  | 'replace_requires_unplayed_source'
  | 'replace_requires_eligible_team'
  | 'unsupported_round'
  | 'unknown';

export interface CurrentPlacement {
  phase: StructuralPhase;
  containerId?: string;
  containerName?: string;
  slotKey?: string;
  matchId?: string;
  round?: number;
}

export interface TeamEligibilityResult {
  teamId: string;
  status: TeamEligibilityStatus;
  reasonCode: TeamEligibilityReasonCode | string;
  humanMessage: string;
  currentPlacement?: CurrentPlacement;
}

export interface StructuralIssue {
  severity: 'warning' | 'blocking';
  code: string;
  message: string;
  teamId?: string;
  slotKey?: string;
  groupId?: string;
  groupName?: string;
  matchId?: string;
}

export interface StructuralTargetCheck {
  allowed: boolean;
  severity: 'allowed' | 'warning' | 'blocking';
  reasonCode: string;
  humanMessage: string;
  warnings?: StructuralIssue[];
}

export interface TournamentStructureSnapshot {
  tournament: TournamentData;
  matches: Match[];
  catalogTeams: Team[];
}

export type StructuralOperation =
  | {
      type: 'MOVE_TEAM_BETWEEN_GROUPS';
      teamId: string;
      fromGroupId: string;
      toGroupId: string;
    }
  | {
      type: 'SWAP_GROUP_TEAMS';
      teamAId: string;
      teamBId: string;
      groupAId: string;
      groupBId: string;
    }
  | {
      type: 'INSERT_TEAM_IN_GROUP';
      teamId: string;
      groupId: string;
    }
  | {
      type: 'REPLACE_GROUP_TEAM';
      oldTeamId: string;
      newTeamId: string;
      groupId: string;
    }
  | {
      type: 'REMOVE_GROUP_TEAM';
      teamId: string;
      groupId: string;
    }
  | {
      type: 'INSERT_TEAM_IN_BRACKET_SLOT';
      teamId: string;
      slotKey: string;
    }
  | {
      type: 'REPLACE_BRACKET_SLOT';
      slotKey: string;
      newTeamId: string;
    }
  | {
      type: 'SWAP_BRACKET_SLOTS';
      slotAKey: string;
      slotBKey: string;
    }
  | {
      type: 'MOVE_BRACKET_SLOT';
      fromSlotKey: string;
      toSlotKey: string;
    }
  | {
      type: 'CLEAR_BRACKET_SLOT';
      slotKey: string;
    }
  | {
      type: 'ADD_CATALOG_TEAM';
      team: Team;
    }
  | {
      type: 'ADD_PRELIMINARY_BRACKET_ROUND';
    };

export interface StructuralOperationLogEntry {
  id: string;
  type: StructuralOperation['type'];
  message: string;
  at: string;
}

export interface StructuralOperationResult {
  ok: boolean;
  blocking?: boolean;
  check: StructuralTargetCheck;
  nextSnapshot?: TournamentStructureSnapshot;
  entry?: StructuralOperationLogEntry;
}

export interface DraftValidationResult {
  ok: boolean;
  canApply: boolean;
  blockingErrors: StructuralIssue[];
  warnings: StructuralIssue[];
}

export interface TeamPlacementDiff {
  teamId: string;
  teamName: string;
  type: 'insert' | 'move' | 'replace' | 'remove';
  from?: CurrentPlacement;
  to?: CurrentPlacement;
}

export interface BracketSlotDiff {
  slotKey: string;
  matchId: string;
  round: number;
  beforeTeamId?: string;
  afterTeamId?: string;
}

export interface TournamentStructureDiffResult {
  changed: boolean;
  operationsCount: number;
  groupChanges: TeamPlacementDiff[];
  bracketChanges: BracketSlotDiff[];
  futureBracketChanges: BracketSlotDiff[];
  changedGroupIds: string[];
  changedMatchIds: string[];
}

export interface TournamentStructureDraftState {
  original: TournamentStructureSnapshot;
  present: TournamentStructureSnapshot;
  past: Array<{ snapshot: TournamentStructureSnapshot; entry: StructuralOperationLogEntry }>;
  future: Array<{ snapshot: TournamentStructureSnapshot; entry: StructuralOperationLogEntry }>;
  log: StructuralOperationLogEntry[];
  lastResult: StructuralOperationResult | null;
}

export interface TournamentStructureConflictResult {
  ok: boolean;
  status: 200 | 409 | 412 | 503;
  message?: string;
  etag?: string | null;
  ifMatch?: string | null;
}
