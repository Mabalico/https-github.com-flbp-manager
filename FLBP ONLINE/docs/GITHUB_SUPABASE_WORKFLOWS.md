# GitHub Supabase workflows

Questo repository e' predisposto per far lavorare agenti/AI su Supabase tramite GitHub: schema, migrations ed Edge Functions sono versionati nel repo, mentre i deploy verso il progetto live passano da GitHub Actions.

## Fonte di verita'

- App deployabile: `FLBP ONLINE`
- Schema e migrations: `FLBP ONLINE/supabase/migrations/`
- Config Supabase CLI: `FLBP ONLINE/supabase/config.toml`
- Edge Functions: `FLBP ONLINE/supabase/functions/`
- Rollout SQL manuali/storici: `FLBP ONLINE/supabase/rollouts/`

Gli agenti devono proporre modifiche come commit/PR GitHub, non come cambi manuali invisibili nel Dashboard Supabase.

## Secret e variabili GitHub

Nel repository GitHub apri:

- `Settings`
- `Secrets and variables`
- `Actions`

Configura:

| Tipo | Nome | Uso |
| --- | --- | --- |
| Variable | `SUPABASE_PROJECT_ID` | Project ref Supabase live. Per questo progetto: `kgwhcemqkgqvtsctnwql`. |
| Secret | `SUPABASE_ACCESS_TOKEN` | Token personale Supabase per CLI, deploy functions e link progetto. |
| Secret | `SUPABASE_DB_PASSWORD` | Password Postgres del progetto Supabase live, usata da `supabase db push`. |
| Secret | `SUPABASE_DB_URL` | Connection string Postgres completa, usata dal workflow di cleanup account/alias. |

`SUPABASE_PROJECT_ID` ha un fallback nei workflow attuali, ma tenerlo come Repository Variable rende esplicito il collegamento.

Esempio forma attesa per `SUPABASE_DB_URL`:

```text
postgresql://postgres.<project-ref>:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Non committare mai service-role key, access token, DB password o file `.env` reali.

## Workflow disponibili

### `Supabase CI`

File: `.github/workflows/supabase-ci.yml`

Uso:

- parte su PR che modificano `FLBP ONLINE/supabase/**`
- applica le migration a un database locale pulito con `supabase db start`
- esegue `supabase db lint --local --fail-on error`

Serve per far validare automaticamente le migration scritte dagli agenti prima del merge.

### `Deploy Supabase database`

File: `.github/workflows/supabase-db-deploy.yml`

Uso:

- parte automaticamente su `main` quando cambiano `config.toml` o `supabase/migrations/**`
- puo' essere lanciato manualmente in modalita' `dry-run` o `apply`
- esegue `supabase link --project-ref "$SUPABASE_PROJECT_ID"`
- mostra le migration pendenti con `supabase db push --linked --dry-run`
- applica le migration con `supabase db push --linked --yes`

Secret richiesti:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

### `Deploy Supabase Edge Functions`

File: `.github/workflows/supabase-functions-deploy.yml`

Uso:

- parte automaticamente su `main` quando cambiano `supabase/functions/**`
- puo' essere lanciato manualmente per `all` o per una singola function
- deploya le function con `supabase functions deploy ... --use-api`

Secret richiesto:

- `SUPABASE_ACCESS_TOKEN`

### Workflow manuali legacy per singola function

Restano disponibili:

- `Deploy player-account-admin Edge Function`
- `Deploy player-alias-alert Edge Function`
- `Deploy database-backup-admin Edge Function`

Sono utili quando vuoi ridistribuire una sola function storica senza usare il workflow aggregato.

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

## Regole per agenti/AI

- Per cambiare il DB, aggiungi sempre una migration in `FLBP ONLINE/supabase/migrations/`.
- Usa nomi migration nel formato `YYYYMMDDHHMMSS_descrizione_breve.sql`.
- Preferisci migration additive e idempotenti dove possibile (`if not exists`, `create or replace function`, policy nominate chiaramente).
- Se una migration richiede un deploy Edge Function coordinato, modifica anche `FLBP ONLINE/supabase/functions/<nome>/` nella stessa PR.
- Aggiorna la documentazione in `FLBP ONLINE/docs/` quando cambia un flusso admin, dati o auth.
- Non toccare `SUPABASE_DB_URL`, access token, DB password o secret runtime nei file versionati.

## Flusso consigliato

1. L'agente crea una branch e modifica `FLBP ONLINE/supabase/migrations/` e/o `FLBP ONLINE/supabase/functions/`.
2. Apre una PR su GitHub.
3. `Supabase CI` valida le migration su DB locale pulito.
4. Dopo merge su `main`, GitHub Actions applica le migration al progetto Supabase live e deploya le Edge Functions modificate.
5. Per operazioni rischiose, imposta protezioni sull'environment GitHub `production` cosi' il deploy richiede approvazione manuale.
