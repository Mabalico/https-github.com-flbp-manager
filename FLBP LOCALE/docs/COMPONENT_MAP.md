# FLBP Manager Suite — Component Map & Interazioni

**Fonte di verità:** codice nello ZIP aggiornato consegnato a fine step (root del progetto auditato in questa chat).  
**Data generazione:** 2026-03-25

Questo file mappa componenti/pagine e le interazioni principali (dipendenze, servizi, flussi). È una **prima versione**, da completare durante i test con dettagli su props, handler ed edge-case.

---

## 0) Packaging (PWA + Wrapper)

Queste configurazioni non cambiano componenti o flussi applicativi; aggiungono solo modalita' di distribuzione:

- PWA: `public/manifest.webmanifest` + `public/icons/*` + meta in `index.html`
- Wrapper mobile (Capacitor): `capacitor.config.json` + script `build:mobile` in `package.json` (vedi `docs/MOBILE_WRAPPER.md`)

---

## 1) Entry e orchestrazione

| Nodo | File | Ruolo | Interazioni principali |
|---|---|---|---|
| Entry | `index.tsx` | mount React | monta `App` |
| Orchestratore | `App.tsx` | gestisce view public, Admin, TV | legge/salva `AppState`, bootstrap repo, public DB snapshot, entra in TV |

### Public components montati da `App.tsx`
- `components/Home.tsx`
- `components/Leaderboard.tsx`
- `components/HallOfFame.tsx`
  - Ordine card/record Albo d'Oro: per data torneo discendente quando disponibile; fallback all'anno discendente.
  - Tabs: Vincitori, Capocannonieri, Difensori, MVP (i record U25 sono mostrati inline come `(U25)`).
  - Badge torneo nei box pubblici: data torneo completa quando disponibile (`startDate` da archivio / fallback da id storico; ultimo fallback = anno legacy).
  - Tab **Giocatori Titolati**: tabella aggregata per giocatore con colonne Totale/Campione/Cannoniere/Difensore/MVP e tie-break (Tot→Camp→Cann→Dif→MVP→Nome).
    - Titoli Under 25: **sempre visibili** come colonne dedicate `⚪(U25)` e `🌬️(U25)` (senza toggle) e usati solo come spareggio finale.
- `components/PublicTournaments.tsx`
  - Dialog turni: il tab **Next** mostra solo il prossimo blocco reale (non tutti i turni futuri).
- `components/PublicTournamentDetail.tsx`
  - Vista gironi: card per ogni girone con **classifica stile campionato** + elenco partite.
  - Usa `services/groupStandings.ts` e `components/GroupStandingsTable.tsx`.
- `components/HelpGuide.tsx`
- `components/RefereesArea.tsx` (Area Arbitri — Step R2 selezione + Step R3 codice + Step R4 referto)
  - auth protetta: password del torneo live (`tournament.refereesPassword`) + `sessionStorage` (`flbp_ref_authed` + `flbp_ref_authed_for=<tournament.id>`). Se non c’è live o password assente → area inaccessibile.
  - Step R2: selezione arbitro da giocatori live + aggiunta manuale (persistita in `tournament.refereesRoster`)
  - Step R3: pagina "Referto" → input codice → lookup match (per `match.code` in `state.tournamentMatches`) + scelta Manuale/OCR
  - Step R4:
    - lista match da refertare (scheduled/playing) con selezione rapida
      - esclusi BYE, TBD, match `hidden` e match incompleti (1 sola squadra / slot vuoto)
    - Manuale: input canestri/soffi per giocatore (score calcolato, no pareggi)
      - UX rapida: se un campo numerico contiene solo `0`, il focus seleziona il valore per sostituirlo subito
      - per match `isTieBreak=true`, al salvataggio aggiorna automaticamente `targetScore` al punteggio max finale (badge "a N" coerente)
    - OCR: preprocess + OCR → finestra conferma/correzione → apertura manuale con supporto (immagine + testo)
      - Suggerimenti OCR (numeri): quick-fill opzionale PT/SF (compila solo campi vuoti o 0).

