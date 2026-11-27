-- Local mode never removed the normalized rows of a tournament that left the
-- state. The local server rebuilds the private and public tournament tables
-- from its state, but only by upserting: a tournament deleted from the
-- history, or a live tournament cancelled, kept its rows and its public detail
-- (tournament, teams, groups, matches, statistics) even after the return to
-- cloud. The cloud rebuild already removes them (pushNormalizedFromState).
--
-- After every full rebuild (archive or history change, workspace snapshot,
-- last rebuild before the return to cloud) and every live rebuild (a live
-- tournament started, changed or cancelled), rows of tournaments that are
-- neither the live one nor in the history are now deleted; their children
-- follow through the foreign keys. Kept: the Fanta pre-tournament container,
-- and a private row that still holds Fanta teams (fanta_teams references it
-- ON DELETE CASCADE; "Annulla torneo live" moves them back first). A state
-- without a readable history, or with no tournament at all, removes nothing.

create or replace function public.flbp_local_prune_tournaments_outside_state_internal(
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
  v_keep text[];
  v_public integer := 0;
  v_private integer := 0;
  v_kept_with_fanta integer := 0;
begin
  if coalesce(jsonb_typeof(v_state -> 'tournamentHistory'), '') <> 'array' then
    return jsonb_build_object('skipped', 'no_history');
  end if;

  select coalesce(array_agg(distinct ids.id), '{}'::text[]) into v_keep
  from (
    select nullif(trim(coalesce(v_state #>> '{tournament,id}', '')), '') as id
    union all
    select nullif(trim(coalesce(h.item ->> 'id', '')), '')
    from jsonb_array_elements(v_state -> 'tournamentHistory') as h(item)
  ) as ids
  where ids.id is not null;

  if cardinality(v_keep) = 0 then
    return jsonb_build_object('skipped', 'no_tournaments');
  end if;
  v_keep := array_append(v_keep, '__pre_tournament__');

  delete from public.public_tournaments p
  where p.workspace_id = v_workspace_id
    and not (p.id = any(v_keep));
  get diagnostics v_public = row_count;

  delete from public.tournaments t
  where t.workspace_id = v_workspace_id
    and not (t.id = any(v_keep))
    and not exists (
      select 1 from public.fanta_teams f
      where f.workspace_id = t.workspace_id and f.tournament_id = t.id
    );
  get diagnostics v_private = row_count;

  select count(*) into v_kept_with_fanta
  from public.tournaments t
  where t.workspace_id = v_workspace_id
    and not (t.id = any(v_keep));

  return jsonb_build_object(
    'public_tournaments', v_public,
    'tournaments', v_private,
    'kept_with_fanta', v_kept_with_fanta
  );
end;
$$;

revoke all on function public.flbp_local_prune_tournaments_outside_state_internal(text, jsonb) from public, anon, authenticated;

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
  v_fanta_count integer := 0;
  v_hof_count integer := 0;
  v_pruned jsonb;
begin
  v_live_result := public.flbp_local_sync_live_normalized_internal(v_workspace_id, v_state);

  if jsonb_typeof(v_state -> 'tournamentHistory') = 'array' then
    for v_archived in select value from jsonb_array_elements(v_state -> 'tournamentHistory')
    loop
      v_tournament_id := nullif(trim(coalesce(v_archived ->> 'id', '')), '');
      if v_tournament_id is null then continue; end if;
      v_matches := case
        when jsonb_typeof(v_archived -> 'matches') = 'array'
          and jsonb_array_length(v_archived -> 'matches') > 0 then v_archived -> 'matches'
        when jsonb_typeof(v_archived -> 'rounds') = 'array'
          then jsonb_path_query_array(v_archived, '$.rounds[*][*]')
        else '[]'::jsonb
      end;
      v_archived_state := jsonb_set(v_state, '{tournament}', v_archived, true);
      v_archived_state := jsonb_set(v_archived_state, '{tournamentMatches}', v_matches, true);
      perform public.flbp_local_sync_live_normalized_internal(v_workspace_id, v_archived_state);
      update public.tournaments set status = 'archived', updated_at = now()
      where workspace_id = v_workspace_id and id = v_tournament_id;
      update public.public_tournaments set status = 'archived', updated_at = now()
      where workspace_id = v_workspace_id and id = v_tournament_id;
      v_archived_count := v_archived_count + 1;
    end loop;
  end if;

  v_hof_count := public.flbp_local_sync_hof_internal(v_workspace_id, v_state);

  if jsonb_typeof(v_state -> 'tournamentHistory') = 'array' then
    for v_archived in select value from jsonb_array_elements(v_state -> 'tournamentHistory')
    loop
      v_tournament_id := nullif(trim(coalesce(v_archived ->> 'id', '')), '');
      if v_tournament_id is not null
        and public.flbp_local_refresh_archived_fanta_internal(v_workspace_id, v_tournament_id)
      then
        v_fanta_count := v_fanta_count + 1;
      end if;
    end loop;
  end if;

  v_pruned := public.flbp_local_prune_tournaments_outside_state_internal(v_workspace_id, v_state);

  return jsonb_build_object(
    'ok', true,
    'live', v_live_result,
    'archived_tournaments', v_archived_count,
    'hall_of_fame', v_hof_count,
    'fanta_archives', v_fanta_count,
    'pruned', v_pruned
  );
end;
$$;

revoke all on function public.flbp_local_sync_full_normalized_internal(text, jsonb) from public, anon, authenticated;

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
      'normalized_live', public.flbp_local_sync_live_normalized_internal(p_workspace_id, p_state),
      'normalized_pruned', public.flbp_local_prune_tournaments_outside_state_internal(p_workspace_id, p_state)
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
