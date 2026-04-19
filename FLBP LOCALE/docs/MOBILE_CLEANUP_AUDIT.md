# Mobile cleanup audit

Audit conservativo per il passaggio progressivo verso wrapper Capacitor come app mobile primaria.

## Premessa

Questo report non autorizza rimozioni immediate. Le app native dedicate restano nel repository finche' il wrapper non dimostra parita' funzionale su Android e iOS reali.

## Stato attuale deducibile dal repo

- `FLBP ONLINE` contiene la web app, la configurazione Capacitor, il runtime gate e il bridge push wrapper.
- `FLBP ONLINE/android` e `FLBP ONLINE/ios` sono presenti come piattaforme wrapper generate.
- `FLBP LOCALE` e' allineato come copia locale operativa.
- `FLBP ANDROID` contiene una app Android dedicata con WebView/Compose, ancora utile come riferimento tecnico.
- `FLBP IOS` contiene una app iOS dedicata con WKWebView/SwiftUI, ancora utile come riferimento tecnico.
- `player_app_devices` resta il punto di sync device.
- `player-call-push` resta il dispatch backend unico per call push.
- Android wrapper compila in debug; iOS wrapper richiede ancora Mac/Xcode per signing, capability e build reale.

## Da mantenere sicuramente

| Area | Motivo |
| --- | --- |
| `FLBP ONLINE` | Source principale web e wrapper. |
| `FLBP LOCALE` | Mirror locale operativo da mantenere allineato. |
| `FLBP ONLINE/services/nativeShell.ts` | Runtime gate browser/native/wrapper. |
| `FLBP ONLINE/services/nativePushBridge.ts` | Contratto frontend push nativo. |
| `FLBP ONLINE/services/capacitorPushBridge.ts` | Adapter wrapper Capacitor. |
| `FLBP ONLINE/capacitor.config.json` | Config app wrapper. |
| `FLBP ONLINE/supabase/functions/player-call-push` | Dispatch push backend. |
| SQL player devices/calls | Prerequisito delle chiamate giocatore. |

## Ridondante ma da conservare finche' non c'e' parita' wrapper

| Area | Motivo |
| --- | --- |
| `FLBP ANDROID/app` | Riferimento per push Android, WebView dedicata, fallback tecnico. |
| `FLBP ANDROID/docs/codex` | Storia tecnica utile per diagnosi e rollback. |
| `FLBP ANDROID/README.md` | Stato operativo del runtime dedicato. |
| `FLBP IOS/FLBPManagerSuite` | Riferimento per push iOS, WKWebView dedicata, fallback tecnico. |
| `FLBP IOS/FLBPManagerSuite.xcodeproj` | Necessario se serve build fallback iOS. |
| `FLBP IOS/docs/codex` | Storia tecnica utile per diagnosi e rollback. |
| `FLBP IOS/README.md` | Stato operativo del runtime dedicato. |

## Potenzialmente eliminabile solo dopo migrazione completata

Questi elementi sono candidati, non azioni da fare ora:

- artefatti generati Android tracciati o conservati per errore: `.gradle`, `.gradle-user-home`, `.kotlin`, `app/build`;
- impostazioni IDE locali non condivise: `.idea`;
- script di build dedicati alle app native non piu' usate;
- docs operative che descrivono Android/iOS dedicati come percorso primario;
- fallback UI nativa pura, solo dopo tag/branch archivio e parita' wrapper verificata.

## Criteri minimi prima della dismissione

- Android wrapper installabile da APK/AAB generato con Capacitor.
- iOS wrapper buildabile da Xcode con signing valido.
- Login player persistente nel wrapper.
- Prompt notifiche visibile solo nel wrapper.
- Token Android/iOS salvato in `player_app_devices`.
- Chiamata admin `ringing` consegnata via push.
- `cancelled`/`acknowledged` non generano nuove notifiche visibili e puliscono best-effort quelle esistenti.
- Browser verificato senza prompt nativo e senza registrazione device nativa.
- Config FCM/APNs e store metadata migrati al wrapper.

## Piano cleanup a fasi

### Fase A: nessuna rimozione

- Documentare wrapper come direzione primaria.
- Marcare Android/iOS dedicati come runtime transitori/di riferimento.
- Mantenere tutti i fallback.

### Fase B: archiviazione

- Creare tag o branch di archivio.
- Spostare solo documentazione storica in `archive/mobile-native-dedicated/`.
- Conservare guida rollback.

### Fase C: rimozione finale

- Rimuovere prima artefatti generati/locali.
- Rimuovere codice nativo dedicato solo se non serve piu' come fallback reale.
- Conservare nota storica con tag/commit di recupero.

## Rollback

Finche' `FLBP ANDROID` e `FLBP IOS` restano nel repository, il rollback e' immediato: buildare il runtime dedicato precedente.

Dopo eventuale archiviazione o rimozione, ripristinare con:

```bash
git checkout <tag-pre-cleanup> -- "FLBP ANDROID" "FLBP IOS"
```

Poi verificare manualmente secret, signing, bundle id, package name, FCM/APNs e configurazioni non conservate nel repository.
