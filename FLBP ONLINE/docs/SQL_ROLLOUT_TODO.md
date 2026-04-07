# SQL / Backend rollout todo

chat non affidabile, seguo il repository.

Questo file raccoglie tutte le modifiche SQL e backend da inizio chat fino ad ora, separate tra:
- gia' applicate sul progetto reale
- preparate nel repo ma non ancora applicate
- configurazioni esterne non-SQL ancora necessarie

## Gia' applicata sul progetto reale

### Birthdate-first remote
- file: `supabase/migrations/20260326000100_birthdate_first_remote.sql`
- stato: applicata manualmente sul Supabase online
- scopo:
  - aggiunge `birth_date` su `integrations_scorers`
  - aggiunge `player_birth_date` su `hall_of_fame_entries`
  - aggiunge `player1_birth_date` / `player2_birth_date` su `tournament_teams`
  - riallinea i vecchi `yob` dai campi data

### Referee pull live state RPC
- file: `supabase/migrations/20260328000100_referee_pull_live_state_rpc.sql`
- stato: applicata manualmente sul Supabase online il `2026-04-02`
- scopo:
  - aggiunge `public.flbp_referee_pull_live_state(...)`
  - sblocca il pull protetto dello snapshot live completo per web/native arbitri

### Player app accounts and calls
- file: `supabase/migrations/20260328000200_player_app_accounts_and_calls.sql`
- stato: applicata manualmente sul Supabase online il `2026-04-02`
- scopo:
  - aggiunge `public.player_app_profiles`
  - aggiunge `public.player_app_devices`
  - aggiunge `public.player_app_calls`
  - aggiunge RPC `public.flbp_player_call_team(...)`
  - aggiunge RPC `public.flbp_player_ack_call(...)`
  - aggiunge RPC `public.flbp_player_cancel_call(...)`
- scopo prodotto:
  - area giocatore live
  - convocazioni squadra push/live con conferma
  - registrazione device Android/iOS/web

### Player app admin account catalog
- file: `supabase/migrations/20260330000100_player_app_admin_accounts.sql`
- stato: applicata manualmente sul Supabase online il `2026-04-02`
- scopo:
  - aggiunge `public.flbp_admin_list_player_accounts(...)`
  - popola la quinta sezione `Gestione dati -> Account giocatori`
  - rende interrogabile da Admin l'elenco unificato account / provider / profilo giocatore collegato

### Player account admin delete edge function
- file: `supabase/functions/player-account-admin/index.ts`
- stato: deployata sul Supabase online il `2026-04-07`
- scopo:
  - consente ad Admin di eliminare account giocatore live in modo protetto
  - cancella profilo collegato, registrazioni device e chiamate collegate prima della rimozione auth
  - blocca l'eliminazione di account admin protetti

## Preparata nel repo ma non ancora applicata

- nessuna migration additiva residua su questo blocco `referees/player/accounts`
- restano da applicare solo eventuali SQL future non ancora preparate per:
  - push reali
  - referti nativi con scrittura completa
  - altre estensioni backend ancora non modellate

## Wiring repo gia' chiuso in attesa del rollout SQL

- web `player_area`
  - ora usa `email/password` come percorso primario lato UI quando Supabase e' disponibile
  - registrazione reale richiede nome, cognome e data di nascita per collegare subito il profilo giocatore
  - il signup gestisce sia il caso `sessione immediata` sia il caso `conferma mail richiesta` senza rompere la UI
  - i pulsanti `Google/Facebook/Apple` sono gia' cablati verso l'OAuth di Supabase
  - mantiene fallback preview locale solo come compatibilita' se mancano auth/provider/config esterne
  - `google/facebook/apple` restano visibili ma volutamente in stato pending finche' non attiviamo i provider su Supabase
- web `Gestione dati -> Account giocatori`
  - il catalogo reale via `flbp_admin_list_player_accounts(...)` e' ora disponibile sul progetto reale
  - resta il fallback preview locale solo come rete di sicurezza
- web `ReportsTab`
  - ora puo' usare target/call reali via `player_app_profiles` / `player_app_calls`
  - il resto del flusso live dipende ancora da auth/player linking/device push
- web `RefereesArea`
  - al login arbitri puo' ora leggere lo snapshot live completo via `flbp_referee_pull_live_state(...)`
