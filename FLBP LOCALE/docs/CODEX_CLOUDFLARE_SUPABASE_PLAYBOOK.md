# CODEX_CLOUDFLARE_SUPABASE_PLAYBOOK

Playbook operativo repo-driven per lavorare in **Codex** sul repository reale di FLBP Manager Suite con target:
- frontend statico su **Cloudflare Pages**
- persistenza / letture pubbliche / sync su **Supabase**
- nessun backend Node/Express separato
- vincoli hard invariati su **OCR / Referti / BYE / TBD / TV**

> Nota stato repo: il repository corrente usa ora **Admin via Supabase Auth**. Le sezioni sotto includono anche prompt/stati storici P2A-P2B: se trovi mismatch, fai prevalere i file runtime attuali (`AGENTS.md`, `components/AdminDashboard.tsx`, `services/supabaseRest.ts`, `README_DEPLOY.md`).

## Fonte di verità verificata nel repository

Questi punti sono verificati nei file reali del repo:

- `AGENTS.md`
  - stack invariato, patch minime, niente dipendenze nuove, TV read-only, OCR/Referti intoccabili salvo richiesta esplicita.
- `components/AdminDashboard.tsx`
  - l’area Admin richiede una sessione Supabase Auth reale e verifica l’account admin prima di aprire il pannello.
- `services/adminLocalAuth.ts`
  - tombstone compatibilita': il gate Admin locale è stato rimosso.
- `services/supabaseRest.ts`
  - login/password Supabase, refresh sessione, verifica `admin_users`, test connessione e scritture remote.
- `services/supabasePublic.ts`
  - letture pubbliche anonime lato frontend con env Vite.
- `services/repository/featureFlags.ts`
  - flag reali per repository remoto, local-only e structured sync.
- `services/repository/RemoteRepository.ts`
  - repository remoto con polling, pending state e push/pull.
- `services/autoDbSync.ts`
  - structured sync automatico con throttle e debounce.
- `services/devRequestPerf.ts`
  - strumentazione reale per misurare richieste e traffico Supabase.
- `.env.example`
  - env Vite già allineate al target pubblico.
- `README_DEPLOY.md`
  - stato deploy e passaggi manuali dichiarati nel repo.
- `supabase/setup_all.sql`
  - schema one-shot con `admin_users` e funzione `flbp_is_admin()` inclusi nella build attuale.

## Ordine consigliato dei lavori in Codex

Ordine raccomandato, dal più razionale al meno rischioso:

1. **P0 — Audit reale del repo e scelta del ramo auth**
2. **P1 — Allineamento deploy pubblico Cloudflare + Supabase**
3. **P2A — Chiusura coerente del modello auth attuale (consigliato)**
4. **P3 — Misurazione consumi Supabase reali**
5. **P4 — Un solo micro-fix performance + QA finale**
6. **P2B — Migrazione Admin solo-Supabase** (**solo se decisa esplicitamente dopo P1/P2A**)

## Nota sui rami P2A / P2B

Le sezioni successive conservano anche i prompt storici usati quando il repository era ancora locale-first. Nel repository attuale la migrazione **Admin solo-Supabase** è già il modello reale: usa questa guida come archivio operativo e non come snapshot immutabile dello stato corrente.

---

# PROMPT P0 — Audit reale e decisione del ramo auth

```text
Sei Lead Engineer su FLBP Manager Suite.

Lavora SOLO sul repository già aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO il repository reale.
Se trovi mismatch con handoff o chat, scrivi: "chat non affidabile, seguo il repository".

OBIETTIVO
Produrre un audit reale del progetto rispetto al target:
- frontend statico su Cloudflare Pages
- dati e sync su Supabase
- nessun backend Node/Express separato
- OCR/Referti/BYE/TBD/TV invariati

FILE DA ISPEZIONARE PRIMA
- AGENTS.md
- README.md
- README_DEPLOY.md
- .env.example
- vite.config.ts
- components/AdminDashboard.tsx
- services/adminLocalAuth.ts
- services/viteEnv.ts
- services/supabasePublic.ts
- services/supabaseRest.ts
- services/supabaseSession.ts
- services/repository/featureFlags.ts
- services/repository/RemoteRepository.ts
- services/autoDbSync.ts
- services/devRequestPerf.ts
- docs/REFRESH_SUPABASE_MAP.md
- supabase/setup_all.sql
- supabase/migrations/

COMANDI
- npm run build
- npm run check:ssr-admin
- npm run check:i18n

COSA DEVI FARE
1. Fare audit citando path reali e cosa hai verificato.
2. Distinguere chiaramente:
   - cosa è già pronto per Cloudflare Pages
   - cosa è già pronto per Supabase
   - cosa è ancora locale-first
   - cosa è ambiguo o incoerente
3. Verificare in particolare:
   - modello auth Admin reale
   - env Vite realmente usate
   - eventuali hardcode di chiavi/URL
   - repository remoto e autosync
   - referee save remoto
   - compatibilità build pubblica
4. Applicare SOLO fix minimi e oggettivi se trovi incoerenze banali e low-risk.
5. Concludere con una raccomandazione esplicita:
   - procedere con P2A
   - oppure procedere con P2B
   motivandola sui file reali.

OUTPUT FINALE OBBLIGATORIO
1. Stato reale architettura
2. File ispezionati
3. Comandi eseguiti e risultato
4. Gap list prioritaria verso il deploy finale
5. Rischi reali prima del go-live
6. Raccomandazione finale: P2A o P2B
7. File modificati
8. File verificati ma non modificati
9. Stop
```

---

# PROMPT P1 — Deploy pubblico Cloudflare + Supabase senza cambiare ancora l’auth Admin

