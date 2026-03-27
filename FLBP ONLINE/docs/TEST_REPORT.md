## Verifiche TV finali (S57)
- Scope: review finale TV orientata a chiudere lo scope con un guardrail statico read-only riusabile da Codex.
- File coperti dal check dedicato:
  - `components/TvView.tsx`
  - `components/TvSimpleView.tsx`
  - `components/TvBracketView.tsx`
  - `components/TvScorersView.tsx`
  - `components/PublicTvShell.tsx`
  - `App.tsx` (entry TV)
- Comandi eseguiti in questo step:
  - `npm run check:tv-readonly`
  - `npm run check:ssr-tv`
  - `npm run check:ssr-admin`
  - `npm run check:i18n`
  - `npm run build`
  - `npm run check:all -- ./docs/sample_backup.json`
- Esito atteso/verificato staticamente:
  - Nessun `button`, `a`, `onClick`, `tabIndex`, `href`, `cursor-pointer` o ruolo interattivo nella superficie TV.
  - `PublicTvShell.tsx` mantiene `cursor-none` + `select-none` come safeguard read-only.
  - `App.tsx` mantiene l'ingresso TV incapsulato in `UiErrorBoundary` + `TvViewLazy`.
  - TV resta verificata su SSR/live/public/backup reale anche dopo il guardrail read-only.

## Verifiche TV finali (S56)
- Scope: verifica finale TV senza allargare lo scope oltre `Tv*View`, `App.tsx` e snapshot reali presenti nello ZIP.
- Comandi eseguiti in questo step:
  - `npm run check:ssr-tv`
  - `npm run check:ssr-admin`
  - `npm run check:i18n`
  - `npm run build`
  - `npm run check:all -- ./docs/sample_backup.json`
- Dataset coperti dal check TV:
  - shell vuota (`empty-shell`)
  - dataset live popolato (`live-populated`)
  - snapshot pubblico sanitizzato (`live-public-sanitized`)
  - backup reale incluso nello ZIP (`docs/sample_backup.json`)
  - backup reale + sanitize pubblico (`sample-backup-public-sanitized`)
- Esito atteso/verificato staticamente:
  - TV `groups`, `groups_bracket`, `bracket`, `scorers` renderizzano senza crash su stato live e stato pubblico.
  - `groups_bracket` mantiene davvero contenuto gironi + bracket anche nello snapshot pubblico sanitizzato.
  - BYE non compare in output SSR TV.
  - `docs/sample_backup.json` resta compatibile con fallback safe TV.

## Verifiche TV (S55)
- Scope: `components/TvView.tsx`, `components/TvSimpleView.tsx`, `components/TvBracketView.tsx`, `_ssr_tv_check.tsx`, `AGENTS.md`, `docs/COMPONENT_MAP.md`.
- Comandi eseguiti in questo step:
  - `npm run check:ssr-tv`
  - `npm run check:ssr-admin`
  - `npm run check:i18n`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run check:all -- ./docs/sample_backup.json`
- Esito atteso/verificato staticamente:
  - TV `groups`, `groups_bracket`, `bracket`, `scorers` renderizzano in SSR senza crash.
  - `groups_bracket` mostra davvero il blocco gironi oltre al bracket.
  - Fallback safe presenti per dati mancanti (`no_group_data_available`, `bracket_no_bracket_available`).
  - Nessuna dipendenza nuova.

# TEST_REPORT — FLBP Manager Suite (Step 86 + Addendum S18–S37)
Questo report raccoglie **test eseguiti** e **verifiche effettuate** sullo ZIP ricevuto.

> Nota: in questo ambiente ho potuto eseguire **build/TypeScript checks** e verifiche **da codice**.
> Un test “manuale UI” completo (click-through end-to-end in browser) va comunque eseguito su macchina di sviluppo.

## Ambiente
- Data: 2025-12-30
- ZIP verificato: `FLBP_checkpoint_S36_S37_typecheck_and_checks.zip` (include cambi S18–S37)
- Stack: Vite + React + TypeScript

## Addendum 2026-03-19 — Stabilità e ottimizzazione

Verifiche tecniche eseguite sul repository locale aggiornato:
- build produzione: PASS
- `tsc --noEmit`: PASS
- `node scripts/check-all.mjs ./docs/sample_backup.json`: PASS

Correzioni rilevanti introdotte:
- coerenza live state tra `tournamentMatches` e `tournament.matches`
- sync strutturato più affidabile (`services/autoDbSync.ts`)
- aggregazione leaderboard pubblica live sul roster corretto del torneo
- rimozione del coupling `supabaseRest` → dynamic import di `storageService`
- build finale Vite senza warning residui

## Addendum — Comportamenti aggiornati (S18–S33)

### Branding / TV
- `public/flbp_logo_2025.svg`: aggiunto logo federazione 2025.
- `components/PublicTvShell.tsx`: se `state.logo` è vuoto o l'URL fallisce, usa il fallback `/flbp_logo_2025.svg`.

### Admin → Arbitri (stampa referti)
- `components/admin/tabs/RefereesTab.tsx`: stampa referti "da compilare" con squadre/giocatori precompilati.
  - turno corrente, prossimo turno e turno selezionato (anche passati).
  - output via print browser (salva come PDF), 2 referti per pagina.

### Admin → Struttura (grafiche social)
- Verificato: conteggi social basati sul draft/live corrente quando disponibile.
- Verificato: preliminari esclusi dagli slot normali dopo rigenerazione.
- `components/admin/SocialGraphicsPanel.tsx`: genera grafiche story 9:16 (preliminari + convocazioni slot orari) ed esporta PNG.
- Verificato: rigenerazione slot con assegnazioni manuali -> compare confirm prima di sovrascrivere.
- Verificato: export PNG slot bloccato se lo slot selezionato non ha orario valido o non contiene match.
- Verificato: download tutte le grafiche bloccato se resta almeno uno slot invalido/vuoto.
  - persistenza config in `localStorage` key `flbp_social_graphics_v1`.
  - export singolo e "Scarica tutte" (download sequenziale).

### Admin → Monitor (integrità + modifiche manuali)
- `components/admin/tabs/MonitorBracketTab.tsx`:
  - pre-check integrità: tabellone lockato + squadre escluse.
  - modifica manuale (solo se non lockato): replace BYE (Round 1), swap posizioni (Round 1).
  - rebuild eliminazione: rigenera il tabellone (ricalcolo preliminari/BYE) solo se non iniziato.
- `components/admin/tabs/MonitorGroupsTab.tsx`:
  - pre-check integrità: squadre escluse.
  - modifica manuale gironi (solo se non iniziati/non conclusi): add team escluso + genera match, move team tra gironi, swap team tra gironi.

### Area Arbitri (lookup codice)
- `components/RefereesArea.tsx`: se un codice match è duplicato, mostra una lista di candidati e richiede selezione esplicita.

### Area Arbitri (OCR — suggerimenti numerici PT/SF)
- `components/RefereesArea.tsx`: dopo OCR, mostra un box "Suggerimenti OCR (numeri)" e può compilare **PT/SF** (canestri totali/soffi) **solo se i campi sono vuoti o 0** (non sovrascrive inserimenti manuali).

### S36–S37 (TypeScript + check scripts)
- Aggiunto `vite-env.d.ts` per tipizzare `import.meta.env` (Vite).
- `components/RefereesArea.tsx`: fix typing `Object.entries(...)` per evitare `unknown` in TypeScript (nessun cambio runtime).

### Consistenza stato live
- `components/AdminDashboard.tsx`: gli update match mantengono sincronizzati `state.tournamentMatches` e `state.tournament.matches`.

### Area Arbitri (password per-live)
- All’avvio del live viene richiesta una password arbitri (Admin → Struttura → “Conferma e Avvia Live”).
- L’area arbitri è accessibile solo se c’è un live attivo **e** la password inserita coincide con `tournament.refereesPassword`.
- La sessione è legata al live tramite `sessionStorage` (`flbp_ref_authed` + `flbp_ref_authed_for=<tournament.id>`).

### Albo d’oro / U25
- I record U25 (Capocannoniere/Difensore) sono mostrati **inline** nei tab principali con etichetta `(U25)`.
- Nella tab “Giocatori Titolati” le colonne `⚪(U25)` e `🌬️(U25)` sono **sempre presenti** (nessun toggle) e valgono solo come ultimo tie-break.

### Gironi
- La colonna **Pt** è stata rimossa dalla UI (Public + Monitor). I punti restano parte del ranking interno.

### Public Tournament Detail (fit-to-width)
- Gironi e tabellone possono essere renderizzati **fit-to-width** (senza scroll orizzontale) quando abilitato in `PublicTournamentDetail.tsx`.

### Monitor Tabellone
- Supporta zoom (prop `scale` su `TournamentBracket`).
- Click su match nel **bracket** può essere override per aprire direttamente il referto (prop `onMatchClick` nel monitor).

### Archivio manuale (tornei incompleti)
- Il wizard “Nuovo torneo archiviato” consente anche 1 sola squadra: viene creato un archivio senza struttura (matches/gironi/tabellone vuoti), utile per salvare vincitore e titolati.

## Nota installazione locale (Windows / registry)
Per portabilita' dello ZIP su macchine esterne, `package-lock.json` usa URL di download su `https://registry.npmjs.org/`.
Se in passato `npm install` dava errori per URL di registry non raggiungibili, questo step risolve.

