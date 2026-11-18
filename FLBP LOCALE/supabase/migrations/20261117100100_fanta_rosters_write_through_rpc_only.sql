-- FantaBeerpong rosters are written only through their SECURITY DEFINER RPCs.
-- The original schema granted INSERT/UPDATE/DELETE on fanta_teams and
-- fanta_rosters to authenticated and kept an "Owner CRUD" policy, so a signed-in
-- player could PATCH /rest/v1/fanta_rosters on their own team after the first
-- match and bypass every rule enforced by fanta_save_team (4 players, 1 captain,
-- 2 defenders, market lock). Supabase's default privileges also grant the same
-- table privileges to anon (blocked today only by the owner policy).
-- The application never writes these tables directly: fanta_save_team,
-- fanta_sync_pretournament_rosters, fanta_promote_pretournament, the Admin
-- delete/archive RPCs and the local data-plane/restore RPCs are all SECURITY
-- DEFINER and keep working with the owner's privileges. Public reads are kept.
-- Safe to reapply; a no-op on a schema without the Fanta tables.

do $$
declare
  v_table text;
begin
  if to_regclass('public.fanta_teams') is null or to_regclass('public.fanta_rosters') is null then
    return;
  end if;
  -- An older environment could still run an invoker fanta_save_team that relies
  -- on the direct grants. Refuse to break roster saving silently.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fanta_save_team' and not p.prosecdef
  ) then
    raise exception 'fanta_save_team must be SECURITY DEFINER before direct Fanta roster writes are revoked';
  end if;
  foreach v_table in array array['fanta_teams', 'fanta_rosters'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select on table public.%I to anon, authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end;
$$;
