# Flag locali (localStorage / sessionStorage)

## localStorage
- `flbp_remote_repo=1` → abilita **RemoteRepository** (DB come sorgente primaria quando disponibile).
- `flbp_public_db_read=1` → abilita letture **public** (`public_*`) per Leaderboard/Tornei/Hall of Fame.
- `flbp_auto_structured_sync=1` → auto-sync structured verso DB (default OFF).

### Auth Supabase (token salvati localmente)
- `flbp_supabase_access_token`
- `flbp_supabase_refresh_token`
- `flbp_supabase_expires_at`
- `flbp_supabase_user_email`
- `flbp_supabase_user_id`
- `flbp_remote_unsynced_draft_v1` → bozza locale non ancora sincronizzata su Supabase (autosave admin robusto)
- `flbp_admin_sync_state_v1` → stato UX autosave admin

## sessionStorage
- nessun gate Admin locale dedicato: l’accesso Admin usa la sessione Supabase Auth salvata in `localStorage`, mentre l’autorizzazione remota resta verificata via `public.admin_users` / `flbp_is_admin()`.

## Variabili ambiente (.env / hosting)
Usate dal frontend Vite per deploy pubblico e sync remoto.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WORKSPACE_ID` (default: `default`)
- `VITE_SUPABASE_ADMIN_EMAIL` (default consigliato: `admin@flbp.local`)
- `VITE_PUBLIC_DB_READ` (opzionale)
- `VITE_REMOTE_REPO=1`
- `VITE_AUTO_STRUCTURED_SYNC=1`
- `VITE_ALLOW_LOCAL_ONLY=0` per bloccare il fallback locale in deploy pubblico
- `VITE_APP_MODE=official` per nascondere gli strumenti tester nel deploy pubblico
