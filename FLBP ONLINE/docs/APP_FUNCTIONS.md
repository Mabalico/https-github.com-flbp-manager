# FLBP Manager Suite — Funzioni dell’app

**Fonte di verità:** codice attuale del repository locale.  
**Data generazione:** 2026-03-19

Questo file descrive **cosa fa l’app e come lavora**, collegando ogni macro-funzione a file reali.

## Aggiornamento 2026-03-30

- In Area Admin → Squadre l'inserimento manuale dei giocatori ora usa campi separati `Nome` / `Cognome`, ma continua a salvare internamente l'identita' canonica `Cognome Nome` per non rompere storico, classifiche e alias.
- I template import/export che prima usavano un solo campo nome ora esportano `Nome` / `Cognome` separati e restano retrocompatibili in lettura con i file storici.
- In `player_area` la registrazione preview continua a usare `email + password`, ma se l'utente compila gia' `Nome`, `Cognome` e `Data di nascita` questi dati vengono salvati subito nel profilo collegato.

## Aggiornamento 2026-04-02

- `player_area` web e' stata riallineata al rollout live additivo: quando il backend player e' disponibile usa sessione Supabase, profilo reale, registrazione device web e call alerts reali; se il rollout SQL non e' ancora applicato, resta compatibile con la preview locale.
- `Gestione dati -> Account giocatori` prova ora a leggere il catalogo live via `flbp_admin_list_player_accounts(...)` e a modificare il profilo collegato su `player_app_profiles`, con fallback prudente quando il backend non e' ancora disponibile.
- `ReportsTab` prova ora a usare i target/call reali (`player_app_profiles`, `player_app_calls`, `flbp_player_call_team`, `flbp_player_cancel_call`) e torna alla preview locale solo se il backend additivo non e' ancora presente.
- `RefereesArea` al login puo' riallineare lo snapshot live leggendo `flbp_referee_pull_live_state(...)` quando la RPC additiva e' disponibile.

## Aggiornamento 2026-04-02b

- Le migration additive `referees/player/accounts` sono state applicate manualmente sul progetto Supabase reale via `SQL Editor`.
- Da questo momento `flbp_referee_pull_live_state(...)`, `player_app_profiles`, `player_app_devices`, `player_app_calls` e `flbp_admin_list_player_accounts(...)` esistono sul backend reale.
- Restano comunque da attivare/configurare fuori dal codice:
  - provider auth live (`email/password`, `google`, `facebook`, `apple`)
  - mittente email amministratore reale / SMTP
  - push device reali per le convocazioni squadra

## Aggiornamento 2026-04-03

- In `Editor Torneo -> Bracket` le modifiche strutturali non sono piu' limitate al solo Round 1: ora e' possibile intervenire anche sui branch futuri incompleti e sui round successivi non realmente giocati.
- I match `team vs BYE` continuano a contare come assegnazioni valide nella struttura, ma non bloccano l'editing come se fossero partite giocate.
- Restano bloccati solo i match bracket davvero giocati o in corso; i controlli di integrita' continuano a impedire squadre escluse dalla struttura e duplicati nel punto di ingresso del bracket.
- L'editor bracket web include ora anche il toggle `Schermo intero` per lavorare meglio sul tabellone in editing.
- La schermata `player_area` non autenticata e' stata riallineata a un funnel piu' chiaro: social login visuale in alto, separatore `oppure`, ingresso email in evidenza e form email/password subito sotto.
- Ripulita la formattazione corrotta del dizionario italiano (`Modalità`, frecce, ellissi, apostrofi e caratteri accentati) nei testi UI che mostravano mojibake.

## Aggiornamento 2026-04-23

- `player_area` ora segnala in modo persistente anche agli account gia' loggati le possibili corrispondenze con giocatori storici, usando la stessa logica alias gia' impiegata in registrazione.
- Il prompt alias lato account supporta selezione multipla: l'utente puo' inviare una o piu' segnalazioni di merge agli admin oppure marcare le corrispondenze come `non sono io`, senza dover ripetere la stessa risposta a ogni accesso.
- `Gestione dati -> Account giocatori` include ora il filtro `Segnalazioni`, che raccoglie le richieste di merge inviate dagli utenti, oltre a una vista separata delle corrispondenze storiche automatiche rilevate dal sistema alias.
- Le nuove stringhe UI per alias/segnalazioni sono state riallineate in tutte le lingue supportate, sia in `FLBP ONLINE` sia in `FLBP LOCALE`.

---

## Modalità applicazione (Tester vs Ufficiale)

L’app supporta due modalità, configurabili tramite:
- **build time** (variabile d’ambiente Vite)
- **runtime** (override locale in Area Admin, solo in ambienti tecnici non bloccati)

- **Ufficiale** (`VITE_APP_MODE=official`): profilo usato per il deploy pubblico; nasconde dalla UI gli strumenti di test e mantiene i flussi operativi reali.
- **Tester** (`VITE_APP_MODE=tester`): abilita strumenti di test (simulazioni, sim-pool) per sviluppo/verifiche.

