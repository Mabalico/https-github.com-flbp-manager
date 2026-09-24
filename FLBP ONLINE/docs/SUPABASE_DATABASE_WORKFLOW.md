# Workflow database Supabase

Il workflow `.github/workflows/supabase-db-deploy.yml` usa le migration canoniche in `FLBP ONLINE/supabase/migrations/` e il progetto configurato da `SUPABASE_PROJECT_ID`. Tutti i percorsi restano associati all'environment GitHub `production` e alla medesima concurrency.

## Anteprima

Avvio manuale con `mode=dry-run` e `confirm=RUN`: controlla la configurazione, collega il CLI al progetto, legge la storia e lancia `supabase db push --dry-run`. Non esegue SQL né modifica la storia remota. Un disallineamento della storia produce un errore da esaminare; non attiva una riparazione automatica.

## Applicazione

Un push su `main` che interessa le migration/configurazione o il workflow mantiene il deploy automatico esistente. L'avvio manuale richiede `mode=apply` e `confirm=RUN`. Entrambi eseguono anteprima, `supabase db push --yes` e controllo finale di convergenza.

Dopo la convergenza viene eseguito `supabase/tests/deployed_stabilization_readonly.sql`: una transazione in sola lettura verifica i permessi Admin/restore e il rifiuto di metadati utente contraffatti. Non esporta né ripristina dati applicativi. Oltre a `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`, questo controllo usa il secret GitHub `SUPABASE_DB_URL` del medesimo progetto. Il probe viene verificato prima dalla CI su PostgreSQL sacrificabile.

Non vengono eseguiti repair, retry che cambiano la storia o `--include-all` impliciti. Se il deploy fallisce, verificare l'errore e lo schema reale prima di correggere la storia o ripetere l'applicazione.

## Riparazione della sola storia

È una run manuale distinta: `mode=repair-history`, `confirm=REPAIR`, `repair_versions` con le versioni di 14 cifre separate da un singolo spazio, `repair_status=applied` oppure `reverted`. `RUN` non autorizza questa modalità. Il workflow mostra la storia prima e dopo la riparazione e **non applica migration SQL**.

- `applied` registra come eseguite solo le versioni indicate, che devono esistere anche nella cartella locale. Prima di usarlo, verificare sul progetto selezionato che gli effetti SQL siano già presenti: il repair non li crea.
- `reverted` rimuove dalla storia le sole versioni indicate, anche se il relativo file non esiste più localmente. Non annulla gli effetti SQL già presenti nel database.

Il file `supabase/migration-baseline.txt` è un riferimento storico, non un'autorizzazione a marcare automaticamente versioni sul progetto corrente. Dopo un repair verificato, eseguire una nuova run `dry-run`; l'eventuale `apply` resta un'operazione successiva distinta.
