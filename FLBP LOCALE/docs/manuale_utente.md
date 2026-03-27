# Manuale Utente - FLBP Manager Suite

Versione: 2026-03-19

Questo manuale spiega in modo rapido ma chiaro cosa contiene l'app e come usare le sezioni principali (pubbliche, Admin, Area Arbitri e TV).

## 1. Panoramica

FLBP Manager Suite e' una web app per la gestione di tornei live di Beer Pong: iscrizioni squadre, generazione gironi/tabellone, inserimento referti (anche via OCR), classifiche marcatori, modalita' TV 16:9 e archivio storico.

Concetti base:
- **Squadra**: composta da due giocatori.
- **Gironi**: fase a round-robin (se attiva).
- **Tabellone**: eliminazione diretta (anche dopo gironi) con gestione BYE se necessario.
  - Se il numero partecipanti al tabellone non e' una potenza di 2, il sistema crea **rami preliminari**: alcune squadre giocano una partita in piu' per arrivare al turno "regolare".
  - I rami preliminari vengono posizionati **in fondo al tabellone** e vengono aggiunti "dal basso" (ordine inverso), per avere un bracket leggibile.
- **Referto**: inserimento canestri (per giocatore) e soffi; determina avanzamenti e statistiche.
- **TV Mode**: viste read-only per monitor 16:9 (gironi/tabellone/marcatori).

## 1.1 Modalità applicazione (Tester vs Ufficiale)

L’app può essere distribuita in due modalità:

- **Modalità Ufficiale**: profilo consigliato e usato per il deploy pubblico. Nasconde dalla UI gli strumenti di test e lascia disponibili solo i flussi operativi reali.
- **Modalità Tester**: profilo tecnico per sviluppo/verifiche, con strumenti di test come **simulazioni** e **sim-pool**.

**Come si seleziona la modalità (per chi compila/builda l’app):**

- Ufficiale: `VITE_APP_MODE=official`
- Tester: `VITE_APP_MODE=tester`

In modalità Ufficiale non vedrai, ad esempio:
- Area Admin → Squadre: box **Simulatore Pool (test)**
- Area Admin → Monitor Tabellone: pulsanti **Simula turno** / **Simula tutto**

**Switch rapido (runtime) in Area Admin:**

- In ambienti tecnici può essere presente un badge **TESTER / UFFICIALE** nell’header Admin.
- Nella build pubblica patchata per Cloudflare Pages + Supabase il profilo resta **UFFICIALE** e l’override runtime viene ignorato.

## 1.2 Installazione su smartphone (PWA)

L'app puo' essere installata come "app" (PWA) sulla schermata Home, senza passare da store.

### Android (Chrome)
1. Apri l'app nel browser.
2. Menu (tre puntini) -> "Aggiungi alla schermata Home".
3. Conferma.

### iPhone/iPad (Safari)
1. Apri l'app in Safari.
2. Condividi -> "Aggiungi a Home".
3. Conferma.

Nota: questa installazione non cambia nessuna funzione dell'app. Serve solo per accesso piu' rapido e schermo pieno.

Dettagli tecnici (mobile):
- In modalita' installata su iOS, la status bar puo' essere trasparente: l'app gestisce automaticamente le safe-area (notch).
- Su iOS/Android e' consigliato usare l'app installata per avere schermo pieno e accesso rapido.

## 1.3 App mobile nativa (wrapper)

Oltre alla PWA, l'app puo' essere impacchettata come app Android/iOS tramite un wrapper (Capacitor), senza cambiare logiche o flussi.

- Build per wrapper: `npm run build:mobile`
- Generazione automatica (R7-bis):
  - Windows Android: `scripts/capacitor-generate-android.ps1`
  - macOS/Linux Android: `scripts/capacitor-generate-android.sh`
  - macOS iOS: `scripts/capacitor-generate-ios.sh`
