# Android — Test Matrix

chat non affidabile, seguo il repository.

## Verifiche fatte qui
- file e route native coerenti con `FLBP ONLINE/App.tsx`
- client pubblico coerente con `FLBP ONLINE/services/supabasePublic.ts`
- shape tornei coerente con `FLBP ONLINE/types.ts`
- nessun uso di BYE/TBD come team reale nelle helper pubbliche native
- placeholder espliciti per `admin` e `referees_area`

## Smoke test manuali da fare in Android Studio / device
- apertura app in portrait senza crash
- Home mostra live fallback o live hero coerente col dataset pubblico reale
- Tournament list filtra tornei per testo/anno/formato
- Tournament detail mostra Overview / Groups / Bracket / Scorers solo se i dati esistono
- Leaderboard e Hall of Fame caricano dati reali
- un torneo manuale senza match non fa crash e mostra fallback
- `tournament_detail` senza selezione ricade a `tournament`

## Limite di questa macchina
- impossibile eseguire build o installazione APK qui: mancano Gradle/JDK/Android SDK
