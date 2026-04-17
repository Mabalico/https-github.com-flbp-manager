import type {
  FantaGeneralStandingsData,
  FantaHistoryData,
  FantaHistoryEditionDetailData,
  FantaMyTeamData,
  FantaOverviewData,
  FantaPlayerDetailData,
  FantaPlayersStandingsData,
  FantaRulesData,
  FantaTeamBuilderData,
  FantaTeamDetailData,
} from './types';

export const FANTA_OVERVIEW_MOCK: FantaOverviewData = {
  editionLabel: 'FantaBeerpong · Spring Cup 2026',
  teamName: 'I Soffi del Destino',
  teamBuildStatus: 'ready',
  teamBuildStatusLabel: 'Squadra pronta',
  teamBuildStatusHint: 'Puoi ancora modificare la rosa fino alla prima partita del live.',
  metrics: [
    { id: 'total_points', label: 'Punti Fanta', value: '86', hint: '3° posto generale provvisorio' },
    { id: 'rank', label: 'Posizione', value: '#3', hint: '-7 dalla vetta' },
    { id: 'live_players', label: 'Giocatori in gioco', value: '2/4', hint: 'Aggiornamento live attivo' },
    { id: 'bonus', label: 'Bonus Scia', value: 'Disponibile', hint: 'Nessun consumo nella giornata corrente' },
  ],
  lineupSummary: { selectedPlayers: 4, captainName: 'Luca Bianchi', defendersCount: 2, bonusSciaAvailable: true },
  standingsPreview: [
    { id: 'fantateam_1', rank: 1, teamName: 'Beer Hunters', points: 93, trend: 'up', gapLabel: 'Leader attuale' },
    { id: 'fantateam_2', rank: 2, teamName: 'Ultimo Soffio', points: 90, trend: 'steady', gapLabel: '-3 dalla vetta' },
    { id: 'fantateam_3', rank: 3, teamName: 'I Soffi del Destino', points: 86, trend: 'up', gapLabel: '-7 dalla vetta', isMine: true },
  ],
  livePlayersPreview: [
    { id: 'fp_1', playerName: 'Luca Bianchi', teamName: 'Red Cups', fantasyPoints: 18, roleLabel: 'Capitano', availability: 'live' },
    { id: 'fp_2', playerName: 'Marco Rossi', teamName: 'Foam Brothers', fantasyPoints: 12, roleLabel: 'Difensore', availability: 'live' },
    { id: 'fp_4', playerName: 'Gio Neri', teamName: 'Foam Brothers', fantasyPoints: 6, roleLabel: 'Titolare', availability: 'waiting' },
  ],
  quickActions: [
    { id: 'qa_builder', title: 'Crea / modifica squadra', description: 'Apri il builder Fanta con ruoli e lock.', target: 'team_builder' },
    { id: 'qa_team', title: 'Completa la mia squadra', description: 'Controlla ruoli, capitano e difensori prima del lock.', target: 'my_team' },
    { id: 'qa_standings', title: 'Apri la classifica generale', description: 'Confronta il tuo punteggio con le altre squadre Fanta.', target: 'general_standings' },
    { id: 'qa_players', title: 'Segui i giocatori live', description: 'Guarda chi sta spingendo di più in ottica Fanta.', target: 'players_standings' },
    { id: 'qa_rules', title: 'Rivedi il regolamento', description: 'Controlla ruoli, bonus e vincoli della modalità.', target: 'rules' },
  ],
  rulesHighlights: [
    { id: 'rule_1', label: 'Rosa', value: '4 giocatori · 1 capitano · 2 difensori' },
    { id: 'rule_2', label: 'Punteggi base', value: 'Canestro 1 · Soffio 2 · Vittoria 7' },
    { id: 'rule_3', label: 'Lock squadra', value: 'Modifiche consentite solo fino alla prima partita' },
  ],
  historyHighlight: { editionLabel: 'Winter Cup 2025', winnerTeamName: 'Tappi Volanti', winnerPoints: 142, note: 'Edizione inaugurale vinta con sprint finale.' },
  liveLabel: 'Live Fanta attivo',
  liveHint: 'Dati mock strutturati come base di lavoro per integrazione reale.',
};

