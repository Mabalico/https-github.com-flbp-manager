# iOS — Worklog

chat non affidabile, seguo il repository.

## 2026-03-27
- verificato `FLBP ONLINE/App.tsx` come sorgente delle route pubbliche e del child flow `tournament_detail`
- verificato `FLBP ONLINE/services/supabasePublic.ts` come contratto dati pubblico reale
- introdotto `NativePublicData.swift` come layer dati pubblico nativo
- cablate Home, Tournament list/detail, Leaderboard e Hall of Fame in SwiftUI
- aggiunto TV mode read-only con projection `groups`, `groups_bracket`, `bracket`, `scorers`
- aggiunta cache locale read-only per catalogo, leaderboard, hall of fame e bundle torneo
- aggiunta fondazione auth nativa Admin e Referees via Supabase Auth / RPC

## 2026-03-28
- aggiunto il mapping `refTables` nel contratto torneo pubblico
- introdotta la sezione `Turns` nel dettaglio torneo iOS
- i turni sono filtrabili (`All`, `Live`, `Next`, `Played`, `TBD`) e restano read-only
- aggiunto dettaglio match read-only dal dettaglio torneo
- riallineati i documenti `docs/codex` allo stato reale del codice
- aggiunta overview Admin consultativa con snapshot `workspace_state/public_workspace_state`
- aggiunto monitor live consultativo in Admin con conteggi team/match/turni
- aggiunto monitor arbitri consultativo con `Turn monitor`, `TBD blocked` e blocchi live/next
- introdotto `NativeProtectedTournamentSnapshot` / `NativeProtectedMatchBrief` come adapter del live
- collegati briefing match e dettaglio match dalla route arbitri protetta
- introdotto `NativeProtectedReportDraft` per allineare il form arbitri web in modalità read-only
- la route arbitri mostra ora squadre, giocatori, PT/SF seedati dalle stats pubblicate e score derivato
- introdotto `NativeProtectedReportSaveDraft` per rendere esplicito il delta match/stats e la readiness locale al save
- documentato nel codice/UI che il backend referee attuale non è ancora safe per native perché accetta lo snapshot `AppState` intero
- aggiunta apertura referto tramite codice match con lo stesso comportamento del web: errori espliciti, scelta manuale sui codici duplicati e selezione diretta del match valido
- estesi i team pubblici con i flag arbitro (`player1_is_referee`, `player2_is_referee`, `is_referee`) in modo compatibile anche col cache locale
- aggiunta selezione identità arbitro nella route protetta, con roster derivato dal bundle pubblico e fallback manuale locale
- apertura match/referto ora bloccata finché non è stata scelta un'identità arbitro sul device
- persistenza locale per torneo della scelta arbitro, coerente con il flusso web che ricorda il referee corrente sul client
- trasformato il report draft arbitri da sola lettura a form editabile locale con input PT/SF per giocatore
- aggiunti reset ai dati pubblicati e azzeramento rapido del form, con ricalcolo immediato di score, winner e save draft
- estesa la route Admin con monitor traffico Supabase read-only sul billing cycle corrente
- il monitor traffico legge `app_supabase_usage_daily`, mostra totale ciclo, residuo su budget 5 GB, prossimo reset e breakdown per bucket
- estesa anche la route Admin con riepilogo visualizzazioni pubbliche ultimi 30 giorni da `public_site_views_daily`
- il riepilogo visualizzazioni mostra totale, media giornaliera e giorno di picco, sempre in sola lettura
- preparato nel repo web anche il backend additivo `flbp_referee_pull_live_state(...)`, senza toccare le RPC live gia' in uso
- documentato che la nuova RPC non e' necessaria ora per il web e resta da applicare solo quando si vorra' abilitare il path nativo di save arbitri
- aggiunto anche il wrapper nativo iOS `pullRefereeLiveState(...)`
- la route iOS `referees_area` ora prova a usarlo dopo la verifica password, ma resta compatibile se la migration non e' ancora applicata sul progetto Supabase reale
- aggiunta la route pubblica `player_area` nell'app iOS
- introdotto `NativePlayerPreviewStore` con account preview locale, profilo giocatore, call state locale e persistenza device-side
- aggiunti risultati personali e live status giocatore derivati da leaderboard, Hall of Fame e bundle live pubblico
- aggiunto bypass password arbitri quando il profilo giocatore collegato coincide con un arbitro del live
- aggiunta UI SwiftUI `PlayerAreaScreenView` con login/register preview, profilo, risultati, stato live, alert di chiamata e stato attivazione

