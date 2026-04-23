# GitHub Supabase workflows

Questi workflow servono a eseguire operazioni manuali ma ripetibili su Supabase senza dipendere dalla CLI locale.

## Workflow disponibili

### `Cleanup player account alias link`

Uso:
- pulizia di un profilo live rimasto collegato allo storico dopo cancellazione/ricreazione account
- rimozione merge request residue legate a `requester_user_id`
- rimozione opzionale merge request residue legate a `requester_email`

Input:
- `workspace_id`
- `user_id`
- `requester_email` opzionale
- `confirm` con valore `RUN`

Secret richiesto:
- `SUPABASE_DB_URL`

### `Deploy player-account-admin Edge Function`

Uso:
- deploy manuale della function `player-account-admin` dopo modifiche al repo

Input:
- `project_ref`
- `confirm` con valore `RUN`

Secret richiesto:
- `SUPABASE_ACCESS_TOKEN`

## Secret GitHub da configurare

Nel repository GitHub, aprire:
- `Settings`
- `Secrets and variables`
- `Actions`

Poi aggiungere:

### `SUPABASE_DB_URL`

Connection string Postgres completa del progetto Supabase live.

Esempio forma attesa:

```text
postgresql://postgres.<project-ref>:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

### `SUPABASE_ACCESS_TOKEN`

Token personale Supabase con permessi sufficienti al deploy della Edge Function.

## Flusso consigliato per i bug account/alias

1. Eseguire `Deploy player-account-admin Edge Function`
2. Eseguire `Cleanup player account alias link`
3. Far rientrare l'utente nella webapp
4. Verificare che non risulti gia' collegato allo storico
