# Player Area - External Setup

Questo file raccoglie i passaggi esterni ancora necessari per rendere davvero operativo il blocco `Area giocatore`.

Stato codice attuale:
- `email/password` gia' cablato nel frontend
- `Google / Facebook / Apple` gia' cablati nella UI e nel callback OAuth
- ritorno da OAuth gia' instradato automaticamente verso `Area giocatore`
- profilo giocatore reale richiede `nome + cognome + data di nascita`

Restano quindi solo configurazioni esterne.

## Dati di progetto da usare

- frontend canonico: `https://flbp-pages.pages.dev`
- project ref Supabase: `kgwhcemqkgqvtsctnwql`
- package Android: `com.flbp.manager.suite`
- bundle iOS: `com.flbp.manager.suite`

## Ordine consigliato

1. Auth email/password
2. SMTP / mittente email reale
3. Google
4. Facebook
5. Apple
6. Test registrazione / login / reset
7. Test `chiamata squadra`

## 1. Supabase Auth - Email/password

Vai in:
- `Supabase Dashboard -> Authentication -> Sign In / Providers`

Controlla:
- provider `Email` abilitato
- `Enable email signups` abilitato

Decisione importante:
- percorso veloce test: `Confirm email` disabilitato
- percorso completo produzione: `Confirm email` abilitato

Nota:
- il nostro frontend supporta entrambi i casi
- se `Confirm email` e' attivo, dopo il signup l'utente vede il messaggio di controllo mail

## 2. Supabase Auth - SMTP / mittente reale

Vai in:
- `Supabase Dashboard -> Authentication -> Settings -> SMTP`

Inserisci:
- `From email`: la mail amministratore vera, per esempio `no-reply@...`
- `Sender name`: `FLBP`
- `Host`
- `Port`
- `Username`
- `Password`

Motivo:
- senza SMTP custom, Supabase Auth usa il servizio base con forti limiti
- per utenti pubblici reali non basta

## 3. Redirect URLs di Auth

Vai in:
- `Supabase Dashboard -> Authentication -> URL Configuration`

Imposta:
- `Site URL` = `https://flbp-pages.pages.dev`

Aggiungi in `Redirect URLs` almeno:
- `https://flbp-pages.pages.dev`

Se in futuro avrai un dominio personalizzato, aggiungi anche quello.

## 4. Google

### 4.1 Google Cloud

Vai in:
- `Google Cloud Console -> Google Auth Platform`

Crea:
- un OAuth Client di tipo `Web application`

Configura:
- `Authorized JavaScript origins`
  - `https://flbp-pages.pages.dev`
- `Authorized redirect URIs`
  - copia quello mostrato nella pagina provider `Google` di Supabase
  - formato atteso: `https://<project-ref>.supabase.co/auth/v1/callback`

### 4.2 Supabase

Vai in:
- `Supabase Dashboard -> Authentication -> Sign In / Providers -> Google`

Inserisci:
- `Client ID`
- `Client Secret`

## 5. Facebook

### 5.1 Meta for Developers

Vai in:
- `developers.facebook.com`

Crea:
- una app Facebook
- abilita `Facebook Login`

Configura:
- `Valid OAuth Redirect URIs`
  - il callback di Supabase mostrato nella pagina provider `Facebook`

Permessi necessari:
- `public_profile`
- `email`

### 5.2 Supabase

Vai in:
- `Supabase Dashboard -> Authentication -> Sign In / Providers -> Facebook`

Inserisci:
- `App ID`
- `App Secret`

## 6. Apple

### 6.1 Apple Developer

Per il nostro caso attuale useremo il flusso OAuth web-based, perche' Android/iOS aprono il web mirror di `Pages`.

Questo significa:
- va creato il provider Apple in Supabase
- la chiave `.p8` va mantenuta e ruotata periodicamente

Ti serviranno:
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `AuthKey_XXXX.p8`

Per il login Apple via Supabase ti serviranno anche i valori richiesti dalla pagina provider `Apple` del dashboard.

### 6.2 Supabase

Vai in:
- `Supabase Dashboard -> Authentication -> Sign In / Providers -> Apple`

Inserisci i valori richiesti dalla schermata:
- client / service identifier
- key ID
- team ID
- private key `.p8`

Nota importante:
- il flusso OAuth Apple web richiede manutenzione periodica della chiave/segreto

## 7. Test funzionale minimo dopo la configurazione

### Test 1 - Registrazione reale

1. apri `https://flbp-pages.pages.dev`
2. entra in `Area giocatore`
3. registrati con:
   - email reale
   - password
   - nome
   - cognome
   - data di nascita
4. verifica che il profilo venga creato

### Test 2 - Login reale

1. esci
2. rientra con email/password
3. verifica che profilo e stato live si aprano senza preview fallback

### Test 3 - Reset password

1. usa `Password dimenticata?`
2. verifica l'arrivo della mail reale
3. verifica il ritorno al sito dopo il reset

### Test 4 - Social

1. Google
2. Facebook
3. Apple

Per ciascuno:
- clic
- redirect provider
- ritorno automatico su `Area giocatore`
- sessione attiva
- profilo collegabile

### Test 5 - Chiamata squadra

Questo resta il test successivo obbligatorio dopo il completamento dell'Area giocatore:
- creare almeno un account giocatore reale
- registrare il device
- chiamare la squadra da admin
- verificare ricezione e conferma

## Differenze intenzionali da ricordare

- web / Android / iOS usano `Pages` come frontend canonico
- Android e iOS ereditano questo blocco tramite web mirror primario
- il fallback nativo legacy non e' la fonte di verita' per il player flow