- Android / iOS `referees_area`
  - dopo il check password reale possono ora usare anche loro il `pull live state` additivo
  - restano compatibili se il runtime native non usa ancora il percorso completo

## Update batch `2026-04-07` gia' chiuso nel repo

- area giocatore web/pages
  - input password con mostra/nascondi
  - input data nascita con maschera `gg/mm/aaaa` + calendario
  - niente flash dei campi profilo provvisori mentre il profilo live si carica
  - niente errore browser su `player_app_devices`: il browser non registra device push, lo fanno solo le shell native
  - bottone header player/login piu' leggibile anche su mobile
- gestione account registrati
  - ultimo accesso mostrato come data assoluta + relativo
  - cancellazione account preview/live pronta lato UI
  - cancellazione live ora supportata dalla funzione Edge `player-account-admin`
- gestione DB online
  - `Forza sovrascrittura` resa visibile nella scheda Snapshot
  - conflitto DB spiegato meglio con percorso guidato `Ricarica dal DB -> Applica questo download`
- i18n
  - tutti i dizionari non italiani rigenerati e riallineati a `it.ts`
  - controllo `check:i18n` rinforzato per beccare mojibake e mismatch strutturali
- regola da ricordare
  - le differenze intenzionali browser/native vanno annotate: esempio attuale `player_app_devices` resta solo per Android/iOS, non per il browser web

## Push reale ora cablato nel repo

- web `player_area`
  - legge la registrazione push nativa da bridge (`nativePushBridge.ts`)
  - registra su `player_app_devices` il vero `device_token` Android/iOS quando disponibile
  - il browser web non registra piu' righe in `player_app_devices`: la tabella resta riservata alle shell native per evitare collisioni RLS inutili sul login browser
  - se il permesso push e' ancora `prompt`, prova a richiederlo una sola volta lato shell nativa
- web `ReportsTab`
  - dopo `flbp_player_call_team(...)` prova anche il dispatch push backend
  - dopo `flbp_player_cancel_call(...)` prova anche il dispatch push backend
  - eventuali errori della funzione push non rompono il flusso referti/admin
- Supabase Edge Function
  - sorgente pronto in `supabase/functions/player-call-push/index.ts`
  - verifica admin reale via JWT + tabella `admin_users`
  - legge `player_app_calls` e `player_app_devices`
  - dispatch provider-specifico:
    - Android `FCM HTTP v1`
    - iOS `APNs token auth`
- Android
  - `FLBPApplication` + `NativeFirebaseMessagingService` + `NativePushRegistry` pronti nel repo
  - web mirror espone `FLBPNativePushBridge` al frontend
  - build locale verificata con dipendenza `firebase-messaging`
- iOS
  - `NativePushRegistry.swift` + `NativeAppDelegate` + bridge `WKWebView` pronti a sorgente
  - entitlements APNs aggiunti al progetto
  - device registration live ora passa anche il vero `device_token` al backend quando disponibile

## Configurazioni esterne non-SQL ancora necessarie

- deploy funzione Edge `player-call-push` sul progetto Supabase reale
  - stato: fatto il `2026-04-07`
- helper pronto per il deploy:
  - [20260403_player_call_push_deploy.ps1](/C:/Users/marco/Desktop/sito%20react/FLBP%20MANAGER/FLBP%20ONLINE/supabase/rollouts/20260403_player_call_push_deploy.ps1)
  - [20260403_player_call_push_secrets.env.example](/C:/Users/marco/Desktop/sito%20react/FLBP%20MANAGER/FLBP%20ONLINE/supabase/rollouts/20260403_player_call_push_secrets.env.example)
- secret funzione Edge:
  - `FCM_PROJECT_ID`
    - stato: fatto il `2026-04-07`
  - `FCM_CLIENT_EMAIL`
    - stato: fatto il `2026-04-07`
  - `FCM_PRIVATE_KEY`
    - stato: fatto il `2026-04-07`
  - `APNS_TEAM_ID`
  - `APNS_KEY_ID`
  - `APNS_PRIVATE_KEY`
  - `APNS_BUNDLE_ID`
    - stato: fatto il `2026-04-07`
  - opzionale `APNS_USE_SANDBOX`
    - stato: fatto il `2026-04-07`
  - nota: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono gia' disponibili come runtime env della hosted Edge Function, non vanno impostati a mano
