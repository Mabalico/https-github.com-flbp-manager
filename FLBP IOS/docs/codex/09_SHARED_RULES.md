# Shared Rules

chat non affidabile, seguo il repository.

## Regole hard verificate
- BYE deve restare implicito nei match, hidden in UI, auto-advance, mai referto, mai team reale (`scripts/check-invariants.mjs`, `services/tournamentEngine.ts`)
- TBD è placeholder e non deve avanzare né entrare come team reale (`services/tournamentEngine.ts`)
- TV mode è read-only, senza azioni distruttive o affordance interattive (`scripts/check-tv-readonly.mjs`)
- OCR/referti non vanno toccati salvo scope esplicito (`components/RefereesArea.tsx`, `services/imageProcessingService.ts`)
- compatibilità dati storici: nuovi campi solo optional con fallback safe (`services/storageService.ts`, `types.ts`)
- nessun crash se un dato manca (`App.tsx`, `services/storageService.ts`)

## Riconferma in questo step
- le shell Tournament list/detail e il contratto snapshot non introducono dati sintetici e non mostrano BYE/TBD come entità di UI
- il child flow `tournament_detail` resta protetto dal fallback safe su ref mancante
- la sezione `Turns` usa solo match pubblici, esclude BYE, separa TBD e resta read-only
- il TV mode nativo resta read-only e usa solo projection derivate dai dati pubblici già presenti
- OCR/referti restano fuori scope e quindi non vengono toccati