### Lazy components montati da `App.tsx`
- Admin: `components/AdminDashboard.tsx`
- TV: `components/TvView.tsx`
  - instrada le modalità `groups`, `groups_bracket`, `bracket`, `scorers` senza pre-gating aggressivo; i fallback restano nei componenti TV/shell.
  - Gironi: `TvSimpleView.tsx` ruota le pagine ogni 15s e mostra standings + partite + banner spareggi.
  - Gironi + Tabellone: `TvBracketView.tsx` mostra card gironi paginabili a sinistra e bracket read-only a destra; i gironi finali vengono esclusi dal blocco "Gironi".
  - Marcatori: `TvScorersView.tsx` ruota pagine/metriche in sola lettura.

---


## 1.5) Servizi e helper condivisi

| Modulo | File | Ruolo | Usato da |
|---|---|---|---|
| Classifiche gironi | `services/groupStandings.ts` | calcolo standings “campionato” (Pt/ΔC/ΔS + metriche CF/CS/SF/SS) | Admin Monitor Gironi, Public Tournament Detail, TV (gironi) |
| Match utils | `services/matchUtils.ts` | partecipanti/score (1v1 e multi), label score | Admin/Public/TV (codici, monitor, referti, archivi, TV) |
| Simulazione | `services/simulationService.ts` | simulazione match, inclusi spareggi (`targetScore`) | Admin (tool simulazione), engine |

## 1.6) UI condivisa

| Componente | File | Ruolo | Usato da |
|---|---|---|---|
| Tabella standings | `components/GroupStandingsTable.tsx` | tabella classifica girone (anche compat TV) | Admin Monitor Gironi, Public Tournament Detail, TV |
| Tabellone | `components/TournamentBracket.tsx` | render tabellone (readOnly o editing); no-ties guardrail in editing | Admin, Public Tournament Detail, TV Bracket |

Note (props UI aggiunte, backward-compatible):
- `GroupStandingsTable`: `fitToWidth?: boolean` (scala/riduce per evitare scroll orizzontale quando attivato).
- `TournamentBracket`: `fitToWidth?: boolean`, `scale?: number` (zoom), `wrapTeamNames?: boolean` (no ellissi, wrap nomi), `onMatchClick?: (match) => void` (override click, es. apri referto nel monitor). Il fallback con `truncate` resta intenzionale quando `wrapTeamNames` è `false`.
- `TournamentEditorTab`: supporta ora la creazione di squadre nuove nel pool editor e l’azione **Aggiungi turno preliminare** quando il Round 1 è pieno e il bracket non è ancora partito. Durante il drag nel workspace prova anche l’auto-scroll del contenitore/pagina quando il cursore arriva vicino ai bordi del viewport.

---

## 2) Admin (gestionale)

### Shell
- `components/AdminDashboard.tsx`
  - Macro-sezioni: `adminSection = live | data | editor`
  - Header Admin: tabs sezione mantenuti su una singola riga con overflow orizzontale controllato; badge Supabase compattato e stato autosave mostrato una sola volta per evitare ridondanze UI.
  - Tabs Live: `TeamsTab`, `StructureTab`, `ReportsTab`, `RefereesTab`, `CodesTab`, `MonitorGroupsTab`, `MonitorBracketTab`
  - Tab Data: `DataTab`
  - Modals: `AliasModal`, `MvpModal`
  - Switch modalità app (header, alto a destra): badge **TESTER/UFFICIALE**
    - persiste override in localStorage: `flbp_app_mode_override` (vedi `config/appMode.ts`)
  - Controlli cache offline (header, alto a destra): **CACHE ON/OFF** + pulsante cestino
    - usa localStorage: `flbp_sw_disabled` (1 = disabilita registrazione SW)
    - azione cestino: unregister SW + clear caches + reload