- Offline/cache: presente un **service worker conservativo**.
  - HTML/navigazioni: network-first (evita "versioni vecchie" quando online).
  - Asset build: cache leggera.
  - Disattivabile rapidamente: `localStorage flbp_sw_disabled=1`.
  - In **TV Mode** il service worker non viene registrato e viene disattivato automaticamente per ridurre il rischio di "build vecchie".
  - In Area Admin (header) sono presenti i pulsanti **CACHE ON/OFF** e **(cestino) svuota cache** per forzare un reload pulito.
- In build locale/tecnica possono esistere fallback locali; nella build pubblica patchata i dati operativi (admin, referti, snapshot) vengono persistiti su Supabase.

Procedura completa: vedi `docs/MOBILE_WRAPPER.md`.

## 2. Sezioni pubbliche

Le sezioni pubbliche sono pensate per consultazione (pubblico, giocatori, staff).

### 2.1 Home
Pagina di ingresso e accesso rapido alle sezioni principali.

### 2.2 Classifica (Leaderboard)
Mostra le classifiche dei marcatori in base ai dati disponibili (storico e/o torneo selezionato).
- Usa **ordinamenti** (canestri, soffi, medie se disponibili) per cambiare la graduatoria.
- Usa la **ricerca** per trovare un giocatore velocemente.

**Filtro Anno (Classifica Storica):**
- Seleziona **Tutti gli anni** (default) oppure un anno (es. **2025**).
- Con un anno selezionato, la classifica viene calcolata solo sui tornei archiviati in quell’anno (e include il torneo live se la sua `startDate` è nello stesso anno).


### 2.3 Albo d'oro (Hall of Fame)
Raccoglie vincitori e riconoscimenti (campioni, MVP, capocannoniere, difensore, categorie U25 se previste).

**Tab principali:**
- Campioni
- Capocannonieri
- Capocannonieri **U25**
- Difensori
- Difensori **U25**
- MVP
- Giocatori titolati

**Tab "Giocatori titolati":**
- Mostra una tabella per giocatore con i conteggi: **Titoli Totali**, **Campione**, **Cannoniere**, **Difensore**, **MVP** + colonne U25.
- Puoi cambiare l’ordine con **"Ordina per"**: Totale / Campione / Cannoniere / Difensore / MVP / Cannoniere (U25) / Difensore (U25).

Regole (no-regression):
- I titoli **U25** sono separati dai titoli “principali” (tab dedicati per Cannoniere/Difensore U25).
- Nei box pubblici dell'Albo d'oro il badge del torneo mostra la **data completa** quando disponibile; sugli archivi legacy privi di data resta il fallback all'anno.
- I placeholder **BYE** restano invisibili nelle viste pubbliche; i placeholder **TBD** non diventano mai squadre reali.


### 2.4 Tornei (Public Tournaments)
Elenco tornei e accesso al dettaglio torneo con risultati, tabellone e statistiche.

> Nota UI: nella vista pubblica, **classifiche gironi** e **tabellone** si adattano alla larghezza della finestra (niente scroll orizzontale). Su schermi stretti i contenuti vengono ridotti (scale) per rientrare.


Nel dettaglio torneo (vista Gironi), per ogni girone e' visibile una **classifica stile campionato** con: Partite, Vinte, Perse, Punti, Canestri fatti/subiti/differenza, Soffi fatti/subiti/differenza.


**Dettaglio torneo (gironi):**
- Per ogni girone è visibile una **classifica stile campionato** con: P, V, S, CF/CS/ΔC, SF/SS/ΔS.
  - I **punti (Pt)** vengono calcolati internamente (1 per vittoria) ma **non sono mostrati** in tabella.
- Se vedi il banner **“Qualifica bloccata da spareggio”**, significa che esiste almeno una partita di spareggio gironi (codice tipo `ATB1`) ancora da giocare: la qualifica/tabellone si aggiorna automaticamente quando lo spareggio viene completato.


