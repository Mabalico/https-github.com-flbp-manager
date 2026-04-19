# iOS — Next Step

chat non affidabile, seguo il repository.

## Prossimo step consigliato
1. usare il wrapper Capacitor di `FLBP ONLINE` come percorso mobile primario per nuove verifiche e nuove feature
2. mantenere questa app iOS dedicata come legacy/fallback finche' il wrapper non ha release verificata e distribuibile
3. toccare questo runtime solo per bugfix mirati, recupero configurazioni native/APNs o confronto del comportamento push
4. prima di archiviare o rimuovere file, creare tag/branch di rollback e verificare che bundle id, signing, capabilities e APNs siano stati migrati al wrapper
5. se serve ancora una build legacy, chiudere compile/run in Xcode e archive signed solo come fallback tecnico, non come roadmap primaria

## Rischio
- low per consultazione/rollback
- medium per mantenere due runtime mobili attivi in parallelo
- medium per release readiness/signing legacy
- high per introdurre nuove feature native dedicate invece di consolidarle nel wrapper

## Criterio
Continuare su questo progetto solo se il wrapper non copre ancora un caso reale oppure se serve un riferimento tecnico per push, bridge o rollback.
