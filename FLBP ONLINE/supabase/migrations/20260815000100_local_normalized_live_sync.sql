-- Keep normalized tournament/Fanta projections in step with the local primary.
--
-- The local journal used to confirm an operation after appending it to the
-- remote audit log, while only the compact public snapshot was refreshed.
-- Fanta views read tournament_matches/tournament_match_stats instead, so their
-- scores remained at zero throughout a local tournament.  These service-only
-- functions reuse the existing, tested per-match normalizer and fence every
-- write with the active local node + epoch.

create or replace function public.flbp_local_sync_live_normalized_internal(
  p_workspace_id text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_tournament jsonb := coalesce(v_state -> 'tournament', '{}'::jsonb);
  v_tournament_id text := nullif(trim(coalesce(v_tournament ->> 'id', '')), '');
  v_matches jsonb;
  v_team jsonb;
  v_group jsonb;
  v_group_team jsonb;
  v_match jsonb;
  v_now timestamptz := now();
  v_team_count integer := 0;
  v_group_count integer := 0;
  v_match_count integer := 0;
begin
  if v_tournament_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_live_tournament');
  end if;

  insert into public.tournaments (
    workspace_id, id, name, start_date, type, config, is_manual, status, updated_at
  ) values (
    v_workspace_id,
    v_tournament_id,
    coalesce(nullif(v_tournament ->> 'name', ''), v_tournament_id),
    coalesce(public.flbp_match_result_parse_timestamptz(v_tournament ->> 'startDate'), v_now),
    case when v_tournament ->> 'type' in ('elimination', 'groups_elimination')
      then v_tournament ->> 'type' else 'elimination' end,
    coalesce(v_tournament -> 'config', '{}'::jsonb),
    lower(coalesce(v_tournament ->> 'isManual', 'false')) in ('true', 't', '1'),
    'live',
    v_now
  )
  on conflict (workspace_id, id) do update set
    name = excluded.name,
    start_date = excluded.start_date,
    type = excluded.type,
    config = excluded.config,
    is_manual = excluded.is_manual,
    status = 'live',
    updated_at = excluded.updated_at;

  insert into public.public_tournaments (
    workspace_id, id, name, start_date, type, config, is_manual, status, updated_at
  ) values (
    v_workspace_id,
    v_tournament_id,
    coalesce(nullif(v_tournament ->> 'name', ''), v_tournament_id),
    coalesce(public.flbp_match_result_parse_timestamptz(v_tournament ->> 'startDate'), v_now),
    case when v_tournament ->> 'type' in ('elimination', 'groups_elimination')
      then v_tournament ->> 'type' else 'elimination' end,
    coalesce(v_tournament -> 'config', '{}'::jsonb),
    lower(coalesce(v_tournament ->> 'isManual', 'false')) in ('true', 't', '1'),
    'live',
    v_now
  )
  on conflict (workspace_id, id) do update set
    name = excluded.name,
    start_date = excluded.start_date,
    type = excluded.type,
    config = excluded.config,
    is_manual = excluded.is_manual,
    status = 'live',
    updated_at = excluded.updated_at;

  if jsonb_typeof(v_tournament -> 'teams') = 'array' then
    for v_team in select value from jsonb_array_elements(v_tournament -> 'teams')
    loop
      if nullif(trim(coalesce(v_team ->> 'id', '')), '') is null then continue; end if;

      insert into public.tournament_teams (
        workspace_id, tournament_id, id, name, player1, player2,
        player1_is_referee, player2_is_referee, is_referee, created_at_ms
      ) values (
        v_workspace_id, v_tournament_id, v_team ->> 'id',
        coalesce(nullif(v_team ->> 'name', ''), v_team ->> 'id'),
        coalesce(v_team ->> 'player1', ''), coalesce(v_team ->> 'player2', ''),
        lower(coalesce(v_team ->> 'player1IsReferee', 'false')) in ('true', 't', '1'),
        lower(coalesce(v_team ->> 'player2IsReferee', 'false')) in ('true', 't', '1'),
        lower(coalesce(v_team ->> 'isReferee', 'false')) in ('true', 't', '1'),
        case when coalesce(v_team ->> 'createdAt', '') ~ '^\d+$'
          then (v_team ->> 'createdAt')::bigint else null end
      )
      on conflict (workspace_id, tournament_id, id) do update set
        name = excluded.name,
        player1 = excluded.player1,
        player2 = excluded.player2,
        player1_is_referee = excluded.player1_is_referee,
        player2_is_referee = excluded.player2_is_referee,
        is_referee = excluded.is_referee,
        created_at_ms = excluded.created_at_ms;

      insert into public.public_tournament_teams (
        workspace_id, tournament_id, id, name, player1, player2,
        player1_is_referee, player2_is_referee, is_referee, created_at
      ) values (
        v_workspace_id, v_tournament_id, v_team ->> 'id',
        coalesce(nullif(v_team ->> 'name', ''), v_team ->> 'id'),
        coalesce(v_team ->> 'player1', ''), coalesce(v_team ->> 'player2', ''),
        lower(coalesce(v_team ->> 'player1IsReferee', 'false')) in ('true', 't', '1'),
        lower(coalesce(v_team ->> 'player2IsReferee', 'false')) in ('true', 't', '1'),
        lower(coalesce(v_team ->> 'isReferee', 'false')) in ('true', 't', '1'),
        case when coalesce(v_team ->> 'createdAt', '') ~ '^\d+$'
          then to_timestamp((v_team ->> 'createdAt')::double precision / 1000.0) else null end
      )
      on conflict (workspace_id, tournament_id, id) do update set
        name = excluded.name,
        player1 = excluded.player1,
        player2 = excluded.player2,
        player1_is_referee = excluded.player1_is_referee,
        player2_is_referee = excluded.player2_is_referee,
        is_referee = excluded.is_referee,
        created_at = excluded.created_at;

      v_team_count := v_team_count + 1;
    end loop;
  end if;

  if jsonb_typeof(v_tournament -> 'groups') = 'array' then
    for v_group in select value from jsonb_array_elements(v_tournament -> 'groups')
    loop
      if nullif(trim(coalesce(v_group ->> 'id', '')), '') is null then continue; end if;

      insert into public.tournament_groups (workspace_id, tournament_id, id, name, order_index)
      values (
        v_workspace_id, v_tournament_id, v_group ->> 'id',
        coalesce(nullif(v_group ->> 'name', ''), v_group ->> 'id'), v_group_count
      ) on conflict (workspace_id, tournament_id, id) do update set
        name = excluded.name, order_index = excluded.order_index;

      insert into public.public_tournament_groups (workspace_id, tournament_id, id, name, order_index)
      values (
        v_workspace_id, v_tournament_id, v_group ->> 'id',
        coalesce(nullif(v_group ->> 'name', ''), v_group ->> 'id'), v_group_count
      ) on conflict (workspace_id, tournament_id, id) do update set
        name = excluded.name, order_index = excluded.order_index;

      if jsonb_typeof(v_group -> 'teams') = 'array' then
        for v_group_team in select value from jsonb_array_elements(v_group -> 'teams')
        loop
          if nullif(trim(coalesce(v_group_team ->> 'id', '')), '') is null then continue; end if;
          insert into public.tournament_group_teams (workspace_id, tournament_id, group_id, team_id)
          values (v_workspace_id, v_tournament_id, v_group ->> 'id', v_group_team ->> 'id')
          on conflict (workspace_id, tournament_id, group_id, team_id) do nothing;

          insert into public.public_tournament_group_teams (workspace_id, tournament_id, group_id, team_id, seed)
          values (v_workspace_id, v_tournament_id, v_group ->> 'id', v_group_team ->> 'id', null)
          on conflict (workspace_id, tournament_id, group_id, team_id) do nothing;
        end loop;
      end if;

      v_group_count := v_group_count + 1;
    end loop;
  end if;

  v_matches := case
    when jsonb_typeof(v_state -> 'tournamentMatches') = 'array' then v_state -> 'tournamentMatches'
    when jsonb_typeof(v_tournament -> 'matches') = 'array' then v_tournament -> 'matches'
    else '[]'::jsonb
  end;

  for v_match in select value from jsonb_array_elements(v_matches)
  loop
    perform public.flbp_match_result_upsert_rows(
      v_workspace_id, v_tournament_id, v_state, v_match, v_now
    );
    v_match_count := v_match_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'tournament_id', v_tournament_id,
    'teams', v_team_count,
    'groups', v_group_count,
    'matches', v_match_count
  );