```text
Sei Lead Frontend/Platform Engineer su FLBP Manager Suite.

Lavora SOLO sul repository già aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO il repository reale.
Se trovi mismatch con la chat, scrivi: "chat non affidabile, seguo il repository".

OBIETTIVO
Rendere il deploy pubblico Cloudflare Pages + Supabase coerente e robusto,
SENZA cambiare ancora il modello auth Admin attuale.

ASSUNTO DA PRESERVARE IN QUESTO STEP
- Admin resta locale-first se questo è ciò che il repo reale implementa oggi
- Supabase resta il layer remoto per DB, sync e letture pubbliche
- niente migrazione a Admin-only-Supabase in questo step

VINCOLI HARD
- nessuna dipendenza nuova
- nessun backend Node/Express
- non toccare Referti/OCR
- non toccare TV salvo bug bloccanti
- non toccare BYE/TBD
- diff minimo
- niente refactor grande

PATH DA CONTROLLARE
- README.md
- README_DEPLOY.md
- .env.example
- vite.config.ts
- services/viteEnv.ts
- services/repository/featureFlags.ts
- services/supabasePublic.ts
- services/supabaseRest.ts
- services/supabaseSession.ts
- services/repository/RemoteRepository.ts
- services/autoDbSync.ts
- components/AdminDashboard.tsx
- components/admin/tabs/data/DbSyncPanel.tsx
- supabase/setup_all.sql
- supabase/migrations/

COSA DEVI FARE
1. Allineare codice + docs + env al target deploy pubblico.
2. Verificare che il frontend usi solo env Vite appropriate.
3. Verificare che non ci siano `service_role` o segreti client-side.
4. Verificare che Cloudflare Pages sia configurabile con:
   - npm run build
   - output dist
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_SUPABASE_ADMIN_EMAIL
   - VITE_WORKSPACE_ID
   - VITE_REMOTE_REPO
   - VITE_PUBLIC_DB_READ
   - VITE_AUTO_STRUCTURED_SYNC
   - VITE_ALLOW_LOCAL_ONLY
   - VITE_APP_MODE
5. Verificare che `local_only` sia coerente con un deploy pubblico.
6. Correggere SOLO mismatch reali e low-risk.
7. Se modifichi comportamento pubblico o admin, aggiornare la doc interessata.

COMANDI
- npm run build
- npm run check:ssr-admin
- npm run check:i18n
- npm run test:data SOLO se tocchi data layer / serializer / sync

OUTPUT FINALE OBBLIGATORIO
1. Stato finale deploy pubblico risultante
2. File modificati
3. File verificati ma non modificati
4. Mismatch reali trovati e fix applicati
5. Cose deliberate che NON hai cambiato
6. Checklist manuale Cloudflare Pages
7. Checklist manuale Supabase
8. Rischi residui veri
9. Stop
```

---

# PROMPT P2A — Chiusura coerente del modello auth attuale (consigliato)

```text
Sei Lead Security/Product Engineer su FLBP Manager Suite.

Lavora SOLO sul repository già aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO il repository reale.
Se trovi mismatch con la chat, scrivi: "chat non affidabile, seguo il repository".

OBIETTIVO
Chiudere in modo coerente il modello auth reale ATTUALE:
- ingresso Admin locale interno all’app
- operazioni remote Supabase protette da sessione auth reale + controlli DB/RLS
- deploy pubblico Cloudflare + Supabase pronto senza confondere i due livelli

QUESTO STEP NON DEVE
- migrare tutto a login Admin solo-Supabase
- introdurre backend
- toccare OCR / TV / BYE / TBD
- aggiungere dipendenze

FILE CHIAVE
- services/adminLocalAuth.ts
- components/AdminDashboard.tsx
- components/admin/tabs/data/DbSyncPanel.tsx
- services/supabaseRest.ts
- services/supabaseSession.ts
- services/repository/featureFlags.ts
- services/repository/RemoteRepository.ts
- services/autoDbSync.ts
- README.md
- README_DEPLOY.md
- docs/manuale_utente.md
- docs/APP_FUNCTIONS.md
- supabase/setup_all.sql
- supabase/migrations/

COSA DEVI VERIFICARE E FISSARE
1. Il gate locale Admin deve restare chiaramente separato dalle autorizzazioni remote Supabase.
2. Nessuna write remota sensibile deve dipendere solo dal codice locale.
3. La UI non deve promettere implicitamente che il codice locale basti per scrivere nel DB.
4. Le docs devono spiegare chiaramente:
   - cosa sblocca il codice locale
   - quando serve login/sessione Supabase
   - come entrano in gioco `public.admin_users` e `flbp_is_admin()`
5. Verificare che referee remote save resti coerente e che la password arbitri non venga persistita in modo scorretto.
6. Cercare e rimuovere copy incoerenti o misleading, ma con patch minime.

COMANDI
- npm run build
- npm run check:ssr-admin
- npm run check:i18n
- npm run test:data SOLO se tocchi il layer dati remoto

OUTPUT FINALE OBBLIGATORIO
1. Architettura auth finale risultante
2. File modificati
3. File verificati ma non modificati
4. Punti di sicurezza verificati
5. Punti ancora manuali in Supabase
6. Punti ancora manuali in Cloudflare
7. Rischi residui veri
8. Stop
```

---

# PROMPT P2B — Migrazione Admin solo-Supabase (opzionale, dopo P1/P2A)

```text
Sei Lead Full-Stack/Product Engineer su FLBP Manager Suite.

Lavora SOLO sul repository già aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO il repository reale.
Se trovi mismatch con la chat, scrivi: "chat non affidabile, seguo il repository".

OBIETTIVO
Migrare davvero l’Admin a un modello solo-Supabase, eliminando il gate locale placeholder,
ma mantenendo il progetto deployabile su Cloudflare Pages + Supabase e senza introdurre backend.

USA QUESTO PROMPT SOLO SE
- hai già chiuso P0 e P1
- hai deciso esplicitamente di cambiare il modello prodotto
- accetti una modifica architetturale più rischiosa del ramo P2A

VINCOLI HARD
- nessuna dipendenza nuova
- nessun backend Node/Express
- non toccare Referti/OCR
- non toccare TV salvo bug bloccanti
- non toccare BYE/TBD
- compatibilità mobile invariata
- diff il più piccolo possibile compatibilmente con la migrazione

FILE DA ISPEZIONARE PRIMA
- services/adminLocalAuth.ts
- components/AdminDashboard.tsx
- components/admin/tabs/data/DbSyncPanel.tsx
- services/supabaseRest.ts
- services/supabaseSession.ts
- services/repository/featureFlags.ts
- services/repository/RemoteRepository.ts
- services/autoDbSync.ts
- README.md
- README_DEPLOY.md
- docs/manuale_utente.md
- docs/APP_FUNCTIONS.md
- supabase/setup_all.sql
- supabase/migrations/

MIGRAZIONE RICHIESTA
1. Rimuovere il gate locale `Giobotta@flbp` come meccanismo di accesso Admin.
2. Usare sessione Supabase reale come prerequisito di ingresso in Admin, se il repo reale lo rende sostenibile.
3. Usare `public.admin_users` / `flbp_is_admin()` come controllo authorizzativo remoto.
4. Mantenere separati:
   - login/sessione
   - autorizzazione admin DB
5. Aggiornare UI e docs per il nuovo flusso.
6. Non inventare tabelle o RPC: usare solo quelle reali.
7. Se la migrazione richiede passaggi SQL/manuali, documentarli chiaramente.
8. Se la migrazione completa è troppo rischiosa per un solo step, fare la variante più sicura ma esplicitarla.

COMANDI
- npm run build
- npm run check:ssr-admin
- npm run check:i18n
- npm run test:data se tocchi data layer / sync / repository

OUTPUT FINALE OBBLIGATORIO
1. Architettura auth finale risultante
2. File modificati
3. File verificati ma non modificati
4. Mismatch iniziali trovati
5. Diff sintetico della migrazione
6. SQL/manual steps necessari in Supabase
7. Manual steps necessari in Cloudflare
8. Rischio regressione
9. Come validare il nuovo flusso end-to-end
10. Stop
```

