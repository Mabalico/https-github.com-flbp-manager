# Android — Worklog

chat non affidabile, seguo il repository.

## 2026-03-27
- verificato `FLBP ONLINE/App.tsx` come sorgente delle route pubbliche e del child flow `tournament_detail`
- verificato `FLBP ONLINE/services/supabasePublic.ts` come contratto dati pubblico reale
- introdotto `NativePublicApi.kt` come layer dati pubblico nativo
- cablate Home, Tournament list/detail, Leaderboard e Hall of Fame in Compose
- aggiunto TV mode read-only con projection `groups`, `groups_bracket`, `bracket`, `scorers`
- aggiunta cache locale read-only per catalogo, leaderboard, hall of fame e bundle torneo
- aggiunta fondazione auth nativa Admin e Referees via Supabase Auth / RPC

## 2026-03-28
- aggiunto il mapping `refTables` nel contratto torneo pubblico
- introdotta la sezione `Turns` nel dettaglio torneo Android
- i turni sono filtrabili (`All`, `Live`, `Next`, `Played`, `TBD`) e restano read-only
- aggiunto dettaglio match read-only dal dettaglio torneo
- build Android verificata ancora con `:app:assembleDebug`
- puliti warning Kotlin della cache JSON sui receiver nullable
- aggiunta overview Admin consultativa con snapshot `workspace_state/public_workspace_state`
- aggiunto monitor live consultativo in Admin con conteggi team/match/turni
- aggiunto monitor arbitri consultativo con `Turn monitor`, `TBD blocked` e blocchi live/next
- build Android verificata di nuovo green con il blocco protetto aggiornato
- introdotto `NativeProtectedTournamentSnapshot` / `NativeProtectedMatchBrief` come adapter del live
- collegati briefing match e dettaglio match dalla route arbitri protetta
- introdotto `NativeProtectedReportDraft` per allineare il form arbitri web in modalità read-only
- la route arbitri mostra ora squadre, giocatori, PT/SF seedati dalle stats pubblicate e score derivato
- introdotto `NativeProtectedReportSaveDraft` per rendere esplicito il delta match/stats e la readiness locale al save
- documentato nel codice/UI che il backend referee attuale non è ancora safe per native perché accetta lo snapshot `AppState` intero
- aggiunta apertura referto tramite codice match con lo stesso comportamento del web: errori espliciti, scelta manuale sui codici duplicati e selezione diretta del match valido
- build Android verificata di nuovo green con `:app:assembleDebug` dopo il cablaggio del lookup codice
- estesi i team pubblici con i flag arbitro (`player1_is_referee`, `player2_is_referee`, `is_referee`) anche nel cache layer locale
- aggiunta selezione identità arbitro nella route protetta, con roster derivato dal bundle pubblico e fallback manuale locale
- aperura match/referto ora bloccata finché non è stata scelta un'identità arbitro sul device
- persistenza locale per torneo della scelta arbitro, coerente con il flusso web che ricorda il referee corrente sul client
- build Android verificata ancora green con `:app:assembleDebug` dopo il cablaggio dell'identità arbitro
- trasformato il report draft arbitri da sola lettura a form editabile locale con input PT/SF per giocatore
- aggiunti reset ai dati pubblicati e azzeramento rapido del form, con ricalcolo immediato di score, winner e save draft
- build Android verificata di nuovo green con `:app:assembleDebug` dopo il cablaggio del form editabile
- estesa la route Admin con monitor traffico Supabase read-only sul billing cycle corrente
- il monitor traffico legge `app_supabase_usage_daily`, mostra totale ciclo, residuo su budget 5 GB, prossimo reset e breakdown per bucket
- build Android verificata ancora green con `:app:assembleDebug` dopo il cablaggio del traffico admin
- estesa anche la route Admin con riepilogo visualizzazioni pubbliche ultimi 30 giorni da `public_site_views_daily`
- il riepilogo visualizzazioni mostra totale, media giornaliera e giorno di picco, sempre in sola lettura
- preparato nel repo web anche il backend additivo `flbp_referee_pull_live_state(...)`, senza toccare le RPC live gia' in uso
- documentato che la nuova RPC non e' necessaria ora per il web e resta da applicare solo quando si vorra' abilitare il path nativo di save arbitri
- aggiunto anche il wrapper nativo Android `pullRefereeLiveState(...)`
- la route Android `referees_area` ora prova a usarlo dopo la verifica password, ma resta compatibile se la migration non e' ancora applicata sul progetto Supabase reale
- aggiunta la route pubblica `player_area` nell'app Android
- introdotto `NativePlayerPreviewStore` con account preview locale, profilo giocatore, call state locale e persistenza device-side
- aggiunti risultati personali e live status giocatore derivati da leaderboard, Hall of Fame e bundle live pubblico
- aggiunto bypass password arbitri quando il profilo giocatore collegato coincide con un arbitro del live
- aggiunta UI Android `PlayerAreaScreen` con login/register preview, profilo, risultati, stato live, alert di chiamata e stato attivazione
- build Android verificata ancora green con `:app:assembleDebug` dopo il cablaggio di `player_area`

## 2026-03-29
- riallineate le etichette native da Points/PT a Baskets/CAN quando il dato rappresenta canestri di partita
- aggiunta formattazione coerente delle identita' giocatore: data completa dd/MM/yyyy, anno a quattro cifre, nessun badge ND
- allineata anche la route protetta arbitri con intestazioni e testi coerenti al web per canestri/soffi
- aggiunti warning read-only `Possible alias` su leaderboard, Hall of Fame, dettaglio torneo e player area
- il warning scatta su differenze di maiuscole/minuscole o punteggiatura, ordine invertito nome/cognome e distanza fino a 3 lettere su nome o cognome a parita' dell'altra componente
- aggiunta in Hall of Fame una vista `Titled players` con aggregazione stabile per nome normalizzato, cosi' la stessa persona non viene piu' spezzata tra titolo squadra e premi individuali nella UI nativa

