# Android — Shared Gaps With Web

chat non affidabile, seguo il repository.

## Cosa il web ha e Android ancora no
- niente di sostanziale sul percorso primario user-facing: ora Android apre il web mobile reale in WebView full-screen
- restano gap solo nel fallback nativo legacy:
  - AdminDashboard reale
  - RefereesArea reale con OCR/referti
  - scritture admin native
  - scritture arbitri native
  - OCR/referti nativi completi

## Cosa Android ha già riallineato
- shell primaria `web mirror` che usa esattamente FLBP ONLINE mobile come superficie dell'app
- Home pubblica
- Tournament list pubblica con filtri
- Tournament detail pubblica con tabs condizionali
- Player Area preview locale con account opzionale, profilo, risultati, live status e alert di chiamata simulati nel fallback legacy
- sezione Turni pubblica con raggruppamento tavoli, filtri e dettaglio match read-only
- TV mode read-only con projection pubbliche
- Leaderboard pubblica
- Hall of Fame pubblica
- cache locale read-only dei dataset pubblici
- accesso admin reale via Supabase Auth + `admin_users`
- overview Admin consultativa read-only con snapshot DB, monitor live, monitor traffico billing-cycle e riepilogo visualizzazioni
- sezione Admin `Account giocatori` live-first nel web mirror, preview-only nel fallback legacy
- accesso arbitri reale via password RPC del torneo live
- monitor arbitri consultativo con turni/tavoli e upcoming matches
- lookup referto da codice, selezione arbitro locale e report draft editabile con PT/SF device-side
- bypass password arbitri sul device se il profilo giocatore collegato e' arbitro del live
- stesso perimetro dati pubblici Supabase del web
- percorso backend additivo gia' preparato nel repo web per leggere lo snapshot live completo via password arbitri, senza cambiare il flusso web attuale
- percorso backend additivo per profili player, device tokens e call alerts ora applicato sul progetto reale
- Android registra ora anche il `device_token` vero e puo' ricevere FCM a codice, ma il dispatch reale resta in attesa di:
  - valori FCM reali nel progetto Android
  - deploy della funzione Edge `player-call-push`
  - secret backend FCM/APNs configurati sul progetto Supabase
- il web ha gia' chiuso il wiring `live-when-available` per quei percorsi; Android lo eredita sul percorso primario tramite web mirror e mantiene il `pull live state` arbitri sul fallback legacy
