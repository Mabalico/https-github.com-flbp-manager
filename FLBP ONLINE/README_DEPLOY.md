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