export const FANTA_MY_TEAM_MOCK: FantaMyTeamData = {
  editionLabel: 'Spring Cup 2026',
  teamName: 'I Soffi del Destino',
  buildStatus: 'ready',
  buildStatusLabel: 'Roster pronto',
  lockLabel: 'Lock tra 02h 14m',
  lockHint: 'Puoi ancora modificare la squadra fino alla prima partita ufficiale del live.',
  summary: { selectedPlayers: 4, captainName: 'Luca Bianchi', defendersCount: 2, currentRankLabel: '#3 provvisorio' },
  pointsBreakdown: { goals: 28, blows: 12, wins: 35, bonusScia: 11 },
  teamsToFollow: [
    { id: 't_wolves', teamName: 'Wolves', followingFor: 'Luca Bianchi (eliminato)' },
    { id: 't_reds', teamName: 'Red Cups', followingFor: 'Marco Rossi (eliminato)' },
  ],
  players: [
    { id: 'fp_1', playerName: 'Luca Bianchi', realTeamName: 'Red Cups', fantasyPoints: 18, role: 'captain', status: 'live', note: 'Sta trascinando il punteggio live.', goals: 6, blows: 2, wins: 1, bonusScia: 0 },
    { id: 'fp_2', playerName: 'Marco Rossi', realTeamName: 'Foam Brothers', fantasyPoints: 12, role: 'defender', status: 'live', note: 'Difensore attivo con buon impatto.', goals: 4, blows: 2, wins: 1, bonusScia: 0 },
    { id: 'fp_4', playerName: 'Gio Neri', realTeamName: 'Foam Brothers', fantasyPoints: 6, role: 'defender', status: 'waiting', note: 'In attesa del prossimo blocco partite.', goals: 2, blows: 1, wins: 0, bonusScia: 2 },
    { id: 'fp_5', playerName: 'Vale Blu', realTeamName: 'Plastic Storm', fantasyPoints: 9, role: 'starter', status: 'waiting', note: 'Titolare utile per stabilizzare la giornata.', goals: 3, blows: 1, wins: 0, bonusScia: 5 },
  ],
  constraints: [
    { id: 'c_1', label: '4 giocatori selezionati', satisfied: true, helper: 'La rosa è completa.' },
    { id: 'c_2', label: '1 capitano assegnato', satisfied: true, helper: 'Il capitano attuale è Luca Bianchi.' },
    { id: 'c_3', label: '2 difensori obbligatori', satisfied: true, helper: 'Attualmente hai 2 difensori.' },
    { id: 'c_4', label: 'Capitano distinto dai difensori', satisfied: true, helper: 'Nessuna sovrapposizione di ruolo.' },
  ],
  notes: ['Il lock squadra scatterà alla prima partita live della giornata.', 'Il builder è predisposto per persistenza futura.'],
};

export const FANTA_GENERAL_STANDINGS_MOCK: FantaGeneralStandingsData = {
  editionLabel: 'Classifica generale · Spring Cup 2026',
  myTeamId: 'fantateam_3',
  rows: [
    { id: 'fantateam_1', rank: 1, teamName: 'Beer Hunters', ownerLabel: 'Team di Andrea', totalPoints: 93, livePoints: 24, captainName: 'Matteo Gialli', defendersCount: 2, trend: 'up', statusLabel: 'Live', gapFromLeader: 0, goals: 32, blows: 14, wins: 42, bonusScia: 5, playersInGame: 4 },
    { id: 'fantateam_2', rank: 2, teamName: 'Ultimo Soffio', ownerLabel: 'Team di Sara', totalPoints: 90, livePoints: 18, captainName: 'Gio Neri', defendersCount: 1, trend: 'steady', statusLabel: 'Stabile', gapFromLeader: 3, goals: 30, blows: 16, wins: 35, bonusScia: 9, playersInGame: 3 },
    { id: 'fantateam_3', rank: 3, teamName: 'I Soffi del Destino', ownerLabel: 'La tua squadra', totalPoints: 86, livePoints: 21, captainName: 'Luca Bianchi', defendersCount: 2, trend: 'up', statusLabel: 'Live', gapFromLeader: 7, isMine: true, goals: 28, blows: 12, wins: 35, bonusScia: 11, playersInGame: 2 },
    { id: 'fantateam_4', rank: 4, teamName: 'Plastic Dynasty', ownerLabel: 'Team di Vale', totalPoints: 81, livePoints: 12, captainName: 'Marco Rossi', defendersCount: 2, trend: 'down', statusLabel: 'Recupero', gapFromLeader: 12, goals: 25, blows: 10, wins: 28, bonusScia: 18, playersInGame: 1 },
  ],
};

