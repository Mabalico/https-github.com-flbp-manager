# Android — Decisions

chat non affidabile, seguo il repository.

## Decisioni correnti
- usare gli stessi endpoint pubblici Supabase del web, senza backend mobile separati
- mantenere `tournament_detail` come child flow, con ref minimo `{ id, isLive }`
- trattare `admin` e `referees_area` come route placeholder invece di simulare auth/tooling nativo inesistente
- migrare prima tutta la surface pubblica read-only verificabile: Home, Tournament list/detail, Leaderboard, Hall of Fame

## Tradeoff accettati
- niente persistenza dati offline oltre allo stato schermata minimo
- niente OCR/referti nativi in questo passaggio
- niente TV nativo in questo passaggio
- niente inventari mock: se un torneo pubblico non ha match o stats, la UI mostra fallback safe
