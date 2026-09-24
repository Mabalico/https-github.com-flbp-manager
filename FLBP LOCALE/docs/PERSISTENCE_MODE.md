# Scelta della persistenza

UI e repository usano la stessa decisione in `getDataPersistenceMode()` (`services/repository/featureFlags.ts`). Il blocco remoto del deployment prevale su preferenze esplicite, flag legacy e variabili ambiente. Quando la modalità locale è consentita, la selezione dell'utente continua a funzionare.

Un vecchio `flbp_remote_repo=0` non può più attivare il repository locale mentre la UI indica la modalità remota obbligatoria. La correzione non cancella dati o bozze del browser.

`npm run test:persistence` verifica i resolver effettivi attraverso una matrice di configurazioni, includendo storage indisponibile e aggiornamento delle preferenze senza cancellare lo stato applicativo. La documentazione estesa si trova anche nella copia ONLINE, `docs/PERSISTENCE_MODE.md`.
