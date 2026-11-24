-- A cancelled live tournament must stop being the active FantaBeerpong
-- tournament. "Annulla torneo live" commits the workspace snapshot first; this
-- function then removes the leftover live rows, points fanta_config back at the
-- pre-tournament and returns the rosters promoted when the live started.
-- Nothing is archived and no roster is deleted: a user who already saved a
-- pre-tournament team keeps it, and the promoted one stays where it was.
--
-- Refused while the tournament is still the live one or if it was archived.
-- Safe to repeat: a second call finds nothing left to move.

create or replace function public.fanta_return_cancelled_live(
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
  v_mode text;
  v_status text;
  v_live_id text;
  v_returned int := 0;
  v_kept int := 0;
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;
  if v_tournament_id is null or v_tournament_id = '__pre_tournament__' then
    raise exception 'ID torneo annullato non valido';
  end if;

  -- Roster saves hold this row FOR SHARE: wait for them, then block new ones.
  select t.status into v_status
  from public.tournaments t
  where t.workspace_id = v_workspace_id and t.id = v_tournament_id
  for update;

  if v_status = 'archived'
    or exists (
      select 1 from public.fanta_archived_editions e
      where e.workspace_id = v_workspace_id and e.tournament_id = v_tournament_id
    )
    or exists (
      select 1
      from public.workspace_state w
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(w.state -> 'tournamentHistory') = 'array'
          then w.state -> 'tournamentHistory' else '[]'::jsonb end
      ) h(item)
      where w.workspace_id = v_workspace_id and h.item ->> 'id' = v_tournament_id
    )
  then
    raise exception 'FLBP_TOURNAMENT_ARCHIVED: il torneo è in archivio, non annullato';
  end if;

  if to_regclass('public.flbp_data_plane') is not null then
    execute 'select mode from public.flbp_data_plane where workspace_id = $1'
      into v_mode using v_workspace_id;
  end if;
  if coalesce(v_mode, 'cloud') = 'cloud' then
    select nullif(w.state #>> '{tournament,id}', '') into v_live_id
    from public.workspace_state w
    where w.workspace_id = v_workspace_id;
  else
    -- The local server owns the workspace: its public projection is the newest
    -- authoritative copy available in the cloud.
    select nullif(l.state #>> '{tournament,id}', '') into v_live_id
    from public.public_workspace_live l
    where l.workspace_id = v_workspace_id;
  end if;
  if v_live_id = v_tournament_id then
    raise exception 'FLBP_TOURNAMENT_STILL_LIVE: il torneo risulta ancora in corso';
  end if;

  update public.fanta_teams t
  set tournament_id = '__pre_tournament__',
      updated_at = now()
  where t.workspace_id = v_workspace_id
    and t.tournament_id = v_tournament_id
    and not exists (
      select 1 from public.fanta_teams pre
      where pre.workspace_id = t.workspace_id
        and pre.tournament_id = '__pre_tournament__'
        and pre.user_id = t.user_id
    );
  get diagnostics v_returned = row_count;

  select count(*) into v_kept
  from public.fanta_teams t
  where t.workspace_id = v_workspace_id and t.tournament_id = v_tournament_id;

  -- A tournament started in the meantime keeps its own Fanta phase.
  if v_live_id is null then
    insert into public.fanta_config (workspace_id, active_tournament_id, is_lock_active, registration_open, updated_at)
    values (v_workspace_id, '__pre_tournament__', false, true, now())
    on conflict (workspace_id) do update set
      active_tournament_id = excluded.active_tournament_id,
      is_lock_active = false,
      registration_open = true,
      updated_at = now();
  end if;

  -- Groups, matches and statistics follow through their foreign keys.
  delete from public.public_tournaments
  where workspace_id = v_workspace_id and id = v_tournament_id;
  delete from public.tournaments
  where workspace_id = v_workspace_id and id = v_tournament_id;

  return jsonb_build_object('ok', true, 'returned', v_returned, 'kept', v_kept);
end;
$$;

revoke all on function public.fanta_return_cancelled_live(text, text) from public, anon;
grant execute on function public.fanta_return_cancelled_live(text, text) to authenticated;