## 2026-03-29
- riallineate le etichette native da Points/PT a Baskets/CAN quando il dato rappresenta canestri di partita
- aggiunta formattazione coerente delle identita' giocatore: data completa dd/MM/yyyy, anno a quattro cifre, nessun badge ND
- allineata anche la route protetta arbitri con intestazioni e testi coerenti al web per canestri/soffi
- aggiunti warning read-only `Possible alias` su leaderboard, Hall of Fame, dettaglio torneo e player area
- il warning scatta su differenze di maiuscole/minuscole o punteggiatura, ordine invertito nome/cognome e distanza fino a 3 lettere su nome o cognome a parita' dell'altra componente
- aggiunta in Hall of Fame una vista `Titled players` con aggregazione stabile per nome normalizzato, cosi' la stessa persona non viene piu' spezzata tra titolo squadra e premi individuali nella UI nativa

## 2026-03-30
- riallineata `player_area` iOS al nuovo criterio account: email reale al posto del vecchio "account name"
- documentato in UI che il recupero password corretto e' via reset email e non via invio password
- annotato anche lato iOS che il reset live resta bloccato finche' non viene collegato un mittente email amministratore reale / SMTP reale
- estesa la registrazione preview iOS con `First name`, `Last name` e `Birth date`, pronti per salvare subito il profilo collegato quando completi
- aggiunta in Admin una sezione nativa `Player accounts` preview-only, derivata dal player store locale e allineata al tab web `Account giocatori`
- il catalogo Admin player mostra filtro provider, ricerca, metadati account, risultati sintetici e modifica locale di email/profilo
- riallineata la lettura dati pubblica al nuovo modello del web: `public_workspace_state` come fonte unica per catalogo, dettaglio torneo, leaderboard e Hall of Fame
- eliminato il wiring nativo che combinava tabelle pubbliche diverse (`public_tournaments`, `public_tournament_*`, `public_career_leaderboard`, `public_hall_of_fame_entries`)
- aggiornati i testi UI per dichiarare esplicitamente la single source of truth pubblica

## 2026-04-02
- chiuso lato web il wiring additivo live per `player_area`, `Account giocatori`, chiamate squadra e `pullRefereeLiveState(...)`, lasciando iOS come prossimo consumer di quel backend una volta applicate le migration reali
- allineata la documentazione iOS: il prossimo cablaggio nativo dovra' appoggiarsi alle stesse tabelle/RPC (`player_app_profiles`, `player_app_devices`, `player_app_calls`, `flbp_admin_list_player_accounts`, `flbp_referee_pull_live_state`) gia' preparate e usate dal web quando disponibili

## 2026-04-03
- riallineata la schermata iOS `player_area` non autenticata allo stesso funnel del web: provider social mostrati in alto, CTA email in evidenza e form email/password raccolto sotto
- mantenuta la distinzione tra preview locale e rollout live, con note esplicite su reset password e mittente amministratore reale ancora da configurare
- il sorgente iOS e' stato aggiornato in parita' funzionale con Android/web per questo blocco UI, in attesa della compile reale su Mac/Xcode
- irrobustito `NativePlayerPreviewStore` contro dati locali corrotti o orfani: sessione, account, profili e call preview vengono riparati automaticamente quando possibile
- aggiunto bootstrap safe della `player_area` iOS, cosi' il render non deve piu' dipendere da un payload locale preview coerente al 100%
- aggiunta anche una CTA esplicita `Reset local preview data` nella `player_area`, con pulizia del bypass arbitri se non piu' coerente col profilo locale
- riallineata anche la shell pubblica iOS alla direzione visiva del web: top bar FLBP, hero home, shortcut cards e lista tornei con palette e gerarchia coerenti
- aggiunta dalla home una scorciatoia esplicita a `player_area`, cosi' il funnel pubblico nativo resta piu' vicino alla struttura del sito
- corretto anche a sorgente iOS il parsing delle date pubbliche per evitare che timestamp completi rompano Hall of Fame e projection pubblica
- aggiunto il fallback parziale su `fetchPublicProjection()` e il watermark logo nella hero home iOS tramite `HeroLogo.imageset`
- popolato anche `AppIcon.appiconset` con il logo FLBP rotondo, cosi' il branding launcher iOS resta allineato ad Android e al set icone del web
