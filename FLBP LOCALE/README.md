<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# FLBP Manager Suite

Web app (React + Vite + TypeScript) per gestione tornei live di Beer Pong: iscrizioni, gironi/tabellone, referti (anche OCR), classifiche e **TV Mode 16:9 read-only**.

Guide:
- Manuale operativo: `docs/manuale_utente.md`
- Mappa funzioni/architettura: `docs/APP_FUNCTIONS.md`
- Mappa refresh/consumi Supabase: `docs/REFRESH_SUPABASE_MAP.md`
- Accesso Admin: **solo tramite Supabase Auth** con account presente in `public.admin_users`; la sessione apre l’area Admin, mentre l’autorizzazione finale alle write remote resta in mano a `flbp_is_admin()`.
- Template report performance: `docs/PERF_REPORT_TEMPLATE.md`
- Prompt finale Codex per chiusura misure: `docs/CODEX_PERF_CLOSEOUT_PROMPT.md`
- Playbook operativo Codex per Cloudflare + Supabase: `docs/CODEX_CLOUDFLARE_SUPABASE_PLAYBOOK.md`
- Check regressioni (manuale): `scripts/regression-checklist.md`
- Istruzioni repository per Codex: `AGENTS.md`

## Deploy pubblico consigliato
- Frontend statico: **Cloudflare Pages**
- Database + optional Admin DB sync/Auth: **Supabase**
- Nessun backend Node/Express separato
- Frontend: usa solo env `VITE_*` pubbliche e non usa `service_role`; per il set completo di variabili richieste vedi `README_DEPLOY.md`

Per setup completo, SQL, variabili ambiente e bootstrap del primo account admin: vedi `README_DEPLOY.md`.

---

## Run locally

Prerequisiti:
- Node.js

1. Installa le dipendenze:
   `npm install`
2. Se hai estratto il progetto da uno ZIP su macOS/Linux e vedi errori tipo **Permission denied** (`vite` / `esbuild`), esegui:
   `npm run fix:perms`
3. Avvia l’app:
   `npm run dev`

Note:
- `npm start` avvia lo stesso dev server di Vite.
- Il deploy pubblico non richiede chiavi extra lato client oltre alle env `VITE_*` documentate in `README_DEPLOY.md`.

## Operativo / Release
- Materiale "pronto-sala": `release_bundle/`
- Verifica release completa:
  - `npm run release:check -- ./backup.json`
- Solo build:
  - `npm run build`
- Suite dati locale:
  - `npm run check:all -- ./docs/sample_backup.json`


## Aggiornamenti recenti (2026-03)
- **Public/Admin/TV (UI text fit)**: rimossi i principali troncamenti su nomi torneo, team, giocatori, alias e header TV; dove serve il testo ora va a capo in modo controllato senza toccare i flussi.
- **Dialog public / tab Next**: il filtro **Next** nei dialog turni mostra ora solo il prossimo blocco reale, non tutti i turni futuri.
- **TournamentBracket**: `wrapTeamNames` resta il meccanismo esplicito per mostrare nomi completi nel bracket; attivo nei punti sensibili (TV fallback/classic, Public detail, Monitor bracket, Tournament editor).
- **TV hardening**: se manca un contesto torneo reale (nessun torneo, nessuna squadra, nessun match) la TV mostra ora il placeholder “segnale / attesa configurazione” invece di tentare render incompleti; inoltre la branch TV in `App.tsx` e' protetta da `UiErrorBoundary` per evitare schermate bianche mute.
- **TournamentEditorTab**: supporta l’aggiunta rapida di nuove squadre nel pool editor e l’espansione del bracket con un turno preliminare vuoto quando il Round 1 è pieno e il bracket non è ancora partito.
- **Hall of Fame**: nei box pubblici viene mostrata la **data completa del torneo** (fallback legacy all'anno solo se la data non e' disponibile).
- **Admin → Squadre → Lista iscritti**: correzione diretta del profilo giocatore (nome/data nascita) con propagazione su live, storico, Hall of Fame e dati derivati.
- **Admin → Dati → Integrazioni / Players**: stessa UX di correzione profilo anche a posteriori, con messaggi chiari su **merge / separate** e impatto previsto.
- **Backup JSON**: preflight compatibilita' prima di restore/merge, classificazione **moderno** vs **legacy compatibile**, inventario esplicito dei campi YoB legacy.
- **Export backup JSON**: i nuovi export provano a serializzare un backup piu' moderno, rimuovendo YoB solo quando esiste gia' la `birthDate` completa.
- **Input numerici operativi**: il valore iniziale `0` e' ora sovrascrivibile subito al click/focus nei punti critici (Struttura, Referti, Area Arbitri, Archivio, Social graphics, ecc.).

## Stato attuale
- Build produzione: OK
- Audit UI text-fit: main flows checked; residual bracket fallback kept intentional via `wrapTeamNames`
- `npm run test:data`: OK
- `npm run check:ssr-admin`: OK
- `npm run audit:backup-profiles`: OK
- `npm run inspect:backup -- ./docs/sample_backup.json`: OK
- Backup inclusi nel repository: tutti classificati **modern**
- Compatibilita' backup legacy esterni preservata via preflight + fallback YoB solo dove serve
- Nessuna regressione hard introdotta su Referti/OCR, BYE, TBD e TV Mode read-only


## Mobile (wrapper-ready)
- Build per wrapper (asset relativi): `npm run build:mobile`
- Guida: `docs/MOBILE_WRAPPER.md`


## Tooling opzionale — SSR Admin Check

Nel repository sono presenti gli script:
- `/_ssr_admin_check.tsx`
- `/_ssr_admin_check.mjs`

Scopo: **verifica manuale** che i componenti Admin non accedano a API browser-only (`window`, `document`) durante un render SSR-like (es. `react-dom/server`).

Esecuzione (Node):
```bash
node _ssr_admin_check.mjs
```

Note:
- Non viene eseguito automaticamente da build/sviluppo.
- Non influisce sul runtime dell’app.


## Codex / lavoro agentico
- Il repository include `AGENTS.md`, come raccomandato per guidare Codex nei repository con regole locali.
- Per audit dei backup inclusi nel repo: `npm run audit:backup-profiles`
- Per audit di un backup esterno reale: `npm run inspect:backup -- ./path/to/backup.json`
- `.gitignore` e script locali sono stati allineati per evitare di tracciare artefatti locali comuni durante il lavoro in Codex.


## Checks rapidi

- `npm run check:i18n` verifica che tutti i dizionari in `services/i18n/*.ts` espongano lo stesso set di chiavi di `it.ts`.
