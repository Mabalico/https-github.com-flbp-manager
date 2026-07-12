-- Bundle rollout 2026-07-09: rework sync + simulatore
-- Applica in ordine le 3 migration non ancora presenti nel progetto reale:
--   1) 20260709000100_match_result_patch_rpc.sql (referti per-match atomici)
--   2) 20260709000200_public_workspace_live.sql (documento live pubblico)
--   3) 20260709000300_sim_seed_fanta_pretournament.sql (seed fanta per simulazioni)
-- Idempotente: sicuro da rieseguire.

-- ============ 1/3: match_result_patch_rpc ============
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

-- ============ 2/3: public_workspace_live ============
-- FLBP Manager Suite - small public live workspace document
--
-- public_workspace_state remains the backward-compatible full snapshot.
-- public_workspace_live stores only the public fields that change during live
-- tournaments, so polling clients do not re-download history/HOF/scorers.

create table if not exists public.public_workspace_live (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.public_workspace_live enable row level security;

drop policy if exists public_workspace_live_public_read on public.public_workspace_live;
create policy public_workspace_live_public_read
  on public.public_workspace_live
  for select
  to anon, authenticated
  using (true);

drop policy if exists public_workspace_live_admin_insert on public.public_workspace_live;
create policy public_workspace_live_admin_insert
  on public.public_workspace_live
  for insert
  to authenticated
  with check (public.flbp_is_admin());

drop policy if exists public_workspace_live_admin_update on public.public_workspace_live;
create policy public_workspace_live_admin_update
  on public.public_workspace_live
  for update
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists public_workspace_live_admin_delete on public.public_workspace_live;
create policy public_workspace_live_admin_delete
  on public.public_workspace_live
  for delete
  to authenticated
  using (public.flbp_is_admin());

grant select on public.public_workspace_live to anon, authenticated;
grant insert, update, delete on public.public_workspace_live to authenticated;

create or replace function public.flbp_public_live_sanitize_team(p_team jsonb)
returns jsonb
language sql
set search_path = public
as $$
  select case
    when jsonb_typeof(p_team) = 'object'
      then p_team - 'player1YoB' - 'player2YoB' - 'player1BirthDate' - 'player2BirthDate'
    else '{}'::jsonb
  end;
$$;

revoke all on function public.flbp_public_live_sanitize_team(jsonb) from public;

create or replace function public.flbp_public_live_sanitize_teams(p_teams jsonb)
returns jsonb
language sql
set search_path = public
as $$
  select coalesce(
    jsonb_agg(public.flbp_public_live_sanitize_team(elem.value)),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_teams) = 'array' then p_teams else '[]'::jsonb end
  ) as elem(value);
$$;

revoke all on function public.flbp_public_live_sanitize_teams(jsonb) from public;

