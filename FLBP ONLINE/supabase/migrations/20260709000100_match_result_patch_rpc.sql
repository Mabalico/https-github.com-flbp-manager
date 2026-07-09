-- FLBP Manager Suite - atomic per-match report writes
--
-- Saves live reports without rewriting the whole workspace_state document.
-- The public/admin entrypoints below accept a JSONB array of changed matches:
-- the report match plus any downstream bracket matches already recalculated by
-- the client. Winner propagation remains app-side.

alter table if exists public.tournament_matches
  add column if not exists referee_report_audit jsonb;
alter table if exists public.tournament_matches
  add column if not exists referee_report_final_id text;
alter table if exists public.tournament_matches
  add column if not exists referee_report_source text;
alter table if exists public.tournament_matches
  add column if not exists referee_report_author_name text;
alter table if exists public.tournament_matches
  add column if not exists referee_report_saved_at timestamptz;

alter table if exists public.public_tournament_matches
  add column if not exists referee_report_audit jsonb;
alter table if exists public.public_tournament_matches
  add column if not exists referee_report_final_id text;
alter table if exists public.public_tournament_matches
  add column if not exists referee_report_source text;
alter table if exists public.public_tournament_matches
  add column if not exists referee_report_author_name text;
alter table if exists public.public_tournament_matches
  add column if not exists referee_report_saved_at timestamptz;

create or replace function public.flbp_match_result_parse_timestamptz(p_value text)
returns timestamptz
language plpgsql
set search_path = public
as $$
begin
  return nullif(trim(coalesce(p_value, '')), '')::timestamptz;
exception when others then
  return null;
end;
$$;

revoke all on function public.flbp_match_result_parse_timestamptz(text) from public;

