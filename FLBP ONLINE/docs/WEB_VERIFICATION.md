# Verifiche web riproducibili

`npm run check:web` esegue il controllo TypeScript browser/test, le suite dati,
editor, persistenza, referti, restore, fogli di calcolo, retry Fanta e route TV,
SSR Admin/Edizioni/TV, vincoli TV, copertura chiavi lingua e build produzione.
ONLINE aggiunge controlli durabilità, replica locale, idempotenza cloud e contratto
Edge del backup e rifiuti del client arbitri. Il primo errore interrompe il gate.

`npm run release:check` usa lo stesso gate; un percorso backup opzionale aggiunge
le sue verifiche di invarianti e sanitizzazione. `npm run check:backup -- file.json`
verifica solo quel backup. `check:all` resta un alias storico di quest'ultimo
controllo e non significa verifica completa dell'app.

GitHub Actions esegue il gate web su ONLINE e LOCALE e le suite del server locale
su Node 24. Il workflow Supabase controlla separatamente migrazioni, autorizzazioni
e restore su PostgreSQL reale; PostgREST verifica anche gli stati HTTP e la persistenza dell'audit arbitri.
Il typecheck Deno ha un comando e un job dedicati, con versione 2.9.6 fissata.
Questi controlli non sostituiscono E2E multiclient, prove browser visive o dispositivi mobili reali.

Per elencare i controlli senza eseguirli: `node scripts/check-web.mjs --list`.
I gate non richiedono credenziali di produzione e non modificano il database online.

## Browser: regolamento Fanta a torneo concluso

`npm run test:fanta-rules` verifica il click reale da storico chiuso a regolamento,
FAQ, ritorno tramite **Indietro** e **Vai allo storico**, riapertura di un'edizione
e uscita verso l'origine. Controlla inoltre che i gate disattivato/solo risultati
restino chiusi e che il regolamento del Fanta attivo mantenga le sue destinazioni.
La prova usa viewport desktop e mobile; un valore sentinella in localStorage
verifica che la navigazione non cancelli storage. Non sostituisce una prova
completa del salvataggio o recupero di una bozza del builder.

Il test monta gli attuali `FantaBeerpong`, `FantaHistorySection` e
`FantaRulesSection` con React, sostituendo soltanto IO e viste fuori perimetro
tramite `vite.fanta-rules-tests.config.ts`. Nessuna credenziale o rete esterna è
permessa. `node scripts/test-fanta-archived-rules.mjs --prove-regression`
verifica che scollegare il vero handler della CTA venga rilevato.

Playwright e Chromium sono strumenti separati dall'app: il job browser della CI
li installa in una directory temporanea, con Playwright 1.62.1. Il controllo
non fa parte di `check:web`, che resta eseguibile senza browser installati.
Il runner usa `require('playwright')` per default; per una toolchain esterna:

- `FLBP_PLAYWRIGHT_MODULE`: percorso assoluto del modulo `playwright`.
- `FLBP_BROWSER_EXECUTABLE`: percorso facoltativo del browser; se omesso usa
  il Chromium installato da Playwright.

Il regolamento del torneo concluso usa la sezione già esistente. Le destinazioni
rosa/classifica attiva vengono omesse perché indisponibili in quello stato;
entrambi i ritorni restano nello storico Fanta. Il builder e le sue bozze non
vengono aperti o modificati da questa navigazione.