## Test automatici eseguiti
### 1) Script di check (repo)
Nel repo esistono:
- `npm run check:invariants`
- `npm run check:public-sanitize`
- `npm run check:all`

Esito (S36–S37):
- ✅ `npm run check:invariants -- ./docs/sample_backup.json` (PASS)
- ✅ `npm run check:public-sanitize -- ./docs/sample_backup.json` (PASS)
- ✅ `npm run check:all -- ./docs/sample_backup.json` (PASS)

### 2) TypeScript (noEmit) / Build produzione
Eseguiti in questo ambiente (S36–S37):
- ✅ `npm ci`
- ✅ `npx tsc --noEmit`
- ✅ `npm run release:check -- ./docs/sample_backup.json` (include `vite build` + `check:all`)

Fix typing introdotti in S36:
- `components/RefereesArea.tsx`: typing safe su `Object.entries` (OCR quick-suggestions) senza cambiare behavior.
- `vite-env.d.ts`: riferimento a `vite/client` per `import.meta.env`.

## Verifiche aggiuntive (Step 71-74)
### Switch modalità app (Tester/Ufficiale) in Admin
- Implementazione:
  - `config/appMode.ts`: override runtime via localStorage (`flbp_app_mode_override`) con precedence override → env → default
  - `components/AdminDashboard.tsx`: badge TESTER/UFFICIALE in alto a destra che salva override e fa reload
- Test da fare in UI:
  1. Entrare in Admin
  2. Clic su badge TESTER/UFFICIALE e confermare
  3. Verificare che la UI mostri/nasconda: simulazioni, sim-pool, export/import tester-only

### PWA + mobile polish (installazione su Home Screen)
- Verifica Android (Chrome): menu -> "Aggiungi alla schermata Home"
- Verifica iOS (Safari): Condividi -> "Aggiungi a Home"
- In modalita' installata iOS: status bar in overlay ("black-translucent") + safe-area padding via `env(safe-area-inset-*)` (nessun contenuto sotto notch)

### Self-contained (no CDN runtime)
- Verificare che l'app si carichi e funzioni anche con rete instabile, senza dipendere da CDN per JS/CSS critici.

### Albo d'oro — Giocatori Titolati (conteggi per titolo)
- `components/HallOfFame.tsx` tab **Giocatori Titolati** mostra colonne numeriche:
  - Totale, Campione (winner), Cannoniere (top_scorer), Difensore (defender), MVP (mvp)
- Ordinamento verificabile da codice:
  - Totale → Campione → Cannoniere → Difensore → MVP → nome (A→Z)
- Toggle U25: ora e' possibile includere i titoli U25 (colonne extra) e usarli solo come spareggio finale (valgono meno di tutti gli altri).

## Verifiche “da codice” (senza UI)
### Strutture torneo (Step 86)
- `types.ts`: aggiunto tipo torneo `round_robin` e configurazione opzionale `TournamentConfig.finalRoundRobin`.
- `services/tournamentEngine.ts`:
  - `generateTournamentStructure()` supporta `round_robin` (girone unico, nessun tabellone).
  - `getFinalRoundRobinActivationStatus()` + `activateFinalRoundRobinStage()` per attivazione Girone Finale all'italiana.
  - `syncBracketFromGroups()` esclude sempre il gruppo finale dai calcoli avanzamento.

### Admin UI (Step 86)
- `components/admin/tabs/StructureTab.tsx`: selezione modalità (`round_robin` / `elimination` / `groups_elimination`) + toggle/config Girone Finale (Top4/Top8).
- UX guardrails (Step 86.1):
  - con meno di 4 squadre (esclusi arbitri/BYE/hidden) il toggle **Girone Finale** è disabilitato.
  - con meno di 8 squadre (esclusi arbitri/BYE/hidden) l'opzione **Top8** è disabilitata.
  - `components/AdminDashboard.tsx`: auto-clamp se la selezione diventa invalida (disattiva finale / scala Top8->Top4).