### Tabs Live
| Tab | File | Dipendenze core | Tocca/produce |
|---|---|---|---|
| Teams | `components/admin/tabs/TeamsTab.tsx` | `lazyXlsx`, `adminCsvUtils`, `simPool`, `playerProfileAdmin`, `playerDataProvenance`, `teamImportProfile` (via `AdminDashboard`) | `TournamentData.teams`, referee flags, import/export teams, profilo import locale agganciato al primo XLSX valido, correzione inline profilo giocatore con merge/separate |
| Structure | `components/admin/tabs/StructureTab.tsx` | `tournamentEngine`, `formInputUX` | genera struttura per `round_robin`, `elimination`, `groups_elimination`; opzionale `config.finalRoundRobin` (attivazione a runtime); input numerici con sovrascrittura rapida dello `0` |
| Social Graphics (Admin) | `components/admin/SocialGraphicsPanel.tsx` | state + Canvas API | genera grafiche social 9:16 (preliminari/convocazioni), export PNG; persistenza config locale `flbp_social_graphics_v1`; conteggio/assegnazione squadre ora esclude solo BYE/TBD/hidden e non i referee flags; i conteggi usano le squadre visibili del draft/live corrente quando disponibile (fallback catalogo globale); convocazioni slot basate sui match reali ordinati per `orderIndex`; generatore automatico slot da primo orario + intervallo + squadre per turno con override manuale fine dei match per singolo slot; rigenerazione slot con confirm se esistono assegnazioni manuali; export PNG bloccato finché uno slot ha orario mancante/non valido o nessun match assegnato |
  - i preliminari vengono ora rilevati da qualsiasi turno bracket incompleto con BYE; se aggiungi una nuova tornata preliminare dopo l’arrivo di nuove squadre, la story preliminari si aggiorna separatamente e gli slot convocazioni standard continuano a escludere quei match preliminari.
  - ogni slot può passare da allocazione automatica (# partite) a selezione manuale esplicita dei match; i match scelti manualmente vengono tolti dal fallback automatico degli altri slot.
  - il pannello mostra ora un riepilogo compatto (squadre visibili, match convocabili/assegnati, preliminari, slot auto/manuali) e warning su slot senza orario, orari invalidi o slot vuoti prima dell’export.
| Reports | `components/admin/tabs/ReportsTab.tsx` | `imageProcessingService`, `simulationService`, `formInputUX` | aggiorna match score/stats, status (scheduled/playing/finished), OCR, simulazioni; campi statistici con `0` iniziale sovrascrivibile |
| Referees | `components/admin/tabs/RefereesTab.tsx` | state + config tavoli (`refTables` in AdminDashboard), `formInputUX` | turni arbitri + **stampa referti** (turno corrente/prossimo/turno selezionato → print browser); input numerici secondari con zero selezionabile al focus |
| Codes | `components/admin/tabs/CodesTab.tsx` | state | lista codici match, stati match |
| Monitor Groups | `components/admin/tabs/MonitorGroupsTab.tsx` | state | monitor gestionale gironi + pre-check integrità (squadre escluse) + modifica manuale (add/move/swap) con lock |
| Monitor Bracket | `components/admin/tabs/MonitorBracketTab.tsx` | state, `tournamentEngine` | monitor tabellone + pre-check integrità + modifica manuale (replace BYE / swap Round1 / rebuild elimination) |

### Tab Data
- `components/admin/tabs/DataTab.tsx`
  - sub-tab: `archive | integrations`
  - integrations sub-tab: `hof | scorers | aliases | players`
  - `components/admin/tabs/data/IntegrationsHof.tsx`
    - supporta sia il record manuale singolo sia il nuovo inserimento **torneo completo** (data + vincitori + fino a 2 MVP + capocannoniere + difensore + titoli U25) con generazione in blocco di record manuali modificabili singolarmente.
    - include anche un editor **torneo esistente** dentro Integrazioni: stessa struttura del bundle manuale, con campi sempre editabili per nome/data/MVP e lock automatico sui premi legati a partite già salvate; non reindirizza più alla gestione squadre.
    - i record manuali possono salvare anche `sourceTournamentDate` per ordinamento e badge data coerenti nell'Albo d'Oro pubblico.
  - `archive` UI: `components/admin/tabs/data/ArchiveSubTab.tsx`
    - wizard "Nuovo torneo archiviato" supporta: `round_robin`, `groups_elimination`, `elimination` e (solo tornei con tabellone) config `finalRoundRobin` (attivazione a runtime)
    - editing risultato (retroattivo): se `status=finished` richiede leader unico (no pareggi), blocca TBD, e aggiorna `targetScore` per `isTieBreak`

### Modals
- `components/admin/modals/AliasModal.tsx`
- `components/admin/modals/MvpModal.tsx`

---

## 3) TV Mode (read-only)

| View | File | Proiezione | Note |
|---|---|---|---|
| Orchestratore TV | `components/TvView.tsx` | `TvProjection` | normalizza i dati passati alle TV e instrada direttamente `groups`, `groups_bracket`, `bracket`, `scorers`; i fallback restano nei componenti TV/shell per evitare regressioni con snapshot pubblici parziali |
| Shell | `components/PublicTvShell.tsx` | - | layout full-screen + logo federazione (fallback `/flbp_logo_2025.svg` se `state.logo` vuoto/rotto); header TV con clamp controllato invece di ellissi aggressive; placeholder “attesa configurazione” riusato quando la TV non ha un torneo renderizzabile |
| Gironi | `components/TvSimpleView.tsx` | `groups` / `groups_bracket` | rotazione pagine gironi; se rileva un "Girone Finale" lo mostra come ultima pagina dedicata |
| Bracket | `components/TvBracketView.tsx` | `bracket` | tabellone 16:9; in modalita' split (G+Tab) la colonna "Gironi" esclude l'eventuale Girone Finale |
| Marcatori | `components/TvScorersView.tsx` | `scorers` | classifica canestri/soffi |

Vincoli: TV deve restare read-only, 16:9 safe, zero click, zero glitch.

---

## 4) Servizi (dove impattano)

| Service | File | Chi lo usa (principale) |
|---|---|---|
| Tipi | `types.ts` | tutto |
| AppState + business utils | `services/storageService.ts` | `App.tsx`, `AdminDashboard.tsx`, public UI |
| Engine torneo | `services/tournamentEngine.ts` | `StructureTab`, `AdminDashboard.tsx` |
| Simulazioni | `services/simulationService.ts` | `ReportsTab` |
| Pool test | `services/simPool.ts` | `TeamsTab` |
| OCR | `services/imageProcessingService.ts` | `ReportsTab` |
| Repo selector | `services/repository/getRepository.ts` | `App.tsx` |
| Local repo | `services/repository/LocalRepository.ts` | `App.tsx` |
| Remote repo | `services/repository/RemoteRepository.ts` | `App.tsx` |
| Supabase REST | `services/supabaseRest.ts` | `App.tsx`, Admin |
| Auto sync | `services/autoDbSync.ts` | `App.tsx` |
| Backup JSON | `services/backupJsonService.ts` | `AdminDashboard.tsx` |
| Provenienza profili | `services/playerDataProvenance.ts` | `TeamsTab`, `PlayersSubTab` |
| Identita' giocatori | `services/playerIdentity.ts` | servizi profili / Hall of Fame / storage |
| Hall of Fame admin | `services/hallOfFameAdmin.ts` | pannelli data/admin Hall of Fame |
| UX input numerici | `services/formInputUX.ts` | `StructureTab`, `ReportsTab`, `RefereesArea`, `RefereesTab`, `ArchiveSubTab`, `IntegrationsScorers`, `TournamentBracket` |

Note engine:
- In modalita' `groups_elimination` i placeholder `TBD` / `TBD-*` restano confinati al Round 1. Se per stati legacy un TBD e' gia' finito oltre Round 1, `syncBracketFromGroups()` lo sanifica (non avanzera').
- In modalita' `elimination` e `groups_elimination`, se il numero partecipanti al tabellone non e' una potenza di 2, il Round 1 include **rami preliminari** posizionati in fondo al tabellone (ordine inverso) e match BYE auto-advance (quando la squadra e' nota).
- Girone Finale (all'italiana) opzionale:
  - Config in `TournamentConfig.finalRoundRobin`.
  - `services/tournamentEngine.ts::getFinalRoundRobinActivationStatus()` calcola se si puo' attivare.
  - `services/tournamentEngine.ts::activateFinalRoundRobinStage()` crea un gruppo `stage:'final'` + match `F1...`.
  - `services/tournamentEngine.ts::ensureFinalTieBreakIfNeeded()` crea `FTB*` quando il titolo e' bloccato da parita' assoluta nel Girone Finale.
  - `syncBracketFromGroups()` esclude sempre il gruppo finale dai calcoli avanzamento.

---

## 5) “Se tocchi X, cosa impatti” (quick risk map)

- Tocchi `types.ts` → impatti UI public/admin/tv, engine, repo.
- Tocchi `storageService.ts` → impatti coerenza dati, archivia, U25, alias, leaderboard.
- Tocchi `tournamentEngine.ts` → impatti gironi, bracket, BYE.
- Tocchi `Tv*View.tsx` → impatti TV mode (vincoli operativi).
- Tocchi `ReportsTab.tsx` / OCR → impatti workflow live dei referti.
- Tocchi `backupJsonService.ts` → impatti restore/merge backup in Admin.
- Tocchi `playerProfileAdmin.ts` / `playerDataProvenance.ts` / `playerIdentity.ts` → impatti merge/separate identità, propagazione nomi live/storico e compatibilita' backup legacy con YoB.

---

## 6) TODO per completare la mappa (prossimi step)

- Aggiungere per ogni tab/component:
  - props rilevanti e tipi
  - funzioni/handler che cambiano lo state
  - dipendenze upstream/downstream (chi lo monta e chi monta)
- Annotare esplicitamente dove viene modificato `Match.status` e `Match.played`.

## Helpers condivisi

- `services/groupStandings.ts`: calcolo classifiche gironi (Pt, CF/CS/ΔC, SF/SS/ΔS).
- `services/matchUtils.ts`: utilità per partecipanti match (1v1 e multi-team) e formattazione score/label.

## Indicatori UI

- Badge match: **SPAREGGIO**, **MULTI**, `a N`.
- Banner blocco qualifica: presente in Admin Monitor, Public e TV quando esistono spareggi gironi aperti.


### TV verification rapida
- Script SSR dedicato: `_ssr_tv_check.tsx` (eseguito via `npm run check:ssr-tv`). Copre shell vuota, dataset TV popolato, snapshot pubblico sanitizzato e `docs/sample_backup.json`.
- Guardrail read-only: `npm run check:tv-readonly` controlla staticamente che la superficie TV non introduca click, link, tab focus o affordance interattive.
- Copre shell vuota + scenario popolato con `groups`, `groups_bracket`, `bracket`, `scorers`.
- Controlli minimi: render server-side, contenuti attesi in split view, assenza token `BYE` nelle viste non-bracket.


## Addendum 2026-03-25 — Handoff Codex Social / Integrazioni / Import

Per riprendere in Codex i flussi Admin toccati negli step recenti, consulta anche `docs/CODEX_UI_HANDOFF_SOCIAL_DATA_IMPORT.md`.

Punti stabili nel repository:
- `components/admin/SocialGraphicsPanel.tsx`: match reali, generatori slot, dispari, preliminari separati, picker manuale match, pruning assegnazioni stale.
- `components/admin/tabs/data/IntegrationsHof.tsx`: bundle torneo completo + editor torneo in Integrazioni con lock e stato dirty.
- `components/AdminDashboard.tsx` + `services/teamImportProfile.ts`: profilo del primo XLSX, scelta foglio migliore nei workbook multi-sheet, mismatch più leggibili.
- `services/storageService.ts`: le squadre arbitri restano squadre reali per standings/awards; escludere solo BYE/hidden.

- `components/admin/SocialGraphicsPanel.tsx` — export guard più leggibile: dettaglio del blocco sulla grafica selezionata e preview dei match fuori slot.
- `components/AdminDashboard.tsx` — helper import multi-sheet che elenca solo i fogli alternativi davvero controllati.