- Android
  - compilare con i valori veri in `app/src/main/res/values/strings.xml`:
    - `fcm_application_id`
    - `fcm_project_id`
    - `fcm_api_key`
    - `fcm_sender_id`
  - stato: fatto il `2026-04-07`
  - helper pronto per applicarli da `google-services.json`:
    - [20260403_apply_fcm_google_services.ps1](/C:/Users/marco/Desktop/sito%20react/FLBP%20MANAGER/FLBP%20ANDROID/scripts/20260403_apply_fcm_google_services.ps1)
  - package id atteso: `com.flbp.manager.suite`
- iOS
  - compile reale da Mac/Xcode
  - signing/provisioning con capability Push Notifications effettiva
  - secret APNs ancora da configurare:
    - `APNS_TEAM_ID`
    - `APNS_KEY_ID`
    - `APNS_PRIVATE_KEY`
  - bundle id atteso: `com.flbp.manager.suite`
- prodotto
  - Android e backend FCM sono quasi pronti
  - le push di chiamata squadra non sono ancora da considerare attive in produzione finche' non facciamo:
    - un test end-to-end reale Android
    - la configurazione APNs iOS
  - test operativo ancora da fare dopo il completamento dell'area giocatore:
    - registrazione primo account reale
    - collegamento profilo giocatore
    - test `chiamata squadra` end-to-end

## Regola architetturale native

- Android e iOS ora usano come percorso primario una shell nativa con web mirror full-screen di `FLBP ONLINE` (`https://flbp-pages.pages.dev`)
- il fallback nativo legacy resta nel repo solo come backup tecnico locale e come base per eventuali recuperi offline / debug
- quando tocchiamo il web, va sempre verificato se il cambiamento impatta anche:
  - il web mirror primario sulle native
  - il fallback nativo legacy ancora mantenuto nel repo

## Regola deploy web canonica

- il frontend web canonico e' **Cloudflare Pages**
- progetto canonico: `flbp-pages`
- branch di produzione canonico: `main`
- flusso canonico: `GitHub -> main -> Cloudflare Pages Git integration`
- `flbp-pages.pages.dev` e' il riferimento stabile da usare per:
  - web mirror Android
  - web mirror iOS
  - test di produzione sul frontend pubblico corrente
- il vecchio `Worker` resta solo come residuo legacy / fallback esterno temporaneo:
  - non e' piu' la fonte di verita'
  - non va piu' usato come target per nuove modifiche applicative
  - l'operativita' del progetto non deve dipendere dal suo aggiornamento

## Regole di allineamento copie web

- `FLBP ONLINE/` e' la fonte di verita' web.
- `FLBP LOCALE/` deve restare allineata a `FLBP ONLINE/` su codice, docs, SQL e script.
- Le uniche differenze consentite sono file locali di ambiente o runtime non tracciati, per esempio:
  - `.env.local`
  - `node_modules/`
  - `dist/`
  - cache / tmp locali
- Ogni modifica fatta in una delle due copie va verificata e propagata nell'altra nello stesso passaggio, salvo eccezioni deliberate e documentate.

## Configurazioni esterne non-SQL ancora necessarie

### Mittente email amministratore reale
- stato: da fare
- necessario per:
  - recupero password reale via email/reset link
  - eventuali email transazionali future
- nota:
  - non si invia mai la password in chiaro
  - si invia un link o OTP di reset
  - serve configurare un mittente email reale / SMTP reale lato Supabase Auth

### Provider auth live
- stato: da fare
- provider previsti v1:
  - `email/password`
  - `google`
  - `facebook`
  - `apple`
- decisione prodotto:
  - `instagram` resta fuori dalla v1
- nota operativa:
  - lato app/web il percorso `email/password` e' gia' il flusso primario
  - restano da completare configurazione auth esterna, reset password con mittente reale e provider social
  - appena i provider vengono accesi in Supabase, la UI web/native puo' gia' avviarli senza altro codice applicativo

### Push live device
- stato: da fare
- necessario per:
  - consegna convocazioni squadra a Android/iOS
  - conferma ricezione in tempo reale

## Ordine consigliato successivo

