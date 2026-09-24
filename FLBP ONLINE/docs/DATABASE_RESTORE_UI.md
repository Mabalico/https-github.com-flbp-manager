# Ripristino completo: stato della schermata e salvataggi

Il ripristino completo passa dall'App che possiede le code di salvataggio. Le due conferme Admin rimangono; viene creato un ID operazione unico prima della richiesta, riutilizzato per tutti i tentativi della stessa operazione.

1. L'App sospende modifiche e autosave, cancella il debounce e conserva l'ultima modifica ancora in attesa. Repository e sincronizzazione delle tabelle attendono le richieste già inviate; le bozze non sono eliminate in questa fase.
2. La richiesta di ripristino viene inviata soltanto dopo questa pausa. Il database esegue il ripristino atomico e restituisce la ricevuta con versione e ID operazione.
3. L'App legge lo snapshot del workspace con `requireVersion: true`. Accetta solo il workspace atteso e una versione almeno pari a quella confermata.
4. Solo dopo questa lettura chiude le bozze recuperabili, aggiorna il cursore del repository, lo stato React e il riferimento usato dal lifecycle. Elimina le cache pubbliche e la selezione torneo; rimonta i form Admin per scartare le bozze basate sul database precedente.
5. Riattiva i salvataggi e mostra la conferma. Lo snapshot ripristinato non viene riscritto dal debounce e non avvia una ricostruzione delle tabelle normalizzate: fanno già parte del backup completo.

In caso di lettura finale fallita, la schermata rimane bloccata con **Riprova recupero**. Questo comando ripete soltanto la lettura dopo una ricevuta valida. Prima della ricevuta ripete la stessa operazione idempotente. Un timeout non prova che il database abbia annullato il ripristino: il blocco rimane anche se un tentativo successivo trova la sessione scaduta. **Annulla ripristino** compare solo quando nessun tentativo è rimasto incerto e il servizio certifica che non c'è stato un commit (oppure la preparazione è fallita prima dell'invio).

Non viene usato un reload della pagina. Il lifecycle esegue solo il checkpoint di una modifica effettivamente in attesa e non scrive durante il ripristino. I callback Admin e i caricamenti differiti della sincronizzazione precedenti al ripristino sono invalidati.

Le garanzie riguardano le code della finestra corrente; la concorrenza fra finestre/dispositivi è gestita dalle versioni e dai controlli del servizio/database. Il test automatico usa fixture locali: non effettua ripristini su un database reale.

## Errori di salvataggio locale

Un errore di `LocalRepository.save` interrompe il percorso di sincronizzazione e lascia lo stato in memoria. Un avviso Admin visibile anche su mobile mostra l'errore e indica di esportare un backup prima di chiudere o ricaricare la pagina. Il checkpoint prima del ripristino deve riuscire; altrimenti la richiesta remota non parte.

## Verifica

`node scripts/test-restore-ui.mjs` esegue il coordinatore reale, i callback App estratti via AST, i metodi del repository, la sincronizzazione strutturata e le cache pubbliche. Copre pausa/drain, successi, rifiuti, timeout, retry, readback obsoleto, chiusura bozze, callback superati dal restore, errori quota e invalidazione di letture pubbliche ancora in volo. Non scrive file temporanei e non richiede credenziali.
