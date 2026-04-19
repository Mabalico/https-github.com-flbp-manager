# Mobile strategy

Documento conservativo di riferimento per il target mobile FLBP.

## Target architetturale

Il target strategico e': **wrapper Capacitor come app mobile primaria Android/iOS**.

Il browser resta un runtime supportato e non deve essere trasformato in una web-push app. Le funzioni native, in particolare push e registrazione device, devono restare gated sul runtime nativo.

## Runtime supportati

| Runtime | Stato | Ruolo |
| --- | --- | --- |
| Browser web | attuale e supportato | Usa la web app, Supabase e Cloudflare Pages. Non mostra prompt push nativi e non registra device nativi. |
| Wrapper Capacitor | target primario mobile | Distribuisce la web app mobile con bridge nativo per permessi, token push e registrazione device. |
| FLBP ANDROID dedicata | transitoria/di riferimento | App nativa dedicata Kotlin/Compose + WebView. Da mantenere finche' serve come riferimento/fallback. |
| FLBP IOS dedicata | transitoria/di riferimento | App nativa dedicata Swift/SwiftUI + WKWebView. Da mantenere finche' serve come riferimento/fallback. |

## Cosa fa il wrapper

- Carica la stessa app web di `FLBP ONLINE`, buildata con asset relativi tramite `npm run build:mobile`.
- Usa `capacitor.config.json` come configurazione app.
- Espone un bridge push compatibile con `NativePushRegistrationSnapshot`.
- Registra device in `player_app_devices` tramite il flusso player esistente.
- Lascia la Edge Function `player-call-push` come unico dispatch backend per FCM/APNs.

## Stato implementativo locale

- Piattaforma Android Capacitor generata in `FLBP ONLINE/android`.
- Piattaforma iOS Capacitor generata in `FLBP ONLINE/ios`.
- Android debug build completata da Windows.
- Android wrapper configurato con `google-services.json` e permesso `POST_NOTIFICATIONS`.
- iOS wrapper predisposto con `UIBackgroundModes/remote-notification`.
- Icone wrapper riallineate agli asset delle app native dedicate.
- iOS signing, Push Notifications capability, provisioning APNs e build firmata restano attivita' Mac/Xcode.

## Cosa resta browser-only

- Il browser non usa notifiche native wrapper.
- Il browser non registra device nativi in `player_app_devices`.
- Il service worker resta cache/offline leggero, non web push.
- Tutta la UI pubblica/admin/referee/player resta web-first.

## Cosa resta native-only

- Prompt permessi notifiche OS.
- Token FCM/APNs.
- Apertura impostazioni app, quando disponibile.
- Foreground/background push handling.
- Packaging store Android/iOS.

## Runtime nativi dedicati status

Le cartelle `FLBP ANDROID` e `FLBP IOS` sono marcate come **runtime transitori/di riferimento**, non come obsolete. Non vanno rimosse finche' la parita' del wrapper Capacitor non e' verificata su Android e iOS reali.

Restano utili per:
- capire il comportamento push gia' implementato prima del wrapper;
- recuperare configurazioni native, nomi bundle/package, permessi e capability;
- confrontare fallback tecnici reali se il wrapper mostra regressioni su device;
- rollback operativo finche' non esiste una release wrapper verificata e distribuibile.

Nuove feature mobile dovrebbero partire da `FLBP ONLINE` + wrapper Capacitor, non dalle superfici native dedicate, salvo bugfix o fallback esplicitamente richiesto.

## Cleanup inventory conservativo

### Da mantenere sicuramente

- `FLBP ONLINE`
- `FLBP LOCALE`
- `FLBP ONLINE/docs/MOBILE_WRAPPER.md`
- `FLBP ONLINE/docs/MOBILE_STRATEGY.md`
- `FLBP LOCALE/docs/MOBILE_WRAPPER.md`
- `FLBP LOCALE/docs/MOBILE_STRATEGY.md`
- `services/nativeShell.ts`
- `services/nativePushBridge.ts`
- `services/capacitorPushBridge.ts`
- `capacitor.config.json`
- `supabase/functions/player-call-push`
- migration e setup SQL legati a player devices/calls

Motivo: sono parte del percorso wrapper e del browser runtime attuale.

### Ridondante ma da tenere finche' non c'e' parita' wrapper

- `FLBP ANDROID/app`
- `FLBP ANDROID/docs/codex`
- `FLBP ANDROID/README.md`
- `FLBP IOS/FLBPManagerSuite`
- `FLBP IOS/FLBPManagerSuite.xcodeproj`
- `FLBP IOS/docs/codex`
- `FLBP IOS/README.md`

Motivo: contengono implementazioni native, bridge push e storia tecnica ancora utili per confronto, rollback e diagnosi.

### Potenzialmente eliminabile dopo migrazione completata

- artefatti generati Android come `.gradle`, `.gradle-user-home`, `.kotlin`, `app/build`, se risultano tracciati;
- impostazioni IDE locali come `.idea`, se non servono a build condivise;
- script o docs esclusivamente dedicati alla build delle app native dedicate, dopo archiviazione;
- fallback UI native pure non piu' usate, solo dopo tag/branch di archivio e release wrapper verificata.

Motivo: possono diventare peso operativo, ma non vanno rimossi prima di una finestra dedicata e reversibile.

### Da sostituire con documentazione wrapper unica

- istruzioni operative che indicano `FLBP ANDROID` o `FLBP IOS` come percorso mobile primario;
- next step delle app native dedicate che propongono nuove feature native non necessarie al wrapper;
- worklog/status dei runtime nativi dedicati, da conservare come storico ma non come onboarding principale.

## Piano cleanup a fasi

### Fase A: deprecazione docs, nessuna rimozione

- Dichiarare il wrapper Capacitor come target mobile primario.
- Marcare `FLBP ANDROID` e `FLBP IOS` come runtime transitori/di riferimento.
- Aggiornare README, deploy docs e worklog/status nativi.
- Non spostare e non eliminare file.

### Fase B: archiviazione

- Creare tag o branch di archivio prima di ogni rimozione.
- Spostare eventuali docs dei runtime nativi dedicati in un percorso `archive/mobile-native-dedicated/`.
- Conservare una guida rollback con commit/tag di recupero.
- Verificare che signing, bundle id, package name, FCM/APNs e store metadata siano migrati al wrapper.

### Fase C: rimozione finale

- Rimuovere solo dopo release wrapper verificata su Android/iOS reali.
- Rimuovere prima gli artefatti generati/locali.
- Rimuovere poi codice nativo dedicato solo se non serve piu' come fallback.
- Mantenere una nota storica minima con link a tag/commit di archivio.

## Rollback

Finche' `FLBP ANDROID` e `FLBP IOS` restano nel repo, il rollback consiste nel continuare a buildare le app native dedicate.

Dopo eventuale archiviazione/rimozione, il rollback deve avvenire tramite:
- tag o branch creato prima del cleanup;
- ripristino selettivo dei path nativi dedicati con `git checkout <tag> -- "FLBP ANDROID" "FLBP IOS"`;
- verifica manuale dei secret/config native non conservati nel repo.