---

# PROMPT P3 — Misurazione consumi Supabase reali

```text
Sei Lead Frontend + Performance Engineer su FLBP Manager Suite.

Lavora SOLO sul repository già aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO il repository reale e la strumentazione già presente.
Se trovi mismatch con la chat, scrivi: "chat non affidabile, seguo il repository".

OBIETTIVO
Misurare i consumi Supabase REALI usando la strumentazione già presente nel repo,
senza reinventare tooling e senza cambiare UX.

STATO CHE DEVI VERIFICARE PRIMA
- services/devRequestPerf.ts
- docs/REFRESH_SUPABASE_MAP.md
- docs/PERF_REPORT_TEMPLATE.md
- App.tsx
- services/supabasePublic.ts
- services/supabaseRest.ts
- services/repository/RemoteRepository.ts
- components/AdminDashboard.tsx
- components/RefereesArea.tsx

VINCOLI HARD
- nessuna dipendenza nuova
- nessun cambio stack
- nessuna modifica UX
- non toccare Referti/OCR
- non toccare BYE/TBD
- TV resta read-only
- diff minimo
- non ottimizzare ancora nulla se prima non hai numeri reali

IMPORTANTE
- se non hai env/runtime Supabase reali disponibili, dichiaralo e fermati senza inventare numeri
- non reimplementare la strumentazione se esiste già
- il contatore visite può essere misurato separatamente ma NON deve guidare l’ottimizzazione principale

SCENARI DA MISURARE
- Home 5 min
- Leaderboard 5 min
- Hall of Fame 5 min
- Lista tornei 5 min
- Dettaglio torneo live 5 min
- TV bracket 5 min
- TV marcatori 5 min
- Admin 5 min
- Login arbitro + save risultato/referto

ISTRUZIONI
Per ogni scenario:
1. apri la vista reale
2. esegui `window.__flbpRequestPerf.reset()`
3. lascia la vista stabile
4. esegui `window.__flbpRequestPerf.reportNow()`
5. salva anche `window.__flbpRequestPerf.snapshot()`
6. compila/aggiorna `docs/PERF_REPORT_TEMPLATE.md`

REPORT RICHIESTO
Per ogni scenario:
- durata effettiva
- richieste totali
- richieste/minuto
- endpoint coinvolti
- payload medio per endpoint
- traffico totale per endpoint
- traffico totale scenario
- tempi medi/min/max
- polling presenti
- duplicazioni rilevate
- peso relativo

Alla fine:
- top endpoint più costosi
- top viste più costose
- primo/secondo/terzo collo di bottiglia
- cosa pesa poco
- rischio Supabase Free in uso normale / giornata live / caso intenso
- stima 100 utenti live per 5 ore + 2 TV + admin/arbitri normali
- nota chiara sulle approssimazioni

OUTPUT FINALE OBBLIGATORIO
1. Audit rapido dello stato performance reale
2. Scenari eseguiti davvero
3. Report finale sintetico
4. File modificati
5. Rischi residui
6. Primo step di ottimizzazione consigliato
7. Stop
```

---

# PROMPT P4 — Un solo micro-fix performance + QA finale deploy

```text
Sei Lead Frontend + Release Engineer su FLBP Manager Suite.

Lavora SOLO sul repository già aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO il repository reale e il report performance già generato.
Se trovi mismatch con la chat, scrivi: "chat non affidabile, seguo il repository".

OBIETTIVO
Fare AL MASSIMO un solo micro-fix performance giustificato dai numeri reali,
poi chiudere il QA finale per il deploy Cloudflare + Supabase.

VINCOLI HARD
- un solo micro-fix
- massimo impatto / minimo rischio
- UX invariata
- nessuna dipendenza nuova
- nessun backend
- non toccare Referti/OCR
- non toccare TV salvo bug bloccanti
- non toccare BYE/TBD
- niente refactor grande

PRIMA DI PATCHARE
1. Leggi il report performance già compilato.
2. Indica:
   - collo di bottiglia scelto
   - metrica che lo dimostra
   - file da toccare
   - riduzione stimata
   - rischio
3. Se non c’è un collo di bottiglia davvero netto, NON patchare nulla.

DOPO L’EVENTUALE PATCH
Esegui:
- npm run build
- npm run check:ssr-admin
- npm run check:i18n
- npm run test:data SOLO se hai toccato data layer / sync / serializer
- npm run check:ssr-tv
- npm run check:tv-readonly SOLO se hai toccato TV

POI FAI QA FINALE
Verifica e riporta:
- build Cloudflare-friendly
- env richieste chiare
- docs allineate
- auth/admin coerente con il ramo scelto
- Supabase manual steps chiari
- niente service_role client-side
- referee flow coerente
- TV/OCR non regrediti

OUTPUT FINALE OBBLIGATORIO
1. Micro-fix applicato oppure motivo per cui non era giustificato
2. File modificati
3. Diff sintetico
4. Risultato comandi eseguiti
5. Checklist finale Cloudflare
6. Checklist finale Supabase
7. Rischio regressione residuo
8. Come validare manualmente prima del go-live
9. Stop
```

## Nota pratica per usare meglio i limiti Codex

Per consumare meno quota:
- usa **P0** per decidere subito tra **P2A** e **P2B** invece di tentarle entrambe;
- se il goal immediato è deployabile e sicuro, fermati a **P2A**;
- usa **P2B** solo come migrazione prodotto separata;
- per task piccoli o di sola doc, evita cloud tasks e tieniti su editing locale;
- mantieni `AGENTS.md` e questa doc come contesto principale, invece di prompt enormi ridondanti.

---

## Integrazioni aggiunte per non perdere contesto dai prompt iniziali

Queste integrazioni servono a **non perdere informazioni utili emerse nei prompt storici** caricati in `Prompt vari.odt`, ma senza forzare Codex a seguire assunti che oggi potrebbero non coincidere col repository reale. In particolare:

- I prompt iniziali contenevano anche uno scenario storico in cui l’Admin era già migrato a **solo Supabase Auth + `public.admin_users`**. Questo **non va assunto di default** nel repo attuale: il prompt corretto va scelto solo dopo `P0`. fileciteturn1file0
- I prompt iniziali performance erano in realtà **tre varianti diverse**:
  1. strumentazione mancante → va prima inserita;
  2. strumentazione già presente → si misura e si ottimizza una sola cosa;
  3. closeout finale → si fa al massimo un ultimo micro-fix se i numeri lo giustificano. fileciteturn1file0
