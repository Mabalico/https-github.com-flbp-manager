# FLBP Server Locale

Server Windows per il data plane critico del torneo. Serve la stessa build React di `FLBP ONLINE`, conserva lo stato in SQLite/WAL e coordina con Supabase quale nodo può scrivere.

## Garanzie implementate

- commit SQLite atomico con `journal_mode=WAL` e `synchronous=FULL`;
- versione monotona e `operationId` idempotente per ogni scrittura;
- `baseVersion` obbligatoria e privata dell'istanza che ha realmente caricato lo stato: una scheda stale riceve `409` e non può cancellare referti più recenti;
- lease Admin SQLite persistente (heartbeat 25 s, scadenza 90 s): una sola finestra scrive, le altre sono read-only e il takeover è sempre esplicito;
- storico completo locale di ogni snapshot;
- outbox append-only, ritentata senza duplicare operazioni;
- patch per singola partita con protezione anti-regressione del referto;
- epoch di leadership e heartbeat Supabase;
- attivazione compare-and-switch: versione, contenuto, journal ed epoch cloud devono essere ancora identici allo snapshot scaricato;
- nessun fallback automatico scrivibile dopo il crash del PC: si entra in `recovery` per evitare split-brain;
- backup completo dello snapshot privato/pubblico in una sola transazione Supabase ogni 30 minuti e alla disattivazione;
- replica SQLite compatta e obbligatoria su un secondo disco/USB: la risposta al commit arriva solo dopo che stato applicativo corrente, metadati e outbox della stessa versione sono leggibili nella copia secondaria; lo storico versionato resta nel DB primario e non viene ricopiato a ogni referto;
- disattivazione in draining persistente: backup finale e ritorno al cloud sono una singola RPC atomica e ritentabile;
- journal in piccoli batch (default 15 secondi, massimo 25 operazioni/512 KiB) quando Internet è disponibile;
- heartbeat Supabase non sovrapposti: una risposta lenta viene condivisa fra i timer concorrenti e gli errori attivano un backoff progressivo fino a 60 secondi, evitando raffiche durante l'esaurimento Disk I/O;
- mirror live pubblico compatto accodato dopo ogni commit e ritentato ogni 15 secondi: la conferma del salvataggio locale non attende mai Supabase;
- append remoto transazionale: SQLite elimina una voce dall'outbox solo quando Supabase conferma tutte le versioni, senza collisioni o buchi nel journal;
- drain continuo dell'outbox: una commit arrivata durante un upload viene inviata nello stesso ciclo, senza attendere il backup periodico;
- sessione Admin automatica esclusivamente dal loopback del PC server: il master token non viene esposto alla web app remota;
- checkpoint browser confermato prima del push e salvataggi Admin serializzati: una risposta vecchia non può cancellare la modifica successiva;
- fallback browser completo: se `localStorage` è pieno, la bozza confermata in IndexedDB viene riletta automaticamente al reload con la propria base di concorrenza;
- bozze browser separate per workspace, finestra e operationId; una conferma chiude soltanto la propria operazione e un conflitto offre ricarica/riconciliazione o export JSON;
- scritture Admin cloud idempotenti tramite `operationId`: un retry dopo risposta persa non crea una seconda versione e un'operazione già superata non può sovrascrivere il DB;
- commit Admin unico per snapshot privato e pubblico, propagato entro circa un secondo alle TV aperte dal PC/LAN;
- nessuna ricostruzione normalizzata completa all'avvio o ai backup periodici: i referti usano upsert per singola partita, le modifiche estranee al torneo non toccano le tabelle torneo e il rebuild completo avviene soltanto per archivio/fallback o prima del ritorno cloud.
- riconciliazione idempotente delle transizioni ambigue all'avvio, con verifica di nodo, epoch, versione e operationId e blocco fail-closed se Supabase non è raggiungibile;
- richieste POST solo JSON, rate limiting per sessioni/autenticazioni/controlli/scritture e pulizia periodica delle sessioni scadute;
- retention dopo backup verificato: almeno 2.000 versioni e tutte quelle degli ultimi 90 giorni, senza eliminare stato corrente o dipendenze dell'outbox.

