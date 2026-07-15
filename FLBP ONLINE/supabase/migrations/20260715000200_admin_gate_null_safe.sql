-- FLBP Manager Suite - hardening del gate admin (privilege escalation).
--
-- Due difetti preesistenti che si combinano in un buco di sicurezza:
--
-- 1) flbp_is_admin() poteva restituire NULL invece di false. Per un chiamante
--    senza claim admin, la catena OR finisce con termini NULL
--    (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'  =>  NULL) e
--    `false OR NULL = NULL`. Nei gate `if not flbp_is_admin() then raise`,
--    `not NULL = NULL` => il raise NON scatta e il controllo viene aggirato.
--    (Nelle policy RLS `using (flbp_is_admin())` NULL vale come false, quindi
--    la RLS non era intaccata: il problema erano solo i gate imperativi.)
--
-- 2) flbp_admin_push_workspace_state / flbp_admin_push_match_result /
--    flbp_archive_fanta_tournament avevano solo `grant execute ... to
--    authenticated` ma nessun `revoke ... from public`: in Postgres le
--    funzioni sono eseguibili da PUBLIC per default, quindi restavano
--    invocabili anche da anon (publishable key).
--
-- Insieme: un anonimo con la publishable key (o un qualsiasi account player
-- loggato) poteva invocare le RPC di scrittura admin e, con p_force, scavalcare
-- anche il controllo ottimistico di versione.
--
-- Fix: (1) flbp_is_admin() avvolto in coalesce(..., false) alla fonte, cosi'
-- ogni gate imperativo e ogni policy si chiudono in un colpo; (2) revoke
-- esplicito da public, anon sulle funzioni admin esposte.

create or replace function public.flbp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.role() = 'service_role')
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    )
    or (auth.jwt() ->> 'role' = 'admin')
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    or ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'),
    false
  );
$$;

grant execute on function public.flbp_is_admin() to anon, authenticated;

-- Revoke del grant implicito a PUBLIC sulle funzioni di scrittura admin (i
-- grant espliciti a authenticated restano: i gate interni bloccano comunque i
-- non-admin autenticati, ora che flbp_is_admin() non e' piu' NULL-leaky).
revoke all on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean, text) from public, anon;
revoke all on function public.flbp_admin_push_match_result(text, text, text, jsonb, text) from public, anon;
revoke all on function public.flbp_archive_fanta_tournament(text, text) from public, anon;

grant execute on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean, text) to authenticated;
grant execute on function public.flbp_admin_push_match_result(text, text, text, jsonb, text) to authenticated;
grant execute on function public.flbp_archive_fanta_tournament(text, text) to authenticated;
