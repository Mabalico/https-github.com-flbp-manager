# Sicurezza e disponibilità del flusso arbitri

La migration additiva `20260924000300_referee_write_scope_and_availability.sql` conserva le firme delle RPC arbitri e corregge tre problemi riprodotti su PostgreSQL isolato:

- Dodici password errate bloccavano per dieci minuti anche chi conosceva la password corretta.
- I push registravano il rifiuto e poi sollevavano un'eccezione: il rollback cancellava anche la riga di audit.
- La vecchia RPC `flbp_referee_push_live_state` permetteva alla password arbitri di sostituire impostazioni, squadre, archivi, password e snapshot pubblico dell'intero workspace.

## Comportamento

Password vuota, errata, torneo diverso e versione di autenticazione revocata restano rifiutati. Una password valida non viene bloccata dai tentativi anonimi altrui. Nessun header, indirizzo dichiarato dal client o metadato utente viene usato come identità attendibile. Gli helper interni non sono eseguibili dai ruoli API client.

I rifiuti dei push restituiscono `{ok:false,reason,message?}` e impostano `response.status`: 403 per credenziali rifiutate, 429 quando è superata la soglia diagnostica, 409 per conflitti e leadership locale, 400/500 per gli altri errori. Il blocco delle scritture viene annullato prima di registrare il rifiuto, mentre la transazione esterna può conservare l'audit. Questo evita di rispondere HTTP 200 ai vecchi client ancora aperti: anche senza il nuovo controllo `out.ok !== true`, essi non devono confermare il referto fallito.

