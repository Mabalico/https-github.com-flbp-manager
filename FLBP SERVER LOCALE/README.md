# FLBP Server Locale

Server Windows per il data plane critico del torneo. Serve la stessa build React di `FLBP ONLINE`, conserva lo stato in SQLite/WAL e coordina con Supabase quale nodo può scrivere.

## Garanzie implementate

- commit SQLite atomico con `journal_mode=WAL` e `synchronous=FULL`;
- versione monotona e `operationId` idempotente per ogni scrittura;
- storico completo locale di ogni snapshot;
- outbox append-only, ritentata senza duplicare operazioni;
- patch per singola partita con protezione anti-regressione del referto;
- epoch di leadership e heartbeat Supabase;
- attivazione compare-and-switch: versione, contenuto, journal ed epoch cloud devono essere ancora identici allo snapshot scaricato;
- nessun fallback automatico scrivibile dopo il crash del PC: si entra in `recovery` per evitare split-brain;
- backup completo dello snapshot privato/pubblico in una sola transazione Supabase ogni 30 minuti e alla disattivazione;
- replica SQLite opzionale su un secondo disco/USB; se configurata, la risposta al commit arriva solo dopo che quella versione è leggibile anche nella copia secondaria;
- disattivazione in draining persistente: backup finale e ritorno al cloud sono una singola RPC atomica e ritentabile;
- mirroring immediato delle piccole operazioni/outbox quando Internet è disponibile.
- append remoto transazionale: SQLite elimina una voce dall'outbox solo quando Supabase conferma tutte le versioni, senza collisioni o buchi nel journal;
- drain continuo dell'outbox: una commit arrivata durante un upload viene inviata nello stesso ciclo, senza attendere il backup periodico;
- sessione Admin automatica esclusivamente dal loopback del PC server: il master token non viene esposto alla web app remota;
- checkpoint browser confermato prima del push e salvataggi Admin serializzati: una risposta vecchia non può cancellare la modifica successiva;
- fallback browser completo: se `localStorage` è pieno, la bozza confermata in IndexedDB viene riletta automaticamente al reload con la propria base di concorrenza;
- scritture Admin cloud idempotenti tramite `operationId`: un retry dopo risposta persa non crea una seconda versione e un'operazione già superata non può sovrascrivere il DB;
- commit Admin unico per snapshot privato e pubblico, propagato immediatamente a pubblico, arbitri e TV;
- sync normalizzata Supabase sospesa mentre SQLite è primario e riattivata al ritorno cloud.

## Prima configurazione

1. Eseguire la migration `FLBP ONLINE/supabase/migrations/20260801000100_local_data_plane_and_version_history.sql`.
2. Eseguire `Installa FLBP Server.cmd`: verifica Node.js 24, genera la build web, avvia la configurazione e crea **FLBP Server Locale** sul Desktop.
3. Durante la configurazione inserire URL Supabase, Secret key server, origine Cloudflare e URL del tunnel.
4. Configurare un tunnel HTTPS stabile verso `http://127.0.0.1:8787` usando il modello `cloudflared-config.example.yml`.
5. Avviare il tunnel e poi il collegamento **FLBP Server Locale**. Un secondo avvio riconosce il processo esistente e non apre un duplicato. Con Microsoft Edge il pannello viene mostrato in una finestra applicazione dedicata.
6. Nel pannello locale premere **Attiva modalità locale**. Solo dopo il download iniziale e l’acquisizione dell’epoch Supabase il server diventa primario.
7. Facoltativo ma consigliato sul PC del torneo: eseguire `Installa avvio automatico.cmd`. Il task Windows riavvia il processo al login e conserva l’output in `logs/server.log`. Se `cloudflared` e `%USERPROFILE%\.cloudflared\config.yml` sono già presenti, installa anche il task sorvegliato del tunnel e scrive `logs/tunnel.log`; se cloudflared è già un servizio Windows non crea duplicati.
8. Prima del torneo eseguire `Verifica prontezza FLBP Server.cmd`: controlla build, accesso SQLite, snapshot/versioni Supabase, RPC del coordinatore, append transazionale, RPC Admin v2, journal remoto e raggiungibilità HTTPS del tunnel senza modificare dati.

