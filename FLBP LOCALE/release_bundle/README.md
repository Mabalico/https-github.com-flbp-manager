# Release bundle

Questa cartella contiene promemoria operativi per il giorno del torneo.

- `TOURNAMENT_DAY.md` → checklist operativa
- `FLAGS.md` → flag/env utili

Suggerimento rapido:
- se la build fallisce con **Permission denied** (ZIP + binari), usa `npm run fix:perms`.


Promemoria aggiuntivi:
- Prima di ripristinare un backup, controlla dal preflight se il file e' **moderno** oppure **legacy compatibile**.
- I nuovi export backup JSON cercano di produrre file piu' moderni, ma restano compatibili con restore di backup legacy.
- Se devi correggere un nome giocatore durante il live, usa Admin → Squadre → Lista iscritti.


Nota: `backup_template.json` è uno stub/wrapper di esempio per il bundle release, non un backup completo da conteggiare nell'audit dei profili backup.
