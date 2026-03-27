# REMOVAL_CANDIDATES — FLBP Manager Suite (Step 7)

Data: 2026-01-02

## Stato verificato (S11–S18)

- **Dead-code scan runtime:** non sono emersi file/feature dell’app “rimossi in sicurezza” senza decisioni esplicite.
- I file non importati rilevati risultano **tooling/config/entry** (normali) oppure **tool manuale mantenuto** (vedi sotto).

## Tooling mantenuto (NON rimuovere)

- `/_ssr_admin_check.tsx` + `/_ssr_admin_check.mjs`  
  **Motivo:** check manuale SSR-like per intercettare uso non protetto di `window`/`document` nei componenti Admin.  
  **Stato:** mantenuto intenzionalmente e documentato in `README.md` + `docs/CODE_AUDIT.md`.

Questo file è una **lista di candidati**: NON sono rimozioni eseguite.
Ogni item deve essere validato con prove (import/route/search) prima di toccare il codice.

## Stato attuale (verificato nello ZIP)
- Repository contiene:
  - `scripts/check-*.mjs` + comando `npm run check:all`
  - `services/*` con engine torneo/simulazioni/OCR/repository/supabaseRest
  - Admin suddiviso in tab (`components/admin/tabs/*`)
  - TV mode lazy (`components/tv/*`)
- È presente un backup sample: `docs/sample_backup.json`

## Come generare prove “non usato”
Suggeriti (a mano o con script):
- `ripgrep`:
  - `rg "NomeComponente" step53`
  - `rg "from './percorso'" step53`
- Verifica route/lazy imports:
  - `App.tsx`
- Verifica “tab registrati”:
  - `components/AdminDashboard.tsx` e/o wrapper tab
- Verifica export barrel (se presenti) e file di index.

## Categorie candidate (da riempire dopo scansione)
### 1) Componenti UI
- [ ] componenti in `components/` non importati

### 2) Tab Admin
- [ ] tab in `components/admin/tabs/` non collegati a UI

### 3) Servizi
- [ ] utility duplicate in `services/`
- [ ] file legacy di repository (se esistono più implementazioni)

### 4) Script
- [ ] script non più chiamati da `package.json`

## Decisione “safe”
Finché non esiste una prova solida di non utilizzo:
- **non rimuovere**, al massimo spostare in una cartella `legacy/` (solo se concordato) oppure lasciare invariato.

