# Audit profilo backup JSON inclusi nel repository

Generato automaticamente da `npm run audit:backup-profiles` il 2026-03-27T08:26:30.594Z.

Questo report censisce solo i JSON **già inclusi nello ZIP/repository** che espongono davvero una shape di backup FLBP (sample, import, restore, fixture operative). I template/stub senza stato completo vengono ignorati.
Non analizza i backup caricati in chat o i file esterni dell'utente.

- File backup-like trovati: **5**
- Profilo **modern**: **5**
- Profilo **legacy-compatible**: **0**

## Risultato

- Tutti i JSON backup-like inclusi nel repository risultano **moderni**.
- Non è stata necessaria alcuna migrazione dei file di esempio/template già versionati.
- La compatibilità YoB resta attiva solo per backup esterni o snapshot legacy non inclusi nel repository.

## Dettaglio file

| File | Wrapper | Profilo | Teams | Storico | HoF | Scorers | YoB live | YoB torneo | YoB storico | YoB scorers |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `docs/sample_backup.json` | raw | **modern** | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `.codex-tmp/historical_import_v2.json` | raw | **modern** | 0 | 23 | 34 | 217 | 0 | 0 | 0 | 0 |
| `.codex-tmp/historical_restore_v3.json` | raw | **modern** | 0 | 23 | 35 | 217 | 0 | 0 | 0 | 0 |
| `.codex-tmp/manual_history_import.json` | raw | **modern** | 0 | 1 | 35 | 217 | 0 | 0 | 0 | 0 |
| `.codex-tmp/pecora_nera_import.json` | raw | **modern** | 0 | 1 | 3 | 32 | 0 | 0 | 0 | 0 |

## Uso

```bash
npm run audit:backup-profiles
```

Il comando rigenera questo report e fallisce solo se non riesce a leggere un JSON incluso nel repository.
