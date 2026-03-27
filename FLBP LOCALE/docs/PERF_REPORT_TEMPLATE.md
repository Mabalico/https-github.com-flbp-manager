# Template report misurazione traffico Supabase

## Baseline reale misurata il 2026-03-26

Fonte raw: `.codex-tmp/perf-public-results.json`

Nota importante:
- Questi numeri sono il baseline reale raccolto prima del micro-fix su `services/repository/RemoteRepository.ts`, quando il polling admin `pullWorkspaceState -> workspace_state` compariva ancora anche nelle viste pubbliche.
- Il micro-fix applicato dopo la misura rimuove quel polling periodico dalle viste non-admin e lascia invariati polling pubblici reali e UX.
- `S8 Admin` e `S9 Login arbitro + save` non sono ancora compilati qui: richiedono esecuzione browser con credenziali/runtime operativo reale.

| Scenario | Durata | Req | Req/min | Tot bytes | Avg ms | Note |
|---|---:|---:|---:|---:|---:|---|
| `S1` Home pubblica | 5.00 min | 16 | 3.20 | 133358 | 123.6 | `App.publicWorkspacePoll -> public_workspace_state`; `pullWorkspaceState -> workspace_state` |
| `S2` Leaderboard | 5.00 min | 20 | 4.00 | 250538 | 223.3 | `App.publicWorkspacePoll -> public_workspace_state`; `pullWorkspaceState -> workspace_state` |
| `S3` Hall of Fame | 5.00 min | 18 | 3.60 | 133362 | 167.5 | `pullWorkspaceState -> workspace_state`; `App.publicWorkspacePoll -> public_workspace_state` |
| `S4` Lista tornei | 5.00 min | 26 | 5.20 | 696722 | 169.9 | `pullWorkspaceState -> workspace_state`; `App.publicWorkspacePoll -> public_workspace_state`; `App.publicTournamentsPoll -> public_tournaments` |
| `S5` Dettaglio torneo live | 5.00 min | 26 | 5.20 | 696722 | 169.6 | `pullWorkspaceState -> workspace_state`; `App.publicWorkspacePoll -> public_workspace_state`; `App.publicTournamentsPoll -> public_tournaments` |
| `S6` TV bracket | 5.00 min | 74 | 14.80 | 7866382 | 122.1 | `pullWorkspaceState -> workspace_state`; `App.publicWorkspacePoll -> public_workspace_state` |
| `S7` TV marcatori | 5.00 min | 74 | 14.80 | 7866382 | 115.7 | `pullWorkspaceState -> workspace_state`; `App.publicWorkspacePoll -> public_workspace_state` |
| `S10` Apertura app con contatore visite attivo | 0.33 min | 4 | 12.00 | 133438 | 136.6 | `pullWorkspaceState -> workspace_state`; `App.publicWorkspacePoll -> public_workspace_state`; `trackPublicSiteView -> flbp_track_site_view` |

### Top endpoint baseline

| Rank | Endpoint / source | Kind | Count | Tot bytes | Scenari |
|---|---|---|---:|---:|---|
| 1 | `App.publicWorkspacePoll -> public_workspace_state` | polling | 132 | 17599296 | `S1,S2,S3,S4,S5,S6,S7,S10` |
| 2 | `pullPublicCareerLeaderboard -> public_career_leaderboard` | user | 2 | 95056 | `S2` |
| 3 | `App.publicTournamentsPoll -> public_tournaments` | polling | 10 | 60100 | `S4,S5` |
| 4 | `pullPublicHallOfFameEntries -> public_hall_of_fame_entries` | user | 2 | 22124 | `S2` |
| 5 | `pullWorkspaceState -> workspace_state` | admin | 111 | 222 | `S1,S2,S3,S4,S5,S6,S7,S10` |
| 6 | `trackPublicSiteView -> flbp_track_site_view` | user | 1 | 106 | `S10` |

### Collo di bottiglia baseline

- Primo: TV (`S6`, `S7`) per volume totale, dominato dal polling `public_workspace_state` ogni 5 secondi in [`App.tsx`](/C:/Users/marco/Desktop/sito%20react/FLBP%20MANAGER/App.tsx).
- Secondo: dettagli/lista tornei (`S4`, `S5`) per doppio polling pubblico `public_workspace_state` + `public_tournaments`.
- Terzo: polling admin `pullWorkspaceState -> workspace_state` presente impropriamente anche nel pubblico; fix applicato poi in `services/repository/RemoteRepository.ts` e `App.tsx`.

Questo file serve a raccogliere il **report finale reale** dopo l'esecuzione degli scenari nel browser dev usando la strumentazione già presente in:

- `services/devRequestPerf.ts`
- `services/supabaseRest.ts`
- `App.tsx`

## Prerequisiti minimi

- build/dev run con configurazione Supabase reale disponibile
- console browser aperta
- uso dei comandi:
  - `window.__flbpRequestPerf.reset()`
  - `window.__flbpRequestPerf.reportNow()`
  - `window.__flbpRequestPerf.snapshot()`

## Stato workspace corrente

- Se `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` sono assenti/vuoti nel runtime reale, **non compilare numeri**: marca gli scenari come non eseguiti e fermati dopo l'audit/strumentazione.
- Il contatore visite (`trackPublicSiteView`) deve comparire nella strumentazione dev-only; se non compare, prima correggere l'aggancio e solo dopo misurare.

