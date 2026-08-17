-- Keep the local operation journal durable without rebuilding every
-- normalized tournament/archive table for unrelated Admin changes.
--
-- Match reports continue to use the existing per-match upsert. Structural
-- live-tournament changes refresh only the live projection. Archive changes
-- still perform the full archive/Hall of Fame/Fanta rebuild. Changes to the
-- pre-tournament team catalog and other unrelated AppState roots are journaled
-- and published through the compact public live row, but do not churn the
-- normalized tournament tables.

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
  v_patch jsonb;
  v_match jsonb;
  v_root text;
  v_tournament_id text := nullif(trim(coalesce(p_state #>> '{tournament,id}', '')), '');
  v_updated integer := 0;
  v_need_full_sync boolean := false;
  v_need_live_sync boolean := false;
  v_need_hof_sync boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;

  v_result := public.flbp_local_append_operations(
    p_workspace_id, p_node_id, p_epoch, p_operations
  );

  for v_entry in
    select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb))
  loop
    if coalesce(v_entry ->> 'operation_kind', '') = 'workspace-snapshot' then
      v_need_full_sync := true;
      continue;
    end if;

    if coalesce(v_entry ->> 'operation_kind', '') <> 'state-patch' then
      continue;
    end if;

    if jsonb_typeof(v_entry #> '{payload,statePatch}') <> 'array' then
      v_need_full_sync := true;
      continue;
    end if;

    for v_patch in
      select value from jsonb_array_elements(v_entry #> '{payload,statePatch}')
    loop
      if jsonb_typeof(v_patch -> 'path') <> 'array'
        or jsonb_array_length(v_patch -> 'path') = 0
      then
        v_need_full_sync := true;
        continue;
      end if;

      v_root := coalesce(v_patch #>> '{path,0}', '');
      if v_root = 'tournamentHistory' then
        v_need_full_sync := true;
      elsif v_root in ('tournament', 'tournamentMatches') then
        v_need_live_sync := true;
      elsif v_root = 'hallOfFame' then
        v_need_hof_sync := true;
      end if;
    end loop;
  end loop;

  if v_need_full_sync then
    return v_result
      || jsonb_build_object('normalized_mode', 'full')
      || public.flbp_local_sync_full_normalized_internal(p_workspace_id, p_state);
  end if;

  if v_need_live_sync then
    v_result := v_result || jsonb_build_object(
      'normalized_mode', 'live',
      'normalized_live', public.flbp_local_sync_live_normalized_internal(p_workspace_id, p_state)
    );
  end if;

  if v_need_hof_sync then
    v_result := v_result || jsonb_build_object(
      'normalized_hall_of_fame', public.flbp_local_sync_hof_internal(p_workspace_id, p_state)
    );
  end if;

  -- A live refresh already consumed the current state, including any match
  -- results coalesced in the same batch. Otherwise keep the efficient
  -- per-match path used by referee and Admin report commits.
  if not v_need_live_sync and v_tournament_id is not null then
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
  end if;

  return v_result || jsonb_build_object(
    'normalized_matches', v_updated,
    'normalized_skipped', case
      when v_need_live_sync or v_need_hof_sync or v_updated > 0 then null
      else 'unrelated_state_patch'
    end
  );
end;
$$;

revoke all on function public.flbp_local_append_operations_v2(text, text, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.flbp_local_append_operations_v2(text, text, bigint, jsonb, jsonb) to service_role;