## Prima configurazione

1. Applicare in ordine tutte le migration fino a `20260811000500_local_reconcile_and_retention.sql` inclusa.
2. Eseguire `Installa FLBP Server.cmd`: verifica Node.js 24, genera la build web, avvia la configurazione, compila l'app Windows e crea **FLBP Manager Locale** sul Desktop.
3. Collegare un solo USB/SSD non di sistema. La configurazione lo rileva, crea `FLBP Backup`, rende la replica obbligatoria e limita via NTFS `.env`, database e backup all'utente corrente e `SYSTEM`.
4. Durante la configurazione inserire URL Supabase e Secret key server. Il tunnel resta disabilitato: Admin e TV restano sul PC/LAN, mentre il sito Internet legge il mirror Supabase.
5. Avviare il collegamento **FLBP Manager Locale**. Si apre una vera finestra Windows senza schede o barra degli indirizzi; il server viene avviato in background se non è già attivo.
6. Nel pannello locale premere **Attiva modalità locale**. Solo dopo download iniziale, replica esterna verificata e acquisizione dell'epoch Supabase il server diventa primario.
7. Facoltativo ma consigliato sul PC del torneo: eseguire `Installa avvio automatico.cmd`. Il task Windows riavvia il processo al login e conserva l’output in `logs/server.log`.
8. Prima del torneo eseguire `Verifica prontezza FLBP Server.cmd`: controlla build, SQLite, replica fisica, snapshot Supabase, autorità di scrittura, origine delle letture pubbliche, epoch, lease, riconciliazione e retention senza modificare dati.

Per cambiare soltanto il disco USB/SSD senza rigenerare token o credenziali, eseguire `Configura backup secondario.cmd`, scegliere il nuovo volume e riavviare il server. La procedura aggiorna esclusivamente il percorso della replica e riapplica le ACL.

La Secret key resta nel file locale `.env`, escluso da Git. Non va mai inserita in Cloudflare Pages o nel browser. È supportata anche la precedente `service_role`, ma per nuove installazioni usare una `sb_secret_...` dedicata al server locale.

## App Windows

L'app viene compilata in `windows-app/publish` e usa il runtime Evergreen WebView2 installato in Windows. Non apre Chrome, Edge, Avast o un altro browser esterno. La barra nativa permette di passare tra **Pannello** e **FLBP Manager**, tornare indietro e aggiornare la pagina. L'ultima schermata locale viene ricordata sul PC: un riavvio del server o di WebView2 attiva retry progressivi e riapre la stessa rotta invece di riportare l'operatore alla home.

Per rigenerare soltanto l'eseguibile e i collegamenti Desktop, avviare `Compila app Windows.cmd`. Chiudere la finestra dell'app non arresta il server e non disattiva il database locale: per concludere il torneo usare sempre **Chiudi modalità locale** dal pannello, così viene completato il backup finale su Supabase.

## Spegnimento corretto

Premere **Chiudi modalità locale** nel pannello. Il server:

1. esegue il backup atomico finale;
2. verifica di possedere ancora lo stesso epoch;
3. riporta il coordinatore in modalità cloud;
4. passa in standby.

Dal primo istante della procedura il server rifiuta nuove scritture. Se la chiamata fallisce o la risposta viene persa, resta in `draining` anche dopo un riavvio e la stessa disattivazione può essere ritentata in sicurezza. SQLite torna in standby solo dopo la conferma di Supabase; questo impedisce una finestra in cui entrambi i database risultino scrivibili.

## Crash, Internet assente e spegnimento PC

