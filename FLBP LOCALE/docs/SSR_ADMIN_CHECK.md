# Controllo SSR Admin dai sorgenti correnti

Eseguire `npm run check:ssr-admin`. Il vecchio file `_ssr_admin_check.mjs` è ora un piccolo ingresso compatibile che avvia `scripts/check-ssr-admin.mjs`: a ogni esecuzione Vite ricompila i sorgenti della copia corrente con `vite.ssr-admin-tests.config.ts`, poi Node esegue il nuovo harness. Gli artefatti sono isolati in `.tmp-ssr-admin/`, separati dagli altri test. Un errore di compilazione impedisce di eseguire un bundle precedente.

Il controllo predefinito copre login, Squadre, Dati e Referti. `TAB=teams`, `TAB=data` o `TAB=reports` limita le schede renderizzate per una diagnosi mirata; il controllo negativo contro il login rimane attivo. Su PowerShell, ad esempio: `$env:TAB='reports'; npm run check:ssr-admin`; rimuovere poi la variabile con `Remove-Item Env:TAB`.

## Cosa verifica

- Il login non autenticato contiene il campo password e viene respinto dalle asserzioni di tutte e tre le schede.
- Squadre contiene la barra azioni e una squadra della fixture; Dati contiene le sezioni specifiche di persistenza, traffico e account; Referti contiene il selettore della partita e il codice della fixture.
- I contenuti delle schede sono distinti. Una scheda non può soddisfare le asserzioni di un'altra; un componente mancante, una pagina di login o un semplice fallback non passano il test.
- I conteggi e il punteggio obiettivo dello spareggio nei Referti sono interpolati: non rimangono `{shown}`, `{total}` o `{count}` visibili.
- Il rendering non modifica lo stato applicativo e non effettua richieste di rete. Il test usa solo sessione, storage e dati fittizi. Gli `.env` del deploy e le variabili `VITE_*` della shell non vengono usati.

Il rendering usa `renderToPipeableStream` e attende `onAllReady`, così include i componenti reali caricati con `React.lazy`. `renderToString` da solo può fermarsi al fallback di Suspense.

## Limite esplicito della fixture autenticata

React SSR non esegue `useEffect`, quindi una sessione fittizia nello storage non può completare l'autenticazione del componente. Per verificare il rendering dopo il login, il solo config di test modifica in memoria i due inizializzatori `authed` e `adminAuthMode` dell'AdminDashboard. La trasformazione AST verifica nomi, setter e forma delle dichiarazioni e fallisce se il confine atteso cambia. I file runtime non vengono modificati e il config di produzione non include questo plugin.

Il controllo non verifica l'accesso Supabase, i permessi, gli effetti browser o i salvataggi. Questi richiedono i test dei rispettivi servizi e flussi. I PASS storici del vecchio bundle indicavano solo che la schermata di login riusciva a renderizzare; non provavano il funzionamento delle schede Admin.