create or replace function public.flbp_public_live_sanitize_tournament(p_tournament jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tournament jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_group jsonb;
begin
  if jsonb_typeof(p_tournament) <> 'object' then
    return null;
  end if;

  v_tournament := p_tournament - 'refereesPassword';

  if jsonb_typeof(v_tournament -> 'teams') = 'array' then
    v_tournament := jsonb_set(
      v_tournament,
      '{teams}',
      public.flbp_public_live_sanitize_teams(v_tournament -> 'teams'),
      true
    );
  end if;

  if jsonb_typeof(v_tournament -> 'groups') = 'array' then
    for v_group in
      select elem.value
      from jsonb_array_elements(v_tournament -> 'groups') as elem(value)
    loop
      if jsonb_typeof(v_group -> 'teams') = 'array' then
        v_group := jsonb_set(
          v_group,
          '{teams}',
          public.flbp_public_live_sanitize_teams(v_group -> 'teams'),
          true
        );
      end if;
      v_groups := v_groups || jsonb_build_array(v_group);
    end loop;
    v_tournament := jsonb_set(v_tournament, '{groups}', v_groups, true);
  end if;

  return v_tournament;
end;
$$;

revoke all on function public.flbp_public_live_sanitize_tournament(jsonb) from public;

create or replace function public.flbp_build_public_workspace_live_state(p_public_state jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_state jsonb := coalesce(p_public_state, '{}'::jsonb);
  v_live jsonb;
begin
  v_live := jsonb_build_object(
    '__schemaVersion', coalesce(v_state -> '__schemaVersion', '1'::jsonb),
    'teams', public.flbp_public_live_sanitize_teams(v_state -> 'teams'),
    'tournament', public.flbp_public_live_sanitize_tournament(v_state -> 'tournament'),
    'tournamentMatches',
      case
        when jsonb_typeof(v_state -> 'tournamentMatches') = 'array' then v_state -> 'tournamentMatches'
        else '[]'::jsonb
      end,
    'fantaSettings',
      case
        when jsonb_typeof(v_state -> 'fantaSettings') = 'object' then v_state -> 'fantaSettings'
        else null
      end
  );

  if coalesce(jsonb_typeof(v_state -> 'fantaSettings'), '') <> 'object' then
    v_live := v_live - 'fantaSettings';
  end if;

  return v_live;
end;
$$;

revoke all on function public.flbp_build_public_workspace_live_state(jsonb) from public;

create or replace function public.flbp_upsert_public_workspace_live(
  p_workspace_id text,
  p_public_state jsonb,
  p_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_updated_at timestamptz := coalesce(p_updated_at, now());
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  insert into public.public_workspace_live (workspace_id, state, updated_at)
  values (
    v_workspace_id,
    public.flbp_build_public_workspace_live_state(coalesce(p_public_state, '{}'::jsonb)),
    v_updated_at
  )
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.flbp_upsert_public_workspace_live(text, jsonb, timestamptz) from public;

insert into public.public_workspace_live (workspace_id, state, updated_at)
select
  pws.workspace_id,
  public.flbp_build_public_workspace_live_state(pws.state),
  pws.updated_at
from public.public_workspace_state pws
on conflict (workspace_id) do update
set state = excluded.state,
    updated_at = excluded.updated_at;

create or replace function public.flbp_admin_push_workspace_state(
  p_workspace_id text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_current_updated_at timestamptz;
  v_next_updated_at timestamptz := now();
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  select ws.updated_at
  into v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  for update;

  if not coalesce(p_force, false) and v_current_updated_at is not null then
    if p_base_updated_at is null then
      raise exception 'FLBP_DB_CONFLICT: il DB contiene gia'' uno snapshot admin piu'' recente'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;

    if v_current_updated_at is distinct from p_base_updated_at then
      raise exception 'FLBP_DB_CONFLICT: il DB e'' stato aggiornato da un altro admin'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;
  end if;

  insert into public.workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  perform public.flbp_upsert_public_workspace_live(v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at);

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean) to authenticated;

create or replace function public.flbp_referee_push_live_state(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_state jsonb;
  v_current_updated_at timestamptz;
  v_tournament_id text;
  v_expected_password text;
  v_auth_version text;
  v_public_state jsonb;
  v_next_updated_at timestamptz := now();
begin
  select ws.state, ws.updated_at
  into v_current_state, v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  for update;

  if v_current_state is null then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'workspace_missing', null);
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_tournament_id := coalesce(v_current_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'tournament_mismatch', null);
    raise exception 'Torneo live non corrispondente';
  end if;

  v_auth_version := nullif(v_current_state -> 'tournament' ->> 'refereesAuthVersion', '');
  v_expected_password := coalesce(v_current_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'no_config', v_auth_version);
    raise exception 'Accesso arbitri non configurato per questo torneo';
  end if;

  if public.flbp_referee_auth_is_rate_limited(p_workspace_id, p_tournament_id) then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'rate_limited', v_auth_version);
    raise exception 'Troppi tentativi arbitri non riusciti: attendi qualche minuto e riprova';
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'bad_password', v_auth_version);
    raise exception 'Password arbitri non valida';
  end if;

  if p_base_updated_at is not null and v_current_updated_at is distinct from p_base_updated_at then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'conflict', v_auth_version);
    raise exception 'FLBP_DB_CONFLICT: il torneo live e'' stato aggiornato da un altro dispositivo';
  end if;

  v_public_state := coalesce(p_public_state, '{}'::jsonb) #- '{tournament,refereesPassword}';

  update public.workspace_state
  set state = coalesce(p_state, '{}'::jsonb),
      updated_at = v_next_updated_at
  where workspace_id = p_workspace_id;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (p_workspace_id, v_public_state, v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  perform public.flbp_upsert_public_workspace_live(p_workspace_id, v_public_state, v_next_updated_at);

  perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', true, 'ok', v_auth_version);

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at, 'auth_version', v_auth_version);
end;
$$;