- Internet assente: SQLite continua a ricevere referti; l’outbox resta sul disco e riparte al ritorno della rete.
- Browser chiuso: IndexedDB conserva i checkpoint completi; lo storage sincrono contiene soltanto il puntatore della singola finestra e non parte alcun export di rete durante `pagehide`.
- Processo terminato o PC riavviato: WAL e outbox vengono riaperti senza scartare operazioni.
- Il processo scrive sempre un log persistente e ruotato in `logs/server.log`, anche quando viene avviato direttamente dal task pianificato. Gli errori precedenti all'avvio JavaScript del launcher manuale restano in `logs/launcher.log`.
- Identità del nodo ed epoch restano nel DB: dopo un riavvio il server riprende subito lo stesso heartbeat.
- Riavvio durante attivazione/disattivazione/ripristino: il server avvia automaticamente la riconciliazione. Se Supabase è irraggiungibile resta bloccato; non decide mai da solo di essere primario.
- Heartbeat scaduto: Supabase espone `recovery`, non cloud scrivibile. Il pubblico continua a vedere l’ultimo mirror; le scritture restano sospese finché l’operatore recupera il PC o esegue un failover esplicito.
- PC non recuperabile ma journal remoto integro: un server sostitutivo scarica l’ultimo backup, riproduce in ordine le operazioni successive dal journal Supabase e rifiuta l’attivazione se rileva un buco di versione.
- PC e disco definitivamente persi: solo dopo la scadenza della lease, un Admin Supabase può usare il pulsante di failover d’emergenza; l’epoch viene incrementato e il vecchio processo resta revocato se ricompare.
- Guasto fisico del disco prima che l’outbox sia arrivata a Supabase: nessun software su un solo disco può garantire zero perdita. Per il torneo usare UPS e un secondo supporto/backup del folder `data`.

La replica sincrona è obbligatoria. Vengono conservate le ultime 24 copie autonomamente ripristinabili dello stato applicativo corrente, ciascuna con snapshot privato/pubblico, metadati e operazioni pending; le vecchie righe di audit restano nel DB primario. Questo evita di copiare centinaia di MB a ogni referto e mantiene libere le letture pubbliche anche durante una raffica. Al riavvio una copia già verificata della medesima versione viene riutilizzata, senza duplicarla. Se il supporto viene scollegato dopo il commit SQLite ma prima della copia, la risposta resta di errore ritentabile: lo stesso `operationId` completerà la replica senza duplicare la modifica. Proteggere il disco secondario con BitLocker perché contiene lo snapshot privato del torneo.

## Ripristino dalla replica secondaria

1. Arrestare completamente FLBP Server (anche il task pianificato, se in esecuzione).
2. Avviare `Ripristina backup FLBP Server.cmd` e scegliere una copia `.sqlite`; lasciando vuoto viene usata la più recente della replica configurata.
3. Il programma esegue `PRAGMA integrity_check`, controlla schema/workspace, ricopia e ricontrolla il file. Il DB precedente e gli eventuali WAL/SHM vengono spostati in una cartella `pre-restore-*`, non cancellati.
4. Avviare il server. Se il backup era primario, tutte le scritture restano bloccate in `restore-pending`.
5. Premere **Risolvi transizione**: la RPC service-only verifica nodo, epoch, versione e ultima operationId. Non esiste un reset manuale che possa forzare le scritture.

Non confermare la ripresa se sul cloud è già stato eseguito il failover d'emergenza. In quel caso l'epoch precedente è revocato e i dati del backup devono essere riconciliati prima di una nuova attivazione.

## Confine delle sorgenti e identità del nodo

Il server desktop compila e serve esclusivamente `FLBP ONLINE/dist`: quella è la sorgente applicativa canonica sia per il sito sia per la finestra locale. La cartella storica `FLBP LOCALE` non viene caricata dal server e non va modificata aspettandosi effetti sull'app Windows.

Non copiare mai la cartella `data` su un secondo PC per creare un clone: contiene `node_id`, epoch e outbox dell'autorità locale. Per sostituire il computer usare soltanto la procedura di ripristino verificato. Finché il PC primario non è fisicamente spento o revocato, non attivare un secondo server sullo stesso workspace, anche se la rete del primo sembra assente.

## Comandi

```powershell
npm run check
npm test
npm run preflight
npm run restore -- --backup "E:\FLBP Backup\flbp-local-v123-....sqlite"
npm start
```

Il pannello è disponibile su `http://localhost:8787/`; la web app identica a quella pubblica è su `http://localhost:8787/app/`. Le TV sulla stessa rete aprono `http://IP-DEL-PC:8787/app/`: interrogano SQLite con ETag circa ogni secondo e non generano traffico Supabase.
