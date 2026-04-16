# STEP 12 — Coherence refactor

Obiettivo:
- consolidare naming, wiring e punti di ritorno senza rifattori larghi

Interventi chiave:
- centralizzazione dei tipi fantasy in `services/fantabeerpong/types.ts`
- centralizzazione dei mock in `services/fantabeerpong/mockData.ts`
- standardizzazione del naming `Fanta*Section`, `Fanta*Detail`, `FantaTeamBuilder`, `FantaQuickHelp`
- uniformazione dei back path dentro la shell FantaBeerpong
- micro-help riusabile, invece di duplicare blocchi informativi

Nota:
questo step non cambia l’architettura globale del progetto, in linea con il vincolo “non reinventare l’app”.
