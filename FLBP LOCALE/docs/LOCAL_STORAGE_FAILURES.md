# Errori di salvataggio nel browser

La copia LOCALE applica la stessa gestione della copia ONLINE: `saveState` propaga gli errori, `LocalRepository` segnala modifiche non salvate e l'indicatore resta disponibile in memoria anche se lo storage è pieno. Il messaggio Admin è visibile anche su mobile.

Mantieni aperta la finestra e scarica il backup previsto dall'app quando compare l'errore. Dopo aver ripristinato lo storage, una nuova modifica ritenta il salvataggio dello stato corrente. Solo il salvataggio riuscito riporta l'indicatore alla conferma. Non è stato aggiunto un journal offline: la copia in memoria non sopravvive alla chiusura.

L'attivazione della modalità locale si interrompe, senza ricaricare la pagina, se non è possibile salvare lo snapshot iniziale o la preferenza.

Verifica: `node --test tests/repository/localStorageFailure.test.mjs`. La suite copre errori reali simulati al confine dello storage ed esegue servizi e callback del repository.