- `components/admin/tabs/MonitorBracketTab.tsx`: pannello stato/attivazione Girone Finale (nessun impatto su TV Mode).
### Fix Step 78 (TBD / BYE / UX)
- **Bracket (gironi+tabellone)**:
  - `services/tournamentEngine.ts`: BYE non auto-chiude match contro placeholder `TBD-*`.
  - `services/tournamentEngine.ts::syncBracketFromGroups()`: sanitizzazione: nessun `TBD-*` puo' comparire in round > 1 (se presente viene rimosso e la partita viene resettata).
  - `components/TournamentBracket.tsx`: propagazione vincitore e BYE auto-win bloccano `TBD-*`.
- **Area Arbitri**:
  - `components/RefereesArea.tsx`: lista "Match da refertare" esclude match incompleti con 1 sola squadra.
- **Live UI marcatori**:
  - `components/TournamentLeaderboard.tsx`: il pulsante "Espandi" sta subito sotto i primi marcatori (evita spazio vuoto).

### Vincoli critici
#### BYE
- In più punti UI/logic sono filtrati:
  - match con `hidden` / `isBye`
  - teamId `BYE`
- Esempi (non esaustivi):
  - `components/TvSimpleView.tsx` filtra `!m.hidden && !m.isBye`
  - `components/admin/tabs/RefereesTab.tsx` filtra `!hidden && !isBye && team != BYE`
  - `components/AdminDashboard.tsx` usa `autoResolveBracketByes()` + `applyByeAutoWin()`

Esito: ✅ La logica “BYE invisibile / auto-resolve” risulta **implementata** a livello codice.

#### TV Mode
- TV Gironi (rotazione): `components/TvSimpleView.tsx` usa `ROTATION_MS = 15000` (15s) + calcolo automatico `groupsPerPage`.
- TV Marcatori: `components/TvScorersView.tsx` limita a `slice(0, 30)` (Top 30) e pagina 10 righe alla volta.

Esito: ✅ Le richieste “15s gironi” e “Top30” risultano **già implementate** a livello codice.

## Simulazioni
### Regole probabilistiche (verifica codice)
- `services/simulationService.ts` implementa:
  - score base con vincitore a (targetScore default 10) e perdente 0..targetScore-1
  - supporto `match.targetScore` (es. 1 per spareggi gironi) con stessa logica overtime ricorsiva (risultati possibili 2–1, 3–2) 
  - spareggio multi-squadra (AvsBvsC...): `simulateMultiMatchResult` per match con `teamIds` (race-to-1 + escalation se pareggio tra leader)
  - overtime nel ~3% (target-target) e tie-break “ricorsivo” con probabilità 3% di pareggio che continua
  - soffi: loop `while (Math.random() < 0.2)` (20% a catena)

Esito: ✅ Le regole richieste risultano **presenti** in `simulationService`.

### Simulazione turno / completa (flow)
- Bottoni: `components/admin/tabs/MonitorBracketTab.tsx`
- Handler: `components/AdminDashboard.tsx` (`handleSimulateTurn`, `handleSimulateAll`)
  - usa `syncBracketFromGroups()` prima del bracket per evitare stalli su TBD
  - loop con guard `guard < 2000` per “simulate all”

Esito: ⚠️ Da codice sembra coerente; **bug “simulatore parziale si blocca / totale non funziona” non riprodotto qui** (serve test UI/flow con dati reali).

## Workflow match (stato + modifica referto)
Da codice:
- in `MonitorBracketTab.tsx` click su match:
  - se `finished` → apre referto (`openReportFromCodes`)
  - altrimenti toggle `playing/scheduled` (`toggleMatchStatus`)
- bottone “Referto” presente anche su match non finiti.

Esito: ✅ Comportamento richiesto (verde avviata / rossa finita / edit referto) risulta **già coperto** in quella vista.

## Bug list (riproducibili)
### Confermati in questo step
- Nessun bug runtime riprodotto (non eseguito click-through UI).

### Segnalati dall’utente ma non riprodotti qui
- Simulatore parziale si blocca
- Simulatore generale non funziona

Per riprodurre: serve eseguire l’app e simulare su torneo con gironi+bracket e/o bracket con BYE/TBD.

## Checklist test manuale UI (da fare su macchina dev)
> Obiettivo: riprodurre/chiudere i bug “simulatore parziale si blocca” e “simulatore generale non funziona”, e confermare OCR/TV.

### Setup
1. `npm install`
2. `npm run dev`

### A) Smoke test end-to-end (minimo)
1. Admin → Tornei → **Squadre**: inserisci almeno 8 squadre (usa simulatore pool se presente).
2. Admin → **Struttura**: genera struttura e avvia live.
3. Admin → **Monitor Gironi** (se modalità mista): verifica match gironi con risultati e “da giocare”.
4. Admin → **Lista Codici**: clic su un match → deve diventare “avviato” (verde) e deve esserci modo di aprire referto.
5. Admin → **Referti**: inserisci un referto manuale → match deve diventare “concluso” (rosso).
6. Clic su match concluso → deve aprire modifica referto.

### B) Simulazioni
1. In Admin → Monitor/Referti: usa **Simula Turno**
   - Atteso: simula una singola fase/turno e aggiorna risultati/stats.
2. Usa **Simula Tutto**
   - Atteso: completa il torneo senza freeze.

Se si blocca:
- annotare l’ultima azione visibile (fase, match count, presenza TBD/BYE)
- esportare backup e allegare come `backup_bug_simulation.json` per debug.

### C) OCR
1. Area Arbitri (Referti) → modalità OCR → carica immagine referto
2. Atteso: apre la finestra di conferma con codice + testo OCR (supporto).
3. Dopo conferma: nella schermata manuale può apparire "Suggerimenti OCR (numeri)".
4. Se presenti marker PT/SF nel testo: clic "Applica suggerimenti OCR" deve compilare PT/SF **solo se i campi sono vuoti o 0** (non sovrascrive inserimenti manuali).

### D) TV Mode
1. Avvia TV Broadcast dalle sezioni previste.
2. Atteso:
   - layout sempre 16:9 senza tagli
   - Gironi: rotazione ogni ~15s se molti gironi
   - Marcatori: visualizza Top 30 canestri e Top 30 soffi

### E) TV Mode — Pagina dedicata "Girone Finale" (Step 86)
Verifica (solo se nei dati esiste un gruppo finale):
1. Nel torneo live assicurarsi di avere un gruppo con:
   - `group.stage === 'final'` (se presente) **oppure** nome che contiene "final" (es. "Girone Finale").

### F) Stampa referti (Admin → Arbitri)
1. Admin → Arbitri.
2. Verificare che i pulsanti **Stampa referti** siano presenti per:
   - turno corrente
   - prossimo turno
   - turno selezionabile (anche passati)
3. Clic: deve aprire una pagina di stampa; usare "Salva come PDF".
4. Atteso:
   - 2 referti per pagina
   - squadre e giocatori precompilati
   - campi manuali vuoti (soffi/canestri totali + X vincitore)

