# Proposta per la verifica della password arbitri

L'area Admin mostra la password durante la digitazione. Dopo il salvataggio il modulo svuota il campo. La proposta rende esplicito il comportamento a operazione conclusa. L'Admin vedrebbe che la password è impostata e potrebbe sostituirla. La password sarebbe condivisibile prima di confermare. Marco deve approvare il flusso di conferma e sostituzione prima dell'implementazione.

## Formato e verifica

Ogni torneo userebbe un verificatore con versione del formato, algoritmo PBKDF2-SHA256, parametri, sale casuale e digest. Lo stesso formato deve essere verificabile dalla RPC Supabase, dal server locale e da Web Crypto per le installazioni autonome. Parametri e costo della verifica vanno misurati sui tre ambienti con fixture sintetiche. La sostituzione cambia anche `refereesAuthVersion`, così gli accessi già aperti devono autenticarsi di nuovo.

Il dato privato deve seguire il torneo quando cambia il server autorevole, quando si esporta un backup e quando lo si ripristina. I mirror pubblici e la vista arbitri devono esporre soltanto i metadati indispensabili per l'accesso e la revoca.

## Compatibilità

1. Aggiungere la verifica del nuovo formato mantenendo la lettura delle credenziali legacy e il contratto delle RPC correnti.
2. Aggiornare le due copie del frontend e il server locale. Verificare che un arbitro con una scheda precedente possa accedere attraverso la stessa RPC. Per l'installazione autonoma, confermare che il client supporti il formato prima di convertire un torneo. Una vecchia scheda autonoma richiede il ricaricamento prima della conversione.
3. Abilitare il nuovo formato per le nuove password e le sostituzioni. Dare all'Admin un riscontro dopo la conferma della scrittura. Verificare la conversione di un backup legacy e la revoca della sessione con un torneo sintetico.
4. Conservare il lettore legacy per i tornei e i backup che lo richiedono. Pianificare la sua rimozione quando il ripristino storico saprà convertire le credenziali in autonomia.

## Verifiche previste

- Test SQL additivo in `supabase/tests/`, esecuzione nella CI Supabase e controllo dei permessi con il probe read-only. Coprire password corretta, errata, conversione, revoca e proiezioni.
- `test:referee-security`, `test:referee-client`, `test:referee-save` e `npm test` del server locale, usando tornei e credenziali sintetici.
- Provare un torneo avviato online, un passaggio al server locale e il ripristino di un backup. Verificare accesso e revoca con una scheda arbitri aperta prima dell'aggiornamento.
