# Verifica FLBP Manager con Antigravity

Esegui una verifica funzionale da browser dei blocchi 1–5 e di FantaBeerpong. Parti dal sito `https://flbp-pages.pages.dev` solo quando Marco conferma che la versione da verificare comprende le PR sui referti e spareggi, sulla sessione Admin, su archiviazione e premi, sul layout e sulla TV, e che le migration del blocco 1 sono applicate. Annota l'ambiente e la versione osservata. Usa un ambiente di prova se sul sito pubblico non puoi isolare i dati o la configurazione.

## Ambiente e dati

- Usa un profilo Admin, un visitatore in incognito e una finestra TV separata. In Admin inserisce le credenziali Marco. Per Arbitri e per gli account Fanta di prova, chiedi a Marco di inserirle quando servono. Lascia credenziali, token e date di nascita fuori dal rapporto e dalle immagini.
- Prima di ogni azione che scrive, verifica che non ci sia un torneo reale in corso e che Marco abbia scaricato il backup JSON. Usa solo squadre, giocatori, tornei, arbitri, account e rose identificabili con il prefisso **TST**. Inventa le date di nascita. Con il profilo anonimo osserva il sito a **390×844** e **1440×900**. Usa **1920×1080** per tutti i modi TV.
- Evita chiamate, convocazioni, invii email e modifiche ai dati reali, compreso FantaBeerpong e il suo Pretorneo. Per prove che richiedono un cambio di configurazione globale, usa un workspace di prova oppure lascia la prova in sospeso. Interrompi la fase se l'anteprima d'impatto comprende dati reali.
- Se il servizio restituisce un errore, annota orario, stato HTTP, nome dell'operazione e messaggio redatto. Ripeti il singolo gesto solo se puoi verificare lo stato prima e dopo.

## 1. Referti, spareggi e integrità del torneo

1. **P-29, parità a tre.** Crea un torneo TST con quattro gironi da quattro. Nel girone C fai finire tutte le gare 10–8, con 0 soffi. X batte Y, Y batte Z, Z batte X e tutte battono W. Salva l'ultimo referto e verifica che compaia un solo `CTB1` con le tre squadre. Aprilo, assegnagli un vincitore e confronta la classifica prima e dopo. Devono rimanere uguali partite, vittorie, sconfitte, punti, canestri e soffi. Può cambiare l'ordine.
2. **Parità a due e codice.** In un secondo girone crea una parità a due. Ripeti con un girone rinominato **Girone Nord** e verifica il codice `dTB1`. Controlla che l'ultimo referto e lo spareggio si vedano anche dopo il ricaricamento e che ripetere il salvataggio non duplichi la gara.
3. **Girone Finale.** Porta tre squadre a pari merito alla fine dell'ultima giornata e salva il referto. Verifica che nasca `FTB1`, termina la gara e verifica che non nasca `FTB2`. La squadra vincitrice di FTB1 deve risultare campione nell'Albo d'oro dopo l'archiviazione. Ripeti almeno un caso da **Area Arbitri** e uno da **Admin**. Controlla aggiornamento su due finestre, assenza di errori 400/409 inattesi e assenza di ritentativi continui.
4. **Regressioni.** Verifica codici partita unici, BYE invisibili, TBD che non avanzano e tabellone già iniziato che resta intatto. Correggi un referto TST in modo da cambiare il vincitore e controlla che l'Admin riceva l'avviso. Verifica che una vista rimasta aperta non sovrascriva un referto più recente.

## 2. Sessione Admin e logout

- **P-48.** Accedi sul primo e sul secondo dispositivo o con due profili isolati. Premi **Esci** nell'intestazione del primo. Deve comparire **Accedi** anche dopo il reload, con un logout `scope=local` e senza richieste successive che riutilizzino il token uscito. Il secondo profilo resta operativo. Ripeti dall'Area Giocatore e verifica che la pagina anonima mostri i controlli di accesso senza note tecniche sui provider.
- **P-53.** Lascia un Admin aperto per oltre un'ora. Verifica che continui a scrivere sul torneo TST. In un ambiente controllato simula il rifiuto del rinnovo con una bozza aperta. Deve comparire **Sessione scaduta, accedi di nuovo**. Dopo il nuovo accesso ritrova la bozza. Due schede che condividono la stessa sessione del browser possono uscire insieme.
- **P-30.** Apri due finestre Admin, fai ottenere il controllo alla prima e prova **Aggiorna** e **Prendi il controllo qui** nella seconda. La finestra deve restare in Admin. Prova **Riprendi il controllo dal sito** solo con un nodo di test e dopo aver verificato l'impatto.

## 3. Archiviazione, riconoscimenti e pubblicazione

- **P-34.** Completa un torneo con almeno un referto firmato da un arbitro TST. Apri **Completa e archivia**. La modale mostra i premi in anteprima e permette di impostare MVP e U25. Conferma e attendi l'esito. Il client email non deve aprirsi durante il salvataggio. A esito positivo verifica **Copia testo** e l'apertura facoltativa della bozza email, senza inviarla.
- **P-35 e P-36.** Usa due U25 con canestri e soffi validi alla data del torneo e due capocannonieri con pari canestri. Verifica premi Under 25 e tutti i pari merito in Riconoscimenti e in Albo d'oro, da visitatore e dopo reload. In un secondo torneo togli la spunta U25 e verifica che quei premi siano assenti. Verifica che le risposte accessibili al visitatore non espongano date di nascita.
- In un ambiente isolato interrompi una pubblicazione dopo il salvataggio dell'archivio. L'Admin deve mostrare l'errore e consentire di riprovare. Ristabilisci la connessione, riprova e verifica che esista una sola edizione, con risultati, premi, dati pubblici e storico Fanta coerenti.

