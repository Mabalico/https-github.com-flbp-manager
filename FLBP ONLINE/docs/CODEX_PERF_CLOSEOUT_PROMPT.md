# Prompt finale per Codex — chiusura misurazioni performance Supabase

Usa questo prompt in Codex sul repository già aperto e aggiornato.

---

Sei Lead Frontend + Performance Engineer per FLBP Manager Suite.

Lavora SOLO sul repository aperto in Codex.
Fonte di verità: SOLO i file reali del progetto.
Non inventare file, endpoint, hook o flow.
Per ogni affermazione cita path reali e cosa hai verificato.
Se trovi mismatch, scrivi: **"chat non affidabile, seguo lo ZIP"**.

## Obiettivo

Chiudere il lavoro performance con il minimo indispensabile:

1. eseguire le misurazioni reali con la strumentazione dev-only già presente;
2. compilare il report finale usando il template docs già nel progetto;
3. fare **al massimo un ultimo micro-fix** solo se i numeri mostrano un collo di bottiglia evidente;
4. fermarti.

## Vincoli hard

- Nessuna nuova dipendenza npm
- Nessun cambio stack
- Nessuna modifica UX
- Non toccare Referti/OCR
- Non toccare BYE / TBD
- TV mode resta read-only
- Nessun invio dati esterni
- Diff minimo
- Niente refactor grande
- Niente perfezionismo

## Stato già presente nel repo

Verifica e usa questi file reali:

- `services/devRequestPerf.ts`
  - espone `window.__flbpRequestPerf.reset()`
  - espone `window.__flbpRequestPerf.reportNow()`
  - espone `window.__flbpRequestPerf.snapshot()`

- `docs/REFRESH_SUPABASE_MAP.md`
  - mappa aggiornata dei refresh e del consumo Supabase

- `docs/PERF_REPORT_TEMPLATE.md`
  - template finale da compilare con i risultati reali

- `App.tsx`
  - polling public già ridotti
  - pause in hidden già presenti
  - refresh on-enter già presenti dove serve

- `components/AdminDashboard.tsx`
  - refresh auth admin già rallentato

- `services/repository/RemoteRepository.ts`
  - polling remoto admin già rallentato a 20s

## Fase 1 — Misurazioni reali

Prerequisito:
- usa env/runtime Supabase reale
- se l'ambiente reale non è disponibile, dichiaralo e fermati senza inventare numeri

Scenari da eseguire:
- S1 Home 5 min
- S2 Leaderboard 5 min
- S3 Hall of Fame 5 min
- S4 Lista tornei 5 min
- S5 Dettaglio torneo live 5 min
- S6 TV bracket 5 min
- S7 TV marcatori 5 min
- S8 Admin 5 min
- S9 Login arbitro + save
- S10 Apertura app con contatore visite attivo

Per ogni scenario:
1. apri la vista reale
2. esegui `window.__flbpRequestPerf.reset()`
3. lascia la vista stabile per il tempo richiesto
4. esegui `window.__flbpRequestPerf.reportNow()`
5. copia `window.__flbpRequestPerf.snapshot()`
6. compila la sezione corrispondente in `docs/PERF_REPORT_TEMPLATE.md`

## Report richiesto

Per ogni scenario compila:
- durata effettiva
- richieste totali
- richieste/minuto
- endpoint coinvolti
- payload medio per endpoint
- traffico totale per endpoint
- traffico totale scenario
- tempi medi / max / min
- polling presenti
- duplicazioni rilevate
- peso relativo: basso / medio / alto / molto alto

Nel riepilogo finale compila:
- top endpoint più costosi
- top viste più costose
- primo collo di bottiglia
- secondo collo di bottiglia
- terzo collo di bottiglia
- cosa pesa poco e non va toccato subito
- rischio Supabase Free:
  - uso normale
  - giornata live media
  - caso intenso con 100 utenti live per 5 ore
- stima estrema:
  - numero richieste
  - traffico totale stimato
  - assunzioni e limiti della stima

## Fase 2 — Ultimo micro-fix opzionale

Fai questa fase SOLO se i numeri raccolti mostrano un collo di bottiglia netto.

Regola:
- un solo micro-fix
- massimo impatto
- rischio minimo
- UX invariata
- niente altri step dopo

Prima della patch scrivi:
- cosa tocchi
- perché
- metrica che lo giustifica
- file toccati
- riduzione stimata
- rischio

Poi implementa la patch minima e fermati.

## Output finale

Restituisci:
1. audit sintetico degli scenari eseguiti
2. report scenario per scenario
3. top endpoint/fetch più costosi
4. top viste più costose
5. primo collo di bottiglia
6. secondo collo di bottiglia
7. terzo collo di bottiglia
8. cosa pesa poco
9. raccomandazione del primo step di ottimizzazione
10. raccomandazione del secondo step di ottimizzazione
11. eventuale ultimo micro-fix applicato
12. stop

## Checklist

- nessuna dipendenza nuova
- stack invariato
- Referti/OCR ok
- BYE ok
- TBD ok
- TV ok
- UX invariata
- niente ottimizzazioni extra fuori scope
