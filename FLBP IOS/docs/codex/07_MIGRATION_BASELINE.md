# Migration Baseline

chat non affidabile, seguo il repository.

## Baseline verificata
- prodotto reale: web React/Vite/TypeScript in `FLBP ONLINE/`
- view verificate: `home`, `leaderboard`, `hof`, `tournament`, `tournament_detail`, `admin`, `referees_area`
- TV projections verificate: `groups`, `groups_bracket`, `bracket`, `scorers`
- regole hard verificate: BYE invisibili in UI, TBD placeholder, TV read-only, OCR/referti fuori scope

## Baseline iOS dopo questo passaggio
- progetto Xcode reale
- client pubblico Supabase reale
- Home/Tournament list/detail/Leaderboard/Hall of Fame cablate
- dettaglio torneo con sezione Turni read-only cablata sui dati pubblici reali
- TV mode read-only cablato sulle stesse projection pubbliche del web
- `admin` e `referees_area` protetti a livello base, ma non completi
- nessun OCR/referti nativi ancora migrato
