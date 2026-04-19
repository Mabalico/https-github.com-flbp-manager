# README_DEPLOY.md

## Obiettivo raggiunto

Questa patch prepara l'app per deploy pubblico **frontend statico su Cloudflare Pages** con:

- **Accesso Admin tramite Supabase Auth**
- **Supabase DB + RLS** per persistenza, sincronizzazione e autorizzazione admin via `public.admin_users`
- **nessun backend Node/Express separato**
- **autosave admin automatico**
- **persistenza reale dei referti arbitri**
- **solo anon/publishable key nel frontend**
- **nessuna service_role nel browser**
- **OCR non modificato**

---

## Cosa ho cambiato

### 1) Accesso admin reale
- L’accesso all’area Admin richiede una **sessione Supabase Auth reale**.
- Dopo il login, il frontend verifica che l’account autenticato sia presente in `public.admin_users`.
- Login/sessione e autorizzazione restano separati: la sessione apre l’area Admin, mentre le scritture remote continuano a dipendere da RLS + `public.flbp_is_admin()`.
- Il pannello `Admin → Dati / Persistenza` resta il punto operativo per diagnostica, sync DB e cambio/rinnovo sessione.

### 2) Autosave admin robusto
- Le modifiche admin continuano a partire dallo state globale già esistente, ma ora il layer remoto:
  - salva una **bozza locale pending** prima del flush remoto
  - mostra lo stato di sync in UI
  - non perde le modifiche recenti in caso di errore o refresh
  - ritenta automaticamente quando torna la connettività/sessione
  - evita overwrite remoto se esiste una bozza locale non sincronizzata
  - in caso di conflitto conserva la bozza locale

### 3) UX sync status
- In admin compare uno stato chiaro:
  - `Salvataggio in corso…`
  - `Tutte le modifiche salvate.`
  - stato pending
  - errore / conflitto di sincronizzazione

### 4) Persistenza arbitri
- Il flusso arbitri non è stato riscritto.
- Ho mantenuto l'impianto già presente che salva davvero su Supabase tramite RPC / persistenza remota.
- OCR/Tesseract non toccato.

