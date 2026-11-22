-- Admin report saves may create the tie-break they make necessary.
--
-- Same rule as the referee entrypoint (flbp_report_validate_new_tiebreak,
-- 20261122000100). The active helper is the 20260709000200 definition plus the
-- data-plane advisory lock that 20260924000300 inserted by text
-- (A09_ADVISORY_BEFORE_WORKSPACE_ROW); both are kept. New tie-breaks join the
-- private and public live arrays before the regular patch writes them.

create or replace function public.flbp_apply_match_result_patch(
  p_workspace_id text,
  p_tournament_id text,
  p_match_id text,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_tournament_id text := nullif(trim(coalesce(p_tournament_id, '')), '');
  v_match_id text := nullif(trim(coalesce(p_match_id, '')), '');
  v_matches jsonb;
  v_match jsonb;
  v_item_id text;
  v_state jsonb;
  v_public_state jsonb;
  v_current_match jsonb;
  v_current_saved_at timestamptz;
  v_incoming_saved_at timestamptz;
  v_found_primary boolean := false;
  v_next_updated_at timestamptz := now();
  v_new_matches jsonb := '[]'::jsonb;
  v_new_ids text[] := '{}';
  v_new_groups text[] := '{}';
  v_clean jsonb;
begin
  -- A09_ADVISORY_BEFORE_WORKSPACE_ROW
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || nullif(trim(coalesce(p_workspace_id, '')), '')));
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;
  if v_tournament_id is null then
    raise exception 'Torneo live non valido';
  end if;
  if v_match_id is null then
    raise exception 'Match referto non valido';
  end if;

  v_matches := case
    when jsonb_typeof(p_matches) = 'array' then p_matches
    when jsonb_typeof(p_matches) = 'object' then jsonb_build_array(p_matches)
    else '[]'::jsonb
  end;
  if jsonb_array_length(v_matches) = 0 then
    raise exception 'Nessun match nella patch referto';
  end if;

  select ws.state
  into v_state
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  for update;

  if v_state is null then
    raise exception 'Workspace snapshot non trovato';
  end if;
  if coalesce(v_state -> 'tournament' ->> 'id', '') <> v_tournament_id then
    raise exception 'Torneo live non corrispondente';
  end if;

  select pws.state
  into v_public_state
  from public.public_workspace_state pws
  where pws.workspace_id = v_workspace_id
  for update;

  if v_public_state is null then
    raise exception 'FLBP_MATCH_RESULT_PUBLIC_SNAPSHOT_STALE: snapshot pubblico non trovato';
  end if;

  for v_match in select elem.value from jsonb_array_elements(v_matches) as elem(value)
  loop
    v_item_id := nullif(trim(coalesce(v_match ->> 'id', '')), '');
    if v_item_id is null then
      raise exception 'Match senza id nella patch referto';
    end if;
    if v_item_id = v_match_id then
      v_found_primary := true;
    end if;

    v_current_match := public.flbp_match_result_find_match(v_state, v_item_id);
    if v_current_match is null then
      -- A report save may create the tie-break it makes necessary (group TB or
      -- final FTB). The reported match itself must already exist.
      if v_item_id = v_match_id or v_item_id = any(v_new_ids) then
        raise exception 'Match % non trovato nello snapshot live', v_item_id;
      end if;
      v_clean := public.flbp_report_validate_new_tiebreak(v_state, v_matches, v_match);
      if (v_clean ->> 'groupName') = any(v_new_groups) then
        raise exception 'Creazione partita non autorizzata: un solo spareggio nuovo per girone';
      end if;
      v_new_ids := array_append(v_new_ids, v_item_id);
      v_new_groups := array_append(v_new_groups, v_clean ->> 'groupName');
      v_new_matches := v_new_matches || jsonb_build_array(v_clean);
      continue;
    end if;

    v_current_saved_at := public.flbp_match_result_parse_timestamptz(v_current_match ->> 'refereeReportSavedAt');
    v_incoming_saved_at := public.flbp_match_result_parse_timestamptz(v_match ->> 'refereeReportSavedAt');
    if v_current_saved_at is not null
      and (v_incoming_saved_at is null or v_current_saved_at > v_incoming_saved_at)
    then
      raise exception 'FLBP_DB_CONFLICT: il DB contiene un referto piu'' recente per questa partita'
        using detail = jsonb_build_object('match_id', v_item_id, 'current_match', v_current_match)::text;
    end if;
  end loop;

  if not v_found_primary then
    raise exception 'La patch referto non contiene il match principale %', v_match_id;
  end if;

  -- Tie-breaks created by this save join the live arrays first; the regular
  -- patch below then writes them like any other match.
  if jsonb_array_length(v_new_matches) > 0 then
    v_state := public.flbp_report_append_new_matches(v_state, v_new_matches);
    v_public_state := public.flbp_report_append_new_matches(v_public_state, v_new_matches);
  end if;

  for v_match in select elem.value from jsonb_array_elements(v_matches) as elem(value)
  loop
    if nullif(trim(coalesce(v_match ->> 'id', '')), '') = any(v_new_ids) then
      -- Write the validated copy, never the caller's extra fields.
      select elem.value into v_match
      from jsonb_array_elements(v_new_matches) as elem(value)
      where elem.value ->> 'id' = nullif(trim(coalesce(v_match ->> 'id', '')), '')
      limit 1;
    end if;
    v_state := public.flbp_match_result_patch_state(v_state, v_match);
    begin
      v_public_state := public.flbp_match_result_patch_state(v_public_state, v_match);
    exception when others then
      raise exception 'FLBP_MATCH_RESULT_PUBLIC_SNAPSHOT_STALE: snapshot pubblico non allineato';
    end;
    perform public.flbp_match_result_upsert_rows(v_workspace_id, v_tournament_id, v_state, v_match, v_next_updated_at);
  end loop;

  update public.workspace_state
  set state = v_state,
      updated_at = v_next_updated_at
  where workspace_id = v_workspace_id;

  update public.public_workspace_state
  set state = v_public_state,
      updated_at = v_next_updated_at
  where workspace_id = v_workspace_id;

  perform public.flbp_upsert_public_workspace_live(v_workspace_id, v_public_state, v_next_updated_at);

  return jsonb_build_object(
    'ok', true,
    'updated_at', v_next_updated_at,
    'matches_count', jsonb_array_length(v_matches),
    'created_matches', jsonb_array_length(v_new_matches)
  );
end;
$$;

revoke all on function public.flbp_apply_match_result_patch(text, text, text, jsonb) from public, anon, authenticated;
