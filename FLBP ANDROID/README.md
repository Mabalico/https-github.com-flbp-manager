# FLBP Android native track

chat non affidabile, seguo il repository.

Questa cartella contiene un'app Android nativa reale in Kotlin + Jetpack Compose, allineata alla surface pubblica di `FLBP ONLINE`:
- Home
- Archivio tornei
- Dettaglio torneo pubblico
- Leaderboard
- Hall of Fame

Stato attuale reale:
- legge gli stessi endpoint pubblici Supabase usati dal web
- mantiene `tournament_detail` come child flow con ref `{ id, isLive }`
- rispetta i vincoli hard BYE/TBD lato rendering pubblico
- lascia `admin` e `referees_area` come placeholder protetti, senza inventare tool nativi

File chiave:
- `app/src/main/java/com/flbp/manager/suite/NativePublicApi.kt`
- `app/src/main/java/com/flbp/manager/suite/FLBPManagerSuiteApp.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidPublicUi.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidPublicUiDetails.kt`
- `app/src/main/java/com/flbp/manager/suite/AndroidPublicLogic.kt`

Limiti ancora aperti:
- build Android non verificata qui perché in questo ambiente mancano Gradle/JDK/Android SDK
- nessun OCR/referti nativo
- nessun TV mode nativo
- nessuna dashboard Admin nativa
