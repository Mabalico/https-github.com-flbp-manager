# Salvataggio referto e chiusura convocazioni

Aggiornamento: 24 settembre 2026 — correzione A02 dell'audit.

## Problema corretto

Il cleanup delle convocazioni usava `refereePassword` fuori dal suo scope. Il
`ReferenceError` interrompeva il salvataggio prima dell'applicazione in UI; nel
percorso remoto poteva verificarsi dopo una RPC già riuscita e, nel fallback con
merge, produrre un avviso di conflitto non corrispondente all'esito remoto.

## Comportamento

- Il segreto arbitro è risolto nello scope del salvataggio: prima la credenziale
  configurata nel torneo, poi quella transitoria della sessione arbitro. Viene
  passato esplicitamente alla chiusura convocazioni e non viene salvato altrove.
- Con password e senza access token, il referto continua a usare outbox e RPC
  risultati; se la RPC non è disponibile usa il fallback snapshot esistente.
  L'ack dell'outbox segue il successo remoto come prima.
- Con access token, l'applicazione tramite `setState` e il normale percorso di
  persistenza restano invariati. In assenza di segreto arbitro, il servizio di
  chiusura convocazioni usa la sessione autenticata già prevista dalla sua API.
- In modalità locale o senza Supabase, la chiusura convocazioni cloud viene
  saltata. L'applicazione del risultato locale procede normalmente.
- La chiusura convocazioni parte dopo l'applicazione del risultato e il normale
  messaggio di conferma. È best effort, non viene attesa e intercetta sia errori
  sincroni sia richieste rifiutate. Un errore di cleanup produce solo il warning
  diagnostico già previsto; non converte il salvataggio in conflitto, non rimette
  pending il referto e non blocca il pulsante se la richiesta resta sospesa.
- Nei percorsi di errore remoto, conflitto irrisolto o sessione arbitro scaduta,
  non parte il cleanup. Gli esiti di errore/outbox preesistenti restano invariati.

Questa correzione non introduce nuove garanzie di persistenza del percorso con
token: conserva il contratto di `setState` e del repository esistente. Non cambia
OCR, validazione punteggi, audit del referto, spareggi, BYE/TBD o avanzamento torneo.

## Regressioni

Eseguire dalla directory `FLBP ONLINE`:

```sh
node scripts/test-referee-report-save.mjs
```

Lo script estrae tramite AST TypeScript **le funzioni correnti del componente**
`saveReport` e `closeLiveCallsForMatch` ed esegue quelle funzioni in memoria.
Usa gli helper reali per partecipanti, risultati da sincronizzare e audit del
referto; sostituisce soltanto IO e transizioni torneo non pertinenti alla fixture.
Non reimplementa la logica di salvataggio e non richiede un login di test o rete.

Copertura: locale/senza configurazione; token con cleanup che lancia, rifiuta o
resta pending; credenziale configurata/transitoria; RPC risultati e relativo ack;
fallback snapshot; merge conflitto riuscito e bloccato; errore remoto; sessione
scaduta; filtro BYE/TBD e duplicati; blocco pareggio. Verifica anche che il cleanup
avvenga dopo applicazione e conferma e che non riapra la coda di un referto riuscito.

La variante `FLBP LOCALE` ha lo stesso controllo sul percorso snapshot che quella
edizione usa. Gli script non producono bundle o file temporanei e possono essere
eseguiti parallelamente alle altre suite.
