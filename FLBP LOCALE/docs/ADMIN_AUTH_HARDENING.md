# Autorizzazione Admin: claim attendibili e verifiche

La migration `supabase/migrations/20260924000100_admin_auth_trusted_claims.sql` chiude due percorsi di accesso non autorizzato nel gate condiviso `public.flbp_is_admin()`:

- `user_metadata.role` non concede più privilegi. Questi metadati sono modificabili dal proprietario dell'account tramite Supabase Auth.
- Claim assenti o null restituiscono sempre `false`, mai `NULL`. Anche le vecchie RPC con `if not flbp_is_admin()` rifiutano quindi l'accesso.

La stessa migration è presente in `FLBP ONLINE` e `FLBP LOCALE`; non modifica le migration già pubblicate. I rispettivi `setup_all.sql` applicano il controllo corretto anche alle installazioni effettuate dal vecchio bundle. Il bundle rimane uno snapshot di compatibilità: non sostituisce la sequenza completa delle migration ONLINE.

## Chi conserva l'accesso

| Identità verificata dal database | Esito |
| --- | --- |
| Chiamata con service role | Consentito |
| Utente presente in `public.admin_users` | Consentito |
| Claim `app_metadata.role = admin` assegnato dal server | Consentito, compatibilità esistente |
| Claim JWT principale `role = admin` firmato dal server | Consentito, compatibilità esistente |
| Solo `user_metadata.role = admin` | Rifiutato |
| Utente autenticato ordinario oppure claim mancanti/null | Rifiutato |
| Anonimo | Rifiutato |

