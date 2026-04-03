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

## Preparata nel repo ma non ancora applicata

- nessuna migration additiva residua su questo blocco `referees/player/accounts`
- restano da applicare solo eventuali SQL future non ancora preparate per:
  - push reali
  - referti nativi con scrittura completa
  - altre estensioni backend ancora non modellate

## Wiring repo gia' chiuso in attesa del rollout SQL

- web `player_area`
  - ora e' cablata `live-when-available`: le tabelle/RPC player sono disponibili sul progetto reale
  - mantiene fallback preview locale solo come compatibilita' se mancano auth/provider/config esterne
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

## Regola architetturale native

- Android e iOS ora usano come percorso primario una shell nativa con web mirror full-screen di `FLBP ONLINE` (`https://flbp-pages.pages.dev`)
- il fallback nativo legacy resta nel repo solo come backup tecnico locale e come base per eventuali recuperi offline / debug
- quando tocchiamo il web, va sempre verificato se il cambiamento impatta anche:
  - il web mirror primario sulle native
  - il fallback nativo legacy ancora mantenuto nel repo

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

Checklist minima da applicare a ogni passaggio:
- UI/label/testi
- comportamento pubblico/live
- fallback safe / error boundary / anti-crash
- wiring backend o stato preview locale
- documentazione `00_PROJECT_STATUS`, `03_WORKLOG`, `06_SHARED_GAPS_WITH_WEB` quando il cambiamento lo richiede

## Backlog residuo emerso dalla chat

Questa sezione raccoglie il resto delle cose ancora da fare che non sono solo SQL puro, ma sono rimaste aperte nella conversazione.

### Deploy / dati / rollout web

- rigenerare la `dist` aggiornata di `FLBP ONLINE`
- pubblicare su Cloudflare la build nuova, cosi' l'online smette di usare la UI vecchia
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
