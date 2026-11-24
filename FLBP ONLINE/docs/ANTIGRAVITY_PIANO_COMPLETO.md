# Revisione Antigravity del piano FLBP Manager

Esegui una sola revisione funzionale dal ramo `codex/flbp-improvement-review`, che riunisce i blocchi 1–21. Registra il commit verificato e la versione del database. Usa un workspace e un progetto Supabase di prova per le scritture, le migration e le simulazioni di errore.

## Preparazione

- Le PR **#39–43** sono già in `main`. Nel ramo di verifica sono presenti la catena live **#44 → #47 → #48**, la catena pubblica **#50 → #51 → #52 → #61 → #62**, quella di salvataggio **#52 → #53 → #56**, quella del motore **#44 → #54 → #59** e il ramo Dati **#49 → #63**. Il 16a (**#55**) parte da #51 e il 16c (**#57**) da #47. La bozza 21 (**#64**) parte da #63 e include #48. Sono inclusi anche **#45, #46, #58 e #60**.
- Applica nello staging le migration dei blocchi già presenti e la migration additiva Fanta del 16e (`20261124000100_fanta_real_team_match_points.sql`). Esegui i test Supabase, la verifica read-only della nuova funzione e il confronto tra snapshot privato e pubblico. Pianifica l'applicazione della migration di produzione dopo la revisione e l'unione della PR #59.
- Usa profili separati per Admin, Arbitri, visitatore e giocatore. Prova il sito a **375 e 390 px** e a **1200 e 1440 px**, e la TV a **1920×1080**. Crea tornei e account sintetici con prefisso `TST` e date di nascita inventate. Tieni credenziali, token e date di nascita fuori da screenshot e log. Verifica le scritture d'archivio e backup soltanto in staging.
- Associa ogni risultato a blocco, passo, ambiente, dimensione e commit. Per errori di rete annota endpoint o RPC, stato HTTP, ora e messaggio redatto. Per prestazioni riporta numero di squadre e partite, dispositivo, misurazione e passaggi eseguiti.

## 1–9, flusso live e stati durevoli

1. Ripeti i controlli funzionali della prima fase indicati in [Verifica 1–5](ANTIGRAVITY_VERIFICA.md). Includi logout locale su due profili, scadenza con referto in bozza, ripresa del controllo, pubblicazione dei premi, pari merito, U25, copia del riepilogo arbitri e tutti i modi TV.
2. Salva l’ultimo referto di un girone da Admin e da Area Arbitri. Verifica un singolo spareggio per gruppo, inclusi parità a tre, girone rinominato, girone finale e assegnazione del campione. Una correzione di referto oltre il turno già iniziato deve conservare il turno e avvisare l'Admin. Conferma che uno spareggio ordinario ordini la classifica lasciando invariati punti, partite, canestri e soffi.
3. Esegui le operazioni di struttura e le rinomine richieste dai blocchi 7 e 8 su dati di prova. Controlla BYE/TBD, posizione dei qualificati, codice e collegamento del referto, stampe, tabellone, vista TV e alias. Ricarica dopo il salvataggio e ripeti con due finestre.
4. Prova l’inserimento rapido da QR o codice già supportato, dalla lista e da Area Arbitri. Verifica selezione diretta, tastiera mobile, transizione al referto successivo, esito visibile e conservazione della bozza su errore. Verifica esplicitamente P-05 e P-06.

## 10–16, navigazione, capacità e audit

