# Ritorno Fanta e protezione delle uscite App

FantaBeerpong torna alla vista da cui è stato aperto (per esempio Home o Area
Giocatore). App conserva l'origine in un ref in memoria, aggiornato soltanto al
commit di una navigazione riuscita verso Fanta. Riselezionare Fanta mentre è già
aperto non cambia l'origine. Il regolamento mantiene i propri ritorni interni;
uscire dallo storico usa il callback verso l'origine.

Non si aggiungono chiavi persistenti. Dopo una nuova mount, compreso un
ripristino esplicito in Fanta tramite il meccanismo di reload già esistente,
l'origine sconosciuta ricade sulla Home. L'inizializzazione della vista,
OAuth, URL/proiezioni TV e la persistenza delle bozze restano nei loro percorsi
esistenti.

## Guardie delle bozze

App usa `requestDraftNavigation` prima di cambiare vista. Il preload termina
**prima** della conferma finale: una bozza o un salvataggio iniziati durante
il caricamento vengono così rilevati dal guard attuale. Il callback consentito
verifica ancora il requestId e cambia origine/vista sincronicamente, senza
attendere altro IO dopo il consenso.

Mentre una conferma è aperta, le richieste successive non sostituiscono la
destinazione né incrementano il contatore della navigazione. Un annullamento
non aggiorna vista o origine. L'ingresso nella TV web passa dallo stesso guard;
l'apertura di una finestra TV nativa resta separata perché non smonta l'editor
della finestra corrente. La superficie TV e i comandi di proiezione non cambiano.

## Verifica isolata

`node scripts/test-fanta-navigation.mjs` avvia una fixture locale con App,
Home, PlayerArea e Fanta attuali, repository in memoria e IO Fanta simulato.
Ogni richiesta esterna viene bloccata. La vista Admin è uno stub che riceve
l'effettivo callback `onEnterTv` di App; il servizio guard è reale e usa un
handler di prova. La suite del form Edizioni copre separatamente il suo dialogo
e il suo stato dirty/busy.

La suite verifica in desktop e mobile i ritorni da Home e Area Giocatore,
il riclick Fanta, il ritorno interno dal regolamento, il fallback dopo reload,
annullamento e seconda destinazione durante una conferma. Due prove sospendono
la richiesta del modulo Fanta e introducono dirty/busy durante il preload;
la vista iniziale deve restare intatta. L'ingresso TV verifica cancel,
salvataggio in corso, conferma e uscita Escape.

`node scripts/test-fanta-navigation.mjs --prove-regression` ripristina il
vecchio callback fisso `player_area` solo nella build di test e dimostra che
il controllo del ritorno Home lo rileva. Nessuna trasformazione del callback
avviene nel test positivo.

Gli strumenti browser sono esterni alle dipendenze app: `FLBP_PLAYWRIGHT_MODULE`
indica il modulo Playwright (default `require('playwright')`), mentre
`FLBP_BROWSER_EXECUTABLE` è facoltativo; senza quest'ultimo si usa Chromium
installato da Playwright. La sentinella storage controlla che la navigazione non
cancelli valori esistenti; non certifica da sola il recupero di una rosa reale.
Non vengono effettuati login o scritture su database.

F03 complessivo resta aperto per gli altri CTA e dettagli del backlog:
questa modifica riguarda origine del ritorno e collegamento della guardia App.