export const FANTA_PLAYERS_STANDINGS_MOCK: FantaPlayersStandingsData = {
  editionLabel: 'Classifica giocatori · Spring Cup 2026',
  featuredPlayerId: 'fp_1',
  rows: [
    { id: 'fp_1', rank: 1, playerName: 'Luca Bianchi', realTeamName: 'Red Cups', fantasyPoints: 18, livePoints: 11, roleLabel: 'Capitano', selectedByTeams: 7, status: 'live', isInMyTeam: true, note: 'Player più caldo della giornata Fanta.', goals: 6, blows: 2, wins: 1, bonusScia: 0 },
    { id: 'fp_2', rank: 2, playerName: 'Marco Rossi', realTeamName: 'Foam Brothers', fantasyPoints: 16, livePoints: 8, roleLabel: 'Difensore', selectedByTeams: 5, status: 'live', isInMyTeam: true, note: 'Ottimo impatto difensivo.', goals: 5, blows: 2, wins: 1, bonusScia: 0 },
    { id: 'fp_3', rank: 3, playerName: 'Matteo Gialli', realTeamName: 'Plastic Storm', fantasyPoints: 14, livePoints: 9, roleLabel: 'Capitano', selectedByTeams: 6, status: 'live', note: 'Molto scelto nelle squadre di testa.', goals: 4, blows: 1, wins: 1, bonusScia: 0 },
    { id: 'fp_4', rank: 4, playerName: 'Gio Neri', realTeamName: 'Foam Brothers', fantasyPoints: 12, livePoints: 4, roleLabel: 'Difensore', selectedByTeams: 4, status: 'waiting', isInMyTeam: true, note: 'In attesa del prossimo slot match.', goals: 3, blows: 1, wins: 0, bonusScia: 3 },
    { id: 'fp_5', rank: 5, playerName: 'Vale Blu', realTeamName: 'Plastic Storm', fantasyPoints: 11, livePoints: 5, roleLabel: 'Titolare', selectedByTeams: 3, status: 'waiting', isInMyTeam: true, note: 'Profilo stabile utile per coprire la giornata.', goals: 2, blows: 1, wins: 0, bonusScia: 5 },
  ],
};

export const FANTA_RULES_MOCK: FantaRulesData = {
  title: 'Regole essenziali della modalità Fanta',
  intro: "Punteggi, vincoli della rosa, bonus e chiarimenti più utili senza cambiare lo stile semplice e mobile-first dell'app.",
  scoringRows: [
    { id: 'score_goal', label: 'Canestro', valueLabel: '+1 punto', helper: 'Ogni canestro segnato vale 1 punto Fanta.' },
    { id: 'score_blow', label: 'Soffio', valueLabel: '+2 punti', helper: 'Ogni soffio registrato genera 2 punti Fanta.' },
    { id: 'score_win', label: 'Vittoria', valueLabel: '+7 punti', helper: 'Bonus vittoria del match.' },
    { id: 'score_final_bonus', label: 'Bonus finali', valueLabel: '+10 punti', helper: 'MVP, Capocannoniere o Miglior Difensore del torneo.' },
    { id: 'score_streak', label: 'Bonus Scia', valueLabel: '+5 punti', helper: 'Ogni vittoria successiva della squadra che ha eliminato il tuo giocatore.' },
  ],
  constraints: [
    { id: 'constraint_roster', label: 'La rosa è composta da 4 giocatori.', helper: 'Scegli saggiamente i tuoi 4 slot.' },
    { id: 'constraint_captain', label: '1 Capitano (Punti x2)', helper: 'Il Capitano raddoppia TUTTI i punti ottenuti dal giocatore.' },
    { id: 'constraint_defenders', label: '2 Difensori obbligatori (Soffi x2)', helper: 'Il Difensore raddoppia solo il valore dei soffi.' },
    { id: 'constraint_roles', label: 'Ruoli separati', helper: 'Lo stesso giocatore non può essere sia Capitano che Difensore.' },
    { id: 'constraint_lock', label: 'Lock squadra', helper: 'Squadra bloccata dall\'inizio della prima partita del torneo.' },
  ],
  notes: [
    'Il Bonus Scia si interrompe alla prima sconfitta della squadra eliminatrice.',
    'La partita in cui il giocatore viene eliminato non assegna Bonus Scia.',
  ],
  faqs: [
    { id: 'faq_1', question: "Cosa succede se il mio giocatore viene eliminato?", answer: "Smetti di prendere i suoi punti live, ma attivi il Bonus Scia (5pt per ogni vittoria futura della squadra che lo ha battuto) finché quella squadra non perde." },
      { id: 'faq_2', question: "Posso cambiare i ruoli durante il torneo?", answer: "No, i ruoli (Capitano e Difensori) sono bloccati insieme alla rosa all'inizio della prima partita." },
    { id: 'faq_3', question: "Chi vince in caso di parità?", answer: "Conta prima chi ha più giocatori ancora in gioco, poi i punti da vittorie, infine i canestri." },
  ],
};

export const FANTA_HISTORY_MOCK: FantaHistoryData = {
  title: 'Archivio delle edizioni FantaBeerpong',
  intro: 'Storico sintetico e leggibile delle edizioni concluse.',
  featuredEditionId: 'fh_2025_winter',
  totalEditionsLabel: '3 edizioni archiviate',
  bestScoreLabel: 'Best score storico: 142 pt',
  reigningChampionLabel: 'Campione in carica: Tappi Volanti',
  editions: [
    { id: 'fh_2025_winter', editionLabel: 'Winter Cup 2025', seasonLabel: 'Inaugurale', winnerTeamName: 'Tappi Volanti', winnerOwnerLabel: 'Team di Marco', winnerPoints: 142, completedTeams: 18, completedMatchesLabel: '18 squadre Fanta · finali concluse', note: 'Edizione inaugurale chiusa con sprint finale.', statusLabel: 'Archiviato' },
    { id: 'fh_2025_summer', editionLabel: 'Summer Cup 2025', seasonLabel: 'Seconda edizione', winnerTeamName: 'Beer Hunters', winnerOwnerLabel: 'Team di Andrea', winnerPoints: 136, completedTeams: 16, completedMatchesLabel: '16 squadre Fanta · tabellone completo', note: 'Classifica molto corta fino alla penultima partita.', statusLabel: 'Storico' },
    { id: 'fh_2024_autumn', editionLabel: 'Autumn Test 2024', seasonLabel: 'Preview mode', winnerTeamName: 'Plastic Dynasty', winnerOwnerLabel: 'Team di Vale', winnerPoints: 118, completedTeams: 10, completedMatchesLabel: '10 squadre Fanta · formato pilota', note: 'Formato sperimentale che ha definito la base della modalità attuale.', statusLabel: 'Storico' },
  ],
};

export const FANTA_TEAM_DETAILS_BY_ID: Record<string, FantaTeamDetailData> = {
  fantateam_3: {
    id: 'fantateam_3',
    teamName: 'I Soffi del Destino',
    ownerLabel: 'La tua squadra',
    editionLabel: 'Spring Cup 2026',
    currentRankLabel: '#3 provvisorio',
    totalPointsLabel: '86',
    livePointsLabel: '21',
    gapLabel: '-7 dalla vetta',
    note: 'Detail squadra Fanta con ritorno diretto al percorso FantaBeerpong.',
    pointsBreakdown: { goals: 28, blows: 12, wins: 35, bonusScia: 11 },
    summaryCards: [
      { id: 'rank', label: 'Posizione', value: '#3', hint: 'Classifica generale Fanta' },
      { id: 'points', label: 'Punti totali', value: '86', hint: 'Snapshot attuale' },
      { id: 'live', label: 'Live points', value: '21', hint: 'Giornata in corso' },
      { id: 'captain', label: 'Capitano', value: 'Luca Bianchi', hint: 'Ruolo bonus attivo' },
    ],
    lineup: [
      { id: 'l1', playerId: 'fp_1', playerName: 'Luca Bianchi', roleLabel: 'Capitano', realTeamName: 'Red Cups', fantasyPoints: 18, status: 'live', note: 'Driver principale della giornata.', goals: 6, blows: 2, wins: 1, bonusScia: 0 },
      { id: 'l2', playerId: 'fp_2', playerName: 'Marco Rossi', roleLabel: 'Difensore', realTeamName: 'Foam Brothers', fantasyPoints: 12, status: 'live', note: 'Buon impatto sul lato difensivo.', goals: 4, blows: 2, wins: 1, bonusScia: 0 },
      { id: 'l3', playerId: 'fp_4', playerName: 'Gio Neri', roleLabel: 'Difensore', realTeamName: 'Foam Brothers', fantasyPoints: 6, status: 'waiting', note: 'Atteso nel prossimo blocco.', goals: 2, blows: 1, wins: 0, bonusScia: 2 },
      { id: 'l4', playerId: 'fp_5', playerName: 'Vale Blu', roleLabel: 'Titolare', realTeamName: 'Plastic Storm', fantasyPoints: 9, status: 'waiting', note: 'Profilo di equilibrio della rosa.', goals: 3, blows: 1, wins: 0, bonusScia: 5 },
    ],
  },
};

export const FANTA_PLAYER_DETAILS_BY_ID: Record<string, FantaPlayerDetailData> = {
  fp_1: {
    id: 'fp_1', playerName: 'Luca Bianchi', realTeamName: 'Red Cups', roleLabel: 'Capitano', availabilityLabel: 'In gioco',
    editionLabel: 'Spring Cup 2026', fantasyPointsLabel: '18', livePointsLabel: '11', selectedByTeamsLabel: '7 squadre Fanta',
    note: 'Dettaglio live del giocatore Fanta con breakdown contributi.',
    summaryCards: [
      { id: 'fp', label: 'Punti Fanta', value: '18', hint: 'Totale attuale' },
      { id: 'lp', label: 'Live points', value: '11', hint: 'Giornata in corso' },
      { id: 'sel', label: 'Selezionato da', value: '7', hint: 'Squadre Fanta' },
      { id: 'role', label: 'Ruolo', value: 'Capitano', hint: 'Ruolo nella tua rosa' },
    ],
    contributionRows: [
      { id: 'c1', label: 'Canestri', valueLabel: '+6', helper: '6 canestri registrati nella giornata' },
      { id: 'c2', label: 'Soffi', valueLabel: '+4', helper: '2 soffi con bonus da 2 punti' },
      { id: 'c3', label: 'Vittoria', valueLabel: '+7', helper: 'Bonus vittoria del match' },
      { id: 'c4', label: 'Bonus Scia', valueLabel: '+0', helper: 'Giocatore ancora in gioco' },
    ],
  },
};

