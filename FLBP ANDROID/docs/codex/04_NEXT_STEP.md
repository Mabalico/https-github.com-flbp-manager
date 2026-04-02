# Android — Next Step

chat non affidabile, seguo il repository.

## Prossimo step consigliato
1. chiudere lo smoke test reale su emulatore/device ora che build, admin/referees consultativi, traffico admin, identità arbitro, lookup codice, form referto locale e warning alias sono allineati
2. generare la prima release signed `.aab`
3. quando il Supabase live non e' in uso, applicare in sicurezza le migration additive player/call e `20260328000100_referee_pull_live_state_rpc.sql`
4. dopo quella finestra backend, cablare prima i profili player/call reali riusando il wiring/live contract gia' chiuso sul web e poi il primo save Referees senza OCR partendo dal report/save draft gia' allineato
5. solo dopo, valutare il primo tool Admin nativo a basso rischio oltre la consultazione: per esempio export strutturato o range esteso per traffico/visualizzazioni

## Rischio
- low per smoke test visuale
- medium per release readiness/signing
- medium per applicazione backend additiva e prime scritture reali Referees o tool Admin avanzati
- high per OCR/referti

## Criterio
Continuare solo con superfici che possono essere replicate senza inventare backend o bypassare le regole hard del web.
