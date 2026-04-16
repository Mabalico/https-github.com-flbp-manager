# Component rewire guide

Goal: no Italian hardcoded text should remain in FantaBeerpong when the app language changes.

## Required change
Inside every Fanta component:
1. import `useTranslation` from `../App` or the correct relative path
2. get `const { t } = useTranslation();`
3. replace hardcoded labels with dictionary keys from this pack

## Suggested mapping
- section tabs
  - `Panoramica` -> `t('fanta.section.overview')`
  - `La mia squadra` -> `t('fanta.section.my_team')`
  - `Classifica generale` -> `t('fanta.section.general_standings')`
  - `Classifica giocatori` -> `t('fanta.section.players_standings')`
  - `Regolamento` -> `t('fanta.section.rules')`
  - `Storico` -> `t('fanta.section.history')`

- common actions
  - `Apri la mia squadra` -> `t('fanta.action.open_my_team')`
  - `Apri la classifica generale` -> `t('fanta.action.open_general_standings')`
  - `Apri la classifica giocatori` -> `t('fanta.action.open_players_standings')`
  - `Apri il regolamento` -> `t('fanta.action.open_rules')`
  - `Apri lo storico` -> `t('fanta.action.open_history')`
  - `Torna alla panoramica` -> `t('fanta.action.back_to_overview')`
  - `Gestisci la mia squadra` -> `t('fanta.action.manage_my_team')`
  - `Crea squadra` -> `t('fanta.action.create_team')`
  - `Modifica squadra` -> `t('fanta.action.edit_team')`
  - `Salva squadra` -> `t('fanta.action.save_team')`

- labels / states
  - `Live fantasy attivo` -> `t('fanta.label.live_fantasy_active')`
  - `Squadra pronta` -> `t('fanta.label.team_ready')`
  - `Rosa pronta` -> `t('fanta.label.roster_ready')`
  - `Squadra bloccata` -> `t('fanta.label.team_locked')`
  - `Archiviato` -> `t('fanta.label.archived')`
  - `In gioco` -> `t('fanta.label.in_game')`
  - `In attesa` -> `t('fanta.label.waiting')`
  - `Eliminato` -> `t('fanta.label.eliminated')`
  - `Capitano` -> `t('fanta.label.captain')`
  - `Difensore` -> `t('fanta.label.defender')`
  - `Titolare` -> `t('fanta.label.starter')`
  - `Punti fantasy` -> `t('fanta.label.fantasy_points')`
  - `Posizione` -> `t('fanta.label.position')`
  - `Giocatori live` -> `t('fanta.label.live_players')`
  - `Bonus Scia` -> `t('fanta.label.streak_bonus')`
  - `Vincitore` -> `t('fanta.label.winner')`
  - `Punteggio finale` -> `t('fanta.label.final_score')`
  - `Ruolo` -> `t('fanta.label.role')`
  - `Stato` -> `t('fanta.label.status')`
  - `Classifica` -> `t('fanta.label.standings')`
  - `Giocatori` -> `t('fanta.label.players')`

- builder / constraints
  - `Modificabile fino alla prima partita` -> `t('fanta.note.modify_until_first_match')`
  - `Massimo 4 giocatori` -> `t('fanta.constraint.max_4_players')`
  - `Esattamente 1 Capitano` -> `t('fanta.constraint.exactly_1_captain')`
  - `Fino a 2 Difensori` -> `t('fanta.constraint.up_to_2_defenders')`
  - `Capitano e Difensore separati` -> `t('fanta.constraint.captain_defender_separate')`

- scoring
  - `Canestro` -> `t('fanta.score.basket')`
  - `Soffio` -> `t('fanta.score.puff')`
  - `Vittoria` -> `t('fanta.score.victory')`
  - `Bonus finale` -> `t('fanta.score.final_bonus')`
  - `Bonus Scia` -> `t('fanta.score.streak_bonus')`

- placeholders / filters
  - `Cerca una squadra fantasy` -> `t('fanta.placeholder.search_team')`
  - `Cerca un giocatore fantasy` -> `t('fanta.placeholder.search_player')`
  - `Solo live` -> `t('fanta.filter.only_live')`
  - `Solo mia rosa` -> `t('fanta.filter.only_my_roster')`
  - `Focus sulla mia zona` -> `t('fanta.filter.focus_my_zone')`

## Integration note
The app fallback language is English and the default language is Italian.
If a non-Italian dictionary is missing a key, the UI can still fall back to Italian or English depending on availability.
So the migration must do both:
- add the keys
- replace hardcoded strings in components