grant execute on function public.flbp_referee_push_live_state(text, text, text, jsonb, jsonb, timestamptz) to anon, authenticated;

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

  perform public.flbp_upsert_public_workspace_live(v_workspace_id, v_public_state, v_next_updated_at);

  return jsonb_build_object(
    'ok', true,
    'updated_at', v_next_updated_at,
    'matches_count', jsonb_array_length(v_matches)
  );
end;
$$;

revoke all on function public.flbp_apply_match_result_patch(text, text, text, jsonb) from public;

-- ============ 3/3: sim_seed_fanta_pretournament ============
-- FLBP Manager Suite - seed di squadre Fanta pretorneo per i test/simulazioni.
--
-- Versione RPC (admin-gated) dello script manuale usato nei test: crea una
-- squadra Fanta "Fanta Test - <account>" sul container __pre_tournament__ per
-- ogni account player_app_profiles che non ne ha una, con 4 giocatori casuali
-- (1 capitano, 2 difensori, 1 titolare) presi dalla lista iscritti nello
-- snapshot admin. Con p_team_id_prefix la scelta e' limitata alle squadre il
-- cui id inizia con quel prefisso (es. 'simt_' per le squadre del simulatore),
-- cosi' i punteggi Fanta sono verificabili end-to-end.

alter table if exists public.fanta_rosters
  add column if not exists real_team_slot text;

