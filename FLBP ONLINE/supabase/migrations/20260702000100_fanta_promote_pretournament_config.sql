-- Keep pre-tournament Fanta teams attached when a real live tournament starts.
-- The RPC already promoted fanta_teams from __pre_tournament__ to the real tournament,
-- but did not make fanta_config point to that tournament. This made the UI able to
-- resolve the live tournament while saved rosters were still effectively invisible.

create or replace function public.fanta_promote_pretournament(
  p_workspace_id text,
  p_tournament_id text,
  p_tournament_name text default null,
  p_tournament_config jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id text := nullif(p_tournament_id, '');
  v_updated int := 0;
  v_skipped int := 0;
  v_results_only boolean := false;
begin
  if not public.flbp_is_admin() then
    raise exception 'Admin access required.';
  end if;

  if v_tournament_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_tournament_id');
  end if;

  v_results_only := lower(coalesce(p_tournament_config->>'resultsOnly', 'false')) in ('true', '1', 'yes');
  if v_results_only then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'results_only_tournament');
  end if;

  insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
  select p.workspace_id, p.id, p.name, p.start_date, p.type, coalesce(p.config, '{}'::jsonb), p.is_manual, p.status, coalesce(p.updated_at, now())
  from public.public_tournaments p
  where p.workspace_id = p_workspace_id
    and p.id = v_tournament_id
  on conflict (workspace_id, id) do update set
    name = excluded.name,
    start_date = excluded.start_date,
    type = excluded.type,
    config = excluded.config,
    is_manual = excluded.is_manual,
    status = excluded.status,
    updated_at = excluded.updated_at;

  if not exists (
    select 1 from public.tournaments
    where workspace_id = p_workspace_id
      and id = v_tournament_id
  ) then
    insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
    values (
      p_workspace_id,
      v_tournament_id,
      coalesce(nullif(p_tournament_name, ''), 'Torneo FantaBeerpong'),
      now(),
      'elimination',
      coalesce(p_tournament_config, '{}'::jsonb),
      true,
      'live',
      now()
    )
    on conflict (workspace_id, id) do nothing;
  end if;

  insert into public.fanta_config (workspace_id, active_tournament_id, is_lock_active, registration_open, updated_at)
  values (p_workspace_id, v_tournament_id, false, true, now())
  on conflict (workspace_id) do update set
    active_tournament_id = excluded.active_tournament_id,
    is_lock_active = false,
    registration_open = true,
    updated_at = now();

  select count(*)
  into v_skipped
  from public.fanta_teams pre
  where pre.workspace_id = p_workspace_id
    and pre.tournament_id = '__pre_tournament__'
    and exists (
      select 1 from public.fanta_teams live
      where live.workspace_id = p_workspace_id
        and live.tournament_id = v_tournament_id
        and live.user_id = pre.user_id
    );

  update public.fanta_teams pre
  set tournament_id = v_tournament_id,
      updated_at = now()
  where pre.workspace_id = p_workspace_id
    and pre.tournament_id = '__pre_tournament__'
    and not exists (
      select 1 from public.fanta_teams live
      where live.workspace_id = p_workspace_id
        and live.tournament_id = v_tournament_id
        and live.user_id = pre.user_id
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object('ok', true, 'promoted', v_updated, 'skipped', v_skipped);
end;
$$;

grant execute on function public.fanta_promote_pretournament(text, text, text, jsonb) to authenticated;
