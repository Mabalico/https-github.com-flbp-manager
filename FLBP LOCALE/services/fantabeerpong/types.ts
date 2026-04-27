export type FantaShellSectionKey =
  | 'overview'
  | 'my_team'
  | 'general_standings'
  | 'players_standings'
  | 'rules'
  | 'history';

export type FantaTrend = 'up' | 'down' | 'steady';
export type FantaPlayerAvailability = 'live' | 'waiting' | 'eliminated';
export type FantaTeamBuildStatus = 'draft' | 'ready' | 'locked';
export type FantaRosterRole = 'captain' | 'defender' | 'starter';
export type FantaQuickHelpTopic = 'roles' | 'scoring' | 'bonus_scia';

export interface FantaConfig {
  activeTournamentId: string;
  activeTournamentName?: string;
  isLockActive: boolean;
  registrationOpen: boolean;
  activeTournamentResultsOnly?: boolean;
  registrationOpenFlag?: boolean;
  manualLockActive?: boolean;
  tournamentStarted?: boolean;
  lockReason?: 'no_live_tournament' | 'first_match_started' | 'results_only_tournament' | null;
  updatedAt?: string;
}

export interface FantaPlayer {
  id: string;
  playerName: string;
  realTeamName: string;
  realTeamId?: string;
  status?: FantaPlayerAvailability;
  trend?: FantaTrend;
  note?: string;
}

export interface FantaLineupSlot {
  player: FantaPlayer;
  role: FantaRosterRole;
}

export interface FantaTeam {
  id: string;
  workspaceId: string;
  tournamentId: string;
  userId: string;
  name: string;
  status?: FantaTeamBuildStatus | 'confirmed' | 'final';
}

export interface FantaOverviewMetric { id: string; label: string; value: string; hint?: string; }
export interface FantaOverviewQuickAction {
  id: string; title: string; description: string;
  target: 'my_team' | 'general_standings' | 'players_standings' | 'rules' | 'history' | 'team_builder';
}
export interface FantaOverviewStandingsRow { id: string; rank: number; teamName: string; points: number; trend: FantaTrend; gapLabel?: string; isMine?: boolean; }
export interface FantaOverviewLivePlayerRow { id: string; playerName: string; teamName: string; fantasyPoints: number; roleLabel: string; availability: FantaPlayerAvailability; }
export interface FantaOverviewRulesHighlight { id: string; label: string; value: string; }
export interface FantaOverviewHistoryHighlight { editionLabel: string; winnerTeamName: string; winnerPoints: number; note: string; }
export interface FantaOverviewData {
  editionLabel: string; teamName: string; teamBuildStatus: FantaTeamBuildStatus; teamBuildStatusLabel: string; teamBuildStatusHint: string;
  metrics: FantaOverviewMetric[]; lineupSummary: { selectedPlayers: number; captainName: string; defendersCount: number; bonusSciaAvailable: boolean; };
  standingsPreview: FantaOverviewStandingsRow[]; livePlayersPreview: FantaOverviewLivePlayerRow[]; quickActions: FantaOverviewQuickAction[];
  rulesHighlights: FantaOverviewRulesHighlight[]; historyHighlight: FantaOverviewHistoryHighlight; liveLabel: string; liveHint: string;
}

export interface FantaMyTeamPlayer {
  id: string; playerName: string; realTeamName: string; fantasyPoints: number; role: FantaRosterRole; status: FantaPlayerAvailability; note: string;
  goals: number; blows: number; wins: number; bonusScia: number;
}
export interface FantaMyTeamConstraint { id: string; label: string; satisfied: boolean; helper: string; }
export interface FantaMyTeamData {
  id?: string;
  editionLabel: string; teamName: string; buildStatus: FantaTeamBuildStatus; buildStatusLabel: string; lockLabel: string; lockHint: string;
  summary: { selectedPlayers: number; captainName: string; defendersCount: number; currentRankLabel: string; totalPoints?: number; };
  pointsBreakdown: { goals: number; blows: number; wins: number; bonusScia: number; };
  teamsToFollow: Array<{ id: string; teamName: string; followingFor: string }>;
  players: FantaMyTeamPlayer[]; constraints: FantaMyTeamConstraint[]; notes: string[];
}

export type FantaMyTeam = FantaMyTeamData;

export interface FantaGeneralStandingsRow {
  id: string; rank: number; teamName: string; ownerLabel: string; totalPoints: number; livePoints: number; captainName: string;
  defendersCount: number; trend: FantaTrend; statusLabel: 'Live' | 'Stabile' | 'Recupero'; gapFromLeader: number; isMine?: boolean;
  goals: number; blows: number; wins: number; bonusScia: number; playersInGame: number;
}
export interface FantaGeneralStandingsData { editionLabel: string; myTeamId: string; rows: FantaGeneralStandingsRow[]; }