create or replace function public.flbp_match_result_patch_flat_array(
  p_array jsonb,
  p_match jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_found boolean := false;
  v_match_id text := coalesce(p_match ->> 'id', '');
begin
  if jsonb_typeof(p_array) <> 'array' or v_match_id = '' then
    return jsonb_build_object('array', p_array, 'found', false);
  end if;

  for v_item in select elem.value from jsonb_array_elements(p_array) as elem(value)
  loop
    if coalesce(v_item ->> 'id', '') = v_match_id then
      v_out := v_out || jsonb_build_array(p_match);
      v_found := true;
    else
      v_out := v_out || jsonb_build_array(v_item);
    end if;
  end loop;

  return jsonb_build_object('array', v_out, 'found', v_found);
end;
$$;

revoke all on function public.flbp_match_result_patch_flat_array(jsonb, jsonb) from public;

create or replace function public.flbp_match_result_find_match(
  p_state jsonb,
  p_match_id text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_match jsonb;
begin
  if nullif(trim(coalesce(p_match_id, '')), '') is null then
    return null;
  end if;

  select value
  into v_match
  from jsonb_array_elements(coalesce(p_state -> 'tournamentMatches', '[]'::jsonb)) as elem(value)
  where elem.value ->> 'id' = p_match_id
  limit 1;

  if v_match is not null then
    return v_match;
  end if;

  select value
  into v_match
  from jsonb_array_elements(coalesce(p_state #> '{tournament,matches}', '[]'::jsonb)) as elem(value)
  where elem.value ->> 'id' = p_match_id
  limit 1;

  if v_match is not null then
    return v_match;
  end if;

  select match_value
  into v_match
  from jsonb_array_elements(coalesce(p_state #> '{tournament,rounds}', '[]'::jsonb)) as round_elem(round_value),
       jsonb_array_elements(case when jsonb_typeof(round_elem.round_value) = 'array' then round_elem.round_value else '[]'::jsonb end) as match_elem(match_value)
  where match_elem.match_value ->> 'id' = p_match_id
  limit 1;

  return v_match;
end;
$$;

revoke all on function public.flbp_match_result_find_match(jsonb, text) from public;

create or replace function public.flbp_match_result_patch_state(
  p_state jsonb,
  p_match jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_next jsonb := coalesce(p_state, '{}'::jsonb);
  v_patch jsonb;
  v_found boolean := false;
  v_any_found boolean := false;
  v_rounds jsonb;
  v_round jsonb;
  v_round_index int;
begin
  if nullif(trim(coalesce(p_match ->> 'id', '')), '') is null then
    raise exception 'Match senza id nella patch referto';
  end if;

  v_patch := public.flbp_match_result_patch_flat_array(coalesce(v_next -> 'tournamentMatches', '[]'::jsonb), p_match);
  v_found := coalesce((v_patch ->> 'found')::boolean, false);
  v_any_found := v_any_found or v_found;
  if v_found or (v_next ? 'tournamentMatches') then
    v_next := jsonb_set(v_next, '{tournamentMatches}', v_patch -> 'array', true);
  end if;

  v_patch := public.flbp_match_result_patch_flat_array(coalesce(v_next #> '{tournament,matches}', '[]'::jsonb), p_match);
  v_found := coalesce((v_patch ->> 'found')::boolean, false);
  v_any_found := v_any_found or v_found;
  if v_found or (v_next #> '{tournament,matches}') is not null then
    v_next := jsonb_set(v_next, '{tournament,matches}', v_patch -> 'array', true);
  end if;

  v_rounds := coalesce(v_next #> '{tournament,rounds}', '[]'::jsonb);
  if jsonb_typeof(v_rounds) = 'array' then
    v_round_index := 0;
    for v_round in select elem.value from jsonb_array_elements(v_rounds) as elem(value)
    loop
      v_patch := public.flbp_match_result_patch_flat_array(v_round, p_match);
      v_found := coalesce((v_patch ->> 'found')::boolean, false);
      if v_found then
        v_rounds := jsonb_set(v_rounds, array[v_round_index::text], v_patch -> 'array', false);
        v_any_found := true;
      end if;
      v_round_index := v_round_index + 1;
    end loop;
    if (v_next #> '{tournament,rounds}') is not null then
      v_next := jsonb_set(v_next, '{tournament,rounds}', v_rounds, true);
    end if;
  end if;

  if not v_any_found then
    raise exception 'Match % non trovato nello snapshot live', p_match ->> 'id';
  end if;

  return v_next;
end;
$$;

revoke all on function public.flbp_match_result_patch_state(jsonb, jsonb) from public;

create or replace function public.flbp_match_result_player_key(
  p_state jsonb,
  p_team_id text,
  p_player_name text
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_team jsonb;
  v_name text := trim(coalesce(p_player_name, ''));
  v_suffix text := 'ND';
  v_key text;
  v_next text;
  v_seen text[] := array[]::text[];
  v_i int;
begin
  if v_name = '' then
    return null;
  end if;

  select value
  into v_team
  from jsonb_array_elements(coalesce(p_state #> '{tournament,teams}', '[]'::jsonb)) as elem(value)
  where elem.value ->> 'id' = p_team_id
  limit 1;

  if v_team is not null then
    if trim(coalesce(v_team ->> 'player1', '')) = v_name then
      v_suffix := coalesce(nullif(trim(coalesce(v_team ->> 'player1BirthDate', '')), ''), 'ND');
    elsif trim(coalesce(v_team ->> 'player2', '')) = v_name then
      v_suffix := coalesce(nullif(trim(coalesce(v_team ->> 'player2BirthDate', '')), ''), 'ND');
    end if;
  end if;

  if v_suffix !~ '^\d{4}-\d{2}-\d{2}$' then
    v_suffix := 'ND';
  end if;

  v_key := regexp_replace(lower(v_name), '\s+', '_', 'g') || '_' || v_suffix;

  for v_i in 1..20 loop
    exit when v_key = any(v_seen);
    v_seen := array_append(v_seen, v_key);
    v_next := nullif(trim(coalesce(p_state -> 'playerAliases' ->> v_key, '')), '');
    exit when v_next is null;
    v_key := v_next;
  end loop;

  return v_key;
end;
$$;

revoke all on function public.flbp_match_result_player_key(jsonb, text, text) from public;

create or replace function public.flbp_match_result_upsert_rows(
  p_workspace_id text,
  p_tournament_id text,
  p_state jsonb,
  p_match jsonb,
  p_updated_at timestamptz
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_tournament jsonb := coalesce(p_state -> 'tournament', '{}'::jsonb);
  v_match_id text := nullif(trim(coalesce(p_match ->> 'id', '')), '');
  v_phase text := coalesce(nullif(p_match ->> 'phase', ''), case when nullif(p_match ->> 'groupName', '') is null then 'bracket' else 'groups' end);
  v_status text := coalesce(nullif(p_match ->> 'status', ''), 'scheduled');
  v_next_slot text := nullif(p_match ->> 'nextSlot', '');
  v_team_a_id text := nullif(p_match ->> 'teamAId', '');
  v_team_b_id text := nullif(p_match ->> 'teamBId', '');
  v_score_a int := 0;
  v_score_b int := 0;
  v_round int;
  v_order_index int;
  v_played boolean := false;
  v_is_bye boolean := false;
  v_hidden boolean := false;
  v_saved_at timestamptz;
  v_stat jsonb;
  v_team_id text;
  v_player_name text;
  v_canestri int;
  v_soffi int;
  v_player_key text;
begin
  if v_match_id is null then
    raise exception 'Match senza id nella patch referto';
  end if;

  if v_phase not in ('groups', 'bracket') then
    v_phase := 'bracket';
  end if;
  if v_status not in ('scheduled', 'playing', 'finished') then
    v_status := 'scheduled';
  end if;
  if v_next_slot not in ('A', 'B') then
    v_next_slot := null;
  end if;
  if coalesce(p_match ->> 'scoreA', '') ~ '^-?\d+$' then
    v_score_a := (p_match ->> 'scoreA')::int;
  end if;
  if coalesce(p_match ->> 'scoreB', '') ~ '^-?\d+$' then
    v_score_b := (p_match ->> 'scoreB')::int;
  end if;
  if coalesce(p_match ->> 'round', '') ~ '^-?\d+$' then
    v_round := (p_match ->> 'round')::int;
  end if;
  if coalesce(p_match ->> 'orderIndex', '') ~ '^-?\d+$' then
    v_order_index := (p_match ->> 'orderIndex')::int;
  end if;

  v_played := lower(coalesce(p_match ->> 'played', 'false')) in ('true', 't', '1');
  v_is_bye := lower(coalesce(p_match ->> 'isBye', 'false')) in ('true', 't', '1')
    or v_team_a_id = 'BYE'
    or v_team_b_id = 'BYE';
  v_hidden := case
    when v_is_bye then true
    else lower(coalesce(p_match ->> 'hidden', 'false')) in ('true', 't', '1')
  end;
  v_saved_at := public.flbp_match_result_parse_timestamptz(p_match ->> 'refereeReportSavedAt');

  insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
  values (
    p_workspace_id,
    p_tournament_id,
    coalesce(nullif(v_tournament ->> 'name', ''), p_tournament_id),
    coalesce(public.flbp_match_result_parse_timestamptz(v_tournament ->> 'startDate'), p_updated_at),
    case when v_tournament ->> 'type' in ('elimination', 'groups_elimination') then v_tournament ->> 'type' else 'elimination' end,
    coalesce(v_tournament -> 'config', '{}'::jsonb),
    lower(coalesce(v_tournament ->> 'isManual', 'false')) in ('true', 't', '1'),
    'live',
    p_updated_at
  )
  on conflict (workspace_id, id) do update
  set name = excluded.name,
      start_date = excluded.start_date,
      type = excluded.type,
      config = excluded.config,
      is_manual = excluded.is_manual,
      status = excluded.status,
      updated_at = excluded.updated_at;

  insert into public.public_tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
  values (
    p_workspace_id,
    p_tournament_id,
    coalesce(nullif(v_tournament ->> 'name', ''), p_tournament_id),
    coalesce(public.flbp_match_result_parse_timestamptz(v_tournament ->> 'startDate'), p_updated_at),
    case when v_tournament ->> 'type' in ('elimination', 'groups_elimination') then v_tournament ->> 'type' else 'elimination' end,
    coalesce(v_tournament -> 'config', '{}'::jsonb),
    lower(coalesce(v_tournament ->> 'isManual', 'false')) in ('true', 't', '1'),
    'live',
    p_updated_at
  )
  on conflict (workspace_id, id) do update
  set name = excluded.name,
      start_date = excluded.start_date,
      type = excluded.type,
      config = excluded.config,
      is_manual = excluded.is_manual,
      status = excluded.status,
      updated_at = excluded.updated_at;

  insert into public.tournament_matches (
    workspace_id, tournament_id, id, code, phase, status, played, score_a, score_b,
    team_a_id, team_b_id, next_match_id, next_slot, round, round_name, group_name,
    order_index, hidden, is_bye, referee_report_audit, referee_report_final_id,
    referee_report_source, referee_report_author_name, referee_report_saved_at, updated_at
  )
  values (
    p_workspace_id, p_tournament_id, v_match_id, nullif(p_match ->> 'code', ''),
    v_phase, v_status, v_played, v_score_a, v_score_b, v_team_a_id, v_team_b_id,
    nullif(p_match ->> 'nextMatchId', ''), v_next_slot, v_round,
    nullif(p_match ->> 'roundName', ''), nullif(p_match ->> 'groupName', ''),
    v_order_index, v_hidden, v_is_bye, p_match -> 'refereeReportAudit',
    nullif(p_match ->> 'refereeReportFinalId', ''), nullif(p_match ->> 'refereeReportSource', ''),
    nullif(p_match ->> 'refereeReportAuthorName', ''), v_saved_at, p_updated_at
  )
  on conflict (workspace_id, tournament_id, id) do update
  set code = excluded.code,
      phase = excluded.phase,
      status = excluded.status,
      played = excluded.played,
      score_a = excluded.score_a,
      score_b = excluded.score_b,
      team_a_id = excluded.team_a_id,
      team_b_id = excluded.team_b_id,
      next_match_id = excluded.next_match_id,
      next_slot = excluded.next_slot,
      round = excluded.round,
      round_name = excluded.round_name,
      group_name = excluded.group_name,
      order_index = excluded.order_index,
      hidden = excluded.hidden,
      is_bye = excluded.is_bye,
      referee_report_audit = excluded.referee_report_audit,
      referee_report_final_id = excluded.referee_report_final_id,
      referee_report_source = excluded.referee_report_source,
      referee_report_author_name = excluded.referee_report_author_name,
      referee_report_saved_at = excluded.referee_report_saved_at,
      updated_at = excluded.updated_at;

  insert into public.public_tournament_matches (
    workspace_id, tournament_id, id, code, phase, status, played, score_a, score_b,
    team_a_id, team_b_id, next_match_id, next_slot, round, round_name, group_name,
    order_index, hidden, is_bye, referee_report_audit, referee_report_final_id,
    referee_report_source, referee_report_author_name, referee_report_saved_at, updated_at
  )
  values (
    p_workspace_id, p_tournament_id, v_match_id, nullif(p_match ->> 'code', ''),
    v_phase, v_status, v_played, v_score_a, v_score_b, v_team_a_id, v_team_b_id,
    nullif(p_match ->> 'nextMatchId', ''), v_next_slot, v_round,
    nullif(p_match ->> 'roundName', ''), nullif(p_match ->> 'groupName', ''),
    v_order_index, v_hidden, v_is_bye, p_match -> 'refereeReportAudit',
    nullif(p_match ->> 'refereeReportFinalId', ''), nullif(p_match ->> 'refereeReportSource', ''),
    nullif(p_match ->> 'refereeReportAuthorName', ''), v_saved_at, p_updated_at
  )
  on conflict (workspace_id, tournament_id, id) do update
  set code = excluded.code,
      phase = excluded.phase,
      status = excluded.status,
      played = excluded.played,
      score_a = excluded.score_a,
      score_b = excluded.score_b,
      team_a_id = excluded.team_a_id,
      team_b_id = excluded.team_b_id,
      next_match_id = excluded.next_match_id,
      next_slot = excluded.next_slot,
      round = excluded.round,
      round_name = excluded.round_name,
      group_name = excluded.group_name,
      order_index = excluded.order_index,
      hidden = excluded.hidden,
      is_bye = excluded.is_bye,
      referee_report_audit = excluded.referee_report_audit,
      referee_report_final_id = excluded.referee_report_final_id,
      referee_report_source = excluded.referee_report_source,
      referee_report_author_name = excluded.referee_report_author_name,
      referee_report_saved_at = excluded.referee_report_saved_at,
      updated_at = excluded.updated_at;

  delete from public.tournament_match_stats
  where workspace_id = p_workspace_id
    and tournament_id = p_tournament_id
    and match_id = v_match_id;

  delete from public.public_tournament_match_stats
  where workspace_id = p_workspace_id
    and tournament_id = p_tournament_id
    and match_id = v_match_id;

  if jsonb_typeof(p_match -> 'stats') = 'array' then
    for v_stat in select elem.value from jsonb_array_elements(p_match -> 'stats') as elem(value)
    loop
      v_team_id := nullif(trim(coalesce(v_stat ->> 'teamId', '')), '');
      v_player_name := nullif(trim(coalesce(v_stat ->> 'playerName', '')), '');
      if v_team_id is null or v_player_name is null then
        continue;
      end if;

      v_canestri := case when coalesce(v_stat ->> 'canestri', '') ~ '^-?\d+$' then (v_stat ->> 'canestri')::int else 0 end;
      v_soffi := case when coalesce(v_stat ->> 'soffi', '') ~ '^-?\d+$' then (v_stat ->> 'soffi')::int else 0 end;
      v_player_key := public.flbp_match_result_player_key(p_state, v_team_id, v_player_name);

      insert into public.tournament_match_stats (
        workspace_id, tournament_id, match_id, team_id, player_name, canestri, soffi, player_key
      )
      values (
        p_workspace_id, p_tournament_id, v_match_id, v_team_id, v_player_name, v_canestri, v_soffi, v_player_key
      )
      on conflict (workspace_id, tournament_id, match_id, team_id, player_name) do update
      set canestri = excluded.canestri,
          soffi = excluded.soffi,
          player_key = excluded.player_key;

      insert into public.public_tournament_match_stats (
        workspace_id, tournament_id, match_id, team_id, player_name, canestri, soffi
      )
      values (
        p_workspace_id, p_tournament_id, v_match_id, v_team_id, v_player_name, v_canestri, v_soffi
      )
      on conflict (workspace_id, tournament_id, match_id, team_id, player_name) do update
      set canestri = excluded.canestri,
          soffi = excluded.soffi;
    end loop;
  end if;
end;
$$;

revoke all on function public.flbp_match_result_upsert_rows(text, text, jsonb, jsonb, timestamptz) from public;

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
begin
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
      raise exception 'Match % non trovato nello snapshot live', v_item_id;
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

  for v_match in select elem.value from jsonb_array_elements(v_matches) as elem(value)
  loop
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

  return jsonb_build_object(
    'ok', true,
    'updated_at', v_next_updated_at,
    'matches_count', jsonb_array_length(v_matches)
  );
end;
$$;

revoke all on function public.flbp_apply_match_result_patch(text, text, text, jsonb) from public;

create or replace function public.flbp_admin_push_match_result(
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
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  return public.flbp_apply_match_result_patch(p_workspace_id, p_tournament_id, p_match_id, p_matches);
end;
$$;

grant execute on function public.flbp_admin_push_match_result(text, text, text, jsonb) to authenticated;

create or replace function public.flbp_referee_push_match_result(
  p_workspace_id text,
  p_tournament_id text,
  p_match_id text,
  p_referees_password text,
  p_matches jsonb,
  p_auth_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_tournament_id text;
  v_expected_password text;
  v_auth_version text;
  v_out jsonb;
begin
  select ws.state
  into v_state
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  limit 1;

  if v_state is null then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'workspace_missing', null);
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_tournament_id := coalesce(v_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'tournament_mismatch', null);
    raise exception 'Torneo live non corrispondente';
  end if;

  v_auth_version := nullif(v_state -> 'tournament' ->> 'refereesAuthVersion', '');
  v_expected_password := coalesce(v_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'no_config', v_auth_version);
    raise exception 'Accesso arbitri non configurato per questo torneo';
  end if;

  if public.flbp_referee_auth_is_rate_limited(p_workspace_id, p_tournament_id) then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'rate_limited', v_auth_version);
    raise exception 'Troppi tentativi arbitri non riusciti: attendi qualche minuto e riprova';
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'bad_password', v_auth_version);
    raise exception 'Password arbitri non valida';
  end if;

  if nullif(trim(coalesce(p_auth_version, '')), '') is not null
    and v_auth_version is not null
    and nullif(trim(coalesce(p_auth_version, '')), '') <> v_auth_version
  then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'auth_version_mismatch', v_auth_version);
    raise exception 'Sessione arbitro non aggiornata: effettua di nuovo il login arbitri';
  end if;

  v_out := public.flbp_apply_match_result_patch(p_workspace_id, p_tournament_id, p_match_id, p_matches);
  perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', true, 'ok', v_auth_version);

  return v_out || jsonb_build_object('auth_version', v_auth_version);
exception when others then
  if sqlerrm like 'FLBP_DB_CONFLICT:%' then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_match_result', false, 'conflict', v_auth_version);
  end if;
  raise;
end;
$$;

grant execute on function public.flbp_referee_push_match_result(text, text, text, text, jsonb, text) to anon, authenticated;
