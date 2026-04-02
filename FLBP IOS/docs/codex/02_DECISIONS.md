# iOS — Decisions

chat non affidabile, seguo il repository.

## Decisioni correnti
- usare gli stessi endpoint pubblici Supabase del web, senza backend mobile separati
- mantenere `tournament_detail` come child flow, con ref `{ id, isLive }`
- trattare `admin` e `referees_area` come route protette minime, senza inventare dashboard/referti completi
- migrare prima tutta la surface pubblica verificabile: Home, Archivio, Dettaglio, Turni, TV, Leaderboard, Hall of Fame
- derivare i turni dal bundle pubblico reale usando `refTables` del torneo o fallback safe `8`
- mantenere il TV nativo read-only con le stesse projection `groups`, `groups_bracket`, `bracket`, `scorers`
- introdurre un adapter protetto del torneo live prima di tentare scritture arbitri native, per evitare logica UI sparsa
- introdurre un report draft arbitri read-only prima di qualsiasi save remoto, così il contratto match/giocatori/PT/SF resta coerente col web
- non forzare il save referee sul backend legacy finché il canale remoto richiede `AppState` intero e il native dispone solo dello stato pubblico sanificato
- riusare le tabelle admin già esistenti (`app_supabase_usage_daily`, `public_site_views_daily`) per arricchire la dashboard nativa in sola lettura prima di tentare tool Admin con scritture

## Tradeoff accettati
- niente scritture admin native in questo checkpoint
- niente OCR/referti nativi in questo checkpoint
- persistenza locale solo come cache read-only dei dataset pubblici
- route protette consultative sì, ma nessuna mutazione remota finché l'adapter dello stato live non è stabile
- se un torneo pubblico non ha match/stats o ha solo placeholder, la UI mostra fallback safe