export interface FantaPlayersStandingsRow {
  id: string; rank: number; playerName: string; realTeamName: string; fantasyPoints: number; livePoints: number; roleLabel: string;
  selectedByTeams: number; status: FantaPlayerAvailability; isInMyTeam?: boolean; note: string;
  goals: number; blows: number; wins: number; bonusScia: number;
}
export interface FantaPlayersStandingsData { editionLabel: string; featuredPlayerId: string; rows: FantaPlayersStandingsRow[]; }

export interface FantaRulesScoringRow { id: string; label: string; valueLabel: string; helper: string; }
export interface FantaRulesConstraintRow { id: string; label: string; helper: string; }
export interface FantaRulesFaqRow { id: string; question: string; answer: string; }
export interface FantaRulesData { title: string; intro: string; scoringRows: FantaRulesScoringRow[]; constraints: FantaRulesConstraintRow[]; notes: string[]; faqs: FantaRulesFaqRow[]; }

export interface FantaHistoryEditionRow {
  id: string; editionLabel: string; seasonLabel: string; winnerTeamName: string; winnerOwnerLabel: string; winnerPoints: number; completedTeams: number;
  completedMatchesLabel: string; note: string; statusLabel: 'Archiviato' | 'Storico';
}
export interface FantaHistoryData { title: string; intro: string; featuredEditionId: string; totalEditionsLabel: string; bestScoreLabel: string; reigningChampionLabel: string; editions: FantaHistoryEditionRow[]; }

export interface FantaTeamDetailLineupRow { id: string; playerId: string; playerName: string; roleLabel: string; realTeamName: string; fantasyPoints: number; status: FantaPlayerAvailability; note: string; goals: number; blows: number; wins: number; bonusScia: number; }
export interface FantaTeamDetailData {
  id: string; teamName: string; ownerLabel: string; editionLabel: string; currentRankLabel: string; totalPointsLabel: string; livePointsLabel: string; gapLabel: string; note: string;
  lineup: FantaTeamDetailLineupRow[]; summaryCards: Array<{ id: string; label: string; value: string; hint?: string }>;
  pointsBreakdown: { goals: number; blows: number; wins: number; bonusScia: number; };
}

export interface FantaPlayerDetailContributionRow { id: string; label: string; valueLabel: string; helper: string; }
export interface FantaPlayerDetailData {
  id: string; playerName: string; realTeamName: string; roleLabel: string; availabilityLabel: string; editionLabel: string;
  fantasyPointsLabel: string; livePointsLabel: string; selectedByTeamsLabel: string; note: string;
  summaryCards: Array<{ id: string; label: string; value: string; hint?: string }>; contributionRows: FantaPlayerDetailContributionRow[];
}

export interface FantaHistoryEditionDetailData {
  id: string; editionLabel: string; seasonLabel: string; winnerTeamName: string; winnerOwnerLabel: string; winnerPointsLabel: string; intro: string;
  summaryCards: Array<{ id: string; label: string; value: string; hint?: string }>; highlights: string[];
  podium: Array<{ id: string; rankLabel: string; teamName: string; ownerLabel: string; pointsLabel: string }>;
}

export interface FantaArchivedEdition {
  tournamentId: string;
  tournamentName: string;
  dateLabel: string;
  winnerTeamName: string;
  winnerPoints: number;
  teamsCount: number;
  updatedAt?: string;
}

export interface FantaArchivedStandingRow {
  teamId: string;
  userId?: string | null;
  rank: number;
  teamName: string;
  totalPoints: number;
  goals: number;
  blows: number;
  wins: number;
  bonusScia: number;
  playersInGame: number;
}

export interface FantaArchivedPlayerRow {
  playerId: string;
  rank: number;
  playerName: string;
  realTeamName: string;
  totalPoints: number;
  goals: number;
  blows: number;
  wins: number;
  bonusScia: number;
}

export interface FantaArchivedEditionDetail {
  edition: FantaArchivedEdition;
  standings: FantaArchivedStandingRow[];
  topPlayers: FantaArchivedPlayerRow[];
}

export interface FantaBuilderPlayerOption { id: string; playerName: string; realTeamName: string; realTeamId?: string; status: FantaPlayerAvailability; trend: FantaTrend; note: string; }
export interface FantaBuilderTeamGroup { id: string; teamName: string; players: FantaBuilderPlayerOption[]; }
export interface FantaTeamBuilderData {
  editionLabel: string; buildWindowLabel: string; buildWindowHint: string; isReadOnly: boolean;
  initialSelectedIds: string[]; initialCaptainId: string; initialDefenderIds: string[]; teams: FantaBuilderTeamGroup[];
  tournamentName: string; registrationStatus: string;
}

export interface FantaQuickHelpItem { id: FantaQuickHelpTopic; title: string; body: string; }