Il meccanismo è quello documentato da [PostgREST per lo stato della risposta](https://docs.postgrest.org/en/stable/references/transactions.html#response-status-code) e per il [commit della transazione](https://docs.postgrest.org/en/stable/references/transactions.html#transaction-end). La verifica HTTP reale del progetto rimane obbligatoria prima del rollout: il solo test SQL del GUC non dimostra l'integrazione con la versione di PostgREST distribuita.

Il servizio frontend verifica anche `ok === true` prima di avanzare il cursore remoto. I conflitti mantengono il codice `FLBP_DB_CONFLICT`; la coda dei referti esistente conserva quindi l'invio fallito.

La RPC snapshot è ora un adattatore alle modifiche delle partite:

- richiede `p_base_updated_at` corrispondente allo snapshot corrente e conserva il lock durante autenticazione e scrittura;
- prende soltanto le partite del torneo indicato; ignora modifiche a impostazioni, password, archivi, anagrafiche e `p_public_state`;
- conserva gli altri dati dal database, rifiuta rimozioni di partite e risultati più vecchi;
- ammette soltanto i campi previsti da `Match`, preservando eventuali campi privati già nel DB senza copiarli sul mirror pubblico;
- consente la creazione di uno spareggio FTB schedulato nel girone finale attivato, con progressione del codice, squadre appartenenti a quel girone e nessun altro spareggio pendente;
- aggiorna atomicamente snapshot privato/pubblico, righe normalizzate e mirror live dove presenti. I trigger esistenti continuano a bloccare le scritture cloud durante leadership locale o recovery.

Le patch moderne accettano sia l'array di partite usato dall'app sia il singolo oggetto già ammesso in precedenza. Lo spareggio successivo può essere creato nella stessa patch che chiude quello precedente. Il calcolo della classifica e dei pareggi rimane nell'engine esistente; il database vincola la struttura della nuova partita, senza ricalcolare la classifica.

Se lo snapshot pubblico manca, appartiene a un altro torneo o non contiene una partita corrente, la RPC ricostruisce i campi live dallo stato privato autorevole usando una proiezione ricorsiva esplicita. Sono filtrati anche campi annidati di squadre, gironi, configurazione, statistiche e audit. I campi non live già pubblici, come logo e storico, vengono conservati; se l'intero mirror manca, ricevono valori vuoti e restano recuperabili dal normale sync Admin. Le classificazioni U25 seguono le regole già usate da `isU25`: anni compiuti alla data del torneo e differenza tra anni solari per la carriera; le date di nascita non escono dal DB.

Nello schema ONLINE moderno la riparazione ricostruisce tutte le righe normalizzate pubbliche del torneo corrente tramite il normalizzatore esistente: squadre, gironi, associazioni, partite e statistiche. Le righe obsolete vengono eliminate nello stesso blocco transazionale. Configurazione e audit delle tabelle pubbliche ricevono la stessa proiezione restrittiva. La copia legacy senza i normalizzatori di luglio/agosto conserva il percorso snapshot compatibile; non viene presentata come equivalente allo schema canonico.

La migration uniforma inoltre l'ordine dei lock delle RPC Admin storiche, incluse tutte le firme installate e l'helper delle patch: advisory lock del data plane prima del lock sulla riga workspace. Firme, default, autorizzazioni e corpi già presenti vengono conservati con `CREATE OR REPLACE`. La RPC Admin v2 aveva già questo ordine. Il correttivo riconosce corpi LF/CRLF e può essere riapplicato senza aggiungere lock duplicati.

## Limite rimasto: protezione dai tentativi automatici

La soglia condivisa non è più un blocco di autenticazione per password valide. È un indicatore di abuso delle credenziali errate. Non va presentata come una protezione completa contro il brute force: il flusso anonimo non fornisce un'identità verificata per distinguere due dispositivi e le RPC di cancellazione convocazioni e la funzione push convocazioni contenevano già verifiche della stessa password senza quel limite globale.

Un intervento distinto deve portare tutte le verifiche della password attraverso un gateway attendibile, con limiti per origine verificata dal gateway, contatori persistenti e sessioni arbitro revocabili. Il piano deve includere cancellazione/push delle convocazioni, disattivazione delle vecchie vie dirette e migrazione dei client. Non usare semplicemente `x-forwarded-for`, `x-real-ip` o un identificatore scelto dal browser. Questa migration non realizza né simula quel gateway.

## Verifiche riproducibili

I runner risiedono nella copia canonica `FLBP ONLINE/scripts`. Non aggiungono dipendenze all'app. Il modulo PGlite viene fornito esplicitamente da un ambiente di test esterno.

```sh
node scripts/test-referee-security.mjs --pglite /absolute/path/to/pglite/dist/index.js
node scripts/test-referee-security.mjs --pglite /absolute/path/to/pglite/dist/index.js --legacy
node scripts/test-referee-client-contract.mjs
```

Al 25 settembre 2026: **64 asserzioni SQL** sullo schema ONLINE completo (70 migrations), **52** sullo schema LOCALE fino a giugno con le nuove migration di autorizzazione e arbitri, **36** casi del servizio frontend effettivo. Copertura: privilegi reali anon, password corrette/errate, header falsificati, audit, exploit dello snapshot, campi privati, conflitti, FTB, snapshot legacy con soli `rounds`, errore successivo alla scrittura e rollback di snapshot/righe normalizzate/versioni, leadership locale/recovery, riparazione mirror assente/torneo errato/partita mancante, righe pubbliche correnti e obsolete, privacy annidata e confini U25. Il runner verifica anche riapplicazione della migration e lock Admin con corpi CRLF. La suite legacy non comprende le migrations LOCALE successive a giugno: la sequenza completa contiene una collisione storica di versione già documentata nel rapporto audit.

Per PostgreSQL nativo, dopo le migrations su un database locale sacrificabile:

```sh
node scripts/test-referee-security.mjs --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

La suite SQL racchiude fixture e helper in una transazione conclusa con rollback. Non modifica dati persistenti del database di test.

La regressione di concorrenza usa due connessioni writer reali e una terza connessione che controlla una barriera. Un trigger di test sospende l'Admin dopo l'acquisizione della riga; l'arbitro deve aspettare l'advisory lock senza creare un ciclo. Il runner rilascia la barriera e verifica il commit di entrambi i referti per tutte le firme Admin installate e per la v2:

```sh
node scripts/test-referee-concurrency.mjs --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Il runner crea fixture, trigger e schema univoci e li elimina in `finally`. Non richiede modifiche al parametro privilegiato `deadlock_timeout`. Questa prova richiede PostgreSQL nativo e va attestata dalla CI; PGlite non sostituisce la prova con connessioni concorrenti.

La [CI nativa del 25 settembre 2026](https://github.com/Mabalico/https-github.com-flbp-manager/actions/runs/36065546203) ha superato i tre scenari concorrenti e i dieci controlli PostgREST descritti qui, oltre alle suite SQL e al probe read-only. La prova concorrente copre le RPC elencate; non attesta ogni percorso REST diretto di aggiornamento dei mirror pubblici.

Per verificare HTTP e commit effettivi avviare PostgREST direttamente sul database sacrificabile, con `PGRST_DB_URI` verso quel database, `PGRST_DB_SCHEMAS=public` e `PGRST_DB_ANON_ROLE=anon`. Il runner richiede il root HTTP di PostgREST, senza gateway Supabase né chiavi di produzione:

```sh
node scripts/test-referee-http.mjs --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres --postgrest-url http://127.0.0.1:3000
```

Questo test crea e conferma un workspace sintetico univoco, verifica 403/409/429, controlla l'audit mediante connessioni SQL separate, riproduce la callback dei vecchi client priva del controllo del payload e verifica un salvataggio riuscito. Il blocco `finally` rimuove fixture e audit. Gli URL accettati sono soltanto loopback; non usare un tunnel verso produzione. L'esecuzione HTTP con PostgREST nativo non era disponibile sull'host di sviluppo e deve essere attestata dalla CI prima del deploy.

## Distribuzione

Applicare la migration attraverso la sequenza canonica, non modificando quelle storiche. Il bundle `setup_all.sql` da solo non comprende questa correzione. Installare anche le guardie frontend di questo lotto; il backend mantiene comunque gli stati HTTP non riusciti per proteggere le schede precedenti. Verificare il test PostgREST prima della pubblicazione e non includere questa migration in un artefatto congelato prima delle relative verifiche.
