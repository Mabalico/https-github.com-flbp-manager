# CODE_AUDIT — FLBP Manager Suite (Step 85)
Audit leggero post-implementazione (senza refactor architetturali).

## Aree toccate (verificate nello ZIP)

## Tooling mantenuto intenzionalmente — SSR Admin Check

File:
- `/_ssr_admin_check.tsx`
- `/_ssr_admin_check.mjs`

Scopo: controllo **manuale** (non parte della build) per individuare accessi non protetti a API browser-only (`window`, `document`) nei componenti Admin tramite un render SSR-like (`react-dom/server`).

Esecuzione:
```bash
node _ssr_admin_check.mjs
```

Impatto sull’app: **nessuno** (non importato dall’app, non incluso nel bundle).

## Utility condivise introdotte (S15–S17)

Questi helper sono **puri** (no side-effect) e sono stati introdotti per ridurre duplicazioni mantenendo output e behavior invariati.

- `services/groupUtils.ts`
  - `isFinalGroupName(name?)` — riconosce gruppi “finale/finali” (regex).
  - `isFinalGroup(group?)` — `stage === 'final'` oppure nome “finale/finali”.
- `services/textUtils.ts`
  - `normalizeCol(s)` — normalizza header/colonne import (lowercase + rimozione non alfanumerici).
  - `normalizeNameLower(name)` — trim + collapse spazi + lowercase (chiavi/dedup).
  - `normalizeNamePreserveCase(name)` — trim + collapse spazi (per input/leggibilità, es. Referees).
- `services/matchUtils.ts`
  - `formatMatchTeamsLabel(match, getTeamName)` — label base match (code + “A vs B”), riusata in Admin/Referees.
  - `isByeTeamId / isTbdTeamId / isPlaceholderTeamId` — check placeholder robusti, usati in più viste.


- **Nuovi moduli:**
  - `services/groupStandings.ts` (calcolo classifiche campionato)
  - `services/matchUtils.ts` (partecipanti/score per match 1v1 e multi)
  - `components/GroupStandingsTable.tsx` (UI tabella standings)
- **Match model esteso** in `types.ts`:
  - tie-break: `isTieBreak`, `targetScore`
  - multi-team: `teamIds`, `scoresByTeam`
- **Engine**:
  - `services/tournamentEngine.ts` usa Pt → ΔC → ΔS per ranking e genera spareggi quando necessari.
- **UI**:
  - Monitor/Admin/Public/TV gestiscono badge spareggio e banner di “qualifica bloccata”.

- **Step85 spareggi (race-to-N coerente)**:
  - `components/RefereesArea.tsx`: al salvataggio di un match `isTieBreak=true`, aggiorna `targetScore` al punteggio massimo finale (badge "a N" coerente con 2–1, 3–2, ...).
  - `services/simulationService.ts`: simulazione spareggi MULTI usa la stessa ricorsione 3% dei match 1v1.

- **Albo d'oro (Hall of Fame)**:
  - `components/HallOfFame.tsx` tab **Giocatori Titolati**: tabella aggregata con conteggi per titolo (Totale/Campione/Cannoniere/Difensore/MVP) e tie-break deterministico.
  - Toggle **U25**: aggiunge colonne U25 e usa i titoli U25 solo come spareggio finale (peso minore).


- **App mode (Tester/Ufficiale) runtime override**:
  - `config/appMode.ts`: precedence override runtime → `VITE_APP_MODE` → default
  - `components/AdminDashboard.tsx`: badge TESTER/UFFICIALE (header) che salva override e fa reload

- **Packaging self-contained (no CDN runtime)**:
  - `index.html`: rimossi Tailwind CDN, importmap e tesseract CDN
  - `tailwind.config.cjs` + `postcss.config.cjs` + `styles.css`: Tailwind build-time via Vite
  - `index.tsx`: import CSS (`./styles.css`)

- **Mobile polish (PWA)**:
  - `index.html`: viewport `viewport-fit=cover` + meta iOS (status bar overlay)
  - `styles.css`: safe-area padding + tap highlight off
- **Wrapper-ready (Capacitor)**:
  - `capacitor.config.json`: config minimale (appId/appName/webDir)
  - `package.json`: script `build:mobile` (Vite `--base=./`) + helper `cap:*`
  - guida: `docs/MOBILE_WRAPPER.md`

