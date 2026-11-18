# Prova CSP in modalità Report-Only

Stato: **prova**, non attiva in produzione. Branch di lavoro: `csp-report-only-test` (non deve mai essere unito o spinto su `main`).

## Perché

Il token admin sta in `localStorage` (`services/supabaseSession.ts`) e il sito non ha una Content-Security-Policy. Oggi non risultano punti di XSS, ma una CSP limita i danni se in futuro ne comparisse uno (script esterni non caricabili, token non inviabili a host diversi da Supabase).

Una CSP che blocca, scritta a memoria, rischia di rompere il sito durante un torneo. Per questo si parte da **Report-Only**: il browser non blocca nulla, segnala solo in console cosa avrebbe bloccato. Il comportamento dell'app, TV Mode compresa (read-only, zero-click, 16:9), non cambia.

Questa policy è stata costruita leggendo il codice e le librerie. **Non è ancora stata eseguita in un browser**: lo scopo della prova è proprio verificarla.

## Cosa cambia nel repository

Una sola riga in `public/_headers`, nel blocco `/*`, accanto agli header già presenti (non modificati):

```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/ https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://kgwhcemqkgqvtsctnwql.supabase.co wss://kgwhcemqkgqvtsctnwql.supabase.co https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Non c'è nessun header `Content-Security-Policy` che blocca, né `report-uri` / `report-to`: le violazioni si leggono nella console di DevTools. La riga è lunga circa 610 caratteri, ben sotto il limite di 2.000 per riga di Cloudflare Pages.

## Perché ogni origine c'è

| Direttiva | Valore | Motivo (dove si vede nel codice) |
|---|---|---|
| `default-src` | `'self'` | Base restrittiva. Nel codice dell'app non ci sono audio, video, `<object>` o `<embed>`. |
| `script-src` | `'self'` | Il bundle Vite è in `/assets/*`. `index.html` carica solo `/index.tsx` come modulo: **nessuno script inline, nessun CDN**. Nel codice dell'app non c'è `eval` né `new Function` (le librerie di terze parti non sono state verificate: lo dirà la prova). |
| | `'wasm-unsafe-eval'` | Serve a compilare il core WebAssembly di tesseract.js (OCR dei referti). Il worker blob eredita la policy. Consente solo WebAssembly, non `eval` di JavaScript. |
| | `https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/` | `createWorker('eng')` (`services/imageProcessingService.ts`) non imposta `workerPath`, quindi tesseract.js usa il default `…/tesseract.js@v5.1.1/dist/worker.min.js`, caricato con `importScripts` da un worker `blob:` (`node_modules/tesseract.js/src/worker/browser/`). |
| | `https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/` | Stesso motivo per `corePath`: `getCore.js` fa `importScripts` di `tesseract-core*.wasm.js` da questo percorso. |
| `style-src` | `'self'` | CSS compilato da Tailwind/PostCSS a build time, nessun CDN. |
| | `'unsafe-inline'` | Obbligatorio oggi: `<style>` inline in `index.html` e iframe `srcdoc` di stampa (`RefereesTab.tsx`, `AdminDashboard.tsx`) con `<style>` e attributi `style=` costruiti come stringhe HTML. Gli `srcdoc` ereditano la policy della pagina. |
| | `https://fonts.googleapis.com` | `<link>` a Inter e JetBrains Mono in `index.html`. |
| `font-src` | `'self'`, `https://fonts.gstatic.com` | File dei font serviti da Google Fonts. Le grafiche social usano `Inter` su canvas (`SocialGraphicsPanel.tsx`, `document.fonts.load`). |
| `img-src` | `'self'` | Loghi e icone in `public/` (`flbp_logo*.svg`, `flbp_logo_hero.png`, `tv-bracket-logo-2025.svg`, `referto_template_flbp_2025.png`, icone PWA). |
| | `data:` | `canvas.toDataURL` per foto referto allineate (`RefereesArea.tsx`, `AdminDashboard.tsx`) e per le grafiche social. |
| | `blob:` | `URL.createObjectURL` per le foto caricate (`imageProcessingService.ts`) e per le anteprime social. |
| `connect-src` | `'self'` | Sonda `/api/v1/discovery` e `/control/local-session` quando l'app è servita dal server locale (`services/dataPlaneClient.ts`). |
| | `https://kgwhcemqkgqvtsctnwql.supabase.co` | Progetto Supabase (`VITE_SUPABASE_URL`, valore indicato in `README_DEPLOY.md`): REST `/rest/v1`, login `/auth/v1`, Edge Functions `/functions/v1` (`services/supabaseRest.ts`). Non c'è Supabase Storage. |
| | `wss://kgwhcemqkgqvtsctnwql.supabase.co` | Realtime (`@supabase/realtime-js`, `services/repository/workspaceStateRealtime.ts`). |
| | `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/` | Il worker OCR scarica `eng.traineddata` con `fetch` (`worker-script/index.js`, percorso default). Dopo il primo download la lingua resta in IndexedDB. |
| `worker-src` | `'self'` | `sw.js`, registrato da `index.tsx`. |
| | `blob:` | Worker OCR creato da tesseract.js con `URL.createObjectURL`. |
| `manifest-src` | `'self'` | `manifest.webmanifest`. |
| `object-src` | `'none'` | Nessun plugin. |
| `frame-ancestors` | `'none'` | Coerente con `X-Frame-Options: DENY` già presente. |
| `base-uri` | `'self'` | Il sito non usa `<base>`. |
| `form-action` | `'self'` | I `<form>` (`PlayerArea.tsx`, `IntegrationsTournaments.tsx`) usano `onSubmit` con `preventDefault`, senza `action`. |

Scelte volute:

- **Origini esatte, nessun jolly.** `https://*.supabase.co` permetterebbe di inviare i token a un progetto Supabase qualsiasi, che è proprio lo scenario da limitare. Per jsDelivr si usano percorsi con versione (`@v5.1.1/`), non l'intero host: altrimenti qualunque pacchetto npm servito da jsDelivr diventerebbe uno script ammesso.
- **Nessun `frame-src`.** Gli unici iframe sono `about:srcdoc` per la stampa; li copre l'ereditarietà della policy (vedi punti aperti).
- **Versioni accoppiate.** I percorsi jsDelivr riportano la versione di `tesseract.js` / `tesseract.js-core` del `package-lock.json` (entrambe 5.1.1). Se si aggiornano, vanno aggiornate anche in `_headers`.

## Punti aperti (non risolti di proposito)

1. **Server locale in LAN.** Gli indirizzi cambiano a ogni evento e non si risolvono con un jolly.
   - Quando l'app è servita dal server locale stesso (`/app/`), l'origine è `'self'` e il client usa `window.location.origin`: lì **non si applica `_headers` di Cloudflare** e il server locale (`FLBP SERVER LOCALE/src/server.mjs`) oggi non invia alcuna CSP. Una CSP per quel caso sarebbe un lavoro separato.
   - Quando il sito su Cloudflare Pages (https) deve parlare con un server locale, l'indirizzo arriva a runtime da Supabase (`flbp_resolve_data_plane` → `base_url`). Il server accetta solo un `FLBP_LOCAL_PUBLIC_URL` https (tunnel); il suo hostname non è nel repository. Un indirizzo `http://192.168…` verrebbe comunque bloccato dal browser come contenuto misto.
   - Da decidere: se si usa il tunnel, aggiungere il suo hostname esatto a `connect-src` (e a `img-src` se serve); la prova non lo copre.
2. **`'unsafe-inline'` negli stili.** Indebolisce `style-src`, ma oggi serve. Per toglierlo servirebbe un hash per il `<style>` di `index.html` e la riscrittura delle stampe `srcdoc`, che ereditano la stessa policy della pagina e oggi usano stili inline: una modifica non piccola, quindi fuori dal Functional Freeze finché non si decide di attivare la CSP.
3. **Logo TV (`state.logo`).** `PublicTvShell.tsx` usa `state.logo` come `src`. Nell'interfaccia non c'è un punto che lo imposti, ma potrebbe arrivare dal database o da un backup come URL esterno: in quel caso comparirà una violazione `img-src` da valutare.
4. **`frame-ancestors` in Report-Only.** Alcuni browser lo ignorano quando la policy è solo di segnalazione (può comparire un avviso in console). La protezione reale resta `X-Frame-Options: DENY`.
5. **Iframe `srcdoc` di stampa.** Nelle specifiche non sono soggetti a `frame-src`, ma ereditano gli altri controlli. Una violazione qui sarebbe un segnale da annotare.
6. **Progetto Supabase scritto in chiaro.** `_headers` è statico e non legge le variabili `VITE_*`. Se Production o Preview di Cloudflare puntassero a un altro progetto, comparirebbero violazioni `connect-src` su tutto: controllare che coincida.
7. **Browser TV vecchi.** Se i browser delle TV non supportano la CSP di terzo livello, ignorerebbero alcune direttive (`wasm-unsafe-eval` serve solo all'OCR, non alla TV).

## Come provarla su un'anteprima Cloudflare Pages

**Prima di partire (decide Marco)**

- Il branch va pubblicato su GitHub per avere un'anteprima. Non è detto che il progetto Pages (`flbp-pages`) abbia le anteprime dei branch non di produzione attive: da controllare in Cloudflare (Settings → Builds → Branch control).
- Le variabili `VITE_*` della scheda **Preview** devono esistere e puntare dove si vuole. Se la anteprima usa il Supabase di produzione, **ogni salvataggio in Admin scrive su produzione**: in prova si naviga e si legge, senza salvare, importare, applicare o ripristinare. In alternativa, usare un workspace/progetto di prova.
- Il login Google dell'area giocatori richiede che l'indirizzo dell'anteprima sia tra i Redirect URL di Supabase Auth: probabilmente non lo è. Se il login non parte, è un limite della anteprima, non della CSP; provare il login con email, oppure limitarsi alla schermata.

**1. Controllare che l'header ci sia**

Indirizzo tipico: `https://csp-report-only-test.flbp-pages.pages.dev` (lo mostra la dashboard Pages).

```bash
curl -sI https://<indirizzo-anteprima>/ | grep -i "content-security"
```

Deve comparire `content-security-policy-report-only` e **non** `content-security-policy`.

**2. Preparare DevTools**

- Profilo pulito o finestra in incognito, **senza estensioni** (generano violazioni spurie con origini `chrome-extension://`).
- Aprire DevTools **prima** di caricare il sito. Console: attivare *Preserve log*, filtrare per `Report Only`.
- Application → Storage → *Clear site data* all'inizio, e di nuovo prima di ripetere la prova OCR: la lingua OCR e il service worker restano in cache e nasconderebbero richieste e violazioni.
- Opzionale: incollare in console, prima di iniziare, questo snippet. Raccoglie le violazioni della pagina (quelle dei worker restano visibili solo in console):

```js
window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({
  dir: e.effectiveDirective, blocked: e.blockedURI, file: e.sourceFile, line: e.lineNumber, disp: e.disposition,
}));
// a fine prova: console.table(window.__csp)
```

**3. Percorsi da fare, uno alla volta, annotando le violazioni di ciascuno**

1. **Home** e navigazione pubblica (classifiche, torneo, Hall of Fame, Fantabeerpong).
2. **TV**: `/?flbp_tv=groups`, poi `groups_bracket`, `bracket`, `scorers`, `bracket_scorers`. Zero clic; in TV il service worker non viene registrato.
3. **Area arbitri**: apertura referto, caricamento foto, allineamento e OCR (primo uso: scarica worker, core e lingua da jsDelivr), stampa del referto.
4. **Admin**: accesso, tab dati, stampe (iscrizioni, referti: usano iframe `srcdoc`), lettura dei pannelli. Niente salvataggi (vedi sopra).
5. **Area giocatori**: schermata di accesso e, se possibile, login con email e profilo.
6. **Grafiche social**: generare ed esportare almeno una immagine (canvas, font Inter, download).
7. **Import e backup**: scelta di un file JSON e di un XLSX in anteprima (carica il chunk `xlsx`), esportazione di un backup; **senza** applicare né ripristinare.
8. **OCR** (ripetuto dopo *Clear site data*): foto referto → allineamento → lettura. Deve mostrare al massimo violazioni note; una violazione su `script-src`, `worker-src` o `connect-src` verso `cdn.jsdelivr.net` significa che il percorso versionato non corrisponde.

**4. Registro delle violazioni**

Per ciascuna annotare: pagina e azione, direttiva (`effectiveDirective`), URI bloccato, file e riga, decisione (aggiungere all'elenco / correggere il codice / ignorare, con motivo).

| Percorso | Direttiva | URI bloccato | File:riga | Decisione |
|---|---|---|---|---|
| | | | | |

## Criteri per passare a una CSP che blocca

Si passa a `Content-Security-Policy` solo se **tutti** questi punti sono veri:

1. Tutti i percorsi sopra non producono violazioni non spiegate, su Chrome desktop, Chrome Android, Safari (iOS e macOS) e Firefox. Ogni violazione residua ha una decisione scritta.
2. I punti aperti sono chiusi o accettati per iscritto: server locale/tunnel, `'unsafe-inline'`, logo TV.
3. Un periodo reale con la policy in Report-Only **in produzione**, che copra almeno un evento dal vivo. Richiede un indirizzo per i report (`report-to` / `report-uri`), da decidere: finché manca, le violazioni dei visitatori reali non si vedono.
4. L'OCR e le grafiche social funzionano con la policy che blocca provata prima su anteprima.
5. Un piano di ritorno pronto: togliere la riga da `_headers` e rifare il deploy. Si attiva lontano da un torneo, mai il giorno di un evento.
6. La modifica rispetta il Functional Freeze (solo `_headers`, nessuna nuova dipendenza) e non altera la TV Mode.

Se anche uno solo di questi punti manca, la policy resta in Report-Only.

## Chiusura della prova

- Branch di prova: non unirlo a `main`. Un push su `main` fa partire da solo il deploy di database ed Edge Function (`supabase-db-deploy.yml`, `supabase-functions-deploy.yml`) e il deploy di produzione di Cloudflare Pages.
- Alla fine: o si riporta la riga definitiva in una modifica separata, preparata a partire da `origin/main`, oppure si elimina il branch.
