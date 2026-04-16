# TODO tecnici espliciti

1. Collegare i mock fantasy a una fonte dati reale
   - decidere se il dominio Fanta vive dentro `AppState`, in repository dedicato o via backend separato

2. Collegare il builder a persistenza reale
   - save bozza / save confermato
   - lock squadra reale
   - controllo finestra modifiche

3. Collegare scoring reale
   - canestro, soffio, vittoria
   - bonus finali
   - Bonus Scia

4. Rifinire il dettaglio squadra fantasy
   - storico punteggi giornata
   - eventuale trend grafico
   - confronto con leader

5. Rifinire il dettaglio giocatore fantasy
   - breakdown eventi reali
   - eventuale link a sorgente torneo/match

6. Rifinire storico edizione
   - data reale
   - podio da archivio reale
   - premi di edizione

7. Valutare i18n
   - il package usa copy italiana diretta per ridurre refactor
   - Codex può decidere se e quando esternalizzare stringhe

8. Verificare naming finale
   - controllare prop names e import path rispetto al repo reale
   - allineare eventuali utility condivise già presenti nel progetto