## Audit sintetico degli scenari eseguiti

| Scenario | Vista reale | Path/file principali coinvolti | Eseguito | Note setup |
|---|---|---|---|---|
| S1 | Home pubblica | `App.tsx` | ☐ | |
| S2 | Leaderboard | `App.tsx`, `components/Leaderboard.tsx` | ☐ | |
| S3 | Hall of Fame | `App.tsx`, `components/HallOfFame.tsx` | ☐ | |
| S4 | Lista tornei | `App.tsx`, `components/PublicTournaments.tsx` | ☐ | |
| S5 | Dettaglio torneo live | `App.tsx`, `components/PublicTournamentDetail.tsx` | ☐ | |
| S6 | TV bracket | `App.tsx`, `components/TvBracketView.tsx` | ☐ | |
| S7 | TV marcatori | `App.tsx`, `components/TvScorersView.tsx` | ☐ | |
| S8 | Admin aperto | `components/AdminDashboard.tsx`, `services/repository/RemoteRepository.ts` | ☐ | |
| S9 | Login arbitro + save | `components/RefereesArea.tsx` | ☐ | |
| S10 | Apertura app con contatore visite attivo | `App.tsx`, `services/supabaseRest.ts` | ☐ | |

## Procedura standard per ogni scenario

1. Apri la vista desiderata.
2. Esegui in console `window.__flbpRequestPerf.reset()`.
3. Lascia la vista stabile per la durata prevista.
4. Esegui `window.__flbpRequestPerf.reportNow()`.
5. Copia anche `window.__flbpRequestPerf.snapshot()`.
6. Incolla i risultati sintetici nelle sezioni sotto.

---

## Tabella scenario per scenario

### S1 — Home pubblica (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S2 — Leaderboard (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S3 — Hall of Fame (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S4 — Lista tornei (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S5 — Dettaglio torneo live (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S6 — TV bracket (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S7 — TV marcatori (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S8 — Admin aperto (5 min)

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S9 — Login arbitro + save

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

### S10 — Apertura app con contatore visite attivo

- Durata effettiva:
- Note ambiente:
- Snapshot raw allegato: sì / no
- Nota comportamento atteso: una write al massimo per browser/giorno, con pending lock cross-tab in `App.tsx`

| Metrica | Valore |
|---|---|
| Richieste totali | |
| Richieste/minuto | |
| Traffico totale stimato | |
| Tempo medio | |
| Tempo min | |
| Tempo max | |
| Polling presenti | |
| Duplicazioni rilevate | |
| Peso relativo | basso / medio / alto / molto alto |

| Endpoint / source | Kind | Count | Avg ms | Min ms | Max ms | Avg req bytes | Avg res bytes | Totale bytes | Duplicati | Note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| | | | | | | | | | | |

---

## Top endpoint/fetch più costosi

### Per frequenza

| Rank | Endpoint / source | Count totale | Scenari coinvolti | Note |
|---|---|---:|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

### Per payload medio

| Rank | Endpoint / source | Avg bytes | Scenari coinvolti | Note |
|---|---|---:|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

### Per traffico totale

| Rank | Endpoint / source | Totale bytes | Scenari coinvolti | Note |
|---|---|---:|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

## Top viste più costose

| Rank | Vista | Richieste totali | Traffico totale | Peso relativo | Motivo principale |
|---|---|---:|---:|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

## Collo di bottiglia principale

- Cosa:
- Path reali coinvolti:
- Metrica che lo dimostra:
- Perché impatta davvero:
- Primo intervento consigliato:

## Secondo collo di bottiglia

- Cosa:
- Path reali coinvolti:
- Metrica che lo dimostra:
- Perché impatta davvero:
- Intervento consigliato:

## Terzo collo di bottiglia

- Cosa:
- Path reali coinvolti:
- Metrica che lo dimostra:
- Perché impatta davvero:
- Intervento consigliato:

## Cosa pesa poco

- Elementi che non conviene toccare subito:
  -
  -
  -

## Rischio Supabase Free

### Uso normale
- Valutazione:
- Motivo:

### Giornata torneo live media
- Valutazione:
- Motivo:

### Caso intenso / estremo
- Valutazione:
- Motivo:

## Stima estrema

Scenario richiesto:
- torneo live di 5 ore
- 100 utenti live sul dettaglio torneo
- 2 TV attive
- uso normale admin e arbitri

### Assunzioni usate
- Richieste/minuto dettaglio live:
- Richieste/minuto TV bracket:
- Richieste/minuto TV marcatori:
- Richieste/minuto admin:
- Richieste/minuto referee:
- Fattore prudenziale applicato:

### Proiezione

| Voce | Formula | Stima |
|---|---|---|
| Richieste utenti live | | |
| Richieste TV | | |
| Richieste Admin | | |
| Richieste Referee | | |
| Totale richieste 5h | | |
| Traffico totale stimato | | |

### Lettura finale
- Rischio rispetto al free tier:
- Nota sulle approssimazioni:

## Raccomandazione del primo step di ottimizzazione

- Step scelto:
- Path reali coinvolti:
- Perché viene prima:
- Rischio:
- UX impact:

## Raccomandazione del secondo step di ottimizzazione

- Step scelto:
- Path reali coinvolti:
- Perché viene dopo:
- Rischio:
- UX impact:
