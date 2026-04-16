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
    { id: 'total_points', label: 'Punti fantasy', value: '86', hint: '3° posto generale provvisorio' },
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
    { id: 'qa_builder', title: 'Crea / modifica squadra', description: 'Apri il builder fantasy con ruoli e lock.', target: 'team_builder' },
    { id: 'qa_team', title: 'Completa la mia squadra', description: 'Controlla ruoli, capitano e difensori prima del lock.', target: 'my_team' },
    { id: 'qa_standings', title: 'Apri la classifica generale', description: 'Confronta il tuo punteggio con le altre squadre fantasy.', target: 'general_standings' },
    { id: 'qa_players', title: 'Segui i giocatori live', description: 'Guarda chi sta spingendo di più in ottica fantasy.', target: 'players_standings' },
    { id: 'qa_rules', title: 'Rivedi il regolamento', description: 'Controlla ruoli, bonus e vincoli della modalità.', target: 'rules' },
  ],
  rulesHighlights: [
    { id: 'rule_1', label: 'Rosa', value: '4 giocatori · 1 capitano · fino a 2 difensori' },
    { id: 'rule_2', label: 'Punteggi base', value: 'Canestro 1 · Soffio 2 · Vittoria 7' },
    { id: 'rule_3', label: 'Lock squadra', value: 'Modifiche consentite solo fino alla prima partita' },
  ],
  historyHighlight: { editionLabel: 'Winter Cup 2025', winnerTeamName: 'Tappi Volanti', winnerPoints: 142, note: 'Edizione inaugurale vinta con sprint finale.' },
  liveLabel: 'Live fantasy attivo',
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
  players: [
    { id: 'fp_1', playerName: 'Luca Bianchi', realTeamName: 'Red Cups', fantasyPoints: 18, role: 'captain', status: 'live', note: 'Sta trascinando il punteggio live.' },
    { id: 'fp_2', playerName: 'Marco Rossi', realTeamName: 'Foam Brothers', fantasyPoints: 12, role: 'defender', status: 'live', note: 'Difensore attivo con buon impatto.' },
    { id: 'fp_4', playerName: 'Gio Neri', realTeamName: 'Foam Brothers', fantasyPoints: 6, role: 'defender', status: 'waiting', note: 'In attesa del prossimo blocco partite.' },
    { id: 'fp_5', playerName: 'Vale Blu', realTeamName: 'Plastic Storm', fantasyPoints: 9, role: 'starter', status: 'waiting', note: 'Titolare utile per stabilizzare la giornata.' },
  ],
  constraints: [
    { id: 'c_1', label: '4 giocatori selezionati', satisfied: true, helper: 'La rosa è completa.' },
    { id: 'c_2', label: '1 capitano assegnato', satisfied: true, helper: 'Il capitano attuale è Luca Bianchi.' },
    { id: 'c_3', label: 'Massimo 2 difensori', satisfied: true, helper: 'Attualmente hai 2 difensori.' },
    { id: 'c_4', label: 'Capitano distinto dai difensori', satisfied: true, helper: 'Nessuna sovrapposizione di ruolo.' },
  ],
  notes: ['Il lock squadra scatterà alla prima partita live della giornata.', 'Il builder è predisposto per persistenza futura.'],
};

export const FANTA_GENERAL_STANDINGS_MOCK: FantaGeneralStandingsData = {
  editionLabel: 'Classifica generale · Spring Cup 2026',
  myTeamId: 'fantateam_3',
  rows: [
    { id: 'fantateam_1', rank: 1, teamName: 'Beer Hunters', ownerLabel: 'Team di Andrea', totalPoints: 93, livePoints: 24, captainName: 'Matteo Gialli', defendersCount: 2, trend: 'up', statusLabel: 'Live', gapFromLeader: 0 },
    { id: 'fantateam_2', rank: 2, teamName: 'Ultimo Soffio', ownerLabel: 'Team di Sara', totalPoints: 90, livePoints: 18, captainName: 'Gio Neri', defendersCount: 1, trend: 'steady', statusLabel: 'Stabile', gapFromLeader: 3 },
    { id: 'fantateam_3', rank: 3, teamName: 'I Soffi del Destino', ownerLabel: 'La tua squadra', totalPoints: 86, livePoints: 21, captainName: 'Luca Bianchi', defendersCount: 2, trend: 'up', statusLabel: 'Live', gapFromLeader: 7, isMine: true },
    { id: 'fantateam_4', rank: 4, teamName: 'Plastic Dynasty', ownerLabel: 'Team di Vale', totalPoints: 81, livePoints: 12, captainName: 'Marco Rossi', defendersCount: 2, trend: 'down', statusLabel: 'Recupero', gapFromLeader: 12 },
  ],
};

export const FANTA_PLAYERS_STANDINGS_MOCK: FantaPlayersStandingsData = {
  editionLabel: 'Classifica giocatori · Spring Cup 2026',
  featuredPlayerId: 'fp_1',
  rows: [
    { id: 'fp_1', rank: 1, playerName: 'Luca Bianchi', realTeamName: 'Red Cups', fantasyPoints: 18, livePoints: 11, roleLabel: 'Capitano', selectedByTeams: 7, status: 'live', isInMyTeam: true, note: 'Player più caldo della giornata fantasy.' },
    { id: 'fp_2', rank: 2, playerName: 'Marco Rossi', realTeamName: 'Foam Brothers', fantasyPoints: 16, livePoints: 8, roleLabel: 'Difensore', selectedByTeams: 5, status: 'live', isInMyTeam: true, note: 'Ottimo impatto difensivo.' },
    { id: 'fp_3', rank: 3, playerName: 'Matteo Gialli', realTeamName: 'Plastic Storm', fantasyPoints: 14, livePoints: 9, roleLabel: 'Capitano', selectedByTeams: 6, status: 'live', note: 'Molto scelto nelle squadre di testa.' },
    { id: 'fp_4', rank: 4, playerName: 'Gio Neri', realTeamName: 'Foam Brothers', fantasyPoints: 12, livePoints: 4, roleLabel: 'Difensore', selectedByTeams: 4, status: 'waiting', isInMyTeam: true, note: 'In attesa del prossimo slot match.' },
    { id: 'fp_5', rank: 5, playerName: 'Vale Blu', realTeamName: 'Plastic Storm', fantasyPoints: 11, livePoints: 5, roleLabel: 'Titolare', selectedByTeams: 3, status: 'waiting', isInMyTeam: true, note: 'Profilo stabile utile per coprire la giornata.' },
  ],
};

export const FANTA_RULES_MOCK: FantaRulesData = {
  title: 'Regole essenziali della modalità fantasy',
  intro: "Punteggi, vincoli della rosa, bonus e chiarimenti più utili senza cambiare lo stile semplice e mobile-first dell'app.",
  scoringRows: [
    { id: 'score_goal', label: 'Canestro', valueLabel: '+1', helper: 'Ogni canestro segnato vale 1 punto fantasy.' },
    { id: 'score_blow', label: 'Soffio', valueLabel: '+2', helper: 'Ogni soffio registrato genera 2 punti fantasy.' },
    { id: 'score_win', label: 'Vittoria', valueLabel: '+7', helper: 'Bonus vittoria del match.' },
    { id: 'score_final_bonus', label: 'Bonus finali', valueLabel: '+10', helper: 'Bonus conclusivi previsti dal regolamento.' },
    { id: 'score_streak', label: 'Bonus Scia', valueLabel: '+5', helper: 'Bonus speciale della modalità FantaBeerpong.' },
  ],
  constraints: [
    { id: 'constraint_roster', label: 'La rosa è composta da 4 giocatori.', helper: 'La squadra fantasy non è valida con meno o più di 4 slot.' },
    { id: 'constraint_captain', label: 'Devi nominare 1 Capitano.', helper: 'Il Capitano è obbligatorio e deve essere uno solo.' },
    { id: 'constraint_defenders', label: 'Puoi avere fino a 2 Difensori.', helper: 'Non puoi superare il limite massimo di 2.' },
    { id: 'constraint_roles', label: 'Capitano e Difensore devono restare separati.', helper: 'Lo stesso giocatore non può occupare entrambi i ruoli speciali.' },
    { id: 'constraint_lock', label: 'La squadra è modificabile solo fino alla prima partita.', helper: 'Dopo il lock iniziale non puoi cambiare la rosa.' },
  ],
  notes: ['Il Bonus Scia resta evidenziato come regola chiave.', 'Le validazioni reali vanno collegate ai dati live/backoffice.'],
  faqs: [
    { id: 'faq_1', question: "Quando si blocca la mia squadra fantasy?", answer: "Alla prima partita utile prevista dalla modalità." },
    { id: 'faq_2', question: "Posso avere due Difensori?", answer: "Sì, fino a un massimo di 2 e con Capitano separato." },
    { id: 'faq_3', question: "Come funziona il Bonus Scia?", answer: "Vale 5 punti secondo le regole dell\'edizione FantaBeerpong." },
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
    { id: 'fh_2025_winter', editionLabel: 'Winter Cup 2025', seasonLabel: 'Inaugurale', winnerTeamName: 'Tappi Volanti', winnerOwnerLabel: 'Team di Marco', winnerPoints: 142, completedTeams: 18, completedMatchesLabel: '18 squadre fantasy · finali concluse', note: 'Edizione inaugurale chiusa con sprint finale.', statusLabel: 'Archiviato' },
    { id: 'fh_2025_summer', editionLabel: 'Summer Cup 2025', seasonLabel: 'Seconda edizione', winnerTeamName: 'Beer Hunters', winnerOwnerLabel: 'Team di Andrea', winnerPoints: 136, completedTeams: 16, completedMatchesLabel: '16 squadre fantasy · tabellone completo', note: 'Classifica molto corta fino alla penultima partita.', statusLabel: 'Storico' },
    { id: 'fh_2024_autumn', editionLabel: 'Autumn Test 2024', seasonLabel: 'Preview mode', winnerTeamName: 'Plastic Dynasty', winnerOwnerLabel: 'Team di Vale', winnerPoints: 118, completedTeams: 10, completedMatchesLabel: '10 squadre fantasy · formato pilota', note: 'Formato sperimentale che ha definito la base della modalità attuale.', statusLabel: 'Storico' },
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
    note: 'Detail squadra fantasy con ritorno diretto al percorso FantaBeerpong.',
    summaryCards: [
      { id: 'rank', label: 'Posizione', value: '#3', hint: 'Classifica generale fantasy' },
      { id: 'points', label: 'Punti totali', value: '86', hint: 'Snapshot attuale' },
      { id: 'live', label: 'Live points', value: '21', hint: 'Giornata in corso' },
      { id: 'captain', label: 'Capitano', value: 'Luca Bianchi', hint: 'Ruolo bonus attivo' },
    ],
    lineup: [
      { id: 'l1', playerId: 'fp_1', playerName: 'Luca Bianchi', roleLabel: 'Capitano', realTeamName: 'Red Cups', fantasyPoints: 18, status: 'live', note: 'Driver principale della giornata.' },
      { id: 'l2', playerId: 'fp_2', playerName: 'Marco Rossi', roleLabel: 'Difensore', realTeamName: 'Foam Brothers', fantasyPoints: 12, status: 'live', note: 'Buon impatto sul lato difensivo.' },
      { id: 'l3', playerId: 'fp_4', playerName: 'Gio Neri', roleLabel: 'Difensore', realTeamName: 'Foam Brothers', fantasyPoints: 6, status: 'waiting', note: 'Atteso nel prossimo blocco.' },
      { id: 'l4', playerId: 'fp_5', playerName: 'Vale Blu', roleLabel: 'Titolare', realTeamName: 'Plastic Storm', fantasyPoints: 9, status: 'waiting', note: 'Profilo di equilibrio della rosa.' },
    ],
  },
};

