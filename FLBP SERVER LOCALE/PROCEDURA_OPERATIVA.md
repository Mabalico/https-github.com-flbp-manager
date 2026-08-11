# Procedura operativa e di emergenza

## Prima del torneo

1. Collegare l'unico USB/SSD destinato a `FLBP Backup` e non scollegarlo durante il torneo.
2. Avviare `Verifica prontezza FLBP Server.cmd`. Tutti i controlli devono essere `PASS`.
3. Aprire `FLBP Manager Locale`, lasciare il server in standby e fare un backup immediato.
4. Premere `Attiva modalità locale` soltanto all'inizio della gestione torneo.
5. Verificare nel pannello: autorità `SQLite locale`, transizione `idle`, replica esterna alla stessa versione e `Operazioni in coda = 0` dopo il ritorno della rete.
6. Aprire una sola finestra Admin. Le altre finestre Admin devono mostrare `Sola lettura`; usare il takeover solo se la precedente è stata realmente abbandonata.
7. Aprire le TV sulla LAN con `http://IP-DEL-PC:8787/app/`. Le TV leggono SQLite e non possono scrivere.

## Durante il torneo

- Una modifica è confermata soltanto quando SQLite e replica esterna hanno la stessa versione leggibile.
- Se compare un conflitto `409`, non forzare: scegliere `Ricarica e riconcilia` oppure `Esporta bozza`.
- La perdita di Internet non interrompe Admin e TV LAN. L'outbox resta su SQLite e riparte automaticamente; il sito pubblico può essere in ritardo fino al limite operativo previsto.
- Se il supporto esterno viene scollegato, ricollegarlo e ripetere la stessa operazione. L'operationId rende il retry idempotente.
- Non chiudere la modalità locale spegnendo il processo. Usare sempre `Chiudi modalità locale`.

## Chiusura corretta

1. Attendere che non ci siano salvataggi in corso.
2. Premere `Chiudi modalità locale`.
3. Verificare `STANDBY`, transizione `idle`, `Operazioni in coda = 0`.
4. Eseguire `Verifica prontezza FLBP Server.cmd` e confrontare versione, checksum e ultima operationId fra SQLite, replica e Supabase.
5. Solo dopo queste verifiche è possibile scollegare il supporto esterno o spegnere il PC.

## Riavvio, crash o risposta persa

- Gli stati `deactivating`, `deactivation-error`, `activation-error` e `restore-pending` vengono riconciliati automaticamente all'avvio.
- Se il pannello mostra una transizione non risolta, premere `Risolvi transizione`. Il server resta fail-closed finché Supabase non conferma lo stesso nodo, epoch, versione e operationId.
- Se Supabase è irraggiungibile durante una transizione ambigua, non tentare reset o modifiche dirette al database. Ripristinare Internet e ripetere la riconciliazione.
- Se l'epoch è revocato, il vecchio DB resta definitivamente non scrivibile. Esportare i dati e procedere con una riconciliazione amministrativa, senza riattivarlo a forza.

## Ripristino dal supporto esterno

1. Arrestare server e task pianificato.
2. Eseguire `Ripristina backup FLBP Server.cmd` e scegliere la copia desiderata.
3. Il programma verifica integrità e schema, sposta il DB precedente in `pre-restore-*` e non lo cancella.
4. Riavviare il server e usare `Risolvi transizione`.
5. Controllare una vista Admin e due viste TV prima di riprendere le scritture.

## Cose da non fare

- Non cancellare `.sqlite`, `-wal`, `-shm`, backup o outbox.
- Non copiare la Secret key Supabase nel frontend o in Cloudflare Pages.
- Non riattivare il tunnel Cloudflare: le letture Internet arrivano dal mirror Supabase.
- Non usare un backup sullo stesso volume del database principale.
- Non accettare una falsa conferma di salvataggio quando la replica esterna non è disponibile.
