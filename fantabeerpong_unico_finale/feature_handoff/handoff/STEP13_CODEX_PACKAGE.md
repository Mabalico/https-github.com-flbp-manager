# STEP 13 — Package handoff per Codex

Questo package è pronto da dare a Codex come base di lavoro controllata.

Contiene:
- nuovi file della feature
- patch ai file esistenti
- note di integrazione
- file map
- TODO tecnici

Modalità consigliata per Codex:
1. applicare patch di entry (`App.tsx`, `PlayerArea.tsx`)
2. importare i file nuovi
3. verificare compilazione path/import
4. sostituire gradualmente i mock con dati reali
5. rifinire persistenza, scoring e lock squadra