export const FANTA_PLAYER_DETAILS_BY_ID: Record<string, FantaPlayerDetailData> = {
  fp_1: {
    id: 'fp_1', playerName: 'Luca Bianchi', realTeamName: 'Red Cups', roleLabel: 'Capitano', availabilityLabel: 'In gioco',
    editionLabel: 'Spring Cup 2026', fantasyPointsLabel: '18', livePointsLabel: '11', selectedByTeamsLabel: '7 squadre fantasy',
    note: 'Dettaglio live del giocatore fantasy con breakdown contributi.',
    summaryCards: [
      { id: 'fp', label: 'Punti fantasy', value: '18', hint: 'Totale attuale' },
      { id: 'lp', label: 'Live points', value: '11', hint: 'Giornata in corso' },
      { id: 'sel', label: 'Selezionato da', value: '7', hint: 'Squadre fantasy' },
      { id: 'role', label: 'Ruolo', value: 'Capitano', hint: 'Ruolo nella tua rosa' },
    ],
    contributionRows: [
      { id: 'c1', label: 'Canestri', valueLabel: '+6', helper: '6 canestri registrati nella giornata' },
      { id: 'c2', label: 'Soffi', valueLabel: '+4', helper: '2 soffi con bonus da 2 punti' },
      { id: 'c3', label: 'Vittoria', valueLabel: '+7', helper: 'Bonus vittoria del match' },
    ],
  },
  fp_2: {
    id: 'fp_2', playerName: 'Marco Rossi', realTeamName: 'Foam Brothers', roleLabel: 'Difensore', availabilityLabel: 'In gioco',
    editionLabel: 'Spring Cup 2026', fantasyPointsLabel: '16', livePointsLabel: '8', selectedByTeamsLabel: '5 squadre fantasy',
    note: 'Difensore molto usato nelle squadre di testa.',
    summaryCards: [
      { id: 'fp', label: 'Punti fantasy', value: '16', hint: 'Totale attuale' },
      { id: 'lp', label: 'Live points', value: '8', hint: 'Giornata in corso' },
      { id: 'sel', label: 'Selezionato da', value: '5', hint: 'Squadre fantasy' },
      { id: 'role', label: 'Ruolo', value: 'Difensore', hint: 'Ruolo nella tua rosa' },
    ],
    contributionRows: [
      { id: 'c1', label: 'Canestri', valueLabel: '+4', helper: '4 canestri registrati' },
      { id: 'c2', label: 'Soffi', valueLabel: '+4', helper: '2 soffi registrati' },
      { id: 'c3', label: 'Vittoria', valueLabel: '+7', helper: 'Bonus vittoria del match' },
    ],
  },
  fp_4: {
    id: 'fp_4', playerName: 'Gio Neri', realTeamName: 'Foam Brothers', roleLabel: 'Difensore', availabilityLabel: 'In attesa',
    editionLabel: 'Spring Cup 2026', fantasyPointsLabel: '12', livePointsLabel: '4', selectedByTeamsLabel: '4 squadre fantasy',
    note: 'Giocatore in attesa del prossimo slot.',
    summaryCards: [
      { id: 'fp', label: 'Punti fantasy', value: '12', hint: 'Totale attuale' },
      { id: 'lp', label: 'Live points', value: '4', hint: 'Giornata in corso' },
      { id: 'sel', label: 'Selezionato da', value: '4', hint: 'Squadre fantasy' },
      { id: 'role', label: 'Ruolo', value: 'Difensore', hint: 'Ruolo nella tua rosa' },
    ],
    contributionRows: [
      { id: 'c1', label: 'Canestri', valueLabel: '+2', helper: 'Parziale precedente' },
      { id: 'c2', label: 'Soffi', valueLabel: '+2', helper: 'Un soffio registrato' },
    ],
  },
  fp_5: {
    id: 'fp_5', playerName: 'Vale Blu', realTeamName: 'Plastic Storm', roleLabel: 'Titolare', availabilityLabel: 'In attesa',
    editionLabel: 'Spring Cup 2026', fantasyPointsLabel: '11', livePointsLabel: '5', selectedByTeamsLabel: '3 squadre fantasy',
    note: 'Profilo di copertura della tua rosa fantasy.',
    summaryCards: [
      { id: 'fp', label: 'Punti fantasy', value: '11', hint: 'Totale attuale' },
      { id: 'lp', label: 'Live points', value: '5', hint: 'Giornata in corso' },
      { id: 'sel', label: 'Selezionato da', value: '3', hint: 'Squadre fantasy' },
      { id: 'role', label: 'Ruolo', value: 'Titolare', hint: 'Ruolo nella tua rosa' },
    ],
    contributionRows: [
      { id: 'c1', label: 'Canestri', valueLabel: '+3', helper: 'Parziale canestri' },
      { id: 'c2', label: 'Soffi', valueLabel: '+2', helper: 'Parziale soffi' },
    ],
  },
};

export const FANTA_HISTORY_EDITION_DETAILS_BY_ID: Record<string, FantaHistoryEditionDetailData> = {
  fh_2025_winter: {
    id: 'fh_2025_winter', editionLabel: 'Winter Cup 2025', seasonLabel: 'Inaugurale', winnerTeamName: 'Tappi Volanti',
    winnerOwnerLabel: 'Team di Marco', winnerPointsLabel: '142 punti finali', intro: "Dettaglio storico dell\'edizione inaugurale del FantaBeerpong.",
    summaryCards: [
      { id: 'teams', label: 'Squadre fantasy', value: '18', hint: 'Partecipazione totale' },
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