`admin_users` rimane il percorso amministrativo ordinario già richiesto dall'app e dalle Edge Functions. I claim attendibili vengono mantenuti per non interrompere integrazioni SQL esistenti: sono stati supportati dalle migration precedenti e `app_metadata` non è modificabile tramite l'API utente. Le fonti ufficiali distinguono [metadati utente](https://supabase.com/docs/guides/auth/users) e [metadati applicativi per i ruoli](https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0).

La rimozione di una riga `admin_users` revoca subito il percorso basato sulla membership. Un eventuale claim amministrativo server ancora presente nel JWT resta un percorso separato: va revocato sul server e il token deve essere rinnovato/scadere. Non assegnare mai i claim attendibili copiandoli automaticamente da input dell'utente.

La migration revoca inoltre l'esecuzione a `PUBLIC` e `anon` di tutte le firme esistenti di `flbp_admin_push_workspace_state`, `flbp_admin_push_match_result` e `flbp_archive_fanta_tournament`. Mantiene `authenticated` e `service_role`; i gate interni continuano a decidere se l'utente autenticato è realmente Admin. Il ciclo sulle firme esistenti funziona anche sulla copia LOCALE, che non contiene tutte le RPC e le firme più recenti.

## Helper interni non raggiungibili dall'API client

La migration `supabase/migrations/20261116000100_revoke_internal_helpers_from_client_roles.sql` revoca a `PUBLIC`, `anon` e `authenticated` l'esecuzione di quattro funzioni `SECURITY DEFINER` interne: `flbp_apply_match_result_patch`, `flbp_upsert_public_workspace_live`, `flbp_log_referee_auth_audit` e `flbp_referee_auth_is_rate_limited`. Le migration originali le revocavano solo a `PUBLIC`, ma i privilegi di default di Supabase concedono `EXECUTE` esplicito ad `anon` e `authenticated` su ogni nuova funzione dello schema `public`: restavano quindi richiamabili da `/rest/v1/rpc` senza password arbitri né sessione Admin, pur non avendo alcun controllo di autorizzazione proprio.

Le funzioni continuano a essere usate dalle RPC Admin, arbitri, data plane locale e restore, che sono `SECURITY DEFINER` e le invocano con i privilegi del proprietario. `service_role` conserva `EXECUTE`. Il ciclo sulle firme esistenti rende la migration riapplicabile e priva di effetti sulla copia LOCALE dove una funzione non esiste.

Restano volutamente eseguibili dai ruoli client: le RPC con controllo interno (password arbitri, `flbp_is_admin()`, `auth.uid()`), `flbp_resolve_data_plane`, le due RPC di tracciamento e `flbp_fanta_award_points_for_player`, usata da viste pubbliche. Le funzioni trigger non sono richiamabili via RPC.

## Test SQL

`supabase/tests/admin_auth_hardening.sql` esercita 27 asserzioni effettive su PostgreSQL: cambi di ruolo, lettura/scrittura attraverso RLS, chiamata della RPC snapshot reale con `p_force`, membership, revoca e permessi delle firme RPC, inclusi gli helper interni. La sonda di sola lettura `supabase/tests/deployed_stabilization_readonly.sql`, eseguita dopo ogni deploy del database, rifiuta gli stessi helper se tornano eseguibili da un ruolo client. Le fixture e gli helper vengono creati in una transazione e sempre annullati con `rollback` al termine della suite. Il file usa asserzioni PL/pgSQL, non il formato TAP.

Su uno stack Supabase locale **già migrato** e disposable, dalla directory `FLBP ONLINE`:

```powershell
node scripts/test-admin-auth.mjs --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Il runner richiede `psql` e accetta esclusivamente host loopback, senza parametri URL che possano sovrascrivere la connessione. Non usa file `.env` o credenziali di produzione. Per CI eseguire questo comando dopo `supabase db start`; non passare questo file direttamente a `pg_prove`.

Se PostgreSQL/Docker non sono installati, il runner supporta un modulo [PGlite](https://pglite.dev/docs/about) disponibile come tooling esterno, senza aggiungerlo alle dipendenze dell'app:

```powershell
node scripts/test-admin-auth.mjs --pglite C:\percorso\runtime-test\node_modules\@electric-sql\pglite\dist\index.js
```

Questa modalità crea PostgreSQL WASM esclusivamente in memoria, applica le migration originali relative a tabelle, RLS e RPC, dimostra che la baseline vulnerabile fallisce, applica due volte la migration correttiva e riesegue le asserzioni per ONLINE e LOCALE. Esegue anche le definizioni del gate presenti nei rispettivi `setup_all.sql` e verifica nuovamente la stessa matrice. Le sole funzioni `auth.jwt()`, `auth.role()` e `auth.uid()` sono fixture che leggono claim di test; vengono usati gli effettivi gate, policy e RPC del repository.

## Validazione effettuata e limiti

Il 24 settembre 2026, con Node 24.12.0 e PGlite 0.3.16 installato nella directory temporanea dalla cache npm:

- Baseline vulnerabile ONLINE e LOCALE entrambe rifiutate dalla suite.
- 26/26 asserzioni dopo migration ONLINE; 26/26 dopo migration LOCALE.
- 26/26 per ciascuna copia dopo la sequenza gate del rispettivo setup SQL.
- Riapplicazione della nuova migration senza errori.

Sono test di autorizzazione SQL, non un'emulazione JavaScript della logica. Non verificano il servizio Auth HTTP, la verifica crittografica del JWT, il deployment effettivo o ogni oggetto dell'intero schema Supabase. CLI Supabase, Docker e PostgreSQL nativo non erano disponibili in questa sessione: la prova su stack Supabase completo resta da eseguire in CI.

Nessun deployment e nessuna chiamata al database di produzione sono stati effettuati. Il codice corretto diventa operativo sul cloud quando la migration viene distribuita tramite il percorso previsto dal progetto. Questo intervento non modifica le RPC arbitri né il loro rate limit, che richiedono una revisione separata.

### Verifica della migration `20261116000100` (16 novembre 2026)

Con Node 24.12.0 e PGlite 0.3.16, su PostgreSQL in memoria con le 71 migration ONLINE precedenti e i privilegi di default di Supabase simulati (`alter default privileges in schema public grant execute on functions to anon, authenticated, service_role`):

- Prima della migration un chiamante anonimo eseguiva `flbp_upsert_public_workspace_live` (riga scritta nel mirror live), `flbp_log_referee_auth_audit` (riga scritta nell'audit) e `flbp_referee_auth_is_rate_limited`, e raggiungeva il corpo di `flbp_apply_match_result_patch`.
- Dopo la migration, applicata due volte, le quattro chiamate dirette sono negate con `42501`; `service_role` conserva `EXECUTE`; il login arbitri da anonimo continua a funzionare e l'audit interno viene scritto.
- Superate le suite PGlite del progetto: Admin 27/27 per ONLINE e LOCALE, arbitri (64 asserzioni ONLINE, 52 legacy), mirror pubblici, restore e ordine archivio Fanta.

È una simulazione dei privilegi di default, non lo stack Supabase reale: la conferma definitiva arriva dalla CI PostgreSQL nativa e dalla sonda di sola lettura dopo il deploy. Nessuna chiamata al database di produzione è stata effettuata.
