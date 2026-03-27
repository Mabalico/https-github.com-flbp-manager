# Android — Project Status

chat non affidabile, seguo il repository.

## Stato attuale Android
- Base nativa reale presente: SI
- Home pubblica data-driven: SI
- Tournament list data-driven: SI
- Tournament detail data-driven: SI
- Leaderboard data-driven: SI
- Hall of Fame data-driven: SI
- `tournament_detail` child flow con fallback safe: SI
- `admin` / `referees_area` nativi completi: NO, placeholder espliciti
- OCR/referti nativi: NO
- TV mode nativo: NO
- Build locale verificata in questa macchina: NO

## Verificato davvero
- route e child flow da `FLBP ONLINE/App.tsx`
- contract shape e TV projections da `FLBP ONLINE/types.ts`
- letture pubbliche reali da `FLBP ONLINE/services/supabasePublic.ts`
- regole hard da `FLBP ONLINE/services/tournamentEngine.ts`
- schermate Android in `FLBPManagerSuiteApp.kt`, `AndroidPublicUi.kt`, `AndroidPublicUiDetails.kt`, `AndroidPublicLogic.kt`
- rete pubblica Android in `NativePublicApi.kt`

## Rischi aperti reali
- mancano Gradle/JDK/Android SDK, quindi non posso certificare build/apk da qui
- nessun signing/release bundle generato in questo ambiente
- admin, arbitri, OCR e TV restano aree ancora non migrate nativamente
