# Conflitti di salvataggio e recupero della bozza

Il titolo aggiunto in Integrazioni viene salvato nello stato dell’app. Il database verifica la versione da cui è partita la modifica: una versione cambiata può dipendere da un altro salvataggio, un referto o dall’attivazione della modalità locale. Il messaggio di conflitto protegge la bozza della finestra e i dati già confermati nel database.

Le modifiche indipendenti vengono conciliate da `services/repository/RemoteRepository.ts` quando dispone della versione di partenza necessaria per confrontarle. Le risposte relative a un salvataggio precedente non devono chiudere o sostituire una bozza modificata successivamente: il repository verifica anche quale operazione sta confermando. La scelta manuale serve quando due modifiche interessano gli stessi dati oppure quando una bozza recuperata non contiene una versione di partenza verificabile. Aggiungere un titolo non richiede di per sé una sovrascrittura dell’intero database.

## Confrontare e scegliere

1. Apri **Dati → Salvataggio e sincronizzazione** e premi **Confronta con il database principale**, disponibile anche nel messaggio di conflitto.
2. Controlla il database indicato: **database del PC server** quando la modalità locale è attiva, **Supabase** quando è attivo il cloud. Il confronto non scrive dati e mostra la versione, i titoli, i tornei archiviati, le integrazioni marcatori e il riepilogo del torneo live.
3. Per recuperare un titolo manuale aggiunto o il nome di un’edizione, usa **Recupera titoli e rinomine dalla bozza**. Spunta le singole voci e premi **Salva modifiche selezionate**. Non occorre esportare o importare file. La rinomina aggiorna anche i nomi nei titoli e nelle integrazioni collegate; risultati, referti e ogni altra differenza restano quelli del database. Nessuna voce è preselezionata.
4. Per altre differenze, apri **Scegli un’intera versione**. Se il database contiene la versione corretta, scegli **Usa la versione del database in questa finestra**. La conferma chiude la bozza recuperabile solo dopo averne registrato durevolmente l’abbandono.
5. Se l’intera bozza è corretta, scegli **Recupera la bozza nel database del PC server** oppure **Sovrascrivi Supabase con questa versione locale**. Viene preparato un nuovo confronto: controlla i riepiloghi, seleziona la conferma e scrivi `SOVRASCRIVI`. Nessuna scrittura parte prima della conferma finale.

L’esportazione resta disponibile per conservare una copia. Il recupero selettivo propone solo nuovi titoli manuali con identificatori univoci e rinomine di edizioni non live presenti in entrambe le copie: non propone sostituzioni di premi esistenti, premi generati dai risultati, cancellazioni o referti. Le differenze possono provenire da una bozza precedente: la scelta esplicita serve a confermare quali sono ancora desiderate.

Non occorre chiudere la modalità locale per confrontare la bozza con SQLite. In modalità **Scritture sospese** il confronto operativo e il recupero restano bloccati fino alla risoluzione della transizione dal pannello server.

## Protezioni del recupero

L’anteprima conserva database di destinazione, epoch, versione e identità della bozza. Se cambia la destinazione o la bozza, si deve ripetere il confronto. Il recupero selettivo costruisce una nuova bozza dalla versione attuale del database e passa da `RemoteRepository.reconcileDraft`: registra un nuovo checkpoint durevole e usa i normali controlli di versione e di accesso Admin. Se nel frattempo arriva una modifica indipendente, il normale confronto a tre versioni la conserva; se interessa gli stessi dati, il salvataggio si ferma senza forzare la scrittura. La bozza precedente viene chiusa solo quando la sostituzione è durevole.

Sul PC server il recupero dell’intera bozza passa dall’endpoint `/recover-local`, conserva i referti autorevoli più recenti e verifica la copia sul disco secondario. Il recupero selettivo usa invece il normale salvataggio Admin con controllo di versione. La versione precedente rimane nella cronologia SQLite. La sincronizzazione con Supabase viene eseguita dal server; il browser non avvia un’esportazione diretta delle tabelle cloud durante il recupero locale. Nel cloud restano attive le protezioni dei referti, della sessione di scrittura e delle viste Fanta/live.

## Applicazione locale

Il server Windows serve **`FLBP ONLINE/dist`**: la sorgente React è condivisa con il sito. La cartella storica **`FLBP LOCALE`** non viene caricata dal server. Dopo una modifica del frontend, ricompila `FLBP ONLINE` e ricarica l’app locale per usare la nuova interfaccia.
