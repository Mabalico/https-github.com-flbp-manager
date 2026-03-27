# FLBP Monorepo + GitHub Plan

chat non affidabile, seguo il repository.

## Stato reale attuale
- root workspace: `FLBP MANAGER/`
- web stabile/pronta online: `FLBP ONLINE/`
- web locale di lavoro: `FLBP LOCALE/`
- app Android nativa: `FLBP ANDROID/`
- app iOS nativa: `FLBP IOS/`
- nessun repository Git inizializzato al root

## Obiettivo consigliato
Passare da cartelle parallele non versionate a un repository Git/GitHub unico che contenga:
- una sola fonte di verità per il web
- Android e iOS nello stesso storico
- un flusso di lavoro con branch invece di copie manuali

## Struttura target consigliata
```text
FLBP/
  apps/
    web/
    android/
    ios/
  docs/
  .gitignore
  README.md
```

## Strategia pratica consigliata
### Fase 1. Mettere sotto Git la struttura attuale, senza spostare nulla
Questa è la fase più sicura e quella che conviene fare adesso.

Passi:
1. inizializzare Git al root
2. fare il primo commit con la struttura attuale
3. creare repository GitHub remoto e fare il primo push

Vantaggi:
- nessun rischio di rompere path o build
- storico immediato
- da subito possiamo lavorare con branch

### Fase 2. Consolidare la web app
Una volta che Git è operativo:
1. scegliere `FLBP ONLINE/` come unica web source of truth
2. smettere di mantenere due copie complete del web
3. sostituire `FLBP LOCALE/` con branch o `git worktree`

Vantaggi:
- niente copia/incolla file da `LOCALE` a `ONLINE`
- differenze tracciabili
- merge controllati

### Fase 3. Monorepo pulito
Solo dopo che il repo Git è stabile:
1. spostare
   - `FLBP ONLINE/` -> `apps/web/`
   - `FLBP ANDROID/` -> `apps/android/`
   - `FLBP IOS/` -> `apps/ios/`
2. aggiornare eventuali path documentali e CI

Questa fase va fatta in un commit dedicato.

## Workflow consigliato
- `main`: stabile / pronta per produzione
- `dev`: sviluppo attivo
- opzionale: branch feature per lavori più grossi

### Per il web
- sviluppo locale su branch `dev`
- produzione da `main`
- Cloudflare Pages collegato a `main`

### Per Android/iOS
- stesso repo
- build native da IDE/toolchain dedicate
- in futuro CI separata per Android e iOS

## Cosa NON conviene fare
- mantenere a lungo `FLBP ONLINE/` e `FLBP LOCALE/` come copie manuali permanenti
- versionare `node_modules`, `dist`, `DerivedData`, build Android
- dividere ora in tre repo separati

## Prossimo passo operativo consigliato
1. `git init -b main`
2. `git status`
3. primo commit locale
4. creazione repository GitHub
5. `git remote add origin ...`
6. `git push -u origin main`

## Nota importante
Conviene fare la riorganizzazione `apps/web`, `apps/android`, `apps/ios` solo dopo il primo push. Prima salviamo lo stato reale attuale in uno storico Git pulito.