### G) Grafiche social (Admin → Struttura)
1. Admin → Struttura → sezione **Grafiche Social**.
2. Impostare slot orari manualmente oppure usare il generatore automatico (primo orario + intervallo + squadre per turno); per ogni slot usare anche il pulsante **Match** se serve una scelta esplicita dei match; scegliere una story (prelim / slot).
3. Verificare **anteprima**: deve essere identica (pixel-perfect) al file scaricabile.
   - Nomi squadre completi (niente ellissi/tagli); preferibilmente 1 riga, wrap solo se inevitabile.
   - Matchup coerente SX/DX (stesso font-size).
   - BYE/TBD non devono comparire in nessuna riga/grafica.
4. Clic **Scarica PNG** e verificare l'immagine (1080x1920).
5. Clic **Scarica tutte (PNG)**: deve scaricare in sequenza tutte le grafiche disponibili.
6. Refresh pagina: configurazione deve ripristinarsi da `localStorage` (`flbp_social_graphics_v1`).
7. Aprire un singolo slot → **Match**: selezionare alcuni match specifici, verificare che `# Partite` si aggiorni e che gli stessi match risultino bloccati negli altri slot manuali.
8. Clic **Torna automatico** nello slot: la selezione esplicita deve sparire e i match devono tornare disponibili per l’allocazione automatica/fallback.

### G.1) Fine torneo — MVP + archiviazione
1. Admin → Archivia: aprire la procedura che richiede MVP.
2. Selezionare l’MVP e premere **Salva MVP e archivia**.
3. Atteso: il torneo viene archiviato e compare un popup **“Torneo terminato”**.

### H) Modifiche manuali (Monitor)
#### Bracket
1. Admin → Monitor Tabellone.
2. Se il tabellone è lockato (match avviati), la modifica manuale deve risultare disabilitata.
3. Se non lockato:
   - Replace BYE (Round 1): selezionare slot BYE e squadra esclusa/non presente nel tabellone.
   - Swap (Round 1): scambiare due squadre in Round 1.
   - Rebuild elimination: confermare rigenerazione e verificare ricalcolo prelim/BYE.

#### Gironi
1. Admin → Monitor Gironi → selezionare un girone specifico.
2. Se il girone è iniziato o concluso: modifica manuale deve essere disabilitata.
3. Se non iniziato:
   - Aggiungi squadra esclusa → genera match mancanti.
   - Sposta squadra in altro girone.
   - Scambia squadre tra due gironi.

### I) Area Arbitri — codici duplicati
1. Forzare (o simulare) due match con lo stesso `code`.
2. Area Arbitri → cerca per codice.
3. Atteso: compare una lista di match candidati e l'arbitro deve scegliere quello corretto.
2. Entrare in TV Mode (proiezione Gironi).
3. Atteso:
   - la rotazione delle pagine considera solo i gironi "normali".
   - l'ultima pagina e' una pagina full-width con intestazione **GIRONE FINALE**.
   - in pagina finale non c'e' evidenza "qualificati" (advancingCount=0).
   - banner separati:
     - spareggi gironi: "Qualifica bloccata da spareggio"
     - spareggi finali: "Titolo bloccato da spareggio finale"
   - BYE: nessuna squadra BYE deve comparire in classifica (TV filtra anche eventuali pseudo-team BYE/hidden nei dati storici).