## 2026-03-30
- riallineata `player_area` Android al nuovo criterio account: email reale al posto del vecchio "account name"
- documentato in UI che il recupero password corretto e' via reset email e non via invio password
- annotato anche lato Android che il reset live resta bloccato finche' non viene collegato un mittente email amministratore reale / SMTP reale
- estesa la registrazione preview Android con `First name`, `Last name` e `Birth date`, pronti per salvare subito il profilo collegato quando completi
- aggiunta in Admin una sezione nativa `Player accounts` preview-only, derivata dal player store locale e allineata al tab web `Account giocatori`
- il catalogo Admin player mostra filtro provider, ricerca, metadati account, risultati sintetici e modifica locale di email/profilo
- build Android verificata di nuovo green con `:app:assembleDebug` dopo il cablaggio della sezione Admin player accounts
- riallineata la lettura dati pubblica al nuovo modello del web: `public_workspace_state` come fonte unica per catalogo, dettaglio torneo, leaderboard e Hall of Fame
- eliminato il wiring nativo che combinava tabelle pubbliche diverse (`public_tournaments`, `public_tournament_*`, `public_career_leaderboard`, `public_hall_of_fame_entries`)
- aggiornati i testi UI per dichiarare esplicitamente la single source of truth pubblica

## 2026-04-02
- chiuso lato web il wiring additivo live per `player_area`, `Account giocatori`, chiamate squadra e `pullRefereeLiveState(...)`, lasciando Android come prossimo consumer di quel backend una volta applicate le migration reali
- allineata la documentazione Android: i wrapper/public flow restano coerenti col modello DB-first e il prossimo cablaggio nativo dovra' appoggiarsi alle stesse tabelle/RPC (`player_app_profiles`, `player_app_devices`, `player_app_calls`, `flbp_admin_list_player_accounts`, `flbp_referee_pull_live_state`)

## 2026-04-03
- riallineata la shell pubblica Android al linguaggio visivo del web senza perdere la natura nativa Compose
- top bar, hero home e cards pubbliche adesso usano palette FLBP, gerarchia piu' marcata e copy meno "checkpoint"
- aggiunta una scorciatoia esplicita a `player_area` dalla home, accanto a tornei, storico e Hall of Fame
- lista tornei Android riallineata alla direzione visiva del web con hero archivio/live e card piu' coerenti al sito
- corretto il parsing delle date pubbliche lato Android: `hallOfFame` e i dataset collegati ora accettano sia `yyyy-MM-dd` sia timestamp completi senza rompere l'intera projection
- aggiunto anche un fallback parziale su `fetchPublicProjection()`, cosi' un errore in una sezione pubblica non svuota tutta la home
- aggiunto il watermark del logo FLBP nella hero home Android usando l'asset del web portato in `res/drawable-nodpi`

## 2026-04-03
- riallineata la schermata Android `player_area` non autenticata a un funnel piu' chiaro: scelta iniziale del provider, CTA primaria `Continue with email` e form email/password raccolto in un blocco dedicato
- mantenuta la stessa logica preview locale / live-ready gia' presente, senza introdurre scorciatoie incoerenti col backend reale
- verificata di nuovo la build Android con `:app:assembleDebug`
- irrobustito `NativePlayerPreviewStore` contro dati locali corrotti o orfani: sessione, account, profili e call preview vengono riparati automaticamente quando possibile
- aggiunto bootstrap safe della `player_area` Android, cosi' il render non deve piu' cadere se il payload locale preview e' incoerente sul device
- aggiunta anche una CTA esplicita `Reset local preview data` nella `player_area`, con pulizia del bypass arbitri se non piu' coerente col profilo locale
- sostituita anche l'icona launcher Android con il logo FLBP rotondo preso dal set icone web, con riferimenti espliciti `android:icon` e `android:roundIcon` nel manifest
- rinominata anche l'app Android lato utente in `FLBP`; il nome esteso resta nel branding UI, mentre il launcher usa il nome corto per restare pulito
- completata la chiusura pragmatica della parita' grafica/funzionale: Android ora usa di default una shell nativa con FLBP ONLINE mobile in WebView full-screen
- il percorso Compose legacy resta nel pacchetto solo come fallback tecnico quando il web mirror non si carica
- build Android verificata green anche dopo l'introduzione del web mirror (`:app:assembleDebug`)
- trasformata anche l'icona launcher Android in adaptive icon reale (`mipmap-anydpi-v26` + foreground dedicato), cosi' il logo FLBP puo' occupare meglio lo spazio utile sui launcher moderni
- riallineata di nuovo l'adaptive icon Android usando il logo completo nel background layer, cosi' il cerchio esterno non viene piu' ridotto dal foreground inset del launcher
- aggiunto il flag `?native_shell=android` al web mirror primario, cosi' la shell nativa puo' dichiararsi esplicitamente al frontend web
- corretto il rendering WebView delle schermate storiche (`Leaderboard`, `HallOfFame`, `TournamentLeaderboard`): in shell nativa non usano piu' contenitori interni con `max-height + overflow + sticky header` che lasciavano le tabelle visivamente vuote su Android
- allineato anche `GroupStandingsTable` al comportamento shell-aware: niente `fitToWidth` scalato nella shell nativa, meglio scorrimento regolare e contenuto sempre visibile
- rebuild Android verificata green con `:app:assembleDebug` e reinstallazione reale sul device dopo il fix del web mirror
