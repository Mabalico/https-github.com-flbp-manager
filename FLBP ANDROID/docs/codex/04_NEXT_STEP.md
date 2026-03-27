# Android — Next Step

chat non affidabile, seguo il repository.

## Prossimo step consigliato
Scegliere tra:
1. migrare il TV mode nativo read-only usando gli stessi dataset pubblici
2. migrare una prima parte reale di `admin` in sola consultazione
3. introdurre caching/persistenza locale read-only per la surface pubblica

## Rischio
- medium per TV read-only
- high per Admin/Auth/OCR

## Criterio
Continuare solo con superfici che possono essere replicate senza inventare backend o aggirare le regole hard del web.