### Cosa cambia in modalità Ufficiale

Gli strumenti seguenti vengono **nascosti**:

- In Area Admin → Squadre: box **“Simulatore Pool (test)”**
- In Area Admin → Monitor Tabellone: pulsanti **“Simula turno”** / **“Simula tutto”**
- In Area Admin → Squadre: azioni di download/upload non essenziali (Export Excel, Export PDF, Backup JSON, Ripristina JSON)
- In Area Admin → Struttura: **Export PDF Tabellone**
- In Area Admin → Gestione Dati → Integrazioni: pannello avanzato di sync/diagnostica DB (DbSyncPanel)
- In Area Admin → Gestione Dati → Marcatori: download template / export CSV

> Nota: la logica interna resta nel codice (per non creare regressioni), ma non è accessibile dalla UI in modalità Ufficiale.

### Come attivare la modalità

Esempi:

- Dev / tester:
  - `VITE_APP_MODE=tester npm run dev`
- Build ufficiale / deploy pubblico:
  - `VITE_APP_MODE=official npm run build`

### Switch rapido (runtime) in Area Admin

- In `components/AdminDashboard.tsx` (header, in alto a destra) in ambienti tecnici può comparire un badge **TESTER/UFFICIALE** cliccabile.
- Al click salva un override in localStorage (`flbp_app_mode_override`) e fa `window.location.reload()`.
- `config/appMode.ts` applica la precedence: **override runtime** → `VITE_APP_MODE`. Nella build pubblica patchata l'override runtime viene ignorato e la modalità resta `official`.

---

## Installazione su smartphone (PWA)

L'app include una PWA con **service worker conservativo** (R8):