end;
$$;

revoke all on function public.flbp_local_sync_live_normalized_internal(text, jsonb) from public, anon, authenticated;

create or replace function public.flbp_local_sync_live_normalized(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plane record;
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || v_workspace_id));
  select mode, node_id, epoch into v_plane
  from public.flbp_data_plane where workspace_id = v_workspace_id for update;
  if not found or v_plane.mode <> 'local'
    or v_plane.node_id <> p_node_id or v_plane.epoch <> p_epoch
  then
    raise exception 'FLBP_EPOCH_FENCED: sync normalizzato rifiutato';
  end if;
  return public.flbp_local_sync_live_normalized_internal(v_workspace_id, p_state);
end;
$$;

revoke all on function public.flbp_local_sync_live_normalized(text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.flbp_local_sync_live_normalized(text, text, bigint, jsonb) to service_role;

create or replace function public.flbp_local_append_operations_v2(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_operations jsonb,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_entry jsonb;
  v_match jsonb;
  v_tournament_id text := nullif(trim(coalesce(p_state #>> '{tournament,id}', '')), '');
  v_updated integer := 0;
  v_full_sync boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;

  v_result := public.flbp_local_append_operations(
    p_workspace_id, p_node_id, p_epoch, p_operations
  );

  if v_tournament_id is null then
    return v_result || jsonb_build_object('normalized_matches', 0, 'normalized_skipped', 'no_live_tournament');
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb)) as op(value)
    where coalesce(op.value ->> 'operation_kind', '') <> 'match-result'
  ) into v_full_sync;

  if v_full_sync then
    return v_result || public.flbp_local_sync_live_normalized_internal(p_workspace_id, p_state);
  end if;

  for v_entry in
    select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb))
  loop
    if coalesce(v_entry ->> 'operation_kind', '') <> 'match-result'
      or jsonb_typeof(v_entry #> '{payload,matches}') <> 'array'
    then
      continue;
    end if;

    for v_match in
      select value from jsonb_array_elements(v_entry #> '{payload,matches}')
    loop
      perform public.flbp_match_result_upsert_rows(
        coalesce(nullif(trim(p_workspace_id), ''), 'default'),
        v_tournament_id,
        p_state,
        v_match,
        now()
      );
      v_updated := v_updated + 1;
    end loop;
  end loop;

  return v_result || jsonb_build_object('normalized_matches', v_updated);
end;
$$;

revoke all on function public.flbp_local_append_operations_v2(text, text, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.flbp_local_append_operations_v2(text, text, bigint, jsonb, jsonb) to service_role;
