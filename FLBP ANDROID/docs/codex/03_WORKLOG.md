# Android — Worklog

chat non affidabile, seguo il repository.

## 2026-03-27
- verificato `FLBP ONLINE/App.tsx` come sorgente delle route pubbliche e del child flow `tournament_detail`
- verificato `FLBP ONLINE/services/supabasePublic.ts` come contratto dati pubblico reale
- verificato `FLBP ONLINE/components/PublicTournaments.tsx`, `PublicTournamentDetail.tsx`, `Leaderboard.tsx`, `HallOfFame.tsx`
- introdotto `NativePublicApi.kt` per leggere direttamente `public_tournaments`, `public_tournament_*`, `public_career_leaderboard`, `public_hall_of_fame_entries`
- cablate Home, Tournament list/detail, Leaderboard e Hall of Fame in Compose
- introdotti fallback safe per tornei manuali senza match/stats pubblici
- aggiunto `INTERNET` in `AndroidManifest.xml`
- lasciati esplicitamente fuori scope admin/arbitri/OCR/TV