- Nei prompt iniziali c’erano anche richieste **fuori dal ramo deploy/performance**, in particolare il passaggio **birthDate-first** sul layer remoto e un handoff UI/Admin/TV da preservare. fileciteturn1file0

### Cosa NON è stato perso ma è stato spostato fuori dal flusso principale

1. **Passaggi manuali esterni Supabase/Cloudflare**
   - creare utente Supabase Auth `admin@flbp.local`
   - eseguire `supabase/setup_all.sql`
   - inserire l’utente in `public.admin_users`
   - configurare env e build `npm run build` / `dist` in Cloudflare Pages. fileciteturn1file0
2. **Checklist di verifica finale più dura**
   - ricerca globale per evitare ritorno di `service_role`, placeholder admin locale, token admin manuale, tester mode pubblico, `local_only` pubblico come default. fileciteturn1file0
3. **Output finali più espliciti**
   - spiegazione concreta dell’autosave admin;
   - spiegazione concreta di come è stata verificata la non esposizione della password/admin secret nel frontend. fileciteturn1file0
4. **Prompts non deploy/perf**
   - `birthDate-first` remoto/Supabase;
   - follow-up editor/TV handoff. fileciteturn1file0

---

## Decision tree operativo prima di lanciare Codex

Usa questo ordine se vuoi minimizzare quota e retry:

1. **Apri sempre con P0**.
2. Se `P0` conferma che il repo è ancora **local-first** per l’accesso Admin, continua con: `P1 → P2A → PERF-B o PERF-C → P4`.
3. Se `P0` conferma che il repo è già **Admin solo-Supabase**, salta `P2A` e usa invece `ALT-H1` come prompt di verification/finalization.
4. Se il repo performance **non** ha ancora `services/devRequestPerf.ts` o l’hooking reale in `services/supabaseRest.ts`, usa `PERF-A`.
5. Se il repo performance ha già la strumentazione e vuoi escludere il contatore visite, usa `PERF-B`.
6. Se hai già misure/patch performance e vuoi solo chiudere il lavoro, usa `PERF-C`.
7. Usa `DATA-BIRTHDATE-FIRST` e `UI-HANDOFF-EDITOR-TV` solo come task mirati fuori dal ramo Cloudflare/Supabase.

---

# ALT-H1 — Verification/finalization per repo già migrato ad Admin solo-Supabase

Usa questo prompt **solo** se `P0` conferma davvero che nel repository aperto:
- non esiste più il gate locale `Giobotta@flbp` come accesso Admin normale;
- l’Admin entra solo con sessione Supabase reale;
- `public.admin_users` / `flbp_is_admin()` sono già il modello corrente.

```text
Apri questo progetto come fonte di verità e lavora SOLO sul codice realmente presente.
Leggi e rispetta AGENTS.md.
Se trovi mismatch rispetto al contesto atteso, scrivi: "chat non affidabile, seguo il repository".

CONTESTO ATTESO DA VERIFICARE, NON DA ASSUMERE CIECAMENTE
Il progetto potrebbe essere già stato lavorato per arrivare a un deploy pubblico con:
- frontend statico su Cloudflare Pages
- database + auth su Supabase
- nessun backend Node/Express separato
- admin con login reale Supabase
- autosave admin su Supabase
- referti arbitri persistiti su Supabase
- OCR NON toccato
- TV mode NON toccata
- modalità pubblica forzata su official
- fallback local_only bloccato in build pubblica
- niente token admin manuale nella UI pubblica
- niente password arbitri persistita stabilmente nel browser
- build già verificata

OBIETTIVO
Fare una rifinitura finale e una verifica concreta che tutto ciò funzioni bene e sia coerente nel codice.
Non limitarti a descrivere: controlla il codice, correggi eventuali problemi residui minori, poi produci un report finale molto pratico.

REGOLE DURE
1. Fonte di verità: SOLO il repository aperto.
2. Non inventare file, route, tabelle, RPC, componenti o flow che non esistono.
3. NON toccare OCR / Tesseract / imageProcessingService salvo bug bloccanti di build.
4. NON toccare TV mode salvo bug bloccanti di build.
5. NON introdurre backend Node/Express.
6. NON aggiungere dipendenze npm salvo necessità veramente inevitabile. Preferenza fortissima: zero nuove dipendenze.
7. NON reintrodurre:
   - login admin locale placeholder
   - token admin manuale come flusso pubblico
   - fallback local_only come modalità normale pubblica
   - modalità tester in deploy pubblico
   - service_role key nel frontend
8. Mantieni compatibilità mobile.
9. Se devi scegliere tra soluzione fragile e soluzione semplice/robusta, scegli la robusta.

COSA DEVI VERIFICARE
1. Auth admin
- verifica che l’admin entri solo con sessione Supabase reale
- verifica che il gate admin non dipenda da placeholder locale
- verifica che azioni/route/pulsanti admin siano coerenti con sessione valida
- verifica che il ruolo admin sia controllato correttamente rispetto al DB / RLS / tabella ruoli presente

2. Persistenza admin
- verifica che le modifiche admin vadano davvero nel layer remoto Supabase
- verifica che non restino solo in stato locale
- verifica repository/service layer esistente
- verifica che non ci siano race condition o flow evidentemente incoerenti
- verifica che draft cache / pending sync non perdano modifiche recenti

3. Autosave admin
- verifica debounce/throttle
- verifica sync state UI: pending / syncing / synced / error / conflict
- verifica retry automatico
- verifica protezione su refresh/chiusura pagina con pending changes
- verifica che non ci siano duplicate writes o loop di sync evidenti

4. Sezione arbitri
- verifica che il salvataggio referto sia davvero persistito su Supabase
- verifica che il flusso resti a conferma esplicita
- verifica che la password arbitri remota non sia più persistita in modo scorretto nel browser
- NON toccare OCR

5. Env / Supabase / sicurezza
- verifica che il frontend usi solo env Vite corrette
- verifica che non ci siano URL/chiavi hardcodate residue
- verifica che non compaia `service_role` nel client
- verifica che la build pubblica usi il profilo corretto
- verifica coerenza di:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
  - VITE_SUPABASE_ADMIN_EMAIL
  - VITE_WORKSPACE_ID
  - VITE_REMOTE_REPO
  - VITE_PUBLIC_DB_READ
  - VITE_AUTO_STRUCTURED_SYNC
  - VITE_ALLOW_LOCAL_ONLY
  - VITE_APP_MODE

6. Deploy statico
- verifica che il progetto buildi correttamente
- verifica output `dist`
- verifica compatibilità Cloudflare Pages
- verifica `vite.config.ts` e script build
- se necessario fai solo correzioni minime
- se trovi warning di build ancora utili da sistemare, fallo solo se low risk

7. SQL / documentazione
- verifica che `README_DEPLOY.md` sia coerente col codice
- verifica coerenza di `supabase/setup_all.sql` e migration già presenti
- non duplicare schema se esiste già
- correggi solo incongruenze reali

AZIONI OPERATIVE RICHIESTE
1. Apri il repository e fai audit con path reali.
2. Elenca chiaramente:
 - file rilevanti auth
 - file rilevanti autosave/sync
 - file rilevanti referee save
 - file rilevanti env/deploy
 - file SQL/RLS
3. Esegui build e tutte le verifiche locali ragionevoli.
4. Se trovi problemi minori o incoerenze reali, applica patch minime direttamente nel codice.
5. Non fare refactor estetici o pulizie gratuite.
6. Mantieni il diff il più piccolo possibile.
7. Esegui una ricerca testuale globale per assicurarti che non restino:
 - placeholder admin login locale
 - token admin manuale come flusso pubblico
 - service_role
 - tester mode pubblico
 - local_only pubblico come default

CHECKLIST DA USARE
- [ ] build ok
- [ ] admin usa auth Supabase reale
- [ ] admin non usa placeholder locale
- [ ] admin autosave attivo
- [ ] sync state UI presente e coerente
- [ ] retry / pending changes gestiti
- [ ] referti arbitri persistono su Supabase
- [ ] password arbitri non persista in modo insicuro
- [ ] nessuna service_role nel frontend
- [ ] env Vite coerenti
- [ ] deploy Cloudflare Pages coerente
- [ ] OCR non toccato
- [ ] TV mode non toccata

OUTPUT FINALE OBBLIGATORIO
1. Elenco file modificati
2. Elenco file controllati ma non modificati
3. Riepilogo architettura finale risultante
4. Problemi trovati e come li hai risolti
5. Eventuali problemi residui reali
6. Istruzioni Supabase da rieseguire o verificare manualmente
7. Istruzioni Cloudflare Pages da rieseguire o verificare manualmente
8. Spiegazione concreta di come funziona ora l’autosave admin
9. Spiegazione concreta di come hai verificato che la password/admin secret non sia esposta nel frontend
10. Prompt breve finale da usare per un eventuale ultimo passaggio QA umano
11. Stop
```

