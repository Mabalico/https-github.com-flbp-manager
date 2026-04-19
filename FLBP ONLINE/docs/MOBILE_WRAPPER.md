# App Mobile (Wrapper-ready con Capacitor)

Obiettivo: rendere **FLBP Manager Suite** wrappabile come app mobile (Android/iOS) senza cambiare alcuna logica o flusso della web app.

Stato strategico: il wrapper Capacitor e' il percorso mobile primario. Le app native dedicate `FLBP ANDROID` e `FLBP IOS` restano presenti come runtime transitori/di riferimento finche' la parita' wrapper non e' dimostrata su device reali. Vedi `docs/MOBILE_STRATEGY.md`.

Questa base include un **service worker conservativo** (R8) per caching leggero degli asset e fallback offline minimo.

- HTML/navigazioni: **network-first** (quando sei online non resta incollata una versione vecchia)
- Asset build (`/assets/*`, icone, manifest): **stale-while-revalidate** (caricamento piu' rapido)

Nota: per tornei live e' comunque possibile disabilitare rapidamente la registrazione SW impostando `localStorage flbp_sw_disabled=1`.

Hardening TV (R8.1):
- Se `flbp_tv_mode` e' attivo, l'app non registra il SW e prova a unregister+clear caches (best-effort).
- In Area Admin (header) ci sono pulsanti CACHE ON/OFF e cestino per forzare un reload pulito.

## Cosa e' gia' pronto nel progetto

- App self-contained: niente CDN runtime critici (Tailwind build-time; React/XLSX bundlati; OCR lazy-load via `tesseract.js`).
- PWA installabile (manifest + icone) e mobile polish (safe-area notch).
- Script build dedicato per wrapper: `npm run build:mobile` (base relativa).
- Runtime gate esplicito:
  - browser web normale;
  - shell native dedicate (`native_shell=android|ios`);
  - wrapper Capacitor Android/iOS.
- Il browser normale non espone il bridge push nativo e non tenta registrazioni device native.
- Il wrapper Capacitor espone un bridge push JS compatibile con `NativePushRegistrationSnapshot`, usando `@capacitor/push-notifications`.
- La Player Area riusa il flusso esistente: dopo login registra il device con `registerPlayerAppDevice(...)` solo quando il runtime e' nativo.

## File aggiunti per il wrapper

- `capacitor.config.json`
  - `appId`: identificativo app (cambialo prima di pubblicare).
  - `appName`: nome visibile.
  - `webDir`: `dist` (output di Vite).
  - `PushNotifications.presentationOptions`: abilita alert/sound/badge quando il wrapper e' in foreground.
- `services/capacitorPushBridge.ts`
  - Adapter Capacitor-only per permessi, token push, snapshot registrazione e apertura impostazioni best-effort.

## Gap report per sostituire FLBP ANDROID / FLBP IOS

Il wrapper puo' diventare l'unica app mobile distribuita quando questi punti sono completati e verificati su dispositivi reali.

Stato locale attuale:
- `FLBP ONLINE/android` e `FLBP ONLINE/ios` sono stati generati con Capacitor.
- Android debug build verificata da Windows con `npm run build:mobile`, `npm run cap:sync:android` e Gradle `assembleDebug`.
- Android include `google-services.json` per package `com.flbp.manager.suite` e permesso `POST_NOTIFICATIONS`.
- iOS include `UIBackgroundModes` con `remote-notification`; signing, Push Notifications capability e provisioning APNs restano da completare su Mac/Xcode.
- Le icone app Android/iOS del wrapper sono state riallineate agli asset gia' usati dalle app native dedicate.

Gia' disponibile nel repo:
- build mobile con asset relativi;
- rilevamento runtime browser/shell dedicate/wrapper Capacitor;
- bridge push Capacitor lato frontend, separato dal browser;
- sincronizzazione device verso `player_app_devices` tramite il flusso player esistente;
- Edge Function `player-call-push` gia' compatibile con device `android`/`ios` salvati in tabella;
- service worker solo cache/offline, senza web push.

Osservabilita' chiamate admin:
- la call DB resta governata dalle RPC esistenti; il dispatch push e' un passaggio successivo e puo' fallire senza cancellare la call registrata;
- `player-call-push` restituisce un `reasonCode` opzionale per distinguere `no_device`, `web_only`, `permission_denied`, `token_missing`, `provider_config_missing`, `provider_rejected` e `provider_error`;
- l'area admin mostra un messaggio leggibile quando la chiamata e' registrata ma la notifica non parte, cosi' si capisce se manca il device wrapper, il permesso, il token o la configurazione FCM/APNs.

Manca o richiede configurazione nativa:
- eseguire `npm run build:mobile` e `npm run cap:sync` dopo ogni cambio web;
- Android: verificare su device reale che Firebase rilasci un token FCM e che il device venga salvato in `player_app_devices`;
- iOS: configurare Signing & Capabilities in Xcode, Push Notifications, Background Modes se si vogliono remote notification background, provisioning APNs valido;
- apertura diretta delle impostazioni notifiche: il bridge chiama un plugin nativo opzionale `FLBPAppSettings`, non ancora implementato nel repo generato;
- parita' Android background/killed: il plugin Capacitor riceve token e foreground events, ma la parita' con la vecchia app dedicata per payload FCM data-only in background/killed va testata e potrebbe richiedere un piccolo servizio nativo Android o un payload backend distinto per wrapper;
- parita' iOS silent cancel: resta best-effort per limiti iOS/APNs, come gia' vale per la shell dedicata.

Non fare cleanup di `FLBP ANDROID` o `FLBP IOS` finche' i test manuali sotto non dimostrano parita' funzionale del wrapper.

Checklist minima di parita':
- fresh install Android wrapper: login player -> prompt permesso -> token presente in `player_app_devices`;
- Android permission denied: CTA apre o spiega chiaramente le impostazioni app;
- Android chiamata `ringing`: notifica visibile;
- Android `cancelled`/`acknowledged`: notifica rimossa o nessuna nuova notifica visibile;
- iOS fresh install: prompt permesso -> token APNs presente in `player_app_devices`;
- iOS foreground/background: chiamata visibile e cancel best-effort;
- browser web: nessun prompt notifiche native e nessuna registrazione device nativa.

## Prerequisiti

- Node.js LTS + npm.
- Android:
  - Android Studio installato (per build e firma).
- iOS:
  - macOS + Xcode (solo se vuoi generare l'app iOS).

## Procedura rapida (R7-bis)

Per generare i progetti nativi **in un comando** (crea le cartelle `android/` e `ios/` in locale):

- **Windows (Android)**: `powershell -ExecutionPolicy Bypass -File scripts\\capacitor-generate-android.ps1`
- **macOS/Linux (Android)**: `bash scripts/capacitor-generate-android.sh`
- **macOS (iOS)**: `bash scripts/capacitor-generate-ios.sh`

Nota: nel workspace principale le cartelle `android/` e `ios/` sono ora presenti sotto `FLBP ONLINE`. Se si parte da uno ZIP o da un clone pulito senza cartelle native, rigenerarle con i comandi sopra.

## Procedura Android (consigliata)

Da dentro `step53/`:

1) Installa dipendenze web

```bash
npm install
```

2) Build per wrapper (asset relativi)

