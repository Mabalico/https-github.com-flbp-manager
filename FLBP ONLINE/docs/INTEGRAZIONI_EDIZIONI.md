# Integrazioni: edizioni, marcatori e giocatori

Aggiornamento del 7 settembre 2026, applicato ai sorgenti ONLINE e LOCALE.

## Registrare un’edizione storica

Aprire **Admin → Dati → Integrazioni → Edizioni → Nuova edizione**.

- **Registra titoli** apre la scheda con data, nome, titoli e marcatori collegati. Sono obbligatori data, nome e almeno un titolo; si può registrare il solo MVP, senza squadra campione.
- **Squadre e risultati** apre la procedura di creazione dell’archivio con squadre e partite già disponibile nell’app.
- Per ogni premio si possono aggiungere altri vincitori ex aequo. Per i campioni ogni giocatore conserva la propria identità e data di nascita.
- Il campo giocatore permette di selezionare un profilo esistente, distinguendo gli omonimi. La creazione di un nuovo giocatore è esplicita. Senza data, il titolo conta subito sul profilo senza data; non è sospeso.
- **Riepilogo modifiche** mostra i premi prima del salvataggio. Tornando all’elenco, l’edizione è ricercabile, riapribile e rinominabile.

L’elenco riunisce tornei live, archivio e record storici dell’Albo d’Oro per ID. I tornei con soli titoli sono una vista dei record esistenti: non si creano squadre o partite fittizie e non si migra lo storico verso tornei vuoti. I record legacy con il solo anno restano leggibili e modificabili senza inventare una data.

La scheda **Squadre e risultati** mantiene la modifica dei referti; il suo ingresso ai titoli riapre l’editor comune. I premi derivati da risultati già registrati si aggiornano dai referti. In presenza di risultati, l’editor dei titoli consente la gestione degli MVP e conserva i premi protetti.

## Marcatori e spareggi

Per attribuire un CSV/XLSX a un torneo, aprire la sua scheda e scegliere **Marcatori collegati**. È disponibile un modello CSV. Tutte le righe vengono conservate con ID e data dell’edizione e partecipano alla classifica del torneo, al suo anno e ai totali.

L’import è una sostituzione delle righe precedentemente collegate alla stessa edizione. Il salvataggio è impedito quando ci sono già risultati registrati; in quel caso si correggono i referti. Le letture delle classifiche escludono inoltre l’import equivalente quando esistono già statistiche concluse per quell’edizione, evitando una somma duplicata.

**Ricalcola i quattro premi marcatori** propone cannoniere, difensore e le rispettive categorie U25. Sostituisce le quattro proposte, mantenendo campioni e MVP. Dopo una modifica della data o delle identità importate, usare nuovamente il comando per aggiornare le proposte.

Le regole sono comuni ai premi automatici e agli import:

1. Confrontare il totale di canestri o soffi.
2. A parità di totale, precede chi ha disputato meno partite.
3. Con totale e partite uguali, conservare tutti i vincitori ex aequo. La classifica mostra lo stesso piazzamento.
4. Una riga senza partite non può vincere un premio statistico. Se contiene canestri o soffi, il salvataggio dell’import richiede il numero di partite.

Un referto contribuisce alle statistiche quando è `played` oppure ha stato `finished`. I referti incompleti non contribuiscono. L’U25 del torneo viene calcolato sull’età alla data del torneo, fino a 25 anni compiuti: al ventiseiesimo compleanno il giocatore non è più idoneo. La classificazione generale di carriera conserva il criterio dell’anno corrente già previsto dall’app.

La tab **Marcatori** mantiene gli apporti generali senza torneo. Le righe prive di attribuzione temporale partecipano ai totali, senza inventare un anno. Modificare una riga già collegata conserva il collegamento all’edizione.

## Identità, manutenzione e conservazione

**Giocatori** riunisce profili e gestione degli alias. Le riassegnazioni e le correzioni dei profili aggiornano anche il secondo giocatore di una squadra campione, preservando l’altro. La manutenzione Fanta resta accessibile da una voce separata dalla navigazione principale.

`HallOfFameEntry.playerIds` e `playerBirthDates` sono campi opzionali, allineati a `playerNames`. Il vecchio `playerId`/`playerBirthDate` resta compatibile con i premi individuali e i backup esistenti. Le proiezioni pubbliche del client e del server locale rimuovono anche questi nuovi identificatori e date; conservano solo l’idoneità U25 già calcolata per il torneo.

Prima di distribuire questa versione contro un database esistente, applicare una sola volta la migration **20260907000100_edition_award_identities.sql** nel database condiviso. Aggiunge i metadati alle tabelle normalizzate e aggiorna la funzione interna di sincronizzazione dell’Albo d’Oro. Non modifica risultati, assegnazioni o ID dei tornei esistenti. Il backup JSON conserva i campi senza conversione.

## Verifica

I casi in `tests/data/editionManagementCases.ts`, richiamati da `npm run test:data`, coprono data U25, compleanno, rappresentazioni dei match conclusi, spareggi, import CSV, ex aequo, edizione con solo MVP, rinomina, backup, identità dei campioni, riassegnazioni, filtro annuale e protezione contro il doppio conteggio. Il server locale ha un test specifico per la proiezione pubblica.

La fixture di sviluppo `tests/ui/editions.html` usa esclusivamente dati inventati in memoria e non effettua scritture sul backend. Serve a ripetere la verifica del flusso dei titoli senza modificare autenticazione o dati dell’app.

Controlli eseguiti: test dati ONLINE (30) e LOCALE (25), 30 test su proiezione pubblica/persistenza/backup del server locale, SSR admin, 5 casi SSR delle nuove schermate per versione, copertura delle 12 lingue e build delle due app. Il typecheck globale segnala ancora errori nelle aree Fanta e sincronizzazione, esterne a questa revisione. La migration SQL è stata verificata su un database pulito da Supabase CI e applicata al database remoto il 7 settembre 2026 ([esecuzione](https://github.com/Mabalico/https-github.com-flbp-manager/actions/runs/34144390706)); il controllo finale non rileva migration pendenti.