---

# PERF-A — Audit + strumentazione dev-only + misurazione + un solo step ottimizzazione

Usa questo prompt se il repository aperto **non** ha ancora una strumentazione dev-only realmente disponibile come `services/devRequestPerf.ts` + hooking reale nel layer fetch. Questo deriva dal primo prompt storico performance. fileciteturn1file0

```text
Sei Lead Frontend + Performance Engineer per FLBP Manager Suite.

Lavora SOLO sul repository aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO i file reali del progetto.
Non inventare file, endpoint, hook o flow.
Per ogni affermazione cita path reali e cosa hai verificato.
Se trovi mismatch rispetto al prompt, scrivi: “chat non affidabile, seguo il repository”.

OBIETTIVO
Completa SOLO questi 3 blocchi, in ordine, con stop chiari:
1. AUDIT + STRUMENTAZIONE DEV-ONLY
2. MISURAZIONE REALE + REPORT
3. UN SOLO STEP DI OTTIMIZZAZIONE A RISCHIO BASSO

VINCOLI HARD
- Nessuna nuova dipendenza npm
- Nessun cambio stack
- Nessuna modifica UX
- Non toccare Referti/OCR
- Non toccare BYE / TBD
- TV mode resta read-only
- Nessun invio dati esterni
- Nessuna ottimizzazione architetturale grande
- Diff minimo
- Niente service_role nel frontend
- Niente flussi local_only come standard pubblico

FASE 1 — AUDIT + STRUMENTAZIONE DEV-ONLY
Prima verifica se la strumentazione dev-only esiste davvero.
Se non esiste, implementa SOLO la minima strumentazione necessaria.

Misure richieste:
- numero richieste per endpoint
- frequenza
- origine/vista
- durata
- dimensione payload stimata
- tipo: polling / user / tv / admin / referee
- duplicazioni ravvicinate

Requisiti strumentazione:
- solo dev-only
- nessuna dipendenza
- nessuna modifica UX
- report in console ogni 60s
- contatori per endpoint
- tempi min/avg/max
- payload request/response stimato
- rilevazione duplicazioni ravvicinate entro 2s

Preferenze di punto di strumentazione:
- centralizza il più possibile in `services/supabaseRest.ts`
- copri anche i fetch paralleli di `pullPublicTournamentBundle()`
- se serve, aggiungi contesto vista corrente in `App.tsx`
- se serve, etichetta anche `RemoteRepository.ts`, `AdminDashboard.tsx`, `RefereesArea.tsx`

Output Fase 1:
- audit reale dei fetch/read/write
- file toccati
- diff
- come leggere i log
- conferma che la strumentazione è davvero attiva

FASE 2 — MISURAZIONE REALE + REPORT
Usa la strumentazione dev-only già presente dopo Fase 1.
Scenari da misurare:
S1 Home 5 min
S2 Leaderboard 5 min
S3 Hall of fame 5 min
S4 Lista tornei 5 min
S5 Dettaglio torneo live 5 min
S6 TV bracket 5 min
S7 TV marcatori 5 min
S8 Admin 5 min
S9 Login arbitro + save referto/risultato
S10 Apertura app con contatore visite attivo

Se uno scenario non è facilmente automatizzabile:
- non inventare automazioni
- dai istruzioni manuali minime e realistiche
- poi usa i log risultanti

Per ogni scenario voglio:
- nome scenario
- durata effettiva
- richieste totali
- richieste/minuto
- endpoint coinvolti
- payload medio per endpoint
- traffico totale per endpoint
- traffico totale scenario
- tempi medi / max / min
- polling presenti
- duplicazioni rilevate
- peso relativo: basso / medio / alto / molto alto

Report finale:
- top endpoint più costosi
- top viste più costose
- colli di bottiglia principali
- cosa pesa poco
- rischio Supabase Free: normale / live / estremo
- stima estrema:
 - 100 utenti live per 5 ore
 - 2 TV
 - admin + arbitri normali
 - stima richieste + traffico
 - esplicita quando la stima è approssimata

FASE 3 — UN SOLO STEP DI OTTIMIZZAZIONE
Dopo avere metriche reali, implementa SOLO il primo step:
- massimo impatto
- rischio minimo
- UX invariata

Regola fondamentale:
✔ refresh on enter
✔ polling solo dove serve
✘ niente polling globale continuo non necessario

Candidato preferito, salvo metriche che smentiscano:
- ridurre/eliminare polling non-live in `App.tsx`
- mantenere polling solo per live / dettaglio live / TV
- refresh on enter per sezioni non live
- classifiche max ogni 60s, non più aggressive

Prima dell’implementazione scrivi:
- cosa ottimizzi
- perché
- quale metrica lo dimostra
- file toccati
- impatto traffico stimato
- impatto UX

Poi implementa:
- patch minima
- no refactor grande
- no cambio UI
- evitare duplicazioni
- usare mount/enter/visibility lifecycle

Output finale Fase 3:
- cosa hai fatto
- file toccati
- diff
- riduzione traffico stimata
- rischio
- come testare
- prossimo step consigliato
- fermati
```