La Secret key resta nel file locale `.env`, escluso da Git. Non va mai inserita in Cloudflare Pages o nel browser. È supportata anche la precedente `service_role`, ma per nuove installazioni usare una `sb_secret_...` dedicata al server locale.

## Spegnimento corretto

Premere **Chiudi modalità locale** nel pannello. Il server:

1. esegue il backup atomico finale;
2. verifica di possedere ancora lo stesso epoch;
3. riporta il coordinatore in modalità cloud;
4. passa in standby.

Dal primo istante della procedura il server rifiuta nuove scritture. Se la chiamata fallisce o la risposta viene persa, resta in `draining` anche dopo un riavvio e la stessa disattivazione può essere ritentata in sicurezza. SQLite torna in standby solo dopo la conferma di Supabase; questo impedisce una finestra in cui entrambi i database risultino scrivibili.

## Crash, Internet assente e spegnimento PC

- Internet assente: SQLite continua a ricevere referti; l’outbox resta sul disco e riparte al ritorno della rete.
- Browser chiuso: i checkpoint restano in localStorage + IndexedDB; non parte alcun export di rete durante `pagehide`.
- Processo terminato o PC riavviato: WAL e outbox vengono riaperti senza scartare operazioni.
- Identità del nodo ed epoch restano nel DB: dopo un riavvio il server riprende subito lo stesso heartbeat.
- Riavvio durante la disattivazione: lo stato di draining resta sul disco; nessuna modifica viene accettata finché il retry non chiarisce quale nodo è primario.
- Heartbeat scaduto: Supabase espone `recovery`, non cloud scrivibile. Le letture possono usare l’ultimo backup, ma le scritture restano sospese finché l’operatore recupera il PC o esegue un failover esplicito.
- PC non recuperabile ma journal remoto integro: un server sostitutivo scarica l’ultimo backup, riproduce in ordine le operazioni successive dal journal Supabase e rifiuta l’attivazione se rileva un buco di versione.
- PC e disco definitivamente persi: solo dopo la scadenza della lease, un Admin Supabase può usare il pulsante di failover d’emergenza; l’epoch viene incrementato e il vecchio processo resta revocato se ricompare.
- Guasto fisico del disco prima che l’outbox sia arrivata a Supabase: nessun software su un solo disco può garantire zero perdita. Per il torneo usare UPS e un secondo supporto/backup del folder `data`.

Per usare la replica sincrona locale, indicare durante `Configura FLBP Server.cmd` una cartella appartenente a un altro volume, per esempio `E:\FLBP Backup`. Vengono conservate le ultime 24 copie complete; proteggere anche il disco secondario con BitLocker perché contiene lo snapshot privato del torneo.

## Ripristino dalla replica secondaria

1. Arrestare completamente FLBP Server (anche il task pianificato, se in esecuzione).
2. Avviare `Ripristina backup FLBP Server.cmd` e scegliere una copia `.sqlite`; lasciando vuoto viene usata la più recente della replica configurata.
3. Il programma esegue `PRAGMA integrity_check`, controlla schema/workspace, ricopia e ricontrolla il file. Il DB precedente e gli eventuali WAL/SHM vengono spostati in una cartella `pre-restore-*`, non cancellati.
4. Avviare il server. Se il backup era primario, tutte le scritture restano bloccate in `restore-pending`.
5. Premere **Conferma ripresa backup**: solo un heartbeat Supabase accettato per lo stesso `node_id` ed epoch riabilita le scritture e l'outbox.

Non confermare la ripresa se sul cloud è già stato eseguito il failover d'emergenza. In quel caso l'epoch precedente è revocato e i dati del backup devono essere riconciliati prima di una nuova attivazione.

## Comandi

```powershell
npm run check
npm test
npm run preflight
npm run restore -- --backup "E:\FLBP Backup\flbp-local-v123-....sqlite"
npm start
```

Il pannello è disponibile su `http://localhost:8787/`; la web app identica a quella pubblica è su `http://localhost:8787/app/`.