export const FANTA_HISTORY_EDITION_DETAILS_BY_ID: Record<string, FantaHistoryEditionDetailData> = {
  fh_2025_winter: {
    id: 'fh_2025_winter', editionLabel: 'Winter Cup 2025', seasonLabel: 'Inaugurale', winnerTeamName: 'Tappi Volanti',
    winnerOwnerLabel: 'Team di Marco', winnerPointsLabel: '142 punti finali', intro: "Dettaglio storico dell\'edizione inaugurale del FantaBeerpong.",
    summaryCards: [
      { id: 'teams', label: 'Squadre Fanta', value: '18', hint: 'Partecipazione totale' },
      { id: 'winner', label: 'Vincitore', value: 'Tappi Volanti', hint: 'Team di Marco' },
      { id: 'score', label: 'Best score', value: '142', hint: 'Miglior punteggio dell\'archivio' },
      { id: 'format', label: 'Formato', value: 'Inaugurale', hint: 'Prima edizione archiviata' },
    ],
    highlights: ['Sprint finale deciso nell\'ultima giornata.', 'Edizione che ha fissato i punteggi di riferimento.', 'Best score storico ancora imbattuto nel mock.'],
    podium: [
      { id: 'p1', rankLabel: '1°', teamName: 'Tappi Volanti', ownerLabel: 'Team di Marco', pointsLabel: '142 pt' },
      { id: 'p2', rankLabel: '2°', teamName: 'Beer Hunters', ownerLabel: 'Team di Andrea', pointsLabel: '138 pt' },
      { id: 'p3', rankLabel: '3°', teamName: 'Coppe Ribelli', ownerLabel: 'Team di Sara', pointsLabel: '131 pt' },
    ],
  },
};

export const FANTA_TEAM_BUILDER_MOCK: FantaTeamBuilderData = {
  editionLabel: 'Builder squadra · Spring Cup 2026',
  buildWindowLabel: 'Finestra modifiche aperta',
  buildWindowHint: 'Puoi cambiare rosa fino alla prima partita utile del live.',
  isReadOnly: false,
  tournamentName: 'Spring Cup 2026',
  registrationStatus: 'Iscrizioni aperte',
  initialSelectedIds: ['fp_1', 'fp_2', 'fp_4', 'fp_5'],
  initialCaptainId: 'fp_1',
  initialDefenderIds: ['fp_2', 'fp_4'],
  teams: [
    { id: 't_red', teamName: 'Red Cups', players: [{ id: 'fp_1', playerName: 'Luca Bianchi', realTeamName: 'Red Cups', status: 'live', trend: 'up', note: 'Player premium molto usato.' }, { id: 'bp_1', playerName: 'Nico Verde', realTeamName: 'Red Cups', status: 'waiting', trend: 'steady', note: 'Pick da copertura.' }] },
    { id: 't_foam', teamName: 'Foam Brothers', players: [{ id: 'fp_2', playerName: 'Marco Rossi', realTeamName: 'Foam Brothers', status: 'live', trend: 'up', note: 'Difensore di valore.' }, { id: 'fp_4', playerName: 'Gio Neri', realTeamName: 'Foam Brothers', status: 'waiting', trend: 'steady', note: 'Buon equilibrio per il roster.' }] },
    { id: 't_plastic', teamName: 'Plastic Storm', players: [{ id: 'fp_3', playerName: 'Matteo Gialli', realTeamName: 'Plastic Storm', status: 'live', trend: 'up', note: 'Capitano molto scelto nelle squadre top.' }, { id: 'fp_5', playerName: 'Vale Blu', realTeamName: 'Plastic Storm', status: 'waiting', trend: 'steady', note: 'Titolare stabile.' }] },
  ],
};

export const getFantaTeamDetail = (teamId: string) => FANTA_TEAM_DETAILS_BY_ID[teamId] || FANTA_TEAM_DETAILS_BY_ID.fantateam_3;
export const getFantaPlayerDetail = (playerId: string) => FANTA_PLAYER_DETAILS_BY_ID[playerId] || FANTA_PLAYER_DETAILS_BY_ID.fp_1;
export const getFantaHistoryEditionDetail = (editionId: string) => FANTA_HISTORY_EDITION_DETAILS_BY_ID[editionId] || FANTA_HISTORY_EDITION_DETAILS_BY_ID.fh_2025_winter;
