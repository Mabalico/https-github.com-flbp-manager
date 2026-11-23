# Scelta della persistenza

La schermata di sincronizzazione e la factory dei repository usano entrambe `getDataPersistenceMode()` in `services/repository/featureFlags.ts`.

L'ordine è: blocco remoto del deployment, preferenza esplicita `flbp_data_persistence_mode`, flag legacy `flbp_remote_repo`, configurazione ambiente, disponibilità Supabase. Un deployment con Supabase configurato, `VITE_REMOTE_REPO=1` e senza `VITE_ALLOW_LOCAL_ONLY=1` usa sempre il repository remoto, anche se il browser conserva un vecchio flag locale impostato a `0`.

Le installazioni che consentono esplicitamente il funzionamento locale mantengono questa possibilità. Il cambiamento non cancella stato, backup o bozze: normalizza soltanto la decisione sulla destinazione delle scritture. La setter esistente corregge i due flag quando si tenta di selezionare la modalità locale in un deployment bloccato.

`npm run test:persistence` esegue la matrice di configurazione e storage sui resolver reali, incluse preferenze incompatibili, storage indisponibile e tentativo di aggirare il blocco remoto. La stessa correzione e la stessa suite sono presenti in ONLINE e LOCALE.

L'esportazione automatica riusa lo snapshot già confermato per lo stesso contenuto e la stessa base remota. Se il database rifiuta una base superata, il client verifica lo snapshot remoto prima di riconoscere il salvataggio. Il confronto include l'intero stato JSON e conserva l'ordine degli array. Una differenza resta un conflitto da risolvere.

Una sola esportazione automatica è attiva per scheda. Le modifiche in arrivo sostituiscono quelle ancora in coda. Gli errori del mirror pubblico compaiono nella diagnostica della sincronizzazione strutturata. In ONLINE il nuovo tentativo rispetta la pausa progressiva e riusa lo snapshot confermato se il cursore coincide ancora. `npm run test:cloud-durability` verifica questi casi con un database simulato.