create or replace function public.flbp_sim_seed_fanta_pretournament(
  p_workspace_id text default 'default',
  p_overwrite boolean default false,
  p_team_id_prefix text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_container_id text := '__pre_tournament__';
  v_prefix text := nullif(trim(coalesce(p_team_id_prefix, '')), '');
  v_eligible_count int := 0;
  v_target_count int := 0;
  v_created_count int := 0;
  v_roster_count int := 0;
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  perform pg_advisory_xact_lock(hashtext('flbp_seed_fanta_pretournament:' || v_workspace_id));

  -- Container pretorneo sempre presente (protetto dal trigger anti-delete).
  insert into public.tournaments (
    workspace_id, id, name, start_date, type, config, is_manual, status, updated_at
  )
  values (
    v_workspace_id, v_container_id, 'Pretorneo', now(), 'elimination',
    jsonb_build_object('fantaPreTournament', true), true, 'live', now()
  )
  on conflict (workspace_id, id) do update set
    name = excluded.name,
    config = excluded.config,
    is_manual = true,
    status = 'live',
    updated_at = now();

  if p_overwrite then
    delete from public.fanta_rosters fr
    using public.fanta_teams ft
    where fr.team_id = ft.id
      and ft.workspace_id = v_workspace_id
      and ft.tournament_id = v_container_id;

    delete from public.fanta_teams
    where workspace_id = v_workspace_id
      and tournament_id = v_container_id;
  end if;

  -- Pool giocatori eleggibili dallo snapshot ADMIN (lista iscritti corrente).
  create temp table _sim_eligible_players on commit drop as
  with raw_players as (
    select
      coalesce(nullif(team_json->>'id', ''), 'team_' || ordinality::text) as real_team_id,
      coalesce(nullif(team_json->>'name', ''), 'Squadra ' || ordinality::text) as real_team_name,
      slot.slot_name as real_team_slot,
      trim(coalesce(team_json->>slot.slot_field, '')) as player_name,
      lower(coalesce(team_json->>'hidden', 'false')) = 'true' as hidden,
      lower(coalesce(team_json->>'isBye', team_json->>'is_bye', 'false')) = 'true' as is_bye
    from public.workspace_state ws
    cross join lateral jsonb_array_elements(coalesce(ws.state->'teams', '[]'::jsonb)) with ordinality as teams(team_json, ordinality)
    cross join lateral (
      values ('player1'::text, 'player1'::text), ('player2'::text, 'player2'::text)
    ) as slot(slot_name, slot_field)
    where ws.workspace_id = v_workspace_id
  ),
  keyed as (
    select
      regexp_replace(lower(trim(player_name)), '\s+', '_', 'g') || '_ND' as player_id,
      player_name,
      real_team_id,
      real_team_name,
      real_team_slot
    from raw_players
    where player_name <> ''
      and hidden = false
      and is_bye = false
      and (v_prefix is null or real_team_id like v_prefix || '%')
  )
  select distinct on (player_id)
    player_id, player_name, real_team_id, real_team_name, real_team_slot
  from keyed
  order by player_id, random();

  select count(*) into v_eligible_count from _sim_eligible_players;
  if v_eligible_count < 4 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_enough_players',
      'eligible_players', v_eligible_count
    );
  end if;

  -- Account player senza squadra Fanta sul container.
  create temp table _sim_target_users on commit drop as
  select
    p.user_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as owner_name
  from public.player_app_profiles p
  where p.workspace_id = v_workspace_id
    and p.user_id is not null
    and not exists (
      select 1
      from public.fanta_teams ft
      where ft.workspace_id = v_workspace_id
        and ft.tournament_id = v_container_id
        and ft.user_id = p.user_id
    );

  select count(*) into v_target_count from _sim_target_users;
  if v_target_count = 0 then
    return jsonb_build_object(
      'ok', true,
      'created_teams', 0,
      'roster_rows', 0,
      'eligible_players', v_eligible_count,
      'accounts_without_team', 0,
      'note', 'tutti gli account hanno gia una squadra pretorneo'
    );
  end if;

  -- 4 giocatori DISTINTI e casuali per ogni account (randomizzazione per-utente
  -- garantita: cross join completo + row_number per partizione).
  create temp table _sim_selected_rosters on commit drop as
  select user_id, player_id, player_name, real_team_id, real_team_name, real_team_slot, pick_rank
  from (
    select
      u.user_id,
      ep.player_id, ep.player_name, ep.real_team_id, ep.real_team_name, ep.real_team_slot,
      row_number() over (partition by u.user_id order by random()) as pick_rank
    from _sim_target_users u
    cross join _sim_eligible_players ep
  ) ranked
  where pick_rank <= 4;

  create temp table _sim_created_teams on commit drop as
  select gen_random_uuid() as id, u.user_id, u.owner_name
  from _sim_target_users u;

  insert into public.fanta_teams (
    id, workspace_id, tournament_id, user_id, name, status, submitted_at, created_at, updated_at
  )
  select
    ct.id, v_workspace_id, v_container_id, ct.user_id,
    'Fanta Test - ' || coalesce(nullif(ct.owner_name, ''), ct.user_id::text),
    'confirmed', now(), now(), now()
  from _sim_created_teams ct;

  get diagnostics v_created_count = row_count;

  insert into public.fanta_rosters (
    team_id, player_id, player_name, real_team_id, real_team_name, real_team_slot, role
  )
  select
    ct.id, sr.player_id, sr.player_name, sr.real_team_id, sr.real_team_name, sr.real_team_slot,
    case
      when sr.pick_rank = 1 then 'captain'
      when sr.pick_rank in (2, 3) then 'defender'
      else 'starter'
    end
  from _sim_created_teams ct
  join _sim_selected_rosters sr on sr.user_id = ct.user_id;

  get diagnostics v_roster_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'created_teams', v_created_count,
    'roster_rows', v_roster_count,
    'eligible_players', v_eligible_count,
    'accounts_without_team', v_target_count
  );
end;
$$;

revoke all on function public.flbp_sim_seed_fanta_pretournament(text, boolean, text) from public, anon;
grant execute on function public.flbp_sim_seed_fanta_pretournament(text, boolean, text) to authenticated;
