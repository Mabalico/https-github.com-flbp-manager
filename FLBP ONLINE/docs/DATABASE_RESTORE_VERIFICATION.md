# Verifica del ripristino transazionale

La migration `20260924000200_database_backup_atomic_restore.sql` è verificata con due suite complementari. Nessuna delle due usa dipendenze dell'app per collegarsi alla produzione.

## Interfaccia backend

- `flbp_export_application_database(p_workspace_id text)` restituisce direttamente il payload `flbp_application_database_backup`, con `tables`, `recovery` e `warnings`.
- `flbp_restore_application_database(p_workspace_id text, p_backup jsonb, p_actor_id uuid, p_operation_id text, p_lease_holder text default null)` restituisce `{ ok, workspaceId, operationId, checkpointId, version, summary, warnings }`.
- Entrambe sono eseguibili solo dalla service role. Il restore verifica inoltre che `p_actor_id` appartenga realmente ad `admin_users`. L'Edge Function deve ricavare questo valore dalla sessione verificata, non accettarlo come autorità dal file/browser.
- Un retry deve usare lo stesso `operationId` e lo stesso payload: restituisce il risultato memorizzato; un payload diverso con lo stesso ID viene rifiutato.

## Suite minima con fault injection

```powershell
node scripts/test-database-restore.mjs --pglite C:\percorso\runtime-test\node_modules\@electric-sql\pglite\dist\index.js
```

`tests/databaseRestore.fixture.sql` aggiunge uno schema moderno minimo alle vere tabelle/RLS del repository. Il runner carica dalle migration effettive il gate Admin, i trigger di versione, il lease, il sanitizer live e le funzioni di restore. PGlite esegue PostgreSQL in memoria; non è un'emulazione JavaScript delle query.

I 35 controlli coprono:

- Ruoli anon/authenticated respinti; service role senza un attore Admin reale respinta.
- Export Fanta limitato al workspace e inclusione delle evidenze di recovery.
- Rifiuto di schema/versione/workspace errati, tabelle incomplete, conteggi errati, colonne o tabelle sconosciute e righe/rose appartenenti ad altri workspace.
- Data plane `local`/`recovery` e lease di un altro writer respinti prima delle cancellazioni.
- Errore intenzionale durante INSERT dopo vere cancellazioni: vengono recuperati righe, snapshot, checkpoint, versioni e sequenza degli ID. Una sequence di sola prova, non transazionale, dimostra che il DELETE è stato realmente raggiunto.
- Versione successiva maggiore sia del presente sia della cronologia; creazione di cronologia anche quando lo stato ripristinato è identico.
- Checkpoint precedente, retry idempotente, collisione tra ID operazione e file diverso, mirror live ricostruito/sanitizzato.
- Workspace B, squadre e rose Fanta invariati.
- Colonne generate ricostruite; ID serial/identity riallineati senza collisioni né arretramenti della sequenza condivisa.
- Trigger reale di protezione `__pre_tournament__` preservato e compatibile con il ripristino.
- Schema precedente al data plane moderno respinto prima di DELETE.

Durante queste prove sono stati individuati e corretti due problemi nella prima versione della migration: gli ID espliciti non avanzavano le sequenze e il container pretorneo, protetto da un trigger che impedisce DELETE, provocava un duplicato al successivo INSERT. La correzione usa `ALTER SEQUENCE ... RESTART`, [transazionale secondo PostgreSQL](https://www.postgresql.org/docs/18/sql-altersequence.html), e un upsert limitato alla tabella `tournaments`, senza disabilitare il trigger.

## Suite sullo schema completo

In CI, dopo l'avvio dello stack Supabase locale e l'applicazione di tutte le migration:

```powershell
node scripts/test-database-restore-schema.mjs --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Il runner usa `psql` con `ON_ERROR_STOP`, accetta solo URL loopback senza parametri che sovrascrivano l'host, e carica `supabase/tests/database_restore_schema.sql`. Tutte le fixture e gli helper vengono annullati con `rollback`. Il file non è pgTAP: eseguirlo col runner o `psql`, non `pg_prove`.

La stessa suite è eseguibile senza Docker:

```powershell
node scripts/test-database-restore-schema.mjs --pglite C:\percorso\runtime-test\node_modules\@electric-sql\pglite\dist\index.js
```

Questa modalità applica in ordine **tutte le migration ONLINE**, inclusa la storia delle istruzioni necessaria alle migration che rileggono `supabase_migrations.schema_migrations`. Verifica il grafo FK effettivo tramite `pg_constraint`, la catena reale tornei/squadre Fanta/rose, rollback dopo le cancellazioni, blocco locale/recovery, file incompleto, container pretorneo, isolamento workspace, checkpoint, versioni, mirror live e retry.

Il 24 settembre 2026 sono state applicate con successo **69 migration ONLINE** su PGlite 0.3.16 e la suite completa è passata. Sono passati anche i 35 controlli della suite minima. I log sono in `outputs/audit-2026-09-24/database-restore-tests.log` e `database-restore-full-schema-tests.log` nella root del workspace.

## Compatibilità LOCALE e limiti

La nuova migration è copiata anche in `FLBP LOCALE`. Su uno schema legacy già esistente crea le RPC, ma il restore richiede esplicitamente `flbp_data_plane`, `workspace_state_versions` e la funzione che ricostruisce il mirror live. Se mancano, fallisce prima delle scritture. Non trasferire o ricreare automaticamente lease/epoche da un backup per aggirare questo controllo.

La prova opzionale `--pglite <modulo> --legacy` evidenzia un ulteriore problema preesistente nella copia LOCALE: due file di luglio hanno entrambi la versione `20260704000100`, incompatibile con la chiave della storia migration Supabase. Non sono stati rinominati file storici in questo intervento. Questa copia non è il percorso per ricreare il backend ONLINE canonico.

PGlite usa una singola connessione: le prove non simulano contesa tra sessioni concorrenti, timeout Edge, limiti dimensionali del provider o perdita di connessione HTTP dopo un commit. Le funzioni Auth sono fixture di claim; JWT e servizi HTTP vanno collaudati nello stack Supabase. Le evidenze `recovery` sono informative: il restore conserva il journal e la leadership attuali, crea una nuova versione e ricostruisce il live invece di riprodurre vecchi lease.

Non sono stati eseguiti deployment o operazioni su database live. Il runner PostgreSQL nativo è pronto per CI; Docker/CLI/psql non erano installati durante la verifica locale.
