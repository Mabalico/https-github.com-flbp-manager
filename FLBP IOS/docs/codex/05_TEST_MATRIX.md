# iOS — Test Matrix

chat non affidabile, seguo il repository.

## Verifiche fatte qui
- file e route native coerenti con `FLBP ONLINE/App.tsx`
- client pubblico coerente con `FLBP ONLINE/services/supabasePublic.ts`
- shape tornei coerente con `FLBP ONLINE/types.ts`
- nessun uso di BYE/TBD come team reale nelle helper pubbliche native
- login admin nativo coerente con Supabase Auth + `admin_users`
- login arbitri nativo coerente con RPC `flbp_referee_auth_check`
- file inclusi nel progetto Xcode
- cache locale letta/scritta da `NativePublicCache.swift` per dataset pubblici e bundle torneo
- dettaglio torneo con sezione `Turns` verificato a livello statico nei file
- route `Admin` allineata a livello codice anche con monitor traffico billing-cycle e riepilogo visualizzazioni ultimi 30 giorni

## Smoke test manuali da fare in Xcode / simulatore / device
- apertura app in portrait senza crash
- Home mostra live fallback o live hero coerente col dataset pubblico reale
- Tournament list filtra tornei per testo/anno/formato
- Tournament detail mostra Overview / Turns / Groups / Bracket / Scorers solo se i dati esistono
- `Turns` filtra `All`, `Live`, `Next`, `Played`, `TBD`
- tap su un match nella sezione `Turns` apre il dettaglio read-only
- Tournament detail permette di entrare nel TV mode read-only dal torneo selezionato
- TV mode mostra solo projection abilitate dai dati disponibili
- TV mode consente `groups`, `groups_bracket`, `bracket`, `scorers` senza azioni distruttive
- Leaderboard e Hall of Fame caricano dati reali
- restart dell'app con rete assente mantiene l'ultimo snapshot pubblico disponibile
- un torneo manuale senza match non fa crash e mostra fallback
- `tournament_detail` senza selezione ricade a `tournament`
- route `Admin` permette login reale, verifica ruolo e logout
- route `Admin` mostra snapshot DB, traffico billing-cycle e visualizzazioni pubbliche senza crash
- route `Referees area` permette verifica password live e mostra bundle live senza scritture distruttive

## Limite di questa macchina
- impossibile eseguire build o installazione iOS qui: mancano Swift/Xcode
