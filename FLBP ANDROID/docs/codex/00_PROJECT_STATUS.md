# Android — Project Status

chat non affidabile, seguo il repository.

## Stato attuale Android
- base nativa reale in Kotlin + Jetpack Compose: SI
- Home pubblica data-driven: SI
- Archivio tornei pubblico data-driven: SI
- Dettaglio torneo pubblico data-driven: SI
- sezione Turni read-only nel dettaglio torneo: SI
- TV mode read-only: SI
- Leaderboard data-driven: SI
- Hall of Fame data-driven: SI
- riepilogo nativo `giocatori titolati` Hall of Fame con aggregazione stabile per identita' nome: SI
- Player Area preview locale: SI
- cache locale read-only dei dataset pubblici: SI
- fonte pubblica primaria unificata via `public_workspace_state`: SI
- `tournament_detail` child flow con fallback safe: SI
- login protetto nativo base per `admin`: SI
- login protetto nativo base per `referees_area`: SI
- tentativo compatibile di `pull live state` arbitri dopo il login RPC, con migration additiva ora applicata sul backend reale: SI
- overview Admin consultativa read-only: SI
- monitor traffico Admin read-only sul billing cycle: SI
- monitor visualizzazioni pubbliche ultimi 30 giorni: SI
- sezione Admin `Account giocatori` preview locale con filtro provider/ricerca/edit: SI
- dashboard arbitri consultativa read-only: SI
- report draft arbitri editabile in locale dal live bundle: SI
- save draft arbitri locale con validazione: SI
- apertura referto da codice match con gestione duplicati: SI
- selezione identità arbitro da roster pubblico + fallback manuale + persistenza locale: SI
- account giocatore opzionale preview-only con profilo locale: SI
- email reale come identificatore del preview account giocatore: SI
- campi `First name` / `Last name` / `Birth date` gia' presenti nel flusso di registrazione preview: SI
- riparazione safe dei dati locali corrotti/orfani della `player_area` preview: SI
- reset esplicito dei dati preview locali della `player_area` sul device: SI
- risultati personali e live status giocatore derivati dai dataset pubblici: SI
- segnalazione nativa `Possible alias` su classifiche, albo, dettaglio torneo e player area: SI
- alert di chiamata squadra preview-only sul device: SI
- bypass password arbitri se il profilo giocatore collegato e' arbitro del live: SI
- dashboard Admin nativa completa: NO
- referti/OCR nativi completi: NO
- build locale verificata qui: SI, `:app:assembleDebug`

## Verificato davvero
- source of truth web in `FLBP ONLINE/App.tsx`, `types.ts`, `services/supabasePublic.ts`
- regole hard in `FLBP ONLINE/services/tournamentEngine.ts`
- shell pubbliche Android in `FLBPManagerSuiteApp.kt`, `AndroidPublicUi.kt`, `AndroidPublicUiDetails.kt`, `AndroidPublicLogic.kt`
- TV Android in `AndroidTvUi.kt`
- rete pubblica Android in `NativePublicApi.kt`
- derivazione catalogo/leaderboard/HoF/bundle dal singolo snapshot pubblico in `NativePublicApi.kt`
- cache Android in `NativePublicCache.kt`
- route protette Android in `NativeProtectedApi.kt` e `AndroidProtectedUi.kt`
- overview Admin con snapshot `workspace_state/public_workspace_state` e monitor live consultativo
- monitor traffico Admin read-only da `app_supabase_usage_daily`, con budget 5 GB e breakdown bucket
- monitor visualizzazioni pubbliche ultimi 30 giorni da `public_site_views_daily`
- sezione Admin `Account giocatori` preview-only, derivata dal player store locale e coerente con il tab web `Account giocatori`
- monitor arbitri con riepilogo turni/tavoli e upcoming playable matches
- report draft arbitri con seed stats e score derivato, senza save remoto
- form arbitri editabile localmente con input PT/SF, reset ai dati pubblicati e azzeramento rapido
- save draft arbitri con ragione di blocco esplicita: il backend attuale richiede ancora lo snapshot `AppState` completo
- lookup da codice referto allineato al web, con errori empty/not-found/BYE/TBD e scelta match sui codici duplicati
- derivazione roster arbitri dai flag `player1_is_referee` / `player2_is_referee` / `is_referee` del bundle pubblico
- selezione arbitro locale prima dell'apertura referto, con fallback manuale e persistenza per torneo sul device
- `player_area` nativa con account preview locale, profilo, risultati personali, stato live, call state e route verso `referees_area`
- bootstrap safe della `player_area` con riparazione di sessioni/account/profili/call orfani o corrotti
- bypass password arbitri sul device quando il profilo giocatore collegato coincide con un arbitro del torneo live

## Rischi aperti reali
- smoke test visivo su emulatore/device ancora da chiudere del tutto
- nessun signing release / `.aab` generato ancora
- scritture Admin, scritture arbitri, referti e OCR restano non migrati nativamente
- backend SQL `player/call` ora applicato sul progetto Supabase reale, ma il live completo resta da chiudere su:
  - provider auth reali
  - registrazione device/push reali
  - wiring native runtime oltre la preview locale
- reset password reale ancora non attivo: serve collegare auth live + mittente email amministratore reale / SMTP reale
- la `player_area` resta preview locale, ma ora ha fallback safe e reset dati esplicito per ridurre i blocchi lato device
