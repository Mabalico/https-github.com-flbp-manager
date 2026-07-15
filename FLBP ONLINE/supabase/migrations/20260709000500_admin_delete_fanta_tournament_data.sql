-- FLBP Manager Suite - eliminazione admin dei dati Fanta di un torneo.
--
-- Le tabelle fanta_teams / fanta_rosters hanno RLS "Owner CRUD" (auth.uid() =
-- user_id): l'admin NON puo' cancellarle via REST (la DELETE colpisce 0 righe
-- perche' la RLS le nasconde). Risultato: eliminando un torneo restano squadre
-- fanta orfane (nessuna FK di cascade: fanta_teams_tournament_fk e' stata
-- rimossa dal fix award). Questo RPC security-definer, gate admin, ripulisce
-- squadre, rose e snapshot archiviati di un torneo in un colpo solo.
--
-- Nota: NON tocca il container pretorneo se non esplicitamente richiesto con
-- quell'id; passa l'id reale del torneo (o '__pre_tournament__') da ripulire.

create or replace function public.flbp_admin_delete_fanta_tournament_data(
  p_workspace_id text,
  p_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_tournament_id text := nullif(trim(p_tournament_id), '');
  v_teams int := 0;
  v_rosters int := 0;
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;
  if v_tournament_id is null then
    raise exception 'ID torneo Fanta mancante';
  end if;

  delete from public.fanta_rosters fr
  using public.fanta_teams ft
  where fr.team_id = ft.id
    and ft.workspace_id = v_workspace_id
    and ft.tournament_id = v_tournament_id;
  get diagnostics v_rosters = row_count;

  delete from public.fanta_teams
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id;
  get diagnostics v_teams = row_count;

  delete from public.fanta_archived_players
  where workspace_id = v_workspace_id and tournament_id = v_tournament_id;
  delete from public.fanta_archived_rosters
  where workspace_id = v_workspace_id and tournament_id = v_tournament_id;
  delete from public.fanta_archived_standings
  where workspace_id = v_workspace_id and tournament_id = v_tournament_id;
  delete from public.fanta_archived_editions
  where workspace_id = v_workspace_id and tournament_id = v_tournament_id;

  return jsonb_build_object(
    'ok', true,
    'tournament_id', v_tournament_id,
    'deleted_teams', v_teams,
    'deleted_rosters', v_rosters
  );
end;
$$;

revoke all on function public.flbp_admin_delete_fanta_tournament_data(text, text) from public, anon;
grant execute on function public.flbp_admin_delete_fanta_tournament_data(text, text) to authenticated;
