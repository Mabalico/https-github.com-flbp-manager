# Correzioni al motore torneo e ai punteggi Fanta

Negli spareggi fra tre o più squadre, Fanta assegna la vittoria alla sola squadra con il punteggio più alto. Il ripiego client legge i partecipanti e i punteggi dallo snapshot pubblico. Le viste SQL leggono lo snapshot autorevole del torneo live o appena archiviato. In classifica e nelle schede, i giocatori omonimi sono distinti per squadra reale. Un premio legato alla squadra assegna i punti a quella squadra. Un premio storico senza squadra viene attribuito quando il nome identifica un solo partecipante al torneo.

L'Admin riceve un avviso se la correzione di un girone cambia le qualificate o la loro posizione dopo l'inizio del tabellone. Può verificare e correggere gli abbinamenti nell'editor struttura. I nuovi ID del motore usano il generatore condiviso. L'elenco delle edizioni mostra la data italiana delle registrazioni con un orario e conserva il giorno delle date già espresse come calendario.

## Proposte da confermare

- Spareggi. Allineare il criterio di creazione alla classifica visibile includendo i canestri fatti oppure chiarire che lo spareggio si decide con la parità nei tre criteri attuali. Provare tornei sintetici con entrambi i criteri e concordare l'effetto sulle edizioni già concluse.
- Identità del secondo giocatore. Definire un'unica risoluzione della data di nascita attraverso classifica, TV, archivio e integrazioni. Preparare una prova delle identità che cambierebbero e un ripiego per i record senza data.
- Under 25. Decidere la data di riferimento per la carriera e mantenere il criterio esatto alla data dell'edizione. Confrontare i casi di compleanno e i record che hanno soltanto l'anno prima di cambiare i premi.

La migration `20261124000100_fanta_real_team_match_points.sql` aggiorna le viste di calcolo. Le edizioni Fanta già archiviate mostrano i valori registrati al momento dell'archiviazione.
