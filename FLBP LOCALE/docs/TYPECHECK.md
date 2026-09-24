# Controllo TypeScript

`npm run typecheck` controlla sequenzialmente il codice browser e i test/tooling, senza generare file. Termina con errore appena uno dei due controlli fallisce. Il build Vite trasforma TypeScript ma non sostituisce questo controllo.

| Comando | Sorgenti controllati |
| --- | --- |
| `npm run typecheck:browser` | Tutti i file TS/TSX dell'app, inclusi componenti, servizi e configurazione applicativa |
| `npm run typecheck:tests` | Test TS/TSX, fixture UI, harness SSR, configurazioni Vite e tutti i sorgenti importati |
| `npm run typecheck:deno` | Entry point Supabase Edge Functions e loro import, tramite `deno check` |

`tsconfig.base.json` mantiene le opzioni condivise; `tsconfig.browser.json` e `tsconfig.tests.json` definiscono gli ambienti. `tsconfig.json` usa lo scope browser anche nell'editor e per il comando `tsc` senza parametri. I tipi Node sono richiesti soltanto dallo scope test/tooling; React e React DOM hanno le rispettive definizioni di sviluppo, allineate al ramo 19.2 del runtime.

Sono esclusi dagli input i bundle e le copie generate (`dist`, `release_bundle`, `.tmp-*`, asset wrapper Android/iOS e `node_modules`). Le funzioni Deno non vengono interpretate con il compilatore browser: hanno URL di import e API runtime differenti. Nessun componente o servizio applicativo è escluso per nascondere diagnostiche. `allowJs` è disattivato: gli script JavaScript restano verificati dai propri test di esecuzione, non sono presentati come coperti da questo controllo TypeScript.

Il controllo Deno è esplicito perché richiede il relativo eseguibile e l'accesso iniziale agli import remoti (o una cache completa). Se Deno manca, il comando termina con errore e comunica che la verifica **non è passata**. Non sono presenti dichiarazioni fittizie per Deno o per gli import HTTPS. Il gate browser/test può essere eseguito senza Deno; prima di una release Edge Functions va eseguita separatamente anche la verifica Deno.

La verifica Q01 delle quattro funzioni è passata in ONLINE e LOCALE con Deno `2.9.6`, eseguito tramite `npx deno@2.9.6` senza aggiungerlo alle dipendenze dell'app. Nell'ambiente Windows è stato usato `DENO_TLS_CA_STORE=system` per le CA del sistema; TLS rimane verificato. Questo controllo dei tipi non sostituisce le prove funzionali delle notifiche su dispositivo o delle operazioni sul database.

Le opzioni esistenti di gradualità sono conservate: non si dichiara una migrazione completa a `strict` e `skipLibCheck` resta attivo per le dichiarazioni delle dipendenze. Sono invece controllati i contratti React, le props, i risultati discriminati e tutti i sorgenti TypeScript dell'app. I test con effetti remoti non vengono eseguiti dal typecheck: vengono soltanto analizzati.

La correzione Q01 include contratti archivio Fanta `live_points`, bonus delle fixture, motivi di unione account tipizzati, evento diagnostico `match-result`, risultati di simulazione e fixture con scadenza sessione ISO. Nell'interfaccia, i referti interpolano ora il numero di incontri e l'obiettivo degli spareggi; l'area giocatore usa il workspace configurato e distingue correttamente i risultati della registrazione. Il test SSR Admin verifica anche l'assenza dei segnaposto grezzi nei referti.

Il controllo con i tipi React ha inoltre individuato due collegamenti incompleti in LOCALE. La UI dell'editor offriva la rigenerazione del tabellone ma mancavano operazione e rilevamento della nuova struttura: ora usa la stessa implementazione di ONLINE, con blocco dopo l'avvio di partite reali e test su roster da 128 squadre e placeholder BYE/TBD. La correzione del profilo giocatore nel tab Squadre ora comunica anche i roster prima/dopo al sincronizzatore Fanta già passato dall'Admin; resta una correzione del profilo, con la semantica locale preesistente, mentre ONLINE mantiene la propria funzione di sostituzione del singolo slot.

Riferimenti: [TypeScript, configurazione](https://www.typescriptlang.org/tsconfig/), [React con TypeScript](https://react.dev/learn/typescript), [Deno check](https://docs.deno.com/runtime/reference/cli/check/).