1. Apri collegamenti diretti, ricarica, usa Indietro e Avanti e ripeti in più lingue, inclusa una lingua RTL. Prova un tabellone da 128 squadre e la proiezione TV, annotando tempo di apertura, scorrimento, ricerca e numero di pagine. Ripeti il caso lento originale quando il relativo snapshot sintetico è disponibile.
2. Prova annullamento live con backup JSON, conferma esplicita, un solo salvataggio durevole e verifica di archivio, Albo d’oro e Fanta dopo il reload. Controlla guida, Home e Social con gli orari di convocazione e avvio. Includi la navigazione Fanta su telefono.
3. Simula 400, 503, perdita temporanea di rete e `net::ERR_ABORTED` nel salvataggio. Cattura frequenza dei retry, numero di scritture equivalenti, aggiornamenti concorrenti e recupero dopo il ripristino. Verifica che il reload durante la scrittura mantenga la bozza e che un aggiornamento remoto non sostituisca un referto pendente.
4. Genera 4×4 e 5×4 con vincolo di lato opposto. Verifica che tabelloni storici, posizione dei BYE e qualificati conservino gli slot attesi. In TV verifica vincitore e punteggio accanto al girone finale rinominato, anche su archivio senza nome precedentemente memorizzato.
5. Controlla form label/autofill, caricamento CSS/font, service worker con rete lenta o storage bloccato, download, URL oggetto e notifiche. Fai una prova Admin/Arbitri con WebSocket e logout. Controlla che l’errore originale rifiutato dal server resti consultabile.
6. Verifica Fanta con due omonimi di squadre diverse e uno spareggio a più partecipanti. Confronta punteggi per squadra nelle viste pubblica e privata. Prova premi senza attribuzione certa, rinnovo delle qualificazioni dopo una correzione e allineamento date/identità. Separa la verifica dalle decisioni di prodotto in [Audit torneo e Fanta](TOURNAMENT_ENGINE_FANTA_AUDIT.md) e [Proposta password arbitri](REFEREE_PASSWORD_VERIFIER_PROPOSAL.md).
7. Verifica gli smoke test dopo la rimozione dei file orfani e il pinning delle Actions. Usa i workflow di test con fixture. Il deploy delle funzioni Supabase resta soggetto al normale processo di rilascio.

## 17–21, interfacce operative e pubbliche

1. Prova la bozza per la struttura, la conferma di avvio, i controlli Admin con data e formula, i risultati con più partecipanti e i flussi referto da telefono. La cabina operativa deve restare in tutti i passi.
2. Apri Tornei passati, Giocatori e Statistiche marcatori. Verifica vincitore sulla riga, duplicati segnalati, origine leggibile senza estensione, dettagli tecnici su richiesta, alias solo in Giocatori, moduli chiusi inizialmente, paginazione e conteggi. Confronta [gli screenshot Integrazioni](screenshots/integrations/README.md).
3. Apri Home con e senza live, Archivio, scheda storica e Classifica. Verifica badge live nella voce Tornei anche a 1200 px, date uniche, filtri rimovibili, intestazioni sticky, premi con valori, tab unica, contrasto del vincitore e ordinamento su telefono. Confronta [gli screenshot del sito pubblico](screenshots/public/README.md). Verifica i badge distinti di Campione, Cannoniere e Difensore, i conteggi MVP e U25, Pro con quattro e cinque gare, omonimi e ritorno alla classifica da un profilo. In **Giocatori Titolati**, verifica che un nome lungo rimanga intero su una riga e che le colonne dei premi si raggiungano con lo scorrimento orizzontale.
4. Prova Gestione Dati e il ripristino dell’ultima sezione. Controlla apertura da avviso di sincronizzazione. In Arbitri verifica Copia link, Apri su un dispositivo separato, password, tavoli, contatore e confronto. La proposta QR resta da decidere.
5. Nella bozza 21 percorri **Squadre → Struttura → Partite → Arbitri → Chiusura**. Da Partite apri ciascuna vista mantenendo ricerca e stato, apri un referto dalla riga e dal pulsante fisso e prova Stampa dal menu. Simula le quattro chiavi di navigazione precedenti (`codes`, `monitor_groups`, `monitor_bracket`, `reports`) e ricarica. In Chiusura controlla classifica, premi, MVP e link alle partite non giocate. Verifica che il pulsante esegua il salvataggio durevole una sola volta e che un errore di pubblicazione possa essere ritentato senza un secondo archivio. Confronta [gli screenshot Admin](screenshots/admin-live/README.md).

## Esito e decisioni

Restituisci una tabella con blocco, scenario, esito, evidenza e priorità dei problemi. Elenca separatamente i casi che richiedono credenziali di prova o risorse mancanti. Le decisioni di Marco includono soglia Pro, QR, password arbitri, criteri di spareggio e identità dei giocatori, U25 di carriera e pulizia dei dati (due Tornei Soci, due Fanta di prova, nome della sorgente marcatori). Conserva i dati reali finché Marco non decide come intervenire.