**Legenda classifica gironi:**
- **P** = partite giocate
- **V** = vinte
- **S** = perse
- **CF/CS/ΔC** = canestri fatti / subiti / differenza
- **SF/SS/ΔS** = soffi fatti / subiti / differenza

### 2.5 Guida (Help)
Pagina di guida rapida all'uso dell'app.

### 2.6 Coerenza dati live

Durante il live l'app mantiene allineati:
- torneo corrente (`tournament`)
- match live (`tournamentMatches`)

In pratica:
- se chiudi un referto, fai una simulazione o cambi stato match, le viste pubbliche/Admin/TV leggono gli stessi dati
- dopo refresh o sincronizzazione remota non dovresti vedere risultati diversi tra schermate

## 3. Area Admin

L'Area Admin e' l'area operativa per gestire il torneo live e la gestione dati (archivio, integrazioni, hall of fame manuale).

### Accesso
Apri la sezione Admin dal menu e fai login con l'account Supabase admin dell'installazione.
L'ingresso in Admin richiede quindi una sessione Supabase Auth reale sul device corrente.
Il login e l'autorizzazione restano separati: dopo il login, il database applica comunque i controlli tramite `public.admin_users` e `flbp_is_admin()` per snapshot, sync, export e autosave remoto.
Il pannello **Strumenti** dell'header Admin si richiude automaticamente se clicchi in qualsiasi altro punto della schermata.

Nell’**Editor Torneo** puoi anche:
- creare una nuova squadra al volo direttamente nel pool editor inserendo nome squadra e due giocatori;
- usare **Aggiungi turno preliminare** quando il Round 1 è pieno e nessun match reale del bracket è ancora partito, così da ottenere un nuovo turno preliminare vuoto con slot BYE pronti a ricevere le squadre extra.
Se Supabase non e' configurato, l'area Admin non puo' essere aperta: il deploy pubblico richiede le env Vite corrette e un account Auth gia' registrato in `public.admin_users`.

### 3.1 Gestione Live
Gestisce il torneo corrente dall'iscrizione fino all'archiviazione.

Sezioni tipiche:
- **Squadre (Teams)**: inserimento manuale o import; include flag arbitro; lista iscritti e azioni di reset.
  - **Import Excel/CSV**: carica un file con squadre/giocatori.
  - **(Solo Modalità TESTER)** strumenti non essenziali per il live:
    - **Export Excel**: esporta l'elenco squadre in `.xlsx`.
    - **Import XLSX/CSV**: l'app mantiene il layout del primo XLSX valido e, se un workbook ha più fogli, prova automaticamente a leggere quello coerente con quel profilo.
    - **Export PDF**: stampa/esporta l'elenco squadre (usa il dialog di stampa del browser, senza popup).
    - **Backup JSON**: scarica un file `.json` con *tutto lo stato dell'app* (vedi nota sotto).
    - **Ripristina JSON**: carica un backup `.json` e sovrascrive lo stato locale.
  - **Correzione profilo dalla Lista iscritti**: puoi correggere direttamente **nome** e **data nascita** del singolo giocatore dal roster live. La modifica propaga su live/storico/referti/classifiche/Hall of Fame e, se il nuovo nome+data coincide con un profilo esistente, il sistema effettua il **merge**; se invece separi due omonimi, mantiene i profili distinti.
    - Compatibilita' storica: se un backup/archivio legacy contiene ancora solo l'**anno di nascita (YoB)** e non la data completa, l'app lo usa solo come **fallback di compatibilita'** per riconoscere correttamente il profilo; quando la `birthDate` completa e' presente, resta sempre quella la fonte preferita.
  - **Aggiunte post-avvio Live**: puoi aggiungere squadre anche dopo l’avvio. Verranno segnalate come **squadre escluse** e potrai inserirle in gironi/tabellone dal Monitor oppure rigenerare la struttura.