1. configurazione mittente email amministratore reale / SMTP
2. attivazione provider auth live (`email`, `google`, `facebook`, `apple`)
3. test manuali web + Android + iOS
4. attivazione push live device
5. rollout del backend successivo per le scritture native ancora mancanti

## Bundle applicato

Bundle usato per l'applicazione manuale del `2026-04-02`:
- `supabase/rollouts/20260402_player_referee_additive_rollout.sql`

Script di verifica usato dopo il rollout:
- `supabase/rollouts/20260402_player_referee_additive_postcheck.sql`

## Stato esecuzione da questo PC

Tentativo iniziale fatto il `2026-04-02`:
- non esiste una config locale Supabase su questo PC (`.supabase`, `AppData/Roaming/supabase`, `AppData/Local/supabase`)
- il comando `supabase --version` fallisce: CLI non installato
- il tentativo `winget install --id Supabase.CLI -e --source winget` non trova il pacchetto
- nel workspace non esistono `service_role`, DB password o token management riutilizzabili in modo sicuro

Chiusura reale:
- rollout eseguito manualmente via `SQL Editor` Supabase
- postcheck avviato con esito positivo mostrato almeno sul controllo finale `sample: account_catalog_callable = true`
- da qui in avanti il blocco non va piu' trattato come "solo pronto nel repo"

## Nota importante

Le migration additive sono applicate sul progetto Supabase reale.

Resta comunque vero che:
- il web continua a mantenere fallback prudenti dove mancano provider/config esterne
- Android e iOS restano ancora preview locale per alcuni flussi player/call nonostante le tabelle/RPC ora esistano
- il recupero password reale non e' ancora operativo finche' non colleghiamo SMTP/mittente reale

## Promemoria cross-app: source of truth

Questa regola va mantenuta come baseline in tutte e 3 le app:

- **web**
  - le viste pubbliche / live / TV / classifica / Hall of Fame devono seguire il DB pubblico (`public_workspace_state`)
  - non devono piu' vincere mirror/caches/salvataggi locali vecchi
- **Android**
  - la surface pubblica data-driven deve continuare a seguire `public_workspace_state`
  - non deve introdurre fallback locali che possano sovrascrivere o "battere" il dato DB nelle viste pubbliche/live
- **iOS**
  - stessa regola di Android: il dato pubblico/live deve seguire `public_workspace_state`
  - nessun fallback locale deve prevalere sul DB nelle viste pubbliche/live

Eccezioni ancora volontarie, da ricordare:
- `player_area` web e native: ancora preview/locale finche' non si attivano le migration player/call
- draft/simulazioni locali native arbitri: ancora locali finche' non si attiva il backend nativo completo
- il problema "referto arbitri salvato ma tabellone pubblico non aggiornato" va trattato come segnale di:
  - build Cloudflare vecchia
  - oppure vista pubblica non ancora allineata alla single source of truth
- Android e iOS ora riparano automaticamente dati preview player corrotti/orfani e offrono un reset esplicito locale, ma restano comunque preview-first finche' il runtime live completo non sostituisce quel percorso
- web, Android e iOS ora devono ripartire da `home` all'avvio/riapertura, senza riaprire automaticamente l'ultima view pubblica salvata
- l'area giocatore web e native va mantenuta non-bloccante:
  - bootstrap safe
  - fallback locale difensivo
  - schermata ancora navigabile anche se la derivazione player/live fallisce o richiede piu' tempo

## Regola operativa cross-app

Da qui in avanti ogni modifica applicativa va trattata cosi':

- se tocco il web / Cloudflare:
  - verifico se la stessa UX, label, logica o protezione esiste anche su Android e iOS
  - se esiste, la riallineo oppure annoto esplicitamente il gap residuo
- se tocco Android:
  - verifico il corrispettivo web e iOS
- se tocco iOS:
  - verifico il corrispettivo web e Android
- se il feature set non e' ancora equivalente tra le piattaforme:
  - non dichiaro "allineato" in modo generico
  - distinguo sempre tra:
    - allineamento pubblico/read-only
    - allineamento consultativo/protetto
    - operativita' live completa
- quando una differenza tra web, Android e iOS e' intenzionale:
  - la annoto esplicitamente qui o nei documenti di stato
  - la tratto come eccezione voluta, non come dimenticanza
