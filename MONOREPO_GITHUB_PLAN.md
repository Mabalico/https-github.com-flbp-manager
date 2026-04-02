# FLBP Monorepo + GitHub Plan

chat non affidabile, seguo il repository.

## Stato reale attuale
- root workspace: `FLBP MANAGER/`
- web stabile/pronta online: `FLBP ONLINE/`
- web locale di lavoro: `FLBP LOCALE/`
- app Android nativa: `FLBP ANDROID/`
- app iOS nativa: `FLBP IOS/`
- repository Git inizializzato al root
- remote GitHub configurato: `origin -> https://github.com/Mabalico/https-github.com-flbp-manager.git`
- branch pubblicati: `main`, `dev`
- branch di lavoro corrente consigliato: `dev`

## Obiettivo consigliato
Passare dalla gestione manuale a un repository Git/GitHub unico che contenga:
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
Questa fase è gia chiusa.

Fatto:
1. Git inizializzato al root
2. primo commit locale creato
3. repository GitHub remoto collegato
4. push di `main` e `dev` completato

Vantaggi gia ottenuti:
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

## Workflow operativo da ora
- `main`: branch stabile, da tenere pronta per produzione e deploy
- `dev`: branch di lavoro quotidiano
- branch feature opzionali solo per lavorazioni grandi, con prefisso `codex/`

### Regole pratiche
1. si lavora sempre partendo da `dev`
2. `main` non si usa per sviluppo quotidiano
3. quando una modifica e verificata, si promuove da `dev` a `main`
4. Cloudflare, quando lo collegheremo via Git, dovra leggere `main`
5. finche esistono sia `FLBP ONLINE/` sia `FLBP LOCALE/`, la fonte di verita web resta `FLBP ONLINE/`

### Cosa facciamo nel repository attuale
- modifiche sperimentali o locali: in `FLBP LOCALE/`
- modifiche approvate da portare online: in `FLBP ONLINE/`
- Android e iOS restano nello stesso repo e seguono lo stesso flusso Git

### Obiettivo del prossimo consolidamento
Eliminare la duplicazione `FLBP ONLINE/` + `FLBP LOCALE/` e sostituirla con:
- una sola cartella web
- branch/worktree per separare sviluppo e produzione

### Per il web
- sviluppo locale su branch `dev`
- promozione in produzione da `main`
- produzione automatica da `main` tramite **Cloudflare Pages Git integration**
- progetto Pages attuale: `flbp-pages`
- configurazione Pages:
  - repository: `Mabalico/https-github.com-flbp-manager`
  - root directory: `FLBP ONLINE`
  - build: `npm run build`
  - output: `dist`

### Per Android/iOS
- stesso repo
- build native da IDE/toolchain dedicate
- in futuro CI separata per Android e iOS

## Cosa NON conviene fare
- mantenere a lungo `FLBP ONLINE/` e `FLBP LOCALE/` come copie manuali permanenti
- versionare `node_modules`, `dist`, `DerivedData`, build Android
- dividere ora in tre repo separati

## Prossimo passo operativo consigliato
1. lavorare sempre su `dev`
2. usare `FLBP ONLINE/` come base da promuovere
3. quando la struttura si stabilizza, fare un commit dedicato di consolidamento
4. solo dopo valutare il refactor in:
   - `apps/web/`
   - `apps/android/`
   - `apps/ios/`

## Nota importante
La riorganizzazione in `apps/web`, `apps/android`, `apps/ios` va fatta solo in un passaggio dedicato. Prima conviene mantenere stabile il repository appena pubblicato e usare il flusso `dev -> main`.