- **Struttura (Structure)**: configurazione modalita' (gironi / eliminazione), parametri e generazione della struttura; avvio Live.
  - Nei campi numerici con `0` iniziale basta un click/focus: lo zero viene selezionato automaticamente e il primo numero digitato lo sostituisce subito.
  - **Grafiche Social (Story 9:16)**: nello stesso tab trovi un pannello per creare grafiche da pubblicare (preliminari + convocazioni per slot orari) ed esportare PNG.
    - Le convocazioni slot usano i match reali ordinati per `orderIndex`; puoi generare slot automatici da primo orario + intervallo + squadre per turno, poi rifinire orari/#partite a mano oppure aprire **Match** e scegliere esattamente quali partite mostrare in ogni slot.
    - Il riepilogo del pannello usa le **squadre visibili del torneo/draft corrente** quando disponibili, quindi i conteggi non dipendono dal catalogo globale squadre.
    - Se vedi warning su slot senza orario, orari non validi o slot vuoti, correggili prima dell’export finale.
    - Se uno slot contiene troppi match/righe, il sistema genera automaticamente **più pagine** (es. 1/2, 2/2) per lo stesso orario.
    - Se aggiungi nuove squadre e il bracket crea un nuovo turno preliminare con BYE, la grafica **Preliminari** si aggiorna separatamente e le convocazioni normali continuano a usare solo i match standard.
    - Lo stile delle grafiche è allineato alle reference in `docs/social_reference/`.
- **Referti (Reports)**: inserimento risultati con codice match; supporto OCR se abilitato; aggiorna classifiche e avanzamenti.

### 3.2 Referti (Reports) — workflow operativo (pulsante-per-pulsante)

Questa è la schermata che usi *durante il live* per chiudere le partite e sbloccare avanzamenti/classifiche.

