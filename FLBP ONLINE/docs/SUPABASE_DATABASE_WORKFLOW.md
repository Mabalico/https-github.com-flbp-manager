# Workflow database Supabase

Il workflow `.github/workflows/supabase-db-deploy.yml` usa le migration canoniche in `FLBP ONLINE/supabase/migrations/` e il progetto configurato da `SUPABASE_PROJECT_ID`. Tutti i percorsi restano associati all'environment GitHub `production` e alla medesima concurrency.

## Anteprima

Avvio manuale con `mode=dry-run` e `confirm=RUN`: controlla la configurazione, collega il CLI al progetto, legge la storia e lancia `supabase db push --dry-run`. Non esegue SQL né modifica la storia remota. Un disallineamento della storia produce un errore da esaminare; non attiva una riparazione automatica.

## Applicazione

Un push su `main` che interessa le migration/configurazione o il workflow esegue solo l'anteprima (`supabase db push --dry-run`): non applica nulla. L'apply parte soltanto da un avvio manuale con `mode=apply` e `confirm=RUN` e, nell'ordine, esegue anteprima, `supabase db push --yes` e controllo finale di convergenza.

Dopo la convergenza viene eseguito `supabase/tests/deployed_stabilization_readonly.sql`: una transazione in sola lettura verifica i permessi Admin/restore e il rifiuto di metadati utente contraffatti. Non esporta né ripristina dati applicativi. Oltre a `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`, questo controllo usa il secret GitHub `SUPABASE_DB_URL` del medesimo progetto. Il probe viene verificato prima dalla CI su PostgreSQL sacrificabile.

Non vengono eseguiti repair, retry che cambiano la storia o `--include-all` impliciti. Se il deploy fallisce, verificare l'errore e lo schema reale prima di correggere la storia o ripetere l'applicazione.

## Pulizia delle righe di tornei non usate

`20261127000100_cleanup_orphan_tournament_rows.sql` elimina una volta le righe private di `tournaments` lasciate da tornei annullati o eliminati. Tocca solo righe che non sono il torneo live né nello storico di `workspace_state`, non sono pubblicate, non hanno squadre, gironi, partite o squadre Fanta e non cambiano da almeno un giorno. La funzione `flbp_cleanup_orphan_tournament_rows` non è richiamabile dal sito.

## Riparazione della sola storia

È una run manuale distinta: `mode=repair-history`, `confirm=REPAIR`, `repair_versions` con le versioni di 14 cifre separate da un singolo spazio, `repair_status=applied` oppure `reverted`. `RUN` non autorizza questa modalità. Il workflow mostra la storia prima e dopo la riparazione e **non applica migration SQL**.

- `applied` registra come eseguite solo le versioni indicate, che devono esistere anche nella cartella locale. Prima di usarlo, verificare sul progetto selezionato che gli effetti SQL siano già presenti: il repair non li crea.
- `reverted` rimuove dalla storia le sole versioni indicate, anche se il relativo file non esiste più localmente. Non annulla gli effetti SQL già presenti nel database.

Il file `supabase/migration-baseline.txt` è un riferimento storico, non un'autorizzazione a marcare automaticamente versioni sul progetto corrente. Dopo un repair verificato, eseguire una nuova run `dry-run`; l'eventuale `apply` resta un'operazione successiva distinta.

## Versione della CLI

Il workflow installa la CLI Supabase `2.122.1`, l'ultima della linea v2. Dal 2 novembre 2026 `latest` è la v3, che cambia il contratto dei comandi usati qui: `db push`, `migration list` e `migration repair` puntano allo stack locale se non si passa `--remote`, `--linked` è deprecato e ogni modifica a un progetto hosted richiede conferma oppure `--yes`. Con `latest` la run del 16 novembre 2026 si è fermata all'anteprima (`db push --dry-run` cercava un database su `127.0.0.1:54322`) senza applicare nulla.

Per passare alla v3 aggiornare insieme versione e comandi seguendo la [guida di migrazione](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3), e verificare che il controllo di convergenza riconosca ancora il messaggio di database aggiornato. Anche i workflow di deploy delle Edge Function (`supabase-functions-deploy.yml` e i tre workflow per singola function) sono fissati a `2.122.1` e vanno aggiornati insieme a questo.