## 4. Layout Admin e pubblico

- **P-01, P-02, P-03, P-11, P-23, P-43 e P-49.** Controlla a 375, 390, 768, 1280, 1440 e 1600 px, anche su Referti a torneo live con badge MVP. **Apri TV**, **Gestione Live**, **Strumenti**, **Referti** e **Monitor** devono restare raggiungibili. Controlla la colonna **Squadra**, il menu ☰, Account, il nome FLBP, il marchio della federazione, il badge LIVE e la barra di navigazione inferiore.
- Ridimensiona da desktop a 390 px senza ricaricare. Verifica l'assenza di scorrimento orizzontale della pagina nell'Area Giocatore anonima e nella scheda giocatore. Prova il pulsante di aiuto e verifica che non copra contenuti. Controlla anche l'arabo con direzione da destra a sinistra.

## 5. TV e assegnazione del vincitore

- **P-24, P-33, P-38, P-44 e P-45.** A 1920×1080 prova `?flbp_tv=groups`, `groups_bracket`, `bracket`, `scorers` e `bracket_scorers`. Verifica titolo persistente, testi nella lingua scelta, dati sempre aggiornati, viste in sola lettura e nessun elemento o azione cliccabile.
- Nella finale fai vincere la squadra sulla seconda riga con un risultato inequivocabile, ad esempio 8–10. La scritta **Campione** e la barra dorata devono appartenere alla riga vincente. Verifica una finale ancora programmata, uno slot TBD e un tabellone TST a 128 squadre. Le etichette delle semifinali e della finale devono lasciare leggibili entrambe le righe. Verifica anche il tabellone pubblico a 390 px, compreso il caso Coppa Baobab in sola lettura se disponibile.
- Con Girone Finale attivo, `groups_bracket` deve mostrare il Girone Finale e i suoi risultati. Con eliminazione diretta senza gironi, il tabellone usa tutta la larghezza utile. Verifica che un `FTB1` del girone F non sia scambiato per il Girone Finale. Controlla liste vuote, liste troncate e il passaggio automatico da tabellone a marcatori.

## 6. FantaBeerpong dal Pretorneo allo Storico

1. **Pretorneo e rose.** In un workspace di prova, abilita Fanta e usa due account e due rose TST. Apri il Regolamento, crea rose valide con Capitano e Difensore, verifica i vincoli del builder e prova un salvataggio dopo ricaricamento. Modifica un giocatore reale di prova nello slot selezionato prima della generazione: la rosa si deve riallineare mostrando la sostituzione. All'avvio del torneo controlla il passaggio dalla rosa di Pretorneo alla rosa live e il blocco delle modifiche dopo la prima partita.
2. **Punti e aggiornamento live.** Usa referti con statistiche controllabili. Confronta classifica, La mia squadra e dettaglio giocatore. Registra canestri, soffi, vittorie, ruolo, bonus e totale atteso. Verifica **1 per canestro, 2 per soffio, 7 per vittoria** secondo il Regolamento. Capitano raddoppia canestri e soffi, Difensore solo i soffi, senza raddoppiare vittorie o bonus. Correggi un referto TST e verifica che il punteggio si aggiorni una volta sola. Prova anche uno spareggio a tre con vincitore diverso dalla prima squadra e annota come il punteggio lo tratta.
3. **Bonus Scia.** Elimina un giocatore TST ai quarti e fai vincere la semifinale alla squadra che lo ha eliminato. Il bonus è zero nel turno dell'eliminazione e vale **+5** per la vittoria successiva. Dopo la prima sconfitta della squadra eliminatrice la scia si ferma.
4. **Chiusura e premi.** Comprendi almeno un MVP e un titolo finale assegnato a un giocatore della rosa. Controlla le voci bonus finali, i totali e il vincitore Fanta secondo il Regolamento. Archivia il torneo e verifica che Storico Fanta conservi classifica, punti, vincitore e dettagli della rosa. Il Pretorneo diventa nuovamente disponibile. Ricarica e verifica che la stessa edizione non compaia due volte né perda i bonus dopo un nuovo tentativo di pubblicazione.

## Rapporto e pulizia

Salva `REPORT_VERIFICA_FLBP.md` con un riepilogo, una riga per blocco e per problema (ID, ruolo, viewport, passi, atteso, osservato, esito **OK / KO / parziale / non provato**, prove) e una tabella separata per eventuali regressioni nuove. Per Fanta allega almeno una tabella dei calcoli attesi e osservati. Riporta eventuali prove bloccate e la ragione.

Alla fine, con Marco, consulta l'anteprima d'impatto prima di eliminare i soli dati TST creati nella sessione. Annota cosa è stato eliminato e cosa rimane. Lascia la configurazione reale com'era all'inizio.