**Come inserire un referto (match normale 1v1):**
1. Vai in **Admin → Referti**.
2. Seleziona il match dalla lista (o inserisci/scansiona il codice se l'OCR è attivo).
3. Controlla l’intestazione: deve essere `Squadra A vs Squadra B` (nessun badge *SPAREGGIO*).
4. Inserisci i valori per i 2 giocatori per squadra (canestri e soffi).
   - Il totale squadra viene calcolato come **somma canestri dei giocatori**.
   - Nei campi numerici con `0` iniziale, il click seleziona automaticamente il valore per sostituirlo senza dover premere Canc/Backspace.
5. Premi **Salva**.
6. Verifica in **Monitor** che la partita risulti chiusa e che gli avanzamenti si aggiornino.

Nota importante:
- il punteggio squadra viene sempre ricavato dai **canestri dei giocatori**
- l'app non salva un referto con **pareggio in testa**

**Come riconoscere uno spareggio gironi:**
- Codice match: `ATB1`, `BTB2`, … (senza trattino).
- Badge visibili in varie liste: **SPAREGGIO**, e se è multi-squadra anche **MULTI**, più `a N` se c’è un target (es. `a 1`).

**Spareggio 1v1 (race-to-1, con ricorsione):**
1. Seleziona lo spareggio (badge **SPAREGGIO**).
2. Inserisci canestri/soffi come un match normale.
3. Se la UI ti blocca il salvataggio per “pareggio” significa che lo spareggio, per regola, **non può chiudersi pari**:
   - nella pratica, la partita va continuata finché esiste un vincitore unico.
   - lo score finale può risultare **2–1**, **3–2**, … (ricorsione del pareggio).
4. Premi **Salva**.
5. Dopo il salvataggio, il badge **“a N”** dello spareggio viene aggiornato automaticamente al valore effettivo raggiunto (es. da `a 1` a `a 2` se il referto è 2–1).
6. Vai in **Admin → Monitor Tabellone**: il banner *“QUALIFICA BLOCCATA DA SPAREGGIO”* deve sparire (o ridursi) quando lo spareggio è chiuso.

**Spareggio MULTI (A vs B vs C… in un’unica partita):**
1. Seleziona lo spareggio con intestazione tipo `A vs B vs C` e badge **SPAREGGIO • MULTI • a 1**.
2. Compila i dati per **ogni squadra** (2 giocatori per squadra): canestri e soffi.
3. Controlla il riepilogo punteggi per squadra:
   - lo spareggio è *a N* (tipicamente `a 1`), ma **se due o più squadre arrivano a N insieme**, la regola richiede di continuare fino a spezzare la parità.
   - quindi il referto finale può essere, ad esempio: **2–1–0**, **3–2–1**, ecc.
4. Se la UI blocca “pareggio in testa”, non è un errore: significa che la partita va continuata. Aumenta i canestri finché c’è **un leader unico**.
5. Premi **Salva**.
6. Dopo il salvataggio, il badge **“a N”** viene aggiornato al valore effettivo raggiunto (es. `a 3` se il referto finale è 3–2–1).
7. Controlla:
   - **Monitor Gironi**: la classifica cambia e lo spareggio non risulta più “aperto”.
   - **Monitor Tabellone**: il banner di blocco qualifica si aggiorna/scompare.
    - Nel bracket del monitor sono disponibili controlli **Zoom − / + / Reset**.
    - Cliccando una partita nel bracket si apre la **modifica Referto** (non solo punteggio).
   - **TV/Public**: badge e banner si aggiornano automaticamente.

> Nota: gli spareggi vengono generati automaticamente dal sistema quando necessari per sbloccare la qualifica. Non devi crearli manualmente.


- **Lista codici (Codes)**: elenco partite generate e relativo stato.
  - Toolbar: **ricerca** per codice/squadra + filtro stato.
  - Azioni riga: **Referto** (apre la partita) e **Avvia/Chiudi** (cambia stato). Le righe **giocate** sono cliccabili per aprire il referto.
- **Monitor**: viste operative per seguire gironi e/o tabellone.
  - **Monitor Gironi**: puoi filtrare **Tutti i gironi / singolo girone** e vedere la classifica stile campionato.
    - Toolbar: **ricerca** rapida per codice/squadra (utile per trovare subito la prossima partita).
    - Sicurezza operativa: il cambio stato partita (scheduled/playing/finished) avviene tramite pulsante **Avvia/Chiudi**; le righe **giocate** aprono il referto.
    - Box **INTEGRITÀ TORNEO**: segnala eventuali **squadre escluse** (presenti nel roster ma non assegnate a gironi/match).
    - **Modifica manuale gironi (beta)**: disponibile solo se il girone non è iniziato e non è concluso. Include una **barra click-to-move** e il pulsante **Salva modifiche** con validazioni (duplicati/mancanti/placeholder).
      - aggiungi squadra esclusa al girone (genera i match mancanti)
      - sposta squadra in un altro girone
      - scambia due squadre tra gironi
  - **Monitor Tabellone**: se la qualifica è bloccata da spareggi, compare il banner **“QUALIFICA BLOCCATA DA SPAREGGIO”** con i codici da completare.
    - Toolbar: **ricerca** rapida per codice/squadra (lista match).
    - Anche qui: avanzamento stato con **Avvia/Chiudi**; le righe **giocate** aprono il referto (oltre alle azioni nel bracket).
    - Nel bracket del monitor sono disponibili controlli **Zoom − / + / Reset**.
    - Cliccando una partita nel bracket si apre la **modifica Referto** (non solo punteggio).
    - Box **INTEGRITÀ TORNEO**: segnala tabellone **bloccato** (se qualche match del tabellone è già iniziato) e segnala eventuali **squadre escluse**.
    - **Modifica manuale tabellone (beta)**: disponibile solo se il tabellone non è bloccato. Include una **barra click-to-move** (Round 1) e il pulsante **Salva modifiche** con validazioni (duplicati/mancanti/placeholder).
      - sostituisci uno slot **BYE** con una squadra reale (Round 1)
      - scambia posizioni tra due squadre (Round 1)
      - **rigenera tabellone** (solo tornei "Eliminazione" e solo se non è iniziato) con 2 modalità:
        - **Rigenera (casuale)**: ricrea Round 1 + preliminari da zero
        - **Rigenera (mantieni struttura)**: riempie slot BYE; se pieno crea un turno preliminare (supportato fino al raddoppio: 16→32, 32→64)
  - **Marcatori (card live)**: il pulsante **Espandi classifica** è subito sotto i primi marcatori mostrati (non viene spinto in fondo alla pagina).
- **TV**: accesso rapido alle viste 16:9 read-only per monitor.
- **Arbitri (Referees)**: elenco arbitri e stato in base alle partite contemporanee configurate.
  - Toolbar: **ricerca** per arbitro/squadra + impostazione **Tavoli** (partite contemporanee).
  - **Stampa referti (PDF)**: dal tab Arbitri puoi stampare i referti "da compilare" per turno corrente/prossimo o un turno selezionato (anche passato), usando il dialog di stampa del browser (senza popup).
    - I referti sono precompilati con **squadre e giocatori**; restano a mano solo soffi/canestri e la X vincitore.
- **Archivia**: a fine torneo, archivia i dati per renderli consultabili nelle sezioni pubbliche.
  - Se archivi dopo aver impostato l’MVP (azione **“Salva MVP e archivia”**), compare un popup **“Torneo terminato”**.


### 3.1.1 Area Arbitri (Referti)

Questa area serve agli arbitri per caricare i referti del torneo live senza usare l'Admin.

1. Dal menu scegli **Area Arbitri**.
2. Premi **Accedi** e inserisci la **password del torneo live** (impostata dall’Admin quando avvia il Live).
   - Se **non c’è un torneo live attivo**, l’area arbitri resta **inaccessibile**.
   - Quando il torneo viene archiviato/chiuso, l’area torna **inaccessibile** (serve un nuovo Live con nuova password).
3. **Seleziona il tuo nome** tra quelli disponibili (sono presi dai giocatori live).
   - Se non presente, usa **Aggiungi manualmente**: il nome si aggiunge alla lista abilitata per il torneo live.
4. Pagina **Referto**:
   - Seleziona un match dalla lista **Match da refertare** *oppure* inserisci il **Codice referto** e premi **Cerca**.
     - La lista esclude automaticamente match con **BYE**, placeholder **TBD** e match incompleti (1 sola squadra / slot vuoto).
     - Se un codice corrisponde a più partite (possibile dopo modifiche manuali/rigenerazioni), viene mostrata una lista di match: scegli quello corretto prima di continuare.
   - Scegli la modalita': **Manuale** oppure **OCR**.
   - Anche qui i campi numerici con `0` iniziale sono sovrascrivibili al primo click/focus.

**OCR (con conferma)**
- Carica la foto del referto.
- Il sistema esegue il preprocess + OCR e apre una finestra con:
  - codice letto (modificabile)
  - score letto (solo supporto)
  - testo OCR (supporto)
- Premi **Apri inserimento manuale** per confermare (se necessario correggi prima).

**Suggerimenti OCR (numeri) — opzionale**
- Dopo la conferma OCR, nella schermata manuale può apparire un box "Suggerimenti OCR (numeri)".
- Se riconosce marker **PT/SF** (canestri totali/soffi), puoi premere **Applica suggerimenti OCR** per compilare i campi.
- Il quick-fill è **non distruttivo**: compila solo i campi vuoti o impostati a `0` (non sovrascrive inserimenti manuali).

**Inserimento manuale (salvataggio referto)**
- Inserisci **canestri** e **soffi** per ogni giocatore.
- Lo score per squadra viene **calcolato automaticamente** come somma dei canestri dei due giocatori.
- **Pareggi non ammessi**: se la UI segnala parita' in testa, significa che lo spareggio deve continuare finche' esiste un vincitore unico.
- Premi **Salva referto**.

Coerenza salvataggio:
- il referto salvato aggiorna sia la lista match live sia il torneo live
- se il match è di girone, il tabellone si sincronizza quando necessario
- se il match è di tabellone, il vincitore viene propagato automaticamente

> Suggerimento: per gli spareggi multi-squadra (AvsBvsC...), il referto puo' finire con score come **2-1-0**, **3-2-1**, ecc.

> **Nota: cosa contiene il Backup JSON**
>
> Il file di backup JSON e' uno snapshot dello **stato completo** dell'app (AppState). Contiene:
> - `teams`: squadre iscritte (giocatori, anni, flag arbitro)
> - `matches`: partite generate (gironi/bracket) e relativi stati
> - `tournament` + `tournamentMatches`: torneo corrente e struttura in corso
> - `tournamentHistory`: archivio tornei
> - `hallOfFame`: albo d'oro
> - `integrationsScorers`: integrazioni marcatori importate
> - `playerAliases`: mappa alias/merge giocatori
> - `logo`: logo configurato
>
> **Ripristina JSON**: prima della conferma finale esegue un **preflight compatibilità** (shape radice, schema version, summary conteggi, warning legacy) e ora segnala anche **quanti blocchi del file contengono ancora campi YoB legacy** (squadre live, torneo live, storico, integrazioni marcatori), così puoi capire subito se una rimozione hard della legacy sarebbe rischiosa.
> **Scarica backup JSON**: i nuovi export cercano di produrre file più **moderni**, eliminando i campi `YoB` solo quando nel record è già presente la `birthDate` completa. Se il dato storico ha ancora solo YoB, il campo resta nel backup esportato per non rompere la compatibilità del restore.
> **Audit repository**: il comando `npm run audit:backup-profiles` rigenera `docs/BACKUP_PROFILE_AUDIT.md` e verifica i JSON backup-like già inclusi nello ZIP. Nell'attuale repository risultano tutti **moderni**, quindi la compatibilità YoB resta necessaria solo per backup esterni o snapshot legacy non versionati.
>
> **Integra JSON**: usa lo stesso preflight compatibilità prima del merge, con lo stesso inventario dei campi YoB legacy presenti nel file, così puoi intercettare backup non FLBP o ancora dipendenti da fallback storici prima di applicarli.
>
> Compatibilita' identita' giocatori: alcuni backup storici possono ancora contenere campi **YoB** sulle squadre/import legacy. Il restore continua a leggerli solo come fallback compatibile; il modello dati preferito resta la **data nascita completa** quando disponibile.

### 3.2 Gestione Dati
Sezione per consultare/modificare dati storici, archivi e integrazioni (es. hall of fame manuale).
- **Archivio**: gestione tornei conclusi e relativi dati.
  - È possibile inserire anche tornei storici **incompleti** con **1 sola squadra** (es. solo vincitore + titoli). In questi casi può mancare la struttura (gironi/tabellone).
- **Integrazioni**: strumenti per completare dati storici senza toccare il live.
  - **Hall of Fame**: inserimento manuale titoli/premi.
  - **Marcatori**: import/elenco integrazioni marcatori (se previsto dalla UI).
  - **Alias giocatori**: merge e gestione nomi duplicati.
  - (Solo **TESTER**) può comparire un pannello **Backup & Sync (beta)** per diagnostica/migrazione dati: è facoltativo e non serve per l’operativo live.
- Eventuali campi mancanti possono essere indicati come **ND** (Non Disponibile) quando previsto dalla logica dati.

## 4. TV Mode (monitor 16:9)

La modalita' TV e' pensata per monitor esterni: e' read-only, senza click, e deve adattarsi a 16:9.

Viste disponibili:
- **Gironi**: mostra i gironi; se molti, ruota automaticamente (es. ogni 15 secondi, se configurato nel codice).
- **Tabellone**: mostra il bracket a eliminazione con aggiornionamenti periodici.
- **Marcatori**: mostra top scorers (es. Top 30 canestri e Top 30 soffi, se configurato).

Suggerimenti pratici:
- Apri la TV su un browser dedicato e in full screen.
- Se usi piu' schermi, puoi aprire piu' finestre TV con viste diverse.
- Se i dati provengono da DB remoto, assicurati che la sincronizzazione sia attiva per aggiornamenti coerenti.

Controlli tastiera (non mostrati a schermo):
- **1**: Gironi
- **2**: Gironi + Tab
- **3**: Tabellone
- **4**: Marcatori
- **ESC**: Esci dalla TV

In TV Mode:
- La vista **gironi** include la **classifica stile campionato** in layout compatto (16:9 safe).
- I match di spareggio mostrano il badge **SPAREGGIO** (e **MULTI** se 3+ squadre) e, se presente, il target **“a N”**.
- Se esistono spareggi gironi non conclusi, appare un avviso **“Qualifica bloccata da spareggio”**.

## 5. Risoluzione problemi (FAQ rapida)
- **Non vedo il torneo live**: verifica che il Live sia stato avviato in Admin e che i dati siano salvati/sincronizzati.
- **TV non aggiorna**: ricarica la pagina TV; verifica connettivita' e, se usi DB remoto, la reachability del database e la connessione del browser.
- **TV schermata vuota/bianca**: la TV ora ha un fallback esplicito. Se non esiste ancora un contesto torneo reale (nessun torneo selezionato / nessun match / nessuna squadra), deve comparire la schermata di attesa configurazione; se compare un errore UI, usa il pulsante di reset/ricarica invece di restare su una pagina bianca.
- **OCR non legge**: prova foto piu' nitida e ben illuminata; verifica permessi browser.
- **Simulazioni lente**: con tornei grandi, attendi qualche secondo; se l'app sembra bloccata, prova a ridurre dimensione o verifica la versione.
- **Classifica o torneo sembrano “vecchi” dopo refresh**: verifica se stai usando il DB remoto, che la sessione Supabase configurata dentro Admin sia attiva e che l'utente abbia i permessi corretti; l'app riallinea automaticamente snapshot live e match live.


- Preflight backup JSON: classifica ogni file come **moderno** (nessun YoB legacy rilevato) oppure **legacy compatibile** (YoB presenti solo come fallback compatibile).

- Per controllare un backup JSON esterno prima del restore puoi usare anche il comando locale `npm run inspect:backup -- ./path/to/backup.json`, che indica se il file è `modern` o `legacy-compatible` e quanti blocchi YoB legacy contiene.


## Addendum operativo — Grafiche social / Integrazioni / Import squadre

- **Grafiche social**: se rigeneri la struttura torneo e alcuni match cambiano, gli slot manuali eliminano in automatico i riferimenti a match non più validi. Se uno slot resta senza orario o senza partite, il download viene bloccato finché non lo correggi.
- **Integrazioni → modifica torneo**: il pulsante secondario dell'editor torneo ricarica lo snapshot salvato; quando ci sono cambi non salvati funge anche da annulla modifiche.
- **Import squadre XLSX**: se il file contiene più fogli, l'app prova a leggere quello più coerente col primo layout XLSX memorizzato. In caso di mismatch, l'avviso indica anche gli altri fogli controllati.

- Nelle Grafiche Social, se una grafica selezionata non è esportabile, il pannello mostra subito il motivo preciso sotto al selettore export.
- Se restano match fuori dagli slot, il pannello mostra una preview dei primi match rimasti fuori.
- Negli import XLSX multi-sheet, gli alert elencano gli altri fogli controllati senza ripetere il foglio già letto.
