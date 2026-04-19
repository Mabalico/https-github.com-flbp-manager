# iOS — Project Status

chat non affidabile, seguo il repository.

## Stato strategico

Runtime nativo dedicato transitorio/di riferimento. Il target mobile primario e' il wrapper Capacitor documentato in `FLBP ONLINE/docs/MOBILE_STRATEGY.md` e `FLBP ONLINE/docs/MOBILE_WRAPPER.md`.

Questo runtime non e' dichiarato obsoleto: resta utile per confronto push, fallback tecnico e rollback finche' la parita' wrapper non e' verificata su device reali.

Questo progetto resta nel repo per confronto, fallback e rollback finche' la release wrapper non e' verificata e distribuibile.

## Stato attuale iOS
- base nativa reale in Swift + SwiftUI: SI
- shell nativa primaria con FLBP ONLINE mobile in WKWebView full-screen: SI a sorgente
- parita' grafica e funzionale user-facing col web mobile: SI a sorgente, via web mirror primario
- percorso SwiftUI legacy preservato come fallback tecnico locale: SI a sorgente
- Home pubblica data-driven: SI
- shell visiva pubblica riallineata al web su top bar, hero home e cards tornei: SI a sorgente
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
- riapertura app forzata su Home invece che sull'ultima schermata pubblica: SI
- bridge nativo push verso il web mirror (`window.__flbpNativePushBridge` via WKWebView): SI a sorgente
- registrazione reale del device iOS su `player_app_devices` con `device_token` APNs quando disponibile: SI a sorgente
- ricezione push iOS via `UIApplicationDelegate` + `UNUserNotificationCenter`: SI a sorgente
- risultati personali e live status giocatore derivati dai dataset pubblici: SI
- segnalazione nativa `Possible alias` su classifiche, albo, dettaglio torneo e player area: SI
- alert di chiamata squadra preview-only sul device: SI
- bypass password arbitri se il profilo giocatore collegato e' arbitro del live: SI
- dashboard Admin nativa completa senza web mirror: NO
- referti/OCR nativi completi senza web mirror: NO
- build locale verificata qui: NO

## Verificato davvero
- source of truth web in `FLBP ONLINE/App.tsx`, `types.ts`, `services/supabasePublic.ts`
- regole hard in `FLBP ONLINE/services/tournamentEngine.ts`
- shell pubbliche iOS in `ContentView.swift` e `NativePublicScreens.swift`
- shell primaria iOS in `NativeWebMirrorView.swift`, che carica `https://flbp-pages.pages.dev` a schermo pieno e lascia il percorso SwiftUI legacy come fallback
- TV iOS in `ContentView.swift` e `NativePublicScreens.swift`
- rete pubblica iOS in `NativePublicData.swift`
- derivazione catalogo/leaderboard/HoF/bundle dal singolo snapshot pubblico in `NativePublicData.swift`
- cache iOS in `NativePublicCache.swift`
- route protette iOS in `NativeProtectedData.swift` e `NativeProtectedScreens.swift`
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
- reset di bootstrap alla Home all'avvio per evitare resume impliciti dell'ultima route pubblica
- bypass password arbitri sul device quando il profilo giocatore collegato coincide con un arbitro del torneo live
- wiring progetto in `FLBPManagerSuite.xcodeproj/project.pbxproj`
- `NativePushRegistry.swift` aggiunto al progetto con entitlements APNs e bridge WKWebView
- `NativeProtectedData.registerPlayerDevice(...)` ora invia anche `device_token` reale al backend quando disponibile

## Rischi aperti reali
- da questa macchina non posso certificare compile/run Xcode
- nessun signing release / `.ipa` generato ancora
- il fallback nativo puro continua a non coprire scritture Admin, scritture arbitri, referti e OCR
- backend SQL `player/call` ora applicato sul progetto Supabase reale, ma il live completo resta da chiudere su:
  - deploy funzione Edge `player-call-push`
  - secret/config APNs reali
  - compile/signing Xcode per attivare davvero il path APNs
  - provider auth reali
  - registrazione device/push reali
  - wiring native runtime oltre la preview locale quando non passi dal web mirror primario
- reset password reale ancora non attivo: serve collegare auth live + mittente email amministratore reale / SMTP reale
- la `player_area` legacy resta preview locale, ma ora ha fallback safe e reset dati esplicito per ridurre i blocchi lato device
- la parita' primaria dipende dal raggiungimento dell'istanza web `flbp-pages.pages.dev`
