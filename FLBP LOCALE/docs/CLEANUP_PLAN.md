# CLEANUP_PLAN — FLBP Manager Suite (Step 7)

Data: 2026-01-02

## Completato (S15–S17) — Razionalizzazione *pure functions* (output invariato)

- Centralizzazione “final group”:
  - `services/groupUtils.ts`: `isFinalGroupName`, `isFinalGroup`
- Centralizzazione normalizzazione testo:
  - `services/textUtils.ts`: `normalizeCol`, `normalizeNameLower`, `normalizeNamePreserveCase`
- Centralizzazione placeholder team id e label match:
  - `services/matchUtils.ts`: `isByeTeamId`, `isTbdTeamId`, `isPlaceholderTeamId`, `formatMatchTeamsLabel`

> Nota: questi interventi non cambiano UI/flow e non introducono dipendenze; riducono duplicazioni e rischio divergenze.

Scopo: proporre una **pulizia “safe”** e ripetibile senza rischiare regressioni (TV Mode / BYE / simulazioni / OCR / import-export).
Questo documento **non esegue** rimozioni: definisce *ordine* e *criteri*.

## Principi
- **Prima verifiche, poi rimozioni.**
- Ogni rimozione deve essere:
  1) provata come “non usata” (import/route/search)  
  2) coperta da `npm run build` + `npm run check:all -- docs/sample_backup.json`
- Evitare cambiamenti architetturali o refactor gratuiti.

## Step A — Congelare lo stato “release”
1. `npm ci`
2. `npm run build`
3. `npm run check:all -- docs/sample_backup.json`
4. Salva output/commit hash (se usi git) o crea una copia zip “baseline”.

**Obiettivo:** avere un riferimento certo prima di qualsiasi pulizia.

## Step B — Separare “dev bundle” e “release bundle” (packaging, zero rischio)
Nel repository sono presenti script di check (`scripts/check-*.mjs`) e file di doc/backup sample in `docs/`.
La pulizia più sicura è **non cancellare**, ma generare due zip:
- `FLBP_dev.zip`: include tutto (scripts, docs, sample, ecc.)
- `FLBP_release.zip`: include solo ciò che serve a build+run (app + assets), e magari solo `docs/Manuale_*.pdf`

Questa separazione riduce il “rumore” senza toccare il codice.
Se vuoi, nel prossimo step posso aggiungere uno script `scripts/make-zips.mjs` che genera entrambi gli zip.

## Step C — Ricerca “dead code” candidata (solo report)
### C1) Componenti non referenziati
Metodo:
- Cerca componenti React in `components/` che non sono importati da nessun altro file.
- Verifica anche route/lazy import in `App.tsx` e in `components/admin/tabs/*`.

Output atteso: lista in `docs/REMOVAL_CANDIDATES.md` con prove (grep/import graph).

### C2) Servizi/utility duplicati
Aree principali da controllare:
- `services/*` (repository, supabaseRest, tournamentEngine, simulationService, imageProcessingService, admin*Utils)
- `scripts/*` (check)

Obiettivo: trovare doppioni “stessa funzione” o file rimasti da migrazioni.

### C3) Feature flag / percorsi legacy
- Verificare se esistono vecchie route o tab admin non più raggiungibili (ma presenti in cartella).
- Verificare se ci sono vecchie forme di “repository” non più selezionabili.

## Step D — Esecuzione micro-rimozioni (solo dopo tua conferma esplicita)
Per ogni rimozione:
1) evidenza di non utilizzo (import/route/search)
2) rimozione singolo file o singola export
3) `npm run build`
4) `npm run check:all -- docs/sample_backup.json`
5) (opzionale) test manuale rapido: Live → TV → Simulazioni → OCR → Export/Import

## Step E — Post-pulizia
- Aggiornare `docs/APP_FUNCTIONS.md` e `docs/COMPONENT_MAP.md` se cambia qualcosa nei path.
- Aggiornare `docs/CODE_AUDIT.md` con la lista di rimozioni effettive.

