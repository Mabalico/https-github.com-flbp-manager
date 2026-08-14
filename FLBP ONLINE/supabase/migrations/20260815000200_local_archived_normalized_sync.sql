-- Extend the local-primary normalizer to archived tournaments as well.
--
-- A local archive commit removes state.tournament and appends the completed
-- event to state.tournamentHistory. The first local normalizer intentionally
-- handled only the live tournament, leaving public_tournaments marked live
-- after a correct durable archive. This wrapper reuses the same row builder
-- for every archived tournament and then seals both parent rows as archived.

create or replace function public.flbp_local_sync_full_normalized_internal(
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
  v_live_result jsonb;
  v_archived jsonb;
  v_archived_state jsonb;
  v_matches jsonb;
  v_tournament_id text;
  v_archived_count integer := 0;
begin
  v_live_result := public.flbp_local_sync_live_normalized_internal(v_workspace_id, v_state);

  if jsonb_typeof(v_state -> 'tournamentHistory') = 'array' then
    for v_archived in
      select value from jsonb_array_elements(v_state -> 'tournamentHistory')
    loop
      v_tournament_id := nullif(trim(coalesce(v_archived ->> 'id', '')), '');
      if v_tournament_id is null then continue; end if;

      v_matches := case
        when jsonb_typeof(v_archived -> 'matches') = 'array'
          and jsonb_array_length(v_archived -> 'matches') > 0
          then v_archived -> 'matches'
        when jsonb_typeof(v_archived -> 'rounds') = 'array'
          then jsonb_path_query_array(v_archived, '$.rounds[*][*]')
        else '[]'::jsonb
      end;

      v_archived_state := jsonb_set(v_state, '{tournament}', v_archived, true);
      v_archived_state := jsonb_set(v_archived_state, '{tournamentMatches}', v_matches, true);
      perform public.flbp_local_sync_live_normalized_internal(v_workspace_id, v_archived_state);

      update public.tournaments
      set status = 'archived', updated_at = now()
      where workspace_id = v_workspace_id and id = v_tournament_id;

      update public.public_tournaments
      set status = 'archived', updated_at = now()
      where workspace_id = v_workspace_id and id = v_tournament_id;

      v_archived_count := v_archived_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'live', v_live_result,
    'archived_tournaments', v_archived_count
  );
end;
$$;

revoke all on function public.flbp_local_sync_full_normalized_internal(text, jsonb) from public, anon, authenticated;

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
  return public.flbp_local_sync_full_normalized_internal(v_workspace_id, p_state);
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

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb)) as op(value)
    where coalesce(op.value ->> 'operation_kind', '') <> 'match-result'
  ) into v_full_sync;

  if v_full_sync then
    return v_result || public.flbp_local_sync_full_normalized_internal(p_workspace_id, p_state);
  end if;

  if v_tournament_id is null then
    return v_result || jsonb_build_object('normalized_matches', 0, 'normalized_skipped', 'no_live_tournament');
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
