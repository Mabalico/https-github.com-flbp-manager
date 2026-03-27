# App Mobile (Wrapper-ready con Capacitor)

Obiettivo: rendere **FLBP Manager Suite** wrappabile come app mobile (Android/iOS) senza cambiare alcuna logica o flusso della web app.

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

## File aggiunti per il wrapper

- `capacitor.config.json`
  - `appId`: identificativo app (cambialo prima di pubblicare).
  - `appName`: nome visibile.
  - `webDir`: `dist` (output di Vite).

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

Nota: le cartelle `android/` e `ios/` non sono incluse nello ZIP perche' vengono generate da Capacitor e dipendono dalla toolchain del sistema (Android Studio / Xcode).

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
npm i -D @capacitor/cli @capacitor/core
npm i @capacitor/android
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
- Offline/cache: presente un **service worker conservativo** (vedi `public/sw.js`).
  - Network-first per HTML.
  - Cache leggera per asset build.
  - Disattivabile rapidamente: `localStorage flbp_sw_disabled=1`.

## Troubleshooting rapido

- Se vedi schermata bianca nel wrapper: assicurati di usare `npm run build:mobile` (base relativa) prima di `cap sync`.
- Se l'OCR pesa troppo su dispositivi lenti: e' gia' lazy-loaded (si scarica solo quando serve).
