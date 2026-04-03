# FLBP Android native track

chat non affidabile, seguo il repository.

Questa cartella contiene un'app Android nativa reale in Kotlin + Jetpack Compose, allineata alla surface pubblica di `FLBP ONLINE`:
- Home
- Archivio tornei
- Dettaglio torneo pubblico
- Player Area preview locale
- Turni live/read-only nel dettaglio torneo
- TV mode read-only
- Leaderboard
- Hall of Fame
- riepilogo `giocatori titolati` Hall of Fame con aggregazione stabile per identita' nome giocatore
- cache locale read-only dei dataset pubblici
- fondazione protetta reale per `admin` e `referees_area`

Stato attuale reale:
- usa `public_workspace_state` come fonte pubblica primaria, coerente con FLBP ONLINE
- mantiene `tournament_detail` come child flow con ref `{ id, isLive }`
- deriva catalogo, dettaglio torneo, leaderboard e Hall of Fame dallo stesso snapshot pubblico per evitare rimbalzi tra fonti diverse
- espone la sezione Turni con filtri `All/Live/Next/Played/TBD` e dettaglio match read-only
- apre il TV mode read-only dal dettaglio torneo usando le projection pubbliche reali
- espone in Hall of Fame sia i record grezzi sia il riepilogo `titled players`, aggregato in modo stabile per evitare split della stessa persona tra titolo squadra e premi individuali
- bootstrap da cache locale quando la rete non ha ancora risposto
- rispetta i vincoli hard BYE/TBD lato rendering pubblico
- usa login admin reale via Supabase Auth + verifica `admin_users`
- usa verifica password arbitri reale via RPC `flbp_referee_auth_check`
- dopo il login arbitri prova anche il `pull live state` additivo via `flbp_referee_pull_live_state(...)` quando la migration e' disponibile, senza bloccare il flusso sui progetti che non l'hanno ancora applicata
- espone anche `player_area` in preview locale con account opzionale, profilo giocatore, risultati personali, stato live e alert di chiamata simulati sul device
- usa una email reale come identificatore del preview account giocatore sul device
- nella Player Area preview mostra anche `First name` / `Last name` / `Birth date` gia' in registrazione, coerente con il web
- mantiene `Nome` / `Cognome` separati lato UI dove serve, ma continua a derivare l'identita' canonica del giocatore nel formato interno stabile
- ripara automaticamente sessioni/account/profili/call preview corrotti o orfani trovati sul device
- espone anche un reset esplicito dei dati locali della `player_area`, cosi' il fallback preview non deve bloccare il render
- documenta il recupero password come reset via email, non invio password; il live reset resta backend-pending finche' non viene collegato un mittente amministratore reale / SMTP reale
- se il profilo giocatore collegato e' anche arbitro del live, apre `referees_area` senza password torneo sul device
- espone una overview Admin consultativa con stato snapshot e live tournament monitor
- espone anche il monitor traffico Supabase read-only per il billing cycle corrente, leggendo `app_supabase_usage_daily`
- espone anche il riepilogo visualizzazioni pubbliche degli ultimi 30 giorni da `public_site_views_daily`
- espone anche `Account giocatori` lato Admin come catalogo preview locale con filtro provider, ricerca e modifica email/profilo
- espone una dashboard arbitri consultativa con turn monitor e upcoming matches
- usa un protected live adapter per normalizzare i match briefing del torneo live
- espone un report draft arbitri editabile in locale con squadre, giocatori, PT/SF seedati dalle stats pubblicate e score derivato
- espone anche il save draft arbitri con validazione locale e blocco backend esplicito
- permette anche di aprire un referto tramite codice match, con gestione dei duplicati e blocchi BYE/TBD coerenti con il web
- espone anche la scelta identità arbitro sul device, derivata dai flag arbitro dei team pubblici con fallback manuale locale e persistenza locale per torneo
- mantiene Admin dashboard completa e OCR/referti ancora fuori scope nativo

File chiave:
- `app/src/main/java/com/flbp/manager/suite/NativePublicApi.kt`
- `app/src/main/java/com/flbp/manager/suite/FLBPManagerSuiteApp.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidPublicUi.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidPublicUiDetails.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidPublicLogic.kt`
- `app/src/main/java/com/flbp/manager/suite/NativePublicCache.kt`
- `app/src/main/java/com/flbp/manager/suite/NativeProtectedApi.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidProtectedUi.kt`

Limiti ancora aperti:
- runtime Android non ancora confermato visivamente su emulatore/device, anche se la build debug ora è verde
- nessun OCR/referti nativo
- nessuna dashboard Admin nativa completa con scritture
- nessun export/azione admin nativa oltre alla consultazione avanzata
- reset password Admin -> player account ancora solo documentato/preparato: serve auth live + mittente amministratore reale / SMTP reale
- nessun save remoto arbitri: il delta referto è pronto lato UI, ma il backend live richiede ancora una nuova RPC additiva oppure una lettura protetta del `workspace_state` completo
- nessun backend player/call live attivato ancora: la parte account/call resta preview locale finche' le migration additive non vengono applicate sul progetto reale