---

# PERF-B — Misurazione reale + report + un solo step ottimizzazione, escludendo il contatore visite

Usa questo prompt se il repository aperto ha già `services/devRequestPerf.ts`, l’hooking in `services/supabaseRest.ts` e vuoi **escludere del tutto** `trackPublicSiteView()` dal lavoro residuo. Questo deriva dal secondo prompt storico performance. fileciteturn1file0

```text
Sei Lead Frontend + Performance Engineer per FLBP Manager Suite.

Lavora SOLO sul repository aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO i file reali del progetto.
Non inventare file, endpoint, hook o flow.
Per ogni affermazione cita path reali e cosa hai verificato.
Se trovi mismatch, scrivi: “chat non affidabile, seguo il repository”.

STATO DA VERIFICARE
- `services/devRequestPerf.ts`
- `services/supabaseRest.ts`
- `App.tsx`
- verificare che esistano davvero collector dev-only, report 60s, `snapshot/reset/reportNow`, hooking fetch e contesto `kind: 'polling'`

IMPORTANTE
- escludi completamente il contatore visualizzazioni dal lavoro residuo
- non misurare `trackPublicSiteView()`
- non includere `public_site_views_daily`
- non proporre ottimizzazioni su quel pezzo

OBIETTIVO
Completa SOLO queste 2 fasi, in ordine:
1. MISURAZIONE REALE + REPORT
2. UN SOLO STEP DI OTTIMIZZAZIONE A RISCHIO BASSO

VINCOLI HARD
- Nessuna nuova dipendenza npm
- Nessun cambio stack
- Nessuna modifica UX
- Non toccare Referti/OCR
- Non toccare BYE / TBD
- TV mode resta read-only
- Nessun invio dati esterni
- Diff minimo
- Niente service_role nel frontend
- Niente local_only come flusso standard pubblico
- Escludi il contatore visualizzazioni da misure, report e ottimizzazioni

FASE 1 — MISURAZIONE REALE + REPORT
Prerequisito:
- assicurati che nel repo aperto in Codex ci siano env Supabase reali o runtime configurato davvero
- se mancano, dichiaralo chiaramente e fermati senza inventare numeri

Scenari da misurare:
S1 Home 5 min
S2 Leaderboard 5 min
S3 Hall of fame 5 min
S4 Lista tornei 5 min
S5 Dettaglio torneo live 5 min
S6 TV bracket 5 min
S7 TV marcatori 5 min
S8 Admin 5 min
S9 Login arbitro + save referto/risultato

Per ogni scenario:
1. apri la vista
2. esegui `window.__flbpRequestPerf.reset()`
3. lascia la vista stabile per la durata richiesta
4. esegui `window.__flbpRequestPerf.reportNow()`
5. salva anche `window.__flbpRequestPerf.snapshot()`
6. sintetizza i numeri

Per ogni scenario voglio:
- nome scenario
- durata effettiva
- richieste totali
- richieste/minuto
- endpoint coinvolti
- payload medio per endpoint
- traffico totale per endpoint
- traffico totale scenario
- tempi medi / max / min
- polling presenti
- duplicazioni rilevate
- peso relativo: basso / medio / alto / molto alto

Report finale:
- top endpoint più costosi
- top viste più costose
- primo collo di bottiglia
- secondo collo di bottiglia
- terzo collo di bottiglia
- cosa pesa poco
- rischio Supabase Free:
 - uso normale
 - giornata live media
 - caso estremo
- stima estrema:
 - 100 utenti live per 5 ore
 - 2 TV
 - admin + arbitri normali
 - stima richieste + traffico
 - dichiara chiaramente ogni approssimazione

FASE 2 — UN SOLO STEP DI OTTIMIZZAZIONE
Solo dopo avere metriche reali, implementa UN solo step:
- massimo impatto
- rischio minimo
- UX invariata

Regola:
✔ refresh on enter
✔ polling solo dove serve
✘ niente polling globale continuo non necessario

Candidato preferito, salvo dati contrari:
- ridurre o eliminare polling non-live in `App.tsx`
- lasciare polling solo per live / dettaglio live / TV
- refresh on enter per le viste non live
- classifiche al massimo ogni 60s, non più aggressive

Prima della patch scrivi:
- cosa ottimizzi
- perché
- quale metrica lo dimostra
- file toccati
- impatto traffico stimato
- impatto UX

Poi implementa:
- patch minima
- nessun refactor grande
- nessuna modifica UI
- evitare duplicazioni
- usare lifecycle mount/enter/visibility

Output finale:
- cosa hai fatto
- file toccati
- diff
- riduzione traffico stimata
- rischio
- come testare
- prossimo step consigliato
- fermati
```

---

# PERF-C — Closeout pragmatico: verifica stato reale, misure S1–S10, report, al massimo un micro-fix

Usa questo prompt se il repository aperto ha già avuto almeno un giro di lavoro performance e vuoi il **closeout finale**. Questo deriva dal terzo prompt storico performance. fileciteturn1file0

