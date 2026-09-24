# Dipendenze e compatibilità dei fogli di calcolo

Aggiornamento del 24 settembre 2026, applicato a ONLINE e LOCALE:

- Vite fissato a `6.4.3`, patch dello stesso ramo compatibile con Node 22/24. Risolve gli advisory del dev server riportati per `6.4.1`, incluso il [bypass Windows di server.fs.deny](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff).
- SheetJS fissato a `0.20.3` tramite il tarball ufficiale `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, con integrity nel lockfile. Il registro npm `xlsx` resta fermo a `0.18.5`; seguire la [distribuzione ufficiale](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), che include i rimedi a [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533) e [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363).

Il caricamento resta lazy tramite `services/lazyXlsx.ts`. L'entry ESM di SheetJS richiede di registrare esplicitamente `cpexcel.full.mjs`: senza questa tabella un XLS BIFF5 Windows-1251 trasforma i nomi cirillici in caratteri sbagliati. Le tabelle vengono caricate solo quando si usano gli strumenti Excel, insieme al parser.

`npm run test:spreadsheet-compat` esegue un bundle ESM equivalente al browser in una directory temporanea separata dai test dati. Verifica roundtrip XLSX e XLS BIFF8 con nomi Unicode, date di calendario e statistiche, l'importazione di un XLS BIFF5 sintetico con codepage Windows-1251 e un CSV UTF-8. Il file BIFF5 rimane una fixture fissa: rigenerarlo durante il test potrebbe nascondere un errore di codifica comune a scrittura e lettura.

La chiusura A07 comprende anche le dipendenze transitive segnalate dall'audit. `ws` passa da `8.20.0` a `8.21.3`, mantenendo `@supabase/realtime-js` a `2.104.1`: il ramo 8 risolve il [DoS per esaurimento memoria](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p) da `8.21.0`. `tar`, usato dal tooling `@capacitor/cli` e non dal bundle browser, passa da `7.5.13` a `7.5.22`, mantenendo il parent a `8.3.1`; comprende il rimedio al [DoS critico da decompressione](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw), corretto da `7.5.19`.

Sono state aggiornate nei range già dichiarati anche le altre dipendenze segnalate: `@babel/core 7.29.7`, `@xmldom/xmldom 0.8.15`, `baseline-browser-mapping 2.11.25`, `brace-expansion 5.0.12`, `browserslist 4.29.1`, `nanoid 3.3.19`, `postcss 8.5.28` e `postcss-selector-parser 6.1.4`, insieme alle loro dipendenze compatibili. Il grafo dei due lockfile è identico. Non sono stati aggiunti override, usato `npm audit fix --force` o migrati major.

Al 24 settembre 2026, `npm audit --package-lock-only --json` termina con exit 0 e **zero vulnerabilità segnalate** in entrambe le applicazioni, contro le 12 iniziali. Il risultato riguarda gli advisory disponibili e non certifica l'assenza di bug applicativi. I report e le versioni prima/dopo sono in `outputs/audit-2026-09-24/` nella root della suite.
