# Protezione delle bozze Fanta ed Edizioni

## Rosa Fanta

Il builder carica la rosa quando cambia l'identità giocatore (account e modo della sessione). Un aggiornamento dei metadati della stessa presenza non reinizializza i campi. Il listener storage considera soltanto la chiave presenza e `clear()`; lingua e heartbeat repository non causano una lettura della rosa.

Un vero logout/cambio account nasconde subito i campi della precedente identità, riparte dalla schermata iniziale e invalida le letture precedenti. Una generazione distinta per ogni transizione e unmount invalida anche risposte di salvataggio e timer: tornare da A a B e poi ad A non rende attuale la prima sessione. Nome, quattro giocatori, capitano e difensori restano in memoria durante gli aggiornamenti della stessa sessione e dopo un salvataggio fallito. Non viene introdotto un autosalvataggio.

Questa correzione non implementa recupero dopo riavvio/crash o cambio forzato di edizione. Il refresh della shell che chiude il builder e la distinzione fra errore di lettura e rosa assente richiedono il successivo lavoro sulla freschezza Fanta; non sono dichiarati risolti dal filtro storage.

## Editor Edizioni

`EditionWorkspace` registra un guard limitato alla propria istanza e riusa la modale «Modifiche non salvate». Il guard è consultato dalle navigazioni interne, dalle card e dagli eventi `flbp:open-data-*` del DataTab, dal cambio sezione Admin e dalle uscite App. L'integrazione App protegge anche l'ingresso TV nella stessa finestra; l'apertura di una finestra TV separata non smonta l'editor.

- Annulla lascia montato il form, compresi valori parziali o non validi.
- Esci senza salvare autorizza una sola destinazione. Altri clic durante la conferma non la sostituiscono.
- Salvataggio ONLINE o import in corso impediscono uscita e scarto.
- ONLINE azzera la bozza solo dopo il commit durevole già esistente. LOCALE mantiene il proprio salvataggio sincrono. Un errore mantiene i campi modificati.
- Gli eventuali preload precedono il consenso: modifiche o salvataggi iniziati durante l'attesa sono valutati prima di cambiare vista.
- Il logout volontario consulta il guard prima di signOut. Con una bozza usa soltanto la modale di scarto; senza bozza mantiene la conferma logout. Dopo consenso una vista busy smonta immediatamente il form, prima delle attese remote. Revoca/scadenza involontaria non vengono bloccate.
- Il cleanup rimuove soltanto il guard dell'istanza e annulla una conferma ancora pendente. Il registro non conserva dati personali o contenuto dei form.

La conferma riguarda uscite volontarie SPA. Il `beforeunload` dell'editor rimane attivo per chiusura/ricaricamento reali; non è una garanzia di recupero dopo crash. Revoca della sessione, logout imposto e ripristino forzato non possono essere bloccati indefinitamente dal form: il recupero di quelle bozze richiede un progetto separato, con isolamento per account/workspace.

## Verifiche

- `node scripts/test-draft-navigation.mjs`: servizio reale, consenso/annullamento, clic ripetuti, cleanup, busy, eccezioni e indipendenza dei preload. Esegue anche i callback Admin estratti dai sorgenti per verificare save avviato durante preload e logout; queste ultime sono prove della logica, non un mount browser di Admin.
- `node scripts/test-draft-protection.mjs`: Playwright con builder, DataTab, workspace, editor e modale reali. IO e sole viste destinazione sono sintetici; rete esterna bloccata, nessun `.env` privato. Due schede generano veri eventi storage. Controlla anche logout con risposta ritardata, commit ONLINE sospeso/fallito e semantica di salvataggio LOCALE.
- `--prove-fanta-regression` ripristina in memoria del server di test il listener generico e la dipendenza dall'oggetto sessione; verifica che l'evento lingua sovrascriva la bozza con il nome salvato.
- `--prove-edition-regression` bypassa in memoria il guard delle card DataTab; verifica che Account rimuova il form senza consenso.

I due controlli negativi sono auto-verificanti: exit 0 soltanto quando la mutazione è stata applicata, il setup browser è completo e pulito e fallisce l'asserzione esatta del difetto atteso (fase, AssertionError, messaggio e valori confrontati). Un mutant che passa, un timeout, un errore infrastrutturale o una diversa asserzione producono exit 1. Non trattano un qualunque fallimento del browser come prova della regressione.

Playwright può essere installato separatamente dalla app. Il runner usa `FLBP_PLAYWRIGHT_MODULE` se presente e altrimenti `playwright`; `FLBP_BROWSER_EXECUTABLE` è facoltativo, altrimenti usa Chromium. Cache e server sono isolati in `.tmp-draft-protection`, senza scritture a `.tmp-node-tests`. Eseguire anche typecheck, SSR Admin e build per il lotto.