```bash
npm run build:mobile
```

3) Aggiungi Capacitor (la prima volta)

```bash
npm install
```

4) (Solo la prima volta) Inizializza / verifica config

- Il progetto include gia' `capacitor.config.json`.
- Se vuoi cambiare `appId` / `appName`, modifica quel file.

5) Genera progetto Android

```bash
npx cap add android
```

6) Sincronizza web -> Android (da ripetere ad ogni build)

```bash
npm run build:mobile
npm run cap:sync
```

7) Apri in Android Studio

```bash
npm run cap:open:android
```

## Procedura iOS (opzionale)

Da macOS:

```bash
npm i @capacitor/ios
npx cap add ios
npm run build:mobile
npm run cap:sync
npm run cap:open:ios
```

## Note importanti (comportamento app)

- I dati restano su `localStorage` (come web). Su app mobile e' per-device.
- Nessun cambiamento a: TV Mode, BYE/TBD, OCR, import/export backup, workflow arbitri.
- Le notifiche native sono gated: si attivano solo in shell nativa dedicata o wrapper Capacitor, mai nel browser.
- Offline/cache: presente un **service worker conservativo** (vedi `public/sw.js`).
  - Network-first per HTML.
  - Cache leggera per asset build.
  - Disattivabile rapidamente: `localStorage flbp_sw_disabled=1`.

## Troubleshooting rapido

- Se vedi schermata bianca nel wrapper: assicurati di usare `npm run build:mobile` (base relativa) prima di `cap sync`.
- Se Gradle non trova Android SDK: crea `FLBP ONLINE/android/local.properties` con `sdk.dir=<percorso Android SDK>`; il file resta locale e non va versionato.
- Se l'OCR pesa troppo su dispositivi lenti: e' gia' lazy-loaded (si scarica solo quando serve).
