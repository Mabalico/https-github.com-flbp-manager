# Errori di salvataggio nel browser

In modalità locale, un errore di quota, storage non disponibile o serializzazione impedisce la conferma del salvataggio. `saveState` propaga l'errore; `LocalRepository` segnala modifiche non salvate e aggiorna il timestamp soltanto dopo la scrittura dello snapshot.

Lo stato dell'errore resta disponibile in memoria anche quando il browser non riesce a scrivere la chiave usata per l'indicatore di sincronizzazione. La UI Admin mostra il messaggio anche su mobile. La copia modificata rimane nella finestra aperta: l'utente può esportare il backup già previsto dall'app prima di chiuderla. Una successiva modifica, dopo aver liberato spazio o ripristinato lo storage, ritenta il salvataggio dello stato corrente; solo una scrittura riuscita rimuove l'errore.

Il passaggio dalla modalità remota a quella locale si arresta se non riesce a salvare la copia iniziale o a memorizzare la preferenza. In questi casi non annuncia il completamento e non ricarica la pagina.

`node --test tests/repository/localStorageFailure.test.mjs` verifica quota esaurita, vecchio snapshot preservato, indicatore con storage completamente indisponibile, recupero successivo, errori di serializzazione e interruzione del passaggio alla modalità locale. La suite esegue il codice effettivo dei servizi e della callback UI, sostituendo soltanto lo storage e il browser.

Il fallback dell'indicatore è temporaneo: non costituisce una seconda copia durevole dei dati. Questo intervento non introduce un journal offline aggiuntivo.
