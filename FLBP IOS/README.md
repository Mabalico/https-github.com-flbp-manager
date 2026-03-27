# FLBP iOS native track

chat non affidabile, seguo il repository.

Questa cartella contiene un'app iOS nativa reale in Swift + SwiftUI, allineata alla surface pubblica di `FLBP ONLINE`:
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
- `FLBPManagerSuite/NativePublicData.swift`
- `FLBPManagerSuite/NativePublicScreens.swift`
- `FLBPManagerSuite/ContentView.swift`
- `FLBPManagerSuite/PublicRouteState.swift`
- `FLBPManagerSuite.xcodeproj/project.pbxproj`

Limiti ancora aperti:
- build iOS non verificata qui perché in questo ambiente mancano Swift/Xcode
- nessun OCR/referti nativo
- nessun TV mode nativo
- nessuna dashboard Admin nativa
