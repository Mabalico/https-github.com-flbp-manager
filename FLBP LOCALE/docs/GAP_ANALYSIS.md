# GAP_ANALYSIS — FLBP Manager Suite (Step 85)
Confronto tra la spec “gironi + classifiche + spareggi” e l’implementazione **verificata nello ZIP**.

## Implementato

- **Monitor Gironi (Admin)**: filtro “Tutti i gironi / singolo girone” + classifica stile campionato.
- **Classifiche gironi ovunque**: Admin / Public / TV mostrano P/V/S/Pt, CF/CS/ΔC, SF/SS/ΔS.
- **Ranking qualificazione gironi**: Pt → ΔC → ΔS (fallback tecnico: canestri fatti, nome).
- **Spareggio automatico** quando la parità blocca la qualifica:
  - codici `ATB1`, `BTB1`, ...
  - `isTieBreak=true`, `targetScore=1`
  - 1v1 e **multi-squadra in un’unica partita** (`teamIds`, `scoresByTeam`)
  - pareggi bloccati in referto
  - al salvataggio referto, `targetScore` viene aggiornato al punteggio max finale (badge "a N" coerente)
- **Indicatori UI**: badge spareggio + banner “qualifica bloccata da spareggio” in Admin/Public/TV.
- **Ottimizzazioni safe**: memoization + `matchUtils.ts` per ridurre duplicazioni.
- **Switch modalità app (Admin)**: badge TESTER/UFFICIALE in header che applica override runtime (localStorage).

- **Albo d'oro — Giocatori Titolati**:
  - tabella aggregata per giocatore con conteggi: Totale, Campione, Cannoniere, Difensore, MVP
  - tie-break: Totale → Campione → Cannoniere → Difensore → MVP → nome
  - Toggle **U25**: vista con colonne U25; i titoli U25 valgono meno e fungono solo da spareggio finale.

- **Packaging self-contained (no CDN runtime)**:
  - `index.html` non carica JS/CSS runtime critici da CDN (Tailwind/importmap/tesseract CDN rimossi)
  - Tailwind è build-time (`tailwind.config.cjs`, `postcss.config.cjs`, `styles.css`)

- **Mobile polish (PWA)**:
  - `index.html`: viewport `viewport-fit=cover` e meta iOS per modalita' installata
  - `styles.css`: safe-area padding automatico (notch) via `env(safe-area-inset-*)`


- **Wrapper-ready (Capacitor)**:
  - config `capacitor.config.json`
  - script `build:mobile` per asset relativi (Vite `--base=./`)
  - guida operativa: `docs/MOBILE_WRAPPER.md`

- **R7-bis (wrapper automation)**:
  - script "one-command" per generare `android/` e `ios/` in locale (`scripts/capacitor-generate-...`)

- **R8 (service worker conservativo)**:
  - `public/sw.js` + registrazione in `index.tsx`
  - network-first per HTML, cache leggera per asset build, disattivabile con `localStorage flbp_sw_disabled=1` 

- **R8.1 (hardening TV + controlli cache)**:
  - TV Mode: se `flbp_tv_mode` e' attivo, l'app non registra SW e prova a unregister+clear caches (best-effort).
  - Admin: pulsanti header CACHE ON/OFF + cestino per forzare reload pulito.

- **Step85 (spareggi: race-to-N coerente)**:
  - referto spareggio aggiorna `targetScore` al valore effettivo raggiunto (2–1 -> "a 2", 3–2 -> "a 3")
  - simulazione spareggi MULTI allineata alla stessa ricorsione 3% dei match normali

## Gap / Decisioni aperte (opzionali)

1) **Definizione “subiti” nei match multi-squadra**: attuale = somma dei fatti dagli altri partecipanti (estensione naturale del 1v1). Alternativa: subiti = max avversario.
2) **Parità non bloccanti** (es. 1°/2° entrambi qualificati): oggi lo spareggio scatta quando serve a sbloccare la soglia di qualifica. Se si vuole risolvere anche queste parità (con spareggio oppure con regole extra dichiarate), va definita una policy.


- [DONE step77] Hall of Fame: nella classifica titoli (Giocatori Titolati) aggiunto toggle per includere titoli U25 (peso minore: tie-break finale).
- [DONE step78] Bracket TBD safety: un placeholder `TBD-*` non viene mai auto-avanzato (BYE vs TBD non si chiude) e non puo' comparire in round > 1.
- [DONE step79] Tabellone (eliminazione): se il numero squadre non e' una potenza di 2, i rami preliminari sono posizionati in fondo al tabellone (ordine inverso) e Round 1 evita BYE vs BYE.
- [DONE step80] Tabellone (gironi+eliminazione): stessa regola dei rami preliminari dal fondo (ordine inverso) anche in `groups_elimination` (sia in generazione iniziale che in sync da gironi).

- [DONE step82] Wrapper-ready (Capacitor): aggiunta config e build mobile (`build:mobile`) + guida operativa.
- [DONE step83] R7-bis (wrapper automation) + R8 (service worker conservativo).
- [DONE step84] R8.1 hardening TV (no SW in TV) + controlli cache offline in header Admin.
