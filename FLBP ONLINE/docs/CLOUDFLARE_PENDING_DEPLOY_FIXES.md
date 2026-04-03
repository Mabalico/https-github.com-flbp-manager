# Cloudflare pending deploy fixes

Questo file tiene traccia dei fix **gia' pronti nel repository** ma **non ancora garantiti** sulla build Cloudflare attualmente online.

## Diagnosi corrente

Se un referto arbitri mostra `salvato` ma il tabellone pubblico/TV non si aggiorna, il problema piu' probabile **non** e' il classico "salvataggio solo locale".

Nel flusso online:
- `components/RefereesArea.tsx` salva via `pushRefereeLiveState(...)`
- `services/supabaseRest.ts` invia sia lo snapshot completo sia `public_workspace_state`
- in caso di conflitto/errore DB, la UI mostra un alert e non conferma il salvataggio come riuscito

Quindi, se l'utente ha visto il salvataggio riuscire, il problema piu' probabile e':
- build Cloudflare pubblica ancora vecchia
- viste pubbliche/TV che leggono fonti miste o stale
- renderer tabellone/TV che non usa ancora il dato live corretto

## Fix web gia' pronti nel repo

### 1) Public / TV / leaderboard / Hall of Fame da fonte unica

Obiettivo:
- evitare che viste pubbliche leggano snapshot, mirror e cache differenti
- ridurre i "rimbalzi" in cui il dato sembra tornare indietro

Gia' pronto in:
- `App.tsx`
- `components/PublicTournaments.tsx`
- `components/Leaderboard.tsx`

Effetto atteso:
- le viste pubbliche e TV si basano sullo snapshot pubblico coerente
- il referto arbitri salvato non deve piu' sparire dietro una vista stale

### 2) TV bracket riallineata ai match live aggiornati

Obiettivo:
- evitare che il bracket TV resti agganciato a `rounds` statici vecchi

Gia' pronto in:
- `components/TvClassicBracket.tsx`
- `components/TvBracketView.tsx`

Effetto atteso:
- score/stato/vincitore aggiornati dai referti arbitri compaiono davvero nel tabellone TV

### 3) Hall of Fame / Giocatori titolati aggregati con identita' canonica

Obiettivo:
- evitare split tipo `Baroncelli Marco` tra titoli squadra e premi individuali

Gia' pronto in:
- `components/HallOfFame.tsx`
- `services/hallOfFameView.ts`
- `services/playerDataProvenance.ts`

Effetto atteso:
- la stessa persona compare una volta sola nel tab `Giocatori titolati`

### 4) Correzione storico capocannonieri nei dati

Obiettivo:
- ripristinare i capocannonieri storici mancanti nei backup modernizzati

Backup corretto attuale:
- `backups/flbp_backup_2026-03-29_codex-fixed-v7.json`

Capocannonieri reinseriti:
- `03/01/2015 - D'Amore Tancredi`
- `27/06/2015 - Peschiera Matteo`
- `03/01/2016 - Paladini Andrea`
- `16/07/2016 - Ercolini Riccardo`
- `15/04/2017 - Salvadori Daniele`

Nota:
- questo richiede il backup giusto nei dati
- il caso `Baroncelli` richiede **anche** la build corretta, non solo il backup

### 5) Copy classifica e albo

Gia' pronto in:
- `components/Leaderboard.tsx`
- `components/TournamentLeaderboard.tsx`
- helper identita'/formattazione collegati

Effetto atteso:
- `PUNTI` -> `Canestri` quando il dato e' riferito ai canestri segnati
- anno/data nascita mostrati in forma completa
- se il valore e' `ND`, non viene mostrato nulla

### 6) Referti admin con intestazioni esplicite

Gia' pronto in:
- `components/admin/tabs/ReportsTab.tsx`

Effetto atteso:
- sopra gli input del referto compaiono intestazioni chiare tipo `Giocatore`, `Canestri`, `Soffi`

### 7) TV senza codici match

Gia' pronto in:
- `components/TvSimpleView.tsx`
- `components/TvBracketView.tsx`
- `components/TvClassicBracket.tsx`

Effetto atteso:
- in TV non compaiono codici partita non utili al pubblico

### 8) Inserimento squadre con `Nome` / `Cognome` separati

Gia' pronto in:
- `components/admin/tabs/TeamsTab.tsx`
- `components/AdminDashboard.tsx`
- servizi import/export collegati

Effetto atteso:
- meno errori di inversione nome/cognome nei roster live
- meno probabilita' di incoerenze successive in storico / Hall of Fame / marcatori

## Perche' Pecora Nera poteva mostrare dati incoerenti

Due cause possono essersi sommate:

1. **build Cloudflare vecchia**
- tabellone/TV/public non ancora allineati ai fix del repo

2. **correzioni roster fatte a torneo gia' avviato**
- in passato il flusso admin poteva lasciare disallineati roster live e stats gia' registrate
- nel repo attuale il flusso e' stato irrigidito per propagare meglio le correzioni identita'/roster

## Regola deploy attuale

Il frontend canonico non e' piu' il vecchio Worker/manual upload.

Stato corretto da mantenere:
- progetto canonico: `Cloudflare Pages -> flbp-pages`
- sorgente canonica: branch `main`
- le app native devono agganciarsi a `flbp-pages.pages.dev`
- il vecchio Worker va trattato solo come residuo legacy esterno, non come dipendenza operativa

## Cosa puo' ancora servire fuori dal repo

Per vedere questi fix sul frontend canonico possono servire ancora:

1. verificare che il deploy di `main` su `flbp-pages` sia andato davvero a buon fine
2. importare il backup corretto (`v7`) se vuoi allineare anche i dati storici mancanti
3. fare hard refresh / cache refresh sulla build pubblica

## Stato da tenere a mente

Se sull'online pubblico compaiono ancora sintomi come:
- `Baroncelli Marco` splittato
- solo 3 capocannonieri visibili invece dello storico corretto
- label `PUNTI` invece di `Canestri`
- tabellone TV che non recepisce il referto arbitri

allora il segnale piu' probabile e':
- **deploy di Cloudflare Pages non ancora allineato ai fix del repo**