- quando una differenza non e' intenzionale:
  - resta backlog aperto finche' non viene riallineata o sostituita da un percorso canonico unico

Checklist minima da applicare a ogni passaggio:
- UI/label/testi
- comportamento pubblico/live
- fallback safe / error boundary / anti-crash
- wiring backend o stato preview locale
- documentazione `00_PROJECT_STATUS`, `03_WORKLOG`, `06_SHARED_GAPS_WITH_WEB` quando il cambiamento lo richiede

## Backlog residuo emerso dalla chat

Questa sezione raccoglie il resto delle cose ancora da fare che non sono solo SQL puro, ma sono rimaste aperte nella conversazione.

### Deploy / dati / rollout web

- mantenere `Cloudflare Pages` come unico frontend canonico da produzione
- verificare periodicamente che `main` deployi davvero su `flbp-pages`
- evitare nuove dipendenze operative dal vecchio Worker legacy
- importare il backup dati corretto finale:
  - `backups/flbp_backup_2026-03-29_codex-fixed-v7.json`
- fare hard refresh / cache refresh della build pubblica dopo il deploy
- verificare online, dopo il deploy:
  - tabellone/TV aggiornati dai referti arbitri
  - `Baroncelli Marco` non piu' splittato in `Giocatori titolati`
  - capocannonieri storici completi
  - label `Canestri` al posto di `PUNTI`

### Rollout player account / chiamate squadra

- sostituire la preview locale di `player_area` con il backend live
- validare in un ambiente con SQL applicata il wiring web gia' chiuso per:
  - `player_area`
  - `Gestione dati -> Account giocatori`
  - chiamate squadra da `ReportsTab`
  - lettura additiva `pullRefereeLiveState()` in `RefereesArea`
- attivare davvero:
  - registrazione account giocatore con `email + password`
  - login social `google`, `facebook`, `apple`
  - reset password reale via email
  - profilo giocatore live collegato all'identita' sportiva
  - area risultati personali live
  - schermata live giocatore
  - convocazione squadra push/live con conferma ricezione
  - push OS reali ai device registrati (`FCM` Android, `APNs` iOS o equivalente orchestrato backend)
  - gestione token/device registration reale lato app, non solo struttura dati `player_app_devices`
- collegare in Admin la quinta sezione `Account giocatori` al catalogo reale account/provider, non solo alla preparazione repo
- ricordare la decisione prodotto:
  - `instagram` resta fuori dalla v1
  - la "chiamata" e' un alert push/live con conferma, non una telefonata OS vera

### Native apps: backlog tecnico ancora aperto

- Android:
  - chiudere smoke test reale su emulatore o device
  - configurare signing release
  - generare `.aab`
- iOS:
  - compilare e testare davvero su Mac/Xcode
  - configurare signing release
  - generare `.ipa`
- Android e iOS:
  - collegare davvero i wrapper/player-call backend gia' preparati nel web al runtime native dopo il rollout SQL
  - AdminDashboard nativa reale
  - RefereesArea nativa reale con scrittura
  - scritture admin native
  - scritture arbitri native
  - OCR/referti nativi completi

### Operativita' arbitri / live

- attivare la parte backend necessaria per sbloccare il primo save arbitri nativo reale
- una volta aperta la finestra SQL sicura, decidere se il percorso nativo usera':
  - nuova RPC/additive path gia' preparata
  - oppure altra lettura protetta dello snapshot live completo

### Test manuali ancora necessari

- test manuale web pubblico dopo il nuovo deploy Cloudflare
- test manuale area arbitri su torneo live dopo il deploy aggiornato
- test manuale Android runtime
- test manuale iOS runtime
- verifica manuale finale di:
  - Hall of Fame
  - classifica marcatori / leaderboard
  - TV bracket / TV scorers
  - player area
  - account giocatori admin

### Nota operativa

Per il ramo pubblico Cloudflare, il file di riferimento complementare resta:
- `docs/CLOUDFLARE_PENDING_DEPLOY_FIXES.md`

Per i gap nativi ancora aperti restano validi anche:
- `FLBP ANDROID/docs/codex/06_SHARED_GAPS_WITH_WEB.md`
- `FLBP IOS/docs/codex/06_SHARED_GAPS_WITH_WEB.md`