- HTML/navigazioni: **network-first** (quando sei online non resta incollata una versione vecchia)
- Asset build (`/assets/*`, icone, manifest): **stale-while-revalidate** (caricamento piu' rapido)

Per tornei live e' comunque possibile disabilitare rapidamente la registrazione SW impostando `localStorage flbp_sw_disabled=1`.

Hardening TV (R8.1):
- Se `localStorage flbp_tv_mode` e' attivo (TV Mode), l'app **non registra** il service worker.
- Quando si entra in TV Mode, l'app tenta in best-effort di **unregister SW** e **svuotare le cache** per ridurre il rischio di "build vecchie".
- In Area Admin (header) sono presenti i pulsanti **CACHE ON/OFF** e **svuota cache** (cestino) per forzare un reload pulito.

Mobile polish:
- `index.html` usa `viewport-fit=cover` e meta iOS per modalità installata.
- `styles.css` applica padding automatico sulle safe-area (notch) tramite `env(safe-area-inset-*)`.

File principali:
- Manifest: `public/manifest.webmanifest`
- Icone: `public/icons/*`
- Link/meta: `index.html`

## Packaging self-contained (no CDN runtime)

Per rendere l'app più stabile e “wrappabile” in futuro (es. Capacitor), le dipendenze runtime critiche non vengono caricate da CDN:

- **Tailwind**: build-time via PostCSS + file `styles.css` importato in `index.tsx`
- **React/Lucide/XLSX**: risolte dal bundler Vite (niente importmap)
- **OCR**: `tesseract.js` resta lazy-loaded via `import('tesseract.js')` in `services/imageProcessingService.ts`

Nota: i font restano caricati via Google Fonts in `index.html` (non impattano la logica applicativa).

## Wrapper-ready (Capacitor)

Per preparare il passaggio futuro a "app" mobile (Android/iOS) senza cambiare la web app, e' stato aggiunto un setup minimale per Capacitor:

- Config: `capacitor.config.json` (appId/appName/webDir)
- Build dedicata wrapper: `npm run build:mobile` (equivalente a `vite build --base=./`)
- Script helper:
  - `npm run cap:add:android`, `npm run cap:sync:android`, `npm run cap:open:android`
  - `npm run cap:add:ios`, `npm run cap:sync:ios`, `npm run cap:open:ios`
  - Setup "one-command" (R7-bis): vedi `scripts/capacitor-generate-android.ps1` / `scripts/capacitor-generate-android.sh` / `scripts/capacitor-generate-ios.sh`

Istruzioni operative complete: `docs/MOBILE_WRAPPER.md`.

## 1) Entry e navigazione

- Entry: `index.tsx` → `App.tsx`
- Navigazione principale in `App.tsx` tramite una view string salvata in localStorage:
  - `home | leaderboard | hof | tournament | tournament_detail | admin | referees_area`

Componenti public montati da `App.tsx`:
- Home: `components/Home.tsx`
- Classifica storica: `components/Leaderboard.tsx`
- Albo d’oro: `components/HallOfFame.tsx`
- Tornei (lista): `components/PublicTournaments.tsx`
- Tornei (dettaglio): `components/PublicTournamentDetail.tsx`
  - Vista gironi: mostra **classifiche stile campionato** (P/V/S, CF/CS/ΔC, SF/SS/ΔS). Nota: i **punti (Pt)** vengono calcolati per la classifica ma **non sono mostrati** in tabella.
  - Calcolo classifica condiviso: `services/groupStandings.ts`
  - UI tabella: `components/GroupStandingsTable.tsx`
  - Layout pubblico: gironi e tabellone supportano rendering **fit-to-width** (senza scroll orizzontale) quando abilitato da `PublicTournamentDetail.tsx`.
- Guida: `components/HelpGuide.tsx`
- Area Arbitri: `components/RefereesArea.tsx`

Fonte dati pubblica attuale:
- Le viste public/TV usano come base coerente `public_workspace_state` (snapshot pubblico sanificato).
- Le tabelle pubbliche normalizzate (`public_tournaments`, `public_hall_of_fame_entries`, `public_career_leaderboard`) restano utili per export/query e supporto, ma non sono più la fonte primaria della UI pubblica live.
- Obiettivo: evitare disallineamenti temporanei in cui alcune viste leggevano lo snapshot admin/public e altre una cache o tabella pubblica aggiornata in tempi diversi.
  - accesso **protetto**: richiede la password del **torneo live** (`tournament.refereesPassword`) e salva una sessione in `sessionStorage` (`flbp_ref_authed` + `flbp_ref_authed_for=<tournament.id>`). Se **non c’è live attivo** o la password non è configurata, l’area resta inaccessibile.
  - La password viene richiesta quando si avvia il live (Admin → Struttura → “Conferma e Avvia Live”).
  - Step R2: selezione arbitro da giocatori del torneo live + aggiunta manuale
    - la lista manuale viene persistita in `tournament.refereesRoster` (solo torneo live)
  - Step R3: pagina "Referto" → inserimento **codice referto** e ricerca match in `state.tournamentMatches` per `match.code`
    - Gestione codici duplicati: se più match condividono lo stesso `code` (possibile dopo modifiche manuali/rigenerazioni), l’UI mostra una **lista di candidati** e richiede una scelta esplicita (evita referti sul match sbagliato).
    - blocchi hard: BYE (`teamId===BYE`), TBD (placeholder `TBD` / `TBD-*`), match `hidden` e match **incompleti** (slot vuoto / 1 sola squadra)
  - Step R4: caricamento referto
    - **Lista match da refertare** (scheduled/playing) con selezione rapida del codice
    - **Manuale**: inserimento canestri/soffi per giocatore (score calcolato automaticamente)
      - no pareggi: viene bloccato il salvataggio se non c’è un vincitore unico
      - supporta spareggi multi-squadra (AvsBvsC...) usando `teamIds` + `scoresByTeam`
    - **OCR**: carica foto → preprocess + OCR (`services/imageProcessingService.ts`)
      - apre una finestra di **conferma/correzione** (codice + score di supporto + testo OCR)
      - dopo conferma: apre l’inserimento manuale con "supporto OCR" (immagine + testo)
      - Suggerimenti OCR (numeri): se il testo OCR contiene marker **PT/SF**, l’UI può proporre un quick-fill **non distruttivo** (compila solo campi vuoti o 0).
    - Salvataggio referto:
      - aggiorna `match.stats` e `scoreA/scoreB` (e `scoresByTeam` per multi-team)
      - se `groups_elimination`: `services/tournamentEngine.ts::syncBracketFromGroups()` + auto-risoluzione BYE
      - se match `bracket`: propagazione vincitore alla partita successiva (auto-advance BYE)
    - RPC arbitri attuali:
      - `services/supabaseRest.ts::verifyRefereePassword()` → `public.flbp_referee_auth_check(...)`
      - `services/supabaseRest.ts::pushRefereeLiveState()` → `public.flbp_referee_push_live_state(...)`
    - Preparazione nativa additiva nel repository:
      - `services/supabaseRest.ts::pullRefereeLiveState()` → `public.flbp_referee_pull_live_state(...)`
      - pensata per un futuro client nativo che debba leggere lo snapshot live completo in modo protetto
      - e' ora disponibile sul progetto Supabase reale dopo il rollout manuale del `2026-04-02`
    - Preparazione additiva player/call nel repository:
      - `services/playerAppService.ts` → preview locale per account giocatore, profilo, risultati, stato live e alert di convocazione
      - `services/supabaseRest.ts::pullPlayerAppProfile()` / `pushPlayerAppProfile()` / `registerPlayerAppDevice()`
      - `services/supabaseRest.ts::pullPlayerAppCalls()` / `callPlayerAppTeam()` / `acknowledgePlayerAppCall()` / `cancelPlayerAppCall()`
      - il wiring web e' gia' chiuso in `components/PlayerArea.tsx`, `components/admin/tabs/ReportsTab.tsx` e `components/admin/tabs/data/AccountsSubTab.tsx`
      - le migration additive player/accounts sono ora applicate sul progetto Supabase reale
      - il fallback preview locale resta solo come compatibilita' prudente finche' non completiamo provider auth, SMTP e push


Lazy-load in `App.tsx`:
- Admin: `components/AdminDashboard.tsx`
- TV: `components/TvView.tsx`

---

## 2) Modello dati (types)

Definito in `types.ts`.

### Team
- Campi base: `id`, `name`, `player1`, `player2?`
- YoB (anno nascita): `player1YoB?`, `player2YoB?` **solo per compatibilita' legacy** nei backup/snapshot storici; il dato preferito resta `birthDate` quando disponibile.
- Arbitro per giocatore: `player1IsReferee?`, `player2IsReferee?`
- Flag compat: `isReferee?`

### Match
- Stato: `status: scheduled|playing|finished` e `played: boolean`
- Punteggi: `scoreA`, `scoreB`
- Stats per-player: `stats?: MatchStats[]` (canestri/soffi)
- Meta: `phase? (groups|bracket)`, `code?`, `groupName?`, `roundName?`
- BYE: `isBye?: boolean` e `hidden?: boolean`
- Safety: i placeholder `TBD` / `TBD-*` **non vengono mai propagati oltre il Round 1** (nessun avanzamento automatico su BYE vs TBD)
- Spareggi gironi (tie-break): `isTieBreak?: boolean` + `targetScore?: number` (es. 1 per "race-to-1")
  - Multi-squadra (AvsBvsC...): `teamIds?: string[]` + `scoresByTeam?: Record<string, number>`
    - `teamAId/teamBId` restano per i match 1v1 (bracket e gironi standard)

### TournamentData
- Tipo: `elimination | groups_elimination | round_robin`
- Struttura: `groups?: Group[]`, `rounds?: Match[][]`, `matches?: Match[]`
- Config: `config.advancingPerGroup`
  - `round_robin`: puo' essere **0** (nessun concetto di "qualificati")
  - Opzionale: `config.finalRoundRobin` (Girone Finale all'italiana attivabile a runtime)
- Archivio manuale: `isManual?: boolean`

### Albo d’oro / Integrazioni marcatori
- `HallOfFameEntry` (titoli: winner/mvp/top_scorer/defender + U25)
- In `components/HallOfFame.tsx` tab **Giocatori Titolati**: aggrega titoli per giocatore e mostra colonne Totale/Campione/Cannoniere/Difensore/MVP.
  - Sorting: Totale → Campione(winner) → Cannoniere(top_scorer) → Difensore(defender) → MVP(mvp) → nome.
  - Titoli U25: **sempre visibili** come colonne dedicate `⚪(U25)` e `🌬️(U25)` (senza toggle). Nello sorting contano **solo come ultimo tie-break** (valgono meno di tutti gli altri titoli).
  - Badge torneo nei box pubblici: mostra la **data completa del torneo** quando disponibile (`startDate` da archivio / fallback da id storico); se il dato legacy manca del tutto, resta il fallback all'anno.
- `IntegrationScorerEntry` (marcatori inseriti manualmente/fuori archivio)
- `PlayerStats` (aggregazioni per classifiche)

---

## 3) State e persistenza (local/remote)

### AppState e funzioni core
- `services/storageService.ts`
  - definisce `AppState`
  - coercion: `coerceAppState(...)`
  - funzioni business usate dall’Admin (importate in `components/AdminDashboard.tsx`):
    - `archiveTournamentV2`, `setTournamentMvps`
    - `getPlayerKey`, `resolvePlayerKey`, `getPlayerKeyLabel`
    - `isU25`

### Repository
- `services/repository/getRepository.ts` → `getAppStateRepository()` (usato in `App.tsx`)
- Implementazioni:
  - Local: `services/repository/LocalRepository.ts`
  - Remote/DB: `services/repository/RemoteRepository.ts` + `services/supabaseRest.ts`

Sync/diagnostica:
- `services/autoDbSync.ts`
- `services/dbDiagnostics.ts`
- Feature flags: `services/repository/featureFlags.ts`
- `RemoteRepository` mantiene una bozza locale pending e tenta il flush remoto solo quando è disponibile una sessione admin Supabase; in caso di errore/conflitto non perde le modifiche locali
- le write admin dello snapshot completo non fanno più solo un preflight client: passano da `public.flbp_admin_push_workspace_state(...)`, che aggiorna `workspace_state` e `public_workspace_state` in modo atomico e blocca i conflitti salvo forzatura esplicita
- Helper identità giocatore condivisi: `services/playerIdentity.ts` (`pickPlayerIdentityValue` per il modello corrente, `pickStoredPlayerIdentityValue` come fallback compatibile sui dati legacy con YoB)
- Backup JSON: `services/backupJsonService.ts` (`parseBackupJsonState`, `mergeBackupJsonState`, `inspectBackupJsonState`)
- Provenienza profili: `services/playerDataProvenance.ts` (`buildPlayerProfileSnapshot`)
- Hall of Fame admin: `services/hallOfFameAdmin.ts` (riassegnazione record con priorita' a `birthDate` e fallback legacy `nextPlayerYoB` solo se il dato storico non e' ancora migrato)
- UX input numerici: `services/formInputUX.ts`

Note robuste emerse dalle ultime correzioni:
- `coerceAppState()` riallinea `tournament.matches` e `tournamentMatches` quando uno snapshot arriva incompleto o incoerente
- `autoDbSync` usa un fingerprint contenutistico, non solo conteggi, quindi cambi reali a match/stats/Hall of Fame attivano correttamente il sync strutturato
- `supabaseRest` usa il roster del torneo live per aggregazioni pubbliche live (evita statistiche sbagliate quando `state.teams` non coincide con `tournament.teams`)
- `supabaseRest` espone anche `pullRefereeLiveState()` come wrapper per la RPC additiva `flbp_referee_pull_live_state(...)`; il wrapper normalizza lo snapshot con `coerceAppState()` e aggiorna `REMOTE_BASE_UPDATED_AT_LS_KEY`
- `playerAppService` prepara `player_area` con preview locale e semantica di convocazione squadra come alert push/live, non telefonata OS reale
- `supabaseRest` espone anche il pacchetto wrapper `player_app_*` / `flbp_player_*` per il rollout live di profili player, device token e chiamate squadra; le tabelle/RPC sono ora presenti sul progetto Supabase reale, ma la piena esperienza live dipende ancora da auth provider, SMTP e push

---

## 4) Area Admin (gestione)

Entry: `components/AdminDashboard.tsx`.

Accesso:
- ingresso Admin tramite sessione Supabase Auth reale
- il login controlla anche che l’account autenticato sia presente in `public.admin_users`
- login/sessione e autorizzazione restano separati: snapshot/export/autosave remoto usano la sessione del device ma l’ultima parola resta a `public.admin_users` / `flbp_is_admin()`

Note consistenza dati (live):
- Gli aggiornamenti match live mantengono allineati `state.tournamentMatches` e `state.tournament.matches` (evita disallineamenti tra viste che leggono una o l'altra collezione).
- Questo vale sia in `components/AdminDashboard.tsx` sia in `components/RefereesArea.tsx`.
- Restore/Merge backup JSON: prima della conferma finale l'Admin esegue un **preflight compatibilità** (`inspectBackupJsonState`) con summary conteggi, warning schema/versione, blocco dei file non riconoscibili come backup FLBP e **conteggio esplicito dei blocchi che contengono ancora YoB legacy** (squadre live, torneo live, storico, integrazioni marcatori).
- Export backup JSON: `buildBackupJsonExportState()` genera backup più moderni prima del download, rimuovendo `player1YoB` / `player2YoB` / `yob` solo quando il relativo record ha già una `birthDate` completa; se il dato storico ha ancora solo YoB, il campo legacy viene mantenuto.
- Audit backup inclusi nel repository: `npm run audit:backup-profiles` analizza i JSON backup-like versionati (`docs/sample_backup.json`, import/restore in `.codex-tmp`) e rigenera `docs/BACKUP_PROFILE_AUDIT.md`, distinguendo i file **modern** da quelli **legacy-compatible**. Nell'attuale ZIP i file censiti risultano tutti **modern**.
- Compatibilita' identita' giocatori nei dati salvati: i servizi che leggono snapshot/archivio (`playerDataProvenance`, `hallOfFameAdmin`) preferiscono sempre la `birthDate` completa ma mantengono un fallback **YoB-only** solo per record legacy/importati, evitando mismatch nei titoli Hall of Fame e nelle riassegnazioni manuali.

### 4.1 Macro-sezioni
In `components/AdminDashboard.tsx`:
- `adminSection: live | data`

### 4.2 Tabs Live
- `components/admin/tabs/TeamsTab.tsx`
  - inserimento squadre, import, simulatore pool
  - lista iscritti: correzione inline profilo giocatore (nome + data nascita) con salvataggio via `services/playerProfileAdmin.ts::updatePlayerProfileIdentity()`
  - pre-save UX: impatto stimato su iscritti live / torneo live / storico / righe statistiche / titoli / alias, con messaggi espliciti per **merge** o **separate**
  - CSV: `services/adminCsvUtils.ts`
  - XLSX lazy: `services/lazyXlsx.ts`
  - Sim pool: `services/simPool.ts` + `services/simTeamNames200.ts`
- `components/admin/tabs/StructureTab.tsx`
  - engine: `services/tournamentEngine.ts` (`generateTournamentStructure`, `syncBracketFromGroups`)
  - UX input numerici: quando un campo contiene solo `0`, il focus seleziona il valore per sovrascrittura immediata (niente delete/backspace preliminare)
  - Grafiche social (story 9:16): pannello `components/admin/SocialGraphicsPanel.tsx`
    - configurazione slot orari (convocazioni + # partite) con generatore automatico da primo orario + intervallo + squadre per turno
    - override manuale fine per slot: apertura pannello match e scelta esplicita dei match da mostrare in ciascuna fascia oraria; i match selezionati manualmente non vengono duplicati in altri slot manuali
    - riepilogo compatto con squadre visibili nel torneo corrente, match convocabili/assegnati, preliminari e slot auto/manuali + warning su slot senza orario, orari invalidi e slot vuoti
    - i conteggi del pannello usano le squadre visibili del draft/live corrente quando disponibile, non il catalogo globale squadre
    - preliminari: ricavati da qualsiasi turno bracket incompleto con BYE (match real-vs-real), così l’aggiunta successiva di nuove squadre/preliminari aggiorna la story dedicata senza mescolare quei match negli slot normali
    - export PNG via Canvas API (senza dipendenze) + salvataggio config in localStorage (`flbp_social_graphics_v1`)
- `components/admin/tabs/ReportsTab.tsx`
  - OCR: `services/imageProcessingService.ts` (`preprocessRefertoToAlignedCanvas`, `ocrTextFromAlignedCanvas`) + dip. `tesseract.js`
  - simulazione: `services/simulationService.ts` (`simulateMatchResult`)
  - UX input numerici: campi statistici manuali con `0` iniziale selezionabile/sovrascrivibile al primo click
- `components/admin/tabs/RefereesTab.tsx`
  - Stampa referti (browser → "Salva come PDF"):
    - turno corrente e prossimo turno
    - stampa turno selezionabile (include anche turni passati)
    - i referti sono precompilati con squadre e giocatori; restano vuoti solo i campi da compilare a mano
  - UX input numerici secondari (es. tavoli): `0` iniziale selezionato al focus per compilazione rapida
- `components/admin/tabs/CodesTab.tsx`
- `components/admin/tabs/MonitorGroupsTab.tsx`
  - monitor gironi live: filtro "tutti / singolo girone" + classifica stile campionato (P/V/S, canestri fatti/subiti/diff, soffi fatti/subiti/diff; Pt calcolati ma non mostrati)
  - calcolo classifica: `services/groupStandings.ts`
  - pre-check “integrità torneo”: segnala **squadre escluse** (nel roster ma non in match/gironi)
  - modifica manuale gironi (guard-rail: solo se gironi non iniziati e non conclusi):
    - aggiungi squadra esclusa al girone + genera match mancanti
    - sposta squadra tra gironi
    - scambia squadre tra due gironi
- `components/admin/tabs/MonitorBracketTab.tsx`
  - Pre-check integrità: tabellone bloccato (match già iniziati) + segnalazione "squadre escluse"
  - Modifica manuale tabellone (solo se non lockato):
    - Replace BYE con squadra (Round 1)
    - Swap posizioni (Round 1)
    - Rigenera tabellone (nuovi preliminari) per `elimination` (solo se non iniziato)

Supporto UI:
- `components/TournamentBracket.tsx`

### 4.3 Tab Data (gestione dati/retroattivo)
- `components/admin/tabs/DataTab.tsx`
  - macro-sezioni: `integrations | views | traffic | persistence`
  - la card `Traffico Supabase` apre `components/admin/tabs/data/TrafficSubTab.tsx`
    - mostra una **stima del traffico FLBP verso Supabase**, aggregata per giorno/mese/anno
    - espone totale byte, richieste, traffico in ingresso/uscita e breakdown per `public | tv | admin | referee | sync`
    - i dati arrivano da `public.app_supabase_usage_daily` tramite batching client-side nel wrapper fetch (`services/devRequestPerf.ts`)
    - non sostituisce il billing ufficiale Supabase: è una telemetria applicativa coerente col traffico generato dal frontend
  - sub-tab data legacy: `archive | integrations` (stato in `AdminDashboard.tsx`)
  - sub-tab integrations: `hof | scorers | aliases`
- Modals:
  - Alias: `components/admin/modals/AliasModal.tsx`
  - MVP: `components/admin/modals/MvpModal.tsx`

---

## 5) TV Mode (read-only)

- Entry: `components/TvView.tsx` (lazy in `App.tsx`)
- Shell: `components/PublicTvShell.tsx`
  - Logo federazione: se `state.logo` è vuoto o l'URL non è valido, usa fallback `public/flbp_logo_2025.svg` (path runtime: `/flbp_logo_2025.svg`).
- Proiezioni: `TvProjection` in `types.ts`:
  - `groups | groups_bracket | bracket | scorers`
- Views:
  - `components/TvSimpleView.tsx`
  - `components/TvBracketView.tsx`
  - `components/TvScorersView.tsx`

Note TV gironi:
- In `TvSimpleView` e `TvBracketView` la sezione Gironi mostra una **classifica stile campionato** (layout compatto 16:9) tramite `components/GroupStandingsTable.tsx`.
- In `components/TvSimpleView.tsx` i gruppi vengono separati in **gironi di stage** e (se presente) **Girone Finale**:
  - rilevazione Girone Finale: `group.stage === 'final'` (se presente nei dati) oppure fallback `group.name` contiene "final"
  - il Girone Finale viene mostrato in **pagina dedicata** (full-width) come ultima pagina in rotazione.
  - banner separati: spareggi gironi (qualifica bloccata) vs spareggi finali (titolo bloccato).

Nota TV G+Tab:
- In `components/TvBracketView.tsx` (modalita' `groups_bracket`) la colonna "Gironi" mostra solo i **gironi di stage** (esclude l'eventuale Girone Finale) e il banner "Qualifica bloccata da spareggio" esclude gli spareggi del Girone Finale.

---

## 6) Vincoli critici da non rompere

### BYE
- Nel modello `Match` (`types.ts`) esistono `isBye` e `hidden`.
- La logica BYE impatta almeno:
  - generazione struttura (`services/tournamentEngine.ts`)
  - liste/monitor/codici (UI)
  - referti (non devono essere richiesti per BYE)

Note tabellone (eliminazione diretta e gironi+eliminazione):
- Se il numero partecipanti al tabellone non e' una potenza di 2, vengono creati **rami preliminari** (alcune squadre giocano 1 partita in piu').
- I rami preliminari sono posizionati **in fondo al tabellone** e vengono aggiunti "dal basso" (ordine inverso).
- I match con BYE sono `hidden` e vengono risolti in auto-advance (quando la squadra e' nota). Non esistono coppie BYE vs BYE in Round 1 (nessun BYE sprecato).

### TV mode
- Read-only
- 16:9 safe
- Zero click
- Zero glitch/overflow

---

## 7) File da leggere per primi (ordine consigliato)
1. `types.ts`
2. `services/storageService.ts`
3. `services/playerIdentity.ts`
4. `services/tournamentEngine.ts`
5. `services/simulationService.ts`
6. `components/AdminDashboard.tsx`
7. `components/TvView.tsx`

## Aggiornamenti recenti (Step 64)

Questa sezione riassume i cambi principali introdotti per la gestione **gironi**, **classifiche** e **spareggi**.

- **Classifiche gironi stile campionato** (Admin / Public / TV):
  - Colonne: **P** (partite), **V** (vinte), **S** (perse), **Pt** (punti = 1 per vittoria), **CF/CS/ΔC** (canestri fatti/subiti/differenza), **SF/SS/ΔS** (soffi fatti/subiti/differenza).
  - Calcolo unificato: `services/groupStandings.ts`
  - UI tabella: `components/GroupStandingsTable.tsx`
  - Layout pubblico: gironi e tabellone supportano rendering **fit-to-width** (senza scroll orizzontale) quando abilitato da `PublicTournamentDetail.tsx`.
- **Monitor Gironi (Admin)**: filtro `Tutti i gironi / Girone X` in `components/admin/tabs/MonitorGroupsTab.tsx`.
- **Qualificazione dal girone al tabellone**: il seeding usa **Pt → ΔC → ΔS** (fallback tecnico: canestri fatti, nome) in `services/tournamentEngine.ts`.

### Spareggi gironi (tie-break) — regole e dati

- Trigger: quando una parità (dopo **Pt/ΔC/ΔS**) impatta i piazzamenti necessari per far avanzare i qualificati (tipicamente sulla soglia `advancingPerGroup`).
- Codice match: `ATB1`, `BTB1`, ... (**senza trattino**).
- Campi match:
  - `isTieBreak: true`
  - `targetScore: 1` (spareggio “race-to-1”, con ricorsione in caso di pareggio dei leader)
- Formati supportati:
  - **1v1**: `teamAId/teamBId` + `scoreA/scoreB` (comportamento storico).
  - **Multi-squadra** (es. `A vs B vs C` in **un’unica partita**): `teamIds: string[]` + `scoresByTeam: Record<teamId, score>`.
- Pareggi **non ammessi**: in referto serve un **leader unico** (se ci sono più leader pari, lo spareggio deve proseguire con la logica ricorsiva).
- Dopo il salvataggio del referto (`status=finished`), per i match `isTieBreak=true` il campo `targetScore` viene aggiornato al **punteggio massimo finale** (es. 2–1 -> `targetScore=2`, 3–2 -> `targetScore=3`) così il badge UI **“a N”** riflette la reale “race-to-N” raggiunta.

### Spareggi Girone Finale (FTB*) — blocco titolo

Quando e' attivo il **Girone Finale** (all’italiana tra Top4/Top8), se al termine del girone la testa della classifica e' ancora in **parita' assoluta** dopo **Pt -> ΔC -> ΔS -> C+**, l’engine crea uno spareggio finale:

- Codice match: `FTB1`, `FTB2`, ...
- Campi match:
  - `isTieBreak: true`
  - `targetScore: 1`
- 2 squadre: 1v1 (`teamAId/teamBId`)
- 3+ squadre: multi-team (`teamIds` + `scoresByTeam`)
- Fino a spareggio completato, il **titolo non e' assegnabile** (winner non viene calcolato).

### Simulazione spareggi

In `services/simulationService.ts`:
- Supporto `targetScore` (default 10 per match standard; 1 per spareggi).
- Per spareggi multi-squadra: applica la **stessa regola “ricorsione 3%”** dei match normali. In caso di parità in testa al target, restano solo i leader; poi, finché i leader restano pari, c'è un 3% di “parità che continua” (tutti i leader segnano) e altrimenti uno solo segna (sudden-death). Questo rende possibili esiti tipo **2–1**, **3–2**, ecc.

### Helper condivisi (riduzione duplicazioni)

- `services/matchUtils.ts` centralizza:
  - partecipanti match (1v1 e multi),
  - lettura score per team,
  - label score (`10-7` o `1-2-1`),
  - funzioni usate in Admin/Public/TV per evitare divergenze tra viste.

---

## Indicatori UI Spareggi

- I match con `isTieBreak=true` mostrano un badge **SPAREGGIO**.
- Se il match è multi-squadra (`teamIds` con 3+ team) viene aggiunto anche **MULTI**.
- Se `targetScore` è presente, viene mostrato come **“a N”** (es. **a 1**).
- Quando esistono spareggi gironi (`isTieBreak=true`) **non ancora conclusi**:
  - in **Admin** (Monitor Tabellone) appare il banner **“QUALIFICA BLOCCATA DA SPAREGGIO”** con elenco codici;
  - in **Public** e in **TV Mode** appare un avviso equivalente, per rendere chiaro che il tabellone/qualifica si sblocca solo dopo lo spareggio.

## Spareggi gironi (1v1 e MULTI)

Questa funzione serve a sbloccare le qualificazioni quando, in un girone, la classifica è in parità sulla/e posizione/i rilevante/i dopo i tie-break.

**Criteri classifica/qualifica (gironi):**
1. **Pt** (1 punto per vittoria)
2. **Δ canestri** (CF − CS)
3. **Δ soffi** (SF − SS)

Se la parità coinvolge posizioni che determinano i qualificati (`advancingPerGroup`), viene generato uno spareggio automatico nel girone:
- Codice: `ATB1`, `BTB2`, … **senza trattino**
- Flag: `isTieBreak=true`
- Target: `targetScore=1` (race-to-1)

**Spareggio 1v1:**
- Match standard 1v1.
- Non è ammesso pareggio: se si verifica una situazione “pari” (simulazione o partita reale), si continua finché esiste un vincitore unico.
- Il referto finale può risultare 2–1, 3–2, … (ricorsione).

**Spareggio MULTI (A vs B vs C…):**
- È un singolo match con più squadre contemporaneamente.
- Anche qui non è ammesso “pareggio in testa”: se più squadre arrivano al target insieme, restano in gioco e il target effettivo cresce (1→2→3…).
- Il referto finale può risultare, ad esempio: 2–1–0, 3–2–1, ecc.

**Definizione “subiti” nei match MULTI (per standings):**
- CF/SF: punti/soffi fatti dalla squadra.
- CS/SS: **somma** di ciò che fanno le altre squadre nello stesso match (estensione naturale del caso 1v1).


- Preflight backup JSON: classifica ogni file come **moderno** (nessun YoB legacy rilevato) oppure **legacy compatibile** (YoB presenti solo come fallback compatibile).


- `scripts/inspect-backup-profile.mjs`: analizza un backup JSON esterno e restituisce wrapper, profilo (`modern` / `legacy-compatible`) e inventario YoB legacy. Comando: `npm run inspect:backup -- ./path/to/backup.json`.
- `AGENTS.md`: istruzioni di repository per Codex con regole di patch minima, invarianti hard e comandi di verifica raccomandati.


## Addendum 2026-03-25 — Admin Social / Integrazioni / Import

- `components/admin/SocialGraphicsPanel.tsx`
  - gli slot social usano match reali e possono avere `assignedMatchIds` espliciti;
  - se i match cambiano dopo una rigenerazione torneo/preliminari, le assegnazioni stale vengono potate automaticamente per evitare slot manuali "vuoti fantasma".
- `components/admin/tabs/data/IntegrationsHof.tsx`
  - l'editor torneo in Integrazioni resta separato dall'area squadre e usa un solo pulsante di reset snapshot per evitare ridondanza nella toolbar.
- `components/AdminDashboard.tsx`
  - in import XLSX multi-sheet il foglio scelto è quello più coerente col profilo iniziale;
  - gli alert mismatch/no-team ora mostrano anche i fogli alternativi controllati.
- `services/storageService.ts`
  - nelle classifiche/awards le squadre con flag arbitro non vengono più escluse come se non fossero squadre reali.

- `components/admin/SocialGraphicsPanel.tsx`: il box export mostra ora anche il motivo bloccante della grafica selezionata e una preview dei primi match rimasti fuori dagli slot.
- `components/AdminDashboard.tsx`: negli alert import multi-sheet gli “altri fogli controllati” escludono il foglio già letto, per evitare liste fuorvianti.