- **R7-bis (wrapper automation)**:
  - `scripts/capacitor-generate-android.ps1` (Windows)
  - `scripts/capacitor-generate-android.sh` (macOS/Linux)
  - `scripts/capacitor-generate-ios.sh` (macOS)

- **Service worker conservativo (R8)**:
  - `public/sw.js`: network-first per HTML + cache leggera per asset build
  - `index.tsx`: registra `sw.js` solo in prod (disattivabile con `localStorage flbp_sw_disabled=1`)

- **R8.1 hardening TV + controlli cache (Admin)**:
  - `index.tsx`: se `flbp_tv_mode` e' attivo, non registra SW e prova in best-effort a unregister+clear caches.
  - `App.tsx`: all'ingresso in TV Mode effettua la stessa pulizia (per sessioni che entrano in TV senza reload).
  - `components/AdminDashboard.tsx`: pulsanti header CACHE ON/OFF + cestino (clear caches + unregister).


- **Portabilita' installazione (lockfile)**:
  - `package-lock.json`: URL `resolved` puntano a `registry.npmjs.org` (evita registry interni/non raggiungibili in locale)

- **Fix TBD su tabellone (gironi+bracket)**:
  - `services/tournamentEngine.ts`: BYE non auto-chiude match contro `TBD-*` e non pre-compila round 2 con placeholder.
  - `services/tournamentEngine.ts::syncBracketFromGroups()`: sanitizzazione (TBD mai in round > 1; reset match finiti "sporchi").
  - `components/TournamentBracket.tsx`: propagazione vincitore e BYE auto-win bloccano `TBD-*`.

- **Area Arbitri**:
  - `components/RefereesArea.tsx`: esclusione match incompleti (1 sola squadra) dalla lista "Match da refertare".

- **UX live marcatori**:
  - `components/TournamentLeaderboard.tsx`: bottone "Espandi" non viene spinto a fondo pagina quando la lista e' corta.

## Rischi principali (da tenere sotto controllo)

1) **Assunzioni legacy 1v1**: la codebase storica usa `teamAId/teamBId` in molte viste. È stato introdotto `matchUtils` per ridurre divergenze, ma eventuali nuove feature dovranno continuare a usare gli helper.
2) **Tie-break multi-squadra**: richiede che i referti producano sempre un vincitore unico (pareggi bloccati). Se in futuro si vogliono spareggi “a più round” espliciti, va definito un modello dati dedicato.

## Suggerimenti (solo se serve)

- Aggiungere un check automatico (script) che segnali accessi diretti a `teamAId/teamBId` in UI dove dovrebbe passare da `matchUtils`.


## step78
- `services/tournamentEngine.ts` + `components/TournamentBracket.tsx`: stop propagazione/auto-advance di placeholder `TBD-*`.
- `components/RefereesArea.tsx`: rimossi dai referti i match incompleti (1 sola squadra).
- `components/TournamentLeaderboard.tsx`: fix layout pulsante Espandi.

## step79
- `services/tournamentEngine.ts`: generazione tabellone `elimination` con **rami preliminari** posizionati in fondo (ordine inverso) quando le squadre non sono una potenza di 2. Evita BYE vs BYE in Round 1.

## step80
- `services/tournamentEngine.ts`: stessa regola dei rami preliminari dal fondo (ordine inverso) applicata anche a `groups_elimination`:
  - generazione iniziale Round 1 con placeholder (TBD) usando `buildRound1PairsWithPrelimsBottom()`
  - `syncBracketFromGroups()` genera i desiderata Round 1 con la stessa logica (prima e dopo completamento gironi).


## step82
- `capacitor.config.json`: aggiunta config wrapper.

## step83
- Aggiunti script R7-bis per generazione "one-command" dei wrapper:
  - `scripts/capacitor-generate-android.ps1` / `.sh`
  - `scripts/capacitor-generate-ios.sh`
- Aggiunto R8 (service worker conservativo): `public/sw.js` + registrazione in `index.tsx`.
- `package.json`: aggiunti script `build:mobile` e helper `cap:*` (nessun impatto sulla web app).
- `docs/MOBILE_WRAPPER.md`: guida operativa per Android/iOS.

## step84
- Hardening TV Mode (R8.1): SW non registrato con `flbp_tv_mode` attivo; best-effort unregister+clear caches.
- Aggiunti controlli cache in header Admin: CACHE ON/OFF + pulizia cache (cestino).