4. (Opzionale) Proiezione G+Tab:
   - la colonna "Gironi" deve mostrare solo i gironi di stage (esclude l'eventuale Girone Finale).
   - il banner "Qualifica bloccata da spareggio" non deve includere spareggi del Girone Finale.

<!-- Nota: la checklist manuale è già presente sopra. Evitiamo duplicazioni. -->

## Step 4 — Analisi/mitigazione bug simulazione (da codice)
- Intervento: ottimizzato `handleSimulateAll()` in `components/AdminDashboard.tsx` per simulare il tabellone *round-by-round* riducendo loop/scan ripetuti (mitiga freeze UI su bracket grandi).
- Stato: TypeScript/build ok.
- Da validare in UI: Simulazione completa su tornei grandi (es. 128+ team) non deve più bloccare la UI.


## Documentazione
- Manuale utente PDF generato: `docs/Manuale_Utente_FLBP_Manager_Suite.pdf`.


## Step R5 — PWA baseline (installabile su Home Screen)

Obiettivo: rendere l'app installabile su smartphone/tablet (PWA) **senza service worker** (quindi nessun caching aggressivo).

Verifica:
1. Build e avvio app.
2. Da mobile:
   - Android/Chrome: menu -> "Aggiungi alla schermata Home".
   - iOS/Safari: Condividi -> "Aggiungi a Home".
3. Atteso: icona e nome corretti; apertura fullscreen; tutte le funzioni invariate.


## Step R6 — Packaging self-contained (no CDN runtime)

Obiettivo: rendere l'app più deterministica (tornei live) e più facile da “wrappare” in futuro (mobile), eliminando dipendenze runtime critiche da CDN.

Verifica:
1. Controlla `index.html`: non devono esserci script/link a:
   - Tailwind CDN
   - importmap per React/Lucide/XLSX
   - tesseract CDN
2. Esegui `npm run release:check -- ./docs/sample_backup.json`.
3. (Opzionale) Apri la web app con connessione instabile: la UI deve restare coerente (le logiche non dipendono da CDN).


## Ripristino da Step 8 (patch applicate)
- Verificare in Admin > Referti: score calcolato da canestri giocatori; pareggio non salvabile.
- Verificare torneo con gironi: nessun TBD deve arrivare a finale nel tabellone.
- Verificare SimPool: generazione >200 squadre e nomi femminili; arbitri ~1/5.
- Verificare Leaderboard Storica: default sort per canestri.
- Verificare TournamentLeaderboard compatta: click su header/riga espande.

## Step 9 — Robustezza spareggi gironi multi-squadra (UI)
- RefereesTab: include anche i match con `teamIds` (3+ squadre) nel calcolo dei “turni” e nell’occupazione arbitri.
- Archivio tornei: lista match + editor marcatori gestiscono match multi-squadra (label "A vs B vs C" e score "1-2-1" basato su `scoresByTeam`/stats).
- Da validare in UI: torneo con gironi che genera spareggio multi-squadra, verifica Referti/Arbitri/Archivio.


## Test aggiuntivi — Gironi (classifica + spareggi)

### A) Classifica stile campionato
1. Crea torneo con gironi.
2. Completa almeno 2 match in un girone con referti (anche via OCR se disponibile).
3. Verifica in:
   - Admin → Monitor Gironi
   - Public → dettaglio torneo
   - TV → vista gironi
   che la tabella mostri: P/V/S, CF/CS/ΔC, SF/SS/ΔS (Pt calcolati ma **non mostrati**) e che i valori siano coerenti con i referti / standings.

### B) Spareggio 1v1 automatico (ATB1)
1. Configura un girone con parità sulla soglia `advancingPerGroup` che non si risolve con Pt/ΔC/ΔS.
2. Verifica che venga creato un match `ATB1` con badge **SPAREGGIO** e target **a 1**.
3. Completa lo spareggio con referto (no pareggio).
4. Verifica che il tabellone si sblocchi e che l’avanzamento rispetti Pt → ΔC → ΔS.

### C) Spareggio multi-squadra (A vs B vs C in un’unica partita)
1. Crea parità tra 3+ squadre sulla soglia di qualifica, non risolvibile con Pt/ΔC/ΔS.
2. Verifica che venga creato un match unico `ATB1` con 3+ partecipanti.
3. In Admin → Referti inserisci un referto con vincitore unico (es. `1-2-1` o `2-3-1`).
4. Verifica:
   - badge **SPAREGGIO MULTI**
   - banner “Qualifica bloccata da spareggio” presente prima e assente dopo la chiusura dello spareggio.

### Test manuale — Spareggio MULTI (A vs B vs C)

1. Crea/usa un torneo con gironi in cui 3 squadre finiscono pari su Pt, ΔC e ΔS sulla cutline.
2. Verifica che venga generato un match `ATB1` con badge **SPAREGGIO • MULTI • a 1**.
3. In Admin → Referti, inserisci un risultato finale non pari in testa (es. 2–1–0) e salva.
4. Verifica: banner *qualifica bloccata* sparisce; standings girone aggiornate; bracket si popola correttamente.

## Step R4 — Area Arbitri: referti (manuale + OCR con conferma)

### Smoke test (torneo live)
1. Menu → **🧑‍⚖️ Area Arbitri** → Accedi.
2. Seleziona un arbitro (o aggiungilo manualmente).
3. Pagina Referto:
   - clicca un match in **Match da refertare** (scheduled/playing) e verifica che il codice venga impostato.
   - in alternativa inserisci il codice e premi **Cerca**.
4. Modalita' Manuale:
   - compila canestri/soffi dei giocatori e salva.
   - verifica che:
     - il match diventi `finished`
     - se match di bracket, il vincitore venga propagato al turno successivo (auto-advance BYE incluso)
     - se match di gironi, la classifica si aggiorni e (in groups+elimination) il bracket venga sincronizzato.
5. Modalita' OCR:
   - carica una foto referto e verifica che appaia la finestra **Conferma dati OCR**.
   - modifica il codice (se necessario) e conferma.
   - verifica che l'inserimento manuale si apra con **Supporto OCR** (immagine allineata + testo).

### Edge case
- Prova a salvare con pareggio in testa (1v1: 10-10, multi: 2-2-1): deve essere bloccato con alert e messaggio UI.
- Prova codice BYE/TBD/hidden: deve essere bloccato e non deve permettere il salvataggio.


## step77 — Hall of Fame: toggle titoli U25
- Verificato: tab "Giocatori Titolati" mostra colonne principali e sorting; con toggle U25 attivo appaiono colonne U25 e il tie-break usa U25 solo come spareggio finale.
- Nessun impatto su: BYE/TBD, OCR, import/export, TV Mode, workflow live.

## step78 — Bracket: stop TBD advance + UI live marcatori + filtri Area Arbitri
- Verificato: in `groups_elimination` un placeholder `TBD-*` non puo' avanzare oltre Round 1 (anche su BYE).
- Verificato: in Live "Marcatori" il pulsante **Espandi classifica** sta subito sotto i primi marcatori mostrati.
- Verificato: Area Arbitri esclude match con BYE/TBD/hidden e match incompleti (1 sola squadra / slot vuoto).

## step79 — Elimination: rami preliminari dal fondo (ordine inverso)
- Crea torneo **Eliminazione** con numero squadre non potenza di 2 (es. 9, 10, 12, 14).
- Verifica Round 1:
  - i match BYE sono in alto, `hidden`, auto-finiti e auto-avanzano.
  - i match reali (rami preliminari) sono in fondo al tabellone; aumentando il numero squadre, i preliminari "crescono" verso l'alto (ordine inverso).
- Verifica che non esistano match BYE vs BYE in Round 1.

## step80 — Gironi+Eliminazione: rami preliminari dal fondo (ordine inverso)
- Crea torneo **Gironi+Eliminazione** con numero squadre tale da produrre un numero qualificati non potenza di 2 (es. 3 gironi x 2 qualificati = 6; oppure 5 gruppi x 2 = 10).
- Verifica Round 1 del tabellone (prima e dopo completamento gironi):
  - i match con BYE sono in alto, `hidden` (e diventano auto-finiti/auto-avanzano quando la squadra e' nota).
  - i match reali (rami preliminari) sono in fondo al tabellone; aumentando i qualificati, i preliminari "crescono" verso l'alto (ordine inverso).
  - non esistono match BYE vs BYE in Round 1.
- Verifica vincolo TBD: BYE vs `TBD-*` resta hidden e non chiuso, e un `TBD-*` non compare in round > 1.


## step82 — Wrapper-ready (Capacitor) + build mobile
- Verifica che il progetto continui a funzionare come web app:
  - `npm install`
  - `npm run dev`
- Verifica build standard:
  - `npm run build`
- Verifica build mobile (base relativa):
  - `npm run build:mobile`
  - apri `dist/index.html` in un server statico o wrapper (Capacitor) e verifica che asset e routing interno funzionino.
- Nota: Capacitor non e' installato di default; vedi `docs/MOBILE_WRAPPER.md` per i comandi `cap add/sync/open`.

## step83 — R7-bis (wrapper automation) + R8 (service worker conservativo)

- Verifica generazione Android (Windows o macOS/Linux):
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts\capacitor-generate-android.ps1`
  - macOS/Linux: `bash scripts/capacitor-generate-android.sh`
  - Atteso: crea cartella `android/`, poi `cap sync android` ok.
- Verifica iOS (solo macOS): `bash scripts/capacitor-generate-ios.sh`.

- Verifica service worker (build prod):
  - `npm run build` e servi la cartella `dist` (non file://).
  - Apri DevTools -> Application -> Service Workers: deve risultare registrato `sw.js`.
  - Ricarica: asset dovrebbero caricarsi piu' rapidamente al secondo giro.
  - Disabilitazione rapida: `localStorage flbp_sw_disabled=1`, poi reload -> nessuna registrazione.

## step84 — R8.1 hardening TV + controlli cache in Admin

- Verifica TV Mode (riduzione rischio build vecchie):
  - In Admin: entra in TV Mode e verifica che TV resti fluida e senza click.
  - Apri DevTools -> Application -> Service Workers:
    - se `flbp_tv_mode` e' attivo, l'app **non registra** `sw.js`.
  - Se il SW era gia' registrato: l'app tenta in best-effort di **unregister** e **svuotare cache** (non deve crashare).

- Verifica controlli cache in header Admin:
  - Pulsante **CACHE ON/OFF**:
    - OFF: imposta `localStorage flbp_sw_disabled=1`, pulisce cache e ricarica.
    - ON: rimuove `flbp_sw_disabled` e ricarica.
  - Pulsante **cestino**:
    - forza clear caches + unregister SW + reload pulito.

## step85 — Spareggi: targetScore riflette la race-to-N + simulazione MULTI allineata

- Verifica spareggio 1v1 (ATB1):
  - inserisci un referto 2–1 (derivato dai canestri dei giocatori) e salva.
  - atteso: il match resta `isTieBreak=true`, viene chiuso, e il badge mostra **"a 2"** (target aggiornato automaticamente).
- Verifica spareggio MULTI (A vs B vs C):
  - inserisci un referto 3–2–1 e salva.
  - atteso: badge **"a 3"**.
- Simulazione (solo TESTER):
  - lancia "Simula" su uno spareggio MULTI e verifica che gli esiti possano essere 2–1–0, 3–2–1, ecc.
  - in caso di parita' in testa, l'algoritmo applica la stessa ricorsione 3% dei match normali.

## step86 — Archivio: wizard "Nuovo torneo" supporta All'italiana + config Girone Finale

- Admin → Gestione dati → Archivio tornei → **Nuovo torneo**:
  - In "Modalita'" e' disponibile **All'italiana (Girone unico)**.
  - In "Struttura":
    - per All'italiana: mostra nota "Tutte contro tutte. Nessun tabellone" e non mostra campi gironi.
    - per tornei con tabellone: sezione **Girone Finale** con guardrail:
      - toggle disabilitato se squadre utili < 4.
      - opzione Top 8 disabilitata se squadre utili < 8.
- Crea torneo:
  - round_robin: 1 group, rounds vuoti, match tutti-contro-tutti.
  - altri: struttura invariata + config `finalRoundRobin` salvata se abilitata.

## step87 — Girone Finale: auto-creazione spareggio finale (FTB*) + winner bloccato finche' pari

- In un torneo con Girone Finale attivato (Top4/Top8):
  - completa tutte le partite `F*` del Girone Finale.
  - se la testa e' in parita' assoluta dopo Pt -> ΔC -> ΔS -> C+:
    - atteso: compare un nuovo match `FTB1` (isTieBreak=true, targetScore=1) nel Girone Finale.
    - atteso: finche' `FTB*` non e' finito, il winner non viene assegnato (Albo d'Oro / export).
  - se dopo `FTB1` la parita' persiste (leader pari):
    - atteso: dopo aver completato `FTB1`, l'engine puo' creare `FTB2`.

- In un torneo All'italiana (round_robin):
  - completa tutte le partite del girone.
  - atteso: winner calcolato dalla classifica se leader unico; se pari assoluto, winner non assegnato.

## step88 — No-ties UI: editing retroattivo (Archivio) e bracket manuale

- Archivio → Editing risultato (retroattivo):
  - per match 1v1 e multi-team, se si imposta stato **finished**, deve esserci un **leader unico**.
  - atteso: se parita' (leader multipli), blocca salvataggio con alert "Pareggio non ammesso".
  - atteso: se ci sono partecipanti `TBD-*` e stato `finished`, blocca salvataggio.
  - per match `isTieBreak=true`, al salvataggio `targetScore` viene aggiornato al punteggio max finale (badge "a N" coerente).

- Tabellone (modale modifica risultato):
  - su match reali (no BYE/TBD), se inserisci `scoreA == scoreB`, il salvataggio deve essere bloccato.


## step89 — Hall of Fame / profili giocatore / preflight backup / UX input numerici

### Hall of Fame (public)
- Verifica box torneo in `components/HallOfFame.tsx`:
  - il badge mostra la **data completa del torneo** quando l'archivio espone `startDate`.
  - su record legacy senza data completa, il fallback resta l'anno (nessun crash).

### Admin → Squadre → Lista iscritti
1. Apri la vista squadra oppure la vista giocatore in `TeamsTab`.
2. Clicca la matita sul profilo giocatore.
3. Atteso:
   - pannello inline con nome/data nascita correnti
   - riepilogo impatto su: iscritti live, torneo live, storico squadre, righe statistiche, titoli, alias
   - messaggio dedicato se il salvataggio produrrà **merge** con un profilo esistente
   - messaggio dedicato se il salvataggio manterrà/separerà il profilo corrente
4. Salva una correzione di nome/data:
   - atteso: aggiornamento propagato su live/storico/derivati senza introdurre regressioni su BYE/TBD.

### Admin → Dati
- Verificato: editor torneo in Integrazioni mostra stato dirty e lock count, e chiede conferma se cambi torneo con modifiche non salvate.
- Verificato: pulsante `Salva modifiche torneo` disabilitato finché non ci sono differenze rispetto ai valori salvati.
- Verificato: import squadre XLSX multi-sheet seleziona il foglio più coerente col profilo del primo XLSX valido; mismatch bloccato con dettaglio su layout/foglio/colonne.

### Admin → Dati → Backup JSON
1. Carica un backup JSON da **Ripristina** o **Integra**.
2. Atteso prima della conferma finale:
   - summary conteggi (`teams`, `matches`, `tournamentHistory`, `hallOfFame`, `integrationsScorers`, `aliases`)
   - eventuali warning su shape/schema version
   - blocco immediato dei file non riconosciuti come backup FLBP.

### UX rapida campi numerici
Verificare i campi con `0` iniziale nei punti operativi seguenti:
- Admin → Struttura → configurazione
- Admin → Referti → statistiche manuali
- Area Arbitri → inserimento manuale referto
- Admin → Arbitri → config tavoli
- Admin → Dati → Archivio / Marcatori manuali
- Modale modifica punteggio tabellone

Atteso comune:
- al click/focus, se il valore e' solo `0`, il campo seleziona automaticamente il contenuto
- il primo numero digitato sostituisce subito lo zero (senza Canc/Backspace preliminare)
- valori diversi da `0` mantengono il comportamento standard.

## Addendum 2026-03-24 — Regressione finale S10 (rename / backup / input rapidi)

ZIP verificato in questo step:
- `FLBP_step_S9_players_subtab_profile_impact.zip`

Verifiche eseguite in questo ambiente:
- `npm run check:ssr-admin` → **PASS**
- `npm run test:data` → **PARZIALE** (2 failure **pre-esistenti**, non introdotti dagli step S1–S9)

### Ambiti verificati
- **Hall of Fame**
  - `components/HallOfFame.tsx`: badge torneo con **data completa** e fallback legacy all'anno.
- **Admin → Squadre → Lista iscritti**
  - `components/admin/tabs/TeamsTab.tsx`: correzione profilo giocatore inline con impatto pre-save e messaggi merge/separate.
- **Admin → Dati → Integrazioni / Players**
  - `components/admin/tabs/data/PlayersSubTab.tsx`: correzione retroattiva con impatto pre-save coerente al live.
- **Admin → Dati → Backup JSON**
  - `services/backupJsonService.ts` + `components/AdminDashboard.tsx`: preflight compatibilità prima di restore/merge.
- **Input numerici rapidi**
  - `services/formInputUX.ts` applicato ai principali form operativi (Struttura, Referti, Area arbitri, Archivio, Social graphics, bracket score modal).

### Esito regressione mirata
- ✅ Nessuna regressione rilevata dallo SSR admin sui flussi toccati.
- ✅ Nessuna nuova dipendenza introdotta.
- ✅ Nessun cambio al motore Referti/OCR.
- ✅ Nessun cambio alla TV Mode (read-only invariata).
- ✅ Nessun cambio alla logica BYE/TBD.
- ✅ Backup JSON legacy verificato come compatibile a livello shape/fallback.

### Note sui test dati
I test automatici `test:data` continuano a mostrare **2 failure già presenti** nel baseline usato per questi step:
- `player profile snapshot exposes titles, archived stats, manual stats and aliases together`
- `reassign hall of fame entry updates player and marks manual edit provenance`

Questi due failure:
- erano già presenti prima del passo di regressione finale;
- non sono stati toccati in S10;
- richiedono uno step dedicato se vuoi chiuderli in modo isolato e senza allargare il perimetro.


## Addendum 2026-03-24 — S12 fix failure preesistenti (YoB legacy fallback)

ZIP verificato in questo step:
- `FLBP_step_S12_fix_preexisting_yob_failures.zip`

Verifiche eseguite in questo ambiente:
- `npm run test:data` → **PASS (12/12)**
- `npm run check:ssr-admin` → **PASS**

### Failure chiuse
- ✅ `player profile snapshot exposes titles, archived stats, manual stats and aliases together`
- ✅ `reassign hall of fame entry updates player and marks manual edit provenance`

### Causa reale trovata
- Alcuni snapshot/backup legacy continuano a esporre campi **YoB** (`player1YoB` / `player2YoB`) senza `birthDate` completa.
- Il modello identita' corrente preferisce correttamente `birthDate`, ma i servizi che leggono dati storici dovevano mantenere un fallback compatibile per non spezzare:
  - aggregazione titoli/statistiche/alias nei profili giocatore
  - riassegnazione manuale record Hall of Fame

### Correzione applicata
- `services/playerIdentity.ts`
  - introdotto `pickStoredPlayerIdentityValue()` per i dati **salvati/legacy**: usa `birthDate` se presente, altrimenti `YoB`, altrimenti `ND`.
- `services/playerDataProvenance.ts`
  - aggiornato l'uso degli identity helpers nei punti che leggono snapshot legacy (team archivio / winner Hall of Fame / integrazioni scorers legacy).
- `services/hallOfFameAdmin.ts`
  - riassegnazione record aggiornata per accettare anche `nextPlayerYoB` come fallback compatibile, mantenendo priorita' a `nextPlayerBirthDate`.

### Decisione architetturale confermata
- **YoB non e' piu' il modello preferito**.
- Resta solo un **fallback di compatibilita' sui dati legacy/salvati** finche' i backup reali non saranno completamente migrati a `birthDate` completa.
- Questo evita regressioni sui restore vecchi e mantiene coerenti i profili giocatore storici.


## Addendum 2026-03-24 — S14 backup preflight: inventario YoB legacy

**ZIP verificato**: `FLBP_step_S13_docs_yob_compatibility.zip`

**Obiettivo**
- Rendere il preflight backup piu' esplicito sul fatto che un file possa ancora contenere campi `YoB` legacy, senza modificare il modello live o forzare migrazioni implicite.

**Patch**
- `services/backupJsonService.ts`
  - aggiunti conteggi dedicati nel report compatibilita':
    - `liveTeamsWithLegacyYoB`
    - `liveTournamentTeamsWithLegacyYoB`
    - `historyTeamsWithLegacyYoB`
    - `scorerEntriesWithLegacyYoB`
  - aggiunto warning automatico se il backup contiene ancora blocchi con YoB legacy.
- `components/AdminDashboard.tsx`
  - summary di restore/merge aggiornato per mostrare i conteggi YoB legacy prima della conferma.
- `components/admin/tabs/data/BackupSyncPanel.tsx`
  - copy del pannello aggiornato: il preflight dichiara esplicitamente anche la presenza di campi YoB legacy.

**Verifiche**
- `npm run check:ssr-admin` → PASS
- `npm run test:data` → PASS (12/12)

**Esito**
- I backup vecchi restano compatibili.
- L'admin vede subito se un file dipende ancora da fallback YoB e in quali blocchi, evitando rimozioni hard premature della compatibilita'.


## Addendum S15 — Preflight backup: profilo moderno / legacy compatibile

- **Scope:** `services/backupJsonService.ts`, `components/AdminDashboard.tsx`, `components/admin/tabs/data/BackupSyncPanel.tsx`
- **Obiettivo:** rendere più leggibile il preflight backup dopo l'introduzione dell'inventario YoB legacy.
- **Esito atteso:** ogni backup valido viene classificato come:
  - `moderno` → nessun YoB legacy rilevato
  - `legacy compatibile` → presenti campi YoB legacy ma restore/merge ancora supportati
- **Verifiche eseguite:**
  - `npm run test:data` → PASS
  - `npm run check:ssr-admin` → PASS


## Addendum 2026-03-24 — S16 export backup JSON modernizzato senza rompere la compatibilità

**ZIP verificato**: `FLBP_step_S15_backup_profile_classification.zip`

**Obiettivo**
- Rendere i nuovi backup esportati dall'admin più moderni, evitando di serializzare campi YoB ridondanti quando il record possiede già la `birthDate` completa.
- Mantenere invariata la compatibilità di restore per snapshot/storici che hanno ancora solo YoB.

**Patch applicata**
- `services/backupJsonService.ts`
  - aggiunto `buildBackupJsonExportState()`.
  - l'helper normalizza lo stato con `coerceAppState`, forza `__schemaVersion` corrente e rimuove i campi legacy YoB solo nei record dove esiste già la `birthDate` completa:
    - `teams`
    - `tournament.teams`
    - `tournamentHistory[].teams`
    - `integrationsScorers`
- `components/AdminDashboard.tsx`
  - `exportBackupJson()` ora scarica `JSON.stringify(buildBackupJsonExportState(state))` invece dello stato grezzo.
- `components/admin/tabs/data/BackupSyncPanel.tsx`
  - copy aggiornato per dichiarare che i nuovi export cercano di produrre backup più moderni.

**Compatibilità**
- Nessuna migrazione implicita sullo stato live.
- Nessuna rimozione hard di YoB nei backup vecchi importati.
- Se un record non ha `birthDate`, il relativo YoB legacy resta nel file esportato.

**Verifiche**
- `npm run test:data` → PASS
- `npm run check:ssr-admin` → PASS

**Esito**
- I backup nuovi diventano progressivamente più puliti senza compromettere restore/merge dei file legacy già in circolazione.


## Addendum 2026-03-24 — S17/S18 audit template backup inclusi nel repository

### Obiettivo
- Verificare i JSON backup-like già inclusi nello ZIP/repository.
- Capire se fosse necessario migrare subito qualche file versionato ancora dipendente da YoB.

### Implementazione
- Aggiunto script `scripts/audit-backup-profiles.mjs`.
- Aggiunto comando `npm run audit:backup-profiles`.
- Il comando analizza i JSON backup-like inclusi in `docs/` e `.codex-tmp/` e rigenera `docs/BACKUP_PROFILE_AUDIT.md`.

### Esito audit
- File backup-like censiti nel repository: **5**
- File con profilo **modern**: **5**
- File con profilo **legacy-compatible**: **0**
- Nessuna migrazione dei file versionati è stata necessaria in questo step.

### Note
- L'audit conferma che i file sample/template presenti nello ZIP sono già allineati al modello moderno.
- La compatibilità YoB rimane necessaria solo per backup esterni o snapshot legacy non inclusi nel repository.

### Verifiche eseguite
- `npm run audit:backup-profiles` → PASS
- `npm run test:data` → PASS (12/12)
- `npm run check:ssr-admin` → PASS


## Addendum 2026-03-24 — Closeout finale

Verifiche tecniche eseguite sullo ZIP finale di consolidamento:
- `npm run audit:backup-profiles`: PASS
- `npm run test:data`: PASS (12/12)
- `npm run check:ssr-admin`: PASS
- `npm run check:all -- ./docs/sample_backup.json`: PASS

Chiusure consolidate in questo pacchetto:
- README e release docs allineati alle modifiche operative introdotte negli step recenti.
- Regression checklist aggiornata con i controlli su preflight backup, export modernizzato, correzione profili e Hall of Fame.
- Nessuna modifica ulteriore al motore live, Referti/OCR, TV Mode o flussi BYE/TBD.


## Addendum 2026-03-24 — S20 audit backup esterno + setup Codex repository

### Obiettivo
- Chiudere l'audit opzionale sui backup esterni reali.
- Allineare i file minimi utili per lavorare meglio con Codex nel repository.

### Patch applicata
- Aggiunto `AGENTS.md` in root con regole repository e comandi di verifica.
- Aggiornato `.gitignore` per artefatti locali comuni (`coverage`, log, zip, file OS).
- Aggiunto `scripts/inspect-backup-profile.mjs` e comando `npm run inspect:backup -- <file>`.
- Esteso `scripts/audit-backup-profiles.mjs` per scandire anche `release_bundle/`, ignorando i template/stub che non espongono una shape completa di backup FLBP.

### Esito audit
- `release_bundle/backup_template.json` è uno **stub/template** con `state` vuoto: viene scandito ma non conteggiato come backup-like completo.
- Il backup utente caricato (`flbp_backup_2026-03-23 (1).json`) risulta **legacy-compatible** con YoB presenti in 20 squadre live e assenti negli altri blocchi principali.

### Verifiche eseguite
- `npm run audit:backup-profiles` → PASS
- `npm run inspect:backup -- ./docs/sample_backup.json` → PASS
- `npm run inspect:backup -- /mnt/data/flbp_backup_2026-03-23 (1).json` → PASS
- `npm run test:data` → PASS
- `npm run check:ssr-admin` → PASS

- [x] Social odd teams per turn: con `squadre per turno` dispari, il generatore crea slot con assegnazioni esplicite e la squadra ripetuta appare con la nota `(Seconda Partita)`.
- [x] Social preliminari aggiunti dopo: i match preliminari di un turno bracket incompleto con BYE compaiono nella story dedicata e vengono esclusi dagli slot convocazioni normali rigenerati.
- [x] Social riepilogo/UX: il pannello mostra conteggi compatti (squadre visibili del torneo corrente, match convocabili/assegnati, preliminari, slot auto/manuali) e warning su slot senza orario, orari invalidi e slot vuoti.
- [x] Social conteggi: `playableTeams`/`teamsById` usano prima le squadre del draft/live corrente e solo in fallback il catalogo globale, evitando conteggi fuorvianti sul totale squadre.


## Addendum 2026-03-25 — S16/S17/S18 handoff + hardening finale

### Obiettivo
- Consolidare un handoff corto e repo-driven per Codex sui flussi Admin toccati.
- Chiudere gli edge-case rimasti su convocazioni social, import multi-sheet e standings/awards con squadre arbitri.
- Pulire la UI residua dell'editor torneo in Integrazioni.

### Patch applicata
- Aggiunto `docs/CODEX_UI_HANDOFF_SOCIAL_DATA_IMPORT.md` e riferimento in `AGENTS.md`.
- `components/admin/SocialGraphicsPanel.tsx`: pruning automatico `assignedMatchIds` non più validi, self-heal `selectedStoryKey`, pannello issue più dettagliato prima dell'export.
- `components/AdminDashboard.tsx`: alert import mismatch/no-team più leggibili con elenco fogli alternativi controllati.
- `components/admin/tabs/data/IntegrationsHof.tsx`: toolbar editor torneo semplificata (niente doppio pulsante ridondante di reset).
- `services/storageService.ts`: le squadre arbitri restano squadre reali per standings/awards; esclusi solo BYE/hidden.

### Verifiche eseguite
- `npm run check:ssr-admin` → PASS
- `npm run build` → PASS
- `npm run test:data` → PASS

### Check statici coperti
- [x] Social: se i match cambiano e uno slot manuale punta a match rimossi/non più convocabili, gli id stale vengono potati e la UI resta consistente.
- [x] Social: se la grafica selezionata non esiste più dopo reset/rigenerazione/rimozione slot, il pannello torna automaticamente alla prima story disponibile.
- [x] Import XLSX multi-sheet: in caso di mismatch o foglio senza squadre valide, l'alert mostra anche altri fogli controllati.
- [x] Awards/standings: le squadre con flag arbitro non vengono escluse dal calcolo del leader di girone quando sono squadre reali del torneo.
- [x] Integrazioni: l'action row dell'editor torneo non mostra più due pulsanti equivalenti per ripristinare lo snapshot salvato.

- Verificato che il box export social mostri il motivo bloccante della grafica selezionata quando lo slot è vuoto, senza orario o con orario invalido.
- Verificato che la preview dei match fuori slot si aggiorni quando restano `leftover` reali.
- Verificato che gli alert import multi-sheet elenchino solo i fogli alternativi, senza ripetere il foglio selezionato.
