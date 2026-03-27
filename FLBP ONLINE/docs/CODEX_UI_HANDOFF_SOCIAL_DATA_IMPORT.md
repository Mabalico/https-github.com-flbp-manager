# CODEX UI HANDOFF — Social / Integrazioni / Import squadre

Playbook operativo corto per riprendere in Codex i flussi Admin toccati negli step recenti, senza reinventare il repository.

## Fonte di verità verificata

File reali da leggere prima di toccare questi flussi:
- `AGENTS.md`
- `components/admin/SocialGraphicsPanel.tsx`
- `components/admin/tabs/data/IntegrationsHof.tsx`
- `components/AdminDashboard.tsx`
- `services/teamImportProfile.ts`
- `services/storageService.ts`
- `docs/COMPONENT_MAP.md`
- `docs/APP_FUNCTIONS.md`
- `docs/TEST_REPORT.md`

Se trovi mismatch con la chat o con note esterne: **chat non affidabile, segui il repository**.

## Stato reale già chiuso nel repository

### 1) Grafiche social (`components/admin/SocialGraphicsPanel.tsx`)
Già presenti e verificate nel codice reale:
- convocazioni basate su **match reali** ordinati per `orderIndex`
- generatore automatico da `primo orario + intervallo + squadre per turno`
- supporto a `squadre per turno` **dispari** con nota `Seconda Partita`
- preliminari rilevati da turni bracket incompleti con BYE e tenuti fuori dagli slot normali
- override manuale per singolo slot con `assignedMatchIds`
- blocco duplicati tra slot manuali
- hardening export: slot senza orario / con orario invalido / senza match bloccano il download
- pruning automatico delle assegnazioni stale quando i match cambiano

Vincoli da NON rompere:
- BYE/TBD invisibili in UI
- nessun uso di coppie artificiali da lista squadre per la grafica slot
- TV non c'entra con questo pannello
- niente dipendenze nuove

### 2) Integrazioni / Albo d'Oro (`components/admin/tabs/data/IntegrationsHof.tsx`)
Già presenti e verificate nel codice reale:
- inserimento manuale record singolo HOF
- inserimento manuale **torneo completo**
- editor torneo dentro Integrazioni, senza salto all'area squadre
- lock sui campi derivati da partite salvate
- data torneo manuale propagata ai record HOF quando disponibile
- stato `dirty` sul form di edit torneo
- action row semplificata: un solo pulsante di reset/ricarica snapshot

Vincoli da NON rompere:
- non sbloccare campi vincolati da match/storico senza regola esplicita
- non alterare match live, bracket o storico risultati quando tocchi solo i premi
- mantenere fallback safe quando il torneo esiste solo in HOF e non nello storico

### 3) Import squadre (`components/AdminDashboard.tsx` + `services/teamImportProfile.ts`)
Già presenti e verificati nel codice reale:
- il **primo XLSX valido** salva un profilo layout locale
- import successivi `xlsx/csv` devono restare coerenti con quel layout
- workbook `.xlsx` multi-sheet: viene scelto il foglio più coerente
- alert mismatch più leggibili con layout atteso/trovato, foglio letto e altri fogli controllati

Vincoli da NON rompere:
- nessun crash se il profilo import manca o localStorage è vuoto
- nessuna dipendenza nuova
- CSV e XLSX devono continuare a usare lo stesso parser finale di normalizzazione squadre

## Fix di coerenza dati già applicati

- `services/storageService.ts`: le squadre marcate arbitri restano **squadre reali** per classifiche/awards; l'esclusione deve riguardare solo BYE/hidden.
- `components/admin/SocialGraphicsPanel.tsx`: i conteggi social usano prima draft/live corrente e solo poi il catalogo globale.

## Comandi minimi da lanciare in Codex su questi flussi

Se tocchi Social / Integrazioni / import squadre:
- `npm run check:ssr-admin`
- `npm run build`
- `npm run test:data` se tocchi `services/storageService.ts`, serializzazione, restore, Hall of Fame o import/profili

Se aggiungi chiavi i18n:
- `npm run check:i18n`

## Micro-step consigliati in Codex

Ordine low-risk consigliato se dovrai rifinire ancora:
1. Social: cleanup messaggi/warning o micro-bug UI
2. Integrazioni: micro-rifiniture editor torneo / HOF
3. Import squadre: edge-case reali da file utente
4. Solo dopo: eventuali fix più profondi su storico/awards

## Checklist anti-regressione rapida

- [ ] Referti/OCR invariato
- [ ] BYE invisibili in UI
- [ ] TBD non avanza / non entra nei flussi team reali
- [ ] TV Mode non toccata oppure resta read-only 16:9 safe
- [ ] Nessuna dipendenza nuova
- [ ] Nessun crash per dati mancanti / backup legacy / localStorage vuoto
- [ ] `npm run check:ssr-admin` PASS
- [ ] `npm run build` PASS
- [ ] `npm run test:data` PASS se tocchi dati/import/HOF

## Ultimi micro-fix UI/UX
- `components/admin/SocialGraphicsPanel.tsx`: reset/rigenerazione puliscono anche stato UI locale (`expandedSlotId`, `actionMsg`), il box export espone il motivo bloccante della grafica selezionata e la lista compatta dei primi `leftover` match.
- `components/AdminDashboard.tsx`: gli alert multi-sheet usano `getAlternativeWorkbookSheets(...)` per non ripetere il foglio già letto negli “altri fogli controllati”.