```text
Sei Lead Frontend + Performance Engineer per FLBP Manager Suite.

Lavora SOLO sul repository aperto in Codex.
Leggi e rispetta AGENTS.md.
Fonte di verità: SOLO i file reali del repo.
Non inventare file, endpoint, hook, flow o risultati.
Per ogni affermazione importante cita path reali e cosa hai verificato.
Se trovi mismatch tra prompt e repo reale, scrivi: “chat non affidabile, seguo il repo”.

OBIETTIVO
Chiudere il lavoro performance in modo pragmatico, senza perfezionismo.
Fai SOLO queste cose, in ordine:
1. verifica lo stato reale del repo
2. esegui le misurazioni reali S1–S10 con la strumentazione già presente
3. compila il report finale
4. applica AL MASSIMO un solo micro-fix finale, ma solo se i numeri mostrano un collo di bottiglia chiaro
5. fermati

Se il report mostra che il lavoro è già sufficiente, NON fare altri fix.

STATO ATTESO DA VERIFICARE NEL REPO
- `services/devRequestPerf.ts`
- `App.tsx`
- `components/AdminDashboard.tsx`
- `services/repository/RemoteRepository.ts`
- `docs/REFRESH_SUPABASE_MAP.md`
- `docs/PERF_REPORT_TEMPLATE.md`

Verifica davvero, senza assumere, che esistano e siano coerenti:
- strumentazione dev-only attiva
- `snapshot/reset/reportNow`
- polling pubblico non-live già ridotto
- pause polling pubblici quando `document.visibilityState !== 'visible'`
- refresh immediato al ritorno visibile
- dettaglio torneo live con polling
- dettaglio torneo non-live con refresh on enter
- refresh auth admin ridotto in background
- eventuale contatore visite ancora su Supabase, senza Cloudflare Analytics

VINCOLI HARD
- Nessuna nuova dipendenza npm
- Nessun cambio stack
- Nessuna modifica UX
- Non toccare Referti/OCR
- Non toccare BYE / TBD
- TV mode resta read-only
- Niente service_role nel frontend
- Niente ritorno a flussi local_only come standard pubblico
- Diff minimo
- Niente refactor grande
- Niente ottimizzazioni speculative

Sul contatore visite:
- NON spostarlo su Cloudflare Analytics
- può restare su Supabase
- se lo tocchi, fallo solo per ridurre consumi con patch minima
- non cambiare il significato del contatore più del necessario

FASE 1 — VERIFICA RAPIDA DELLO STATO ATTUALE
Prima di tutto:
- controlla i file reali sopra
- conferma quali patch performance sono davvero presenti
- conferma se il repo è pronto per misure reali
- verifica che ci siano env/runtime reali per Supabase

Se env/runtime reale non è disponibile:
- dichiaralo chiaramente
- fermati senza inventare numeri

FASE 2 — MISURAZIONE REALE
Scenari da misurare:
S1. Home pubblica aperta 5 min
S2. Leaderboard aperta 5 min
S3. Hall of fame aperta 5 min
S4. Lista tornei aperta 5 min
S5. Dettaglio torneo live aperto 5 min
S6. TV bracket aperta 5 min
S7. TV classifica marcatori aperta 5 min
S8. Admin aperto 5 min
S9. Login arbitro + save/aggiornamento risultato
S10. Apertura pubblica app con contatore visite attivo

Per ogni scenario:
1. apri la vista
2. esegui `window.__flbpRequestPerf.reset()`
3. lascia la vista stabile per la durata prevista
4. esegui `window.__flbpRequestPerf.reportNow()`
5. salva anche `window.__flbpRequestPerf.snapshot()`
6. sintetizza i risultati

FORMATO REPORT OBBLIGATORIO
Compila/aggiorna `docs/PERF_REPORT_TEMPLATE.md` con dati reali.
Per ogni scenario voglio:
- nome scenario
- durata effettiva
- richieste totali
- richieste/minuto
- endpoint coinvolti
- payload medio per endpoint
- traffico totale per endpoint
- traffico totale scenario
- tempi medi / max / min
- polling presenti
- duplicazioni rilevate
- peso relativo: basso / medio / alto / molto alto

Alla fine voglio:
- top endpoint più costosi
- top viste più costose
- primo collo di bottiglia
- secondo collo di bottiglia
- terzo collo di bottiglia
- cosa pesa poco
- rischio Supabase Free:
 - uso normale
 - giornata torneo live media
 - caso intenso con 100 utenti live per 5 ore
- stima estrema:
 - 100 utenti live per 5 ore
 - 2 TV attive
 - uso normale admin e arbitri
 - stima richieste
 - stima traffico
 - nota chiara sulle approssimazioni

FASE 3 — EVENTUALE ULTIMO MICRO-FIX
Dopo il report:
- fai AL MASSIMO un solo micro-fix
- solo se il collo di bottiglia è chiaro nei numeri reali
- solo se il rischio è basso
- solo se UX resta invariata

Ordine di priorità:
1. ridurre un refresh/polling residuo non-live
2. migliorare un trigger admin in background
3. ridurre un consumo del contatore visite senza cambiare architettura

NON fare:
- cache grande
- refactor architetturale
- spostamenti di servizio
- nuova analytics platform
- modifiche UI

Se non c’è un micro-fix chiaramente giustificato, NON farlo.

OUTPUT FINALE
1. Audit sintetico dello stato reale verificato
2. Scenari realmente eseguiti
3. Report comparativo finale
4. Top endpoint più costosi
5. Top viste più costose
6. Primo collo di bottiglia
7. Secondo collo di bottiglia
8. Terzo collo di bottiglia
9. Cosa pesa poco
10. Eventuale micro-fix finale applicato
11. File toccati
12. Diff sintetico
13. Rischio regressione
14. Come validare
15. Stop
```

---

# DATA-BIRTHDATE-FIRST — Prompt mirato per layer remoto/Supabase

Questo prompt non faceva parte del ramo deploy/perf ma compariva nei prompt iniziali come modifica dati mirata. Lo preservo qui quasi letteralmente, perché è un task separato e utile. fileciteturn1file0

```text
Contesto:
Lavora SOLO sul repository reale FLBP MANAGER e SOLO sui file/path realmente presenti.
Leggi e rispetta AGENTS.md.
Se trovi mismatch tra chat e repo, scrivi: "chat non affidabile, seguo il repo".

Obiettivo:
Allineare il layer remoto/Supabase alla nuova regola birthDate-first:
- niente fallback operativo al vecchio YoB
- la data di nascita è il riferimento principale per identità giocatore e U25
- YoB legacy non deve più guidare merge, alias, leaderboard o premi
- compatibilità dati: se birthDate manca, usa ND; non ricadere su YoB legacy

Path reali da ispezionare prima di modificare:
- services/supabaseRest.ts
- supabase/migrations/
- supabase/setup_all.sql
- types.ts
- services/playerIdentity.ts
- services/storageService.ts
- services/playerDataProvenance.ts

Istruzioni operative:
1. Ispeziona lo schema reale nei migration SQL e in `setup_all.sql`.
2. Non inventare nomi tabelle/colonne: usa solo quelle realmente presenti.
3. Dove il DB persiste team/players/hall of fame/integrations, aggiungi o usa i campi birthDate coerenti con il frontend già presente:
 - player1BirthDate
 - player2BirthDate
 - playerBirthDate
 - birthDate
4. Aggiorna `services/supabaseRest.ts` per:
 - leggere/scrivere birthDate
 - smettere di usare YoB come fallback operativo
 - mantenere ND quando birthDate manca
5. Aggiorna eventuali query/serializer/public snapshot affinché:
 - U25 derivi solo dalla data di nascita
 - player key/alias resolution non dipendano più dal vecchio YoB
6. Se esistono colonne legacy YoB:
 - non rimuoverle in modo distruttivo senza migrazione esplicita
 - lasciale solo come legacy non autoritativa oppure prepara migrazione sicura
7. Prepara una migration SQL reale e reversibile.
8. Esegui build/test minimi disponibili.
9. Consegna:
 - elenco file toccati
 - migration SQL
 - spiegazione breve delle scelte
 - conferma se ci sono punti ancora dipendenti da dati legacy remoti

Vincoli duri:
- non toccare Referti/OCR
- non toccare TV mode
- nessuna dipendenza nuova
- nessun refactor laterale
- patch minima, niente perfezionismo
```