### 5) Variabili ambiente
- Tutta la configurazione frontend usa variabili Vite:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_SUPABASE_ADMIN_EMAIL`
  - `VITE_WORKSPACE_ID`
  - `VITE_REMOTE_REPO`
  - `VITE_PUBLIC_DB_READ`
  - `VITE_AUTO_STRUCTURED_SYNC`
  - `VITE_APP_MODE`
- `VITE_ALLOW_LOCAL_ONLY` (opzionale, default consigliato `0`)
- Ho aggiunto `.env.example`.
- Ho sanitizzato `.env.local` per non lasciare valori reali nel pacchetto.

### 6) Supabase SQL / RLS
- Aggiunta la tabella `public.admin_users`.
- Aggiornata la funzione `public.flbp_is_admin()` per usare principalmente `admin_users`, mantenendo anche compatibilità con vecchi metadata JWT.
- Aggiornato `supabase/setup_all.sql` con la nuova migration finale.
- Aggiunta la tabella `public.app_supabase_usage_daily` + RPC `public.flbp_track_supabase_usage_batch(...)` per il monitor admin del traffico Supabase stimato lato app.

### 7) Cloudflare Pages
- Build verificata con output `dist`.
- Aggiunto `.nvmrc`.
- `vite.config.ts` non inietta più chiavi build-time non necessarie nel client pubblico.

### 8) Player Area e convocazioni squadra
- Aggiunta la route `player_area` nel client web.
- Il login giocatore resta **opzionale**: il torneo continua a funzionare anche senza account.
- La UI player include:
  - sign in / registrazione preview locale
  - profilo con nome, cognome e data di nascita
  - risultati personali derivati dai dataset pubblici
  - stato live del torneo collegato
  - alert di convocazione squadra in preview locale
- La semantica corretta e' **convocazione push/live**, non telefonata OS reale.
- Nel repository sono pronti anche wrapper e migration additive per il rollout live di profili player, device e chiamate squadra, ma non sono attivi finche' non esegui l'SQL sul progetto Supabase reale.

### Strategia mobile
- Il percorso mobile primario e' il wrapper Capacitor documentato in `docs/MOBILE_WRAPPER.md`.
- La strategia complessiva, inclusi cleanup e rollback delle app native dedicate, e' in `docs/MOBILE_STRATEGY.md`.
- `FLBP ANDROID` e `FLBP IOS` restano legacy/transitori: utili per confronto e fallback, ma non sono il percorso consigliato per nuove feature mobile.

---

## File modificati

- `App.tsx`
- `components/AdminDashboard.tsx`
- `components/admin/tabs/data/DbSyncPanel.tsx`
- `services/adminSyncState.ts`
- `services/repository/RemoteRepository.ts`
- `services/repository/remoteDraftCache.ts`
- `services/supabaseRest.ts`
- `services/viteEnv.ts`
- `vite.config.ts`
- `release_bundle/FLAGS.md`
- `.env.local`
- `.env.example`
- `.nvmrc`
- `supabase/migrations/20260323000300_admin_auth_roles.sql`
- `supabase/setup_all.sql`
- `package-lock.json` (aggiornato dopo reinstall dipendenze per build corretta)
- `dist/*` (rigenerato)
- `README_DEPLOY.md`

---

## Variabili ambiente necessarie

Imposta queste variabili in locale e su Cloudflare Pages:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
VITE_SUPABASE_ADMIN_EMAIL=admin@flbp.local
VITE_WORKSPACE_ID=default
VITE_REMOTE_REPO=1
VITE_PUBLIC_DB_READ=1
VITE_AUTO_STRUCTURED_SYNC=1
# opzionale: lascia 0/assente in deploy pubblico per impedire il fallback locale
VITE_ALLOW_LOCAL_ONLY=0
VITE_APP_MODE=official
```

### Note
- usare **solo** la anon/publishable key nel frontend
- **non** usare mai `service_role` nel browser
- in deploy pubblico lascia `VITE_ALLOW_LOCAL_ONLY` assente oppure `0` per bloccare il toggle 'Opera solo in locale'
- in deploy pubblico imposta `VITE_APP_MODE=official`
- nella build pubblica l’area Admin si apre solo dopo login Supabase con account presente in `public.admin_users`
- i messaggi della sezione Dati/Visualizzazioni sono stati allineati al deploy pubblico: niente riferimenti operativi a token manuali o a modalità locale come percorso standard
- aggiornata anche la copy localizzata di Home/Admin/Arbitri: non compaiono più messaggi che promettono accessi senza password o campi "opzionali" dove la password è richiesta
- rimossi anche i riferimenti residui a "token admin" come percorso standard nei messaggi UI/docs del deploy pubblico
- allineati anche `README.md`, `docs/manuale_utente.md` e `docs/APP_FUNCTIONS.md` al profilo pubblico `official`, con accesso Admin solo-Supabase

---

## SQL da eseguire in Supabase

### File consigliato
Esegui nel SQL Editor:

- `supabase/setup_all.sql`

Questo file include anche la migration finale per l'admin auth.

### Cosa aggiunge la migration finale
- tabella `public.admin_users`
- policy select self per utente autenticato
- funzione `public.flbp_is_admin()` aggiornata
- RPC `public.flbp_admin_push_workspace_state(...)` per scrittura snapshot admin atomica con check conflitto lato DB
- tabella `public.app_supabase_usage_daily`
- RPC `public.flbp_track_supabase_usage_batch(...)` per aggregare byte/richieste stimate del frontend verso Supabase

### Preparazione nativa additiva (non necessaria ora)
- Nel repository e' presente anche `supabase/migrations/20260328000100_referee_pull_live_state_rpc.sql`.
- Aggiunge la RPC `public.flbp_referee_pull_live_state(...)`, pensata per un futuro flusso nativo arbitri che debba leggere in modo protetto lo snapshot live completo prima di costruire un save sicuro.
- Questa RPC e' **additiva**: non sostituisce `flbp_referee_auth_check(...)` o `flbp_referee_push_live_state(...)`.
- La web app pubblica attuale **non** la usa, quindi non e' richiesta per il deploy Cloudflare/Supabase gia' online.
- Se l'app live e' in uso, puoi tranquillamente **rimandarne l'applicazione** a una finestra dedicata: il comportamento online corrente non cambia finche' non la esegui nel progetto reale.

### Preparazione player/call additiva (non necessaria ora)
- Nel repository e' presente anche `supabase/migrations/20260328000200_player_app_accounts_and_calls.sql`.
- Aggiunge in modo **additivo**:
  - `public.player_app_profiles`
  - `public.player_app_devices`
  - `public.player_app_calls`
  - `public.flbp_player_call_team(...)`
  - `public.flbp_player_ack_call(...)`
  - `public.flbp_player_cancel_call(...)`
- Questi oggetti servono per il rollout live di account giocatore, convocazioni squadra e conferma ricezione.
- La web app pubblica attuale usa ancora solo la preview locale di `player_area`, quindi non devi applicare questa migration finche' non hai una finestra sicura sul Supabase reale.

### Catalogo admin account giocatori (non necessario ora)
- Nel repository e' presente anche `supabase/migrations/20260330000100_player_app_admin_accounts.sql`.
- Aggiunge in modo **additivo** la funzione `public.flbp_admin_list_player_accounts(...)`.
- Serve a popolare la nuova quinta sezione `Gestione dati -> Account giocatori`, con elenco unico account / provider / profilo giocatore collegato.
- Anche questa migration puo' aspettare una finestra sicura: il web online corrente non dipende ancora da lei.

### Bundle rollout pronto
- Per applicare in un colpo solo il blocco additivo `referees/player/accounts`, usare:
  - `supabase/rollouts/20260402_player_referee_additive_rollout.sql`
- Dopo l'applicazione, verificare con:
  - `supabase/rollouts/20260402_player_referee_additive_postcheck.sql`

### Promemoria backend unico
- Tutta la sequenza SQL/backend preparata da inizio chat e' raccolta anche in `docs/SQL_ROLLOUT_TODO.md`.
- Dentro trovi:
  - cosa e' gia' stato applicato
  - cosa e' solo pronto nel repo
  - il promemoria esplicito sul **mittente email amministratore reale / SMTP reale** ancora da collegare per i reset password live

### Promemoria deploy Cloudflare
- I fix web gia' pronti nel repo ma non ancora garantiti sulla build Cloudflare online sono raccolti in `docs/CLOUDFLARE_PENDING_DEPLOY_FIXES.md`.
- Questo include in particolare:
  - riallineamento `public_workspace_state` come fonte pubblica coerente
  - fix TV/tabellone

## Deploy automatico da GitHub (Cloudflare Pages)

Il web pubblico usa ora un progetto **Cloudflare Pages** con **Git integration nativa** collegata al repository:
- `Mabalico/https-github.com-flbp-manager`

Configurazione attuale:
- progetto Pages: `flbp-pages`
- branch di produzione: `main`
- root directory: `FLBP ONLINE`
- framework preset: `React (Vite)`
- build command: `npm run build`
- output directory: `dist`

Variabili ambiente configurate in Cloudflare Pages:
- `VITE_SUPABASE_URL=https://kgwhcemqkgqvtsctnwql.supabase.co`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_XhZ5hAdoycuWfDMeiQKaGA_7gD6nDhz`
- `VITE_SUPABASE_ADMIN_EMAIL=admin@flbp.local`
- `VITE_REMOTE_REPO=1`
- `VITE_WORKSPACE_ID=default`
- `VITE_PUBLIC_DB_READ=1`
- `VITE_AUTO_STRUCTURED_SYNC=1`
- `VITE_ALLOW_LOCAL_ONLY=0`
- `VITE_APP_MODE=official`

Conseguenza operativa:
- i deploy web partono automaticamente dai push su `main`
- il vecchio flusso manuale `Direct Upload` / Worker non e' piu' il percorso raccomandato
- l'eventuale workflow GitHub Actions provato in precedenza e' stato rimosso per evitare doppio deploy

Regola pratica da mantenere:
- `Cloudflare Pages` e' il frontend canonico
- `flbp-pages.pages.dev` e' il riferimento stabile per web mirror Android/iOS
- il vecchio `Worker` va considerato solo legacy esterno temporaneo, non dipendenza operativa

Nota:
- `VITE_SUPABASE_ANON_KEY` e' una chiave publishable/publica lato client
- resta consigliato ruotare l'eventuale token Cloudflare mostrato in screenshot durante il setup iniziale

### Nota sul monitor traffico
- La sezione `Admin → Gestione dati → Traffico Supabase` mostra una **stima del traffico FLBP verso Supabase**, non il billing ufficiale della piattaforma.
- Serve per confrontare periodi, aree (`public`, `tv`, `admin`, `referee`, `sync`) e volume richieste/byte generato dall'app.
- Per il dato di fatturazione reale resta valida la dashboard ufficiale Supabase.

---

## Come abilitare l’accesso Admin

### Metodo dashboard
1. Configura gli env/build corretti (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, ecc.)
2. Crea l’utente Supabase Auth che userai per l’Admin
3. Inserisci quell’utente in `public.admin_users`
4. Apri l’app e fai login nell’area Admin con email/password Supabase

### Poi abilita il ruolo admin DB
Dopo aver creato l'utente Supabase, esegui nel SQL Editor:

```sql
insert into public.admin_users (user_id, email)
select id, email
from auth.users
where email = 'admin@flbp.local'
on conflict (user_id) do update
set email = excluded.email;
```

> Se vuoi usare una mail diversa, aggiorna anche `VITE_SUPABASE_ADMIN_EMAIL`.

---

## Primo accesso Admin

1. Avvia l'app
2. Apri area Admin
3. Inserisci email/password dell’utente Supabase configurato come admin
4. Se il login Auth riesce ma l’accesso Admin viene negato:
   - controlla di avere inserito il record in `public.admin_users`
   - verifica che `public.flbp_is_admin()` sia presente e aggiornato nel progetto reale

---

## Come verificare che l'autosave admin scriva davvero nel DB

### Verifica pratica
1. entra in admin
2. modifica un dato amministrativo normale
3. osserva il badge/stato sync:
   - `Salvataggio in corso…`
   - poi `Tutte le modifiche salvate.`
4. in Supabase controlla le tabelle:
   - `public.workspace_state`
   - se attivo l'auto sync strutturato anche:
     - `public.tournaments`
     - `public.tournament_teams`
     - `public.tournament_matches`
     - `public.tournament_match_stats`
     - `public.public_workspace_state`
     - altre tabelle public già previste

### Verifica tecnica
- il layer remoto salva una bozza locale `flbp_remote_unsynced_draft_v1` prima del flush
- se cade la rete, la bozza resta locale e il retry riparte automaticamente
- se ricarichi prima del flush, l'app evita di farsi sovrascrivere dal pull remoto
- la write admin dello snapshot passa da una RPC DB con lock su `workspace_state` + controllo `base_updated_at`, quindi due admin non si sovrascrivono in silenzio salvo `Forza sovrascrittura`
- in caso di conflitto admin, la bozza locale resta in coda sul device: il percorso standard e' ricaricare/applicare il DB e non forzare la sovrascrittura
- quando applichi manualmente un download dal DB in Admin → Dati / Persistenza, l'app scarta anche l'eventuale bozza locale rimasta in coda per evitare conflitti ricorrenti sullo stesso device

---

## Come verificare che i referti arbitri scrivano davvero nel DB

1. apri sezione arbitri
2. completa un referto
3. conferma il salvataggio del referto
4. verifica in Supabase:
   - aggiornamento dello snapshot live
   - aggiornamento dei dati live/public correlati già previsti dal progetto
5. se usi il flusso con password arbitro, il salvataggio passa dal layer/RPC già presente

> OCR non è stato modificato in questa patch.
> Nella build pubblica, se il torneo usa accesso arbitri remoto via RPC e non espone una `refereesPassword` locale nello snapshot, la password arbitri non viene più conservata in `sessionStorage`: dopo refresh o chiusura scheda serve un nuovo login arbitri prima di inviare il referto.

---

## Deploy su Cloudflare Pages

### Metodo consigliato: Git integration
1. pubblica il repository su GitHub/GitLab
2. in Cloudflare vai su **Workers & Pages**
3. crea un nuovo progetto Pages da repository esistente
4. imposta:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. aggiungi le variabili ambiente del blocco sopra
6. salva e fai deploy

### Node consigliato
- usa Node `22`
- nel progetto è presente `.nvmrc`

### Output directory
- `dist`

### Produzione / Preview
Imposta le stesse env su entrambi gli environment, cambiando solo URL/chiavi/workspace se necessario.

---

## Verifica build locale

```bash
npm install
npm run build
```

Build verificata in questa patch con output corretto in `dist`.

---

## Passaggi manuali residui

1. creare il progetto Supabase
2. eseguire `supabase/setup_all.sql`
3. configurare le env in Cloudflare Pages
4. creare l’utente Supabase Auth admin e inserirlo in `public.admin_users`
5. verificare che il login Admin dal frontend riesca con quell’account
6. collegare il repository Git e fare deploy

---

## Come funziona ora l’accesso admin

- l’area Admin si apre solo con una sessione Supabase Auth reale
- il frontend verifica l’accesso Admin controllando `public.admin_users`
- le operazioni remote verso Supabase continuano a usare Auth + RLS; la sessione del browser e l’autorizzazione DB restano due livelli separati
- per snapshot, export strutturato, seed e autosave remoto serve una sessione Supabase valida sul device; poi l’autorizzazione finale resta in mano a RLS / `public.admin_users` / `public.flbp_is_admin()`
- nessuna `service_role` è usata lato client

---

## Build / deploy quick reference

- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Node consigliato**: `22`

---

## Nota finale

Questa patch prepara l'app al deploy statico pubblico senza introdurre backend separati.  
Le uniche attività non eseguibili da qui sono quelle da dashboard esterna:
- creare progetto Supabase
- creare utente Auth admin
- eseguire SQL nel SQL Editor
- configurare env su Cloudflare Pages
- collegare il repository Git

## Nota build/chunking
- La build Vite è stata rifinita con uno split dedicato per `lucide-react` in `vite.config.ts` per ridurre il rischio di chunk admin oltre soglia e mantenere il deploy Pages più pulito.
- Nessun cambio di stack, nessuna Pages Function, nessun impatto su OCR o TV mode.
