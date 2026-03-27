# AGENTS.md

## Repository expectations

- Mantieni lo stack invariato: React + Vite + TypeScript, senza nuove dipendenze se non strettamente necessarie.
- Tratta lo ZIP/repository come fonte di verità: non inventare pagine, servizi o flow non presenti nel codice.
- Dai priorità a patch minime e UI-first, salvo fix anti-crash chiaramente richiesti.
- Mantieni invariati i vincoli hard: Referti/OCR, BYE invisibili in UI, TBD non avanza, TV Mode read-only.
- Quando modifichi un comportamento pubblico o un flusso admin, aggiorna la documentazione in `docs/`.
- Per il percorso Cloudflare Pages + Supabase e per i prompt da usare in Codex, consulta prima `docs/CODEX_CLOUDFLARE_SUPABASE_PLAYBOOK.md`.
- Per i flussi Admin UI toccati in questo handoff (Social / Integrazioni / import squadre), consulta anche `docs/CODEX_UI_HANDOFF_SOCIAL_DATA_IMPORT.md`.

## Verification

- Per modifiche ai dati o alle identità giocatore esegui: `npm run test:data`.
- Per modifiche admin/UI esegui: `npm run check:ssr-admin`.
- Per modifiche TV esegui: `npm run check:ssr-tv` + `npm run check:tv-readonly` + `npm run build`. Il check SSR TV copre anche `docs/sample_backup.json` e uno snapshot pubblico sanitizzato, mentre `check:tv-readonly` verifica staticamente l'assenza di elementi/handler interattivi nella superficie TV.
- Per backup/template inclusi nel repository esegui: `npm run audit:backup-profiles`.
- Per un backup esterno specifico esegui: `npm run inspect:backup -- ./path/to/backup.json`.

## Working rules

- Non toccare TV Mode, Referti/OCR o engine torneo se non richiesto esplicitamente.
- Se tocchi TV Mode: mantienilo read-only, zero-click, 16:9 safe e preferisci patch locali in `TvView.tsx`, `TvSimpleView.tsx`, `TvBracketView.tsx`, `TvScorersView.tsx`, `PublicTvShell.tsx`.
- Usa fallback safe per dati mancanti e mantieni compatibilità con backup legacy.
- Preferisci modifiche locali ai componenti/servizi già esistenti invece di introdurre nuovi layer.
- `components/TournamentBracket.tsx`: il fallback con `truncate` resta intenzionale quando `wrapTeamNames` è `false`;
- `components/HallOfFame.tsx`: i record/cards dell'Albo d'Oro vanno ordinati per data torneo discendente quando disponibile; usare l'anno solo come fallback legacy. prima di cambiare il default verifica gli usi reali del prop in TV/Public/Admin.
- `components/AdminDashboard.tsx`: l’accesso Admin richiede una sessione Supabase Auth reale; l’autorizzazione remota resta separata e usa `public.admin_users` / `public.flbp_is_admin()`. Non reintrodurre gate locali placeholder nel client.
- `components/admin/tabs/TournamentEditorTab.tsx`: il pool editor può creare squadre nuove al volo e, se il Round 1 è pieno e il bracket non è partito, può espandere il tabellone con un turno preliminare vuoto senza alterare BYE/TBD o l’auto-advance.

- I18n coverage: esegui `npm run check:i18n` quando aggiungi o rinomini chiavi in `services/i18n/*.ts`. La copertura chiavi deve restare allineata a `services/i18n/it.ts`.
