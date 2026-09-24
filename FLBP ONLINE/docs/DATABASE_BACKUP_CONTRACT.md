# Contratto del backup applicativo

Il file `flbp_application_database_backup`, versione 1, riguarda un solo workspace. Non è un dump del progetto Supabase: account Auth, password, segreti, storage e configurazione del provider non vengono esportati o ricreati. La membership Admin esistente resta invariata, anche quando un vecchio file contiene `admin_users` o `workspaces`.

Le tabelle applicative esistenti sono elencate in `flbp_database_backup_table_order()`. Il nuovo exporter legge lo snapshot sotto lock; `fanta_rosters` viene filtrata attraverso le squadre del workspace. Le tabelle di recovery aggiuntive sono evidenze diagnostiche: il ripristino conserva journal, lease ed epoca attuali, crea una nuova versione e ricostruisce il mirror live. Non riattiva la leadership contenuta in un vecchio file.

Il restore richiede lo schema ONLINE moderno, tutte le tabelle correnti presenti nel file e snapshot privato/pubblico validi. File incompleti, righe di altri workspace, colonne sconosciute e dati incompatibili vengono rifiutati. Per file che richiedono un adattamento di schema, preparare una conversione verificata su database isolato; non ignorare le tabelle mancanti. Il backup JSON dello stato App resta un formato separato con il suo percorso di compatibilità.

## Ordine di distribuzione

1. Far passare Supabase CI sullo schema completo; controllare la storia delle migration con la modalità dry-run del workflow.
2. Applicare le migration additive `20260924000100` e `20260924000200` allo schema ONLINE aggiornato.
3. Distribuire la cartella Edge `database-backup-admin`, inclusi `index.ts` e `operations.ts`.
4. Distribuire il frontend e collaudare export/restore su un workspace di prova.

Prima di un restore, il frontend chiede `action: capabilities`. Una vecchia Edge che non dichiara `transactionalRestore: 1` viene fermata senza inviare la richiesta distruttiva. Una nuova Edge con migration assente restituisce errore e non usa il vecchio percorso REST. La ricevuta deve contenere workspace, versione, ID operazione e checkpoint coerenti; risposte incomplete e problemi di connessione restano esiti incerti, con scritture sospese.

## Checkpoint precedente al restore

`public.database_restore_checkpoints` contiene il payload precedente, l'attore, l'ID operazione e il risultato della transazione. È protetta da RLS e non è accessibile dai ruoli client. Il checkpoint viene salvato nella stessa transazione: un restore fallito lascia intatto il database e non produce un falso checkpoint di successo.

Un amministratore database può leggere il checkpoint con una query di sola lettura, sostituendo gli identificatori con quelli dell'operazione da esaminare:

```sql
select created_at, actor_id, result, previous_backup
from public.database_restore_checkpoints
where workspace_id = 'WORKSPACE_DA_ESAMINARE'
  and operation_id = 'OPERAZIONE_DA_ESAMINARE';
```

Il valore `previous_backup` è un backup applicativo riutilizzabile tramite il normale percorso di ripristino, con un nuovo ID operazione. Non è prevista cancellazione automatica dei checkpoint in questo intervento: retention e dimensioni vanno definite operativamente. Non distribuire questi payload come artefatti pubblici: possono contenere dati privati del workspace.

Verifiche e limiti sono documentati in `DATABASE_RESTORE_VERIFICATION.md` e `DATABASE_RESTORE_UI.md`. La concorrenza multi-sessione, le dimensioni di produzione e il comportamento del gateway richiedono il collaudo sullo stack Supabase nativo; non sono sostituiti dai test in memoria.