---

# UI-HANDOFF-EDITOR-TV — Prompt mirato per follow-up editor/Admin/TV

Questo prompt preserva il contesto operativo emerso nel prompt storico di handoff UI/Admin/TV. Va usato solo se il repo aperto conferma davvero quei comportamenti/path. fileciteturn1file0

```text
Stai lavorando su FLBP Manager Suite (React + Vite + TypeScript).
Leggi e rispetta AGENTS.md.

Regole dure:
- Fonte di verità: SOLO il contenuto del repo/ZIP corrente.
- Non inventare file, flow, API o comportamenti.
- Niente nuove dipendenze.
- Non toccare Referti/OCR salvo fix anti-crash espliciti.
- BYE: invisibili in UI, auto-advance, mai referto.
- TBD: placeholder, non avanza, non diventa team reale.
- TV Mode: read-only, zero click, 16:9 safe, zero glitch.
- Nuovi campi/config solo optional e con fallback safe.

Prima di procedere verifica DAVVERO nel repo aperto questi punti e, se non coincidono, scrivi: “chat non affidabile, seguo il repo”.

Contesto da preservare se confermato nel repo:
1) Accesso Admin
- accesso Admin interno all’app con codice locale `Giobotta@flbp`
- file chiave:
  - `components/AdminDashboard.tsx`
  - `services/adminLocalAuth.ts`
- Supabase configurabile dentro Admin, non prima:
  - `components/admin/tabs/data/DbSyncPanel.tsx`

2) UI text-fit / troncamenti
- rimossi molti `truncate` nei flussi Public/Admin/TV dove il testo è semantico
- `TournamentBracket` mantiene `wrapTeamNames` come meccanismo esplicito
- non cambiare il default alla cieca
- il fallback con `truncate` quando `wrapTeamNames=false` è intenzionale
- file chiave:
  - `components/TournamentBracket.tsx`
  - `components/TvClassicBracket.tsx`
  - `components/PublicTournamentDetail.tsx`
  - `components/admin/tabs/MonitorBracketTab.tsx`
  - `components/admin/tabs/TournamentEditorTab.tsx`

3) Public “Next”
- nei dialog public il tab “Next” mostra SOLO il prossimo blocco reale, non tutti i futuri
- file chiave:
  - `components/PublicTournaments.tsx`
  - `components/PublicTournamentDetail.tsx`

4) Hall of Fame / Albo d’Oro
- ordinamento per data torneo discendente, non solo anno
- fallback all’anno se manca la data
- file chiave:
  - `components/HallOfFame.tsx`

5) Editor torneo: nuove squadre e turno preliminare
- si possono creare nuove squadre direttamente nel pool editor
- se il Round 1 del bracket è pieno e il bracket reale non è partito, si può aggiungere un turno preliminare vuoto davanti al Round 1
- implementazione da verificare:
  - `components/admin/tabs/TournamentEditorTab.tsx`
  - `services/tournamentStructureOperations.ts`
  - `services/tournamentStructureTypes.ts`
  - `tests/editor/tournamentStructure.test.ts`
- comportamento da preservare:
  - la nuova squadra entra nel `catalogTeams` della bozza
  - dopo la creazione viene selezionata nel pool
  - `ADD_PRELIMINARY_BRACKET_ROUND` espande il bracket in testa
  - le squadre già presenti vengono protette in match `squadra vs BYE`
  - NON espandere se il bracket reale è già partito
  - NON rompere BYE/TBD

6) TV hardening
- le TV si aprono da Admin con `onEnterTv('groups' | 'groups_bracket' | 'bracket' | 'scorers')`
- path da verificare:
  - `components/AdminDashboard.tsx`
  - `App.tsx`
  - `components/TvView.tsx`
- se già presente, preserva:
  - `UiErrorBoundary` attorno alla branch TV
  - placeholder/no-signal se manca un contesto torneo renderizzabile
  - niente schermata bianca muta
- vincoli TV:
  - read-only
  - zero click
  - 16:9 safe
  - se mancano dati, mostra placeholder di configurazione, non UI rotta

7) Aggiornamento dati e TV
- le TV leggono `stateForPublicViews` dalla branch app public/TV
- se cambi gironi/tabellone/stato torneo, le TV devono riflettere gli aggiornamenti
- verifica i path reali in `App.tsx` e `components/TvView.tsx`

Quando fai modifiche:
- indica sempre path reali
- diff minimo
- niente refactor non necessario
- controlla build/test
- se tocchi TV dichiaralo esplicitamente e mantienila read-only
- se tocchi editor/bracket non rompere BYE/TBD né match già iniziati

Checklist minima da rieseguire:
- `npm run test:editor`
- `npm run test:data`
- `npm run check:ssr-admin`
- `npm run build`
- se tocchi TV: `npm run check:ssr-tv` e `npm run check:tv-readonly`
```

---

## Passaggi manuali esterni da ricordare in Cloudflare/Supabase

Questi step comparivano nei prompt iniziali e **non devono essere persi** quando Codex chiude il lavoro, anche se non può eseguirli senza accesso agli account reali. Vanno sempre verificati documentualmente se il task tocca deploy/auth. fileciteturn1file0

- creare utente Supabase Auth `admin@flbp.local`
- eseguire `supabase/setup_all.sql`
- inserire l’utente in `public.admin_users` o tabella admin equivalente realmente presente
- configurare Cloudflare Pages con:
  - build command: `npm run build`
  - output dir: `dist`
  - env:
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_ANON_KEY`
    - `VITE_SUPABASE_ADMIN_EMAIL`
    - `VITE_WORKSPACE_ID`
    - `VITE_REMOTE_REPO=1`
    - `VITE_PUBLIC_DB_READ=1`
    - `VITE_AUTO_STRUCTURED_SYNC=1`
    - verificare anche `VITE_ALLOW_LOCAL_ONLY` e `VITE_APP_MODE` se usati dal repo reale

---

## Regola finale per non perdere nulla ma evitare prompt sbagliati

Se stai per dare un prompt a Codex e dentro ci sono frasi come:
- “admin usa già solo Supabase Auth”
- “strumentazione performance già presente”
- “local_only già bloccato in build pubblica”
- “Tv hardening già applicato”

…trattale come **ipotesi da verificare**, non come verità assolute, a meno che `P0` o il task precedente non le abbia appena confermate sul repository aperto.
